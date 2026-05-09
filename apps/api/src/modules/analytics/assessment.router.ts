// apps/api/src/modules/analytics/assessment.router.ts
// Deep assessment analytics: answer distribution, time, tag performance, blueprints, feedback, certs
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, isTeacher, isStudent } from '../../middleware/auth';
import { canProctorExam } from '../../lib/examAccess';
import prisma from '../../lib/prisma';

const router = Router();

// ── EXAM BLUEPRINT (teacher) ───────────────────────────────────────────────

// GET /api/v1/assessment/exams/:id/blueprint
// Shows tag coverage, difficulty spread, question type balance for the exam
router.get('/exams/:id/blueprint', authenticate, isTeacher, async (req: Request, res: Response) => {
  const ok = await canProctorExam(req.user.sub, req.user.role, req.params.id);
  if (!ok) { res.status(403).json({ error: 'Access denied' }); return; }

  const exam = await prisma.exam.findUnique({
    where: { id: req.params.id },
    include: {
      items: {
        include: { question: { select: { tags: true, type: true, difficulty: true, points: true } } },
        orderBy: { order: 'asc' },
      },
    },
  });
  if (!exam) { res.status(404).json({ error: 'Not found' }); return; }

  const tagMap: Record<string, { count: number; points: number }> = {};
  const typeMap: Record<string, number> = {};
  const diffMap: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  let totalPoints = 0;

  for (const item of exam.items) {
    const q = item.question;
    const pts = (item.points ?? q.points) as number;
    totalPoints += pts;
    typeMap[q.type] = (typeMap[q.type] || 0) + 1;
    diffMap[q.difficulty as number] = (diffMap[q.difficulty as number] || 0) + 1;
    for (const tag of (q.tags as string[])) {
      if (!tagMap[tag]) tagMap[tag] = { count: 0, points: 0 };
      tagMap[tag].count++;
      tagMap[tag].points += pts;
    }
  }

  // Find gaps: tags in question bank not covered in this exam
  const allBankTags = await prisma.question.findMany({
    where: { schoolId: req.user.schoolId! },
    select: { tags: true },
    distinct: ['tags'],
  });
  const bankTagSet = new Set(allBankTags.flatMap(q => q.tags as string[]));
  const coveredTags = new Set(Object.keys(tagMap));
  const uncoveredBankTags = [...bankTagSet].filter(t => !coveredTags.has(t));

  res.json({
    data: {
      examId: exam.id,
      title: exam.title,
      totalQuestions: exam.items.length,
      totalPoints,
      tagCoverage: Object.entries(tagMap).map(([tag, v]) => ({
        tag,
        questionCount: v.count,
        points: v.points,
        percentage: Math.round((v.points / totalPoints) * 100),
      })).sort((a, b) => b.questionCount - a.questionCount),
      typeBreakdown: Object.entries(typeMap).map(([type, count]) => ({ type, count })),
      difficultySpread: {
        easy: diffMap[1],
        medium: diffMap[2],
        hard: diffMap[3],
      },
      uncoveredBankTags: uncoveredBankTags.slice(0, 20), // topics in bank not in exam
    },
  });
});

// ── ANSWER DISTRIBUTION (teacher) ─────────────────────────────────────────

