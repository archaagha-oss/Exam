// apps/console/src/pages/StudentProgressPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface TagStat { tag: string; percentage: number; status: 'strong' | 'adequate' | 'weak' | 'no data' }
interface ExamHistory {
  examId: string; examTitle: string; submittedAt: string;
  score: number | null; totalPoints: number | null;
  percentage: number | null; passed: boolean | null; violationCount: number;
}
interface ProgressData {
  student: { id: string; name: string; email: string };
  history: ExamHistory[];
  tagSummary: TagStat[];
}

const STATUS_COLORS: Record<string, string> = {
  strong: 'text-emerald-400 bg-emerald-950',
  adequate: 'text-amber-400 bg-amber-950',
  weak: 'text-red-400 bg-red-950',
  'no data': 'text-gray-500 bg-gray-800',
};

export default function StudentProgressPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/assessment/students/${studentId}/progress`)
      .then(r => { setData(r.data.data); setLoading(false); });
  }, [studentId]);

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (!data) return <div className="p-8 text-gray-500">Student not found.</div>;

  const avgScore = data.history.filter(h => h.percentage !== null).length
    ? Math.round(data.history.filter(h => h.percentage !== null)
        .reduce((s, h) => s + (h.percentage ?? 0), 0) / data.history.filter(h => h.percentage !== null).length)
    : null;

  const weakTags = data.tagSummary.filter(t => t.status === 'weak');
  const strongTags = data.tagSummary.filter(t => t.status === 'strong');

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-300 text-sm">← Back</button>
        <div>
          <h1 className="text-2xl font-bold">{data.student.name}</h1>
          <p className="text-gray-400 text-sm">{data.student.email}</p>
        </div>
        {avgScore !== null && (
          <div className="ml-auto text-center">
            <p className={`text-3xl font-bold ${avgScore >= 70 ? 'text-emerald-400' : avgScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {avgScore}%
            </p>
            <p className="text-xs text-gray-500">avg across {data.history.length} exam{data.history.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Score history */}
        <div className="card p-5 col-span-2">
          <h3 className="font-semibold text-sm mb-4">Score history</h3>
          {data.history.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No completed exams yet.</p>
          ) : (
            <>
              {/* Simple trend chart */}
              <div className="flex items-end gap-2 h-24 mb-3">
                {data.history.map((h, i) => {
                  const pct = h.percentage ?? 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1" title={h.examTitle}>
                      <span className="text-xs text-gray-400">{pct}%</span>
                      <div
                        className={`w-full rounded-t-sm min-h-[4px] ${pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ height: `${Math.max(4, pct * 0.8)}px` }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Table */}
              <div className="space-y-1">
                {data.history.map((h, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-800 last:border-0">
                    <span className="text-gray-200 truncate flex-1 mr-4">{h.examTitle}</span>
                    <div className="flex items-center gap-3 text-xs flex-shrink-0">
                      <span className="text-gray-500">{h.submittedAt ? new Date(h.submittedAt).toLocaleDateString() : '—'}</span>
                      <span className={`font-mono font-medium ${(h.percentage ?? 0) >= 70 ? 'text-emerald-400' : (h.percentage ?? 0) >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                        {h.percentage !== null ? `${h.percentage}%` : '—'}
                      </span>
                      {h.passed !== null && (
                        <span className={h.passed ? 'text-emerald-400' : 'text-red-400'}>
                          {h.passed ? '✓' : '✗'}
                        </span>
                      )}
                      {h.violationCount > 0 && <span className="text-amber-400">⚠ {h.violationCount}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tag performance */}
      {data.tagSummary.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {weakTags.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-sm mb-3 text-red-400">Weak areas</h3>
              <div className="space-y-2">
                {weakTags.map(t => (
                  <div key={t.tag} className="flex items-center justify-between">
                    <span className="text-sm text-gray-300 truncate">{t.tag}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${t.percentage}%` }} />
                      </div>
                      <span className="text-xs text-red-400 font-mono w-8">{t.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {strongTags.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-sm mb-3 text-emerald-400">Strong areas</h3>
              <div className="space-y-2">
                {strongTags.map(t => (
                  <div key={t.tag} className="flex items-center justify-between">
                    <span className="text-sm text-gray-300 truncate">{t.tag}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${t.percentage}%` }} />
                      </div>
                      <span className="text-xs text-emerald-400 font-mono w-8">{t.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
