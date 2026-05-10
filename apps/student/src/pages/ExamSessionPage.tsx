// apps/student/src/pages/ExamSessionPage.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import api from '../lib/api';
import {
  enqueue as enqueueAnswer,
  remove as removeQueued,
  listAll as listQueued,
  drain as drainQueue,
  type QueuedWrite,
} from '../lib/answerQueue';
import { useAuthStore } from '../store/authStore';
import type { QuestionForStudent, SessionState } from '@secureexam/shared-types';
import LockScreen from '../components/LockScreen';
import RichText from '../components/RichText';
import ExitModal from '../components/ExitModal';
import SubmitConfirmModal from '../components/SubmitConfirmModal';
import Calculator from '../components/Calculator';
import OtpModal from '../components/OtpModal';
import { useDeviceFingerprint } from '../hooks/useDeviceFingerprint';

const VIOLATION_DEBOUNCE = 3000;
const HEARTBEAT_INTERVAL = 15000;
const ANSWER_SAVE_DEBOUNCE = 500;
const FOCUS_LOSS_GRACE_MS = 1500;
const NETWORK_CHECK_INTERVAL = 8000;

export default function ExamSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.accessToken);

  const [state, setState] = useState<SessionState | null>(location.state?.sessionState ?? null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [eliminated, setEliminated] = useState<Record<string, string[]>>({}); // Track A: eliminated options per question
  const [flagged, setFlagged] = useState<Set<string>>(new Set());            // Track B: flagged for review
  const [highlights, setHighlights] = useState<Record<string, string>>({});  // Track C: highlights (stored as HTML per question)
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timerVisible, setTimerVisible] = useState(true);                     // Track D: hide/show timer
  const [timerWarning, setTimerWarning] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState('');
  const [showExit, setShowExit] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showQuestionPanel, setShowQuestionPanel] = useState(false);
  const [showLineReader, setShowLineReader] = useState(false);
  const [lineReaderY, setLineReaderY] = useState(200);
  const [examStarted, setExamStarted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline' | 'reconnecting'>('online');
  // Queued count is sourced from the IndexedDB answer queue (P1-4). The
  // queue persists across tab close, so a student who hits a network blip
  // 5 minutes into an exam doesn't lose any answers when they recover.
  const [queuedCount, setQueuedCount] = useState(0);

  // SEN accommodations (applied from session state)
  const [showCalculator, setShowCalculator] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [onRestBreak, setOnRestBreak] = useState(false);
  const [restBreakSecondsUsed, setRestBreakSecondsUsed] = useState(0);
  const [restBreakId, setRestBreakId] = useState<string | null>(null);

  // Security: OTP verification
  const [showOtp, setShowOtp] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  // Device fingerprint hook
  const { submit: submitFingerprint } = useDeviceFingerprint();

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const networkRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastViolationTime = useRef<Record<string, number>>({});
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusLossTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxViolations = state?.exam.maxViolations ?? 3;

  // ── Drain any queued answers from a previous tab/session (P1-4) ──
  // Runs once on mount so a refresh during a network blip doesn't leave
  // unsent answers stranded.
  useEffect(() => {
    if (!sessionId) return;
    drainQueue(async (write) => {
      await api.post(write.url, write.body, {
        headers: { 'Idempotency-Key': write.id },
      });
    })
      .catch(() => {})
      .finally(() => {
        refreshQueueCount();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Load session ─────────────────────────────────────────
  useEffect(() => {
    if (!state && sessionId) {
      api.get(`/sessions/${sessionId}`).then((r) => {
        setState(r.data.data);
        setViolationCount(r.data.data.session.violationCount);
        setSecondsLeft(r.data.data.secondsRemaining);
        const saved: Record<string, string[]> = {};
        for (const [qid, ans] of Object.entries(r.data.data.answers as any)) {
          if ((ans as any).selectedIds) saved[qid] = (ans as any).selectedIds;
        }
        setAnswers(saved);
      });
    } else if (state) {
      setViolationCount(state.session.violationCount);
      setSecondsLeft(state.secondsRemaining);
      const saved: Record<string, string[]> = {};
      for (const [qid, ans] of Object.entries(state.answers)) {
        if (ans.selectedIds) saved[qid] = ans.selectedIds;
      }
      setAnswers(saved);
      // Apply SEN accommodations from session
      if ((state as any).sen) {
        const sen = (state as any).sen;
        if (sen.textToSpeech) setTtsEnabled(true);
        // Font size and high contrast applied via CSS vars in render
      }
    }
  }, [sessionId]);

  // ── WebSocket ─────────────────────────────────────────────
  useEffect(() => {
    if (!examStarted || !sessionId || !token) return;

    // Token is sent via Sec-WebSocket-Protocol "bearer.<jwt>" subprotocol so it
    // never appears in URLs / proxy access logs (P1-2, audit §8).
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws?sessionId=${sessionId}&examId=${state?.exam.id}`;
    const ws = new WebSocket(wsUrl, [`bearer.${token}`]);
    wsRef.current = ws;

    ws.onopen = () => setNetworkStatus('online');
    ws.onclose = () => setNetworkStatus('offline');

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'session:locked' || msg.type === 'violation:recorded') {
        setViolationCount(msg.payload.violationCount);
        if (msg.type === 'session:locked') {
          setIsLocked(true);
          setLockReason(msg.payload.reason || 'Violation detected');
        }
      }
      if (msg.type === 'session:unlocked') {
        setIsLocked(false);
        document.documentElement.requestFullscreen().catch(() => {});
      }
      if (msg.type === 'session:force_submit') {
        handleForceSubmit(msg.payload.reason);
      }
      // Server-authoritative timer (P1-3). Each heartbeat reply carries the
      // canonical secondsRemaining computed against startedAt + duration on
      // the server; we use it as ground truth and let the local 1s timer
      // interpolate between heartbeats for smooth UI.
      if (msg.type === 'pong' && typeof msg.payload?.secondsRemaining === 'number') {
        const serverSecs = msg.payload.secondsRemaining;
        setSecondsLeft((local) => {
          // Trust the server. If it says 0 we trigger auto-submit.
          if (serverSecs <= 0) {
            handleAutoSubmit('Time expired');
            return 0;
          }
          // If the local clock has drifted away from the server by more than
          // ~3 seconds, snap. Otherwise let the local 1s tick keep counting
          // so the UI stays smooth.
          return Math.abs(local - serverSecs) > 3 ? serverSecs : local;
        });
      }
    };

    heartbeatRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'session:heartbeat',
          payload: { sessionId },
          timestamp: new Date().toISOString(),
        }));
      }
    }, HEARTBEAT_INTERVAL);

    return () => {
      ws.close();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [examStarted, sessionId, token]);

  // ── Network monitor + offline answer sync ────────────────
  useEffect(() => {
    if (!examStarted) return;

    const checkNetwork = () => {
      if (!navigator.onLine) {
        setNetworkStatus('offline');
        return;
      }
      if (networkStatus === 'offline') {
        setNetworkStatus('reconnecting');
        flushPendingAnswers();
      } else {
        setNetworkStatus('online');
      }
    };

    networkRef.current = setInterval(checkNetwork, NETWORK_CHECK_INTERVAL);
    window.addEventListener('online', checkNetwork);
    window.addEventListener('offline', () => setNetworkStatus('offline'));

    return () => {
      if (networkRef.current) clearInterval(networkRef.current);
      window.removeEventListener('online', checkNetwork);
      window.removeEventListener('offline', () => setNetworkStatus('offline'));
    };
  }, [examStarted, networkStatus]);

  async function refreshQueueCount() {
    try {
      const items = await listQueued();
      setQueuedCount(items.length);
    } catch {
      // IndexedDB unavailable (private browsing, locked storage). Surface as
      // zero so the banner doesn't lie about queued state we can't read.
      setQueuedCount(0);
    }
  }

  // Persistent answer save (P1-4). Always enqueue first so the write
  // survives tab close, then attempt POST immediately. Failures stay in the
  // queue until flushPendingAnswers / drain runs.
  async function saveAnswer(payload: { questionId: string; selectedIds?: string[]; textAnswer?: string }) {
    const write: QueuedWrite = {
      id:
        typeof crypto?.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${payload.questionId}-${Date.now()}-${Math.random()}`,
      dedupeKey: `answer:${payload.questionId}`,
      url: `/sessions/${sessionId}/answer`,
      body: payload,
      createdAt: Date.now(),
    };
    try {
      await enqueueAnswer(write);
    } catch {
      // If we can't even enqueue, fall through to the direct POST attempt;
      // there's nothing else we can durably do from a locked-down browser.
    }
    refreshQueueCount();

    try {
      await api.post(write.url, write.body, {
        headers: { 'Idempotency-Key': write.id },
      });
      await removeQueued(write.id).catch(() => {});
      refreshQueueCount();
      // Optimistic WS broadcast for the proctor view; best-effort, not auth.
      wsRef.current?.send(
        JSON.stringify({
          type: 'session:answer',
          payload: { sessionId, ...payload },
          timestamp: new Date().toISOString(),
        })
      );
    } catch {
      // Stay in queue; flushPendingAnswers / drainQueue retries on reconnect.
    }
  }

  async function flushPendingAnswers() {
    const result = await drainQueue(async (write) => {
      await api.post(write.url, write.body, {
        headers: { 'Idempotency-Key': write.id },
      });
    });
    refreshQueueCount();
    if (result.failed === 0) setNetworkStatus('online');
  }

  // ── Timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (!examStarted || secondsLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s === 300) setTimerWarning(true); // 5-minute alert matches Bluebook
        if (s === 60) setTimerVisible(true);  // Force show at 1 min regardless
        if (s <= 1) { handleAutoSubmit('Time expired'); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [examStarted]);

  // ── Anti-cheat: Print/Screenshot blocked (Track: new) ────
  useEffect(() => {
    if (!examStarted) return;

    // Block print
    const onBeforePrint = (e: Event) => { e.preventDefault(); };
    const onAfterPrint = () => {};

    // CSS: prevent print rendering — inject once
    const style = document.createElement('style');
    style.id = 'exam-no-print';
    style.textContent = `@media print { body { display: none !important; } }`;
    document.head.appendChild(style);

    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      document.getElementById('exam-no-print')?.remove();
    };
  }, [examStarted]);

  // ── Anti-cheat event listeners ────────────────────────────
  useEffect(() => {
    if (!examStarted) return;

    const reportViolation = (type: string, desc?: string) => {
      if (showExit || showSubmitConfirm || showQuestionPanel) return;
      const now = Date.now();
      if ((now - (lastViolationTime.current[type] ?? 0)) < VIOLATION_DEBOUNCE) return;
      lastViolationTime.current[type] = now;

      api.post(`/sessions/${sessionId}/violation`, { type, description: desc });
      wsRef.current?.send(JSON.stringify({
        type: 'session:violation',
        payload: { sessionId, type, description: desc },
        timestamp: new Date().toISOString(),
      }));
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        reportViolation('TAB_SWITCH', 'Student switched tabs or minimized window');
      }
    };

    const onBlur = () => {
      if (focusLossTimer.current) clearTimeout(focusLossTimer.current);
      focusLossTimer.current = setTimeout(() => {
        if (!document.hasFocus()) {
          reportViolation('FOCUS_LOST', 'Window lost focus');
        }
      }, FOCUS_LOSS_GRACE_MS);
    };
    const onFocus = () => { if (focusLossTimer.current) clearTimeout(focusLossTimer.current); };
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); reportViolation('RIGHT_CLICK'); };
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); reportViolation('COPY_PASTE', 'Copy attempted'); };
    const onCut  = (e: ClipboardEvent) => { e.preventDefault(); reportViolation('COPY_PASTE', 'Cut attempted'); };
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      reportViolation('COPY_PASTE', 'Paste attempted');
    };
    const onDragStart = (e: DragEvent) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      // Block print shortcuts
      const isPrint = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p';
      // Block screenshot shortcuts (Windows: Win+PrtSc, Mac: Cmd+Shift+3/4)
      const isScreenshot =
        (e.metaKey && e.shiftKey && ['3','4','5'].includes(e.key)) ||
        e.key === 'PrintScreen';
      const blocked =
        isPrint || isScreenshot ||
        e.key === 'F12' || e.key === 'F5' ||
        (e.ctrlKey && 'ucsavfhtnrj'.includes(e.key.toLowerCase())) ||
        (e.altKey  && (e.key === 'F4' || e.key === 'Tab')) ||
        (e.metaKey && 'rcqwn'.includes(e.key.toLowerCase()));

      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
        const keys = `${e.ctrlKey?'Ctrl+':''}${e.altKey?'Alt+':''}${e.metaKey?'Cmd+':''}${e.shiftKey?'Shift+':''}${e.key}`;
        const type = (isPrint || isScreenshot) ? 'COPY_PASTE' : 'KEYBOARD_SHORTCUT';
        reportViolation(type, `Blocked: ${keys}`);
      }
      if (e.key === 'Escape' && !isLocked && !showExit && !showSubmitConfirm && !showQuestionPanel) {
        e.preventDefault();
        reportViolation('KEYBOARD_SHORTCUT', 'Escape key pressed');
      }
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        reportViolation('FULLSCREEN_EXIT', 'Student exited fullscreen');
      }
    };

    // Block text selection on question content (but NOT textareas)
    const onSelectStart = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
      // Allow highlights tool to work — if it's a user-initiated highlight, we handle it
      if ((e as any).__allowSelect) return;
      e.preventDefault();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur',  onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('copy',  onCopy as any);
    document.addEventListener('cut',   onCut as any);
    document.addEventListener('paste', onPaste as any);
    document.addEventListener('dragstart', onDragStart as any);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('selectstart', onSelectStart);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur',  onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('copy',  onCopy as any);
      document.removeEventListener('cut',   onCut as any);
      document.removeEventListener('paste', onPaste as any);
      document.removeEventListener('dragstart', onDragStart as any);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('selectstart', onSelectStart);
      if (focusLossTimer.current) clearTimeout(focusLossTimer.current);
    };
  }, [examStarted, sessionId, isLocked, showExit, showSubmitConfirm, showQuestionPanel]);

  // ── Answer selection ──────────────────────────────────────
  const selectAnswer = useCallback((questionId: string, optionId: string, type: string) => {
    setAnswers((prev) => {
      let selected: string[];
      if (type === 'MCQ_MULTI') {
        selected = prev[questionId]?.includes(optionId)
          ? (prev[questionId] || []).filter((id) => id !== optionId)
          : [...(prev[questionId] || []), optionId];
      } else {
        selected = [optionId];
      }
      const payload = { questionId, selectedIds: selected };
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        saveAnswer(payload);
      }, ANSWER_SAVE_DEBOUNCE);
      return { ...prev, [questionId]: selected };
    });
  }, [sessionId]);

  // ── Submit ────────────────────────────────────────────────
  const doSubmit = async (reason: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (timerRef.current) clearInterval(timerRef.current);
      await flushPendingAnswers();
      const { data } = await api.post(`/sessions/${sessionId}/submit`);
      navigate('/submitted', { state: { result: data.data, reason } });
    } finally {
      setSubmitting(false);
    }
  };

  const handleForceSubmit = (reason: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    navigate('/submitted', { state: { reason, auto: true } });
  };
  const handleAutoSubmit = (reason: string) => doSubmit(reason);
  const handleConfirmedSubmit = () => { setShowSubmitConfirm(false); doSubmit('Student submitted'); };

  const handleUnlock = async (pin: string) => {
    const { data } = await api.post(`/sessions/${sessionId}/unlock`, { pin, examId: state?.exam.id });
    if (data.data.unlocked) {
      setIsLocked(false);
      document.documentElement.requestFullscreen().catch(() => {});
    } else throw new Error('Incorrect PIN');
  };

  const handleExit = async (pin: string) => {
    const { data } = await api.post(`/sessions/${sessionId}/exit`, { pin, examId: state?.exam.id });
    if (data.data) {
      if (timerRef.current) clearInterval(timerRef.current);
      navigate('/submitted', { state: { result: data.data, reason: 'Exited with PIN' } });
    } else throw new Error('Incorrect PIN');
  };

  // ── Text-to-speech ────────────────────────────────────────
  const speakText = useCallback((text: string) => {
    if (!ttsEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled]);

  const stopSpeech = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // ── Rest break ────────────────────────────────────────────
  const startRestBreak = useCallback(async () => {
    try {
      const { data } = await api.post(`/sen/sessions/${sessionId}/rest-break/start`);
      setRestBreakId(data.data.breakId);
      setOnRestBreak(true);
      // Pause the timer by stopping it
      if (timerRef.current) clearInterval(timerRef.current);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Could not start rest break');
    }
  }, [sessionId]);

  const endRestBreak = useCallback(async () => {
    try {
      const { data } = await api.post(`/sen/sessions/${sessionId}/rest-break/end`);
      setRestBreakSecondsUsed(prev => prev + data.data.durationSeconds);
      setOnRestBreak(false);
      setRestBreakId(null);
      // Resume timer
      timerRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s === 300) setTimerWarning(true);
          if (s === 60) setTimerVisible(true);
          if (s <= 1) { handleAutoSubmit('Time expired'); return 0; }
          return s - 1;
        });
      }, 1000);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Could not end rest break');
    }
  }, [sessionId]);

  const enterFullscreen = async () => {
    // If OTP required and not yet verified — show OTP modal first
    const requiresOtp = (state as any).exam?.requireOtp;
    if (requiresOtp && !otpVerified) {
      setShowOtp(true);
      return;
    }
    await document.documentElement.requestFullscreen();
    setExamStarted(true);
    // Submit device fingerprint in background after exam starts
    if (sessionId) {
      submitFingerprint(sessionId).then(alert => {
        if (alert) console.warn('[Security] Device alert:', alert);
      });
    }
  };

  const handleOtpVerified = async () => {
    setShowOtp(false);
    setOtpVerified(true);
    // Proceed to fullscreen after OTP verified
    await document.documentElement.requestFullscreen();
    setExamStarted(true);
    if (sessionId) submitFingerprint(sessionId);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  // ── Tool handlers ─────────────────────────────────────────
  const toggleFlag = (qId: string) => {
    setFlagged(prev => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId); else next.add(qId);
      return next;
    });
  };

  const toggleEliminate = (qId: string, optId: string) => {
    setEliminated(prev => {
      const current = prev[qId] ?? [];
      const next = current.includes(optId)
        ? current.filter(id => id !== optId)
        : [...current, optId];
      return { ...prev, [qId]: next };
    });
  };

  if (!state) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
      Loading exam…
    </div>
  );

  const questions = state.questions;
  const q = questions[currentQ] as QuestionForStudent;
  const answeredCount = Object.entries(answers).filter(([, v]) => {
    if (Array.isArray(v)) return v.length > 0 && (v[0] as any) !== '';
    return false;
  }).length;
  const unansweredCount = questions.length - answeredCount;
  const progress = (answeredCount / questions.length) * 100;
  const isFlagged = flagged.has(q.id);

  // SEN-derived values
  const sen = (state as any).sen as null | {
    textToSpeech: boolean; fontSizeOverride: number | null;
    restBreaksAllowed: boolean; restBreakMinutes: number;
    focusMode: boolean; highContrastForced: boolean; extraTimePercent: number;
  };
  const focusMode        = sen?.focusMode         ?? false;
  const fontSizeOverride = sen?.fontSizeOverride   ?? null;
  const restAllowed      = sen?.restBreaksAllowed  ?? false;
  const restTotalSecs    = (sen?.restBreakMinutes  ?? 0) * 60;
  const restRemaining    = Math.max(0, restTotalSecs - restBreakSecondsUsed);
  const highContrast     = sen?.highContrastForced ?? false;
  const calcType         = (state as any).exam?.calculatorType as string | null;

  // SEN container styles
  const senStyle: React.CSSProperties = {};
  if (fontSizeOverride) senStyle.fontSize = `${fontSizeOverride}px`;

  // ── System check (pre-exam) ───────────────────────────────
  if (!examStarted) {
    const checks = [
      { label: 'Fullscreen support', ok: !!document.documentElement.requestFullscreen },
      { label: 'Browser online', ok: navigator.onLine },
      { label: 'Local storage available', ok: (() => { try { localStorage.setItem('_t','1'); localStorage.removeItem('_t'); return true; } catch { return false; } })() },
    ];
    const allOk = checks.every(c => c.ok);

    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-2xl font-bold mb-1">Ready to begin?</h1>
            <p className="text-gray-400 text-sm">System check and exam details</p>
          </div>

          {/* System check */}
          <div className="card p-5 mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">System check</p>
            <div className="space-y-2">
              {checks.map(c => (
                <div key={c.label} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">{c.label}</span>
                  <span className={c.ok ? 'text-emerald-400' : 'text-red-400'}>{c.ok ? '✓ Ready' : '✗ Failed'}</span>
                </div>
              ))}
            </div>
            {!allOk && (
              <p className="text-red-400 text-xs mt-3">
                One or more checks failed. Please inform your instructor before proceeding.
              </p>
            )}
          </div>

          {/* Exam details */}
          <div className="card p-5 mb-4">
            <p className="font-semibold text-base mb-2">{state.exam.title}</p>
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              <div className="bg-gray-800 rounded-lg p-2">
                <p className="text-lg font-bold text-emerald-400">{state.exam.durationMinutes}</p>
                <p className="text-xs text-gray-500">
                  minutes
                  {(state as any).sen?.extraTimePercent > 0 && (
                    <span className="text-amber-400 ml-1">(+{(state as any).sen.extraTimePercent}%)</span>
                  )}
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-2">
                <p className="text-lg font-bold text-blue-400">{questions.length}</p>
                <p className="text-xs text-gray-500">questions</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-2">
                <p className="text-lg font-bold text-amber-400">{maxViolations}</p>
                <p className="text-xs text-gray-500">violations max</p>
              </div>
            </div>
            {state.exam.instructions && (
              <p className="text-sm text-gray-300 border-t border-gray-800 pt-3 leading-relaxed">
                {state.exam.instructions}
              </p>
            )}
          </div>

          {/* SEN accommodations summary */}
          {sen && (sen.extraTimePercent > 0 || sen.textToSpeech || sen.restBreaksAllowed || sen.focusMode) && (
            <div className="card p-4 mb-4 border-amber-900 bg-amber-950/20">
              <p className="text-xs font-semibold text-amber-400 mb-2">Your access arrangements</p>
              <div className="space-y-1">
                {sen.extraTimePercent > 0 && (
                  <p className="text-xs text-amber-200">⏱ Extra time: +{sen.extraTimePercent}% ({state.exam.durationMinutes} minutes total)</p>
                )}
                {sen.textToSpeech && (
                  <p className="text-xs text-amber-200">🔊 Read aloud — use the speaker button during the exam</p>
                )}
                {sen.restBreaksAllowed && (
                  <p className="text-xs text-amber-200">☕ Rest breaks — up to {sen.restBreakMinutes} minutes (timer paused)</p>
                )}
                {sen.focusMode && (
                  <p className="text-xs text-amber-200">🎯 Focus mode — one question at a time, simplified view</p>
                )}
                {calcType && (
                  <p className="text-xs text-amber-200">∑ {calcType === 'scientific' ? 'Scientific' : 'Basic'} calculator available</p>
                )}
              </div>
            </div>
          )}

          <p className="text-center text-xs text-gray-600 mb-4">
            Not ready?{' '}
            <button className="text-gray-400 underline hover:text-white" onClick={() => navigate('/')}>
              Return to exam list
            </button>
          </p>

          <button onClick={enterFullscreen} className="btn-primary w-full py-3 text-base" disabled={!allOk}>
            Enter Fullscreen &amp; Begin →
          </button>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <LockScreen
        reason={lockReason}
        violationCount={violationCount}
        maxViolations={maxViolations}
        onUnlock={handleUnlock}
      />
    );
  }

  const timerClass =
    secondsLeft <= 60  ? 'text-red-400 animate-pulse' :
    secondsLeft <= 300 ? 'text-amber-400' :
    'text-emerald-400';

  return (
    <div
      className={`h-screen bg-gray-950 flex flex-col overflow-hidden select-none ${highContrast ? 'high-contrast' : ''}`}
      style={senStyle}
    >

      {/* ── Rest break overlay ── */}
      {onRestBreak && (
        <div className="fixed inset-0 bg-gray-950/98 z-50 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="text-6xl mb-4">☕</div>
            <h2 className="text-2xl font-bold mb-2">Rest Break</h2>
            <p className="text-gray-400 text-sm mb-2">Your timer is paused. Take your time.</p>
            <p className="text-gray-500 text-xs mb-8">
              {Math.floor(restRemaining / 60)}m {restRemaining % 60}s break time remaining
            </p>
            <button
              onClick={endRestBreak}
              className="btn-primary bg-emerald-600 hover:bg-emerald-500 px-10 py-3 text-base"
            >
              Resume Exam →
            </button>
          </div>
        </div>
      )}

      {/* ── 5-minute warning banner ── */}
      {timerWarning && secondsLeft <= 300 && secondsLeft > 0 && (
        <div className="bg-amber-900/80 border-b border-amber-700 px-6 py-2 flex items-center justify-between text-sm text-amber-200 flex-shrink-0">
          <span>⏰ 5 minutes remaining — review your answers</span>
          <button onClick={() => setTimerWarning(false)} className="text-amber-400 hover:text-amber-200 text-xs">Dismiss</button>
        </div>
      )}

      {/* ── Network warning ── */}
      {networkStatus !== 'online' && (
        <div className={`px-6 py-2 flex items-center justify-between text-sm flex-shrink-0 ${
          networkStatus === 'offline'
            ? 'bg-red-900/80 border-b border-red-700 text-red-200'
            : 'bg-amber-900/80 border-b border-amber-700 text-amber-200'
        }`}>
          <span>
            {networkStatus === 'offline'
              ? '⚠ No internet connection — answers are being saved locally'
              : '↻ Reconnecting and syncing answers…'}
          </span>
          {queuedCount > 0 && (
            <span className="text-xs opacity-75">{queuedCount} answer{queuedCount !== 1 ? 's' : ''} queued</span>
          )}
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm truncate max-w-[200px]">{state.exam.title}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 font-medium flex-shrink-0">● LIVE</span>
        </div>

        {/* Timer with hide/show toggle (Bluebook feature) */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {timerVisible ? (
            <span className={`font-mono text-lg font-bold ${timerClass}`}>{formatTime(secondsLeft)}</span>
          ) : (
            <span className="text-sm text-gray-600 font-mono">••:••</span>
          )}
          <button
            onClick={() => setTimerVisible(v => !v)}
            className="text-xs text-gray-600 hover:text-gray-400 ml-1 px-1.5 py-0.5 rounded"
            title={timerVisible ? 'Hide timer' : 'Show timer'}
          >
            {timerVisible ? '🙈' : '👁'}
          </button>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Violation dots */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Violations</span>
            <div className="flex gap-1">
              {Array.from({ length: maxViolations }).map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-all ${i < violationCount ? 'bg-red-500 shadow-red-500/50 shadow-sm' : 'bg-gray-700'}`} />
              ))}
            </div>
          </div>

          {/* TTS button — only if SEN profile enables it */}
          {sen?.textToSpeech && (
            <button
              onClick={() => isSpeaking ? stopSpeech() : speakText(q.body)}
              className={`text-xs px-2 py-1 rounded-lg border transition-colors ${isSpeaking ? 'bg-emerald-950 text-emerald-400 border-emerald-800 animate-pulse' : 'text-gray-500 border-gray-700 hover:border-gray-500'}`}
              title={isSpeaking ? 'Stop reading' : 'Read question aloud'}
            >
              {isSpeaking ? '⏹' : '🔊'}
            </button>
          )}

          {/* Calculator — only if exam allows it */}
          {calcType && (
            <button
              onClick={() => setShowCalculator(v => !v)}
              className={`text-xs px-2 py-1 rounded-lg border transition-colors ${showCalculator ? 'bg-amber-950 text-amber-400 border-amber-800' : 'text-gray-500 border-gray-700 hover:border-gray-500'}`}
              title={`${calcType === 'scientific' ? 'Scientific' : 'Basic'} calculator`}
            >
              ∑
            </button>
          )}

          {/* Rest break — only if SEN profile allows it */}
          {restAllowed && restRemaining > 0 && (
            <button
              onClick={startRestBreak}
              className="text-xs px-2 py-1 rounded-lg border border-gray-700 text-gray-500 hover:border-emerald-700 hover:text-emerald-400 transition-colors"
              title={`Rest break (${Math.floor(restRemaining / 60)}m ${restRemaining % 60}s remaining)`}
            >
              ☕
            </button>
          )}

          {/* Line reader toggle */}
          <button
            onClick={() => setShowLineReader(v => !v)}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors ${showLineReader ? 'bg-blue-950 text-blue-400 border-blue-800' : 'text-gray-500 border-gray-700 hover:border-gray-500'}`}
            title="Line reader tool"
          >
            ≡
          </button>

          {/* Question overview panel */}
          <button
            onClick={() => setShowQuestionPanel(v => !v)}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors ${showQuestionPanel ? 'bg-purple-950 text-purple-400 border-purple-800' : 'text-gray-500 border-gray-700 hover:border-gray-500'}`}
            title="Question overview"
          >
            ☰
          </button>

          {/* Submit */}
          <button
            onClick={() => setShowSubmitConfirm(true)}
            className="text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            Submit
          </button>

          {/* Exit */}
          <button
            onClick={() => setShowExit(true)}
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 px-2 py-1.5 rounded-lg transition-colors"
          >
            Exit ↗
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-gray-800 flex-shrink-0">
        <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {/* ── Main content area ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Question panel sidebar — hidden in focus mode */}
        {!focusMode && showQuestionPanel && (
          <div className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 overflow-y-auto p-3">
            <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">Questions</p>
            <div className="grid grid-cols-5 gap-1.5">
              {questions.map((question, i) => {
                const qId = (question as any).id;
                const isAnswered = answers[qId]?.length > 0;
                const isMarked = flagged.has(qId);
                const isCurrent = i === currentQ;
                return (
                  <button
                    key={i}
                    onClick={() => { setCurrentQ(i); setShowQuestionPanel(false); }}
                    className={`w-8 h-8 rounded-lg text-xs font-mono font-bold transition-all relative ${
                      isCurrent      ? 'bg-blue-600 text-white' :
                      isMarked       ? 'bg-amber-900 text-amber-300 border border-amber-700' :
                      isAnswered     ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' :
                      'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                    title={`Q${i + 1}${isMarked ? ' (flagged)' : isAnswered ? ' (answered)' : ''}`}
                  >
                    {i + 1}
                    {isMarked && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-1.5 text-xs text-gray-500">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-950 border border-emerald-900" />Answered</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-amber-900 border border-amber-700" />Flagged for review</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-600" />Current</div>
            </div>
          </div>
        )}

        {/* Question area */}
        <div className="flex-1 overflow-y-auto py-8 px-4 relative">

          {/* Line reader overlay */}
          {showLineReader && (
            <div
              className="fixed left-0 right-0 z-30 pointer-events-none"
              style={{ top: lineReaderY - 2, height: 36 }}
            >
              <div className="absolute inset-0 bg-yellow-400/10 border-y border-yellow-400/30" />
            </div>
          )}
          {showLineReader && (
            <div
              className="fixed left-4 z-30 cursor-ns-resize"
              style={{ top: lineReaderY + 16, userSelect: 'none' }}
              onMouseDown={(e) => {
                const startY = e.clientY;
                const startReader = lineReaderY;
                const onMove = (me: MouseEvent) => setLineReaderY(startReader + (me.clientY - startY));
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
            >
              <div className="bg-yellow-500 text-black text-xs px-2 py-0.5 rounded font-medium">≡ drag</div>
            </div>
          )}

          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-emerald-400 font-bold tracking-widest uppercase">
                  Question {currentQ + 1} / {questions.length}
                </span>
                <span className="text-xs text-gray-500">{answeredCount} answered · {unansweredCount} remaining</span>
              </div>

              {/* Flag for review button (SAT Bluebook feature) */}
              <button
                onClick={() => toggleFlag(q.id)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                  isFlagged
                    ? 'bg-amber-950 text-amber-400 border-amber-700'
                    : 'text-gray-500 border-gray-700 hover:border-amber-700 hover:text-amber-400'
                }`}
                title="Mark for review"
              >
                🚩 {isFlagged ? 'Marked' : 'Mark for review'}
              </button>
            </div>

            <h2 className="text-xl font-semibold leading-relaxed mb-6">
              <RichText text={q.body} />
            </h2>

            {/* Media */}
            {(q as any).mediaUrl && (
              <div className="mb-6">
                {(q as any).mediaUrl.match(/\.(mp3|wav|ogg|webm)$/i)
                  ? <audio controls src={(q as any).mediaUrl} className="w-full" />
                  : <img src={(q as any).mediaUrl} alt="Question media" className="max-h-64 rounded-xl border border-gray-700 object-contain mx-auto" />
                }
              </div>
            )}

            {/* MCQ options with answer eliminator */}
            {(q.options ?? []).length > 0 && (
              <div className="space-y-3">
                {(q.options ?? []).map((opt, i) => {
                  const isSelected  = (answers[q.id] ?? []).includes(opt.id);
                  const isEliminated = (eliminated[q.id] ?? []).includes(opt.id);
                  const letter = String.fromCharCode(65 + i);
                  return (
                    <div key={opt.id} className="flex items-center gap-2">
                      <button
                        onClick={() => selectAnswer(q.id, opt.id, q.type)}
                        className={`flex-1 flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all duration-150 ${
                          isEliminated
                            ? 'opacity-40 border-gray-800 bg-gray-900'
                            : isSelected
                            ? 'border-emerald-500 bg-emerald-950/40 text-white'
                            : 'border-gray-700 bg-gray-900 hover:border-gray-500 text-gray-200'
                        }`}
                      >
                        <span className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-sm font-bold ${isSelected ? 'bg-emerald-500 text-black' : 'bg-gray-800 text-gray-400'}`}>
                          {isEliminated ? <span className="text-gray-600 line-through">{letter}</span> : letter}
                        </span>
                        <span className={`text-sm leading-snug ${isEliminated ? 'line-through text-gray-600' : ''}`}>
                          <RichText text={opt.text} />
                        </span>
                      </button>
                      {/* Answer eliminator button (SAT Bluebook feature) */}
                      <button
                        onClick={() => toggleEliminate(q.id, opt.id)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs border transition-all flex-shrink-0 ${
                          isEliminated
                            ? 'bg-red-950 border-red-800 text-red-400'
                            : 'border-gray-700 text-gray-600 hover:border-gray-500 hover:text-gray-400'
                        }`}
                        title={isEliminated ? 'Restore option' : 'Eliminate option'}
                      >
                        {isEliminated ? '↩' : '✕'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Essay / Short text */}
            {['SHORT_TEXT', 'ESSAY'].includes(q.type) && (
              <div>
                <label className="block text-xs text-gray-500 mb-2">
                  {q.type === 'ESSAY' ? 'Your answer (essay)' : 'Your answer (short text)'}
                </label>
                <textarea
                  className="w-full bg-gray-900 border-2 border-gray-700 rounded-xl p-4 text-gray-100 text-sm leading-relaxed resize-none focus:outline-none focus:border-emerald-500 transition-colors"
                  rows={q.type === 'ESSAY' ? 10 : 4}
                  placeholder={q.type === 'ESSAY' ? 'Write your essay answer here…' : 'Write your answer here…'}
                  value={(answers[q.id] as any)?.[0] ?? ''}
                  onChange={e => {
                    const text = e.target.value;
                    setAnswers(prev => ({ ...prev, [q.id]: [text] as any }));
                    if (saveTimeout.current) clearTimeout(saveTimeout.current);
                    saveTimeout.current = setTimeout(() => {
                      saveAnswer({ questionId: q.id, textAnswer: text });
                    }, ANSWER_SAVE_DEBOUNCE);
                  }}
                />
                <p className="text-xs text-gray-600 mt-1 text-right">
                  {((answers[q.id] as any)?.[0] ?? '').length} characters
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom nav — simplified in focus mode ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-t border-gray-800 flex-shrink-0">
        <button onClick={() => setCurrentQ(q => Math.max(0, q - 1))} disabled={currentQ === 0} className="btn-ghost">
          ← Previous
        </button>

        {/* Question dots — hidden in focus mode */}
        {!focusMode && (
          <div className="flex gap-1.5 flex-wrap justify-center max-w-xs">
            {questions.map((question, i) => {
              const qId = (question as any).id;
              return (
                <button
                  key={i}
                  onClick={() => setCurrentQ(i)}
                  title={`Q${i + 1}${flagged.has(qId) ? ' (flagged)' : ''}`}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    i === currentQ    ? 'bg-blue-400 scale-125' :
                    flagged.has(qId)  ? 'bg-amber-400' :
                    answers[qId]?.length > 0 ? 'bg-emerald-500' :
                    'bg-gray-700'
                  }`}
                />
              );
            })}
          </div>
        )}

        {/* In focus mode show question counter instead */}
        {focusMode && (
          <span className="text-sm text-gray-400 font-mono">
            {currentQ + 1} / {questions.length}
          </span>
        )}

        <button
          onClick={() => setCurrentQ(q => Math.min(questions.length - 1, q + 1))}
          disabled={currentQ === questions.length - 1}
          className="btn-primary"
        >
          Next →
        </button>
      </div>

      {/* ── Modals ── */}
      {showSubmitConfirm && (
        <SubmitConfirmModal
          answeredCount={answeredCount}
          totalCount={questions.length}
          flaggedCount={flagged.size}
          onConfirm={handleConfirmedSubmit}
          onCancel={() => setShowSubmitConfirm(false)}
          submitting={submitting}
        />
      )}
      {showExit && (
        <ExitModal
          examId={state.exam.id}
          onExit={handleExit}
          onCancel={() => setShowExit(false)}
        />
      )}

      {/* ── Calculator overlay ── */}
      {showCalculator && calcType && (
        <Calculator
          type={calcType as 'basic' | 'scientific'}
          onClose={() => setShowCalculator(false)}
        />
      )}

      {/* ── OTP verification modal ── */}
      {showOtp && state && sessionId && (
        <OtpModal
          sessionId={sessionId}
          studentEmail={state.session?.id ?? ''}
          onVerified={handleOtpVerified}
        />
      )}

      {/* ── Focus mode: per-question TTS read button ── */}
      {sen?.textToSpeech && (
        <div className="fixed bottom-20 left-4 z-40">
          <button
            onClick={() => isSpeaking ? stopSpeech() : speakText(
              q.body + (q.options ? '. Options: ' + (q.options as any[]).map((o: any, i: number) =>
                String.fromCharCode(65 + i) + ': ' + o.text).join('. ') : '')
            )}
            className={`flex items-center gap-2 text-xs px-4 py-2 rounded-xl border shadow-lg transition-all ${
              isSpeaking
                ? 'bg-emerald-950 text-emerald-300 border-emerald-700 animate-pulse'
                : 'bg-gray-900 text-gray-300 border-gray-700 hover:border-emerald-700 hover:text-emerald-400'
            }`}
            title="Read question and options aloud"
          >
            {isSpeaking ? '⏹ Stop reading' : '🔊 Read question aloud'}
          </button>
        </div>
      )}
    </div>
  );
}
