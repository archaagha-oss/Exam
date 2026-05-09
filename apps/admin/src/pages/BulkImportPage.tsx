// apps/admin/src/pages/BulkImportPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const CSV_TEMPLATE = `name,email,role,password
Jane Smith,jane@school.edu,STUDENT,
Bob Jones,bob@school.edu,TEACHER,`;

interface ImportResult { created: number; skipped: number; errors: string[] }

export default function BulkImportPage() {
  const navigate = useNavigate();
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  function parseCSV(text: string) {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim());
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
    });
  }

  async function handleImport() {
    setError(''); setResult(null);
    const rows = parseCSV(csvText);
    if (rows.length === 0) { setError('No valid rows found. Check your CSV format.'); return; }

    const users = rows.map(r => ({
      name: r.name,
      email: r.email,
      role: (r.role || 'STUDENT').toUpperCase(),
      password: r.password || undefined,
    })).filter(u => u.name && u.email);

    if (users.length === 0) { setError('No valid users found. Ensure name and email columns are present.'); return; }

    setImporting(true);
    try {
      const { data } = await api.post('/admin/users/bulk-import', { users });
      setResult(data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Import failed');
    } finally { setImporting(false); }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvText((ev.target?.result as string) || '');
    reader.readAsText(file);
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate('/users')} className="text-gray-500 hover:text-gray-300 text-sm">← Back</button>
        <div>
          <h1 className="text-2xl font-bold">Bulk Import Users</h1>
          <p className="text-gray-400 text-sm mt-1">Import up to 500 students or teachers from CSV</p>
        </div>
      </div>

      {/* Template download */}
      <div className="card p-5 mb-6">
        <h3 className="text-sm font-semibold mb-2">CSV Format</h3>
        <p className="text-xs text-gray-500 mb-3">Required columns: <code className="text-emerald-400">name</code>, <code className="text-emerald-400">email</code>, <code className="text-emerald-400">role</code> (STUDENT or TEACHER). Password is optional — users created without one will receive the school default password.</p>
        <pre className="bg-gray-800 rounded-lg px-4 py-3 text-xs text-gray-300 font-mono overflow-x-auto">{CSV_TEMPLATE}</pre>
        <button
          onClick={() => {
            const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'import_template.csv'; a.click();
          }}
          className="mt-3 text-xs text-amber-400 hover:text-amber-300"
        >
          ↓ Download template
        </button>
      </div>

      {/* Upload */}
      <div className="space-y-4">
        <div>
          <label className="label">Upload CSV file</label>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} className="input py-2 cursor-pointer" />
        </div>

        <div>
          <label className="label">Or paste CSV directly</label>
          <textarea
            className="input h-40 font-mono text-xs resize-none"
            placeholder={CSV_TEMPLATE}
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
          />
        </div>

        {error && <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>}

        {result && (
          <div className="card p-5 space-y-2">
            <h3 className="font-semibold text-sm mb-3">Import complete</h3>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-emerald-400">{result.created}</span>
              <span className="text-sm text-gray-400">users created</span>
            </div>
            {result.skipped > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-amber-400">{result.skipped}</span>
                <span className="text-sm text-gray-400">skipped (email already exists)</span>
              </div>
            )}
            {result.errors.length > 0 && (
              <div>
                <p className="text-sm text-red-400 mb-1">{result.errors.length} errors:</p>
                <ul className="text-xs text-red-300 space-y-0.5">
                  {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={!csvText.trim() || importing}
          className="btn-primary bg-amber-500 hover:bg-amber-400 w-full py-3"
        >
          {importing ? 'Importing…' : `Import Users`}
        </button>
      </div>
    </div>
  );
}
