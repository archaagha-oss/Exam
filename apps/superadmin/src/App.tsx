// apps/superadmin/src/App.tsx
import { Routes, Route, Navigate, Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import api from './lib/api';

import OverviewPage from './pages/OverviewPage';
import SchoolsPage from './pages/SchoolsPage';
import SchoolDetailPage from './pages/SchoolDetailPage';
import MigrationPage from './pages/MigrationPage';
import NewSchoolPage from './pages/NewSchoolPage';

// ── Login ─────────────────────────────────────────────────

function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const user = data?.data?.user;
      const token = data?.data?.accessToken;
      if (user?.role !== 'SUPER_ADMIN') {
        setError('Super admin access required.');
        return;
      }
      setAuth(token, user);
      navigate('/');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
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
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
              style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '10px 12px', color: '#f9fafb', fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
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

// ── Layout ────────────────────────────────────────────────

const NAV = [
  { to: '/',          label: 'Overview',   icon: '📊', end: true  },
  { to: '/schools',   label: 'Schools',    icon: '🏫', end: false },
  { to: '/migration', label: 'Migration',  icon: '🔄', end: false },
];

function Layout() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();

  async function signOut() {
    try {
      await api.post('/auth/logout');
    } catch {
      // best-effort — clear locally regardless
    }
    clearAuth();
    navigate('/login');
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#030712', color: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
      <aside style={{ width: 220, flexShrink: 0, background: '#0d1117', borderRight: '1px solid #1f2937', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #1f2937' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🛡</div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Secure<span style={{ color: '#7c3aed' }}>Exam</span></span>
          </div>
          <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>Platform admin</p>
        </div>

        <nav style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((item) => (
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
          <button onClick={signOut}
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

// ── Root ──────────────────────────────────────────────────

export default function App() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [restoring, setRestoring] = useState(true);

  // On first load, attempt a silent refresh against the httpOnly cookie. If
  // it succeeds, we're back in. If it fails, the user lands on /login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post('/auth/refresh');
        const token = data?.data?.accessToken;
        const user = data?.data?.user;
        if (!cancelled && token && user && user.role === 'SUPER_ADMIN') {
          setAuth(token, user);
        } else if (!cancelled) {
          clearAuth();
        }
      } catch {
        if (!cancelled) clearAuth();
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (restoring) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#030712', color: '#6b7280', fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
        Restoring session…
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={accessToken ? <Layout /> : <Navigate to="/login" replace />}>
        <Route index element={<OverviewPage />} />
        <Route path="schools" element={<SchoolsPage />} />
        <Route path="schools/new" element={<NewSchoolPage />} />
        <Route path="schools/:id" element={<SchoolDetailPage />} />
        <Route path="migration" element={<MigrationPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
