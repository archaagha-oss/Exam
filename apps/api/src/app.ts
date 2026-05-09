// apps/api/src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

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

const app = express();

app.use(helmet());
app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://localhost:5175').split(','),
  credentials: true,
}));

app.use('/api/v1/auth', rateLimit({ windowMs: 60_000, max: 20, message: { error: 'Too many requests' } }));
app.use('/api/v1/ai', rateLimit({ windowMs: 60_000, max: 10, message: { error: 'AI rate limit' } }));
app.use(rateLimit({ windowMs: 60_000, max: 300, message: { error: 'Too many requests' } }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

const api = express.Router();
api.use('/auth',           authRouter);
api.use('/users',          usersRouter);
api.use('/schools',        schoolsRouter);
api.use('/questions',      questionsRouter);
api.use('/exams',          examsRouter);
api.use('/exams/:examId/sections', sectionsRouter);
api.use('/sessions',       sessionsRouter);
api.use('/reports',        reportsRouter);
api.use('/pins',           pinsRouter);
api.use('/proctors',       proctorsRouter);
api.use('/admin',          adminRouter);
api.use('/audit',          auditRouter);
api.use('/exports',        exportsRouter);
api.use('/grading',        gradingRouter);
api.use('/ai',             aiRouter);
api.use('/media',          mediaRouter);
api.use('/student',        studentResultsRouter);
api.use('/analytics',      analyticsRouter);
api.use('/qti',            qtiRouter);
api.use('/assessment',     assessmentRouter);
api.use('/sen',            senRouter);
api.use('/security',       securityRouter);
api.use('/platform',       superadminRouter);

app.use('/api/v1', api);

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
