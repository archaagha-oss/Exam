// apps/admin/src/pages/UsersPage.tsx
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';

interface User { id: string; name: string; email: string; role: string; isActive: boolean; createdAt: string }

const ROLES = ['STUDENT', 'TEACHER', 'SCHOOL_ADMIN'];
const ROLE_COLORS: Record<string, string> = {
  STUDENT: 'text-blue-400 bg-blue-950',
  TEACHER: 'text-emerald-400 bg-emerald-950',
  SCHOOL_ADMIN: 'text-amber-400 bg-amber-950',
  PLATFORM_ADMIN: 'text-red-400 bg-red-950',
};

function UserModal({ user, onClose, onSave }: {
  user: Partial<User> | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const isEdit = !!user?.id;
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState(user?.role ?? 'STUDENT');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!name || !email) { setError('Name and email are required'); return; }
    if (!isEdit && !password) { setError('Password is required for new users'); return; }
    setSaving(true); setError('');
    try {
      if (isEdit) {
        await api.put(`/admin/users/${user!.id}`, { name, role, isActive });
      } else {
        await api.post('/admin/users', { name, email, password, role });
      }
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  }

  async function resetPassword() {
    if (!resetUserId || newPassword.length < 8) return;
    setResetting(true);
    try {
      await api.post(`/admin/users/${resetUserId}/reset-password`, { newPassword });
      setResetUserId(null);
      setNewPassword('');
      alert('Password reset successfully.');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Reset failed');
    } finally { setResetting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="font-semibold">{isEdit ? 'Edit User' : 'New User'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
          </div>
          {!isEdit && (
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@school.edu" />
            </div>
          )}
          {!isEdit && (
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" />
            </div>
          )}
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          {isEdit && (
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setIsActive(!isActive)}
                className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 ${isActive ? 'bg-emerald-500' : 'bg-gray-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm text-gray-300">Account active</span>
            </label>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-gray-800">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary bg-amber-500 hover:bg-amber-400">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<Partial<User> | null | 'new'>(null);
  const PAGE_SIZE = 25;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set('search', search);
    if (filterRole) params.set('role', filterRole);
    api.get(`/admin/users?${params}`).then(r => {
      setUsers(r.data.data);
      setTotal(r.data.total);
      setLoading(false);
    });
  }, [search, filterRole, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, filterRole]);

  async function deleteUser(u: User) {
    if (!confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    await api.delete(`/admin/users/${u.id}`);
    load();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-gray-400 text-sm mt-1">{total} total users</p>
        </div>
        <div className="flex gap-3">
          <Link to="/admin/users/import" className="btn-ghost text-sm">📥 Bulk Import</Link>
          <button onClick={() => setModal('new')} className="btn-primary bg-amber-500 hover:bg-amber-400">+ New User</button>
        </div>
      </div>

      <div className="flex gap-3 mb-5">
        <input
          className="input max-w-xs"
          placeholder="Search name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input max-w-[160px]" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500">Loading…</div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No users found.</div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left px-5 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {users.map(u => (
                  <tr key={u.id} className={`hover:bg-gray-800/30 transition-colors ${!u.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3 font-medium text-sm">{u.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role] ?? ''}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${u.isActive ? 'text-emerald-400' : 'text-gray-600'}`}>
                        {u.isActive ? '● Active' : '○ Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 justify-end">
                        <button onClick={() => setModal(u)} className="text-xs text-gray-400 hover:text-white">Edit</button>
                        <button onClick={() => deleteUser(u)} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800 text-sm">
                <span className="text-gray-500">Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost py-1 px-3 text-xs disabled:opacity-30">← Prev</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-ghost py-1 px-3 text-xs disabled:opacity-30">Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {modal !== null && (
        <UserModal
          user={modal === 'new' ? null : modal}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