// GET /api/v1/assessment/exams/:id/answer-distribution
// Per-question, per-option breakdown: count, %, avg time
router.get('/exams/:id/answer-distribution', authenticate, isTeacher, async (req: Request, res: Response) => {
  const ok = await canProctorExam(req.user.sub, req.user.role, req.params.id);
  if (!ok) { res.status(403).json({ error: 'Access denied' }); return; }

  const exam = await prisma.exam.findUnique({
    where: { id: req.params.id },
    include: {
      items: {
        include: { question: { select: { id: true, body: true, type: true, options: true, correctIds: true, points: true } } },
        orderBy: { order: 'asc' },
      },
      sessions: {
        where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'IN_PROGRESS'] } },
        include: { answers: true },
      },
    },
  });
  if (!exam) { res.status(404).json({ error: 'Not found' }); return; }

  const submittedSessions = exam.sessions.filter(s => ['SUBMITTED', 'AUTO_SUBMITTED'].includes(s.status));
  const totalRespondents = submittedSessions.length;

  const distribution = exam.items.map((item, idx) => {
    const q = item.question;
    const options = (q.options as any[]) ?? [];
    const correctIds = new Set<string>((q.correctIds as string[]) ?? []);

    const allAnswers = submittedSessions.flatMap(s => s.answers.filter(a => a.questionId === q.id));
    const answered = allAnswers.length;
    const skipped = totalRespondents - answered;

    const timings = allAnswers.map(a => (a as any).timeSpentSeconds).filter((t: any) => t != null);
    const avgTime = timings.length > 0 ? Math.round(timings.reduce((a: number, b: number) => a + b, 0) / timings.length) : null;

    const optionDist = options.map((opt: any) => {
      const picked = allAnswers.filter(a => {
        const ids = (a.selectedIds as string[]) ?? [];
        return ids.includes(opt.id);
      }).length;
      return {
        id: opt.id,
        text: opt.text,
        isCorrect: correctIds.has(opt.id),
        count: picked,
        percentage: answered > 0 ? Math.round((picked / answered) * 100) : 0,
      };
    });

    const correctCount = allAnswers.filter(a => a.isCorrect === true).length;

    return {
      order: idx + 1,
      questionId: q.id,
      body: q.body.slice(0, 100) + (q.body.length > 100 ? '…' : ''),
      type: q.type,
      maxPoints: item.points ?? q.points,
      scoringMode: (item as any).scoringMode ?? 'binary',
      negativeMarks: (item as any).negativeMarks ?? 0,
      answered,
      skipped,
      correctCount,
      percentCorrect: answered > 0 ? Math.round((correctCount / answered) * 100) : 0,
      avgTimeSeconds: avgTime,
      optionDistribution: optionDist,
    };
  });

  res.json({
    data: {
      totalRespondents,
      avgTimeSeconds: distribution.reduce((s, q) => s + (q.avgTimeSeconds ?? 0), 0),
      questions: distribution,
    },
  });
});

// ── TAG-BASED PERFORMANCE (teacher) ──────────────────────────────────────

// GET /api/v1/assessment/exams/:id/tag-performance
// For each tag in the exam, shows avg score across all students
router.get('/exams/:id/tag-performance', authenticate, isTeacher, async (req: Request, res: Response) => {
  const ok = await canProctorExam(req.user.sub, req.user.role, req.params.id);
  if (!ok) { res.status(403).json({ error: 'Access denied' }); return; }

  const exam = await prisma.exam.findUnique({
    where: { id: req.params.id },
    include: {
      items: {
        include: { question: { select: { id: true, tags: true, points: true } } },
      },
      sessions: {
        where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
        include: { answers: { select: { questionId: true, isCorrect: true, points: true } } },
      },
    },
  });
  if (!exam) { res.status(404).json({ error: 'Not found' }); return; }

  // Build tag → questions map
  const tagQuestions: Record<string, { questionId: string; maxPoints: number }[]> = {};
  for (const item of exam.items) {
    const tags = (item.question.tags as string[]) ?? [];
    const maxPts = (item.points ?? item.question.points) as number;
    for (const tag of tags) {
      if (!tagQuestions[tag]) tagQuestions[tag] = [];
      tagQuestions[tag].push({ questionId: item.questionId, maxPoints: maxPts });
    }
  }

  const tagPerf = Object.entries(tagQuestions).map(([tag, qs]) => {
    const totalMax = qs.reduce((s, q) => s + q.maxPoints, 0);
    const sessionScores = exam.sessions.map(session => {
      let earned = 0;
      for (const q of qs) {
        const ans = session.answers.find(a => a.questionId === q.questionId);
        earned += ans?.points ?? 0;
      }
      return totalMax > 0 ? Math.round((earned / totalMax) * 100) : 0;
    });
    const avg = sessionScores.length
      ? Math.round(sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length)
      : 0;
    return {
      tag,
      questionCount: qs.length,
      totalMaxPoints: totalMax,
      averageScore: avg,
      status: avg >= 80 ? 'strong' : avg >= 60 ? 'adequate' : 'weak',
    };
  }).sort((a, b) => a.averageScore - b.averageScore); // weakest first

  res.json({ data: tagPerf });
});

