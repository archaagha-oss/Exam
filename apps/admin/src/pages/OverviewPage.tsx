// apps/admin/src/pages/OverviewPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

interface Stats {
  totalUsers: number; totalExams: number; activeSessions: number;
  totalViolations: number; roleBreakdown: Record<string, number>;
  recentAudit: { id: string; action: string; targetType: string; createdAt: string; actor: { name: string } }[];
}

interface TrendDay {
  date: string; sessions: number; passed: number; failed: number;
  examsCreated: number; newUsers: number;
}

interface Trends {
  timeline: TrendDay[];
  summary: { totalSessions: number; passRate: number | null; avgSessionsPerDay: number };
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  USER_CREATED:            { label: 'User created',         color: 'text-emerald-400' },
  USER_UPDATED:            { label: 'User updated',         color: 'text-blue-400' },
  USER_DELETED:            { label: 'User deleted',         color: 'text-red-400' },
  USER_DEACTIVATED:        { label: 'User deactivated',     color: 'text-amber-400' },
  EXAM_PUBLISHED:          { label: 'Exam published',       color: 'text-emerald-400' },
  EXAM_CLOSED:             { label: 'Exam closed',          color: 'text-gray-400' },
  SESSION_FORCE_SUBMITTED: { label: 'Force-submitted',      color: 'text-red-400' },
  SESSION_REMOTE_UNLOCKED: { label: 'Session unlocked',     color: 'text-amber-400' },
  PROCTOR_INVITED:         { label: 'Co-proctor invited',   color: 'text-purple-400' },
  BULK_IMPORT:             { label: 'Bulk import',          color: 'text-emerald-400' },
  PIN_GENERATED:           { label: 'PINs generated',       color: 'text-blue-400' },
};

function timeAgo(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function MiniBarChart({ data, color = '#10b981', label }: { data: number[]; color?: string; label: string }) {
  const max = Math.max(...data, 1);
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-end gap-0.5 h-12">
        {data.map((v, i) => (
          <div key={i} className="flex-1 rounded-sm min-h-[2px] transition-all"
            style={{ height: `${Math.max(4, (v / max) * 100)}%`, backgroundColor: color, opacity: 0.5 + (i / data.length) * 0.5 }}
            title={`${v}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/admin/stats'),
      api.get(`/admin/trends?days=${days}`),
    ]).then(([s, t]) => {
      setStats(s.data.data);
      setTrends(t.data.data);
      setLoading(false);
    });
  }, [days]);

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (!stats || !trends) return null;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5">School-wide overview</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${days === d ? 'bg-emerald-950 border-emerald-800 text-emerald-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total users',       value: stats.totalUsers,      color: 'text-gray-200',    sub: `${stats.roleBreakdown['STUDENT'] ?? 0} students` },
          { label: 'Live sessions',     value: stats.activeSessions,  color: 'text-emerald-400', sub: 'in progress now' },
          { label: `Sessions (${days}d)`, value: trends.summary.totalSessions, color: 'text-blue-400', sub: `~${trends.summary.avgSessionsPerDay}/day` },
          { label: 'Pass rate',         value: trends.summary.passRate != null ? `${trends.summary.passRate}%` : '—',
            color: (trends.summary.passRate ?? 0) >= 60 ? 'text-emerald-400' : 'text-amber-400', sub: `last ${days} days` },
        ].map(c => (
          <div key={c.label} className="card p-5">
            <p className={`text-3xl font-bold font-mono ${c.color}`}>{c.value}</p>
            <p className="text-xs text-gray-500 mt-1">{c.label}</p>
            <p className="text-xs text-gray-600 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <MiniBarChart data={trends.timeline.map(d => d.sessions)} color="#10b981" label={`Exam sessions — ${days}d`} />
          <p className="text-xs text-gray-600 mt-2">{trends.summary.totalSessions} total</p>
        </div>
        <div className="card p-5">
          <MiniBarChart data={trends.timeline.map(d => d.passed)} color="#3b82f6" label="Passes per day" />
          <p className="text-xs text-gray-600 mt-2">{trends.timeline.reduce((s,d)=>s+d.passed,0)} students passed</p>
        </div>
        <div className="card p-5">
          <MiniBarChart data={trends.timeline.map(d => d.newUsers)} color="#a855f7" label="New registrations" />
          <p className="text-xs text-gray-600 mt-2">{trends.timeline.reduce((s,d)=>s+d.newUsers,0)} new users</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Role breakdown */}
        <div className="card p-5">
          <h3 className="font-semibold text-sm mb-4">Users by role</h3>
          <div className="space-y-3">
            {Object.entries(stats.roleBreakdown).map(([role, count]) => {
              const pct = Math.round((count / stats.totalUsers) * 100);
              const clr: Record<string,string> = { STUDENT:'bg-blue-500', TEACHER:'bg-emerald-500', ADMIN:'bg-amber-500', SUPER_ADMIN:'bg-red-500' };
              return (
                <div key={role}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{role.replace('_',' ')}</span>
                    <span className="text-gray-400 font-mono">{count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full ${clr[role]??'bg-gray-500'} rounded-full`} style={{width:`${pct}%`}}/>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-2 text-xs">
            <Link to="/users" className="text-gray-400 hover:text-white">Manage users →</Link>
            <span className="text-gray-700">·</span>
            <Link to="/users/import" className="text-gray-400 hover:text-white">Bulk import</Link>
          </div>
        </div>

        {/* Audit feed */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Recent activity</h3>
            <Link to="/audit" className="text-xs text-gray-500 hover:text-gray-300">View all →</Link>
          </div>
          <div className="space-y-2">
            {stats.recentAudit.slice(0, 8).map(log => {
              const meta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'text-gray-400' };
              return (
                <div key={log.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0"/>
                    <p className={`text-xs font-medium ${meta.color} flex-shrink-0`}>{meta.label}</p>
                    <p className="text-xs text-gray-500 truncate">by {log.actor.name}</p>
                  </div>
                  <p className="text-xs text-gray-600 flex-shrink-0 ml-2">{timeAgo(log.createdAt)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Live monitor',    to: '/monitor',  icon: '📡', desc: 'Watch active exams' },
          { label: 'SEN profiles',    to: '/sen',      icon: '♿', desc: 'Access arrangements' },
          { label: 'School settings', to: '/settings', icon: '⚙',  desc: 'Branding & policy' },
          { label: 'GDPR tools',      to: '/gdpr',     icon: '🔒', desc: 'Export & erasure' },
        ].map(a => (
          <Link key={a.to} to={a.to} className="card p-4 hover:border-gray-600 transition-colors group block">
            <span style={{fontSize:20}}>{a.icon}</span>
            <p className="text-sm font-medium mt-2 group-hover:text-white">{a.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{a.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
