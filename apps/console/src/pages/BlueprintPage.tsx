// apps/console/src/pages/BlueprintPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';

interface Blueprint {
  examId: string;
  title: string;
  totalQuestions: number;
  totalPoints: number;
  tagCoverage: { tag: string; questionCount: number; points: number; percentage: number }[];
  typeBreakdown: { type: string; count: number }[];
  difficultySpread: { easy: number; medium: number; hard: number };
  uncoveredBankTags: string[];
}

const TYPE_LABELS: Record<string, string> = {
  MCQ: 'Multiple choice', MCQ_MULTI: 'Multi-select',
  TRUE_FALSE: 'True/False', SHORT_TEXT: 'Short answer', ESSAY: 'Essay',
};

const DIFF_COLORS = ['', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500'];

export default function BlueprintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [bp, setBp] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/assessment/exams/${id}/blueprint`)
      .then(r => { setBp(r.data.data); setLoading(false); });
  }, [id]);

  if (loading) return <div className="p-8 text-gray-500">Loading blueprint…</div>;
  if (!bp) return <div className="p-8 text-gray-500">Not found.</div>;

  const total = bp.difficultySpread.easy + bp.difficultySpread.medium + bp.difficultySpread.hard;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-300 text-sm">← Back</button>
        <div>
          <h1 className="text-2xl font-bold">Exam Blueprint</h1>
          <p className="text-gray-400 text-sm mt-0.5">{bp.title}</p>
        </div>
      </div>

      {/* Overview row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-blue-400">{bp.totalQuestions}</p>
          <p className="text-xs text-gray-500 mt-1">Total questions</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-emerald-400">{bp.totalPoints}</p>
          <p className="text-xs text-gray-500 mt-1">Total points</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-purple-400">{bp.tagCoverage.length}</p>
          <p className="text-xs text-gray-500 mt-1">Topics covered</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Difficulty spread */}
        <div className="card p-5">
          <h3 className="font-semibold text-sm mb-4">Difficulty balance</h3>
          <div className="space-y-3">
            {[
              { label: 'Easy', count: bp.difficultySpread.easy, color: 'bg-emerald-500' },
              { label: 'Medium', count: bp.difficultySpread.medium, color: 'bg-amber-500' },
              { label: 'Hard', count: bp.difficultySpread.hard, color: 'bg-red-500' },
            ].map(d => (
              <div key={d.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300">{d.label}</span>
                  <span className="text-gray-400">{d.count} ({total ? Math.round(d.count / total * 100) : 0}%)</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full ${d.color} rounded-full`} style={{ width: `${total ? (d.count / total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
          {bp.difficultySpread.easy / total > 0.7 && (
            <p className="text-xs text-amber-400 mt-3">⚠ Over 70% easy questions — consider adding harder items.</p>
          )}
        </div>

        {/* Type breakdown */}
        <div className="card p-5">
          <h3 className="font-semibold text-sm mb-4">Question types</h3>
          <div className="space-y-2">
            {bp.typeBreakdown.map(t => (
              <div key={t.type} className="flex justify-between text-sm">
                <span className="text-gray-300">{TYPE_LABELS[t.type] ?? t.type}</span>
                <span className="text-gray-400">{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tag coverage */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">Topic coverage</h3>
          <span className="text-xs text-gray-500">sorted by question count</span>
        </div>
        {bp.tagCoverage.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No tagged questions in this exam. Add tags to your questions to see coverage.</p>
        ) : (
          <div className="space-y-2">
            {bp.tagCoverage.map(tc => (
              <div key={tc.tag} className="flex items-center gap-3">
                <span className="text-sm text-gray-300 w-40 truncate" title={tc.tag}>{tc.tag}</span>
                <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded flex items-center px-2"
                    style={{ width: `${Math.max(6, tc.percentage)}%` }}
                  >
                    <span className="text-xs font-bold text-white leading-none">{tc.questionCount}</span>
                  </div>
                </div>
                <span className="text-xs text-gray-500 w-16 text-right">{tc.percentage}% pts</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gaps */}
      {bp.uncoveredBankTags.length > 0 && (
        <div className="card p-5 border-amber-900/50 bg-amber-950/10">
          <h3 className="font-semibold text-sm text-amber-400 mb-2">Topics in your question bank not covered</h3>
          <p className="text-xs text-gray-500 mb-3">These topics exist in your question bank but have no questions in this exam.</p>
          <div className="flex flex-wrap gap-2">
            {bp.uncoveredBankTags.map(tag => (
              <span key={tag} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded-full">{tag}</span>
            ))}
          </div>
          <Link to={`/exams/${id}/edit`} className="text-xs text-amber-400 hover:text-amber-300 mt-3 inline-block">
            Add questions from these topics →
          </Link>
        </div>
      )}
    </div>
  );
}
