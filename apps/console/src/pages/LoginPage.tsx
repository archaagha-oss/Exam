// apps/console/src/pages/LoginPage.tsx
// Cycle 2.0b / D6: customer-side console login. Same form for TEACHER and
// SCHOOL_ADMIN; landing destination is identical (Layout decides what nav
// items the role can see).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { data } = await axios.post('/api/v1/auth/login', { email, password });
      const { accessToken, user } = data.data;
      if (!['TEACHER', 'SCHOOL_ADMIN', 'PLATFORM_ADMIN'].includes(user.role)) {
        setError('This portal is for school staff only.'); return;
      }
      setAuth(accessToken, user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-xl">🔒</div>
          <h1 className="text-2xl font-bold tracking-tight">Secure<span className="text-emerald-400">Exam</span></h1>
        </div>
        <div className="card p-8">
          <h2 className="text-lg font-semibold mb-1">Console Sign In</h2>
          <p className="text-sm text-gray-400 mb-6">Teachers and school admins</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="you@school.edu"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>}
            <button type="submit" className="btn-primary w-full mt-2 py-2.5" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-gray-600 mt-4">SecureExam · Console</p>
      </div>
    </div>
  );
}
