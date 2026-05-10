// apps/admin/src/pages/SENPage.tsx
import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';

interface Student { id: string; name: string; email: string }
interface Arrangement {
  id: string;
  studentId: string;
  extraTimePercent: number;
  textToSpeech: boolean;
  fontSizeOverride: number | null;
  restBreaksAllowed: boolean;
  restBreakMinutes: number;
  focusMode: boolean;
  highContrastForced: boolean;
  notes: string | null;
  updatedAt: string;
  student: { id: string; name: string; email: string };
  configuredBy: { id: string; name: string };
}

const EXTRA_TIME_OPTIONS = [
  { value: 0,  label: 'None' },
  { value: 25, label: '25% extra (JCQ standard)' },
  { value: 50, label: '50% extra (JCQ enhanced)' },
  { value: 100,label: '100% extra (double time)' },
];

function ArrangementModal({
  student,
  existing,
  onSave,
  onClose,
}: {
  student: Student;
  existing: Arrangement | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    extraTimePercent:   existing?.extraTimePercent   ?? 0,
    textToSpeech:       existing?.textToSpeech       ?? false,
    fontSizeOverride:   existing?.fontSizeOverride   ?? null as number | null,
    restBreaksAllowed:  existing?.restBreaksAllowed  ?? false,
    restBreakMinutes:   existing?.restBreakMinutes   ?? 10,
    focusMode:          existing?.focusMode          ?? false,
    highContrastForced: existing?.highContrastForced ?? false,
    notes:              existing?.notes              ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));

  async function save() {
    setSaving(true); setError('');
    try {
      await api.put(`/sen/arrangements/${student.id}`, {
        ...form,
        fontSizeOverride: form.fontSizeOverride || null,
      });
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!confirm(`Remove all access arrangements for ${student.name}?`)) return;
    await api.delete(`/sen/arrangements/${student.id}`);
    onSave();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="font-semibold">Access Arrangements</h2>
            <p className="text-xs text-gray-400 mt-0.5">{student.name} · {student.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Extra time */}
          <div>
            <label className="label">Extra time allowance</label>
            <select className="input" value={form.extraTimePercent} onChange={e => set('extraTimePercent', Number(e.target.value))}>
              {EXTRA_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {form.extraTimePercent > 0 && (
              <p className="text-xs text-amber-400 mt-1">
                Applied automatically to every exam this student sits.
              </p>
            )}
          </div>

          {/* Text to speech */}
          <div>
            <label className="label mb-1">Read aloud / text-to-speech</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => set('textToSpeech', !form.textToSpeech)}
                className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 ${form.textToSpeech ? 'bg-emerald-500' : 'bg-gray-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${form.textToSpeech ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-300">
                {form.textToSpeech ? 'Enabled — TTS button shown in exam' : 'Disabled'}
              </span>
            </div>
          </div>

          {/* Font size override */}
          <div>
            <label className="label">Font size override (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range" min="14" max="28" step="2"
                value={form.fontSizeOverride ?? 16}
                onChange={e => set('fontSizeOverride', Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm font-mono w-12 text-center text-gray-300">
                {form.fontSizeOverride ?? '—'}px
              </span>
              <button
                onClick={() => set('fontSizeOverride', null)}
                className="text-xs text-gray-500 hover:text-gray-300"
                title="Clear override (use student's own preference)"
              >
                Clear
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Overrides the student's own font preference for every exam.
            </p>
          </div>

          {/* Rest breaks */}
          <div>
            <label className="label mb-1">Rest breaks</label>
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => set('restBreaksAllowed', !form.restBreaksAllowed)}
                className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 ${form.restBreaksAllowed ? 'bg-emerald-500' : 'bg-gray-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${form.restBreaksAllowed ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-300">Allow rest breaks during exam</span>
            </div>
            {form.restBreaksAllowed && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-400">Total break time allowed:</label>
                <input
                  type="number" min="5" max="60" step="5"
                  value={form.restBreakMinutes}
                  onChange={e => set('restBreakMinutes', Number(e.target.value))}
                  className="input w-20"
                />
                <span className="text-xs text-gray-400">minutes</span>
              </div>
            )}
          </div>

          {/* Focus mode */}
          <div>
            <label className="label mb-1">Focus mode</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => set('focusMode', !form.focusMode)}
                className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 ${form.focusMode ? 'bg-emerald-500' : 'bg-gray-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${form.focusMode ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-300">
                One question at a time — hides navigation bar
              </span>
            </div>
          </div>

          {/* High contrast */}
          <div>
            <label className="label mb-1">High contrast (forced)</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => set('highContrastForced', !form.highContrastForced)}
                className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 ${form.highContrastForced ? 'bg-emerald-500' : 'bg-gray-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${form.highContrastForced ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-300">Force high contrast on (cannot be turned off by student)</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">SENCO notes (internal — not shown to student)</label>
            <textarea
              className="input h-20 resize-none"
              placeholder="e.g. EHCP reference, specific requirements, invigilator instructions…"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-gray-800">
          {existing && (
            <button onClick={remove} className="text-xs text-red-500 hover:text-red-400">
              Remove all arrangements
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary bg-amber-500 hover:bg-amber-400">
              {saving ? 'Saving…' : 'Save Arrangements'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SENPage() {
  const [arrangements, setArrangements] = useState<Arrangement[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ student: Student; existing: Arrangement | null } | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    Promise.all([
      api.get('/sen/arrangements'),
      api.get('/admin/users?role=STUDENT&pageSize=500'),
    ]).then(([arrRes, usersRes]) => {
      setArrangements(arrRes.data.data);
      setAllStudents(usersRes.data.data);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const arranged = new Set(arrangements.map(a => a.studentId));
  const filteredStudents = allStudents.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  const studsWithArrangements = filteredStudents.filter(s => arranged.has(s.id));
  const studsWithout = filteredStudents.filter(s => !arranged.has(s.id));

  function openModal(student: Student) {
    const existing = arrangements.find(a => a.studentId === student.id) ?? null;
    setModal({ student, existing });
  }

  function badge(arr: Arrangement) {
    const parts = [];
    if (arr.extraTimePercent) parts.push(`+${arr.extraTimePercent}%`);
    if (arr.textToSpeech) parts.push('TTS');
    if (arr.restBreaksAllowed) parts.push('Breaks');
    if (arr.focusMode) parts.push('Focus');
    if (arr.highContrastForced) parts.push('Contrast');
    return parts;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">SEN Access Arrangements</h1>
        <p className="text-gray-400 text-sm mt-1">
          Configure JCQ access arrangements for students with special educational needs.
          Arrangements apply automatically to every exam the student sits.
        </p>
      </div>

      <div className="card p-4 mb-6 border-blue-900 bg-blue-950/20">
        <p className="text-sm text-blue-200">
          <strong className="text-blue-300">Legal note:</strong> Under the UK Equality Act 2010,
          schools must make reasonable adjustments for disabled students.
          Access arrangements should be based on an EHCP or formal assessment by a qualified professional.
          These settings create an audit trail — all changes are logged.
        </p>
      </div>

      <input
        className="input max-w-sm mb-5"
        placeholder="Search students…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="text-center py-10 text-gray-500">Loading…</div>
      ) : (
        <>
          {/* Students WITH arrangements */}
          {studsWithArrangements.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">
                Students with arrangements ({studsWithArrangements.length})
              </h3>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-800">
                      <th className="text-left px-5 py-3 font-medium">Student</th>
                      <th className="text-left px-4 py-3 font-medium">Arrangements</th>
                      <th className="text-left px-4 py-3 font-medium">Configured by</th>
                      <th className="text-left px-4 py-3 font-medium">Updated</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {studsWithArrangements.map(s => {
                      const arr = arrangements.find(a => a.studentId === s.id)!;
                      return (
                        <tr key={s.id} className="hover:bg-gray-800/30 transition-colors">
                          <td className="px-5 py-3">
                            <p className="text-sm font-medium">{s.name}</p>
                            <p className="text-xs text-gray-500">{s.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {badge(arr).map(b => (
                                <span key={b} className="text-xs bg-amber-950 text-amber-400 border border-amber-900 px-2 py-0.5 rounded-full">
                                  {b}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">{arr.configuredBy.name}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {new Date(arr.updatedAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => openModal(s)} className="text-xs text-amber-400 hover:text-amber-300">
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Students WITHOUT arrangements */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">
              Other students ({studsWithout.length})
            </h3>
            <div className="card overflow-hidden">
              {studsWithout.length === 0 ? (
                <p className="p-6 text-sm text-gray-500 text-center">All students have arrangements configured.</p>
              ) : (
                <table className="w-full">
                  <tbody className="divide-y divide-gray-800">
                    {studsWithout.slice(0, 20).map(s => (
                      <tr key={s.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium">{s.name}</p>
                          <p className="text-xs text-gray-500">{s.email}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 italic">No arrangements</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openModal(s)}
                            className="text-xs text-gray-400 hover:text-amber-400 hover:border-amber-900 border border-gray-700 px-2 py-0.5 rounded transition-colors"
                          >
                            + Add arrangement
                          </button>
                        </td>
                      </tr>
                    ))}
                    {studsWithout.length > 20 && (
                      <tr>
                        <td colSpan={3} className="px-5 py-3 text-xs text-gray-600 text-center">
                          …and {studsWithout.length - 20} more. Use search to find specific students.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {modal && (
        <ArrangementModal
          student={modal.student}
          existing={modal.existing}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
