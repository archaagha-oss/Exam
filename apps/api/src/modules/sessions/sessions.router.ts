// apps/api/src/modules/sessions/sessions.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, isStudent, isTeacher } from '../../middleware/auth';
import { canProctorExam, audit } from '../../lib/examAccess';
import { idempotency } from '../../middleware/idempotency';
import {
  getStudentExams,
  startSession,
  saveAnswer,
  recordViolation,
  submitSession,
  verifyPin,
} from './sessions.service';

const router = Router();
router.use(authenticate);

router.get('/my', isStudent, async (req: Request, res: Response) => {
  const exams = await getStudentExams(req.user.sub, req.user.schoolId!);
  res.json({ data: exams });
});

// Proctor live snapshot — before /:id
router.get('/exam/:examId/live', isTeacher, async (req: Request, res: Response) => {
  const allowed = await canProctorExam(req.user.sub, req.user.role, req.params.examId);
  if (!allowed) {
    res.status(403).json({ error: 'Access denied to this exam' });
    return;
  }
  const { getExamSnapshots } = await import('../../websocket/server');
  const sessions = await getExamSnapshots(req.params.examId);
  res.json({ data: sessions });
});

router.post('/', isStudent, async (req: Request, res: Response) => {
  const schema = z.object({ examId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  try {
    const state = await startSession(
      req.user.sub,
      parsed.data.examId,
      req.ip || 'unknown',
      req.headers['user-agent'] || 'unknown'
    );
    res.status(201).json({ data: state });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id', isStudent, async (req: Request, res: Response) => {
  const prisma = (await import('../../lib/prisma')).default;
  const session = await prisma.examSession.findUnique({
    where: { id: req.params.id },
    include: {
      exam: { include: { items: { include: { question: true }, orderBy: { order: 'asc' } } } },
      answers: true,
    },
  });
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  if (session.studentId !== req.user.sub) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json({ data: session });
});

router.post(
  '/:id/answer',
  isStudent,
  idempotency('answer'),
  async (req: Request, res: Response) => {
    const schema = z.object({
      questionId: z.string().uuid(),
      selectedIds: z.array(z.string()).optional(),
      textAnswer: z.string().optional(),
      timeSpentSeconds: z.number().int().min(0).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input' });
      return;
    }
    const answer = await saveAnswer(
      req.params.id,
      parsed.data.questionId,
      parsed.data.selectedIds,
      parsed.data.textAnswer,
      parsed.data.timeSpentSeconds
    );
    res.json({ data: answer });
  }
);

router.post(
  '/:id/violation',
  isStudent,
  idempotency('violation'),
  async (req: Request, res: Response) => {
    const schema = z.object({
      type: z.enum([
        'TAB_SWITCH',
        'FULLSCREEN_EXIT',
        'RIGHT_CLICK',
        'KEYBOARD_SHORTCUT',
        'COPY_PASTE',
        'FOCUS_LOST',
      ]),
      description: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input' });
      return;
    }
    const result = await recordViolation(req.params.id, parsed.data.type, parsed.data.description);
    res.json({ data: result });
  }
);

router.post(
  '/:id/submit',
  isStudent,
  idempotency('submit'),
  async (req: Request, res: Response) => {
    try {
      const result = await submitSession(req.params.id, 'STUDENT');
      res.json({ data: result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.post('/:id/unlock', isStudent, async (req: Request, res: Response) => {
  const schema = z.object({ pin: z.string().min(4).max(8), examId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  const valid = await verifyPin(parsed.data.examId, 'UNLOCK', parsed.data.pin);
  if (!valid) {
    res.status(401).json({ error: 'Incorrect PIN' });
    return;
  }
  const prisma = (await import('../../lib/prisma')).default;
  await prisma.examSession.update({
    where: { id: req.params.id },
    data: { status: 'IN_PROGRESS' },
  });
  res.json({ data: { unlocked: true } });
});

router.post('/:id/exit', isStudent, async (req: Request, res: Response) => {
  const schema = z.object({ pin: z.string().min(4).max(8), examId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  const valid = await verifyPin(parsed.data.examId, 'EXIT', parsed.data.pin);
  if (!valid) {
    res.status(401).json({ error: 'Incorrect PIN' });
    return;
  }
  const result = await submitSession(req.params.id, 'STUDENT');
  res.json({ data: result });
});

// ── Proctor endpoints ─────────────────────────────────────

async function requireProctorAccess(
  req: Request,
  res: Response,
  examIdFn: () => Promise<string | null>
): Promise<boolean> {
  const examId = await examIdFn();
  if (!examId) {
    res.status(404).json({ error: 'Session not found' });
    return false;
  }
  const allowed = await canProctorExam(req.user.sub, req.user.role, examId);
  if (!allowed) {
    res.status(403).json({ error: 'Access denied to this exam' });
    return false;
  }
  return true;
}

router.get('/:id/violations', isTeacher, async (req: Request, res: Response) => {
  const prisma = (await import('../../lib/prisma')).default;
  const session = await prisma.examSession.findUnique({
    where: { id: req.params.id },
    select: { examId: true },
  });
  const ok = await requireProctorAccess(req, res, async () => session?.examId ?? null);
  if (!ok) return;
  const violations = await prisma.violation.findMany({
    where: { sessionId: req.params.id },
    orderBy: { occurredAt: 'asc' },
  });
  res.json({ data: violations });
});

router.post('/:id/force-submit', isTeacher, async (req: Request, res: Response) => {
  const prisma = (await import('../../lib/prisma')).default;
  const session = await prisma.examSession.findUnique({
    where: { id: req.params.id },
    select: { examId: true },
  });
  const ok = await requireProctorAccess(req, res, async () => session?.examId ?? null);
  if (!ok) return;
  const result = await submitSession(req.params.id, 'AUTO');
  const { sendToSession } = await import('../../websocket/server');
  sendToSession(req.params.id, {
    type: 'session:force_submit',
    payload: { reason: 'Submitted by instructor' },
    timestamp: new Date().toISOString(),
  });
  await audit(req.user.sub, 'SESSION_FORCE_SUBMITTED', 'ExamSession', req.params.id, {
    examId: session?.examId,
  });
  res.json({ data: result });
});

router.post('/:id/remote-unlock', isTeacher, async (req: Request, res: Response) => {
  const prisma = (await import('../../lib/prisma')).default;
  const session = await prisma.examSession.findUnique({
    where: { id: req.params.id },
    select: { examId: true },
  });
  const ok = await requireProctorAccess(req, res, async () => session?.examId ?? null);
  if (!ok) return;
  await prisma.examSession.update({
    where: { id: req.params.id },
    data: { status: 'IN_PROGRESS' },
  });
  const { sendToSession } = await import('../../websocket/server');
  sendToSession(req.params.id, {
    type: 'session:unlocked',
    payload: { by: 'instructor' },
    timestamp: new Date().toISOString(),
  });
  await audit(req.user.sub, 'SESSION_REMOTE_UNLOCKED', 'ExamSession', req.params.id, {});
  res.json({ data: { unlocked: true } });
});

router.post('/:id/flag', isTeacher, async (req: Request, res: Response) => {
  const schema = z.object({ reason: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  const prisma = (await import('../../lib/prisma')).default;
  const session = await prisma.examSession.findUnique({
    where: { id: req.params.id },
    select: { examId: true },
  });
  const ok = await requireProctorAccess(req, res, async () => session?.examId ?? null);
  if (!ok) return;
  await prisma.violation.create({
    data: {
      sessionId: req.params.id,
      type: 'MANUAL_FLAG',
      description:
        parsed.success && parsed.data.reason ? parsed.data.reason : 'Flagged by instructor',
    },
  });
  await prisma.examSession.update({
    where: { id: req.params.id },
    data: { violationCount: { increment: 1 } },
  });
  await audit(req.user.sub, 'SESSION_FLAGGED', 'ExamSession', req.params.id, {
    reason: parsed.success ? parsed.data.reason : '',
  });
  res.json({ data: { flagged: true } });
});

export default router;
