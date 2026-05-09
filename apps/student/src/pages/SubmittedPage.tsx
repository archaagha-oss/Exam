// apps/student/src/pages/SubmittedPage.tsx
import { useLocation, useNavigate } from 'react-router-dom';

export default function SubmittedPage() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const result = state?.result;
  const reason = state?.reason || 'Exam submitted';
  const auto = state?.auto;

  const score = result?.score ?? 0;
  const total = result?.totalPoints ?? 0;
  const pct = total > 0 ? Math.round((score / total) * 100) : null;

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="card p-10 w-full max-w-md text-center">
        {/* Icon */}
        <div className="text-6xl mb-5">{auto ? '⚠️' : '✅'}</div>

        <h1 className="text-2xl font-bold mb-2">
          {auto ? 'Exam Auto-Submitted' : 'Exam Submitted'}
        </h1>
        <p className="text-gray-400 text-sm mb-8">{reason}</p>

        {/* Score ring */}
        {pct !== null && (
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-32 h-32 rounded-full flex items-center justify-center mb-4"
              style={{
                background: `conic-gradient(${pct >= 60 ? '#10b981' : '#ef4444'} ${pct * 3.6}deg, #1f2937 0deg)`,
              }}
            >
              <div className="w-24 h-24 bg-gray-900 rounded-full flex items-center justify-center">
                <span className="text-3xl font-bold font-mono">{pct}%</span>
              </div>
            </div>
            <p className="text-gray-400 text-sm">
              {score} / {total} points
            </p>
            {pct >= 60 ? (
              <span className="mt-2 text-emerald-400 text-sm font-semibold">✓ Passed</span>
            ) : (
              <span className="mt-2 text-red-400 text-sm font-semibold">✗ Did not pass</span>
            )}
          </div>
        )}

        <p className="text-sm text-gray-500 mb-8">
          Your answers have been recorded and sent to your instructor.
        </p>

        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={() => navigate('/results')}
            className="btn-primary w-full"
          >
            📊 View My Results
          </button>
          <button
            onClick={() => navigate('/')}
            className="btn-ghost w-full"
          >
            ← Return to Exam List
          </button>
        </div>
      </div>
    </div>
  );
}
