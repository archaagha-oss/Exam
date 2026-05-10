// apps/admin/src/pages/ClassesPage.tsx
import { useEffect, useState } from 'react';
import api from '../../lib/api';

interface ClassEntry { id: string; name: string; _count: { students: number; teachers: number } }

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  function load() {
    api.get('/admin/classes').then(r => { setClasses(r.data.data); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  async function createClass(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true); setError('');
    try {
      await api.post('/admin/classes', { name: newName.trim() });
      setNewName('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed');
    } finally { setCreating(false); }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Classes</h1>
        <p className="text-gray-400 text-sm mt-1">Manage class groups for exam assignments</p>
      </div>

      {/* Create class */}
      <div className="card p-5 mb-6">
        <h3 className="text-sm font-semibold mb-3">Create Class</h3>
        <form onSubmit={createClass} className="flex gap-3">
          <input
            className="input flex-1 max-w-sm"
            placeholder="e.g. Grade 10 — Mathematics"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <button type="submit" disabled={creating || !newName.trim()} className="btn-primary bg-amber-500 hover:bg-amber-400">
            {creating ? 'Creating…' : 'Create Class'}
          </button>
        </form>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>

      {/* Classes table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500">Loading…</div>
        ) : classes.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No classes yet. Create one above.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                <th className="text-left px-5 py-3 font-medium">Class name</th>
                <th className="text-left px-4 py-3 font-medium">Students</th>
                <th className="text-left px-4 py-3 font-medium">Teachers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {classes.map(cls => (
                <tr key={cls.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-4 font-medium text-sm">{cls.name}</td>
                  <td className="px-4 py-4 text-sm text-gray-400">{cls._count.students}</td>
                  <td className="px-4 py-4 text-sm text-gray-400">{cls._count.teachers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 card p-4">
        <p className="text-xs text-gray-500">
          To add students or teachers to a class, use the API endpoint
          <code className="text-amber-400 mx-1">POST /api/v1/admin/classes/:id/members</code>
          with <code className="text-amber-400">userIds</code> and <code className="text-amber-400">memberType</code>.
          Full bulk class assignment UI is in Phase 4.
        </p>
      </div>
    </div>
  );
}
