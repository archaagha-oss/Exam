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
  const ok = await canProctorExam(req.user.sub, req.user.role, session.examId);
  if (!ok) {
    res.status(403).json({ error: 'Access denied to this exam' });
    return;
  }

  const findings = await analyzeSession(req.params.id);
  res.json({ data: findings });
});

// GET /api/v1/integrity/exams/:id  — aggregate over all submitted sessions
router.get('/exams/:id', async (req: Request, res: Response) => {
  const ok = await canProctorExam(req.user.sub, req.user.role, req.params.id);
  if (!ok) {
    res.status(403).json({ error: 'Access denied to this exam' });
    return;
  }
  const sessions = await prisma.examSession.findMany({
    where: { examId: req.params.id, submittedAt: { not: null } },
    select: { id: true, studentId: true, student: { select: { name: true, email: true } } },
  });
  const out: { sessionId: string; student: any; findings: any[] }[] = [];
  for (const s of sessions) {
    const findings = await analyzeSession(s.id);
    if (findings.length) out.push({ sessionId: s.id, student: s.student, findings });
  }
  res.json({ data: out });
});

export default router;
