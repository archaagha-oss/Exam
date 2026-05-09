// apps/teacher/src/pages/PinsPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import ProctorsPanel from '../components/ProctorsPanel';
import { useAuthStore } from '../store/authStore';

interface GeneratedPins { UNLOCK?: string; EXIT?: string }
interface ExistingPin { purpose: string; createdAt: string; expiresAt?: string; usedAt?: string }
interface ExamMeta { id: string; title: string; teacherId: string }

export default function PinsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [existing, setExisting] = useState<ExistingPin[]>([]);
  const [generated, setGeneratedPins] = useState<GeneratedPins | null>(null);
  const [loading, setLoading] = useState(false);
  const [exam, setExam] = useState<ExamMeta | null>(null);
  const [deliverTo, setDeliverTo] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [activeTab, setActiveTab] = useState<'pins' | 'proctors'>('pins');

  useEffect(() => {
    api.get(`/exams/${id}`).then(r => setExam(r.data.data));
    loadPins();
  }, [id]);

  function loadPins() {
    api.get(`/pins/${id}`).then(r => setExisting(r.data.data));
  }

  async function generate(purposes: ('UNLOCK' | 'EXIT')[]) {
    setLoading(true);
    setGeneratedPins(null);
    setEmailSent(false);
    try {
      const { data } = await api.post('/pins/generate', {
        examId: id,
        purposes,
        deliverTo: deliverTo.trim() || undefined,
      });
      setGeneratedPins(data.data.pins);
      if (data.data.emailSent) setEmailSent(true);
      loadPins();
    } finally { setLoading(false); }
  }

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);
  const isOwner = exam?.teacherId === user?.id;

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-300 text-sm">← Back</button>
        <div>
          <h1 className="text-2xl font-bold">Exam Settings</h1>
          <p className="text-gray-400 text-sm truncate">{exam?.title}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {(['pins', 'proctors'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === t ? 'bg-emerald-500 text-black' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t === 'pins' ? '🔑 PINs' : '🤝 Co-proctors'}
          </button>
        ))}
      </div>

      {/* ── PINs tab ── */}
      {activeTab === 'pins' && (
        <div className="space-y-6">
          {existing.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-3 text-gray-300">Current PINs</h3>
              <div className="space-y-3">
                {existing.map(pin => (
                  <div key={pin.purpose} className="flex items-center justify-between text-sm">
                    <div>
                      <span className={`font-medium ${pin.purpose === 'UNLOCK' ? 'text-amber-400' : 'text-blue-400'}`}>
                        {pin.purpose === 'UNLOCK' ? '🔓 Unlock PIN' : '🚪 Exit PIN'}
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Generated {new Date(pin.createdAt).toLocaleDateString()}
                        {pin.usedAt && ` · Used ${new Date(pin.usedAt).toLocaleDateString()}`}
                        {pin.expiresAt && ` · Expires ${new Date(pin.expiresAt).toLocaleString()}`}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${pin.usedAt ? 'bg-gray-800 text-gray-500' : 'bg-emerald-950 text-emerald-400'}`}>
                      {pin.usedAt ? 'Used' : 'Active'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {generated && (
            <div className="bg-emerald-950 border border-emerald-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-emerald-400 text-lg">🔑</span>
                <h3 className="font-semibold text-emerald-300">PINs Generated</h3>
                {emailSent && <span className="text-xs bg-blue-950 text-blue-400 px-2 py-0.5 rounded-full ml-auto">✓ Email sent</span>}
              </div>
              <p className="text-xs text-emerald-700 mb-4">Save these now. They cannot be retrieved again.</p>
              <div className="space-y-3">
                {generated.UNLOCK && (
                  <div className="bg-gray-900 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-amber-400 font-medium mb-1">🔓 UNLOCK PIN</p>
                      <p className="text-3xl font-mono font-bold tracking-widest text-white">{generated.UNLOCK}</p>
                      <p className="text-xs text-gray-500 mt-1">For violations — allows student to continue.</p>
                    </div>
                    <button onClick={() => copyToClipboard(generated.UNLOCK!)} className="btn-ghost text-xs ml-4">Copy</button>
                  </div>
                )}
                {generated.EXIT && (
                  <div className="bg-gray-900 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-blue-400 font-medium mb-1">🚪 EXIT PIN</p>
                      <p className="text-3xl font-mono font-bold tracking-widest text-white">{generated.EXIT}</p>
                      <p className="text-xs text-gray-500 mt-1">Early exit — auto-submits when entered.</p>
                    </div>
                    <button onClick={() => copyToClipboard(generated.EXIT!)} className="btn-ghost text-xs ml-4">Copy</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {isOwner && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-300">Generate PINs</h3>
              <div>
                <label className="label">Email delivery (optional)</label>
                <input
                  className="input"
                  type="email"
                  placeholder="invigilator@school.edu — leave blank to show on screen only"
                  value={deliverTo}
                  onChange={e => setDeliverTo(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => generate(['UNLOCK'])} disabled={loading} className="btn-secondary py-3 flex-col h-auto gap-1">
                  <span className="text-base">🔓</span>
                  <span className="text-xs">Unlock PIN only</span>
                </button>
                <button onClick={() => generate(['EXIT'])} disabled={loading} className="btn-secondary py-3 flex-col h-auto gap-1">
                  <span className="text-base">🚪</span>
                  <span className="text-xs">Exit PIN only</span>
                </button>
              </div>
              <button onClick={() => generate(['UNLOCK', 'EXIT'])} disabled={loading} className="btn-primary w-full py-3">
                {loading ? 'Generating…' : '🔑 Generate Both PINs'}
              </button>
              <p className="text-xs text-gray-600">Generating new PINs invalidates the previous ones.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Co-proctors tab ── */}
      {activeTab === 'proctors' && id && (
        <ProctorsPanel examId={id} isOwner={isOwner} />
      )}
    </div>
  );
}
