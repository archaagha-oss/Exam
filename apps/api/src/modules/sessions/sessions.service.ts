// apps/api/src/modules/sessions/sessions.service.ts
import prisma from '../../lib/prisma';

/**
 * Authoritative time-remaining for an in-progress session, accounting for
 * SEN extra-time and time spent in rest breaks. Returns 0 if the session has
 * already exceeded its window. Returns null only when the session has not
 * started yet (no startedAt). Used by both the REST GET /sessions/:id load
 * path and the WebSocket heartbeat (cycle 1.2 / P1-3) so the client never has
 * to be the source of truth on time.
 */
export async function computeSecondsRemaining(sessionId: string): Promise<number | null> {
  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
    select: {
      startedAt: true,
      studentId: true,
      exam: { select: { durationMinutes: true } },
    },
  });
  if (!session || !session.startedAt) return null;

  const senProfile = await prisma.studentAccessArrangement
    .findUnique({ where: { studentId: session.studentId } })
    .catch(() => null);

  const extraTimePct = senProfile?.extraTimePercent ?? 0;
  const adjustedDurationMs = Math.round(
    session.exam.durationMinutes * 60_000 * (1 + extraTimePct / 100)
  );

  const breaks = await prisma.restBreakLog
    .findMany({
      where: { sessionId },
      select: { durationSeconds: true },
    })
    .catch(() => []);
  const breakMs = breaks.reduce((s, b) => s + (b.durationSeconds ?? 0) * 1000, 0);

  const elapsed = Date.now() - new Date(session.startedAt).getTime();
  const netElapsed = Math.max(0, elapsed - breakMs);
  return Math.max(0, Math.round((adjustedDurationMs - netElapsed) / 1000));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function getStudentExams(studentId: string, schoolId: string) {
  const classIds = (
    await prisma.classStudent.findMany({ where: { studentId }, select: { classId: true } })
  ).map((c) => c.classId);

  const assignments = await prisma.examAssignment.findMany({
    where: { classId: { in: classIds } },
    include: {
      exam: {
        select: {
          id: true, title: true, description: true, status: true,
          durationMinutes: true, instructions: true, startsAt: true, endsAt: true,
          _count: { select: { items: true } },
        },
      },
    },
  });

  const sessions = await prisma.examSession.findMany({
    where: { studentId },
    select: { examId: true, status: true, score: true, totalPoints: true, submittedAt: true },
  });
  const sessionMap = new Map(sessions.map((s) => [s.examId, s]));

  return assignments
    .filter((a) => ['PUBLISHED', 'ACTIVE'].includes(a.exam.status))
    .map((a) => ({ exam: a.exam, session: sessionMap.get(a.exam.id) ?? null }));
}

export async function startSession(studentId: string, examId: string, ipAddress: string, userAgent: string) {
  const existing = await prisma.examSession.findUnique({
    where: { examId_studentId: { examId, studentId } },
    include: {
      exam: { include: { items: { include: { question: true }, orderBy: { order: 'asc' } } } },
      answers: true,
    },
  });

  if (existing) {
    if (['SUBMITTED', 'AUTO_SUBMITTED'].includes(existing.status)) throw new Error('Exam already submitted');
    return await buildSessionState(existing);
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { items: { include: { question: true }, orderBy: { order: 'asc' } } },
  });
  if (!exam) throw new Error('Exam not found');
  if (!['PUBLISHED', 'ACTIVE'].includes(exam.status)) throw new Error('Exam is not available');

  let items = exam.items;
  const questionOrder = exam.shuffleQuestions
    ? shuffle(items.map((i) => i.id))
    : items.map((i) => i.id);

  const optionOrders: Record<string, string[]> = {};
  if (exam.shuffleOptions) {
    for (const item of items) {
      const opts = (item.question.options as any[]) ?? [];
      optionOrders[item.questionId] = shuffle(opts.map((o: any) => o.id));
    }
  }

  const session = await prisma.examSession.create({
    data: {
      examId,
      studentId,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      questionOrder: questionOrder as any,
      optionOrders: optionOrders as any,
      ipAddress,
      userAgent,
    },
    include: {
      exam: { include: { items: { include: { question: true }, orderBy: { order: 'asc' } } } },
      answers: true,
    },
  });

  return await buildSessionState(session);
}

