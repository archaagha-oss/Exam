// apps/api/src/lib/examAccess.ts
// Central permission utility for Phase 3 — used by REST routes and WebSocket

import prisma from './prisma';

/**
 * Returns true if the given user can proctor (monitor + take action on) an exam.
 * Allowed: owner teacher | invited co-proctor | admin | super_admin
 */
export async function canProctorExam(userId: string, role: string, examId: string): Promise<boolean> {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
  if (role !== 'TEACHER') return false;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { teacherId: true },
  });
  if (!exam) return false;
  if (exam.teacherId === userId) return true;

  // Check co-proctor assignment
  const coProctor = await prisma.examProctor.findUnique({
    where: { examId_teacherId: { examId, teacherId: userId } },
  });
  return !!coProctor;
}

/**
 * Returns true if the user can edit/manage an exam (owner or admin only).
 * Co-proctors are explicitly excluded from editing.
 */
export async function canManageExam(userId: string, role: string, examId: string): Promise<boolean> {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
  if (role !== 'TEACHER') return false;

  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { teacherId: true } });
  return exam?.teacherId === userId;
}

/**
 * Log an admin/teacher action to the audit table.
 */
export async function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  meta?: object
) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: action as any,
        targetType,
        targetId,
        meta: meta as any,
      },
    });
  } catch {
    // audit failures should never break the main flow
    console.error(`[audit] Failed to log action ${action}`);
  }
}
