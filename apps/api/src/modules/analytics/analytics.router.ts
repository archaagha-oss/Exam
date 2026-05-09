// apps/api/src/modules/analytics/analytics.router.ts
import { Router, Request, Response } from 'express';
import { authenticate, isTeacher } from '../../middleware/auth';
import { canProctorExam } from '../../lib/examAccess';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, isTeacher);

/**
 * GET /api/v1/analytics/exams/:id
 * Per-exam analytics: question difficulty index, time analysis, violation breakdown.
 */
router.get('/exams/:id', async (req: Request, res: Response) => {
  const ok = await canProctorExam(req.user.sub, req.user.role, req.params.id);
  if (!ok) { res.status(403).json({ error: 'Access denied' }); return; }

  const exam = await prisma.exam.findUnique({
    where: { id: req.params.id },
    include: {
      items: {
        include: { question: true },
        orderBy: { order: 'asc' },
      },
      sessions: {
        where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
        include: {
          answers: true,
          violations: true,
        },
      },
    },
  });

  if (!exam) { res.status(404).json({ error: 'Exam not found' }); return; }

  const submitted = exam.sessions;
  if (submitted.length === 0) {
    res.json({ data: { message: 'No submissions yet', exam: { id: exam.id, title: exam.title } } });
    return;
  }

  // ── Score distribution ──
  const scores = submitted
    .filter(s => s.totalPoints)
    .map(s => Math.round(((s.score ?? 0) / s.totalPoints!) * 100));

  const scoreDistribution = {
    '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0,
  } as Record<string, number>;
  scores.forEach(s => {
    if (s <= 20) scoreDistribution['0-20']++;
    else if (s <= 40) scoreDistribution['21-40']++;
    else if (s <= 60) scoreDistribution['41-60']++;
    else if (s <= 80) scoreDistribution['61-80']++;
    else scoreDistribution['81-100']++;
  });

  // ── Time analysis ──
  const times = submitted
    .filter(s => s.startedAt && s.submittedAt)
    .map(s => Math.round(
      (new Date(s.submittedAt!).getTime() - new Date(s.startedAt!).getTime()) / 1000
    ));
  const avgTime = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  const minTime = times.length ? Math.min(...times) : 0;
  const maxTime = times.length ? Math.max(...times) : 0;

  // ── Question difficulty index ──
  const questionAnalysis = exam.items.map(item => {
    const q = item.question;
    const allAnswers = submitted.flatMap(s => s.answers.filter(a => a.questionId === q.id));
    const answered = allAnswers.length;
    const correct = allAnswers.filter(a => a.isCorrect === true).length;
    const skipped = submitted.length - answered;

    // Discrimination index: correlation between answering correctly and scoring well
    // Simplified: % correct in top half minus % correct in bottom half
    const half = Math.floor(submitted.length / 2);
    const sorted = [...submitted].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const topHalf = sorted.slice(0, half);
    const bottomHalf = sorted.slice(half);

    const topCorrect = topHalf.filter(s =>
      s.answers.find(a => a.questionId === q.id && a.isCorrect === true)
    ).length;
    const bottomCorrect = bottomHalf.filter(s =>
      s.answers.find(a => a.questionId === q.id && a.isCorrect === true)
    ).length;

    const discriminationIndex = half > 0
      ? Math.round(((topCorrect / half) - (bottomCorrect / half)) * 100) / 100
      : 0;

    // Difficulty category
    const pctCorrect = answered > 0 ? (correct / answered) * 100 : 0;
    const difficultyCategory =
      pctCorrect >= 80 ? 'too_easy' :
      pctCorrect >= 50 ? 'appropriate' :
      pctCorrect >= 20 ? 'challenging' :
      'too_hard';

    return {
      order: item.order,
      questionId: q.id,
      body: q.body.slice(0, 80) + (q.body.length > 80 ? '…' : ''),
      type: q.type,
      maxPoints: item.points ?? q.points,
      answered,
      correct,
      skipped,
      percentCorrect: answered > 0 ? Math.round((correct / answered) * 100) : 0,
      discriminationIndex,
      difficultyCategory,
      averageTimeOnQuestion: null, // future: track per-question time
    };
  });

  // ── Violation analysis ──
  const violationCounts: Record<string, number> = {};
  submitted.forEach(s => {
    s.violations.forEach(v => {
      violationCounts[v.type] = (violationCounts[v.type] || 0) + 1;
    });
  });

  const studentsWithViolations = submitted.filter(s => s.violationCount > 0).length;
  const autoSubmitted = submitted.filter(s => s.status === 'AUTO_SUBMITTED').length;

  // ── Suspected cheating patterns ──
  // Flag students who: submitted very fast AND scored high AND had violations
  const suspectedPatterns = submitted
    .filter(s => {
      const timeTaken = s.startedAt && s.submittedAt
        ? (new Date(s.submittedAt!).getTime() - new Date(s.startedAt!).getTime()) / 1000
        : null;
      const pct = s.totalPoints ? ((s.score ?? 0) / s.totalPoints) * 100 : 0;
      const veryFast = timeTaken !== null && timeTaken < avgTime * 0.4;
      const highScore = pct > 85;
      const hasViolations = s.violationCount > 0;
      return veryFast && highScore && hasViolations;
    })
    .map(s => ({
      sessionId: s.id,
      score: s.score,
      totalPoints: s.totalPoints,
      violationCount: s.violationCount,
      timeTaken: s.startedAt && s.submittedAt
        ? Math.round((new Date(s.submittedAt!).getTime() - new Date(s.startedAt!).getTime()) / 1000)
        : null,
    }));

  res.json({
    data: {
      exam: { id: exam.id, title: exam.title, passingScore: exam.passingScore },
      overview: {
        totalSubmissions: submitted.length,
        averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        medianScore: scores.length ? scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)] : 0,
        passRate: exam.passingScore
          ? Math.round(scores.filter(s => s >= exam.passingScore!).length / scores.length * 100)
          : null,
        stdDeviation: scores.length > 1
          ? Math.round(Math.sqrt(
              scores.reduce((sum, s) => sum + Math.pow(s - (scores.reduce((a, b) => a + b, 0) / scores.length), 2), 0)
              / scores.length
            ))
          : 0,
      },
      scoreDistribution,
      timeAnalysis: { averageSeconds: avgTime, minSeconds: minTime, maxSeconds: maxTime },
      questionAnalysis,
      violationAnalysis: {
        studentsWithViolations,
        autoSubmitted,
        byType: violationCounts,
      },
      suspectedPatterns: {
        count: suspectedPatterns.length,
        sessions: suspectedPatterns,
      },
    },
  });
});

