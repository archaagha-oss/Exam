// apps/superadmin/src/App.tsx
import { Routes, Route, Navigate, Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';

// ── Auth store (minimal, inline) ──────────────────────────
const AuthCtx = createContext<{ token: string | null; setToken: (t: string | null) => void }>({ token: null, setToken: () => {} });
function useAuth() { return useContext(AuthCtx); }

// ── API client ────────────────────────────────────────────
const BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:4000/api/v1';

async function apiFetch(path: string, opts: RequestInit = {}, token?: string | null) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((opts.headers as any) ?? {}),
    },
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// ── Pages ─────────────────────────────────────────────────

function LoginPage() {
  const { setToken } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (data.data.user.role !== 'SUPER_ADMIN') { setError('Super admin access required.'); return; }
      setToken(data.data.accessToken);
      navigate('/');
    } catch (err: any) {
      setError(err.error ?? 'Login failed');
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#030712' }}>
      <div style={{ width: 360, padding: 40, background: '#111827', borderRadius: 16, border: '1px solid #1f2937' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🛡</div>
          <h1 style={{ color: '#f9fafb', fontSize: 20, fontWeight: 600, margin: 0 }}>Platform Admin</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>SecureExam super admin</p>
        </div>
        <form onSubmit={login}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" required
              style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '10px 12px', color: '#f9fafb', fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" required
              style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '10px 12px', color: '#f9fafb', fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ width: '100%', background: '#7c3aed', border: 'none', borderRadius: 8, padding: '11px', color: 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

import OverviewPage from './pages/OverviewPage';
import SchoolsPage from './pages/SchoolsPage';
import SchoolDetailPage from './pages/SchoolDetailPage';
import MigrationPage from './pages/MigrationPage';
import NewSchoolPage from './pages/NewSchoolPage';

const NAV = [
  { to: '/',          label: 'Overview',   icon: '📊', end: true  },
  { to: '/schools',   label: 'Schools',    icon: '🏫', end: false },
  { to: '/migration', label: 'Migration',  icon: '🔄', end: false },
];

function Layout() {
  const { token, setToken } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#030712', color: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, flexShrink: 0, background: '#0d1117', borderRight: '1px solid #1f2937', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #1f2937' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🛡</div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Secure<span style={{ color: '#7c3aed' }}>Exam</span></span>
          </div>
          <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>Platform admin</p>
        </div>

        <nav style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                textDecoration: 'none', fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
                background: isActive ? '#1e1b4b' : 'transparent',
                color: isActive ? '#a78bfa' : '#9ca3af',
              })}>
              <span style={{ fontSize: 14 }}>{item.icon}</span>{item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: 16, borderTop: '1px solid #1f2937' }}>
          <p style={{ color: '#4b5563', fontSize: 11, margin: '0 0 8px' }}>Super Admin</p>
          <button onClick={() => { setToken(null); navigate('/login'); }}
            style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer', padding: 0 }}>
            Sign out →
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}

// ── Auth provider + routing ───────────────────────────────
export default function App() {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('sa_token'));

  function setToken(t: string | null) {
    setTokenState(t);
    if (t) localStorage.setItem('sa_token', t);
    else localStorage.removeItem('sa_token');
  }

  return (
    <AuthCtx.Provider value={{ token, setToken }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={token ? <Layout /> : <Navigate to="/login" replace />}>
          <Route index element={<OverviewPage token={token} />} />
          <Route path="schools" element={<SchoolsPage token={token} />} />
          <Route path="schools/new" element={<NewSchoolPage token={token} />} />
          <Route path="schools/:id" element={<SchoolDetailPage token={token} />} />
          <Route path="migration" element={<MigrationPage token={token} />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthCtx.Provider>
  );
}

export { apiFetch };
