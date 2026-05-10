// apps/console/src/pages/MagicLinksPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';

interface Invite {
  id: string;
  student: { id: string; name: string; email: string };
  magicLink: string;
  status: 'active' | 'used' | 'expired';
  usedAt: string | null;
  expiresAt: string;
}

interface ClassEntry { id: string; name: string; students: { id: string; name: string; email: string }[] }

export default function MagicLinksPage() {
  const { id: examId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedClass, setSelectedClass] = useState('');
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date(Date.now() + 7 * 86400000);
    return d.toISOString().slice(0, 16);
  });
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/security/exams/${examId}/invites`),
      api.get('/classes'),
    ]).then(([invRes, clsRes]) => {
      setInvites(invRes.data.data);
      setClasses(clsRes.data.data ?? []);
      setLoading(false);
    });
  }, [examId]);

  async function generateForClass() {
    if (!selectedClass) return;
    const cls = classes.find(c => c.id === selectedClass);
    if (!cls?.students?.length) { setError('No students in this class'); return; }
    setGenerating(true); setError('');
    try {
      const res = await api.post(`/security/exams/${examId}/invites/generate`, {
        studentIds: cls.students.map(s => s.id),
        expiresAt: new Date(expiresAt).toISOString(),
      });
      // Reload invites
      const fresh = await api.get(`/security/exams/${examId}/invites`);
      setInvites(fresh.data.data);
      alert(`Generated ${res.data.data.generated} magic links and sent emails.`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Generation failed');
    } finally { setGenerating(false); }
  }

  async function resendAll() {
    setSending(true);
    try {
      const res = await api.post(`/security/exams/${examId}/invites/send-all`);
      alert(`Resent emails to ${res.data.data.sent} students.`);
    } catch { alert('Failed to resend emails'); }
    finally { setSending(false); }
  }

  function copyLink(link: string, id: string) {
    navigator.clipboard.writeText(link);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  const active  = invites.filter(i => i.status === 'active');
  const used    = invites.filter(i => i.status === 'used');
  const expired = invites.filter(i => i.status === 'expired');

  const statusColor = (s: string) => s === 'active' ? 'text-emerald-400' : s === 'used' ? 'text-blue-400' : 'text-gray-500';
  const statusBg    = (s: string) => s === 'active' ? 'bg-emerald-950' : s === 'used' ? 'bg-blue-950' : 'bg-gray-800';

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-300 text-sm">← Back</button>
        <div>
          <h1 className="text-2xl font-bold">Magic links</h1>
          <p className="text-gray-400 text-sm mt-0.5">Single-use, per-student exam access links</p>
        </div>
      </div>

      {/* How it works */}
      <div className="card p-4 border-blue-900 bg-blue-950/20 mb-6">
        <p className="text-sm text-blue-200">
          Each student gets a unique link sent to their email. The link works once — once clicked,
          it cannot be shared or reused. Students connecting from outside your IP allowlist will be blocked
          at the link stage before they even reach the exam.
        </p>
      </div>

      {/* Generate section */}
      <div className="card p-5 mb-6">
        <h3 className="font-semibold text-sm mb-4">Generate links for a class</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label text-xs">Class</label>
            <select className="input" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
              <option value="">— Select class —</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Link expiry</label>
            <input
              type="datetime-local" className="input"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <div className="flex items-center gap-3">
          <button onClick={generateForClass} disabled={generating || !selectedClass} className="btn-primary">
            {generating ? 'Generating…' : 'Generate & email links'}
          </button>
          {invites.length > 0 && (
            <button onClick={resendAll} disabled={sending} className="btn-ghost text-sm">
              {sending ? 'Sending…' : `Resend all active (${active.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {invites.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Active', count: active.length, color: 'text-emerald-400' },
            { label: 'Used', count: used.length, color: 'text-blue-400' },
            { label: 'Expired', count: expired.length, color: 'text-gray-500' },
          ].map(s => (
            <div key={s.label} className="card p-4 text-center">
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.count}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Invite list */}
      {loading ? (
        <div className="text-gray-500 text-sm">Loading…</div>
      ) : invites.length === 0 ? (
        <div className="card p-8 text-center text-gray-500 text-sm">
          No magic links generated yet. Select a class above to generate links.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                <th className="text-left px-5 py-3 font-medium">Student</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {invites.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-800/20">
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium">{inv.student.name}</p>
                    <p className="text-xs text-gray-500">{inv.student.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(inv.status)} ${statusBg(inv.status)}`}>
                      {inv.status}
                      {inv.status === 'used' && inv.usedAt && ` · ${new Date(inv.usedAt).toLocaleTimeString()}`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {inv.status === 'active' && (
                      <button
                        onClick={() => copyLink(inv.magicLink, inv.id)}
                        className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-2 py-1 rounded transition-colors"
                      >
                        {copied === inv.id ? '✓ Copied' : 'Copy link'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
