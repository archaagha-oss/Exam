// apps/student/src/components/OtpModal.tsx
import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';

interface Props {
  sessionId: string;
  studentEmail: string;
  onVerified: () => void;
}

export default function OtpModal({ sessionId, studentEmail, onVerified }: Props) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [destination, setDestination] = useState('');
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    requestOtp();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (expiresAt) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const secs = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000));
        setCountdown(secs);
        if (secs === 0 && timerRef.current) clearInterval(timerRef.current);
      }, 200);
    }
  }, [expiresAt]);

  async function requestOtp() {
    setSending(true); setError(''); setDigits(['', '', '', '', '', '']);
    try {
      const { data } = await api.post(`/security/sessions/${sessionId}/otp/send`);
      setExpiresAt(new Date(data.data.expiresAt));
      setDestination(data.data.destination);
      setTimeout(() => refs[0].current?.focus(), 100);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send code');
    } finally { setSending(false); }
  }

  function handleDigit(index: number, value: string) {
    if (!/^\d?$/.test(value)) return;
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    setError('');
    if (value && index < 5) refs[index + 1].current?.focus();
    if (next.every(d => d !== '')) submitCode(next.join(''));
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      refs[index - 1].current?.focus();
    }
  }

  async function submitCode(code: string) {
    setVerifying(true); setError('');
    try {
      await api.post(`/security/sessions/${sessionId}/otp/verify`, { code });
      onVerified();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Incorrect code';
      const code2 = err.response?.data?.code;
      setError(msg);
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => refs[0].current?.focus(), 50);
      if (code2 === 'EXPIRED') setExpiresAt(null);
    } finally { setVerifying(false); }
  }

  const timerColor = countdown <= 10 ? 'text-red-400' : countdown <= 30 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="fixed inset-0 bg-gray-950/98 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="text-5xl mb-4">✉</div>
        <h2 className="text-xl font-bold mb-1">Verify your identity</h2>
        <p className="text-sm text-gray-400 mb-2">
          A 6-digit code was sent to{' '}
          <span className="text-gray-200 font-medium">{destination || studentEmail}</span>
        </p>

        {expiresAt && countdown > 0 && (
          <p className={`text-sm font-mono font-bold mb-5 ${timerColor}`}>
            Expires in {countdown}s
          </p>
        )}

        {(!expiresAt || countdown === 0) && !sending && (
          <p className="text-xs text-amber-400 mb-5">Code expired.</p>
        )}

        {/* Digit inputs */}
        <div className="flex justify-center gap-3 mb-4">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={verifying || sending}
              className={`w-12 h-14 text-center text-2xl font-bold font-mono rounded-xl border-2 text-white focus:outline-none transition-colors bg-gray-800 ${
                error ? 'border-red-500' : d ? 'border-emerald-500' : 'border-gray-700 focus:border-blue-500'
              }`}
              autoFocus={i === 0}
            />
          ))}
        </div>

        {verifying && <p className="text-sm text-blue-400 mb-4 animate-pulse">Verifying…</p>}
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <button
          onClick={requestOtp}
          disabled={sending || (countdown > 0)}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          {sending ? 'Sending…' : countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
        </button>

        <p className="text-xs text-gray-600 mt-6">
          Check your spam folder if you don't see the email.
        </p>
      </div>
    </div>
  );
}
