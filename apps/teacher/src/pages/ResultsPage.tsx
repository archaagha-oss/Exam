// apps/teacher/src/pages/ResultsPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import RichText from '../components/RichText';

interface StudentResult {
  sessionId: string;
  student: { id: string; name: string; email: string };
  status: string;
  score?: number;
  totalPoints?: number;
  percentage?: number;
  passed?: boolean;
  violationCount: number;
  timeTaken?: number;
}

interface QuestionBreakdown {
  questionId: string;
  body: string;
  type: string;
  totalAnswered: number;
  correctCount: number;
  percentCorrect: number;
}

interface ReportData {
  exam: { id: string; title: string; passingScore?: number };
  summary: { totalStudents: number; submitted: number; averageScore: number; passRate?: number };
  questionBreakdown: QuestionBreakdown[];
  studentResults: StudentResult[];
}

const statusBadge: Record<string, string> = {
  NOT_STARTED: 'text-gray-500 bg-gray-800',
  IN_PROGRESS: 'text-blue-300 bg-blue-950',
  SUBMITTED: 'text-emerald-300 bg-emerald-950',
  AUTO_SUBMITTED: 'text-red-300 bg-red-950',
  LOCKED: 'text-amber-300 bg-amber-950',
};

function formatTime(secs?: number) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'students' | 'questions'>('students');
  const [pendingGrading, setPendingGrading] = useState(0);

  useEffect(() => {
    api.get(`/reports/exams/${id}`).then(r => { setReport(r.data.data); setLoading(false); });
    // Check for pending manual grading
    api.get(`/grading/exams/${id}/pending`).then(r => setPendingGrading(r.data.data.length)).catch(() => {});
  }, [id]);

  async function exportCSV() {
    window.open(`/api/v1/exports/exams/${id}/results.csv`);
  }

  if (loading) return <div className="p-8 text-gray-500">Loading results…</div>;
  if (!report) return <div className="p-8 text-gray-500">Report not found.</div>;

  const { exam, summary, studentResults, questionBreakdown } = report;

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-300 text-sm">← Back</button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{exam.title}</h1>
          <p className="text-gray-400 text-sm">Exam Results</p>
        </div>
        <div className="flex gap-2">
          {pendingGrading > 0 && (
            <Link
              to={`/exams/${id}/grade`}
              className="btn-primary bg-amber-500 hover:bg-amber-400 text-sm flex items-center gap-2"
            >
              ✏ Grade Essays
              <span className="bg-amber-700 text-amber-200 text-xs px-1.5 py-0.5 rounded-full">
                {pendingGrading}
              </span>
            </Link>
          )}
          <Link to={`/exams/${id}/analytics`} className="btn-ghost text-sm">📊 Analytics</Link>
          <Link to={`/exams/${id}/blueprint`} className="btn-ghost text-sm">🗺 Blueprint</Link>
          <Link to={`/exams/${id}/distribution`} className="btn-ghost text-sm">📈 Distribution</Link>
          <Link to={`/exams/${id}/feedback`} className="btn-ghost text-sm">💬 Feedback</Link>
          <Link to={`/exams/${id}/magic-links`} className="btn-ghost text-sm">🔗 Magic links</Link>
          <button onClick={exportCSV} className="btn-ghost text-sm">↓ Export CSV</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Students', value: summary.totalStudents },
          { label: 'Submitted', value: summary.submitted },
          { label: 'Average Score', value: `${summary.averageScore}%` },
          { label: 'Pass Rate', value: summary.passRate != null ? `${summary.passRate}%` : '—' },
        ].map(s => (
          <div key={s.label} className="card p-5">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {(['students', 'questions'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === t ? 'bg-emerald-500 text-black' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t === 'students' ? `Students (${studentResults.length})` : `Questions (${questionBreakdown.length})`}
          </button>
        ))}
      </div>

      {activeTab === 'students' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                <th className="text-left px-5 py-3 font-medium">Student</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Score</th>
                <th className="text-left px-4 py-3 font-medium">%</th>
                <th className="text-left px-4 py-3 font-medium">Passed</th>
                <th className="text-left px-4 py-3 font-medium">Violations</th>
                <th className="text-left px-4 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {studentResults.map(r => (
                <tr key={r.sessionId} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3">
                    <Link to={`/students/${r.student.id}/progress`} className="text-sm font-medium hover:text-emerald-400 transition-colors">{r.student.name}</Link>
                    <p className="text-xs text-gray-500">{r.student.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[r.status] ?? ''}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.score != null ? `${r.score} / ${r.totalPoints}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.percentage != null ? (
                      <span className={r.percentage >= (exam.passingScore ?? 60) ? 'text-emerald-400' : 'text-red-400'}>
                        {r.percentage}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.passed != null ? (r.passed ? '✓ Yes' : '✗ No') : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={r.violationCount > 0 ? 'text-red-400' : 'text-gray-400'}>
                      {r.violationCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{formatTime(r.timeTaken)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'questions' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                <th className="text-left px-5 py-3 font-medium">#</th>
                <th className="text-left px-5 py-3 font-medium">Question</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Answered</th>
                <th className="text-left px-4 py-3 font-medium">Correct</th>
                <th className="text-left px-4 py-3 font-medium">% Correct</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {questionBreakdown.map((q, idx) => (
                <tr key={q.questionId} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3 text-sm text-gray-500">{idx + 1}</td>
                  <td className="px-5 py-3 max-w-sm">
                    <p className="text-sm line-clamp-2"><RichText text={q.body} /></p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{q.type.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">{q.totalAnswered}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">{q.correctCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${q.percentCorrect >= 70 ? 'bg-emerald-500' : q.percentCorrect >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${q.percentCorrect}%` }}
                        />
                      </div>
                      <span className={`text-sm ${q.percentCorrect >= 70 ? 'text-emerald-400' : q.percentCorrect >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                        {q.percentCorrect}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