// ── CROSS-EXAM STUDENT PROGRESS (teacher) ─────────────────────────────────

// GET /api/v1/assessment/students/:studentId/progress
// Score history for a student across all exams they've taken
router.get('/students/:studentId/progress', authenticate, isTeacher, async (req: Request, res: Response) => {
  const sessions = await prisma.examSession.findMany({
    where: {
      studentId: req.params.studentId,
      status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
      exam: { schoolId: req.user.schoolId! },
    },
    include: {
      exam: {
        select: { id: true, title: true, passingScore: true },
      },
      answers: {
        include: { question: { select: { tags: true, points: true } } },
      },
    },
    orderBy: { submittedAt: 'asc' },
  });

  const student = await prisma.user.findUnique({
    where: { id: req.params.studentId },
    select: { id: true, name: true, email: true },
  });

  // Per-exam score history
  const history = sessions.map(s => ({
    examId: s.exam.id,
    examTitle: s.exam.title,
    submittedAt: s.submittedAt,
    score: s.score,
    totalPoints: s.totalPoints,
    percentage: s.totalPoints ? Math.round(((s.score ?? 0) / s.totalPoints) * 100) : null,
    passed: s.exam.passingScore && s.totalPoints
      ? Math.round(((s.score ?? 0) / s.totalPoints) * 100) >= s.exam.passingScore
      : null,
    violationCount: s.violationCount,
  }));

  // Aggregate tag weakness across all sessions
  const tagAccumulator: Record<string, { earned: number; max: number }> = {};
  for (const s of sessions) {
    for (const ans of s.answers) {
      const tags = (ans.question?.tags as string[]) ?? [];
      const maxPts = (ans.question?.points as number) ?? 1;
      const earned = ans.points ?? 0;
      for (const tag of tags) {
        if (!tagAccumulator[tag]) tagAccumulator[tag] = { earned: 0, max: 0 };
        tagAccumulator[tag].earned += earned;
        tagAccumulator[tag].max += maxPts;
      }
    }
  }

  const tagSummary = Object.entries(tagAccumulator).map(([tag, { earned, max }]) => ({
    tag,
    percentage: max > 0 ? Math.round((earned / max) * 100) : 0,
    status: max > 0
      ? (earned / max) >= 0.8 ? 'strong'
      : (earned / max) >= 0.6 ? 'adequate'
      : 'weak'
      : 'no data',
  })).sort((a, b) => a.percentage - b.percentage);

  res.json({ data: { student, history, tagSummary } });
});

// ── FEEDBACK (teacher write, student read) ────────────────────────────────

