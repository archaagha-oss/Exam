// apps/student/src/components/ExitModal.tsx
import { useState } from 'react';

interface Props {
  examId: string;
  onExit: (pin: string) => Promise<void>;
  onCancel: () => void;
}

export default function ExitModal({ onExit, onCancel }: Props) {
  const [pins, setPins] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleInput(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...pins];
    next[index] = value.slice(-1);
    setPins(next);
    setError('');
    if (value && index < 3) {
      (document.getElementById(`epin-${index + 1}`) as HTMLInputElement)?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pins[index] && index > 0) {
      (document.getElementById(`epin-${index - 1}`) as HTMLInputElement)?.focus();
    }
    if (e.key === 'Escape') onCancel();
  }

  async function handleSubmit() {
    const pin = pins.join('');
    if (pin.length < 4) { setError('Enter all 4 digits'); return; }
    setLoading(true);
    try {
      await onExit(pin);
    } catch (err: any) {
      setError(err.message || 'Incorrect PIN. Contact your instructor.');
      setPins(['', '', '', '']);
      setTimeout(() => (document.getElementById('epin-0') as HTMLInputElement)?.focus(), 50);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <div className="card p-8 w-full max-w-sm text-center shadow-2xl">
        <div className="text-5xl mb-4">🔐</div>
        <h2 className="text-xl font-bold mb-2">Exit Requires PIN</h2>
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
          Contact your instructor for the exit PIN. Unauthorized exits are logged.
        </p>

        <div className="flex justify-center gap-3 mb-4">
          {pins.map((digit, i) => (
            <input
              key={i}
              id={`epin-${i}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleInput(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-14 h-16 text-center text-2xl font-bold font-mono bg-gray-800 border-2 border-gray-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition-colors"
              autoFocus={i === 0}
            />
          ))}
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading || pins.join('').length < 4}
          className="btn-danger w-full mb-3"
        >
          {loading ? 'Verifying…' : 'Exit & Submit Exam'}
        </button>
        <button onClick={onCancel} className="btn-ghost w-full">
          Cancel — Continue Exam
        </button>
      </div>
    </div>
  );
}
