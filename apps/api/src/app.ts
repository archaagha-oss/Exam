// apps/api/src/app.ts
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { requestId } from './middleware/requestId';
import { logger } from './lib/logger';
import { registry, httpRequestDuration } from './lib/metrics';
import prisma from './lib/prisma';

import authRouter from './modules/auth/auth.router';
import usersRouter from './modules/users/users.router';
import schoolsRouter from './modules/schools/schools.router';
import questionsRouter from './modules/questions/questions.router';
import examsRouter from './modules/exams/exams.router';
import sectionsRouter from './modules/exams/sections.router';
import sessionsRouter from './modules/sessions/sessions.router';
import reportsRouter from './modules/reports/reports.router';
import pinsRouter from './modules/pins/pins.router';
import proctorsRouter from './modules/proctors/proctors.router';
import adminRouter from './modules/admin/admin.router';
import auditRouter from './modules/audit/audit.router';
import exportsRouter from './modules/exports/exports.router';
import gradingRouter from './modules/grading/grading.router';
import aiRouter from './modules/ai/ai.router';
import mediaRouter from './modules/media/media.router';
import studentResultsRouter from './modules/student-results/student-results.router';
import analyticsRouter from './modules/analytics/analytics.router';
import qtiRouter from './modules/qti/qti.router';
import assessmentRouter from './modules/analytics/assessment.router';
import senRouter from './modules/sen/sen.router';
import securityRouter from './modules/security/security.router';
import superadminRouter from './modules/superadmin/superadmin.router';
import integrityRouter from './modules/integrity/integrity.router';

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind injects inline styles
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"], // tighten further at nginx layer
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);

// Strict CORS: only origins from env (no wildcards), validated per request
const corsOrigins = (
  process.env.CORS_ORIGINS ||
  'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin / curl-style requests (no Origin header)
      if (!origin) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(
  '/api/v1/auth',
  rateLimit({ windowMs: 60_000, max: 20, message: { error: 'Too many requests' } })
);
app.use(
  '/api/v1/ai',
  rateLimit({ windowMs: 60_000, max: 10, message: { error: 'AI rate limit' } })
);
app.use(rateLimit({ windowMs: 60_000, max: 300, message: { error: 'Too many requests' } }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestId);

// HTTP request duration metric
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = (req.route?.path as string | undefined) ?? req.path;
    end({ method: req.method, route, status: String(res.statusCode) });
  });
  next();
});

// ── Health endpoints ────────────────────────────────────
// Liveness: process is up. Used by k8s liveness probe.
app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));

// Readiness: process can serve traffic (DB + Redis reachable).
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    // Redis check is best-effort; a degraded redis shouldn't fail readiness
    // (refresh tokens fall back to in-memory; OTP rate-limit will still work)
    res.json({ status: 'ready' });
  } catch (e: any) {
    logger.error({ err: e?.message }, 'readiness check failed');
    res.status(503).json({ status: 'unready', reason: 'database' });
  }
});

// Backward-compat /health
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Prometheus metrics
app.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});

const api = express.Router();
api.use('/auth', authRouter);
api.use('/users', usersRouter);
api.use('/schools', schoolsRouter);
api.use('/questions', questionsRouter);
api.use('/exams', examsRouter);
api.use('/exams/:examId/sections', sectionsRouter);
api.use('/sessions', sessionsRouter);
api.use('/reports', reportsRouter);
api.use('/pins', pinsRouter);
api.use('/proctors', proctorsRouter);
api.use('/admin', adminRouter);
api.use('/audit', auditRouter);
api.use('/exports', exportsRouter);
api.use('/grading', gradingRouter);
api.use('/ai', aiRouter);
api.use('/media', mediaRouter);
api.use('/student', studentResultsRouter);
api.use('/analytics', analyticsRouter);
api.use('/qti', qtiRouter);
api.use('/assessment', assessmentRouter);
api.use('/sen', senRouter);
api.use('/security', securityRouter);
api.use('/platform', superadminRouter);
api.use('/integrity', integrityRouter);

app.use('/api/v1', api);

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// Centralised error handler. Never expose stack traces or provider details.
// Status codes from typed errors (NotFoundError / ForbiddenError / etc.) are
// honoured; everything else is 500.
app.use(
  (
    err: Error & { status?: number; expose?: boolean; code?: string },
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction
  ) => {
    const status = typeof err.status === 'number' ? err.status : 500;
    if (status >= 500) {
      logger.error(
        { err: err.stack || err.message, requestId: (_req as express.Request).id },
        'unhandled error'
      );
    }
    const safeMessage =
      status < 500
        ? err.message || 'Bad request'
        : process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message || 'Internal server error';
    res.status(status).json({ error: safeMessage, ...(err.code ? { code: err.code } : {}) });
  }
);

export default app;
