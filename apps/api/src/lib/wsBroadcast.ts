// apps/api/src/lib/wsBroadcast.ts
//
// Cycle 3.0a / D7: WS broadcast abstraction.
//
// The WS server (`apps/api/src/websocket/server.ts`) used to own three
// concerns at once:
//   1. Auth state per connection (AuthenticatedClient + heartbeat tracking)
//   2. Routing maps (sessionId → socket, examId → Set<socket>)
//   3. The actual send / broadcast operations
//
// (1) is genuinely WS-server-internal — it knows about the JWT, the
// student, the proctor room membership rules. It stays.
//
// (2) and (3) are the things that need to span replicas once cycle 3.0b
// wires Redis pub/sub fan-out (D7 Option 2 = ~5k concurrent students,
// multi-replica deploy). This file is the single seam where today's
// in-process implementation gets swapped for a Redis-backed one — the
// WS server and any REST route that does `sendToSession` go through
// this interface, so the swap is one file plus tests.
//
// Today's behaviour: identical to the previous in-process logic. The
// only change is that the maps now live behind a getter and the helpers
// take their inputs through method calls, so 3.0b can drop in a
// different implementation without touching call sites.

import { WebSocket } from 'ws';

export interface WsBroadcaster {
  /** Register the (one) authenticated socket for a student session. */
  registerSessionSocket(sessionId: string, ws: WebSocket): void;
  unregisterSessionSocket(sessionId: string): void;

  /** Add / remove a proctor socket from an exam's broadcast room. */
  joinProctorRoom(examId: string, ws: WebSocket): void;
  leaveProctorRoom(examId: string, ws: WebSocket): void;

  /** Send `message` (will be JSON.stringify'd) to every proctor of `examId`. */
  broadcastToProctors(examId: string, message: object): void;

  /** Send `message` to the student socket for `sessionId`, if connected. */
  sendToSession(sessionId: string, message: object): void;

  /** Read-only access for the stale-heartbeat checker in the WS server. */
  iterateSessionSockets(): IterableIterator<[string, WebSocket]>;
  getSessionSocket(sessionId: string): WebSocket | undefined;
  hasSessionSocket(sessionId: string): boolean;
}

/**
 * Default in-process implementation. Shipped with cycle 3.0a; replaced by
 * the Redis pub/sub variant in cycle 3.0b. The two implementations share
 * this interface so the WS server doesn't change.
 */
class InProcessBroadcaster implements WsBroadcaster {
  // sessionId → student socket
  private readonly sessionSockets = new Map<string, WebSocket>();
  // examId → Set of proctor sockets
  private readonly proctorRooms = new Map<string, Set<WebSocket>>();

  registerSessionSocket(sessionId: string, ws: WebSocket): void {
    this.sessionSockets.set(sessionId, ws);
  }
  unregisterSessionSocket(sessionId: string): void {
    this.sessionSockets.delete(sessionId);
  }

  joinProctorRoom(examId: string, ws: WebSocket): void {
    let room = this.proctorRooms.get(examId);
    if (!room) {
      room = new Set();
      this.proctorRooms.set(examId, room);
    }
    room.add(ws);
  }
  leaveProctorRoom(examId: string, ws: WebSocket): void {
    this.proctorRooms.get(examId)?.delete(ws);
  }

  broadcastToProctors(examId: string, message: object): void {
    const sockets = this.proctorRooms.get(examId);
    if (!sockets || sockets.size === 0) return;
    const data = JSON.stringify(message);
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }

  sendToSession(sessionId: string, message: object): void {
    const ws = this.sessionSockets.get(sessionId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  iterateSessionSockets(): IterableIterator<[string, WebSocket]> {
    return this.sessionSockets.entries();
  }
  getSessionSocket(sessionId: string): WebSocket | undefined {
    return this.sessionSockets.get(sessionId);
  }
  hasSessionSocket(sessionId: string): boolean {
    return this.sessionSockets.has(sessionId);
  }
}

/**
 * Process-singleton broadcaster. Cycle 3.0b will replace the constructor
 * call with a factory keyed off `WS_BROADCASTER` env (`in-process` |
 * `redis-pubsub`); for now there's only one option, but the indirection
 * exists so callers don't import the implementation class directly.
 */
export const broadcaster: WsBroadcaster = new InProcessBroadcaster();
