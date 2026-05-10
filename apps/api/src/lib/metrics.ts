import client, { Counter, Histogram } from 'prom-client';

/**
 * Prometheus metrics. Registered on the default registry; exposed at
 * GET /metrics by app.ts.
 */
export const registry = client.register;

// Default Node.js / process metrics (event loop lag, GC, RSS, etc.)
client.collectDefaultMetrics({ register: registry });

export const examsStartedTotal = new Counter({
  name: 'secureexam_exams_started_total',
  help: 'Number of exam sessions started',
  labelNames: ['schoolId'] as const,
});

export const violationsTotal = new Counter({
  name: 'secureexam_violations_total',
  help: 'Total violations recorded',
  labelNames: ['type'] as const,
});

export const authFailuresTotal = new Counter({
  name: 'secureexam_auth_failures_total',
  help: 'Failed login attempts',
  labelNames: ['reason'] as const,
});

export const otpAttemptsTotal = new Counter({
  name: 'secureexam_otp_attempts_total',
  help: 'OTP verify attempts',
  labelNames: ['result'] as const,
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
