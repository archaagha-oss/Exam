// apps/teacher/src/pages/GradingPage.tsx
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import RichText from '../components/RichText';

interface GradingItem {
  order: number;
  questionId: string;
  type: string;
  body: string;
  mediaUrl?: string;
  rubric?: string;
  maxPoints: number;
  options?: { id: string; text: string }[];
  correctIds?: string[] | null;
  answer?: {
    answerId: string;
    selectedIds?: string[];
    textAnswer?: string;
    isCorrect: boolean | null;
    points: number | null;
    isManual: boolean;
    needsGrading: boolean;
  } | null;
}

interface GradingSession {
  session: { id: string; violationCount: number; startedAt: string; submittedAt: string };
  student: { id: string; name: string; email: string };
  exam: { id: string; title: string; passingScore?: number };
  gradingItems: GradingItem[];
  summary: { earnedSoFar: number; totalPoints: number; ungradedCount: number };
  violations: { id: string; type: string; occurredAt: string }[];
}

interface PendingSession {
  sessionId: string;
  student: { id: string; name: string; email: string };
  gradingProgress: { graded: number; total: number };
  submittedAt: string;
}

const VIOLATION_LABELS: Record<string, string> = {
  TAB_SWITCH: 'Tab switch', FULLSCREEN_EXIT: 'Fullscreen exit',
  RIGHT_CLICK: 'Right-click', KEYBOARD_SHORTCUT: 'Keyboard shortcut',
  COPY_PASTE: 'Copy/paste', FOCUS_LOST: 'Focus lost', MANUAL_FLAG: 'Manually flagged',
};

