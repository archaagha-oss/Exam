// apps/teacher/src/pages/QuestionBankPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import RichText from '../components/RichText';
import MediaUpload from '../components/MediaUpload';
import type { Question } from '@secureexam/shared-types';

const TYPES = ['MCQ', 'MCQ_MULTI', 'TRUE_FALSE', 'SHORT_TEXT', 'ESSAY'];
const DIFFICULTY = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const TYPE_LABELS: Record<string, string> = {
  MCQ: 'Multiple Choice', MCQ_MULTI: 'Multi-Select',
  TRUE_FALSE: 'True / False', SHORT_TEXT: 'Short Answer', ESSAY: 'Essay',
};

interface Option { id: string; text: string }

function QuestionModal({ question, onSave, onClose }: {
  question: Partial<Question> | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const isEdit = !!question?.id;
  const [type, setType] = useState(question?.type ?? 'MCQ');
  const [body, setBody] = useState(question?.body ?? '');
  const [options, setOptions] = useState<Option[]>(
    (question?.options as Option[]) ?? [
      { id: 'a', text: '' }, { id: 'b', text: '' },
      { id: 'c', text: '' }, { id: 'd', text: '' },
    ]
  );
  const [correctIds, setCorrectIds] = useState<string[]>((question?.correctIds as string[]) ?? []);
  const [rubric, setRubric] = useState(question?.rubric ?? '');
  const [points, setPoints] = useState(question?.points ?? 1);
  const [difficulty, setDifficulty] = useState<number>(question?.difficulty ?? 2);
  const [tags, setTags] = useState(question?.tags?.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState<string | null>(question?.id ?? null);
  const [latexPreview, setLatexPreview] = useState(false);

  const showOptions = ['MCQ', 'MCQ_MULTI', 'TRUE_FALSE'].includes(type);
  const showRubric = ['SHORT_TEXT', 'ESSAY'].includes(type);

  useEffect(() => {
    if (type === 'TRUE_FALSE') {
      setOptions([{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }]);
      setCorrectIds([]);
    }
  }, [type]);

  function toggleCorrect(id: string) {
    if (type === 'MCQ' || type === 'TRUE_FALSE') {
      setCorrectIds([id]);
    } else {
      setCorrectIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }
  }

  function updateOption(index: number, text: string) {
    setOptions(prev => prev.map((o, i) => i === index ? { ...o, text } : o));
  }

  function addOption() {
    const id = String.fromCharCode(97 + options.length);
    setOptions(prev => [...prev, { id, text: '' }]);
  }

  function removeOption(index: number) {
    const removed = options[index].id;
    setOptions(prev => prev.filter((_, i) => i !== index));
    setCorrectIds(prev => prev.filter(id => id !== removed));
  }

  async function handleSave() {
    if (!body.trim()) { setError('Question body is required'); return; }
    if (showOptions && correctIds.length === 0) { setError('Mark at least one correct answer'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        type, body,
        options: showOptions ? options : undefined,
        correctIds: showOptions ? correctIds : undefined,
        rubric: rubric || undefined,
        points, difficulty,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      };
      if (isEdit && savedId) {
        await api.put(`/questions/${savedId}`, payload);
      } else {
        const { data } = await api.post('/questions', payload);
        setSavedId(data.data.id);
      }
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="card w-full max-w-2xl my-8 shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="font-semibold">{isEdit ? 'Edit Question' : 'New Question'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Type + metadata */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Type</label>
              <select className="input" value={type} onChange={e => setType(e.target.value)}>
                {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Points</label>
              <input className="input" type="number" min="0.5" step="0.5"
                value={points} onChange={e => setPoints(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Difficulty</label>
              <select className="input" value={difficulty} onChange={e => setDifficulty(Number(e.target.value))}>
                {Object.entries(DIFFICULTY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* Question body with LaTeX preview toggle */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Question</label>
              <button
                type="button"
                onClick={() => setLatexPreview(p => !p)}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                {latexPreview ? '✏ Edit' : '👁 Preview (LaTeX/Math)'}
              </button>
            </div>
            {latexPreview ? (
              <div className="input min-h-[80px] text-sm leading-relaxed">
                <RichText text={body} />
              </div>
            ) : (
              <textarea
                className="input h-20 resize-none"
                placeholder="Supports LaTeX: e.g. Find $x$ if $2x + 5 = 11$"
                value={body}
                onChange={e => setBody(e.target.value)}
              />
            )}
            <p className="text-xs text-gray-600 mt-1">
              Use <code className="text-gray-500">$...$</code> for inline math, <code className="text-gray-500">$$...$$</code> for display math
            </p>
          </div>

          {/* Options (MCQ types) */}
          {showOptions && (
            <div>
              <label className="label">
                Answer Options
                <span className="ml-1 text-gray-500 font-normal">— click ○ to mark correct</span>
              </label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={opt.id} className="flex items-center gap-3">
                    <button
                      onClick={() => toggleCorrect(opt.id)}
                      className={`w-6 h-6 rounded-full flex-shrink-0 border-2 transition-colors flex items-center justify-center
                        ${correctIds.includes(opt.id)
                          ? 'bg-emerald-500 border-emerald-500 text-black'
                          : 'border-gray-600 hover:border-gray-400'
                        }`}
                    >
                      {correctIds.includes(opt.id) && <span className="text-xs font-bold">✓</span>}
                    </button>
                    <input
                      className="input flex-1"
                      placeholder={`Option ${String.fromCharCode(65 + i)} — supports LaTeX`}
                      value={opt.text}
                      onChange={e => updateOption(i, e.target.value)}
                      disabled={type === 'TRUE_FALSE'}
                    />
                    {type !== 'TRUE_FALSE' && options.length > 2 && (
                      <button onClick={() => removeOption(i)} className="text-gray-600 hover:text-red-400 text-lg">✕</button>
                    )}
                  </div>
                ))}
                {type !== 'TRUE_FALSE' && options.length < 6 && (
                  <button onClick={addOption} className="text-xs text-gray-500 hover:text-gray-300 mt-1">+ Add option</button>
                )}
              </div>
            </div>
          )}

          {/* Rubric (essay/short text) */}
          {showRubric && (
            <div>
              <label className="label">
                Grading Rubric
                <span className="ml-1 text-gray-500 font-normal">— shown to teacher when grading</span>
              </label>
              <textarea
                className="input h-24 resize-none"
                placeholder="Describe what a full-mark answer looks like, key points to award, etc."
                value={rubric}
                onChange={e => setRubric(e.target.value)}
              />
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="label">Tags (comma-separated)</label>
            <input className="input" placeholder="algebra, linear-equations, unit-3"
              value={tags} onChange={e => setTags(e.target.value)} />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-gray-800">
          <div className="flex-1">
            {/* Media upload — only shown after question is created */}
            {savedId && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Media attachment (image or audio):</p>
                <MediaUpload
                  questionId={savedId}
                  currentUrl={question?.mediaUrl ?? undefined}
                  onUpdate={() => {}}
                />
              </div>
            )}
            {!savedId && !isEdit && (
              <p className="text-xs text-gray-600">Save first to attach media</p>
            )}
          </div>
          <div className="flex gap-3 ml-4">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Question'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDiff, setFilterDiff] = useState('');
  const [modal, setModal] = useState<'new' | Question | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterType) params.set('type', filterType);
    if (filterDiff) params.set('difficulty', filterDiff);
    api.get(`/questions?${params}`).then(r => { setQuestions(r.data.data); setLoading(false); });
  }

  useEffect(() => { load(); }, [search, filterType, filterDiff]);

  async function deleteQuestion(id: string) {
    if (!confirm('Delete this question?')) return;
    await api.delete(`/questions/${id}`);
    load();
  }

  const diffColor: Record<number, string> = {
    1: 'text-emerald-400', 2: 'text-amber-400', 3: 'text-red-400',
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Question Bank</h1>
          <p className="text-gray-400 text-sm mt-1">{questions.length} questions</p>
        </div>
        <div className="flex gap-3">
          <Link to="/questions/ai" className="btn-ghost text-sm flex items-center gap-2">
            ✨ AI Generate
          </Link>
          <button onClick={() => setModal('new')} className="btn-primary">+ New Question</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <input className="input max-w-xs" placeholder="Search questions…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input max-w-[180px]" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        <select className="input max-w-[160px]" value={filterDiff} onChange={e => setFilterDiff(e.target.value)}>
          <option value="">All Difficulty</option>
          <option value="1">Easy</option>
          <option value="2">Medium</option>
          <option value="3">Hard</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500">Loading…</div>
        ) : questions.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-gray-400 mb-3">No questions found.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setModal('new')} className="btn-primary">Create manually</button>
              <Link to="/questions/ai" className="btn-ghost">✨ Generate with AI</Link>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                <th className="text-left px-5 py-3 font-medium">Question</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Difficulty</th>
                <th className="text-left px-4 py-3 font-medium">Points</th>
                <th className="text-left px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {questions.map(q => (
                <tr key={q.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-4 max-w-sm">
                    <div className="flex items-start gap-2">
                      {q.mediaUrl && (
                        <span className="text-xs text-blue-400 flex-shrink-0 mt-0.5">
                          {q.mediaUrl.match(/\.(mp3|wav|ogg)$/i) ? '🎵' : '🖼'}
                        </span>
                      )}
                      <p className="text-sm line-clamp-2">
                        <RichText text={q.body} />
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-400">{TYPE_LABELS[q.type] ?? q.type}</td>
                  <td className="px-4 py-4">
                    <span className={`text-xs font-medium ${diffColor[q.difficulty] ?? ''}`}>
                      {DIFFICULTY[q.difficulty as keyof typeof DIFFICULTY] ?? q.difficulty}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-300">{q.points}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      {q.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3 justify-end">
                      <button onClick={() => setModal(q)} className="text-xs text-gray-400 hover:text-white">Edit</button>
                      <button onClick={() => deleteQuestion(q.id)} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal !== null && (
        <QuestionModal
          question={modal === 'new' ? null : modal}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
