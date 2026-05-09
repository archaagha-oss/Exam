// apps/student/src/pages/ReviewPage.tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import RichText from '../components/RichText';
import { useAccessibility } from '../hooks/useAccessibility';

interface ReviewItem {
  order: number;
  questionId: string;
  type: string;
  body: string;
  mediaUrl?: string;
  options?: { id: string; text: string }[];
  correctIds?: string[] | null;
  rubric?: string | null;
  maxPoints: number;
  answer?: {
    selectedIds?: string[];
    textAnswer?: string;
    isCorrect: boolean | null;
    points: number | null;
  } | null;
}

interface Feedback { text: string; aiSuggested?: string }
interface Certificate { id: string; percentage: number; issuedAt: string }
  correctIds?: string[] | null;
  rubric?: string | null;
  maxPoints: number;
  answer?: {
    selectedIds?: string[];
    textAnswer?: string;
    isCorrect: boolean | null;
    points: number | null;
  } | null;
}

interface ReviewData {
  session: { id: string; status: string; submittedAt: string; violationCount: number; timeTaken: number | null };
  exam: { id: string; title: string; passingScore?: number; showResultsAfter: boolean };
  summary: { score: number; totalPoints: number; percentage: number; passed: boolean | null } | null;
  items: ReviewItem[];
}

