// apps/teacher/src/pages/AIGeneratorPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import RichText from '../components/RichText';

interface GeneratedQuestion {
  body: string;
  type: 'MCQ' | 'TRUE_FALSE' | 'MCQ_MULTI';
  options: { id: string; text: string }[];
  correctIds: string[];
  explanation: string;
  points: number;
  difficulty: 1 | 2 | 3;
  tags: string[];
  selected: boolean; // user picks which ones to save
  edited: boolean;
}

const DIFFICULTY_LABELS: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const DIFFICULTY_COLORS: Record<number, string> = {
  1: 'text-emerald-400 bg-emerald-950',
  2: 'text-amber-400 bg-amber-950',
  3: 'text-red-400 bg-red-950',
};

const EXAMPLE_TEXTS = [
  `Photosynthesis is the process by which green plants and other organisms convert light energy into chemical energy stored in glucose. This process occurs primarily in the chloroplasts of plant cells, which contain a green pigment called chlorophyll. The overall reaction requires carbon dioxide from the air and water from the soil, releasing oxygen as a byproduct. The light-dependent reactions occur in the thylakoid membranes, while the Calvin cycle (light-independent reactions) takes place in the stroma.`,

  `The French Revolution began in 1789 and fundamentally transformed France from a monarchy to a republic. Key causes included the financial crisis of the French state, social inequality between the three estates, and Enlightenment ideas about liberty and democracy. The storming of the Bastille on July 14, 1789 became the iconic symbol of the revolution. The Declaration of the Rights of Man and Citizen, adopted in August 1789, proclaimed individual freedoms and equality before the law.`,

  `Newton's three laws of motion form the foundation of classical mechanics. The first law states that an object at rest stays at rest, and an object in motion stays in motion with the same speed and direction unless acted upon by an external force (law of inertia). The second law states that force equals mass times acceleration (F=ma). The third law states that for every action there is an equal and opposite reaction.`,
];

