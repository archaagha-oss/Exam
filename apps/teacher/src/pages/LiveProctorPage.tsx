// apps/teacher/src/pages/LiveProctorPage.tsx
import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { useProctor } from '../hooks/useProctor';
import StudentCard from '../components/StudentCard';
import ViolationFeed from '../components/ViolationFeed';
import type { StudentStatus, StudentSnapshot } from '../hooks/useProctor';

type FilterStatus = 'ALL' | StudentStatus;
type SortKey = 'name' | 'violations' | 'progress' | 'time';

interface ExamMeta { id: string; title: string; durationMinutes: number; maxViolations: number }

export default function LiveProctorPage() {
  const { id: examId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<ExamMeta | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [sort, setSort] = useState<SortKey>('name');
  const [search, setSearch] = useState('');
  const [highlightedSession, setHighlightedSession] = useState<string | null>(null);
  const [showFeedMobile, setShowFeedMobile] = useState(false);

  const { students, violations, isConnected, lastUpdate, forceSubmit, remoteUnlock, flagSession, refresh } =
    useProctor(examId!);

  useEffect(() => {
    api.get(`/exams/${examId}`).then((r) => setExam(r.data.data));
  }, [examId]);

  // ── Stats ────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: students.length,
    active: students.filter((s) => s.status === 'IN_PROGRESS').length,
    locked: students.filter((s) => s.status === 'LOCKED').length,
    submitted: students.filter((s) => ['SUBMITTED', 'AUTO_SUBMITTED'].includes(s.status)).length,
    notStarted: students.filter((s) => s.status === 'NOT_STARTED').length,
    violations: students.reduce((sum, s) => sum + s.violationCount, 0),
    offline: students.filter((s) => !s.isConnected && !['SUBMITTED', 'AUTO_SUBMITTED', 'NOT_STARTED'].includes(s.status)).length,
  }), [students]);

  // ── Filter + sort ────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = students;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        s.student.name.toLowerCase().includes(q) ||
        s.student.email.toLowerCase().includes(q)
      );
    }

    if (filter !== 'ALL') {
      list = list.filter((s) => s.status === filter);
    }

    return [...list].sort((a, b) => {
      switch (sort) {
        case 'violations': return b.violationCount - a.violationCount;
        case 'progress':   return b.answeredCount - a.answeredCount;
        case 'time':       return (a.secondsRemaining ?? 9999) - (b.secondsRemaining ?? 9999);
        default:           return a.student.name.localeCompare(b.student.name);
      }
    });
  }, [students, filter, sort, search]);

  // Highlight a student card when clicked from violation feed
  function handleSelectStudent(sessionId: string) {
    setHighlightedSession(sessionId);
    setFilter('ALL');
    setShowFeedMobile(false);
    setTimeout(() => {
      document.getElementById(`card-${sessionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightedSession(null), 3000);
    }, 100);
  }

  const filterButtons: { key: FilterStatus; label: string; count: number; color: string }[] = [
    { key: 'ALL',           label: 'All',          count: stats.total,     color: 'text-gray-300' },
    { key: 'IN_PROGRESS',   label: 'Active',        count: stats.active,    color: 'text-emerald-400' },
    { key: 'LOCKED',        label: 'Locked',        count: stats.locked,    color: 'text-amber-400' },
    { key: 'SUBMITTED',     label: 'Submitted',     count: stats.submitted, color: 'text-blue-400' },
    { key: 'NOT_STARTED',   label: 'Not started',   count: stats.notStarted, color: 'text-gray-500' },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-4 px-5 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-300 text-sm flex-shrink-0">← Back</button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-sm truncate">{exam?.title ?? 'Loading…'}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
              isConnected ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400 animate-pulse'
            }`}>
              {isConnected ? '● LIVE' : '⚡ Reconnecting…'}
            </span>
          </div>
          {lastUpdate && (
            <p className="text-xs text-gray-600">
              Updated {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Stats pills */}
        <div className="hidden lg:flex items-center gap-3 text-sm flex-shrink-0">
          <span className="text-emerald-400 font-medium">{stats.active} active</span>
          {stats.locked > 0 && <span className="text-amber-400 font-medium">{stats.locked} locked</span>}
          {stats.offline > 0 && <span className="text-red-400 font-medium">{stats.offline} offline</span>}
          <span className="text-gray-500">{stats.submitted}/{stats.total} submitted</span>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={refresh} className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors">
            ↻ Refresh
          </button>
          <Link to={`/exams/${examId}/results`} className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors">
            Results →
          </Link>
          {/* Mobile: toggle violation feed */}
          <button
            onClick={() => setShowFeedMobile(!showFeedMobile)}
            className="lg:hidden text-xs text-gray-500 hover:text-gray-300 border border-gray-700 px-3 py-1.5 rounded-lg relative"
          >
            Feed {violations.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">{Math.min(violations.length, 9)}</span>}
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="flex gap-4 px-5 py-2.5 bg-gray-900/60 border-b border-gray-800 flex-shrink-0 overflow-x-auto">
        {[
          { label: 'Total students', value: stats.total, color: 'text-gray-300' },
          { label: 'Active now',     value: stats.active,   color: 'text-emerald-400' },
          { label: 'Locked',        value: stats.locked,    color: 'text-amber-400' },
          { label: 'Submitted',     value: stats.submitted, color: 'text-blue-400' },
          { label: 'Violations',    value: stats.violations, color: 'text-red-400' },
          { label: 'Offline',       value: stats.offline,   color: stats.offline > 0 ? 'text-red-400' : 'text-gray-600' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</span>
            <span className="text-xs text-gray-500">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Main body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: student grid */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Filter + search bar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 flex-shrink-0 flex-wrap gap-y-2">
            <input
              className="input max-w-[200px] text-sm py-1.5"
              placeholder="Search student…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="flex gap-1">
              {filterButtons.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    filter === f.key
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {f.label}
                  {f.count > 0 && (
                    <span className={`ml-1.5 ${f.color}`}>{f.count}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-500">Sort:</span>
              <select
                className="input text-xs py-1 max-w-[130px]"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
              >
                <option value="name">Name</option>
                <option value="violations">Violations</option>
                <option value="progress">Progress</option>
                <option value="time">Time left</option>
              </select>
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                {students.length === 0
                  ? 'Waiting for students to join…'
                  : 'No students match the current filter.'}
              </div>
            ) : (
              <div className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
              >
                {filtered.map((s) => (
                  <div key={s.sessionId} id={`card-${s.sessionId}`}>
                    <StudentCard
                      snapshot={s}
                      isHighlighted={highlightedSession === s.sessionId}
                      onForceSubmit={() => forceSubmit(s.sessionId)}
                      onUnlock={() => remoteUnlock(s.sessionId)}
                      onFlag={(reason) => flagSession(s.sessionId, reason)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: violation feed — hidden on mobile unless toggled */}
        <div className={`
          w-80 flex-shrink-0 border-l border-gray-800 bg-gray-900 flex flex-col
          ${showFeedMobile ? 'fixed inset-0 z-50' : 'hidden lg:flex'}
        `}>
          {showFeedMobile && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h3 className="font-semibold text-sm">Violation feed</h3>
              <button onClick={() => setShowFeedMobile(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>
          )}
          <ViolationFeed violations={violations} onSelectStudent={handleSelectStudent} />
        </div>
      </div>
    </div>
  );
}
