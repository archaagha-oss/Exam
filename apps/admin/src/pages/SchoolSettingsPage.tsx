// apps/admin/src/pages/SchoolSettingsPage.tsx
import { useEffect, useState } from 'react';
import api from '../lib/api';

interface School {
  id: string; name: string; domain: string | null;
  logoUrl: string | null; primaryColour: string;
  address: string | null; contactEmail: string | null; website: string | null;
  defaultDurationMinutes: number; defaultMaxViolations: number;
  defaultPassingScore: number | null; defaultShowResults: boolean;
  allowEssayQuestions: boolean; requireLockdown: boolean;
  gdprDpoName: string | null; gdprDpoEmail: string | null; dataRegion: string;
}

type Tab = 'branding' | 'policy' | 'gdpr';

function Toggle({ value, onChange, label, description }: { value: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <p className="text-sm text-gray-200">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full flex items-center px-1 flex-shrink-0 transition-colors ${value ? 'bg-emerald-500' : 'bg-gray-700'}`}
      >
        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

export default function SchoolSettingsPage() {
  const [school, setSchool] = useState<School | null>(null);
  const [form, setForm] = useState<Partial<School>>({});
  const [tab, setTab] = useState<Tab>('branding');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/school').then(r => {
      setSchool(r.data.data);
      setForm(r.data.data);
    });
  }, []);

  const set = (key: keyof School, value: any) => {
    setForm(f => ({ ...f, [key]: value }));
    setSaved(false);
  };

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await api.put('/admin/school', form);
      setSchool(res.data.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  }

  if (!school) return <div className="p-8 text-gray-500">Loading…</div>;

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'branding', label: 'Branding',       icon: '🎨' },
    { key: 'policy',   label: 'Exam policy',    icon: '📋' },
    { key: 'gdpr',     label: 'GDPR & data',    icon: '🔒' },
  ];

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">School Settings</h1>
        <p className="text-gray-400 text-sm mt-1">{school.name}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-gray-900 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${tab === t.key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <span style={{ fontSize: 14 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div className="card p-6 space-y-5">

        {/* ── BRANDING ── */}
        {tab === 'branding' && (
          <>
            <div>
              <label className="label">School name</label>
              <input className="input" value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className="label">Logo URL</label>
              <input className="input" placeholder="https://your-school.edu/logo.png" value={form.logoUrl ?? ''} onChange={e => set('logoUrl', e.target.value || null)} />
              {form.logoUrl && (
                <img src={form.logoUrl} alt="Logo preview" className="mt-2 h-12 rounded object-contain bg-gray-800 p-1" onError={e => (e.currentTarget.style.display = 'none')} />
              )}
            </div>
            <div>
              <label className="label">Brand colour</label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.primaryColour ?? '#10b981'} onChange={e => set('primaryColour', e.target.value)}
                  className="w-12 h-10 rounded-lg border border-gray-700 bg-transparent cursor-pointer p-1" />
                <input className="input flex-1 font-mono" value={form.primaryColour ?? ''} onChange={e => set('primaryColour', e.target.value)} placeholder="#10b981" />
                <div className="w-8 h-8 rounded-lg" style={{ background: form.primaryColour ?? '#10b981' }} />
              </div>
            </div>
            <div>
              <label className="label">Contact email</label>
              <input className="input" type="email" value={form.contactEmail ?? ''} onChange={e => set('contactEmail', e.target.value || null)} />
            </div>
            <div>
              <label className="label">Website</label>
              <input className="input" type="url" placeholder="https://your-school.edu" value={form.website ?? ''} onChange={e => set('website', e.target.value || null)} />
            </div>
            <div>
              <label className="label">Address</label>
              <textarea className="input h-20 resize-none" value={form.address ?? ''} onChange={e => set('address', e.target.value || null)} />
            </div>
          </>
        )}

        {/* ── POLICY ── */}
        {tab === 'policy' && (
          <>
            <div>
              <p className="text-xs text-gray-500 mb-4">
                These defaults are applied when a teacher creates a new exam. Teachers can override them per exam.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Default duration (minutes)</label>
                <input className="input" type="number" min="5" max="480" value={form.defaultDurationMinutes ?? 60} onChange={e => set('defaultDurationMinutes', Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Default max violations</label>
                <input className="input" type="number" min="1" max="20" value={form.defaultMaxViolations ?? 3} onChange={e => set('defaultMaxViolations', Number(e.target.value))} />
              </div>
            </div>
            <div>
              <label className="label">Default passing score (%)</label>
              <input className="input" type="number" min="0" max="100" placeholder="e.g. 60 (leave blank for no threshold)" value={form.defaultPassingScore ?? ''} onChange={e => set('defaultPassingScore', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="space-y-4 pt-2">
              <Toggle value={form.defaultShowResults ?? true} onChange={v => set('defaultShowResults', v)} label="Show results to students by default" description="Students see their score and answers after submitting" />
              <Toggle value={form.allowEssayQuestions ?? true} onChange={v => set('allowEssayQuestions', v)} label="Allow essay questions" description="Teachers can add essay and short-text questions" />
              <Toggle value={form.requireLockdown ?? true} onChange={v => set('requireLockdown', v)} label="Require lockdown browser" description="All exams must use fullscreen lockdown mode" />
            </div>
          </>
        )}

        {/* ── GDPR ── */}
        {tab === 'gdpr' && (
          <>
            <div className="card p-4 border-blue-900 bg-blue-950/20 mb-2">
              <p className="text-sm text-blue-200">
                Under UK GDPR, your school is a Data Controller. SecureExam processes student data on your behalf as a Data Processor.
                Completing these fields ensures your Data Processing Agreement is accurate.
              </p>
            </div>
            <div>
              <label className="label">Data Protection Officer (DPO) name</label>
              <input className="input" value={form.gdprDpoName ?? ''} onChange={e => set('gdprDpoName', e.target.value || null)} placeholder="Jane Smith" />
            </div>
            <div>
              <label className="label">DPO email</label>
              <input className="input" type="email" value={form.gdprDpoEmail ?? ''} onChange={e => set('gdprDpoEmail', e.target.value || null)} placeholder="dpo@your-school.edu" />
            </div>
            <div>
              <label className="label">Data region</label>
              <select className="input" value={form.dataRegion ?? 'UK'} onChange={e => set('dataRegion', e.target.value)}>
                <option value="UK">United Kingdom (UK)</option>
                <option value="EU">European Union (EU)</option>
                <option value="US">United States (US)</option>
                <option value="AU">Australia (AU)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Where student data is stored and processed. Affects your GDPR compliance obligations.
              </p>
            </div>
            <div className="card p-4 border-amber-900 bg-amber-950/10 mt-2">
              <p className="text-xs font-semibold text-amber-400 mb-1">GDPR tools</p>
              <p className="text-xs text-gray-400 mb-3">
                Export or erase a student's personal data in response to a subject access request or right to erasure.
              </p>
              <a href="/gdpr" className="text-xs text-amber-400 hover:text-amber-300">
                Go to GDPR Data Management →
              </a>
            </div>
          </>
        )}
      </div>

      {/* Save bar */}
      <div className="flex items-center gap-3 mt-4">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
        </button>
        {saved && <p className="text-xs text-emerald-400">Changes saved successfully.</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
