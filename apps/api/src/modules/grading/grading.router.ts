// apps/api/src/modules/grading/grading.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, isTeacher } from '../../middleware/auth';
import { canProctorExam, audit } from '../../lib/examAccess';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, isTeacher);

/**
 * GET /api/v1/grading/exams/:examId/pending
 * Returns all sessions with ungraded SHORT_TEXT or ESSAY answers.
 * Groups by student session so the teacher grades one student at a time.
 */
router.get('/exams/:examId/pending', async (req: Request, res: Response) => {
  const allowed = await canProctorExam(req.user.sub, req.user.role, req.user.schoolId, req.params.examId);
  if (!allowed) { res.status(403).json({ error: 'Access denied' }); return; }

  const sessions = await prisma.examSession.findMany({
    where: {
      examId: req.params.examId,
      status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
      answers: {
        some: {
          isCorrect: null,
          question: { type: { in: ['SHORT_TEXT', 'ESSAY'] } },
        },
      },
    },
    include: {
      student: { select: { id: true, name: true, email: true } },
      answers: {
        where: {
          question: { type: { in: ['SHORT_TEXT', 'ESSAY'] } },
        },
        include: {
          question: {
            select: { id: true, body: true, type: true, rubric: true, points: true },
          },
        },
        orderBy: { answeredAt: 'asc' },
      },
    },
    orderBy: { submittedAt: 'asc' },
  });

  // For each session compute grading progress
  const result = sessions.map(s => {
    const total = s.answers.length;
    const graded = s.answers.filter(a => a.isCorrect !== null).length;
    return {
      sessionId: s.id,
      student: s.student,
      status: s.status,
      submittedAt: s.submittedAt,
      gradingProgress: { graded, total },
      answers: s.answers.map(a => ({
        answerId: a.id,
        questionId: a.questionId,
        question: a.question,
        textAnswer: a.textAnswer,
        isGraded: a.isCorrect !== null,
        points: a.points,
        maxPoints: a.question.points,
      })),
    };
  });

  res.json({ data: result });
});

/**
 * GET /api/v1/grading/exams/:examId/sessions/:sessionId
 * Full grading view for one student — all question types, with context.
 */
router.get('/exams/:examId/sessions/:sessionId', async (req: Request, res: Response) => {
  const allowed = await canProctorExam(req.user.sub, req.user.role, req.user.schoolId, req.params.examId);
  if (!allowed) { res.status(403).json({ error: 'Access denied' }); return; }

  const session = await prisma.examSession.findUnique({
    where: { id: req.params.sessionId },
    include: {
      student: { select: { id: true, name: true, email: true } },
      exam: {
        include: {
          items: {
            include: { question: true },
            orderBy: { order: 'asc' },
          },
        },
      },
      answers: true,
      violations: { orderBy: { occurredAt: 'asc' } },
    },
  });

  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  // Build enriched answer list
  const answerMap = new Map(session.answers.map(a => [a.questionId, a]));

  const gradingItems = session.exam.items.map((item, idx) => {
    const q = item.question;
    const answer = answerMap.get(q.id);
    const isManual = ['SHORT_TEXT', 'ESSAY'].includes(q.type);
    const pts = item.points ?? q.points;

    return {
      order: idx + 1,
      questionId: q.id,
      type: q.type,
      body: q.body,
      mediaUrl: q.mediaUrl,
      rubric: q.rubric,
      maxPoints: pts,
      options: q.options,
      correctIds: isManual ? null : q.correctIds, // hide from UI for auto-graded
      answer: answer
        ? {
            answerId: answer.id,
            selectedIds: answer.selectedIds,
            textAnswer: answer.textAnswer,
            isCorrect: answer.isCorrect,
            points: answer.points,
            isManual,
            needsGrading: isManual && answer.isCorrect === null && answer.textAnswer,
          }
        : null,
    };
  });

  const earnedSoFar = session.answers.reduce((s, a) => s + (a.points ?? 0), 0);
  const totalPoints = session.exam.items.reduce((s, i) => s + (i.points ?? i.question.points), 0);
  const ungradedCount = gradingItems.filter(i => i.answer?.needsGrading).length;

  res.json({
    data: {
      session: {
        id: session.id,
        studentId: session.studentId,
        status: session.status,
        violationCount: session.violationCount,
        startedAt: session.startedAt,
        submittedAt: session.submittedAt,
      },
      student: session.student,
      exam: { id: session.exam.id, title: session.exam.title, passingScore: session.exam.passingScore },
      gradingItems,
      summary: { earnedSoFar, totalPoints, ungradedCount },
      violations: session.violations,
    },
  });
});

