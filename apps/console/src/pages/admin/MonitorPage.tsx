// apps/admin/src/pages/MonitorPage.tsx - fixed link (no /exams prefix needed, opens teacher portal)
import { useEffect, useState, useRef } from 'react';
import api from '../../lib/api';

interface ActiveExam {
  id: string;
  title: string;
  status: string;
  teacher: { id: string; name: string };
  proctors: { id: string; name: string }[];
  totalSessions: number;
  activeSessions: number;
  totalViolations: number;
  durationMinutes: number;
  startsAt: string | null;
}

export default function MonitorPage() {
  const [exams, setExams] = useState<ActiveExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function load() {
    api.get('/admin/monitor').then(r => {
      setExams(r.data.data);
      setLoading(false);
      setLastRefresh(new Date());
    });
  }

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  async function closeExam(id: string, title: string) {
    if (!confirm(`Close "${title}"? Students will not be able to join.`)) return;
    await api.post(`/admin/exams/${id}/close`);
    load();
  }

  async function removeProctor(examId: string, teacherId: string, name: string) {
    if (!confirm(`Remove ${name} as co-proctor?`)) return;
    await api.delete(`/admin/proctors/${examId}/${teacherId}`);
    load();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Live Monitor</h1>
          <p className="text-gray-400 text-sm mt-1">
            All active exams school-wide · Auto-refreshes every 30s
            {lastRefresh && <span className="ml-2 text-gray-600">· {lastRefresh.toLocaleTimeString()}</span>}
          </p>
        </div>
        <button onClick={load} className="btn-ghost text-sm">↻ Refresh</button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : exams.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">📡</div>
          <p className="text-gray-400">No active exams right now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {exams.map(exam => (
            <div key={exam.id} className={`card p-5 ${exam.status === 'ACTIVE' ? 'border-emerald-900' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold">{exam.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      exam.status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-400' : 'bg-blue-950 text-blue-400'
                    }`}>
                      {exam.status === 'ACTIVE' ? '● LIVE' : exam.status}
                    </span>
                  </div>

                  <p className="text-sm text-gray-400 mb-3">
                    Owner: {exam.teacher.name} · {exam.durationMinutes}m
                    {exam.startsAt && ` · ${new Date(exam.startsAt).toLocaleString()}`}
                  </p>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {[
                      { label: 'Active', value: exam.activeSessions, color: 'text-emerald-400' },
                      { label: 'Total', value: exam.totalSessions, color: 'text-gray-300' },
                      { label: 'Violations', value: exam.totalViolations, color: exam.totalViolations > 0 ? 'text-red-400' : 'text-gray-600' },
                    ].map(s => (
                      <div key={s.label} className="bg-gray-800 rounded-lg p-3 text-center">
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {exam.proctors.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500">Co-proctors:</span>
                      {exam.proctors.map(p => (
                        <span key={p.id} className="inline-flex items-center gap-1.5 text-xs bg-purple-950 text-purple-300 px-2 py-0.5 rounded-full">
                          {p.name}
                          <button onClick={() => removeProctor(exam.id, p.id, p.name)} className="hover:text-red-400 ml-0.5">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 flex-shrink-0">
                  <a
                    href={`http://localhost:5174/exams/${exam.id}/live`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary bg-emerald-600 hover:bg-emerald-500 text-sm py-2 text-center no-underline"
                  >
                    ● Open Live View
                  </a>
                  <button
                    onClick={() => closeExam(exam.id, exam.title)}
                    className="btn-ghost text-sm text-red-400 hover:text-red-300 hover:border-red-800"
                  >
                    Close Exam
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
