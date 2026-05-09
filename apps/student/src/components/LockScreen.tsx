// apps/student/src/components/LockScreen.tsx
import { useState } from 'react';

interface Props {
  reason: string;
  violationCount: number;
  maxViolations: number;
  onUnlock: (pin: string) => Promise<void>;
}

export default function LockScreen({ reason, violationCount, maxViolations, onUnlock }: Props) {
  const [pins, setPins] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const inputRefs = [
    useState<HTMLInputElement | null>(null),
    useState<HTMLInputElement | null>(null),
    useState<HTMLInputElement | null>(null),
    useState<HTMLInputElement | null>(null),
  ];

  function handleInput(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...pins];
    next[index] = value.slice(-1);
    setPins(next);
    setError('');
    if (value && index < 3) {
      const nextInput = document.getElementById(`pin-${index + 1}`) as HTMLInputElement;
      nextInput?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pins[index] && index > 0) {
      const prev = document.getElementById(`pin-${index - 1}`) as HTMLInputElement;
      prev?.focus();
    }
  }

  async function handleSubmit() {
    const pin = pins.join('');
    if (pin.length < 4) { setError('Enter all 4 digits'); return; }
    setLoading(true);
    setError('');
    try {
      await onUnlock(pin);
    } catch (err: any) {
      setError(err.message || 'Incorrect PIN. Contact your instructor.');
      setPins(['', '', '', '']);
      setTimeout(() => {
        (document.getElementById('pin-0') as HTMLInputElement)?.focus();
      }, 50);
    } finally {
      setLoading(false);
    }
  }

  const violationLabels: Record<string, string> = {
    TAB_SWITCH: 'You switched tabs or minimized the window.',
    FULLSCREEN_EXIT: 'You exited fullscreen mode.',
    RIGHT_CLICK: 'Right-click was attempted.',
    KEYBOARD_SHORTCUT: 'A blocked keyboard shortcut was used.',
    COPY_PASTE: 'Copy or paste was attempted.',
    FOCUS_LOST: 'The exam window lost focus.',
  };

  return (
    <div className="fixed inset-0 bg-gray-950/98 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        {/* Pulsing lock icon */}
        <div className="text-7xl mb-5 animate-bounce">🚨</div>

        <h2 className="text-2xl font-bold text-red-400 mb-2">Violation Detected</h2>
        <p className="text-sm text-gray-400 mb-1">
          {violationLabels[reason] || reason}
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Violation <span className="text-red-400 font-bold">{violationCount}</span> of {maxViolations}. Enter your instructor's unlock PIN to continue.
        </p>

        {/* Violation dots */}
        <div className="flex justify-center gap-2 mb-8">
          {Array.from({ length: maxViolations }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all ${
                i < violationCount
                  ? 'bg-red-500 shadow-lg shadow-red-500/60'
                  : 'bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* PIN input */}
        <div className="flex justify-center gap-3 mb-4">
          {pins.map((digit, i) => (
            <input
              key={i}
              id={`pin-${i}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleInput(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-14 h-16 text-center text-2xl font-bold font-mono bg-gray-800 border-2 border-gray-700 rounded-xl text-white focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 transition-colors"
              autoFocus={i === 0}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-4 animate-pulse">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || pins.join('').length < 4}
          className="btn-danger w-full py-3 text-base"
        >
          {loading ? 'Verifying…' : 'Unlock Exam'}
        </button>

        <p className="text-xs text-gray-600 mt-4">
          Ask your instructor for the unlock PIN.
        </p>
      </div>
    </div>
  );
}
