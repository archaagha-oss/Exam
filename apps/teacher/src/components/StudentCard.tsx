// apps/teacher/src/components/StudentCard.tsx
import { useState } from 'react';
import type { StudentSnapshot } from '../hooks/useProctor';

interface Props {
  snapshot: StudentSnapshot;
  onForceSubmit: () => Promise<void>;
  onUnlock: () => Promise<void>;
  onFlag: (reason?: string) => Promise<void>;
  isHighlighted?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; card: string }> = {
  NOT_STARTED:    { label: 'Not started',   dot: 'bg-gray-600',   card: 'border-gray-800' },
  IN_PROGRESS:    { label: 'In progress',   dot: 'bg-emerald-400', card: 'border-gray-800' },
  LOCKED:         { label: 'Locked',        dot: 'bg-amber-400 animate-pulse', card: 'border-amber-800' },
  SUBMITTED:      { label: 'Submitted',     dot: 'bg-blue-400',   card: 'border-blue-900' },
  AUTO_SUBMITTED: { label: 'Auto-submitted', dot: 'bg-red-500',   card: 'border-red-900' },
};

const VIOLATION_LABELS: Record<string, string> = {
  TAB_SWITCH: 'Tab switch', FULLSCREEN_EXIT: 'Fullscreen exit',
  RIGHT_CLICK: 'Right-click', KEYBOARD_SHORTCUT: 'Keyboard shortcut',
  COPY_PASTE: 'Copy/paste', FOCUS_LOST: 'Focus lost',
  MANUAL_FLAG: 'Manually flagged', CONNECTION_LOST: 'Connection lost',
};

function formatTime(secs: number | null): string {
  if (secs === null || secs < 0) return '—';
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function StudentCard({ snapshot, onForceSubmit, onUnlock, onFlag, isHighlighted }: Props) {
  const [confirming, setConfirming] = useState<'submit' | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [showFlagInput, setShowFlagInput] = useState(false);
  const [busy, setBusy] = useState(false);

  const cfg = STATUS_CONFIG[snapshot.status] ?? STATUS_CONFIG.NOT_STARTED;
  const isDone = ['SUBMITTED', 'AUTO_SUBMITTED'].includes(snapshot.status);
  const isLocked = snapshot.status === 'LOCKED';
  const progress = snapshot.totalQuestions > 0
    ? Math.round((snapshot.answeredCount / snapshot.totalQuestions) * 100)
    : 0;
  const pct = snapshot.totalPoints && snapshot.score != null
    ? Math.round((snapshot.score / snapshot.totalPoints) * 100)
    : null;

  const timeClass = snapshot.secondsRemaining !== null
    ? snapshot.secondsRemaining < 60 ? 'text-red-400'
      : snapshot.secondsRemaining < 300 ? 'text-amber-400'
      : 'text-gray-300'
    : 'text-gray-500';

  async function handleAction(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  return (
    <div className={`card p-4 flex flex-col gap-3 transition-all duration-200
      ${isHighlighted ? 'ring-2 ring-amber-500' : ''}
      ${isLocked ? 'bg-amber-950/20 border-amber-800' : cfg.card}
    `}>
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold
          ${isDone ? 'bg-gray-800 text-gray-500' : isLocked ? 'bg-amber-900 text-amber-300' : 'bg-emerald-900 text-emerald-300'}`}>
          {initials(snapshot.student.name)}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{snapshot.student.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
            <span className="text-xs text-gray-400">{cfg.label}</span>
            {!isDone && !snapshot.isConnected && (
              <span className="text-xs text-red-400">· offline</span>
            )}
          </div>
        </div>

        {/* Timer */}
        {!isDone && (
          <span className={`text-sm font-mono font-bold flex-shrink-0 ${timeClass}`}>
            {formatTime(snapshot.secondsRemaining)}
          </span>
        )}
        {isDone && pct !== null && (
          <span className={`text-sm font-bold flex-shrink-0 ${pct >= 60 ? 'text-emerald-400' : 'text-red-400'}`}>
            {pct}%
          </span>
        )}
      </div>

      {/* Progress bar + answered count */}
      {!isDone && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{snapshot.answeredCount}/{snapshot.totalQuestions} answered</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Violations */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Violations</span>
          <div className="flex gap-1">
            {Array.from({ length: snapshot.maxViolations }).map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i < snapshot.violationCount
                    ? 'bg-red-500 shadow-sm shadow-red-500/50'
                    : 'bg-gray-700'
                }`}
              />
            ))}
          </div>
          <span className={`text-xs font-medium ${snapshot.violationCount > 0 ? 'text-red-400' : 'text-gray-600'}`}>
            {snapshot.violationCount}/{snapshot.maxViolations}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      {!isDone && (
        <div className="flex gap-2 pt-1 border-t border-gray-800">
          {isLocked && (
            <button
              onClick={() => handleAction(onUnlock)}
              disabled={busy}
              className="flex-1 text-xs py-1.5 rounded-lg bg-amber-900 hover:bg-amber-800 text-amber-300 font-medium transition-colors disabled:opacity-50"
            >
              🔓 Unlock
            </button>
          )}

          {!showFlagInput ? (
            <button
              onClick={() => setShowFlagInput(true)}
              disabled={busy}
              className="flex-1 text-xs py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white font-medium transition-colors"
            >
              🚩 Flag
            </button>
          ) : (
            <div className="flex-1 flex gap-1">
              <input
                className="flex-1 text-xs bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-gray-200 focus:outline-none focus:border-amber-500"
                placeholder="Reason (optional)"
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { handleAction(() => onFlag(flagReason)); setShowFlagInput(false); setFlagReason(''); }
                  if (e.key === 'Escape') { setShowFlagInput(false); setFlagReason(''); }
                }}
                autoFocus
              />
              <button
                onClick={() => { handleAction(() => onFlag(flagReason)); setShowFlagInput(false); setFlagReason(''); }}
                className="text-xs px-2 py-1 rounded-lg bg-amber-900 text-amber-300 hover:bg-amber-800"
              >✓</button>
              <button
                onClick={() => { setShowFlagInput(false); setFlagReason(''); }}
                className="text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-500 hover:text-white"
              >✕</button>
            </div>
          )}

          {confirming === 'submit' ? (
            <div className="flex gap-1">
              <button
                onClick={() => { handleAction(onForceSubmit); setConfirming(null); }}
                className="text-xs px-2 py-1.5 rounded-lg bg-red-900 hover:bg-red-800 text-red-300 font-medium transition-colors"
              >Confirm</button>
              <button
                onClick={() => setConfirming(null)}
                className="text-xs px-2 py-1.5 rounded-lg bg-gray-800 text-gray-500 hover:text-white transition-colors"
              >Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming('submit')}
              disabled={busy}
              className="flex-1 text-xs py-1.5 rounded-lg bg-gray-800 hover:bg-red-950 hover:text-red-400 text-gray-400 font-medium transition-colors"
            >
              ⏹ Submit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
