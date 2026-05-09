// apps/student/src/pages/ResultsListPage.tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface ResultEntry {
  sessionId: string;
  examId: string;
  title: string;
  description?: string;
  status: string;
  score: number | null;
  totalPoints: number | null;
  percentage: number | null;
  passed: boolean | null;
  passingScore: number | null;
  violationCount: number;
  submittedAt: string | null;
  timeTaken: number | null;
  totalQuestions: number;
  showResults: boolean;
  hasCertificate?: boolean;
}

function formatTime(secs: number | null) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

export default function ResultsListPage() {
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/student/results').then(async r => {
      const base: ResultEntry[] = r.data.data;
      // Check which sessions have certificates
      const enriched = await Promise.all(base.map(async entry => {
        if (entry.passed) {
          try {
            await api.get(`/assessment/sessions/${entry.sessionId}/certificate`);
            return { ...entry, hasCertificate: true };
          } catch { /* no cert */ }
        }
        return { ...entry, hasCertificate: false };
      }));
      setResults(enriched);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-lg">🔒</div>
            <h1 className="text-xl font-bold">Secure<span className="text-emerald-400">Exam</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sm text-gray-400 hover:text-white">📋 My Exams</Link>
            <span className="text-sm text-gray-400">👤 {user?.name}</span>
            <button className="text-xs text-gray-500 hover:text-gray-300" onClick={() => { clearAuth(); navigate('/login'); }}>
              Sign out
            </button>
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-2">My Results</h2>
        <p className="text-gray-400 text-sm mb-6">Review your completed exams, answers, and certificates.</p>

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading…</div>
        ) : results.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-gray-400">No completed exams yet.</p>
            <Link to="/" className="text-emerald-400 text-sm mt-2 inline-block hover:text-emerald-300">
              ← View available exams
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map(r => (
              <div key={r.sessionId} className="card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-base">{r.title}</h3>
                      {r.hasCertificate && (
                        <span className="text-xs bg-amber-950 text-amber-400 border border-amber-800 px-2 py-0.5 rounded-full flex-shrink-0">
                          🏆 Certified
                        </span>
                      )}
                    </div>
                    {r.description && (
                      <p className="text-sm text-gray-400 mt-0.5 line-clamp-1">{r.description}</p>
                    )}

                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>📅 {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'}</span>
                      <span>⏱ {formatTime(r.timeTaken)}</span>
                      <span>📝 {r.totalQuestions} questions</span>
                      {r.violationCount > 0 && (
                        <span className="text-amber-400">
                          ⚠ {r.violationCount} violation{r.violationCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score ring */}
                  <div className="text-right flex-shrink-0">
                    {r.showResults && r.percentage !== null ? (
                      <>
                        <div
                          className="w-16 h-16 rounded-full flex items-center justify-center font-mono mx-auto mb-1"
                          style={{
                            background: `conic-gradient(${r.percentage >= (r.passingScore ?? 60) ? '#10b981' : '#ef4444'} ${r.percentage * 3.6}deg, #1f2937 0deg)`,
                          }}
                        >
                          <div className="w-11 h-11 bg-gray-900 rounded-full flex items-center justify-center text-xs font-bold">
                            {r.percentage}%
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">{r.score}/{r.totalPoints} pts</p>
                        {r.passed !== null && (
                          <p className={`text-xs font-medium mt-0.5 ${r.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                            {r.passed ? '✓ Passed' : '✗ Failed'}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-gray-500 italic mt-4">Results pending</p>
                    )}
                  </div>
                </div>

                {/* Action links */}
                {(r.showResults || r.hasCertificate) && (
                  <div className="mt-4 pt-4 border-t border-gray-800 flex items-center gap-4">
                    {r.showResults && (
                      <Link
                        to={`/results/${r.sessionId}`}
                        className="text-sm text-emerald-400 hover:text-emerald-300 font-medium"
                      >
                        Review answers →
                      </Link>
                    )}
                    {r.hasCertificate && (
                      <Link
                        to={`/results/${r.sessionId}/certificate`}
                        className="text-sm text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1.5"
                      >
                        🏆 View Certificate
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
