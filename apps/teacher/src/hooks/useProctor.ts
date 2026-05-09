// apps/teacher/src/hooks/useProctor.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';

export type StudentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'LOCKED' | 'SUBMITTED' | 'AUTO_SUBMITTED';

export interface StudentSnapshot {
  sessionId: string;
  student: { id: string; name: string; email: string };
  status: StudentStatus;
  violationCount: number;
  maxViolations: number;
  answeredCount: number;
  totalQuestions: number;
  secondsRemaining: number | null;
  startedAt: string | null;
  submittedAt: string | null;
  score: number | null;
  totalPoints: number | null;
  isConnected: boolean;
}

export interface ViolationEvent {
  id: string;
  sessionId: string;
  studentName: string;
  violationType: string;
  violationCount: number;
  maxViolations: number;
  autoSubmitted: boolean;
  timestamp: string;
}

interface ProctorState {
  students: Map<string, StudentSnapshot>;
  violations: ViolationEvent[];
  isConnected: boolean;
  lastUpdate: Date | null;
}

export function useProctor(examId: string) {
  const token = useAuthStore((s) => s.accessToken);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const violationIdCounter = useRef(0);

  const [state, setState] = useState<ProctorState>({
    students: new Map(),
    violations: [],
    isConnected: false,
    lastUpdate: null,
  });

  // ── Load initial snapshot via REST ─────────────────────────
  const loadSnapshot = useCallback(async () => {
    try {
      const { data } = await api.get(`/sessions/exam/${examId}/live`);
      const sessions: StudentSnapshot[] = data.data;
      setState((prev) => ({
        ...prev,
        students: new Map(sessions.map((s) => [s.sessionId, s])),
        lastUpdate: new Date(),
      }));
    } catch (err) {
      console.error('Failed to load proctor snapshot', err);
    }
  }, [examId]);

  // ── WebSocket connection ────────────────────────────────────
  const connect = useCallback(() => {
    if (!token || !examId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws?token=${token}&examId=${examId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((prev) => ({ ...prev, isConnected: true }));
      // Request full snapshot on connect
      ws.send(JSON.stringify({
        type: 'proctor:request_snapshot',
        payload: { examId },
        timestamp: new Date().toISOString(),
      }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleWSMessage(msg);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setState((prev) => ({ ...prev, isConnected: false }));
      // Auto-reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, examId]);

  const handleWSMessage = useCallback((msg: any) => {
    const { type, payload, timestamp } = msg;

    switch (type) {
      case 'proctor:full_snapshot': {
        const sessions: StudentSnapshot[] = payload.sessions;
        setState((prev) => ({
          ...prev,
          students: new Map(sessions.map((s) => [s.sessionId, s])),
          lastUpdate: new Date(),
        }));
        break;
      }

      case 'proctor:update': {
        const snap: StudentSnapshot = payload;
        setState((prev) => {
          const next = new Map(prev.students);
          next.set(snap.sessionId, snap);
          return { ...prev, students: next, lastUpdate: new Date() };
        });
        break;
      }

      case 'proctor:violation': {
        const v: ViolationEvent = {
          id: String(++violationIdCounter.current),
          sessionId: payload.sessionId,
          studentName: payload.studentName,
          violationType: payload.violationType,
          violationCount: payload.violationCount,
          maxViolations: payload.maxViolations,
          autoSubmitted: payload.autoSubmitted,
          timestamp,
        };
        setState((prev) => ({
          ...prev,
          violations: [v, ...prev.violations].slice(0, 100), // keep last 100
        }));
        break;
      }

      case 'proctor:student_disconnected': {
        setState((prev) => {
          const next = new Map(prev.students);
          const student = next.get(payload.sessionId);
          if (student) next.set(payload.sessionId, { ...student, isConnected: false });
          return { ...prev, students: next };
        });
        break;
      }

      case 'proctor:student_stale': {
        setState((prev) => {
          const next = new Map(prev.students);
          const student = next.get(payload.sessionId);
          if (student) next.set(payload.sessionId, { ...student, isConnected: false });
          const staleViolation: ViolationEvent = {
            id: String(++violationIdCounter.current),
            sessionId: payload.sessionId,
            studentName: payload.studentName,
            violationType: 'CONNECTION_LOST',
            violationCount: student?.violationCount ?? 0,
            maxViolations: student?.maxViolations ?? 3,
            autoSubmitted: false,
            timestamp: new Date().toISOString(),
          };
          return { ...prev, students: next, violations: [staleViolation, ...prev.violations].slice(0, 100) };
        });
        break;
      }
    }
  }, []);

  useEffect(() => {
    loadSnapshot();
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [examId]);

  // ── Proctor actions ────────────────────────────────────────

  const forceSubmit = useCallback(async (sessionId: string) => {
    await api.post(`/sessions/${sessionId}/force-submit`);
    setState((prev) => {
      const next = new Map(prev.students);
      const s = next.get(sessionId);
      if (s) next.set(sessionId, { ...s, status: 'AUTO_SUBMITTED' });
      return { ...prev, students: next };
    });
  }, []);

  const remoteUnlock = useCallback(async (sessionId: string) => {
    await api.post(`/sessions/${sessionId}/remote-unlock`);
    setState((prev) => {
      const next = new Map(prev.students);
      const s = next.get(sessionId);
      if (s) next.set(sessionId, { ...s, status: 'IN_PROGRESS' });
      return { ...prev, students: next };
    });
  }, []);

  const flagSession = useCallback(async (sessionId: string, reason?: string) => {
    await api.post(`/sessions/${sessionId}/flag`, { reason });
    setState((prev) => {
      const next = new Map(prev.students);
      const s = next.get(sessionId);
      if (s) next.set(sessionId, { ...s, violationCount: s.violationCount + 1 });
      return { ...prev, students: next };
    });
  }, []);

  const students = Array.from(state.students.values());

  return {
    students,
    violations: state.violations,
    isConnected: state.isConnected,
    lastUpdate: state.lastUpdate,
    forceSubmit,
    remoteUnlock,
    flagSession,
    refresh: loadSnapshot,
  };
}
