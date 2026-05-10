// apps/superadmin/src/pages/NewSchoolPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const S = { padding: '32px', maxWidth: 520 } as const;
const inp = { width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '10px 12px', color: '#f9fafb', fontSize: 14, boxSizing: 'border-box' as const };
const lbl = { display: 'block' as const, color: '#9ca3af', fontSize: 12, marginBottom: 6 };

export default function NewSchoolPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', domain: '', adminName: '', adminEmail: '', adminPassword: '', plan: 'trial' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function provision(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/platform/schools', form);
      setResult(data.data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Provisioning failed';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (result) return (
    <div style={S}>
      <div style={{ background: '#064e3b', border: '1px solid #065f46', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <p style={{ color: '#34d399', fontWeight: 600, fontSize: 16, margin: '0 0 8px' }}>✓ School provisioned</p>
        <p style={{ color: '#6ee7b7', fontSize: 13, margin: 0 }}>{result.school.name}</p>
        <p style={{ color: '#6ee7b7', fontSize: 13, margin: '4px 0 0' }}>Admin: {result.admin.email}</p>
      </div>
      <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 8px' }}>School ID</p>
        <p style={{ color: '#f9fafb', fontFamily: 'monospace', fontSize: 13, margin: 0 }}>{result.school.id}</p>
      </div>
      <div style={{ background: '#1c1917', border: '1px solid #292524', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 8px' }}>Next step — migrate to own schema (optional, run when ready)</p>
        <code style={{ color: '#fbbf24', fontSize: 12, fontFamily: 'monospace' }}>{result.nextStep}</code>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => navigate(`/schools/${result.school.id}`)}
          style={{ background: '#7c3aed', border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          View school →
        </button>
        <button onClick={() => { setResult(null); setForm({ name: '', domain: '', adminName: '', adminEmail: '', adminPassword: '', plan: 'trial' }); }}
          style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '10px 20px', color: '#9ca3af', fontSize: 13, cursor: 'pointer' }}>
          Provision another
        </button>
      </div>
    </div>
  );

  return (
    <div style={S}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Provision school</h1>
        <p style={{ color: '#6b7280', fontSize: 14, margin: '4px 0 0' }}>Creates a new school and its first admin account</p>
      </div>

      <form onSubmit={provision} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20 }}>
          <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>School details</p>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>School name *</label>
            <input style={inp} required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Springfield Academy" />
          </div>
          <div style={{ marginBottom: 4 }}>
            <label style={lbl}>Domain (optional)</label>
            <input style={inp} value={form.domain} onChange={e => set('domain', e.target.value)} placeholder="springfield.edu" />
          </div>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20 }}>
          <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>First admin account</p>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Admin name *</label>
            <input style={inp} required value={form.adminName} onChange={e => set('adminName', e.target.value)} placeholder="Jane Smith" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Admin email *</label>
            <input style={inp} type="email" required value={form.adminEmail} onChange={e => set('adminEmail', e.target.value)} placeholder="admin@springfield.edu" />
          </div>
          <div style={{ marginBottom: 4 }}>
            <label style={lbl}>Temporary password *</label>
            <input style={inp} type="text" required minLength={8} value={form.adminPassword} onChange={e => set('adminPassword', e.target.value)} placeholder="Min. 8 characters" />
            <p style={{ color: '#4b5563', fontSize: 11, margin: '6px 0 0' }}>Share securely with the admin. They should change it on first login.</p>
          </div>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20 }}>
          <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan</p>
          {['trial', 'standard', 'enterprise'].map(plan => (
            <label key={plan} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
              <input type="radio" name="plan" value={plan} checked={form.plan === plan} onChange={() => set('plan', plan)} />
              <span style={{ color: '#f9fafb', fontSize: 13, textTransform: 'capitalize' }}>{plan}</span>
              <span style={{ color: '#4b5563', fontSize: 12 }}>
                {plan === 'trial' ? '— 30 days, 100 students' : plan === 'standard' ? '— unlimited, shared DB' : '— unlimited, own schema'}
              </span>
            </label>
          ))}
        </div>

        {error && <p style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>{error}</p>}

        <button type="submit" disabled={saving}
          style={{ background: '#7c3aed', border: 'none', borderRadius: 8, padding: '12px', color: 'white', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Provisioning…' : 'Provision school'}
        </button>
      </form>
    </div>
  );
}
