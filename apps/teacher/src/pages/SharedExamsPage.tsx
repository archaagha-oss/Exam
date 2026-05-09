// apps/teacher/src/pages/SharedExamsPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

interface SharedExam {
  id: string;
  exam: {
    id: string;
    title: string;
    description?: string;
    status: string;
    durationMinutes: number;
    teacher: { id: string; name: string };
    _count: { items: number; sessions: number };
  };
  inviter: { id: string; name: string };
  invitedAt: string;
}

const statusBadge: Record<string, string> = {
  DRAFT: 'badge-draft',
  PUBLISHED: 'badge-published',
  ACTIVE: 'badge-active',
  CLOSED: 'badge-closed',
  ARCHIVED: 'badge-closed',
};

export default function SharedExamsPage() {
  const [shared, setShared] = useState<SharedExam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/proctors/shared-with-me')
      .then(r => { setShared(r.data.data); setLoading(false); });
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Shared with me</h1>
        <p className="text-gray-400 text-sm mt-1">
          Exams where you have been invited as a co-proctor
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : shared.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">🤝</div>
          <p className="text-gray-400 mb-2">No exams shared with you yet.</p>
          <p className="text-gray-600 text-sm">
            When a colleague invites you to co-proctor their exam, it will appear here.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                <th className="text-left px-6 py-3 font-medium">Exam</th>
                <th className="text-left px-4 py-3 font-medium">Owner</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Questions</th>
                <th className="text-left px-4 py-3 font-medium">Invited by</th>
                <th className="text-left px-4 py-3 font-medium">Invited</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {shared.map(({ id, exam, inviter, invitedAt }) => (
                <tr key={id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-sm">{exam.title}</p>
                    {exam.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{exam.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-400">{exam.teacher.name}</td>
                  <td className="px-4 py-4">
                    <span className={statusBadge[exam.status] ?? 'badge'}>{exam.status}</span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-400">{exam._count.items}</td>
                  <td className="px-4 py-4 text-sm text-gray-400">{inviter.name}</td>
                  <td className="px-4 py-4 text-xs text-gray-500">
                    {new Date(invitedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      {['PUBLISHED', 'ACTIVE'].includes(exam.status) && (
                        <Link
                          to={`/exams/${exam.id}/live`}
                          className="text-xs font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-900 hover:border-emerald-700 px-2 py-0.5 rounded-md transition-colors"
                        >
                          ● Live
                        </Link>
                      )}
                      <Link
                        to={`/exams/${exam.id}/results`}
                        className="text-xs text-gray-400 hover:text-white"
                      >
                        Results
                      </Link>
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
