// apps/teacher/src/pages/ExamBuilderPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import type { Question } from '@secureexam/shared-types';

type Step = 'settings' | 'questions' | 'assign' | 'publish';

const STEPS: { key: Step; label: string }[] = [
  { key: 'settings', label: '1. Settings' },
  { key: 'questions', label: '2. Questions' },
  { key: 'assign', label: '3. Assign' },
  { key: 'publish', label: '4. Publish' },
];

interface ExamItem {
  id: string;
  order: number;
  points?: number;
  scoringMode?: string;
  negativeMarks?: number;
  bonusPoints?: number;
  question: Question;
}

interface ClassEntry { id: string; name: string; _count: { students: number } }

export default function ExamBuilderPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [step, setStep] = useState<Step>('settings');
  const [saving, setSaving] = useState(false);
  const [examId, setExamId] = useState<string | null>(id ?? null);

  // ── Settings state ──
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [duration, setDuration] = useState(60);
  const [maxViolations, setMaxViolations] = useState(3);
  const [shuffleQ, setShuffleQ] = useState(false);
  const [shuffleO, setShuffleO] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [passingScore, setPassingScore] = useState<number | ''>('');
  const [calculatorType, setCalculatorType] = useState<string>('none');
  const [securityLevel, setSecurityLevel] = useState(1);
  const [ipAllowlist, setIpAllowlist] = useState('');
  const [requireOtp, setRequireOtp] = useState(false);

  // ── Questions state ──
  const [examItems, setExamItems] = useState<ExamItem[]>([]);
  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [bankSearch, setBankSearch] = useState('');

  // ── Assign state ──
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);

  // Load exam if editing
  useEffect(() => {
    if (!examId) return;
    api.get(`/exams/${examId}`).then((r) => {
      const e = r.data.data;
      setTitle(e.title); setDescription(e.description ?? '');
      setInstructions(e.instructions ?? ''); setDuration(e.durationMinutes);
      setMaxViolations(e.maxViolations); setShuffleQ(e.shuffleQuestions);
      setShuffleO(e.shuffleOptions); setShowResults(e.showResultsAfter);
      setPassingScore(e.passingScore ?? '');
      setCalculatorType((e as any).calculatorType ?? 'none');
      setSecurityLevel((e as any).securityLevel ?? 1);
      setIpAllowlist((e as any).ipAllowlist ?? '');
      setRequireOtp((e as any).requireOtp ?? false);
      setExamItems(e.items);
      setAssigned(e.assignments.map((a: any) => a.classId));
      setSelectedClasses(e.assignments.map((a: any) => a.classId));
    });
  }, [examId]);

  // Load bank questions + classes
  useEffect(() => {
    api.get(`/questions?search=${bankSearch}`).then((r) => setBankQuestions(r.data.data));
  }, [bankSearch]);

  useEffect(() => {
    api.get('/schools/my-classes').then((r) => setClasses(r.data.data));
  }, []);

  async function saveSettings() {
    setSaving(true);
    try {
      const payload = {
        title, description, instructions,
        durationMinutes: duration, maxViolations,
        shuffleQuestions: shuffleQ, shuffleOptions: shuffleO,
        showResultsAfter: showResults,
        passingScore: passingScore === '' ? undefined : Number(passingScore),
        calculatorType: calculatorType === 'none' ? null : calculatorType,
        securityLevel,
        ipAllowlist: ipAllowlist.trim() || null,
        requireOtp,
      };
      if (examId) {
        await api.put(`/exams/${examId}`, payload);
      } else {
        const { data } = await api.post('/exams', payload);
        setExamId(data.data.id);
        navigate(`/exams/${data.data.id}/edit`, { replace: true });
      }
      setStep('questions');
    } finally { setSaving(false); }
  }

  async function addQuestion(q: Question) {
    if (!examId) return;
    if (examItems.some((i) => i.question.id === q.id)) return;
    const { data } = await api.post(`/exams/${examId}/items`, { questionId: q.id });
    setExamItems((prev) => [...prev, data.data]);
  }

  async function removeItem(itemId: string) {
    if (!examId) return;
    await api.delete(`/exams/${examId}/items/${itemId}`);
    setExamItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function updateItemScoring(itemId: string, patch: {
    points?: number;
    scoringMode?: string;
    negativeMarks?: number;
    bonusPoints?: number;
  }) {
    if (!examId) return;
    const { data } = await api.put(`/exams/${examId}/items/${itemId}`, patch);
    setExamItems(prev => prev.map(i => i.id === itemId ? { ...i, ...data.data } : i));
  }

  async function saveAssign() {
    if (!examId) return;
    setSaving(true);
    try {
      const newClasses = selectedClasses.filter((id) => !assigned.includes(id));
      if (newClasses.length) await api.post(`/exams/${examId}/assign`, { classIds: newClasses });
      setAssigned(selectedClasses);
      setStep('publish');
    } finally { setSaving(false); }
  }

  async function publishExam() {
    if (!examId) return;
    setSaving(true);
    try {
      await api.post(`/exams/${examId}/publish`);
      navigate(`/exams/${examId}/pins`);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Publish failed');
    } finally { setSaving(false); }
  }

  const TYPE_LABELS: Record<string, string> = {
    MCQ: 'MCQ', MCQ_MULTI: 'Multi', TRUE_FALSE: 'T/F', SHORT_TEXT: 'Short', ESSAY: 'Essay',
  };

  const addedIds = new Set(examItems.map((i) => i.question.id));
  const totalPoints = examItems.reduce((s, i) => s + (i.points ?? i.question.points), 0);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-300 text-sm">← Back</button>
        <h1 className="text-2xl font-bold">{isEdit ? 'Edit Exam' : 'New Exam'}</h1>
      </div>

      {/* Step tabs */}
      <div className="flex gap-1 mb-8 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {STEPS.map((s) => (
          <button
            key={s.key}
            onClick={() => examId && setStep(s.key)}
            disabled={!examId && s.key !== 'settings'}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              step === s.key
                ? 'bg-emerald-500 text-black'
                : 'text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Step 1: Settings ── */}
      {step === 'settings' && (
        <div className="space-y-6 max-w-2xl">
          <div className="grid grid-cols-2 gap-5">
            <div className="col-span-2">
              <label className="label">Exam Title *</label>
              <input className="input" placeholder="e.g. Mathematics Unit 3 Assessment"
                value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Description</label>
              <input className="input" placeholder="Brief summary for students"
                value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Instructions (shown to students before starting)</label>
              <textarea className="input h-20 resize-none"
                placeholder="e.g. No calculators allowed. Answer all questions."
                value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </div>
            <div>
              <label className="label">Duration (minutes)</label>
              <input className="input" type="number" min="5" max="300"
                value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Max Violations Before Auto-Submit</label>
              <input className="input" type="number" min="1" max="10"
                value={maxViolations} onChange={(e) => setMaxViolations(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Passing Score (%)</label>
              <input className="input" type="number" min="0" max="100" placeholder="e.g. 60 (optional)"
                value={passingScore} onChange={(e) => setPassingScore(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
          </div>

          {/* Toggles */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-300">Exam Options</h3>
            {[
              { label: 'Shuffle question order', value: shuffleQ, set: setShuffleQ },
              { label: 'Shuffle answer options', value: shuffleO, set: setShuffleO },
              { label: 'Show results to students after submission', value: showResults, set: setShowResults },
            ].map(({ label, value, set }) => (
              <label key={label} className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => set(!value)}
                  className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 ${value ? 'bg-emerald-500' : 'bg-gray-700'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
                <span className="text-sm text-gray-300">{label}</span>
              </label>
            ))}

            {/* Calculator */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-800">
              <div>
                <p className="text-sm text-gray-300">Calculator</p>
                <p className="text-xs text-gray-500 mt-0.5">Allow students to use a built-in calculator during this exam</p>
              </div>
              <select
                className="input w-44"
                value={calculatorType}
                onChange={e => setCalculatorType(e.target.value)}
              >
                <option value="none">None (not allowed)</option>
                <option value="basic">Basic (+ − × ÷)</option>
                <option value="scientific">Scientific (sin, cos, log…)</option>
              </select>
            </div>
          </div>

          {/* Security level */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-gray-300">Security level</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                securityLevel === 1 ? 'bg-gray-800 text-gray-400' :
                securityLevel === 2 ? 'bg-amber-950 text-amber-400' :
                'bg-red-950 text-red-400'
              }`}>
                Level {securityLevel} — {securityLevel === 1 ? 'Basic' : securityLevel === 2 ? 'Medium' : 'High'}
              </span>
            </div>

            {/* Level selector */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { level: 1, label: 'Basic', desc: 'Login only. Good for low-stakes quizzes.' },
                { level: 2, label: 'Medium', desc: 'Magic link + IP check. Good for midterms.' },
                { level: 3, label: 'High',   desc: 'Magic link + IP + OTP. For final exams.' },
              ].map(opt => (
                <button
                  key={opt.level}
                  onClick={() => {
                    setSecurityLevel(opt.level);
                    if (opt.level < 3) setRequireOtp(false);
                  }}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    securityLevel === opt.level
                      ? 'border-emerald-500 bg-emerald-950/30'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <p className={`text-xs font-bold mb-1 ${securityLevel === opt.level ? 'text-emerald-400' : 'text-gray-400'}`}>
                    Level {opt.level} — {opt.label}
                  </p>
                  <p className="text-xs text-gray-500 leading-snug">{opt.desc}</p>
                </button>
              ))}
            </div>

            {/* IP Allowlist — shown for level 2+ */}
            {securityLevel >= 2 && (
              <div className="mt-3">
                <label className="label text-xs">
                  IP allowlist
                  <span className="text-gray-600 font-normal ml-2">— comma-separated CIDRs</span>
                </label>
                <input
                  className="input font-mono text-sm"
                  placeholder="e.g. 192.168.1.0/24, 10.0.0.0/8"
                  value={ipAllowlist}
                  onChange={e => setIpAllowlist(e.target.value)}
                />
                <p className="text-xs text-gray-600 mt-1">
                  Leave blank to allow from any network. Students outside this range will be blocked.
                </p>
              </div>
            )}

            {/* OTP — shown for level 3 */}
            {securityLevel >= 3 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-800">
                <div>
                  <p className="text-sm text-gray-200">Require email OTP at exam start</p>
                  <p className="text-xs text-gray-500 mt-0.5">Student receives a 6-digit code valid for 60 seconds</p>
                </div>
                <button
                  onClick={() => setRequireOtp(v => !v)}
                  className={`w-11 h-6 rounded-full flex items-center px-1 flex-shrink-0 transition-colors ${requireOtp ? 'bg-emerald-500' : 'bg-gray-700'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${requireOtp ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            )}

            {securityLevel >= 2 && (
              <p className="text-xs text-amber-400 mt-3">
                ⚠ Level {securityLevel >= 2 ? '2+' : ''} requires you to send magic links to students before the exam.
                Go to the exam's <strong>Security</strong> tab after saving to generate and send links.
              </p>
            )}
          </div>

          <button onClick={saveSettings} disabled={!title.trim() || saving} className="btn-primary px-8 py-2.5">
            {saving ? 'Saving…' : 'Save & Continue →'}
          </button>
        </div>
      )}

      {/* ── Step 2: Questions ── */}
      {step === 'questions' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Left: exam questions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Exam Questions ({examItems.length})</h3>
              <span className="text-sm text-gray-400">{totalPoints} pts total</span>
            </div>
            {examItems.length === 0 ? (
              <div className="card p-8 text-center text-gray-500 text-sm">
                Add questions from the bank →
              </div>
            ) : (
              <div className="space-y-2">
                {examItems
                  .sort((a, b) => a.order - b.order)
                  .map((item, idx) => {
                    const isAutoGraded = ['MCQ', 'TRUE_FALSE', 'MCQ_MULTI'].includes(item.question.type);
                    const scoringMode = item.scoringMode ?? 'binary';
                    return (
                      <div key={item.id} className="card p-4">
                        <div className="flex items-start gap-3">
                          <span className="text-xs font-mono text-gray-500 mt-0.5 flex-shrink-0 w-5">{idx + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm line-clamp-2 mb-2">{item.question.body}</p>
                            {/* Scoring controls row */}
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Points */}
                              <div className="flex items-center gap-1">
                                <label className="text-xs text-gray-500">Points:</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  className="w-16 text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:border-emerald-500 focus:outline-none"
                                  defaultValue={item.points ?? item.question.points}
                                  onBlur={e => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val !== (item.points ?? item.question.points)) {
                                      updateItemScoring(item.id, { points: val });
                                    }
                                  }}
                                />
                              </div>

                              {/* Scoring mode — only for auto-graded types */}
                              {isAutoGraded && (
                                <div className="flex items-center gap-1">
                                  <label className="text-xs text-gray-500">Scoring:</label>
                                  <select
                                    className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:border-emerald-500 focus:outline-none"
                                    value={scoringMode}
                                    onChange={e => updateItemScoring(item.id, { scoringMode: e.target.value })}
                                  >
                                    <option value="binary">All-or-nothing</option>
                                    {item.question.type === 'MCQ_MULTI' && (
                                      <option value="partial">Partial credit</option>
                                    )}
                                    <option value="negative">Negative marking</option>
                                  </select>
                                </div>
                              )}

                              {/* Negative marks input — only when mode is negative */}
                              {isAutoGraded && scoringMode === 'negative' && (
                                <div className="flex items-center gap-1">
                                  <label className="text-xs text-red-400">Penalty:</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.25"
                                    className="w-16 text-xs bg-red-950/30 border border-red-900 rounded px-2 py-1 text-red-300 focus:border-red-500 focus:outline-none"
                                    defaultValue={item.negativeMarks ?? 0}
                                    onBlur={e => {
                                      const val = parseFloat(e.target.value);
                                      if (!isNaN(val)) updateItemScoring(item.id, { negativeMarks: val });
                                    }}
                                    placeholder="0"
                                  />
                                  <span className="text-xs text-red-400">pts</span>
                                </div>
                              )}

                              {/* Bonus points */}
                              {isAutoGraded && (
                                <div className="flex items-center gap-1">
                                  <label className="text-xs text-gray-500">Bonus:</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.25"
                                    className="w-14 text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:border-emerald-500 focus:outline-none"
                                    defaultValue={item.bonusPoints ?? 0}
                                    onBlur={e => {
                                      const val = parseFloat(e.target.value);
                                      if (!isNaN(val)) updateItemScoring(item.id, { bonusPoints: val });
                                    }}
                                    placeholder="0"
                                  />
                                </div>
                              )}

                              {/* Type badge */}
                              <span className="text-xs text-gray-600">{TYPE_LABELS[item.question.type]}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="text-gray-600 hover:text-red-400 text-lg flex-shrink-0 mt-0.5"
                          >✕</button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
            <div className="mt-4 flex gap-3">
              <button onClick={() => setStep('assign')} className="btn-primary">
                Continue → Assign
              </button>
              <button onClick={() => setStep('settings')} className="btn-ghost">← Back</button>
            </div>
          </div>

          {/* Right: question bank */}
          <div>
            <h3 className="font-semibold mb-3">Question Bank</h3>
            <input className="input mb-3" placeholder="Search questions…"
              value={bankSearch} onChange={(e) => setBankSearch(e.target.value)} />
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {bankQuestions.map((q) => {
                const added = addedIds.has(q.id);
                return (
                  <div key={q.id} className={`card p-3 flex items-start gap-3 ${added ? 'opacity-40' : 'hover:border-emerald-700 cursor-pointer'}`}
                    onClick={() => !added && addQuestion(q)}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2">{q.body}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">{TYPE_LABELS[q.type]}</span>
                        <span className="text-xs text-gray-500">·</span>
                        <span className="text-xs text-gray-400">{q.points} pts</span>
                        {q.tags.slice(0, 2).map((t) => (
                          <span key={t} className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">{t}</span>
                        ))}
                      </div>
                    </div>
                    <span className={`text-lg flex-shrink-0 ${added ? 'text-emerald-500' : 'text-gray-600'}`}>
                      {added ? '✓' : '+'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Assign ── */}
      {step === 'assign' && (
        <div className="max-w-lg">
          <h3 className="font-semibold mb-4">Assign to Classes</h3>
          {classes.length === 0 ? (
            <p className="text-gray-400 text-sm">No classes found. Ask your admin to create classes.</p>
          ) : (
            <div className="space-y-2 mb-6">
              {classes.map((cls) => {
                const checked = selectedClasses.includes(cls.id);
                return (
                  <label key={cls.id} className={`card p-4 flex items-center gap-4 cursor-pointer ${checked ? 'border-emerald-700' : ''}`}>
                    <input type="checkbox" checked={checked}
                      onChange={() => setSelectedClasses((prev) =>
                        prev.includes(cls.id) ? prev.filter((x) => x !== cls.id) : [...prev, cls.id]
                      )}
                      className="w-4 h-4 accent-emerald-500"
                    />
                    <div>
                      <p className="text-sm font-medium">{cls.name}</p>
                      <p className="text-xs text-gray-500">{cls._count.students} students</p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={saveAssign} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Continue → Review'}
            </button>
            <button onClick={() => setStep('questions')} className="btn-ghost">← Back</button>
          </div>
        </div>
      )}

      {/* ── Step 4: Publish ── */}
      {step === 'publish' && (
        <div className="max-w-lg">
          <h3 className="font-semibold mb-6">Review & Publish</h3>
          <div className="card p-6 space-y-4 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Title</span>
              <span className="font-medium">{title}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Questions</span>
              <span className="font-medium">{examItems.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Total points</span>
              <span className="font-medium">{totalPoints}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Duration</span>
              <span className="font-medium">{duration} minutes</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Classes assigned</span>
              <span className="font-medium">{selectedClasses.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Security level</span>
              <span className={`font-medium ${
                securityLevel === 1 ? 'text-gray-300' :
                securityLevel === 2 ? 'text-amber-400' : 'text-red-400'
              }`}>
                Level {securityLevel} — {securityLevel === 1 ? 'Basic' : securityLevel === 2 ? 'Medium' : 'High'}
                {requireOtp && ' + OTP'}
              </span>
            </div>
            {ipAllowlist && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">IP allowlist</span>
                <span className="font-mono text-xs text-gray-300 truncate max-w-xs">{ipAllowlist}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Max violations</span>
              <span className="font-medium">{maxViolations}</span>
            </div>
          </div>
          <div className="bg-amber-950 border border-amber-800 rounded-xl p-4 text-sm text-amber-300 mb-6">
            ⚠ Publishing makes the exam visible to assigned students. You can still edit settings but not the question list after publishing.
          </div>

          {/* Level 2/3 reminder — shown before publish */}
          {securityLevel >= 2 && (
            <div className="card p-4 border-amber-900 bg-amber-950/20 mb-4">
              <p className="text-sm font-semibold text-amber-400 mb-1">
                🔗 Security level {securityLevel} — magic links required
              </p>
              <p className="text-xs text-amber-200 leading-relaxed">
                After publishing, go to <strong>Magic Links</strong> to generate and email
                per-student access links. Students on level {securityLevel} exams cannot access
                the exam without their unique link{securityLevel >= 3 && ' and OTP code'}.
              </p>
              {examId && (
                <a
                  href={`/exams/${examId}/magic-links`}
                  className="text-xs text-amber-400 hover:text-amber-300 mt-2 inline-block"
                >
                  Generate magic links after publishing →
                </a>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={publishExam} disabled={saving || examItems.length === 0} className="btn-primary px-8 py-2.5">
              {saving ? 'Publishing…' : '🚀 Publish Exam'}
            </button>
            <button onClick={() => setStep('assign')} className="btn-ghost">← Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
