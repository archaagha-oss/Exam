/**
 * Redis client for ephemeral state: refresh-token blacklist, OTP attempt
 * counters, idempotency keys, rate limit counters.
 *
 * Falls back to a no-op in-memory shim when REDIS_URL is unset (dev/test
 * convenience). Production must set REDIS_URL.
 */
import { env } from './env';

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<unknown>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

class MemoryRedis implements RedisLike {
  private store = new Map<string, { v: string; expiresAt?: number }>();

  async get(key: string) {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt && Date.now() > e.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return e.v;
  }

  async set(key: string, value: string, ...args: any[]) {
    let expiresAt: number | undefined;
    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] === 'string' && args[i].toUpperCase() === 'EX') {
        expiresAt = Date.now() + Number(args[i + 1]) * 1000;
      }
    }
    this.store.set(key, { v: value, expiresAt });
    return 'OK';
  }

  async del(key: string) {
    return this.store.delete(key) ? 1 : 0;
  }

  async incr(key: string) {
    const e = this.store.get(key);
    const n = (e ? Number(e.v) : 0) + 1;
    this.store.set(key, { v: String(n), expiresAt: e?.expiresAt });
    return n;
  }

  async expire(key: string, seconds: number) {
    const e = this.store.get(key);
    if (!e) return 0;
    e.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }
}

let client: RedisLike | null = null;

export function redis(): RedisLike {
  if (client) return client;
  const url = env().REDIS_URL;
  if (!url) {
    // eslint-disable-next-line no-console
    console.warn('[redis] REDIS_URL not set — using in-memory fallback (DO NOT use in production)');
    client = new MemoryRedis();
    return client;
  }
  // Lazy-load ioredis only when configured
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Redis = require('ioredis');
  client = new Redis(url) as unknown as RedisLike;
  return client;
}
