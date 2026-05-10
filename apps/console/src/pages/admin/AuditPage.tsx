// apps/admin/src/pages/AuditPage.tsx
import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';

interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
  meta: Record<string, any> | null;
  actor: { id: string; name: string; email: string; role: string };
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  USER_CREATED:            { label: 'User created',           color: 'bg-emerald-950 text-emerald-400' },
  USER_UPDATED:            { label: 'User updated',           color: 'bg-blue-950 text-blue-400' },
  USER_DELETED:            { label: 'User deleted',           color: 'bg-red-950 text-red-400' },
  USER_DEACTIVATED:        { label: 'User deactivated',       color: 'bg-amber-950 text-amber-400' },
  EXAM_PUBLISHED:          { label: 'Exam published',         color: 'bg-emerald-950 text-emerald-400' },
  EXAM_CLOSED:             { label: 'Exam closed',            color: 'bg-gray-800 text-gray-400' },
  EXAM_ARCHIVED:           { label: 'Exam archived',          color: 'bg-gray-800 text-gray-500' },
  SESSION_FORCE_SUBMITTED: { label: 'Session force-submitted', color: 'bg-red-950 text-red-400' },
  SESSION_REMOTE_UNLOCKED: { label: 'Session unlocked',       color: 'bg-amber-950 text-amber-400' },
  SESSION_FLAGGED:         { label: 'Session flagged',        color: 'bg-amber-950 text-amber-400' },
  PROCTOR_INVITED:         { label: 'Co-proctor invited',     color: 'bg-purple-950 text-purple-400' },
  PROCTOR_REMOVED:         { label: 'Co-proctor removed',     color: 'bg-gray-800 text-gray-400' },
  PIN_GENERATED:           { label: 'PINs generated',         color: 'bg-blue-950 text-blue-400' },
  BULK_IMPORT:             { label: 'Bulk import',            color: 'bg-emerald-950 text-emerald-400' },
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS);

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (filterAction) params.set('action', filterAction);
    api.get(`/audit?${params}`).then(r => {
      setLogs(r.data.data);
      setTotal(r.data.total);
      setLoading(false);
    });
  }, [page, filterAction]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filterAction]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function formatMeta(meta: Record<string, any> | null) {
    if (!meta) return '';
    const entries = Object.entries(meta).filter(([k]) => !['examTitle'].includes(k));
    return entries.map(([k, v]) => `${k}: ${v}`).join(' · ');
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-gray-400 text-sm mt-1">{total} total events</p>
        </div>
        <button
          onClick={() => { window.open('/api/v1/exports/schools/current/users.csv'); }}
          className="btn-ghost text-sm"
        >
          ↓ Export Users CSV
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <select
          className="input max-w-[240px]"
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
        >
          <option value="">All actions</option>
          {ALL_ACTIONS.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No audit events found.</div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left px-5 py-3 font-medium">Action</th>
                  <th className="text-left px-4 py-3 font-medium">Actor</th>
                  <th className="text-left px-4 py-3 font-medium">Target</th>
                  <th className="text-left px-4 py-3 font-medium">Details</th>
                  <th className="text-left px-4 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {logs.map(log => {
                  const cfg = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-gray-800 text-gray-400' };
                  return (
                    <tr key={log.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium">{log.actor.name}</p>
                        <p className="text-xs text-gray-500">{log.actor.role}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                        {log.targetType}
                        <br />
                        <span className="text-gray-700">{log.targetId.slice(0, 8)}…</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                        {formatMeta(log.meta)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800 text-sm">
                <span className="text-gray-500">Page {page} of {totalPages} · {total} total</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost py-1 px-3 text-xs disabled:opacity-30">← Prev</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-ghost py-1 px-3 text-xs disabled:opacity-30">Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