async function buildSessionState(session: any) {
  const exam = session.exam;
  const questionOrder: string[] = (session.questionOrder as string[]) ?? exam.items.map((i: any) => i.id);
  const optionOrders: Record<string, string[]> = (session.optionOrders as any) ?? {};

  const itemMap = new Map(exam.items.map((i: any) => [i.id, i]));

  const questions = questionOrder.map((itemId) => {
    const item = itemMap.get(itemId) as any;
    if (!item) return null;
    const q = item.question;
    let options = (q.options as any[]) ?? [];
    if (optionOrders[q.id]) {
      const orderMap = new Map(optionOrders[q.id].map((id: string, idx: number) => [id, idx]));
      options = [...options].sort((a: any, b: any) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    }
    return {
      id: q.id,
      type: q.type,
      body: q.body,
      mediaUrl: q.mediaUrl,
      options: ['SHORT_TEXT', 'ESSAY'].includes(q.type) ? [] : options,
      points: item.points ?? q.points,
      scoringMode: item.scoringMode ?? 'binary',
      negativeMarks: item.negativeMarks ?? 0,
    };
  }).filter(Boolean);

  const answerMap: Record<string, any> = {};
  for (const a of session.answers) {
    answerMap[a.questionId] = { selectedIds: a.selectedIds, textAnswer: a.textAnswer, points: a.points };
  }

  // ── SEN: load student's access arrangement ──────────────
  const senProfile = await prisma.studentAccessArrangement.findUnique({
    where: { studentId: session.studentId },
  }).catch(() => null);

  // Apply extra time percentage to duration
  const extraTimePct = senProfile?.extraTimePercent ?? 0;
  const adjustedDurationMinutes = Math.round(exam.durationMinutes * (1 + extraTimePct / 100));

  const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
  const durationMs = adjustedDurationMinutes * 60 * 1000;
  const elapsed = Date.now() - startedAt;

  // Subtract time spent in rest breaks from elapsed
  const breaks = await prisma.restBreakLog.findMany({
    where: { sessionId: session.id },
    select: { durationSeconds: true },
  }).catch(() => []);
  const breakSeconds = breaks.reduce((s: number, b: any) => s + (b.durationSeconds ?? 0), 0);
  const netElapsed = Math.max(0, elapsed - breakSeconds * 1000);

  const secondsRemaining = Math.max(0, Math.round((durationMs - netElapsed) / 1000));

  return {
    session: { id: session.id, status: session.status, violationCount: session.violationCount },
    exam: {
      id: exam.id,
      title: exam.title,
      durationMinutes: adjustedDurationMinutes,
      originalDurationMinutes: exam.durationMinutes,
      maxViolations: exam.maxViolations,
      instructions: exam.instructions,
      showResultsAfter: exam.showResultsAfter,
      calculatorType: (exam as any).calculatorType ?? null,
    },
    questions,
    answers: answerMap,
    secondsRemaining,
    // SEN accommodations sent to client — student UI applies them
    sen: senProfile ? {
      textToSpeech:       senProfile.textToSpeech,
      fontSizeOverride:   senProfile.fontSizeOverride,
      restBreaksAllowed:  senProfile.restBreaksAllowed,
      restBreakMinutes:   senProfile.restBreakMinutes,
      focusMode:          senProfile.focusMode,
      highContrastForced: senProfile.highContrastForced,
      extraTimePercent:   senProfile.extraTimePercent,
    } : null,
  };
}

export async function saveAnswer(
  sessionId: string,
  questionId: string,
  selectedIds?: string[],
  textAnswer?: string,
  timeSpentSeconds?: number
) {
  return prisma.studentAnswer.upsert({
    where: { sessionId_questionId: { sessionId, questionId } },
    create: { sessionId, questionId, selectedIds: selectedIds as any, textAnswer, timeSpentSeconds },
    update: { selectedIds: selectedIds as any, textAnswer, updatedAt: new Date(), timeSpentSeconds },
  });
}

export async function recordViolation(sessionId: string, type: string, description?: string) {
  const violation = await prisma.violation.create({
    data: { sessionId, type: type as any, description },
  });

  const session = await prisma.examSession.update({
    where: { id: sessionId },
    data: { violationCount: { increment: 1 } },
    select: { violationCount: true, exam: { select: { maxViolations: true } } },
  });

  const shouldLock = session.violationCount >= session.exam.maxViolations;
  if (shouldLock) {
    await prisma.examSession.update({ where: { id: sessionId }, data: { status: 'LOCKED' } });
  }

  return { violation, violationCount: session.violationCount, shouldLock };
}

// ── Advanced scoring engine ────────────────────────────────────────────────

function gradeAnswer(
  item: { points: number | null; scoringMode: string; negativeMarks: number; bonusPoints: number; question: { points: number; correctIds: any; type: string } },
  selectedIds: string[]
): { isCorrect: boolean; points: number } {
  const maxPts = item.points ?? item.question.points;
  const correctIds = new Set<string>((item.question.correctIds as string[]) ?? []);
  const scoringMode = item.scoringMode ?? 'binary';
  const q = item.question;

  if (q.type === 'MCQ' || q.type === 'TRUE_FALSE') {
    const isCorrect =
      selectedIds.length === correctIds.size &&
      selectedIds.every(id => correctIds.has(id));

    if (isCorrect) return { isCorrect: true, points: maxPts + (item.bonusPoints ?? 0) };

    // Negative marking
    const penalty = item.negativeMarks > 0 && selectedIds.length > 0 ? item.negativeMarks : 0;
    return { isCorrect: false, points: -penalty };
  }

  if (q.type === 'MCQ_MULTI') {
    if (scoringMode === 'partial') {
      // Partial credit: +1 per correct selection, -1 per wrong, minimum 0
      const correctSelected = selectedIds.filter(id => correctIds.has(id)).length;
      const wrongSelected = selectedIds.filter(id => !correctIds.has(id)).length;
      const raw = correctSelected - wrongSelected;
      const partial = Math.max(0, (raw / correctIds.size) * maxPts);
      const isCorrect = correctSelected === correctIds.size && wrongSelected === 0;
      return { isCorrect, points: Math.round(partial * 2) / 2 }; // round to nearest 0.5
    }

    // Binary (default)
    const isCorrect =
      selectedIds.length === correctIds.size &&
      selectedIds.every(id => correctIds.has(id));
    const penalty = (!isCorrect && item.negativeMarks > 0 && selectedIds.length > 0) ? item.negativeMarks : 0;
    return { isCorrect, points: isCorrect ? maxPts + (item.bonusPoints ?? 0) : -penalty };
  }

  return { isCorrect: false, points: 0 };
}

export async function submitSession(sessionId: string, reason: 'STUDENT' | 'AUTO' = 'STUDENT') {
  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
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

  if (!session) throw new Error('Session not found');
  if (['SUBMITTED', 'AUTO_SUBMITTED'].includes(session.status)) throw new Error('Session already submitted');

  let totalPoints = 0;
  let earnedPoints = 0;
  const gradedAnswers: { id: string; isCorrect: boolean; points: number }[] = [];

  for (const item of session.exam.items) {
    const q = item.question;
    const pts = item.points ?? q.points;
    totalPoints += pts;

    const answer = session.answers.find((a) => a.questionId === q.id);
    if (!answer) continue;

    if (['MCQ', 'TRUE_FALSE', 'MCQ_MULTI'].includes(q.type)) {
      const selectedIds = (answer.selectedIds as string[]) ?? [];
      const result = gradeAnswer(
        {
          points: item.points,
          scoringMode: (item as any).scoringMode ?? 'binary',
          negativeMarks: (item as any).negativeMarks ?? 0,
          bonusPoints: (item as any).bonusPoints ?? 0,
          question: { points: q.points, correctIds: q.correctIds, type: q.type },
        },
        selectedIds
      );
      earnedPoints += result.points;
      gradedAnswers.push({ id: answer.id, isCorrect: result.isCorrect, points: result.points });
    }
    // SHORT_TEXT and ESSAY: manual grading
  }

  await Promise.all(
    gradedAnswers.map((g) =>
      prisma.studentAnswer.update({ where: { id: g.id }, data: { isCorrect: g.isCorrect, points: g.points } })
    )
  );

  const finalScore = Math.max(0, earnedPoints); // never below 0 overall

  const updated = await prisma.examSession.update({
    where: { id: sessionId },
    data: {
      status: reason === 'AUTO' ? 'AUTO_SUBMITTED' : 'SUBMITTED',
      submittedAt: new Date(),
      score: finalScore,
      totalPoints,
    },
  });

  // Auto-issue certificate if passing threshold met
  const exam = session.exam;
  if (exam.passingScore && totalPoints > 0) {
    const pct = Math.round((finalScore / totalPoints) * 100);
    if (pct >= exam.passingScore) {
      const student = await prisma.user.findUnique({ where: { id: session.studentId }, select: { name: true } });
      await prisma.examCertificate.upsert({
        where: { sessionId },
        create: {
          sessionId,
          studentName: student?.name ?? 'Student',
          examTitle: exam.title,
          score: finalScore,
          totalPoints,
          percentage: pct,
        },
        update: { score: finalScore, totalPoints, percentage: pct },
      });
    }
  }

  return { session: updated, score: finalScore, totalPoints };
}

export async function verifyPin(examId: string, purpose: 'UNLOCK' | 'EXIT', pin: string) {
  const bcrypt = await import('bcrypt');
  const examPin = await prisma.examPin.findUnique({ where: { examId_purpose: { examId, purpose } } });
  if (!examPin) return false;
  if (examPin.usedAt && purpose === 'EXIT') return false;
  return bcrypt.compare(pin, examPin.pinHash);
}

// ── Pool resolution ───────────────────────────────────────────────────────
export async function resolvePoolQuestions(
  examId: string,
  schoolId: string
): Promise<{ questionId: string; sectionId?: string; order: number; points?: number }[]> {
  const pools = await prisma.examPool.findMany({ where: { examId }, orderBy: { order: 'asc' } });
  if (pools.length === 0) return [];

  const drawn: { questionId: string; sectionId?: string; order: number }[] = [];
  let orderOffset = 1000;

  for (const pool of pools) {
    const candidates = await prisma.question.findMany({
      where: {
        schoolId,
        ...(pool.tags.length ? { tags: { hasSome: pool.tags } } : {}),
        ...(pool.difficulty ? { difficulty: pool.difficulty } : {}),
        ...(pool.type ? { type: pool.type as any } : {}),
      },
      select: { id: true },
    });

    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    shuffled.slice(0, Math.min(pool.drawCount, shuffled.length)).forEach((q, i) => {
      drawn.push({ questionId: q.id, sectionId: pool.sectionId ?? undefined, order: orderOffset + i });
    });
    orderOffset += pool.drawCount + 10;
  }

  return drawn;
}
