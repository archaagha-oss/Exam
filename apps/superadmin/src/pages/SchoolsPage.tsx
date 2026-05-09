// apps/superadmin/src/pages/SchoolsPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../App';

const S = { padding: '32px' } as const;
const card = { background: '#111827', border: '1px solid #1f2937', borderRadius: 12 } as const;

interface School {
  id: string; name: string; domain: string | null; contactEmail: string | null;
  userCount: number; examCount: number; isMigrated: boolean;
  schemaName: string; createdAt: string; lastActivityAt: string | null;
}

export default function SchoolsPage({ token }: { token: string | null }) {
  const [schools, setSchools] = useState<School[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiFetch('/platform/schools', {}, token).then(r => setSchools(r.data));
  }, [token]);

  const filtered = schools.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.domain ?? '').includes(search)
  );

  return (
    <div style={S}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Schools</h1>
          <p style={{ color: '#6b7280', fontSize: 14, margin: '4px 0 0' }}>{schools.length} tenants</p>
        </div>
        <Link to="/schools/new"
          style={{ background: '#7c3aed', color: 'white', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
          + Provision school
        </Link>
      </div>

      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search schools…"
        style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '10px 14px', color: '#f9fafb', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
      />

      <div style={{ ...card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1f2937' }}>
              {['School', 'Users', 'Exams', 'Schema', 'Created', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid #111827' }}>
                <td style={{ padding: '14px 16px' }}>
                  <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: '#f9fafb' }}>{s.name}</p>
                  <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>{s.domain ?? s.contactEmail ?? s.id.slice(0, 8)}</p>
                </td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#9ca3af' }}>{s.userCount}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#9ca3af' }}>{s.examCount}</td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 12, fontWeight: 500,
                    background: s.isMigrated ? '#064e3b' : '#451a03',
                    color: s.isMigrated ? '#34d399' : '#fbbf24',
                  }}>
                    {s.isMigrated ? 'own schema' : 'shared'}
                  </span>
                </td>
                <td style={{ padding: '14px 16px', fontSize: 12, color: '#6b7280' }}>
                  {new Date(s.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <Link to={`/schools/${s.id}`}
                    style={{ fontSize: 12, color: '#a78bfa', textDecoration: 'none' }}>
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 13, padding: 32 }}>No schools found.</p>
        )}
      </div>
    </div>
  );
}
