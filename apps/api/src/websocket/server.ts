// apps/api/src/websocket/server.ts
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { verifyAccessToken } from '../lib/jwt';
import prisma from '../lib/prisma';

export interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  role: string;
  sessionId?: string;
  examId?: string;
  lastHeartbeat: number;
  isStale: boolean;
}

// sessionId → student client
export const sessionClients = new Map<string, AuthenticatedClient>();
// examId → Set of proctor websockets
export const proctorRooms = new Map<string, Set<WebSocket>>();

const STALE_THRESHOLD_MS = 45_000; // 45s without heartbeat = stale
const HEARTBEAT_CHECK_MS = 15_000; // check every 15s

export function setupWebSocket(server: http.Server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    // Accept the "bearer.<jwt>" subprotocol so clients can send the token
    // in a header instead of the URL query string (which gets logged).
    handleProtocols: (protocols) => {
      for (const p of protocols) {
        if (p.startsWith('bearer.')) return p;
      }
      // No bearer subprotocol — accept any other protocol the client offered
      // (or none) so legacy ?token= clients still work.
      return false;
    },
  });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId') ?? undefined;
    const examId = url.searchParams.get('examId') ?? undefined;

    // Token auth: prefer Sec-WebSocket-Protocol subprotocol header
    // (NOT logged by proxies), fall back to ?token= for backward compat.
    // Subprotocol format: "bearer.<jwt>"
    const subprotoHeader = (req.headers['sec-websocket-protocol'] as string | undefined) ?? '';
    const protoTokens = subprotoHeader
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const subprotoToken = protoTokens.find((p) => p.startsWith('bearer.'))?.slice('bearer.'.length);
    const queryToken = url.searchParams.get('token');
    const token = subprotoToken || queryToken;

    if (!token) {
      ws.close(4001, 'Missing token');
      return;
    }

    let user: any;
    try {
      user = verifyAccessToken(token);
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    const client: AuthenticatedClient = {
      ws,
      userId: user.sub,
      role: user.role,
      sessionId,
      examId,
      lastHeartbeat: Date.now(),
      isStale: false,
    };

    if (sessionId) sessionClients.set(sessionId, client);

    if (examId && ['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      // Phase 3: enforce access control before joining proctor room
      const { canProctorExam } = await import('../lib/examAccess');
      const allowed = await canProctorExam(user.sub, user.role, examId);
      if (!allowed) {
        ws.close(4003, 'Access denied to this exam');
        return;
      }
      if (!proctorRooms.has(examId)) proctorRooms.set(examId, new Set());
      proctorRooms.get(examId)!.add(ws);
    }

    ws.send(
      JSON.stringify({
        type: 'connected',
        payload: { userId: user.sub, role: user.role },
        timestamp: new Date().toISOString(),
      })
    );

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleMessage(client, msg);
      } catch {
        /* ignore malformed */
      }
    });

    ws.on('close', () => {
      if (sessionId) {
        sessionClients.delete(sessionId);
        // Notify proctors this student disconnected
        if (examId) {
          broadcastToProctors(examId, {
            type: 'proctor:student_disconnected',
            payload: { sessionId },
            timestamp: new Date().toISOString(),
          });
        }
      }
      if (examId) proctorRooms.get(examId)?.delete(ws);
    });

    ws.on('error', () => {
      if (sessionId) sessionClients.delete(sessionId);
    });
  });

  // ── Stale heartbeat checker ──────────────────────────────
  setInterval(async () => {
    const now = Date.now();
    for (const [sid, client] of sessionClients) {
      const age = now - client.lastHeartbeat;

      if (age > STALE_THRESHOLD_MS && !client.isStale) {
        client.isStale = true;
        // Mark session as potentially disconnected in DB
        try {
          await prisma.examSession.updateMany({
            where: { id: sid, status: 'IN_PROGRESS' },
            data: { updatedAt: new Date() }, // touch updatedAt so proctor sees activity
          });
        } catch {
          /* session may already be done */
        }

        // Alert proctors
        if (client.examId) {
          const session = await prisma.examSession
            .findUnique({
              where: { id: sid },
              include: { student: { select: { name: true } } },
            })
            .catch(() => null);

          broadcastToProctors(client.examId, {
            type: 'proctor:student_stale',
            payload: {
              sessionId: sid,
              studentName: session?.student.name ?? 'Unknown',
              lastSeen: new Date(client.lastHeartbeat).toISOString(),
            },
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Remove truly dead connections
      if (client.ws.readyState !== WebSocket.OPEN) {
        sessionClients.delete(sid);
      }
    }
  }, HEARTBEAT_CHECK_MS);

  console.log('🔌 WebSocket server ready at /ws');
}

// ── Message handler ──────────────────────────────────────────

async function handleMessage(client: AuthenticatedClient, msg: any) {
  const { type, payload } = msg;
  const ts = new Date().toISOString();

  switch (type) {
    // ── Student: heartbeat ──
    case 'session:heartbeat': {
      client.lastHeartbeat = Date.now();
      client.isStale = false;
      client.ws.send(JSON.stringify({ type: 'pong', payload: {}, timestamp: ts }));

      // Broadcast live progress snapshot to proctors
      if (client.sessionId && client.examId) {
        const snapshot = await buildSessionSnapshot(client.sessionId);
        if (snapshot) {
          broadcastToProctors(client.examId, {
            type: 'proctor:update',
            payload: snapshot,
            timestamp: ts,
          });
        }
      }
      break;
    }

    // ── Student: save answer ──
    case 'session:answer': {
      if (!payload.sessionId || !payload.questionId) break;
      const { saveAnswer } = await import('../modules/sessions/sessions.service');
      await saveAnswer(
        payload.sessionId,
        payload.questionId,
        payload.selectedIds,
        payload.textAnswer
      );
      client.ws.send(
        JSON.stringify({
          type: 'answer:saved',
          payload: { questionId: payload.questionId },
          timestamp: ts,
        })
      );

      // Push updated snapshot to proctors
      if (client.examId) {
        const snapshot = await buildSessionSnapshot(payload.sessionId);
        if (snapshot)
          broadcastToProctors(client.examId, {
            type: 'proctor:update',
            payload: snapshot,
            timestamp: ts,
          });
      }
      break;
    }

    // ── Student: violation ──
    case 'session:violation': {
      if (!payload.sessionId || !payload.type) break;
      const { recordViolation, submitSession } =
        await import('../modules/sessions/sessions.service');
      const result = await recordViolation(payload.sessionId, payload.type, payload.description);

      client.ws.send(
        JSON.stringify({
          type: result.shouldLock ? 'session:locked' : 'violation:recorded',
          payload: { violationCount: result.violationCount, maxViolations: result.maxViolations },
          timestamp: ts,
        })
      );

      if (result.shouldLock) {
        await submitSession(payload.sessionId, 'AUTO');
        client.ws.send(
          JSON.stringify({
            type: 'session:force_submit',
            payload: { reason: 'Maximum violations reached' },
            timestamp: ts,
          })
        );
      }

      // Notify proctors of the violation in real time
      if (client.examId) {
        const session = await prisma.examSession
          .findUnique({
            where: { id: payload.sessionId },
            include: { student: { select: { name: true } } },
          })
          .catch(() => null);

        broadcastToProctors(client.examId, {
          type: 'proctor:violation',
          payload: {
            sessionId: payload.sessionId,
            studentName: session?.student.name ?? 'Unknown',
            violationType: payload.type,
            violationCount: result.violationCount,
            maxViolations: result.maxViolations,
            autoSubmitted: result.shouldLock,
          },
          timestamp: ts,
        });

        // Also push updated snapshot
        const snapshot = await buildSessionSnapshot(payload.sessionId);
        if (snapshot)
          broadcastToProctors(client.examId, {
            type: 'proctor:update',
            payload: snapshot,
            timestamp: ts,
          });
      }
      break;
    }

    // ── Proctor: request full snapshot of all sessions ──
    case 'proctor:request_snapshot': {
      if (!['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(client.role)) break;
      if (!payload.examId) break;
      const sessions = await getExamSnapshots(payload.examId);
      client.ws.send(
        JSON.stringify({
          type: 'proctor:full_snapshot',
          payload: { sessions },
          timestamp: ts,
        })
      );
      break;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

async function buildSessionSnapshot(sessionId: string) {
  try {
    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        student: { select: { id: true, name: true, email: true } },
        exam: { select: { durationMinutes: true, _count: { select: { items: true } } } },
        _count: { select: { answers: true, violations: true } },
      },
    });
    if (!session) return null;

    const secondsRemaining = session.startedAt
      ? Math.max(
          0,
          Math.floor(
            (new Date(session.startedAt).getTime() +
              session.exam.durationMinutes * 60_000 -
              Date.now()) /
              1000
          )
        )
      : null;

    const wsClient = sessionClients.get(sessionId);

    return {
      sessionId: session.id,
      student: session.student,
      status: session.status,
      violationCount: session.violationCount,
      answeredCount: session._count.answers,
      totalQuestions: session.exam._count.items,
      secondsRemaining,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      score: session.score,
      totalPoints: session.totalPoints,
      isConnected: wsClient
        ? wsClient.ws.readyState === WebSocket.OPEN && !wsClient.isStale
        : false,
    };
  } catch {
    return null;
  }
}

async function getExamSnapshots(examId: string) {
  const sessions = await prisma.examSession.findMany({
    where: { examId },
    include: {
      student: { select: { id: true, name: true, email: true } },
      exam: {
        select: { durationMinutes: true, maxViolations: true, _count: { select: { items: true } } },
      },
      _count: { select: { answers: true, violations: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return sessions.map((s) => {
    const secondsRemaining = s.startedAt
      ? Math.max(
          0,
          Math.floor(
            (new Date(s.startedAt).getTime() + s.exam.durationMinutes * 60_000 - Date.now()) / 1000
          )
        )
      : null;
    const wsClient = sessionClients.get(s.id);
    return {
      sessionId: s.id,
      student: s.student,
      status: s.status,
      violationCount: s.violationCount,
      maxViolations: s.exam.maxViolations,
      answeredCount: s._count.answers,
      totalQuestions: s.exam._count.items,
      secondsRemaining,
      startedAt: s.startedAt,
      submittedAt: s.submittedAt,
      score: s.score,
      totalPoints: s.totalPoints,
      isConnected: wsClient
        ? wsClient.ws.readyState === WebSocket.OPEN && !wsClient.isStale
        : false,
    };
  });
}

// ── Exports used by REST routes ──────────────────────────────

export function broadcastToProctors(examId: string, message: object) {
  const sockets = proctorRooms.get(examId);
  if (!sockets) return;
  const data = JSON.stringify(message);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

export function sendToSession(sessionId: string, message: object) {
  const client = sessionClients.get(sessionId);
  if (client?.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

export { getExamSnapshots, buildSessionSnapshot };
