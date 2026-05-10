// apps/console/src/components/ProctorsPanel.tsx
import { useEffect, useState } from 'react';
import api from '../lib/api';

interface Proctor {
  id: string;
  teacherId: string;
  invitedAt: string;
  teacher: { id: string; name: string; email: string };
  inviter: { id: string; name: string };
}

interface Props {
  examId: string;
  isOwner: boolean;
}

export default function ProctorsPanel({ examId, isOwner }: Props) {
  const [proctors, setProctors] = useState<Proctor[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { load(); }, [examId]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get(`/proctors/exams/${examId}`);
      setProctors(data.data);
    } finally {
      setLoading(false);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/proctors/exams/${examId}`, { email: email.trim() });
      setSuccess(`Invited ${email}`);
      setEmail('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to invite co-proctor');
    } finally {
      setInviting(false);
    }
  }

  async function remove(teacherId: string, name: string) {
    if (!confirm(`Remove ${name} as co-proctor?`)) return;
    await api.delete(`/proctors/exams/${examId}/${teacherId}`);
    setProctors(prev => prev.filter(p => p.teacherId !== teacherId));
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Co-proctors</h3>
        <p className="text-xs text-gray-500">
          Co-proctors can view the live monitor and results, but cannot edit the exam or generate PINs.
        </p>
      </div>

      {/* Current proctors list */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : proctors.length === 0 ? (
        <div className="card p-4 text-center text-sm text-gray-500">
          No co-proctors yet.
        </div>
      ) : (
        <div className="space-y-2">
          {proctors.map(p => (
            <div key={p.id} className="card p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-900 flex items-center justify-center text-xs font-bold text-purple-300">
                  {p.teacher.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-medium">{p.teacher.name}</p>
                  <p className="text-xs text-gray-500">{p.teacher.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-600">
                  Added {new Date(p.invitedAt).toLocaleDateString()}
                </span>
                {isOwner && (
                  <button
                    onClick={() => remove(p.teacherId, p.teacher.name)}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invite form — owner only */}
      {isOwner && (
        <form onSubmit={invite} className="space-y-2">
          <label className="label">Invite by email (must be a teacher in your school)</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              type="email"
              placeholder="colleague@school.edu"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <button
              type="submit"
              disabled={inviting || !email.trim()}
              className="btn-primary flex-shrink-0"
            >
              {inviting ? 'Inviting…' : 'Invite'}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          {success && <p className="text-emerald-400 text-xs">✓ {success}</p>}
        </form>
      )}
    </div>
  );
}
