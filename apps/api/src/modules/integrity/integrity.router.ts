// apps/api/src/modules/integrity/integrity.router.ts
import { Router, Request, Response } from 'express';
import { authenticate, isTeacher } from '../../middleware/auth';
import { canProctorExam } from '../../lib/examAccess';
import prisma from '../../lib/prisma';
import { analyzeSession } from './integrity.service';

const router = Router();
router.use(authenticate, isTeacher);

// GET /api/v1/integrity/sessions/:id
router.get('/sessions/:id', async (req: Request, res: Response) => {
  const session = await prisma.examSession.findUnique({
    where: { id: req.params.id },
    select: { examId: true },
  });
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  const ok = await canProctorExam(req.user.sub, req.user.role, req.user.schoolId, session.examId);
  if (!ok) {
    res.status(403).json({ error: 'Access denied to this exam' });
    return;
  }

  const findings = await analyzeSession(req.params.id);
  res.json({ data: findings });
});

// GET /api/v1/integrity/exams/:id  — aggregate over all submitted sessions
router.get('/exams/:id', async (req: Request, res: Response) => {
  const ok = await canProctorExam(req.user.sub, req.user.role, req.user.schoolId, req.params.id);
  if (!ok) {
    res.status(403).json({ error: 'Access denied to this exam' });
    return;
  }
  const sessions = await prisma.examSession.findMany({
    where: { examId: req.params.id, submittedAt: { not: null } },
    select: { id: true, studentId: true, student: { select: { name: true, email: true } } },
  });

  // Cycle 2.1b / audit P2: was a sequential await over `sessions`. For an
  // exam with 100+ students that's 100+ sequential round-trips — easily a
  // multi-second blocking response. Promise.all parallelises against the
  // Prisma connection pool (10 by default); a hundred concurrent
  // analyzeSession calls queue cheaply rather than serializing.
  const analyses = await Promise.all(
    sessions.map(async (s) => ({
      sessionId: s.id,
      student: s.student,
      findings: await analyzeSession(s.id),
    }))
  );
  const out = analyses.filter((a) => a.findings.length > 0);
  res.json({ data: out });
});

export default router;
