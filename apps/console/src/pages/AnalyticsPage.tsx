// apps/console/src/pages/AnalyticsPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';

interface QuestionStat {
  order: number;
  questionId: string;
  body: string;
  type: string;
  maxPoints: number;
  answered: number;
  correct: number;
  skipped: number;
  percentCorrect: number;
  discriminationIndex: number;
  difficultyCategory: 'too_easy' | 'appropriate' | 'challenging' | 'too_hard';
}

interface AnalyticsData {
  exam: { id: string; title: string; passingScore?: number };
  overview: {
    totalSubmissions: number;
    averageScore: number;
    medianScore: number;
    passRate: number | null;
    stdDeviation: number;
  };
  scoreDistribution: Record<string, number>;
  timeAnalysis: { averageSeconds: number; minSeconds: number; maxSeconds: number };
  questionAnalysis: QuestionStat[];
  violationAnalysis: {
    studentsWithViolations: number;
    autoSubmitted: number;
    byType: Record<string, number>;
  };
  suspectedPatterns: { count: number; sessions: { sessionId: string; score: number; totalPoints: number; violationCount: number; timeTaken: number | null }[] };
}

const DIFF_CATEGORY_COLORS: Record<string, string> = {
  too_easy: 'text-blue-400 bg-blue-950',
  appropriate: 'text-emerald-400 bg-emerald-950',
  challenging: 'text-amber-400 bg-amber-950',
  too_hard: 'text-red-400 bg-red-950',
};
const DIFF_CATEGORY_LABELS: Record<string, string> = {
  too_easy: 'Too easy', appropriate: 'Appropriate', challenging: 'Challenging', too_hard: 'Too hard',
};
const VIOLATION_LABELS: Record<string, string> = {
  TAB_SWITCH: 'Tab switch', FULLSCREEN_EXIT: 'Fullscreen exit', RIGHT_CLICK: 'Right-click',
  KEYBOARD_SHORTCUT: 'Keyboard shortcut', COPY_PASTE: 'Copy/paste', FOCUS_LOST: 'Focus lost', MANUAL_FLAG: 'Manually flagged',
};

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

