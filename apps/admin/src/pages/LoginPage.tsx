// apps/admin/src/pages/LoginPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
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
      if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
        setError('This portal is for administrators only.'); return;
      }
      setAuth(accessToken, user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center text-xl">🛡</div>
          <h1 className="text-2xl font-bold tracking-tight">Secure<span className="text-amber-400">Exam</span></h1>
        </div>
        <div className="card p-8">
          <h2 className="text-lg font-semibold mb-1">Admin Sign In</h2>
          <p className="text-sm text-gray-400 mb-6">School administration access</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="admin@school.edu" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {error && <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>}
            <button type="submit" className="btn-primary w-full py-2.5 bg-amber-500 hover:bg-amber-400" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-gray-600 mt-4">SecureExam · Admin Portal</p>
      </div>
    </div>
  );
}
