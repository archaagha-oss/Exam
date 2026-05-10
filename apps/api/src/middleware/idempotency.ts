/**
 * Idempotency-Key middleware. If the client sends the same key twice within
 * the TTL, the second request returns the cached response from the first.
 *
 * Use this on session writes (answer, violation, submit) where a network
 * retry could otherwise create duplicates.
 *
 * Header: Idempotency-Key: <uuid or any opaque string, max 128 chars>
 */
import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';

const TTL_SECONDS = 600; // 10 minutes
const MAX_KEY_LEN = 128;

interface CachedResponse {
  status: number;
  body: unknown;
}

export function idempotency(prefix: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.header('idempotency-key');
    if (!key) return next();
    if (key.length > MAX_KEY_LEN) {
      res.status(400).json({ error: 'Idempotency-Key too long' });
      return;
    }
    const userId = req.user?.sub ?? 'anon';
    const cacheKey = `idem:${prefix}:${userId}:${key}`;

    const cached = await redis().get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as CachedResponse;
        res.status(parsed.status).json(parsed.body);
        return;
      } catch {
        // Fall through and re-execute
      }
    }

    // Patch res.json so we can capture the response and store it.
    const originalJson = res.json.bind(res);
    (res as Response).json = (body: unknown) => {
      const status = res.statusCode;
      // Only cache successful responses (2xx)
      if (status >= 200 && status < 300) {
        redis()
          .set(cacheKey, JSON.stringify({ status, body }), 'EX', TTL_SECONDS)
          .catch(() => {});
      }
      return originalJson(body);
    };

    next();
  };
}
