/**
 * Generate an Idempotency-Key per logical write so retries don't double-write.
 *
 * Usage:
 *   const idem = useIdempotency();
 *   api.post('/sessions/x/answer', body, { headers: idem.headers('answer-q1') });
 *
 * The key is stable per (logical-id, browser tab session). If the network
 * request fails and is retried, the same key is sent — the server replays
 * the cached response. A new logical-id (e.g. answering a different
 * question) yields a new key.
 */
import { useRef } from 'react';

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useIdempotency() {
  const map = useRef(new Map<string, string>());

  function keyFor(logicalId: string): string {
    let k = map.current.get(logicalId);
    if (!k) {
      k = uuid();
      map.current.set(logicalId, k);
    }
    return k;
  }

  function headers(logicalId: string): Record<string, string> {
    return { 'Idempotency-Key': keyFor(logicalId) };
  }

  function reset(logicalId: string) {
    map.current.delete(logicalId);
  }

  return { keyFor, headers, reset };
}
