// apps/platform/src/pages/SchoolDetailPage.tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';

const S = { padding: '32px', maxWidth: 640 } as const;
const card = { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20, marginBottom: 16 } as const;

export default function SchoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [school, setSchool] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/platform/schools/${id}`).then((r) => setSchool(r.data.data));
  }, [id]);

  async function deleteSchool() {
    if (confirmName !== school?.name) {
      setError('Name does not match');
      return;
    }
    if (!confirm(`PERMANENTLY delete "${school.name}" and all their data?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/platform/schools/${id}`, { data: { confirmName } });
      window.location.href = '/schools';
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Delete failed';
      setError(msg);
      setDeleting(false);
    }
  }

  if (!school) return <div style={{ ...S, color: '#6b7280' }}>Loading…</div>;

  return (
    <div style={S}>
      <div style={{ marginBottom: 24 }}>
        <Link to="/schools" style={{ color: '#6b7280', fontSize: 13, textDecoration: 'none' }}>← All schools</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '8px 0 0' }}>{school.name}</h1>
        <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>ID: <code style={{ fontFamily: 'monospace', color: '#9ca3af' }}>{school.id}</code></p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Users', value: school.userCount },
          { label: 'Exams', value: school.examCount },
          { label: 'Sessions (30d)', value: school.sessions30d },
        ].map(k => (
          <div key={k.label} style={{ background: '#0d1117', border: '1px solid #1f2937', borderRadius: 8, padding: 16 }}>
            <p style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace', color: '#a78bfa', margin: 0 }}>{k.value}</p>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Database status */}
      <div style={card}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px', color: '#9ca3af' }}>Database</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 12, padding: '4px 10px', borderRadius: 12, fontWeight: 600,
            background: school.isMigrated ? '#064e3b' : '#451a03',
            color: school.isMigrated ? '#34d399' : '#fbbf24',
          }}>
            {school.isMigrated ? 'Own schema' : 'Shared schema'}
          </span>
          {school.isMigrated && (
            <code style={{ color: '#9ca3af', fontSize: 12, fontFamily: 'monospace' }}>{school.schemaName}</code>
          )}
        </div>
        {!school.isMigrated && (
          <div style={{ background: '#1c1917', border: '1px solid #292524', borderRadius: 8, padding: 12, marginTop: 12 }}>
            <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 6px' }}>Migrate this school to its own schema:</p>
            <code style={{ color: '#fbbf24', fontSize: 12, fontFamily: 'monospace' }}>
              npm run migrate:tenant -- --schoolId {school.id}
            </code>
          </div>
        )}
      </div>

      {/* Admins */}
      <div style={card}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px', color: '#9ca3af' }}>Admin accounts</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {school.users?.map((u: any) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1f2937' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: '#f9fafb' }}>{u.name}</p>
                <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>{u.email}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 11, color: '#7c3aed', background: '#1e1b4b', padding: '2px 8px', borderRadius: 8 }}>{u.role}</span>
                <p style={{ fontSize: 11, color: '#4b5563', margin: '4px 0 0' }}>
                  Last login: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'never'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div style={{ ...card, borderColor: '#7f1d1d', background: '#0f0a0a' }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px', color: '#f87171' }}>Danger zone</p>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
          Permanently delete this school and all associated data. This cannot be undone.
        </p>
        <input
          value={confirmName} onChange={e => setConfirmName(e.target.value)}
          placeholder={`Type "${school.name}" to confirm`}
          style={{ width: '100%', background: '#1f2937', border: '1px solid #7f1d1d', borderRadius: 8, padding: '9px 12px', color: '#f9fafb', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }}
        />
        {error && <p style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{error}</p>}
        <button onClick={deleteSchool} disabled={deleting || confirmName !== school.name}
          style={{ background: confirmName === school.name ? '#dc2626' : '#374151', border: 'none', borderRadius: 8, padding: '9px 20px', color: 'white', fontSize: 13, fontWeight: 600, cursor: confirmName === school.name ? 'pointer' : 'not-allowed' }}>
          {deleting ? 'Deleting…' : 'Delete school permanently'}
        </button>
      </div>
    </div>
  );
}
