// apps/api/src/modules/student-results/student-results.router.ts
import { Router, Request, Response } from 'express';
import { authenticate, isStudent } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, isStudent);

/**
 * GET /api/v1/student/results
 * All submitted exams for the current student — summary list.
 */
router.get('/results', async (req: Request, res: Response) => {
  const sessions = await prisma.examSession.findMany({
    where: {
      studentId: req.user.sub,
      status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
    },
    include: {
      exam: {
        select: {
          id: true,
          title: true,
          description: true,
          passingScore: true,
          showResultsAfter: true,
          durationMinutes: true,
          _count: { select: { items: true } },
        },
      },
    },
    orderBy: { submittedAt: 'desc' },
  });

  const results = sessions.map(s => {
    const pct = s.totalPoints ? Math.round(((s.score ?? 0) / s.totalPoints) * 100) : null;
    const timeTaken = s.startedAt && s.submittedAt
      ? Math.round((new Date(s.submittedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)
      : null;

    return {
      sessionId: s.id,
      examId: s.exam.id,
      title: s.exam.title,
      description: s.exam.description,
      status: s.status,
      score: s.exam.showResultsAfter ? s.score : null,
      totalPoints: s.exam.showResultsAfter ? s.totalPoints : null,
      percentage: s.exam.showResultsAfter ? pct : null,
      passed: s.exam.showResultsAfter && s.exam.passingScore && pct !== null
        ? pct >= s.exam.passingScore
        : null,
      passingScore: s.exam.passingScore,
      violationCount: s.violationCount,
      submittedAt: s.submittedAt,
      timeTaken,
      totalQuestions: s.exam._count.items,
      showResults: s.exam.showResultsAfter,
    };
  });

  res.json({ data: results });
});

/**
 * GET /api/v1/student/results/:sessionId
 * Full answer review for one exam session.
 * Only shows correct answers if exam.showResultsAfter = true.
 */
router.get('/results/:sessionId', async (req: Request, res: Response) => {
  const session = await prisma.examSession.findUnique({
    where: { id: req.params.sessionId },
    include: {
      exam: {
        include: {
          items: {
            include: { question: true },
            orderBy: { order: 'asc' },
          },
        },
      },
      answers: true,
    },
  });

  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  if (session.studentId !== req.user.sub) { res.status(403).json({ error: 'Forbidden' }); return; }
  if (!['SUBMITTED', 'AUTO_SUBMITTED'].includes(session.status)) {
    res.status(400).json({ error: 'Exam not yet submitted' }); return;
  }

  const showResults = session.exam.showResultsAfter;
  const answerMap = new Map(session.answers.map(a => [a.questionId, a]));

  const items = session.exam.items.map((item, idx) => {
    const q = item.question;
    const answer = answerMap.get(q.id);
    const isManual = ['SHORT_TEXT', 'ESSAY'].includes(q.type);

    return {
      order: idx + 1,
      questionId: q.id,
      type: q.type,
      body: q.body,
      mediaUrl: q.mediaUrl,
      options: q.options,
      // Only show correct answers if showResultsAfter is enabled
      correctIds: showResults ? q.correctIds : null,
      rubric: showResults && isManual ? q.rubric : null,
      maxPoints: item.points ?? q.points,
      answer: answer
        ? {
            selectedIds: answer.selectedIds,
            textAnswer: answer.textAnswer,
            isCorrect: showResults ? answer.isCorrect : null,
            points: showResults ? answer.points : null,
          }
        : null,
    };
  });

  const pct = session.totalPoints
    ? Math.round(((session.score ?? 0) / session.totalPoints) * 100)
    : null;
  const timeTaken = session.startedAt && session.submittedAt
    ? Math.round((new Date(session.submittedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
    : null;

  res.json({
    data: {
      session: {
        id: session.id,
        status: session.status,
        submittedAt: session.submittedAt,
        violationCount: session.violationCount,
        timeTaken,
      },
      exam: {
        id: session.exam.id,
        title: session.exam.title,
        passingScore: session.exam.passingScore,
        showResultsAfter: showResults,
      },
      summary: showResults
        ? {
            score: session.score,
            totalPoints: session.totalPoints,
            percentage: pct,
            passed: session.exam.passingScore && pct !== null
              ? pct >= session.exam.passingScore
              : null,
          }
        : null,
      items,
    },
  });
});

export default router;
