// apps/console/src/pages/SectionsPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface Pool {
  id: string;
  title: string;
  drawCount: number;
  tags: string[];
  difficulty?: number;
  type?: string;
  order: number;
}

interface Section {
  id: string;
  title: string;
  instructions?: string;
  durationMinutes?: number;
  order: number;
  items: { id: string; question: { id: string; body: string; type: string } }[];
  pools: Pool[];
}

interface ExamMeta { id: string; title: string; durationMinutes: number }

const DIFF_LABELS: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const TYPE_LABELS: Record<string, string> = {
  MCQ: 'MCQ', MCQ_MULTI: 'Multi-select', TRUE_FALSE: 'True/False',
  SHORT_TEXT: 'Short answer', ESSAY: 'Essay',
};

export default function SectionsPage() {
  const { id: examId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<ExamMeta | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  // Section form
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionInstructions, setNewSectionInstructions] = useState('');
  const [newSectionDuration, setNewSectionDuration] = useState('');
  const [addingSection, setAddingSection] = useState(false);

  // Pool form
  const [poolForm, setPoolForm] = useState<{
    sectionId: string | null;
    title: string;
    drawCount: string;
    tags: string;
    difficulty: string;
    type: string;
  } | null>(null);
  const [poolError, setPoolError] = useState('');
  const [savingPool, setSavingPool] = useState(false);

  async function load() {
    const [examRes, sectionsRes] = await Promise.all([
      api.get(`/exams/${examId}`),
      api.get(`/exams/${examId}/sections`),
    ]);
    setExam(examRes.data.data);
    setSections(sectionsRes.data.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [examId]);

  async function addSection(e: React.FormEvent) {
    e.preventDefault();
    if (!newSectionTitle.trim()) return;
    setAddingSection(true);
    await api.post(`/exams/${examId}/sections`, {
      title: newSectionTitle.trim(),
      instructions: newSectionInstructions.trim() || undefined,
      durationMinutes: newSectionDuration ? parseInt(newSectionDuration) : undefined,
    });
    setNewSectionTitle('');
    setNewSectionInstructions('');
    setNewSectionDuration('');
    setAddingSection(false);
    load();
  }

  async function deleteSection(sectionId: string) {
    if (!confirm('Delete this section? Items inside will be unassigned.')) return;
    await api.delete(`/exams/${examId}/sections/${sectionId}`);
    load();
  }

  async function savePool(e: React.FormEvent) {
    e.preventDefault();
    if (!poolForm) return;
    setPoolError('');
    setSavingPool(true);
    try {
      await api.post(`/exams/${examId}/sections/pools`, {
        title: poolForm.title,
        sectionId: poolForm.sectionId || undefined,
        drawCount: parseInt(poolForm.drawCount),
        tags: poolForm.tags.split(',').map(t => t.trim()).filter(Boolean),
        difficulty: poolForm.difficulty ? parseInt(poolForm.difficulty) : undefined,
        type: poolForm.type || undefined,
      });
      setPoolForm(null);
      load();
    } catch (err: any) {
      setPoolError(err.response?.data?.error || 'Failed to create pool');
    } finally {
      setSavingPool(false);
    }
  }

  async function deletePool(poolId: string) {
    if (!confirm('Delete this question pool?')) return;
    await api.delete(`/exams/${examId}/sections/pools/${poolId}`);
    load();
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(`/exams/${examId}/edit`)} className="text-gray-500 hover:text-gray-300 text-sm">← Exam Builder</button>
        <div>
          <h1 className="text-2xl font-bold">Sections & Question Pools</h1>
          <p className="text-gray-400 text-sm mt-0.5">{exam?.title}</p>
        </div>
      </div>

      {/* Explainer */}
      <div className="card p-4 mb-6 border-blue-900 bg-blue-950/20">
        <p className="text-sm text-blue-200 leading-relaxed">
          <strong className="text-blue-300">Sections</strong> divide the exam into parts with optional per-section timers.{' '}
          <strong className="text-blue-300">Question Pools</strong> draw a random subset of questions matching
          tag/difficulty/type filters — every student gets a different selection.
        </p>
      </div>

      {/* Add section form */}
      <div className="card p-5 mb-6">
        <h3 className="font-semibold text-sm mb-3">Add Section</h3>
        <form onSubmit={addSection} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Section title</label>
              <input className="input" placeholder="e.g. Part A — Reading Comprehension"
                value={newSectionTitle} onChange={e => setNewSectionTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Time limit (minutes, optional)</label>
              <input className="input" type="number" min="1" placeholder={`Default: ${exam?.durationMinutes}m total`}
                value={newSectionDuration} onChange={e => setNewSectionDuration(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Instructions (optional)</label>
            <input className="input" placeholder="Shown to students at the start of this section"
              value={newSectionInstructions} onChange={e => setNewSectionInstructions(e.target.value)} />
          </div>
          <button type="submit" disabled={addingSection || !newSectionTitle.trim()} className="btn-primary">
            {addingSection ? 'Adding…' : '+ Add Section'}
          </button>
        </form>
      </div>

      {/* Sections list */}
      {sections.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          <p className="text-3xl mb-2">📑</p>
          <p className="text-sm">No sections yet. Add one above, or leave empty to use a single flat exam structure.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section, si) => (
            <div key={section.id} className="card overflow-hidden">
              {/* Section header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-500">§{si + 1}</span>
                    <h3 className="font-semibold">{section.title}</h3>
                    {section.durationMinutes && (
                      <span className="text-xs bg-blue-950 text-blue-400 px-2 py-0.5 rounded-full">
                        ⏱ {section.durationMinutes}m
                      </span>
                    )}
                  </div>
                  {section.instructions && (
                    <p className="text-xs text-gray-500 mt-1 ml-8">{section.instructions}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {section.items.length} item{section.items.length !== 1 ? 's' : ''}
                    {section.pools.length > 0 && ` + ${section.pools.length} pool${section.pools.length !== 1 ? 's' : ''}`}
                  </span>
                  <button
                    onClick={() => setPoolForm({ sectionId: section.id, title: '', drawCount: '5', tags: '', difficulty: '', type: '' })}
                    className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-900 px-2 py-0.5 rounded"
                  >
                    + Pool
                  </button>
                  <button onClick={() => deleteSection(section.id)} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                </div>
              </div>

              {/* Fixed items */}
              {section.items.length > 0 && (
                <div className="px-5 py-3 border-b border-gray-800/60">
                  <p className="text-xs text-gray-500 mb-2">Fixed questions ({section.items.length})</p>
                  <div className="space-y-1">
                    {section.items.slice(0, 3).map(item => (
                      <p key={item.id} className="text-xs text-gray-400 truncate">
                        • {item.question.type.replace('_', ' ')} — {item.question.body.slice(0, 60)}…
                      </p>
                    ))}
                    {section.items.length > 3 && (
                      <p className="text-xs text-gray-600">…and {section.items.length - 3} more</p>
                    )}
                  </div>
                </div>
              )}

              {/* Pools */}
              {section.pools.length > 0 && (
                <div className="px-5 py-3">
                  <p className="text-xs text-gray-500 mb-2">Question pools</p>
                  <div className="space-y-2">
                    {section.pools.map(pool => (
                      <div key={pool.id} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{pool.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-emerald-400">Draw {pool.drawCount}</span>
                            {pool.tags.length > 0 && (
                              <span className="text-xs text-gray-500">tags: {pool.tags.join(', ')}</span>
                            )}
                            {pool.difficulty && (
                              <span className="text-xs text-amber-400">{DIFF_LABELS[pool.difficulty]}</span>
                            )}
                            {pool.type && (
                              <span className="text-xs text-blue-400">{TYPE_LABELS[pool.type] ?? pool.type}</span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => deletePool(pool.id)} className="text-xs text-red-500 hover:text-red-400">Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {section.items.length === 0 && section.pools.length === 0 && (
                <div className="px-5 py-3 text-xs text-gray-600 italic">
                  No items or pools yet. Assign questions in the Exam Builder or add a pool above.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Global pool (not in any section) */}
      <div className="mt-6 card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Global Question Pools (no section)</h3>
          <button
            onClick={() => setPoolForm({ sectionId: null, title: '', drawCount: '5', tags: '', difficulty: '', type: '' })}
            className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-900 px-2 py-0.5 rounded"
          >
            + Add Pool
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Pools not attached to a section are drawn and appended after all sections.
        </p>
      </div>

      {/* Pool creation modal */}
      {poolForm !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="font-semibold">New Question Pool</h2>
              <button onClick={() => { setPoolForm(null); setPoolError(''); }} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>
            <form onSubmit={savePool} className="p-5 space-y-4">
              <p className="text-xs text-gray-500">
                At exam start, {poolForm.drawCount || 'N'} random questions matching your filters will be drawn from
                your question bank. Each student gets a unique selection.
              </p>
              <div>
                <label className="label">Pool name</label>
                <input className="input" placeholder="e.g. Algebra questions" value={poolForm.title}
                  onChange={e => setPoolForm(p => p && ({ ...p, title: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Draw count (how many to pick)</label>
                <input className="input" type="number" min="1" value={poolForm.drawCount}
                  onChange={e => setPoolForm(p => p && ({ ...p, drawCount: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Filter by tags (comma-separated, optional)</label>
                <input className="input" placeholder="algebra, linear-equations" value={poolForm.tags}
                  onChange={e => setPoolForm(p => p && ({ ...p, tags: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Difficulty (optional)</label>
                  <select className="input" value={poolForm.difficulty}
                    onChange={e => setPoolForm(p => p && ({ ...p, difficulty: e.target.value }))}>
                    <option value="">Any</option>
                    <option value="1">Easy</option>
                    <option value="2">Medium</option>
                    <option value="3">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="label">Question type (optional)</label>
                  <select className="input" value={poolForm.type}
                    onChange={e => setPoolForm(p => p && ({ ...p, type: e.target.value }))}>
                    <option value="">Any</option>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              {poolError && <p className="text-red-400 text-sm">{poolError}</p>}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => { setPoolForm(null); setPoolError(''); }} className="btn-ghost">Cancel</button>
                <button type="submit" disabled={savingPool} className="btn-primary">
                  {savingPool ? 'Creating…' : 'Create Pool'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
