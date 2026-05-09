// apps/superadmin/src/pages/OverviewPage.tsx
import { useEffect, useState } from 'react';
import { apiFetch } from '../App';

const S = { padding: '32px' };
const card = { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20 } as const;

interface Stats {
  schools: { total: number; migrated: number; onSharedDb: number; new30d: number };
  users: { total: number; new30d: number };
  exams: { total: number };
  sessions: { total: number; activeNow: number; last30d: number };
}

export default function OverviewPage({ token }: { token: string | null }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    apiFetch('/platform/stats', {}, token).then(r => setStats(r.data));
  }, [token]);

  if (!stats) return <div style={{ ...S, color: '#6b7280' }}>Loading…</div>;

  const kpis = [
    { label: 'Schools on platform', value: stats.schools.total, sub: `+${stats.schools.new30d} this month`, color: '#a78bfa' },
    { label: 'Total users',         value: stats.users.total,   sub: `+${stats.users.new30d} this month`,   color: '#34d399' },
    { label: 'Exams created',       value: stats.exams.total,   sub: 'all time',                             color: '#60a5fa' },
    { label: 'Sessions active now', value: stats.sessions.activeNow, sub: `${stats.sessions.last30d} last 30d`, color: '#fbbf24' },
  ];

  return (
    <div style={S}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Platform overview</h1>
        <p style={{ color: '#6b7280', fontSize: 14, margin: '4px 0 0' }}>All schools · all tenants</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {kpis.map(k => (
          <div key={k.label} style={card}>
            <p style={{ fontSize: 32, fontWeight: 700, fontFamily: 'monospace', color: k.color, margin: 0 }}>{k.value}</p>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 2px' }}>{k.label}</p>
            <p style={{ fontSize: 11, color: '#4b5563', margin: 0 }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Database split */}
      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>Database architecture</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: '#0d1117', borderRadius: 8, padding: 16, border: '1px solid #1f2937' }}>
            <p style={{ fontSize: 20, fontWeight: 700, color: '#34d399', margin: 0 }}>{stats.schools.migrated}</p>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>Schools on own schema</p>
            <p style={{ fontSize: 11, color: '#374151', margin: '4px 0 0' }}>Isolated · GDPR compliant</p>
          </div>
          <div style={{ background: '#0d1117', borderRadius: 8, padding: 16, border: '1px solid #1f2937' }}>
            <p style={{ fontSize: 20, fontWeight: 700, color: '#fbbf24', margin: 0 }}>{stats.schools.onSharedDb}</p>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>Schools on shared schema</p>
            <p style={{ fontSize: 11, color: '#374151', margin: '4px 0 0' }}>Migration pending · fine for pilot</p>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '12px 0 0' }}>
          Go to <a href="/migration" style={{ color: '#a78bfa', textDecoration: 'none' }}>Migration</a> to move schools to their own schema.
        </p>
      </div>
    </div>
  );
}
