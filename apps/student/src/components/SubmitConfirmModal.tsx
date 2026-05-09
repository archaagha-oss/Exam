// apps/student/src/components/SubmitConfirmModal.tsx
interface Props {
  answeredCount: number;
  totalCount: number;
  flaggedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}

export default function SubmitConfirmModal({ answeredCount, totalCount, flaggedCount, onConfirm, onCancel, submitting }: Props) {
  const unanswered = totalCount - answeredCount;
  const pct = Math.round((answeredCount / totalCount) * 100);
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <div className="card p-8 w-full max-w-sm text-center shadow-2xl">
        <div className="text-5xl mb-4">📋</div>
        <h2 className="text-xl font-bold mb-1">Submit exam?</h2>
        <p className="text-sm text-gray-400 mb-6">This cannot be undone.</p>
        <div className="w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: `conic-gradient(#10b981 ${pct * 3.6}deg, #1f2937 0deg)` }}>
          <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center">
            <span className="text-lg font-bold font-mono">{pct}%</span>
          </div>
        </div>
        <div className="flex justify-center gap-4 mb-5 text-sm">
          <div><p className="text-2xl font-bold text-emerald-400">{answeredCount}</p><p className="text-xs text-gray-500">Answered</p></div>
          <div><p className={`text-2xl font-bold ${unanswered > 0 ? 'text-red-400' : 'text-gray-500'}`}>{unanswered}</p><p className="text-xs text-gray-500">Unanswered</p></div>
          {flaggedCount > 0 && <div><p className="text-2xl font-bold text-amber-400">{flaggedCount}</p><p className="text-xs text-gray-500">Flagged</p></div>}
          <div><p className="text-2xl font-bold text-gray-300">{totalCount}</p><p className="text-xs text-gray-500">Total</p></div>
        </div>
        {unanswered > 0 && <div className="bg-red-950/40 border border-red-900 rounded-lg px-4 py-3 mb-3 text-sm text-red-300">⚠ {unanswered} unanswered question{unanswered !== 1 ? 's' : ''} will receive 0 points.</div>}
        {flaggedCount > 0 && <div className="bg-amber-950/40 border border-amber-800 rounded-lg px-4 py-3 mb-4 text-sm text-amber-300">🚩 {flaggedCount} question{flaggedCount !== 1 ? 's' : ''} marked for review — check before submitting.</div>}
        <button onClick={onConfirm} disabled={submitting} className="btn-primary w-full py-3 mb-3 bg-blue-600 hover:bg-blue-500">{submitting ? 'Submitting…' : 'Yes, Submit Exam'}</button>
        <button onClick={onCancel} disabled={submitting} className="btn-ghost w-full">Cancel — Keep Working</button>
      </div>
    </div>
  );
}