export default function AnalyticsPage() {
  const { id: examId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'questions' | 'violations'>('overview');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/analytics/exams/${examId}`)
      .then(r => {
        if (r.data.data.message) {
          setError(r.data.data.message);
        } else {
          setData(r.data.data);
        }
        setLoading(false);
      })
      .catch(() => { setError('Failed to load analytics.'); setLoading(false); });
  }, [examId]);

  if (loading) return <div className="p-8 text-gray-500">Loading analytics…</div>;

  if (error || !data) {
    return (
      <div className="p-8">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-300 text-sm mb-4">← Back</button>
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-400">{error || 'No data available yet.'}</p>
          <p className="text-gray-600 text-sm mt-1">Analytics appear once students have submitted.</p>
        </div>
      </div>
    );
  }

  const { exam, overview, scoreDistribution, timeAnalysis, questionAnalysis, violationAnalysis, suspectedPatterns } = data;
  const maxDistCount = Math.max(...Object.values(scoreDistribution), 1);

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(`/exams/${examId}/results`)} className="text-gray-500 hover:text-gray-300 text-sm">← Results</button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-gray-400 text-sm mt-0.5">{exam.title}</p>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Submissions', value: overview.totalSubmissions, color: 'text-gray-200' },
          { label: 'Average', value: `${overview.averageScore}%`, color: 'text-blue-400' },
          { label: 'Median', value: `${overview.medianScore}%`, color: 'text-purple-400' },
          { label: 'Pass rate', value: overview.passRate != null ? `${overview.passRate}%` : '—', color: 'text-emerald-400' },
          { label: 'Std deviation', value: `±${overview.stdDeviation}%`, color: 'text-gray-400' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {(['overview', 'questions', 'violations'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === t ? 'bg-emerald-500 text-black' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Score distribution */}
          <div className="card p-5">
            <h3 className="font-semibold text-sm mb-4">Score distribution</h3>
            <div className="space-y-2">
              {Object.entries(scoreDistribution).map(([band, count]) => (
                <div key={band} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-500 w-14 text-right">{band}%</span>
                  <div className="flex-1 h-6 bg-gray-800 rounded-lg overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-lg transition-all flex items-center px-2"
                      style={{ width: `${Math.max(4, (count / maxDistCount) * 100)}%` }}
                    >
                      {count > 0 && <span className="text-xs font-bold text-black">{count}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 w-6">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Time analysis */}
          <div className="card p-5">
            <h3 className="font-semibold text-sm mb-4">Completion time</h3>
            <div className="space-y-4">
              {[
                { label: 'Average', value: formatTime(timeAnalysis.averageSeconds), pct: 60 },
                { label: 'Fastest', value: formatTime(timeAnalysis.minSeconds), pct: Math.max(4, Math.round((timeAnalysis.minSeconds / timeAnalysis.averageSeconds) * 60)) },
                { label: 'Slowest', value: formatTime(timeAnalysis.maxSeconds), pct: Math.min(100, Math.round((timeAnalysis.maxSeconds / timeAnalysis.averageSeconds) * 60)) },
              ].map(t => (
                <div key={t.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">{t.label}</span>
                    <span className="text-sm font-mono font-medium">{t.value}</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${t.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Suspected cheating alert */}
            {suspectedPatterns.count > 0 && (
              <div className="mt-5 bg-red-950/40 border border-red-900 rounded-lg p-4">
                <p className="text-sm font-semibold text-red-400 mb-1">
                  ⚠ {suspectedPatterns.count} suspected pattern{suspectedPatterns.count !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-red-300/70 mb-3">
                  Students who scored high, finished unusually fast, and had violations.
                </p>
                <div className="space-y-1.5">
                  {suspectedPatterns.sessions.map(s => (
                    <div key={s.sessionId} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-red-300/80">{s.sessionId.slice(0, 8)}…</span>
                      <span className="text-red-300">
                        {s.totalPoints ? Math.round((s.score / s.totalPoints) * 100) : '?'}% ·{' '}
                        {s.timeTaken ? formatTime(s.timeTaken) : '?'} ·{' '}
                        {s.violationCount} violation{s.violationCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Questions tab ── */}
      {activeTab === 'questions' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 text-xs text-gray-500 grid grid-cols-12 gap-2 font-medium">
            <span className="col-span-1">#</span>
            <span className="col-span-4">Question</span>
            <span className="col-span-1">Type</span>
            <span className="col-span-2">% Correct</span>
            <span className="col-span-2">Discrimination</span>
            <span className="col-span-2">Category</span>
          </div>
          <div className="divide-y divide-gray-800">
            {questionAnalysis.map(q => (
              <div key={q.questionId} className="px-5 py-3 grid grid-cols-12 gap-2 items-center hover:bg-gray-800/20 transition-colors">
                <span className="col-span-1 text-xs text-gray-500 font-mono">{q.order}</span>
                <p className="col-span-4 text-sm text-gray-200 truncate">{q.body}</p>
                <span className="col-span-1 text-xs text-gray-400">{q.type.replace('_', ' ')}</span>
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          q.percentCorrect >= 80 ? 'bg-blue-400' :
                          q.percentCorrect >= 50 ? 'bg-emerald-400' :
                          q.percentCorrect >= 20 ? 'bg-amber-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${q.percentCorrect}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-gray-300 w-8 text-right">{q.percentCorrect}%</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">{q.correct}/{q.answered} correct</p>
                </div>
                <div className="col-span-2">
                  <span className={`text-xs font-mono ${
                    q.discriminationIndex >= 0.3 ? 'text-emerald-400' :
                    q.discriminationIndex >= 0.1 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {q.discriminationIndex >= 0 ? '+' : ''}{q.discriminationIndex.toFixed(2)}
                  </span>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {q.discriminationIndex >= 0.3 ? 'Good' : q.discriminationIndex >= 0.1 ? 'Fair' : 'Poor'} discrimination
                  </p>
                </div>
                <div className="col-span-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${DIFF_CATEGORY_COLORS[q.difficultyCategory]}`}>
                    {DIFF_CATEGORY_LABELS[q.difficultyCategory]}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="px-5 py-3 border-t border-gray-800 bg-gray-900/40">
            <p className="text-xs text-gray-500">
              <strong className="text-gray-400">Discrimination index:</strong>{' '}
              how well the question separates high and low scorers.{' '}
              ≥ 0.30 = good · 0.10–0.29 = fair · &lt; 0.10 = consider rewriting.
            </p>
          </div>
        </div>
      )}

      {/* ── Violations tab ── */}
      {activeTab === 'violations' && (
        <div className="grid grid-cols-2 gap-6">
          <div className="card p-5">
            <h3 className="font-semibold text-sm mb-4">Violation breakdown</h3>
            <div className="space-y-3">
              {[
                { label: 'Students with violations', value: violationAnalysis.studentsWithViolations, total: overview.totalSubmissions },
                { label: 'Auto-submitted', value: violationAnalysis.autoSubmitted, total: overview.totalSubmissions },
              ].map(r => (
                <div key={r.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-400">{r.label}</span>
                    <span className="font-medium">{r.value} <span className="text-gray-500 text-xs">/ {r.total}</span></span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full"
                      style={{ width: `${Math.max(2, (r.value / Math.max(r.total, 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <p className="text-xs text-gray-500 mb-3">By violation type</p>
              <div className="space-y-2">
                {Object.entries(violationAnalysis.byType).sort(([, a], [, b]) => b - a).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{VIOLATION_LABELS[type] ?? type}</span>
                    <span className="text-xs font-mono text-gray-300">{count}</span>
                  </div>
                ))}
                {Object.keys(violationAnalysis.byType).length === 0 && (
                  <p className="text-xs text-gray-600 italic">No violations recorded.</p>
                )}
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-sm mb-4">Suspected academic integrity issues</h3>
            {suspectedPatterns.count === 0 ? (
              <div className="text-center py-6">
                <p className="text-2xl mb-2">✓</p>
                <p className="text-sm text-emerald-400">No suspicious patterns detected</p>
                <p className="text-xs text-gray-500 mt-1">All submission patterns look normal.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-4">
                  These students finished in less than 40% of the average time, scored above 85%, and had at least one violation.
                  This may warrant manual review.
                </p>
                <div className="space-y-3">
                  {suspectedPatterns.sessions.map(s => (
                    <div key={s.sessionId} className="bg-red-950/30 border border-red-900/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-gray-400">{s.sessionId.slice(0, 8)}…</span>
                        <Link
                          to={`/exams/${examId}/results`}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Review →
                        </Link>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-center">
                        <div>
                          <p className="text-red-300 font-medium">
                            {s.totalPoints ? Math.round((s.score / s.totalPoints) * 100) : '?'}%
                          </p>
                          <p className="text-gray-600">Score</p>
                        </div>
                        <div>
                          <p className="text-amber-300 font-medium">
                            {s.timeTaken ? formatTime(s.timeTaken) : '?'}
                          </p>
                          <p className="text-gray-600">Time</p>
                        </div>
                        <div>
                          <p className="text-red-400 font-medium">{s.violationCount}</p>
                          <p className="text-gray-600">Violations</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
