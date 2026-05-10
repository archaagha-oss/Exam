// apps/api/src/lib/wsBroadcast.ts
//
// Cycle 3.0a / 3.0b — D7: WS broadcast abstraction.
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
// (2) and (3) are split into two implementations behind one interface:
//
//   InProcessBroadcaster      Default. Single-process. Used for dev and
//                             single-replica production.
//
//   RedisPubSubBroadcaster    Cycle 3.0b. For D7 Option 2 (5k concurrent
//                             students, multi-replica deploy). Each
//                             replica still tracks its own local sockets;
//                             outbound broadcasts/sends go through Redis
//                             pub/sub so a message originated on replica A
//                             also reaches sockets on replica B. Set
//                             WS_BROADCASTER=redis-pubsub + REDIS_URL to
//                             enable.
//
// The WS server doesn't know which implementation is in use. The factory
// at the bottom of this file picks based on env.

import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { logger } from './logger';

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
 * Cycle 3.0b: Redis pub/sub fan-out for multi-replica deploys.
 *
 * Wraps an inner InProcessBroadcaster (handles local routing) and adds:
 *   - publisher: pushes every outbound broadcast/send to Redis
 *   - subscriber: receives messages from peer replicas and routes to
 *     local sockets via the inner broadcaster
 *
 * Origin tagging dedupes the loop — a replica that publishes also receives
 * its own message back via subscriber; we discard those by origin uuid.
 *
 * Membership ops (register/unregister session sockets, join/leave proctor
 * rooms) stay LOCAL — each replica only knows its own sockets. When a
 * `sendToSession(sid)` arrives on replica B and `sid` isn't connected to
 * B, B's local send is a no-op. The replica that owns `sid` does the
 * actual send. No sticky-session routing required.
 *
 * Init is best-effort: if ioredis fails to load or the connection errors,
 * we log and keep the local-only behaviour. The system degrades to
 * single-replica visibility rather than crashing the API.
 */
type BroadcastEnvelope =
  | { kind: 'session'; target: string; message: object; origin: string }
  | { kind: 'proctors'; target: string; message: object; origin: string };

class RedisPubSubBroadcaster implements WsBroadcaster {
  private readonly local = new InProcessBroadcaster();
  private readonly origin = randomUUID();
  private readonly channel: string;

  // ioredis types are not loaded statically because the package isn't a
  // direct import — it's already in node_modules via the kv path
  // (`apps/api/src/lib/redis.ts`). Using `any` here keeps the abstraction
  // callable even if the package upgrade changes its TS surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private publisher: any | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private subscriber: any | null = null;

  constructor(redisUrl: string, channel = 'ws:broadcast') {
    this.channel = channel;
    void this.init(redisUrl);
  }

  private async init(redisUrl: string): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Redis = require('ioredis');
      this.publisher = new Redis(redisUrl);
      this.subscriber = new Redis(redisUrl);

      this.subscriber.on('message', (ch: string, raw: string) => {
        if (ch !== this.channel) return;
        let env: BroadcastEnvelope;
        try {
          env = JSON.parse(raw);
        } catch {
          return;
        }
        // Skip our own messages — we already sent locally before publishing
        if (env.origin === this.origin) return;
        if (env.kind === 'session') {
          this.local.sendToSession(env.target, env.message);
        } else {
          this.local.broadcastToProctors(env.target, env.message);
        }
      });

      this.subscriber.on('error', (err: Error) => {
        logger.error({ err: err.message }, '[wsBroadcast] subscriber error');
      });
      this.publisher.on('error', (err: Error) => {
        logger.error({ err: err.message }, '[wsBroadcast] publisher error');
      });

      await this.subscriber.subscribe(this.channel);
      logger.info({ channel: this.channel }, '[wsBroadcast] Redis pub/sub broadcaster ready');
    } catch (err) {
      logger.warn(
        { err: (err as Error).message },
        '[wsBroadcast] Redis init failed; running in degraded local-only mode'
      );
      this.publisher = null;
      this.subscriber = null;
    }
  }

  // ── Membership: local-only ──────────────────────────────
  registerSessionSocket(sessionId: string, ws: WebSocket): void {
    this.local.registerSessionSocket(sessionId, ws);
  }
  unregisterSessionSocket(sessionId: string): void {
    this.local.unregisterSessionSocket(sessionId);
  }
  joinProctorRoom(examId: string, ws: WebSocket): void {
    this.local.joinProctorRoom(examId, ws);
  }
  leaveProctorRoom(examId: string, ws: WebSocket): void {
    this.local.leaveProctorRoom(examId, ws);
  }
  iterateSessionSockets(): IterableIterator<[string, WebSocket]> {
    return this.local.iterateSessionSockets();
  }
  getSessionSocket(sessionId: string): WebSocket | undefined {
    return this.local.getSessionSocket(sessionId);
  }
  hasSessionSocket(sessionId: string): boolean {
    return this.local.hasSessionSocket(sessionId);
  }

  // ── Broadcasts: send local + publish to peers ───────────
  broadcastToProctors(examId: string, message: object): void {
    this.local.broadcastToProctors(examId, message);
    this.publishEnvelope({ kind: 'proctors', target: examId, message, origin: this.origin });
  }

  sendToSession(sessionId: string, message: object): void {
    this.local.sendToSession(sessionId, message);
    this.publishEnvelope({ kind: 'session', target: sessionId, message, origin: this.origin });
  }

  private publishEnvelope(env: BroadcastEnvelope): void {
    if (!this.publisher) return; // Degraded mode: local-only, peers won't see this
    this.publisher.publish(this.channel, JSON.stringify(env)).catch((err: Error) => {
      logger.error(
        { err: err.message, kind: env.kind },
        '[wsBroadcast] publish failed; message did not reach peer replicas'
      );
    });
  }
}

/**
 * Pick the broadcaster implementation. Default: in-process (single
 * replica). Set `WS_BROADCASTER=redis-pubsub` + `REDIS_URL` to opt into
 * cycle 3.0b's multi-replica fan-out.
 *
 * If the env var asks for redis-pubsub but REDIS_URL is unset, we log
 * and fall back to in-process — better to run degraded than to fail
 * the API boot.
 */
function makeBroadcaster(): WsBroadcaster {
  const want = (process.env.WS_BROADCASTER ?? 'in-process').toLowerCase();
  if (want === 'redis-pubsub') {
    const url = process.env.REDIS_URL;
    if (!url) {
      logger.warn(
        '[wsBroadcast] WS_BROADCASTER=redis-pubsub but REDIS_URL is unset; falling back to in-process'
      );
      return new InProcessBroadcaster();
    }
    return new RedisPubSubBroadcaster(url);
  }
  return new InProcessBroadcaster();
}

/**
 * Process-singleton broadcaster. The factory above picks the implementation
 * once at module load. The WS server and REST routes import this and don't
 * know (or care) which is in play.
 */
export const broadcaster: WsBroadcaster = makeBroadcaster();
