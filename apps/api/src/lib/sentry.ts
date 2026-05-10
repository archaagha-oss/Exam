/**
 * Sentry integration (cycle 1.4 / P1-10).
 *
 * Optional by design: every function here is a no-op when SENTRY_DSN is
 * unset. dev/test/staging without a DSN still boots and runs tests. In
 * production, the deploy bundle pins @sentry/node and the DSN is supplied
 * via the deploy environment.
 *
 * @sentry/node is loaded via dynamic import so this file does not hard-fail
 * builds in environments where the dependency isn't installed yet (e.g. the
 * cycle-1.4 PR before package-lock.json is regenerated).
 */
import { logger } from './logger';

interface SentryShim {
  init: (opts: Record<string, unknown>) => void;
  captureException: (err: unknown, scope?: Record<string, unknown>) => void;
  setUser: (user: Record<string, unknown> | null) => void;
}

let sentry: SentryShim | null = null;
let initialised = false;

export async function initSentry(): Promise<void> {
  if (initialised) return;
  initialised = true;

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return; // No DSN ⇒ no-op. Expected in dev / test / unconfigured staging.

  try {
    // Dynamic import so the package is only required when actually used.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('@sentry/node').catch(() => null);
    if (!mod) {
      logger.warn(
        '[sentry] SENTRY_DSN is set but @sentry/node is not installed; skipping init'
      );
      return;
    }
    mod.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      release: process.env.SENTRY_RELEASE ?? process.env.GIT_SHA ?? undefined,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
      // PII and request bodies stay out — we deal with student records and
      // exam content. Audit/compliance posture (FERPA, COPPA, GDPR) means
      // Sentry sees errors, not data.
      sendDefaultPii: false,
      beforeSend: (event: Record<string, unknown>) => {
        // Strip request bodies / cookies / auth headers if Sentry's default
        // capture sneaks them in.
        const req = (event as { request?: Record<string, unknown> }).request;
        if (req) {
          delete (req as Record<string, unknown>).cookies;
          delete (req as Record<string, unknown>).data;
          const headers = (req as { headers?: Record<string, unknown> }).headers;
          if (headers) {
            delete headers['authorization'];
            delete headers['cookie'];
            delete headers['idempotency-key'];
          }
        }
        return event;
      },
    });
    sentry = mod;
    logger.info('[sentry] initialised');
  } catch (err) {
    logger.warn({ err }, '[sentry] init failed; continuing without Sentry');
  }
}

export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  if (!sentry) return;
  try {
    sentry.captureException(err, { extra: context });
  } catch {
    // Swallow — Sentry must never break the request path.
  }
}