// POST /api/v1/assessment/sessions/:id/feedback  — teacher writes feedback
router.post('/sessions/:id/feedback', authenticate, isTeacher, async (req: Request, res: Response) => {
  const schema = z.object({ text: z.string().min(1).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const session = await prisma.examSession.findUnique({
    where: { id: req.params.id },
    select: { examId: true },
  });
  if (!session) { res.status(404).json({ error: 'Not found' }); return; }

  const ok = await canProctorExam(req.user.sub, req.user.role, session.examId);
  if (!ok) { res.status(403).json({ error: 'Access denied' }); return; }

  const feedback = await prisma.sessionFeedback.upsert({
    where: { sessionId: req.params.id },
    create: { sessionId: req.params.id, authorId: req.user.sub, text: parsed.data.text },
    update: { text: parsed.data.text, updatedAt: new Date() },
  });

  res.json({ data: feedback });
});

// POST /api/v1/assessment/sessions/:id/feedback/ai  — generate AI remediation
router.post('/sessions/:id/feedback/ai', authenticate, isTeacher, async (req: Request, res: Response) => {
  const session = await prisma.examSession.findUnique({
    where: { id: req.params.id },
    include: {
      exam: { select: { id: true, title: true } },
      answers: {
        include: { question: { select: { body: true, tags: true, correctIds: true, type: true } } },
      },
      student: { select: { name: true } },
    },
  });
  if (!session) { res.status(404).json({ error: 'Not found' }); return; }

  const ok = await canProctorExam(req.user.sub, req.user.role, session.exam.id);
  if (!ok) { res.status(403).json({ error: 'Access denied' }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured' }); return;
  }

  // Build weak-area context
  const tagScores: Record<string, { correct: number; total: number }> = {};
  const wrongQuestions: string[] = [];

  for (const ans of session.answers) {
    const tags = (ans.question?.tags as string[]) ?? [];
    for (const tag of tags) {
      if (!tagScores[tag]) tagScores[tag] = { correct: 0, total: 0 };
      tagScores[tag].total++;
      if (ans.isCorrect) tagScores[tag].correct++;
    }
    if (ans.isCorrect === false && ans.question?.body) {
      wrongQuestions.push(ans.question.body.slice(0, 100));
    }
  }

  const weakTags = Object.entries(tagScores)
    .filter(([, v]) => v.total > 0 && v.correct / v.total < 0.6)
    .map(([tag]) => tag);

  const prompt = `A student named ${session.student.name} just completed the exam "${session.exam.title}".

Weak areas (topics scoring below 60%): ${weakTags.length ? weakTags.join(', ') : 'none identified'}

Questions they answered incorrectly (up to 5):
${wrongQuestions.slice(0, 5).map((q, i) => `${i + 1}. ${q}`).join('\n')}

Write a short, encouraging, personalised study recommendation (3-4 sentences) for this student.
Focus on the weak topics. Suggest specific study strategies. Keep it constructive and actionable.
Do not repeat the question text back to them.`;

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const aiText = (message.content[0] as any).text;

    await prisma.sessionFeedback.upsert({
      where: { sessionId: req.params.id },
      create: { sessionId: req.params.id, authorId: req.user.sub, text: '', aiSuggested: aiText },
      update: { aiSuggested: aiText, updatedAt: new Date() },
    });

    res.json({ data: { suggestion: aiText, weakTags } });
  } catch (err: any) {
    res.status(500).json({ error: 'AI generation failed: ' + err.message });
  }
});

// GET /api/v1/assessment/sessions/:id/feedback  — student reads their feedback
router.get('/sessions/:id/feedback', authenticate, isStudent, async (req: Request, res: Response) => {
  const session = await prisma.examSession.findUnique({
    where: { id: req.params.id },
    select: { studentId: true },
  });
  if (!session) { res.status(404).json({ error: 'Not found' }); return; }
  if (session.studentId !== req.user.sub) { res.status(403).json({ error: 'Forbidden' }); return; }

  const feedback = await prisma.sessionFeedback.findUnique({ where: { sessionId: req.params.id } });
  res.json({ data: feedback });
});

// ── CERTIFICATES ──────────────────────────────────────────────────────────

// GET /api/v1/assessment/sessions/:id/certificate
// Returns certificate data (student or teacher)
router.get('/sessions/:id/certificate', authenticate, async (req: Request, res: Response) => {
  const cert = await prisma.examCertificate.findUnique({ where: { sessionId: req.params.id } });
  if (!cert) { res.status(404).json({ error: 'No certificate — exam not passed or not yet graded' }); return; }
  res.json({ data: cert });
});

export default router;
