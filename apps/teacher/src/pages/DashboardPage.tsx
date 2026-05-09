// apps/teacher/src/pages/DashboardPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import type { Exam } from '@secureexam/shared-types';

const statusBadge: Record<string, string> = {
  DRAFT: 'badge-draft', PUBLISHED: 'badge-published',
  ACTIVE: 'badge-active', CLOSED: 'badge-closed', ARCHIVED: 'badge-closed',
};

interface ExamWithCount extends Exam {
  _count: { items: number; sessions: number; assignments: number };
}

export default function DashboardPage() {
  const [exams, setExams] = useState<ExamWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    api.get('/exams').then(r => { setExams(r.data.data); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  async function activate(examId: string) {
    await api.post(`/exams/${examId}/activate`);
    load();
  }

  async function close(examId: string) {
    if (!confirm('Close this exam? Students will no longer be able to join.')) return;
    await api.post(`/exams/${examId}/close`);
    load();
  }

  const stats = {
    total: exams.length,
    active: exams.filter(e => e.status === 'ACTIVE').length,
    published: exams.filter(e => e.status === 'PUBLISHED').length,
    drafts: exams.filter(e => e.status === 'DRAFT').length,
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Manage your exams and question bank</p>
        </div>
        <Link to="/exams/new" className="btn-primary">+ New Exam</Link>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Exams', value: stats.total, color: 'text-gray-300' },
          { label: 'Active Now', value: stats.active, color: 'text-emerald-400' },
          { label: 'Published', value: stats.published, color: 'text-blue-400' },
          { label: 'Drafts', value: stats.drafts, color: 'text-gray-400' },
        ].map(s => (
          <div key={s.label} className="card p-5">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="font-semibold">Your Exams</h2>
          <Link to="/exams/new" className="text-xs text-emerald-400 hover:text-emerald-300">+ Create new</Link>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-500">Loading…</div>
        ) : exams.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-gray-400 mb-4">No exams yet.</p>
            <Link to="/exams/new" className="btn-primary">Create your first exam →</Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                <th className="text-left px-6 py-3 font-medium">Exam</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Questions</th>
                <th className="text-left px-4 py-3 font-medium">Sessions</th>
                <th className="text-left px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {exams.map(exam => (
                <tr key={exam.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{exam.title}</p>
                      {(exam as any).securityLevel > 1 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                          (exam as any).securityLevel === 2
                            ? 'bg-amber-950 text-amber-400'
                            : 'bg-red-950 text-red-400'
                        }`}>
                          L{(exam as any).securityLevel}
                        </span>
                      )}
                    </div>
                    {exam.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{exam.description}</p>}
                  </td>
                  <td className="px-4 py-4">
                    <span className={statusBadge[exam.status] ?? 'badge'}>{exam.status}</span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-400">{exam._count.items}</td>
                  <td className="px-4 py-4 text-sm text-gray-400">{exam._count.sessions}</td>
                  <td className="px-4 py-4 text-sm text-gray-400">{exam.durationMinutes}m</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 justify-end flex-wrap">
                      <Link to={`/exams/${exam.id}/edit`} className="text-xs text-gray-400 hover:text-white">Edit</Link>
                      <Link to={`/exams/${exam.id}/sections`} className="text-xs text-gray-400 hover:text-white">Sections</Link>

                      {/* Magic links — only for level 2+ security exams */}
                      {(exam as any).securityLevel >= 2 && ['PUBLISHED', 'ACTIVE'].includes(exam.status) && (
                        <Link
                          to={`/exams/${exam.id}/magic-links`}
                          className="text-xs font-medium text-amber-400 hover:text-amber-300 border border-amber-900 hover:border-amber-700 px-2 py-0.5 rounded-md transition-colors"
                        >
                          🔗 Links
                        </Link>
                      )}

                      {exam.status === 'PUBLISHED' && (
                        <button
                          onClick={() => activate(exam.id)}
                          className="text-xs font-medium text-blue-400 hover:text-blue-300 border border-blue-900 hover:border-blue-700 px-2 py-0.5 rounded-md transition-colors"
                        >
                          ▶ Activate
                        </button>
                      )}

                      {['PUBLISHED', 'ACTIVE'].includes(exam.status) && (
                        <Link
                          to={`/exams/${exam.id}/live`}
                          className="text-xs font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-900 hover:border-emerald-700 px-2 py-0.5 rounded-md transition-colors"
                        >
                          ● Live
                        </Link>
                      )}

                      {['PUBLISHED', 'ACTIVE'].includes(exam.status) && (
                        <button
                          onClick={() => close(exam.id)}
                          className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                        >
                          Close
                        </button>
                      )}

                      <Link to={`/exams/${exam.id}/results`} className="text-xs text-gray-400 hover:text-white">Results</Link>
                      <Link to={`/exams/${exam.id}/pins`} className="text-xs text-emerald-400 hover:text-emerald-300">PINs</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
