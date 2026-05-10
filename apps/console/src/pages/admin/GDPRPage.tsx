// apps/admin/src/pages/GDPRPage.tsx
import { useState } from 'react';
import api from '../../lib/api';

interface SearchResult {
  id: string; name: string; email: string; role: string;
  createdAt: string; lastLoginAt: string | null; isActive: boolean;
}

export default function GDPRPage() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [action, setAction] = useState<'export' | 'erase' | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function searchUsers() {
    if (!search.trim()) return;
    setSearching(true);
    const res = await api.get(`/admin/users?search=${encodeURIComponent(search)}&pageSize=10`);
    setResults(res.data.data);
    setSearching(false);
  }

  async function exportUser() {
    if (!selected) return;
    setProcessing(true); setError('');
    try {
      const res = await api.get(`/admin/gdpr/export/${selected.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gdpr-export-${selected.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(`Data export for ${selected.name} downloaded.`);
      setAction(null);
    } catch {
      setError('Export failed. Please try again.');
    } finally { setProcessing(false); }
  }

  async function eraseUser() {
    if (!selected) return;
    if (confirmEmail.toLowerCase() !== selected.email.toLowerCase()) {
      setError('Email does not match — please type the user\'s email exactly to confirm erasure.');
      return;
    }
    setProcessing(true); setError('');
    try {
      await api.delete(`/admin/gdpr/erase/${selected.id}`, { data: { confirmEmail } });
      setDone(`${selected.name}'s personal data has been erased and their account anonymised.`);
      setSelected(null);
      setAction(null);
      setResults(prev => prev.filter(r => r.id !== selected.id));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erasure failed.');
    } finally { setProcessing(false); }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">GDPR Data Management</h1>
        <p className="text-gray-400 text-sm mt-1">
          Subject access requests · Right to erasure · Audit trail
        </p>
      </div>

      <div className="card p-4 border-blue-900 bg-blue-950/20 mb-6">
        <p className="text-sm text-blue-200">
          <strong className="text-blue-300">Legal note:</strong> Subject access requests must be fulfilled within 30 days under UK GDPR.
          Erasure requests should only be actioned after verifying the identity of the person making the request.
          All actions here are logged to the audit trail.
        </p>
      </div>

      {/* Success message */}
      {done && (
        <div className="card p-4 border-emerald-900 bg-emerald-950/20 mb-6 flex items-start gap-3">
          <span className="text-emerald-400 text-lg flex-shrink-0">✓</span>
          <p className="text-sm text-emerald-200">{done}</p>
          <button onClick={() => setDone(null)} className="ml-auto text-gray-500 hover:text-white text-sm">Dismiss</button>
        </div>
      )}

      {/* Search */}
      <div className="card p-5 mb-4">
        <label className="label">Find a data subject</label>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchUsers()}
          />
          <button onClick={searchUsers} disabled={searching} className="btn-primary flex-shrink-0">
            {searching ? '…' : 'Search'}
          </button>
        </div>

        {results.length > 0 && (
          <div className="mt-3 space-y-1">
            {results.map(r => (
              <button
                key={r.id}
                onClick={() => { setSelected(r); setAction(null); setDone(null); setError(''); setConfirmEmail(''); }}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center justify-between ${selected?.id === r.id ? 'bg-amber-950 border border-amber-800' : 'bg-gray-800 hover:bg-gray-700'}`}
              >
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-gray-400">{r.email} · {r.role}</p>
                </div>
                {!r.isActive && <span className="text-xs text-gray-600 italic">Anonymised</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions for selected user */}
      {selected && (
        <div className="card p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold">{selected.name}</h3>
              <p className="text-xs text-gray-400">{selected.email}</p>
              <p className="text-xs text-gray-500 mt-1">
                Joined {new Date(selected.createdAt).toLocaleDateString()} ·
                Last login {selected.lastLoginAt ? new Date(selected.lastLoginAt).toLocaleDateString() : 'never'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Export */}
            <div
              onClick={() => setAction('export')}
              className={`cursor-pointer rounded-xl p-4 border transition-colors ${action === 'export' ? 'border-blue-600 bg-blue-950' : 'border-gray-700 hover:border-blue-800 bg-gray-800'}`}
            >
              <p className="text-sm font-semibold text-blue-400 mb-1">Subject Access Request</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Download a complete JSON export of all personal data held for this user — exam sessions, answers, violations, SEN profile.
              </p>
            </div>

            {/* Erase */}
            <div
              onClick={() => setAction('erase')}
              className={`cursor-pointer rounded-xl p-4 border transition-colors ${action === 'erase' ? 'border-red-700 bg-red-950/30' : 'border-gray-700 hover:border-red-900 bg-gray-800'}`}
            >
              <p className="text-sm font-semibold text-red-400 mb-1">Right to Erasure</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Anonymise this user's personal data. The account is anonymised (not deleted) to preserve exam integrity and audit records.
              </p>
            </div>
          </div>

          {/* Export confirm */}
          {action === 'export' && (
            <div className="bg-blue-950/30 border border-blue-900 rounded-lg p-4">
              <p className="text-sm text-blue-200 mb-3">
                This will download a JSON file containing all personal data for <strong>{selected.name}</strong>.
                Treat this file as sensitive — share only with the data subject or their authorised representative.
              </p>
              {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
              <button onClick={exportUser} disabled={processing} className="btn-primary bg-blue-600 hover:bg-blue-500">
                {processing ? 'Generating export…' : 'Download data export'}
              </button>
            </div>
          )}

          {/* Erase confirm */}
          {action === 'erase' && (
            <div className="bg-red-950/30 border border-red-900 rounded-lg p-4">
              <p className="text-sm text-red-200 mb-1">
                This will anonymise all personal data for <strong>{selected.name}</strong>.
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Their email, name, and answers will be replaced with anonymised values.
                Exam scores, violation counts, and session metadata are retained for reporting integrity.
                This action is irreversible.
              </p>
              <label className="label text-xs">Type the user's email address to confirm:</label>
              <input
                className="input mb-3"
                placeholder={selected.email}
                value={confirmEmail}
                onChange={e => { setConfirmEmail(e.target.value); setError(''); }}
              />
              {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
              <button
                onClick={eraseUser}
                disabled={processing || !confirmEmail}
                className="btn-danger w-full"
              >
                {processing ? 'Processing erasure…' : 'Permanently erase personal data'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