export default function ReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const { fontSize, highContrast } = useAccessibility();

  useEffect(() => {
    api.get(`/student/results/${sessionId}`).then(r => {
      setData(r.data.data);
      setLoading(false);
    });
    // Load feedback and certificate in parallel — silently ignore if not found
    api.get(`/assessment/sessions/${sessionId}/feedback`)
      .then(r => setFeedback(r.data.data))
      .catch(() => {});
    api.get(`/assessment/sessions/${sessionId}/certificate`)
      .then(r => setCertificate(r.data.data))
      .catch(() => {});
  }, [sessionId]);

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500">Loading…</div>;
  if (!data) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500">Not found.</div>;

  const { exam, summary, items, session } = data;
  const pct = summary?.percentage ?? 0;

  return (
    <div className={`min-h-screen bg-gray-950 p-6 ${highContrast ? 'high-contrast' : ''}`}
         style={{ fontSize: `${fontSize}px` }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/results" className="text-gray-500 hover:text-gray-300 text-sm">← My Results</Link>
        </div>

        <h1 className="text-2xl font-bold mb-1">{exam.title}</h1>
        <p className="text-gray-400 text-sm mb-6">
          Submitted {session.submittedAt ? new Date(session.submittedAt).toLocaleString() : '—'}
          {session.timeTaken && ` · ${Math.floor(session.timeTaken / 60)}m ${session.timeTaken % 60}s`}
          {session.violationCount > 0 && ` · ⚠ ${session.violationCount} violations`}
        </p>

        {/* Score summary */}
        {summary && (
          <div className="card p-6 mb-8 flex items-center gap-6">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: `conic-gradient(${pct >= (exam.passingScore ?? 60) ? '#10b981' : '#ef4444'} ${pct * 3.6}deg, #1f2937 0deg)`,
              }}
            >
              <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center text-xl font-bold font-mono">
                {pct}%
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold">{summary.score} <span className="text-gray-500 text-lg font-normal">/ {summary.totalPoints} pts</span></p>
              {summary.passed !== null && (
                <p className={`text-sm font-medium mt-1 ${summary.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {summary.passed ? '✓ Passed' : '✗ Did not pass'}
                  {exam.passingScore && ` (passing: ${exam.passingScore}%)`}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">{items.filter(i => i.answer?.isCorrect === true).length} of {items.length} questions correct</p>
            </div>
          </div>
        )}

        {/* Question review */}
        <div className="space-y-5">
          {items.map(item => {
            const a = item.answer;
            const isManual = ['SHORT_TEXT', 'ESSAY'].includes(item.type);
            const isCorrect = a?.isCorrect;
            const wasAnswered = a && (a.selectedIds?.length || a.textAnswer);

            return (
              <div
                key={item.questionId}
                className={`card p-5 ${
                  !wasAnswered ? 'border-gray-800' :
                  isManual ? 'border-blue-900' :
                  isCorrect === true ? 'border-emerald-900' :
                  isCorrect === false ? 'border-red-900' :
                  'border-gray-800'
                }`}
              >
                {/* Question header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-mono text-gray-500">Q{item.order}</span>
                  <span className="text-xs text-gray-500">{item.type.replace('_', ' ')}</span>
                  <span className="text-xs text-gray-500">{item.maxPoints} pt{item.maxPoints !== 1 ? 's' : ''}</span>
                  {summary && !isManual && (
                    <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                      !wasAnswered ? 'bg-gray-800 text-gray-500' :
                      isCorrect === true ? 'bg-emerald-950 text-emerald-400' :
                      'bg-red-950 text-red-400'
                    }`}>
                      {!wasAnswered ? 'Not answered' : isCorrect ? `✓ +${a?.points}` : '✗ 0'}
                    </span>
                  )}
                  {summary && isManual && a?.points !== null && (
                    <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-blue-950 text-blue-400">
                      {a?.points}/{item.maxPoints} pts
                    </span>
                  )}
                </div>

                {/* Question body */}
                <p className="mb-3 leading-relaxed"><RichText text={item.body} /></p>

                {/* Media */}
                {item.mediaUrl && (
                  <div className="mb-3">
                    {item.mediaUrl.match(/\.(mp3|wav|ogg)$/i)
                      ? <audio controls src={item.mediaUrl} className="w-full" />
                      : <img src={item.mediaUrl} alt="" className="max-h-48 rounded-lg border border-gray-700 object-contain" />
                    }
                  </div>
                )}

                {/* MCQ options */}
                {item.options && item.options.length > 0 && (
                  <div className="space-y-1.5">
                    {item.options.map(opt => {
                      const wasSelected = a?.selectedIds?.includes(opt.id);
                      const isCorrectOpt = item.correctIds?.includes(opt.id);
                      return (
                        <div
                          key={opt.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                            wasSelected && isCorrectOpt ? 'bg-emerald-950 border border-emerald-800' :
                            wasSelected && !isCorrectOpt ? 'bg-red-950 border border-red-800' :
                            isCorrectOpt && item.correctIds ? 'bg-emerald-950/30 border border-emerald-900/50' :
                            'bg-gray-800/40'
                          }`}
                        >
                          <span className="font-mono text-xs text-gray-500 w-5">{opt.id.toUpperCase()}</span>
                          <span className="flex-1"><RichText text={opt.text} /></span>
                          {wasSelected && <span className="text-xs">{isCorrectOpt ? '✓ Your answer (correct)' : '✗ Your answer'}</span>}
                          {!wasSelected && isCorrectOpt && item.correctIds && (
                            <span className="text-xs text-emerald-500">← Correct answer</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Essay / short text */}
                {isManual && (
                  <>
                    {item.rubric && (
                      <div className="bg-blue-950/30 border border-blue-900 rounded-lg px-3 py-2 mb-3 text-xs text-blue-200">
                        <span className="font-semibold text-blue-400">Rubric: </span>
                        <RichText text={item.rubric} />
                      </div>
                    )}
                    <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                      {a?.textAnswer || <span className="text-gray-600 italic">No answer provided</span>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Teacher feedback */}
        {feedback?.text && (
          <div className="mt-6 card p-5 border-emerald-900 bg-emerald-950/10">
            <p className="text-xs font-semibold text-emerald-400 mb-2">💬 Instructor Feedback</p>
            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{feedback.text}</p>
            {feedback.aiSuggested && feedback.aiSuggested !== feedback.text && (
              <div className="mt-3 pt-3 border-t border-emerald-900/50">
                <p className="text-xs font-semibold text-purple-400 mb-1">✨ Study Recommendation</p>
                <p className="text-sm text-purple-200/80 leading-relaxed">{feedback.aiSuggested}</p>
              </div>
            )}
          </div>
        )}

        {/* Certificate */}
        {certificate && (
          <div className="mt-4 card p-5 border-amber-900 bg-amber-950/10 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-400">🏆 Certificate earned — {certificate.percentage}%</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Issued {new Date(certificate.issuedAt).toLocaleDateString()}
              </p>
            </div>
            <Link
              to={`/results/${sessionId}/certificate`}
              className="btn-primary bg-amber-600 hover:bg-amber-500 text-sm flex-shrink-0"
            >
              View Certificate →
            </Link>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link to="/results" className="btn-ghost">← Back to My Results</Link>
        </div>
      </div>
    </div>
  );
}