/**
 * POST /api/v1/grading/answers/:answerId
 * Grade a single short-text or essay answer.
 * Body: { points: number, feedback?: string }
 */
router.post('/answers/:answerId', async (req: Request, res: Response) => {
  const schema = z.object({
    points: z.number().min(0),
    feedback: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  // Fetch answer with context to check exam access
  const answer = await prisma.studentAnswer.findUnique({
    where: { id: req.params.answerId },
    include: {
      session: {
        include: {
          exam: { select: { id: true, teacherId: true } },
        },
      },
      question: { select: { points: true } },
    },
  });

  if (!answer) { res.status(404).json({ error: 'Answer not found' }); return; }

  const allowed = await canProctorExam(req.user.sub, req.user.role, req.user.schoolId, answer.session.exam.id);
  if (!allowed) { res.status(403).json({ error: 'Access denied' }); return; }

  // Clamp points to max
  const maxPoints = answer.question.points;
  const awarded = Math.min(parsed.data.points, maxPoints);
  const isCorrect = awarded >= maxPoints; // full marks = correct

  const updated = await prisma.studentAnswer.update({
    where: { id: req.params.answerId },
    data: {
      points: awarded,
      isCorrect,
      textAnswer: answer.textAnswer
        ? `${answer.textAnswer}${parsed.data.feedback ? `\n\n[Feedback: ${parsed.data.feedback}]` : ''}`
        : answer.textAnswer,
    },
  });

  // Recompute session total score after this grade
  await recomputeSessionScore(answer.sessionId);

  res.json({ data: updated });
});

/**
 * POST /api/v1/grading/sessions/:sessionId/finalize
 * Marks session as fully graded — useful after all essays graded.
 * Sets any still-null essay answers to 0 points.
 */
router.post('/sessions/:sessionId/finalize', async (req: Request, res: Response) => {
  const session = await prisma.examSession.findUnique({
    where: { id: req.params.sessionId },
    include: { exam: { select: { id: true } } },
  });
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  const allowed = await canProctorExam(req.user.sub, req.user.role, req.user.schoolId, session.exam.id);
  if (!allowed) { res.status(403).json({ error: 'Access denied' }); return; }

  // Zero out any ungraded manual answers
  await prisma.studentAnswer.updateMany({
    where: { sessionId: req.params.sessionId, isCorrect: null },
    data: { points: 0, isCorrect: false },
  });

  await recomputeSessionScore(req.params.sessionId);
  await audit(req.user.sub, 'SESSION_FLAGGED', 'ExamSession', req.params.sessionId, { action: 'grading_finalized' });

  res.json({ data: { finalized: true } });
});

// ── Helper: recompute session.score from all graded answers ──
async function recomputeSessionScore(sessionId: string) {
  const answers = await prisma.studentAnswer.findMany({
    where: { sessionId },
    select: { points: true },
  });

  const score = answers.reduce((s, a) => s + (a.points ?? 0), 0);

  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
    include: {
      exam: {
        include: { items: { include: { question: { select: { points: true } } } } },
      },
    },
  });

  const totalPoints = session?.exam.items.reduce(
    (s, i) => s + (i.points ?? i.question.points), 0
  ) ?? 0;

  await prisma.examSession.update({
    where: { id: sessionId },
    data: { score, totalPoints },
  });
}

export default router;
