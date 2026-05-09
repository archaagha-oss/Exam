// apps/teacher/src/pages/AnswerDistributionPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import RichText from '../components/RichText';

interface OptionDist { id: string; text: string; isCorrect: boolean; count: number; percentage: number }
interface Question {
  order: number; questionId: string; body: string; type: string;
  maxPoints: number; scoringMode: string; negativeMarks: number;
  answered: number; skipped: number; correctCount: number; percentCorrect: number;
  avgTimeSeconds: number | null;
  optionDistribution: OptionDist[];
}
interface DistData { totalRespondents: number; avgTimeSeconds: number; questions: Question[] }

function formatTime(s: number | null) {
  if (!s) return '—';
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const SCORING_LABELS: Record<string, string> = {
  binary: 'All-or-nothing', partial: 'Partial credit', negative: 'Negative marking',
};

export default function AnswerDistributionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<DistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get(`/assessment/exams/${id}/answer-distribution`)
      .then(r => { setData(r.data.data); setLoading(false); });
  }, [id]);

  function toggle(qId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId); else next.add(qId);
      return next;
    });
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (!data) return <div className="p-8 text-gray-500">No data yet.</div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-300 text-sm">← Back</button>
        <div>
          <h1 className="text-2xl font-bold">Answer Distribution</h1>
          <p className="text-gray-400 text-sm mt-0.5">{data.totalRespondents} respondents · avg {formatTime(data.avgTimeSeconds)} total</p>
        </div>
      </div>

      <div className="space-y-3">
        {data.questions.map(q => {
          const isOpen = expanded.has(q.questionId);
          const hasDistractors = q.type !== 'SHORT_TEXT' && q.type !== 'ESSAY';
          const topDistractor = hasDistractors
            ? q.optionDistribution.filter(o => !o.isCorrect).sort((a, b) => b.count - a.count)[0]
            : null;

          return (
            <div key={q.questionId} className="card overflow-hidden">
              {/* Collapsed row */}
              <button
                onClick={() => toggle(q.questionId)}
                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-800/20 transition-colors"
              >
                <span className="text-xs font-mono text-gray-500 w-6 flex-shrink-0">Q{q.order}</span>
                <p className="flex-1 text-sm text-gray-200 truncate"><RichText text={q.body} /></p>

                {/* Mini stats */}
                <div className="flex items-center gap-4 flex-shrink-0 text-xs text-gray-500">
                  <span title="Avg time">{formatTime(q.avgTimeSeconds)}</span>
                  <span title="Skip rate">{q.skipped > 0 && `${q.skipped} skipped`}</span>
                  {q.negativeMarks > 0 && (
                    <span className="text-red-400 text-xs">−{q.negativeMarks}pts</span>
                  )}
                </div>

                {/* % correct bar */}
                <div className="flex items-center gap-2 flex-shrink-0 w-28">
                  <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${q.percentCorrect >= 70 ? 'bg-emerald-500' : q.percentCorrect >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${q.percentCorrect}%` }}
                    />
                  </div>
                  <span className={`text-xs font-mono w-8 ${q.percentCorrect >= 70 ? 'text-emerald-400' : q.percentCorrect >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                    {q.percentCorrect}%
                  </span>
                </div>

                <span className="text-gray-600 text-xs">{isOpen ? '▲' : '▼'}</span>
              </button>

              {/* Expanded */}
              {isOpen && (
                <div className="border-t border-gray-800 px-5 py-4 bg-gray-800/10">
                  {/* Metadata row */}
                  <div className="flex flex-wrap gap-3 text-xs mb-4">
                    <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded">{q.type.replace('_', ' ')}</span>
                    <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded">{q.maxPoints} pt{q.maxPoints !== 1 ? 's' : ''}</span>
                    <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded">{SCORING_LABELS[q.scoringMode] ?? q.scoringMode}</span>
                    <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded">Avg time: {formatTime(q.avgTimeSeconds)}</span>
                    <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded">{q.answered} answered · {q.skipped} skipped</span>
                  </div>

                  {/* Option distribution */}
                  {hasDistractors && q.optionDistribution.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {q.optionDistribution.map(opt => (
                        <div key={opt.id} className="flex items-center gap-3">
                          <span className={`font-mono text-xs w-5 ${opt.isCorrect ? 'text-emerald-400' : 'text-gray-500'}`}>
                            {opt.id.toUpperCase()}
                          </span>
                          <div className="flex-1 h-6 bg-gray-800 rounded overflow-hidden">
                            <div
                              className={`h-full rounded flex items-center px-2 transition-all ${opt.isCorrect ? 'bg-emerald-700' : 'bg-blue-900'}`}
                              style={{ width: `${Math.max(opt.percentage, 2)}%` }}
                            >
                              <span className="text-xs text-white font-medium">{opt.percentage}%</span>
                            </div>
                          </div>
                          <span className="text-xs text-gray-400 w-20 truncate" title={opt.text}>{opt.text}</span>
                          <span className="text-xs text-gray-600 w-12 text-right">{opt.count} students</span>
                          {opt.isCorrect && <span className="text-xs text-emerald-400">✓ correct</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Insight callout */}
                  {topDistractor && topDistractor.percentage > 30 && (
                    <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg px-4 py-2 text-xs text-amber-300 mt-2">
                      ⚠ Distractor "{topDistractor.text}" attracted {topDistractor.percentage}% of students — this might be confusingly worded or a common misconception.
                    </div>
                  )}
                  {q.percentCorrect < 20 && (
                    <div className="bg-red-950/30 border border-red-900/50 rounded-lg px-4 py-2 text-xs text-red-300 mt-2">
                      Only {q.percentCorrect}% correct — consider reviewing this question's clarity, or re-teaching the topic.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