/**
 * GET /api/v1/analytics/class/:classId
 * Class-level performance trends across all exams.
 */
router.get('/class/:classId', async (req: Request, res: Response) => {
  const exams = await prisma.exam.findMany({
    where: {
      schoolId: req.user.schoolId!,
      assignments: { some: { classId: req.params.classId } },
      status: { in: ['ACTIVE', 'CLOSED', 'ARCHIVED'] },
    },
    include: {
      sessions: {
        where: {
          status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
          student: { classStudents: { some: { classId: req.params.classId } } },
        },
        select: { score: true, totalPoints: true, submittedAt: true, violationCount: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const trends = exams.map(exam => {
    const scores = exam.sessions
      .filter(s => s.totalPoints)
      .map(s => Math.round(((s.score ?? 0) / s.totalPoints!) * 100));

    return {
      examId: exam.id,
      examTitle: exam.title,
      date: exam.createdAt,
      submissions: exam.sessions.length,
      averageScore: scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
      passRate: exam.passingScore && scores.length
        ? Math.round(scores.filter(s => s >= exam.passingScore!).length / scores.length * 100)
        : null,
      totalViolations: exam.sessions.reduce((s, sess) => s + sess.violationCount, 0),
    };
  });

  const cls = await prisma.class.findUnique({
    where: { id: req.params.classId },
    select: { name: true, _count: { select: { students: true } } },
  });

  res.json({ data: { class: cls, trends } });
});

/**
 * GET /api/v1/analytics/school
 * School-wide overview for admin dashboard.
 */
router.get('/school', async (req: Request, res: Response) => {
  const schoolId = req.user.schoolId!;

  const [examCount, sessionCount, violationCount, recentExams] = await Promise.all([
    prisma.exam.count({ where: { schoolId } }),
    prisma.examSession.count({ where: { exam: { schoolId }, status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } } }),
    prisma.violation.count({ where: { session: { exam: { schoolId } } } }),
    prisma.exam.findMany({
      where: { schoolId, status: { in: ['ACTIVE', 'CLOSED'] } },
      include: {
        teacher: { select: { name: true } },
        _count: { select: { sessions: true } },
        sessions: {
          where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
          select: { score: true, totalPoints: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
  ]);

  const examSummaries = recentExams.map(e => {
    const scores = e.sessions
      .filter(s => s.totalPoints)
      .map(s => Math.round(((s.score ?? 0) / s.totalPoints!) * 100));
    return {
      id: e.id,
      title: e.title,
      teacher: e.teacher.name,
      status: e.status,
      sessionCount: e._count.sessions,
      averageScore: scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
    };
  });

  res.json({
    data: { examCount, sessionCount, violationCount, recentExams: examSummaries },
  });
});

export default router;
