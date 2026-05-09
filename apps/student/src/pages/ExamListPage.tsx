// apps/student/src/pages/ExamListPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface ExamEntry {
  exam: {
    id: string;
    title: string;
    description?: string;
    durationMinutes: number;
    status: string;
    _count: { items: number };
  };
  session: { status: string; score?: number; totalPoints?: number } | null;
}

const statusColors: Record<string, string> = {
  NOT_STARTED: 'text-gray-400 bg-gray-800',
  IN_PROGRESS: 'text-emerald-300 bg-emerald-950',
  LOCKED: 'text-amber-300 bg-amber-950',
  SUBMITTED: 'text-blue-300 bg-blue-950',
  AUTO_SUBMITTED: 'text-red-300 bg-red-950',
};

export default function ExamListPage() {
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const [exams, setExams] = useState<ExamEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/sessions/my').then((r) => { setExams(r.data.data); setLoading(false); });
  }, []);

  async function handleStart(examId: string) {
    const { data } = await api.post('/sessions', { examId });
    navigate(`/exam/${data.data.session.id}`, { state: { sessionState: data.data } });
  }

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
            <span className="text-sm text-gray-400">👤 {user?.name}</span>
            <Link to="/results" className="text-sm text-gray-400 hover:text-white">📊 My Results</Link>
            <button className="text-xs text-gray-500 hover:text-gray-300" onClick={() => { clearAuth(); navigate('/login'); }}>
              Sign out
            </button>
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-2">Your Exams</h2>
        <p className="text-gray-400 text-sm mb-6">Select an exam to begin. Once started, the lockdown browser will activate.</p>

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading exams…</div>
        ) : exams.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-400">No exams assigned to you yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {exams.map(({ exam, session }) => {
              const status = session?.status ?? 'NOT_STARTED';
              const isDone = ['SUBMITTED', 'AUTO_SUBMITTED'].includes(status);
              const isActive = status === 'IN_PROGRESS';

              return (
                <div key={exam.id} className="card p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-base truncate">{exam.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColors[status]}`}>
                          {status.replace('_', ' ')}
                        </span>
                      </div>
                      {exam.description && (
                        <p className="text-sm text-gray-400 mb-3 line-clamp-2">{exam.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>⏱ {exam.durationMinutes} min</span>
                        <span>📝 {exam._count.items} questions</span>
                        {isDone && session?.score !== undefined && (
                          <span className="text-emerald-400 font-medium">
                            ✓ Score: {session.score}/{session.totalPoints} pts
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      {isDone ? (
                        <span className="text-sm text-gray-500 font-medium">Completed</span>
                      ) : (
                        <button
                          onClick={() => handleStart(exam.id)}
                          className={isActive ? 'btn-ghost text-sm' : 'btn-primary text-sm'}
                        >
                          {isActive ? 'Resume →' : 'Start Exam →'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 card p-4">
          <h3 className="text-sm font-semibold text-amber-400 mb-2">⚠ Lockdown Rules</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• The browser will enter fullscreen mode when you start</li>
            <li>• Switching tabs, right-clicking, or pressing keyboard shortcuts counts as a violation</li>
            <li>• After 3 violations, your exam is automatically submitted</li>
            <li>• You need an instructor PIN to exit early</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