export default function GradingPage() {
  const { id: examId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [pending, setPending] = useState<PendingSession[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [gradingData, setGradingData] = useState<GradingSession | null>(null);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);

  // Per-answer grading state: { answerId -> { points, feedback } }
  const [grades, setGrades] = useState<Record<string, { points: string; feedback: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const loadPending = useCallback(() => {
    api.get(`/grading/exams/${examId}/pending`).then(r => {
      setPending(r.data.data);
      setLoadingPending(false);
    });
  }, [examId]);

  useEffect(() => { loadPending(); }, [loadPending]);

  async function selectSession(sessionId: string) {
    setSelected(sessionId);
    setLoadingSession(true);
    setGrades({});
    setSaved({});
    const { data } = await api.get(`/grading/exams/${examId}/sessions/${sessionId}`);
    setGradingData(data.data);
    // Pre-fill grades for already-graded manual answers
    const prefill: Record<string, { points: string; feedback: string }> = {};
    for (const item of data.data.gradingItems) {
      if (item.answer?.isManual && item.answer.answerId) {
        prefill[item.answer.answerId] = {
          points: item.answer.points !== null ? String(item.answer.points) : '',
          feedback: '',
        };
      }
    }
    setGrades(prefill);
    setLoadingSession(false);
  }

  async function gradeAnswer(answerId: string, maxPoints: number) {
    const g = grades[answerId];
    if (!g) return;
    const pts = parseFloat(g.points);
    if (isNaN(pts) || pts < 0 || pts > maxPoints) return;

    setSaving(p => ({ ...p, [answerId]: true }));
    try {
      await api.post(`/grading/answers/${answerId}`, { points: pts, feedback: g.feedback });
      setSaved(p => ({ ...p, [answerId]: true }));
      // Refresh summary
      const { data } = await api.get(`/grading/exams/${examId}/sessions/${selected!}`);
      setGradingData(data.data);
    } finally {
      setSaving(p => ({ ...p, [answerId]: false }));
    }
  }

  async function finalizeSession() {
    if (!selected) return;
    if (!confirm('Mark this session as fully graded? Ungraded answers will receive 0 points.')) return;
    await api.post(`/grading/sessions/${selected}/finalize`);
    loadPending();
    setSelected(null);
    setGradingData(null);
  }

  const pct = gradingData
    ? Math.round((gradingData.summary.earnedSoFar / (gradingData.summary.totalPoints || 1)) * 100)
    : 0;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Pending sessions sidebar ── */}
      <div className="w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-800">
          <button onClick={() => navigate(`/exams/${examId}/results`)} className="text-gray-500 hover:text-gray-300 text-xs mb-2">← Results</button>
          <h2 className="font-semibold text-sm">Manual Grading</h2>
          <p className="text-xs text-gray-500 mt-0.5">{pending.length} sessions pending</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingPending ? (
            <p className="p-4 text-xs text-gray-500">Loading…</p>
          ) : pending.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-xs text-gray-500">All sessions graded!</p>
            </div>
          ) : (
            pending.map(p => {
              const isSelected = selected === p.sessionId;
              const allDone = p.gradingProgress.graded === p.gradingProgress.total;
              return (
                <button
                  key={p.sessionId}
                  onClick={() => selectSession(p.sessionId)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-800/60 transition-colors ${
                    isSelected ? 'bg-emerald-950 border-l-2 border-l-emerald-500' : 'hover:bg-gray-800/40'
                  }`}
                >
                  <p className="text-sm font-medium truncate">{p.student.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500">
                      {p.gradingProgress.graded}/{p.gradingProgress.total} graded
                    </span>
                    {allDone
                      ? <span className="text-xs text-emerald-400">✓ Done</span>
                      : <span className="text-xs text-amber-400">Pending</span>
                    }
                  </div>
                  <div className="h-1 bg-gray-700 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${(p.gradingProgress.graded / (p.gradingProgress.total || 1)) * 100}%` }}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Grading panel ── */}
      <div className="flex-1 overflow-y-auto bg-gray-950">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <p className="text-4xl mb-3">📝</p>
              <p className="text-sm">Select a student from the left to begin grading</p>
            </div>
          </div>
        ) : loadingSession ? (
          <div className="flex items-center justify-center h-full text-gray-500">Loading…</div>
        ) : gradingData ? (
          <div className="max-w-3xl mx-auto p-8">
            {/* Student header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold">{gradingData.student.name}</h2>
                <p className="text-gray-400 text-sm">{gradingData.student.email}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span>Submitted {new Date(gradingData.session.submittedAt).toLocaleString()}</span>
                  {gradingData.session.violationCount > 0 && (
                    <span className="text-red-400">⚠ {gradingData.session.violationCount} violations</span>
                  )}
                </div>
              </div>
              {/* Score summary */}
              <div className="text-right">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-lg font-bold font-mono ml-auto"
                  style={{
                    background: `conic-gradient(${pct >= (gradingData.exam.passingScore ?? 60) ? '#10b981' : '#ef4444'} ${pct * 3.6}deg, #1f2937 0deg)`,
                  }}
                >
                  <div className="w-14 h-14 rounded-full bg-gray-950 flex items-center justify-center text-sm">
                    {pct}%
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {gradingData.summary.earnedSoFar}/{gradingData.summary.totalPoints} pts
                </p>
                {gradingData.summary.ungradedCount > 0 && (
                  <p className="text-xs text-amber-400">{gradingData.summary.ungradedCount} ungraded</p>
                )}
              </div>
            </div>

            {/* Violations */}
            {gradingData.violations.length > 0 && (
              <div className="card p-4 mb-6 border-amber-900">
                <p className="text-xs font-semibold text-amber-400 mb-2">Violations during exam</p>
                <div className="space-y-1">
                  {gradingData.violations.map(v => (
                    <div key={v.id} className="flex items-center justify-between text-xs">
                      <span className="text-amber-300">{VIOLATION_LABELS[v.type] ?? v.type}</span>
                      <span className="text-gray-500">{new Date(v.occurredAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Questions */}
            <div className="space-y-6">
              {gradingData.gradingItems.map(item => {
                const a = item.answer;
                const g = a?.answerId ? grades[a.answerId] : null;
                const isSaved = a?.answerId ? saved[a.answerId] : false;
                const isSaving = a?.answerId ? saving[a.answerId] : false;

                return (
                  <div
                    key={item.questionId}
                    className={`card p-5 ${a?.needsGrading && !isSaved ? 'border-amber-800' : ''}`}
                  >
                    {/* Question header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-mono">Q{item.order}</span>
                        <span className="bg-gray-800 px-2 py-0.5 rounded">{item.type.replace('_', ' ')}</span>
                        <span>{item.maxPoints} pt{item.maxPoints !== 1 ? 's' : ''}</span>
                      </div>
                      {/* Grade badge */}
                      {a && !item.answer?.isManual && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          a.isCorrect ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'
                        }`}>
                          {a.isCorrect ? `✓ +${a.points}` : `✗ 0`}
                        </span>
                      )}
                      {a?.isManual && isSaved && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-950 text-blue-400">
                          ✓ Graded: {a.points}/{item.maxPoints}
                        </span>
                      )}
                      {a?.isManual && !isSaved && a.needsGrading && (
                        <span className="text-xs text-amber-400">⏳ Needs grading</span>
                      )}
                    </div>

                    {/* Question body */}
                    <p className="text-base mb-3 leading-relaxed">
                      <RichText text={item.body} />
                    </p>

                    {/* Question media */}
                    {item.mediaUrl && (
                      <div className="mb-3">
                        {item.mediaUrl.match(/\.(mp3|wav|ogg|webm)$/i) ? (
                          <audio controls src={item.mediaUrl} className="w-full h-8" />
                        ) : (
                          <img src={item.mediaUrl} alt="Question media" className="max-h-48 rounded-lg border border-gray-700 object-contain" />
                        )}
                      </div>
                    )}

                    {/* MCQ / True-False: show selected and correct */}
                    {['MCQ', 'MCQ_MULTI', 'TRUE_FALSE'].includes(item.type) && item.options && (
                      <div className="space-y-1.5 mb-3">
                        {item.options.map(opt => {
                          const wasSelected = a?.selectedIds?.includes(opt.id);
                          const isCorrect = item.correctIds?.includes(opt.id);
                          return (
                            <div
                              key={opt.id}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                                wasSelected && isCorrect ? 'bg-emerald-950 border border-emerald-800' :
                                wasSelected && !isCorrect ? 'bg-red-950 border border-red-800' :
                                isCorrect ? 'bg-emerald-950/30 border border-emerald-900' :
                                'bg-gray-800/40'
                              }`}
                            >
                              <span className="font-mono text-xs text-gray-500 w-5">{opt.id.toUpperCase()}</span>
                              <span className="flex-1"><RichText text={opt.text} /></span>
                              {wasSelected && <span className="text-xs">{isCorrect ? '✓ Correct' : '✗ Selected'}</span>}
                              {!wasSelected && isCorrect && <span className="text-xs text-emerald-500">← Correct answer</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Essay / Short text: show answer and grading input */}
                    {item.answer?.isManual && (
                      <>
                        {/* Rubric */}
                        {item.rubric && (
                          <div className="bg-blue-950/30 border border-blue-900 rounded-lg px-4 py-3 mb-3">
                            <p className="text-xs font-semibold text-blue-400 mb-1">Grading rubric</p>
                            <p className="text-xs text-blue-200 leading-relaxed"><RichText text={item.rubric} /></p>
                          </div>
                        )}

                        {/* Student's answer */}
                        <div className="bg-gray-800 rounded-lg px-4 py-3 mb-3">
                          <p className="text-xs text-gray-500 mb-1.5">Student's answer:</p>
                          {a?.textAnswer ? (
                            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{a.textAnswer}</p>
                          ) : (
                            <p className="text-sm text-gray-600 italic">No answer provided</p>
                          )}
                        </div>

                        {/* Grading controls */}
                        {a?.answerId && (
                          <div className="flex items-start gap-4">
                            <div>
                              <label className="text-xs text-gray-400 block mb-1">
                                Points (0 – {item.maxPoints})
                              </label>
                              <input
                                type="number"
                                min="0"
                                max={item.maxPoints}
                                step="0.5"
                                value={g?.points ?? ''}
                                onChange={e => setGrades(prev => ({
                                  ...prev,
                                  [a.answerId]: { ...prev[a.answerId], points: e.target.value },
                                }))}
                                className="input w-24 text-center font-mono"
                                placeholder="0"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-xs text-gray-400 block mb-1">Feedback (optional)</label>
                              <input
                                type="text"
                                value={g?.feedback ?? ''}
                                onChange={e => setGrades(prev => ({
                                  ...prev,
                                  [a.answerId]: { ...prev[a.answerId], feedback: e.target.value },
                                }))}
                                className="input"
                                placeholder="e.g. Good explanation, but missed the key formula"
                              />
                            </div>
                            <div className="pt-5">
                              <button
                                onClick={() => gradeAnswer(a.answerId, item.maxPoints)}
                                disabled={isSaving || !g?.points}
                                className="btn-primary py-2"
                              >
                                {isSaving ? '…' : isSaved ? '✓ Saved' : 'Save Grade'}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Not answered */}
                    {!a && (
                      <p className="text-sm text-gray-600 italic">Student did not answer this question.</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Finalize button */}
            <div className="mt-8 flex items-center justify-between card p-5">
              <div>
                <p className="font-semibold">Finalize grading</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Any ungraded answers will receive 0 points. This updates the student's final score.
                </p>
              </div>
              <button
                onClick={finalizeSession}
                className="btn-primary bg-blue-600 hover:bg-blue-500"
              >
                ✓ Finalize
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
