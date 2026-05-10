// apps/api/src/modules/reports/reports.router.ts
import { Router, Request, Response } from 'express';
import { authenticate, isTeacher } from '../../middleware/auth';
import { tenantScope } from '../../lib/examAccess';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, isTeacher);

// GET /api/v1/reports/exams/:id  — full results for an exam
router.get('/exams/:id', async (req: Request, res: Response) => {
  const exam = await prisma.exam.findFirst({
    where: { id: req.params.id, ...tenantScope(req.user.role, req.user.schoolId) },
    include: {
      items: {
        include: { question: { select: { id: true, body: true, type: true, correctIds: true } } },
        orderBy: { order: 'asc' },
      },
      sessions: {
        include: {
          student: { select: { id: true, name: true, email: true } },
          answers: true,
          violations: true,
        },
      },
    },
  });

  if (!exam) { res.status(404).json({ error: 'Exam not found' }); return; }

  const submittedSessions = exam.sessions.filter((s) =>
    ['SUBMITTED', 'AUTO_SUBMITTED'].includes(s.status)
  );

  const scores = submittedSessions.map((s) => (s.score ?? 0) / (s.totalPoints || 1));
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const passRate = exam.passingScore
    ? scores.filter((s) => s * 100 >= (exam.passingScore ?? 0)).length / (scores.length || 1)
    : null;

  // Per-question breakdown
  const questionBreakdown = exam.items.map((item) => {
    const q = item.question;
    const answers = exam.sessions.flatMap((s) =>
      s.answers.filter((a) => a.questionId === q.id)
    );
    const correct = answers.filter((a) => a.isCorrect === true).length;
    return {
      questionId: q.id,
      body: q.body.slice(0, 80) + (q.body.length > 80 ? '…' : ''),
      type: q.type,
      totalAnswered: answers.length,
      correctCount: correct,
      percentCorrect: answers.length ? Math.round((correct / answers.length) * 100) : 0,
    };
  });

  // Per-student results
  const studentResults = exam.sessions.map((s) => {
    const timeTaken = s.startedAt && s.submittedAt
      ? Math.round((new Date(s.submittedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)
      : null;
    const pct = s.totalPoints ? Math.round(((s.score ?? 0) / s.totalPoints) * 100) : null;

    return {
      sessionId: s.id,
      student: s.student,
      status: s.status,
      score: s.score,
      totalPoints: s.totalPoints,
      percentage: pct,
      passed: exam.passingScore && pct !== null ? pct >= exam.passingScore : null,
      violationCount: s.violationCount,
      startedAt: s.startedAt,
      submittedAt: s.submittedAt,
      timeTaken,
    };
  });

  res.json({
    data: {
      exam: { id: exam.id, title: exam.title, passingScore: exam.passingScore },
      summary: {
        totalStudents: exam.sessions.length,
        submitted: submittedSessions.length,
        averageScore: Math.round(avgScore * 100),
        passRate: passRate !== null ? Math.round(passRate * 100) : null,
      },
      questionBreakdown,
      studentResults,
    },
  });
});

// GET /api/v1/reports/exams/:id/sessions/:sessionId  — single student detail
router.get('/exams/:id/sessions/:sessionId', async (req: Request, res: Response) => {
  const session = await prisma.examSession.findFirst({
    where: {
      id: req.params.sessionId,
      examId: req.params.id,
      exam: tenantScope(req.user.role, req.user.schoolId),
    },
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
  res.json({ data: session });
});

export default router;
