/**
 * Server-side integrity analysis.
 *
 * Browser lockdown is fundamentally a deterrent — a determined cheater
 * can disable the JS that reports violations or run the exam in a VM.
 * The defenses that actually work are server-side:
 *
 *   1. Timing anomalies — a question answered in <1s on a non-trivial
 *      item; a whole exam completed in <30% of allowed time.
 *   2. Answer patterns — two students in the same class submitting
 *      identical sequences of correct/incorrect answers in the same
 *      order. Strong hint of collusion.
 *   3. IP / fingerprint mismatches — already in the security module.
 *
 * Each finding produces a SuspicionEvent stored in audit_logs (NEW
 * action types) + a teacher-visible "integrity" panel. We DO NOT
 * automatically penalise — humans decide.
 */
import prisma from '../../lib/prisma';

export interface SuspicionFinding {
  sessionId: string;
  type: 'TIMING_TOO_FAST' | 'TIMING_PER_QUESTION' | 'ANSWER_PATTERN_MATCH';
  severity: 'low' | 'medium' | 'high';
  detail: Record<string, unknown>;
}

const PER_QUESTION_MIN_SECONDS = 1; // <1s = suspicious for any non-trivial Q
const FAST_FRACTION = 0.3; // total time < 30% of allowed = suspicious

export async function analyzeSession(sessionId: string): Promise<SuspicionFinding[]> {
  const findings: SuspicionFinding[] = [];

  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      examId: true,
      startedAt: true,
      submittedAt: true,
      exam: { select: { durationMinutes: true } },
      answers: {
        select: { questionId: true, timeSpentSeconds: true, isCorrect: true, selectedIds: true },
      },
    },
  });
  if (!session || !session.startedAt || !session.submittedAt) return findings;

  // 1. Total-duration check
  const totalSeconds =
    (new Date(session.submittedAt).getTime() - new Date(session.startedAt).getTime()) / 1000;
  const allowedSeconds = session.exam.durationMinutes * 60;
  if (totalSeconds < allowedSeconds * FAST_FRACTION && session.answers.length > 3) {
    findings.push({
      sessionId,
      type: 'TIMING_TOO_FAST',
      severity: 'medium',
      detail: { totalSeconds, allowedSeconds, ratio: totalSeconds / allowedSeconds },
    });
  }

  // 2. Per-question speed check
  const fastQs = session.answers.filter(
    (a) => a.timeSpentSeconds != null && a.timeSpentSeconds < PER_QUESTION_MIN_SECONDS
  );
  if (fastQs.length >= 3) {
    findings.push({
      sessionId,
      type: 'TIMING_PER_QUESTION',
      severity: 'low',
      detail: { count: fastQs.length, questionIds: fastQs.map((a) => a.questionId) },
    });
  }

  // 3. Answer-pattern collusion check — within the same exam, are there
  //    students whose (questionId, selectedIds) sequence matches exactly?
  const others = await prisma.examSession.findMany({
    where: {
      examId: session.examId,
      id: { not: sessionId },
      submittedAt: { not: null },
    },
    select: {
      id: true,
      studentId: true,
      answers: {
        select: { questionId: true, selectedIds: true },
        orderBy: { answeredAt: 'asc' },
      },
    },
  });

  const mySig = signatureOf(session.answers);
  for (const o of others) {
    const sig = signatureOf(o.answers);
    if (sig.length >= 5 && sig === mySig) {
      findings.push({
        sessionId,
        type: 'ANSWER_PATTERN_MATCH',
        severity: 'high',
        detail: { matchedSessionId: o.id, matchedStudentId: o.studentId },
      });
    }
  }

  return findings;
}

function signatureOf(answers: { questionId: string; selectedIds: unknown }[]): string {
  return answers
    .map((a) => `${a.questionId}=${JSON.stringify(a.selectedIds ?? null)}`)
    .sort()
    .join('|');
}