export default function AIGeneratorPage() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [count, setCount] = useState(5);
  const [type, setType] = useState<'MCQ' | 'TRUE_FALSE' | 'MCQ_MULTI'>('MCQ');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(2);
  const [subject, setSubject] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  async function generate() {
    if (wordCount < 20) { setError('Please enter at least 20 words of curriculum text.'); return; }
    setGenerating(true);
    setError('');
    setQuestions([]);
    setSavedCount(null);

    try {
      const { data } = await api.post('/ai/generate-questions', {
        text, count, type, difficulty, subject: subject.trim() || undefined,
      });

      setQuestions(
        data.data.map((q: any) => ({ ...q, selected: true, edited: false }))
      );
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Generation failed. Check your ANTHROPIC_API_KEY.';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function saveSelected() {
    const toSave = questions.filter(q => q.selected);
    if (toSave.length === 0) { setError('Select at least one question to save.'); return; }

    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/ai/generate-questions/save', {
        questions: toSave.map(({ selected, edited, ...q }) => q),
      });
      setSavedCount(data.data.saved);
      // Deselect saved questions
      setQuestions(prev => prev.map(q => q.selected ? { ...q, selected: false } : q));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function toggleSelect(i: number) {
    setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, selected: !q.selected } : q));
  }

  function updateQuestion(i: number, field: keyof GeneratedQuestion, value: any) {
    setQuestions(prev => prev.map((q, idx) =>
      idx === i ? { ...q, [field]: value, edited: true } : q
    ));
  }

  function toggleCorrect(qIdx: number, optId: string) {
    const q = questions[qIdx];
    let next: string[];
    if (q.type === 'MCQ' || q.type === 'TRUE_FALSE') {
      next = [optId];
    } else {
      next = q.correctIds.includes(optId)
        ? q.correctIds.filter(id => id !== optId)
        : [...q.correctIds, optId];
    }
    updateQuestion(qIdx, 'correctIds', next);
  }

  const selectedCount = questions.filter(q => q.selected).length;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate('/questions')} className="text-gray-500 hover:text-gray-300 text-sm">← Question Bank</button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            ✨ AI Question Generator
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Paste curriculum text and Claude generates exam-ready questions instantly
          </p>
        </div>
      </div>

      {/* Input panel */}
      <div className="card p-6 mb-6">
        <div className="grid grid-cols-2 gap-5 mb-4">
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Curriculum text</label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${wordCount < 20 ? 'text-gray-600' : 'text-gray-400'}`}>
                  {wordCount} words
                </span>
                <span className="text-gray-700">·</span>
                <span className="text-xs text-gray-600">Try an example:</span>
                {['Biology', 'History', 'Physics'].map((label, i) => (
                  <button
                    key={label}
                    onClick={() => setText(EXAMPLE_TEXTS[i])}
                    className="text-xs text-emerald-500 hover:text-emerald-400"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className="input h-40 resize-none font-normal"
              placeholder="Paste your lesson notes, textbook excerpt, or topic description here…"
              value={text}
              onChange={e => setText(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Subject (optional)</label>
            <input className="input" placeholder="e.g. Biology, Mathematics, History"
              value={subject} onChange={e => setSubject(e.target.value)} />
          </div>

          <div>
            <label className="label">Number of questions</label>
            <input className="input" type="number" min="1" max="20" value={count}
              onChange={e => setCount(Math.min(20, Math.max(1, Number(e.target.value))))} />
          </div>

          <div>
            <label className="label">Question type</label>
            <select className="input" value={type} onChange={e => setType(e.target.value as any)}>
              <option value="MCQ">Multiple Choice (single answer)</option>
              <option value="MCQ_MULTI">Multiple Choice (multiple answers)</option>
              <option value="TRUE_FALSE">True / False</option>
            </select>
          </div>

          <div>
            <label className="label">Difficulty</label>
            <div className="flex gap-2">
              {([1, 2, 3] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                    difficulty === d
                      ? `${DIFFICULTY_COLORS[d]} border-transparent`
                      : 'text-gray-400 border-gray-700 hover:border-gray-500'
                  }`}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <button
          onClick={generate}
          disabled={generating || wordCount < 20}
          className="btn-primary w-full py-3 text-base"
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⟳</span> Generating {count} questions…
            </span>
          ) : (
            `✨ Generate ${count} Questions`
          )}
        </button>
      </div>

      {/* Generated questions */}
      {questions.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">{questions.length} questions generated</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Review and edit, then save selected ones to your question bank.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuestions(prev => prev.map(q => ({ ...q, selected: true })))}
                className="text-xs text-gray-400 hover:text-white"
              >
                Select all
              </button>
              <button
                onClick={() => setQuestions(prev => prev.map(q => ({ ...q, selected: false })))}
                className="text-xs text-gray-400 hover:text-white"
              >
                Deselect all
              </button>
              <button
                onClick={saveSelected}
                disabled={saving || selectedCount === 0}
                className="btn-primary"
              >
                {saving ? 'Saving…' : `💾 Save ${selectedCount} to Bank`}
              </button>
            </div>
          </div>

          {savedCount !== null && (
            <div className="bg-emerald-950 border border-emerald-800 rounded-xl px-5 py-4 mb-5">
              <p className="text-emerald-300 font-medium">
                ✓ {savedCount} question{savedCount !== 1 ? 's' : ''} saved to your question bank!
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                They're ready to use in your exams.{' '}
                <button onClick={() => navigate('/questions')} className="text-emerald-500 hover:text-emerald-400 underline">
                  View question bank →
                </button>
              </p>
            </div>
          )}

          <div className="space-y-4">
            {questions.map((q, i) => (
              <div
                key={i}
                className={`card p-5 transition-all ${
                  q.selected
                    ? 'border-emerald-800 bg-gray-900'
                    : 'opacity-50 border-gray-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Select checkbox */}
                  <button
                    onClick={() => toggleSelect(i)}
                    className={`w-5 h-5 rounded flex-shrink-0 mt-0.5 border-2 flex items-center justify-center transition-colors ${
                      q.selected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-600'
                    }`}
                  >
                    {q.selected && <span className="text-black text-xs font-bold">✓</span>}
                  </button>

                  <div className="flex-1 min-w-0">
                    {/* Meta row */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[q.difficulty]}`}>
                        {DIFFICULTY_LABELS[q.difficulty]}
                      </span>
                      <span className="text-xs text-gray-500">{q.type.replace('_', ' ')}</span>
                      <span className="text-xs text-gray-500">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                      {q.edited && <span className="text-xs text-blue-400">✏ Edited</span>}
                      {q.tags.map(tag => (
                        <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{tag}</span>
                      ))}
                    </div>

                    {/* Question body — editable */}
                    <textarea
                      value={q.body}
                      onChange={e => updateQuestion(i, 'body', e.target.value)}
                      className="input w-full h-16 text-sm resize-none mb-3 bg-gray-800/50"
                    />

                    {/* Options */}
                    <div className="space-y-1.5 mb-3">
                      {q.options.map(opt => {
                        const isCorrect = q.correctIds.includes(opt.id);
                        return (
                          <div key={opt.id} className="flex items-center gap-2">
                            <button
                              onClick={() => toggleCorrect(i, opt.id)}
                              className={`w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                                isCorrect ? 'bg-emerald-500 border-emerald-500' : 'border-gray-600 hover:border-gray-400'
                              }`}
                            >
                              {isCorrect && <span className="text-black text-xs font-bold">✓</span>}
                            </button>
                            <input
                              value={opt.text}
                              onChange={e => {
                                const newOpts = q.options.map(o =>
                                  o.id === opt.id ? { ...o, text: e.target.value } : o
                                );
                                updateQuestion(i, 'options', newOpts);
                              }}
                              className="input text-sm py-1.5 bg-gray-800/50"
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation */}
                    {q.explanation && (
                      <div className="bg-blue-950/30 border border-blue-900 rounded-lg px-3 py-2 text-xs text-blue-300">
                        <span className="font-medium text-blue-400">Explanation: </span>
                        {q.explanation}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom save bar */}
          <div className="sticky bottom-0 mt-6 card p-4 flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {selectedCount} of {questions.length} questions selected
            </p>
            <div className="flex gap-3">
              <button onClick={generate} disabled={generating} className="btn-ghost text-sm">
                ↻ Regenerate
              </button>
              <button
                onClick={saveSelected}
                disabled={saving || selectedCount === 0}
                className="btn-primary"
              >
                {saving ? 'Saving…' : `💾 Save ${selectedCount} to Bank`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
