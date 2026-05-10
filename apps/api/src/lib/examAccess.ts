// apps/api/src/lib/examAccess.ts
// Central permission utility for Phase 3 — used by REST routes and WebSocket

import prisma from './prisma';

// Sentinel used when a non-SUPER_ADMIN account has no schoolId. It will match
// no real row, denying access by construction. Real schoolIds are UUIDs.
const NO_SCHOOL_SENTINEL = '__NO_SCHOOL__';

/**
 * Build the schoolId where-fragment for the current request:
 * - SUPER_ADMIN  → {}      (cross-tenant; gated on D1)
 * - any other    → { schoolId: <user's schoolId or sentinel> }
 *
 * Spread directly into a Prisma `where` clause:
 *   prisma.exam.findFirst({ where: { id, ...tenantScope(req.user.role, req.user.schoolId) } })
 */
export function tenantScope(
  role: string,
  schoolId: string | null | undefined
): { schoolId?: string } {
  if (role === 'SUPER_ADMIN') return {};
  return { schoolId: schoolId ?? NO_SCHOOL_SENTINEL };
}

// Tenant-scoping rules:
//   - SUPER_ADMIN is platform-wide (cross-tenant by current schema; gated on
//     decision D1 — will become PLATFORM_ADMIN, vendor-only).
//   - ADMIN and TEACHER are scoped to their own schoolId. An ADMIN at school A
//     CANNOT manage or proctor an exam at school B even if they pass a forged
//     examId. Callers MUST pass req.user.schoolId.
//   - TEACHER additionally must own the exam (manage) or be assigned as a
//     co-proctor (proctor).

/**
 * Returns true if the given user can proctor (monitor + take action on) an exam.
 * Allowed: owner teacher in same school | invited co-proctor in same school |
 *          admin in same school | super_admin (any school)
 */
export async function canProctorExam(
  userId: string,
  role: string,
  schoolId: string | null | undefined,
  examId: string
): Promise<boolean> {
  if (role === 'SUPER_ADMIN') return true;
  if (!schoolId) return false;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { teacherId: true, schoolId: true },
  });
  if (!exam) return false;
  if (exam.schoolId !== schoolId) return false;
  if (role === 'ADMIN') return true;
  if (role !== 'TEACHER') return false;
  if (exam.teacherId === userId) return true;

  // Check co-proctor assignment
  const coProctor = await prisma.examProctor.findUnique({
    where: { examId_teacherId: { examId, teacherId: userId } },
  });
  return !!coProctor;
}

/**
 * Returns true if the user can edit/manage an exam (owner or admin in same
 * school, or super_admin). Co-proctors are explicitly excluded from editing.
 */
export async function canManageExam(
  userId: string,
  role: string,
  schoolId: string | null | undefined,
  examId: string
): Promise<boolean> {
  if (role === 'SUPER_ADMIN') return true;
  if (!schoolId) return false;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { teacherId: true, schoolId: true },
  });
  if (!exam) return false;
  if (exam.schoolId !== schoolId) return false;
  if (role === 'ADMIN') return true;
  if (role !== 'TEACHER') return false;
  return exam.teacherId === userId;
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
