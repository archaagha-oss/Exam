// apps/console/src/pages/FeedbackPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';

interface SessionRow {
  sessionId: string;
  student: { id: string; name: string; email: string };
  status: string;
  score: number | null;
  totalPoints: number | null;
  percentage: number | null;
  submittedAt: string | null;
  existingFeedback?: { text: string; aiSuggested?: string } | null;
}

export default function FeedbackPage() {
  const { id: examId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SessionRow | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get(`/reports/exams/${examId}`).then(async r => {
      const studentResults = r.data.data.studentResults;
      // Fetch feedback status for each session
      const rows: SessionRow[] = await Promise.all(
        studentResults.filter((s: any) => ['SUBMITTED', 'AUTO_SUBMITTED'].includes(s.status)).map(async (s: any) => {
          let existingFeedback = null;
          try {
            const fb = await api.get(`/assessment/sessions/${s.sessionId}/feedback`);
            existingFeedback = fb.data.data;
          } catch { /* no feedback yet */ }
          return { ...s, existingFeedback };
        })
      );
      setSessions(rows);
      setLoading(false);
    });
  }, [examId]);

  function selectSession(row: SessionRow) {
    setSelected(row);
    setFeedbackText(row.existingFeedback?.text ?? '');
    setAiSuggestion(row.existingFeedback?.aiSuggested ?? '');
    setSaved(false);
  }

  async function saveFeedback() {
    if (!selected) return;
    setSaving(true);
    await api.post(`/assessment/sessions/${selected.sessionId}/feedback`, { text: feedbackText });
    setSaved(true);
    setSaving(false);
    setSessions(prev => prev.map(s =>
      s.sessionId === selected.sessionId
        ? { ...s, existingFeedback: { text: feedbackText, aiSuggested: aiSuggestion } }
        : s
    ));
  }

  async function generateAI() {
    if (!selected) return;
    setGenerating(true);
    try {
      const { data } = await api.post(`/assessment/sessions/${selected.sessionId}/feedback/ai`);
      setAiSuggestion(data.data.suggestion);
      if (!feedbackText) setFeedbackText(data.data.suggestion);
    } catch (err: any) {
      alert(err.response?.data?.error || 'AI generation failed');
    } finally {
      setGenerating(false);
    }
  }

  const feedbackCount = sessions.filter(s => s.existingFeedback?.text).length;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-800">
          <button onClick={() => navigate(`/exams/${examId}/results`)} className="text-gray-500 hover:text-gray-300 text-xs mb-2">← Results</button>
          <h2 className="font-semibold text-sm">Student Feedback</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {feedbackCount}/{sessions.length} written
          </p>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
          {loading ? (
            <p className="p-4 text-xs text-gray-500">Loading…</p>
          ) : sessions.map(s => {
            const hasFeedback = !!s.existingFeedback?.text;
            const isSelected = selected?.sessionId === s.sessionId;
            return (
              <button
                key={s.sessionId}
                onClick={() => selectSession(s)}
                className={`w-full text-left px-4 py-3 transition-colors ${isSelected ? 'bg-emerald-950 border-l-2 border-l-emerald-500' : 'hover:bg-gray-800/40'}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate">{s.student.name}</p>
                  {hasFeedback ? <span className="text-xs text-emerald-400">✓</span> : <span className="text-xs text-gray-600">—</span>}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.percentage !== null ? `${s.percentage}%` : '—'}
                  {s.submittedAt ? ` · ${new Date(s.submittedAt).toLocaleDateString()}` : ''}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 overflow-y-auto bg-gray-950">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <p className="text-4xl mb-3">💬</p>
              <p className="text-sm">Select a student to write feedback</p>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-8">
            {/* Student header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold">{selected.student.name}</h2>
                <p className="text-gray-400 text-sm">{selected.student.email}</p>
              </div>
              <div className="text-right">
                {selected.percentage !== null && (
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center font-mono font-bold text-sm"
                    style={{
                      background: `conic-gradient(${(selected.percentage ?? 0) >= 60 ? '#10b981' : '#ef4444'} ${(selected.percentage ?? 0) * 3.6}deg, #1f2937 0deg)`,
                    }}
                  >
                    <div className="w-11 h-11 bg-gray-950 rounded-full flex items-center justify-center text-xs">
                      {selected.percentage}%
                    </div>
                  </div>
                )}
                <Link
                  to={`/students/${selected.student.id}/progress`}
                  className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
                >
                  View progress →
                </Link>
              </div>
            </div>

            {/* AI suggestion */}
            {aiSuggestion && (
              <div className="card p-4 mb-4 border-purple-900 bg-purple-950/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-purple-400">✨ AI Remediation Suggestion</span>
                  <button
                    onClick={() => setFeedbackText(aiSuggestion)}
                    className="text-xs text-purple-400 hover:text-purple-300 ml-auto"
                  >
                    Use as feedback
                  </button>
                </div>
                <p className="text-sm text-purple-200 leading-relaxed">{aiSuggestion}</p>
              </div>
            )}

            {/* Feedback textarea */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Personalised feedback</label>
                <button
                  onClick={generateAI}
                  disabled={generating}
                  className="text-xs text-purple-400 hover:text-purple-300 border border-purple-900 px-2 py-1 rounded-lg transition-colors"
                >
                  {generating ? '✨ Generating…' : '✨ AI Suggest'}
                </button>
              </div>
              <textarea
                className="input h-36 resize-none"
                placeholder="Write personalised feedback for this student — what they did well, where to improve, and how to study the weak topics…"
                value={feedbackText}
                onChange={e => { setFeedbackText(e.target.value); setSaved(false); }}
              />
              <p className="text-xs text-gray-600 mt-1 text-right">{feedbackText.length}/2000 chars</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={saveFeedback}
                disabled={saving || !feedbackText.trim()}
                className="btn-primary flex-1"
              >
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Feedback'}
              </button>
              {saved && <p className="text-xs text-emerald-400">Saved. Student will see this in their results.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
