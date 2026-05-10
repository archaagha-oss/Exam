// apps/console/src/components/ViolationFeed.tsx
import { useEffect, useRef } from 'react';
import type { ViolationEvent } from '../hooks/useProctor';

interface Props {
  violations: ViolationEvent[];
  onSelectStudent: (sessionId: string) => void;
}

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  TAB_SWITCH:        { icon: '⇥',  label: 'Tab switch',       color: 'text-amber-400' },
  FULLSCREEN_EXIT:   { icon: '⛶',  label: 'Fullscreen exit',  color: 'text-amber-400' },
  RIGHT_CLICK:       { icon: '🖱',  label: 'Right-click',      color: 'text-yellow-400' },
  KEYBOARD_SHORTCUT: { icon: '⌨',  label: 'Keyboard shortcut', color: 'text-yellow-400' },
  COPY_PASTE:        { icon: '⎘',  label: 'Copy/paste',        color: 'text-orange-400' },
  FOCUS_LOST:        { icon: '◎',  label: 'Focus lost',        color: 'text-amber-400' },
  MANUAL_FLAG:       { icon: '🚩', label: 'Manually flagged',  color: 'text-purple-400' },
  CONNECTION_LOST:   { icon: '⚡', label: 'Connection lost',   color: 'text-red-400' },
};

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

export default function ViolationFeed({ violations, onSelectStudent }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest (top, since list is reversed)
  // List is newest-first so no scroll needed — the new item appears at top

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
        <h3 className="text-sm font-semibold">Violation feed</h3>
        <span className="text-xs text-gray-500">{violations.length} events</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {violations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm gap-2">
            <span className="text-2xl">✅</span>
            <span>No violations yet</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/60">
            {violations.map((v) => {
              const cfg = TYPE_CONFIG[v.violationType] ?? { icon: '⚠', label: v.violationType, color: 'text-gray-400' };
              return (
                <button
                  key={v.id}
                  onClick={() => onSelectStudent(v.sessionId)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-800/40 transition-colors
                    ${v.autoSubmitted ? 'bg-red-950/20' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-base flex-shrink-0 mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium truncate">{v.studentName}</p>
                        <span className="text-xs text-gray-600 flex-shrink-0">{timeAgo(v.timestamp)}</span>
                      </div>
                      <p className={`text-xs mt-0.5 ${cfg.color}`}>{cfg.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex gap-0.5">
                          {Array.from({ length: v.maxViolations }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-1.5 h-1.5 rounded-full ${
                                i < v.violationCount ? 'bg-red-500' : 'bg-gray-700'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-gray-500">
                          {v.violationCount}/{v.maxViolations}
                        </span>
                        {v.autoSubmitted && (
                          <span className="text-xs text-red-400 font-medium">· auto-submitted</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
