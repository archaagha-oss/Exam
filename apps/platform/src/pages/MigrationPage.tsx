// apps/platform/src/pages/MigrationPage.tsx
import { useEffect, useState } from 'react';
import api from '../lib/api';

const S = { padding: '32px' } as const;
const card = { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' } as const;

interface SchoolStatus {
  id: string; name: string; userCount: number; createdAt: string;
  status: 'migrated' | 'shared'; schemaName: string; migrateCommand: string;
}

export default function MigrationPage() {
  const [statuses, setStatuses] = useState<SchoolStatus[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api.get('/platform/migration-status').then((r) => setStatuses(r.data.data));
  }, []);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  const migrated = statuses.filter(s => s.status === 'migrated');
  const shared   = statuses.filter(s => s.status === 'shared');

  return (
    <div style={S}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Schema migration</h1>
        <p style={{ color: '#6b7280', fontSize: 14, margin: '4px 0 0' }}>
          Move schools from the shared public schema to isolated per-school schemas.
        </p>
      </div>

      {/* Explainer */}
      <div style={{ background: '#0d1117', border: '1px solid #1f2937', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#a78bfa', margin: '0 0 10px' }}>How migration works</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[
            { step: '1', label: 'Dry run', desc: 'Preview row counts, no data moved' },
            { step: '2', label: 'Migrate', desc: 'Copy data to school schema, verify counts' },
            { step: '3', label: 'Set env var', desc: 'Add schoolId to MIGRATED_SCHOOL_IDS' },
            { step: '4', label: 'Cleanup', desc: 'Remove rows from public after 1 week' },
          ].map(s => (
            <div key={s.step} style={{ background: '#111827', borderRadius: 8, padding: 12, border: '1px solid #1f2937' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#4c1d95', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#a78bfa', marginBottom: 8 }}>{s.step}</div>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#f9fafb', margin: '0 0 4px' }}>{s.label}</p>
              <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Progress summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#064e3b', border: '1px solid #065f46', borderRadius: 12, padding: 20 }}>
          <p style={{ fontSize: 28, fontWeight: 700, color: '#34d399', margin: 0, fontFamily: 'monospace' }}>{migrated.length}</p>
          <p style={{ fontSize: 13, color: '#6ee7b7', margin: '4px 0 0' }}>Schools on own schema</p>
          <p style={{ fontSize: 11, color: '#065f46', margin: '2px 0 0' }}>Isolated · GDPR compliant · faster queries</p>
        </div>
        <div style={{ background: '#451a03', border: '1px solid #78350f', borderRadius: 12, padding: 20 }}>
          <p style={{ fontSize: 28, fontWeight: 700, color: '#fbbf24', margin: 0, fontFamily: 'monospace' }}>{shared.length}</p>
          <p style={{ fontSize: 13, color: '#fde68a', margin: '4px 0 0' }}>Schools on shared schema</p>
          <p style={{ fontSize: 11, color: '#78350f', margin: '2px 0 0' }}>Fine for pilot · migrate before going live</p>
        </div>
      </div>

      {/* Pending migrations */}
      {shared.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: '#fbbf24' }}>
            Pending migration ({shared.length})
          </h2>
          <div style={{ ...card, marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1f2937' }}>
                  {['School', 'Users', 'Target schema', 'Command'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shared.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #111827' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: '#f9fafb' }}>{s.name}</p>
                      <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0', fontFamily: 'monospace' }}>{s.id.slice(0, 8)}…</p>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#9ca3af' }}>{s.userCount}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <code style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{s.schemaName}</code>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <code style={{ fontSize: 11, color: '#fbbf24', fontFamily: 'monospace', background: '#1c1917', padding: '4px 8px', borderRadius: 4 }}>
                          {s.migrateCommand}
                        </code>
                        <button
                          onClick={() => copy(s.migrateCommand, s.id)}
                          style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: copied === s.id ? '#34d399' : '#6b7280', fontSize: 11, padding: '3px 8px', cursor: 'pointer', flexShrink: 0 }}>
                          {copied === s.id ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Migrated */}
      {migrated.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: '#34d399' }}>
            Migrated ({migrated.length})
          </h2>
          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1f2937' }}>
                  {['School', 'Users', 'Schema', 'Cleanup command'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {migrated.map(s => {
                  const cleanupCmd = `npm run migrate:cleanup -- --schoolId ${s.id}`;
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #111827' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: '#f9fafb' }}>{s.name}</p>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#9ca3af' }}>{s.userCount}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <code style={{ fontSize: 11, color: '#34d399', fontFamily: 'monospace' }}>{s.schemaName}</code>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <button
                          onClick={() => copy(cleanupCmd, s.id + '_cleanup')}
                          style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: copied === s.id + '_cleanup' ? '#34d399' : '#6b7280', fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}>
                          {copied === s.id + '_cleanup' ? 'Copied!' : 'Copy cleanup cmd'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
