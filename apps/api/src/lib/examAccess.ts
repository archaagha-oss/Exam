// apps/api/src/lib/examAccess.ts
// Central permission utility for Phase 3 — used by REST routes and WebSocket

import prisma from './prisma';

// Sentinel used when a non-PLATFORM_ADMIN account has no schoolId. It will match
// no real row, denying access by construction. Real schoolIds are UUIDs.
const NO_SCHOOL_SENTINEL = '__NO_SCHOOL__';

/**
 * Build the schoolId where-fragment for the current request:
 * - PLATFORM_ADMIN  → {}      (cross-tenant; gated on D1)
 * - any other    → { schoolId: <user's schoolId or sentinel> }
 *
 * Spread directly into a Prisma `where` clause:
 *   prisma.exam.findFirst({ where: { id, ...tenantScope(req.user.role, req.user.schoolId) } })
 */
export function tenantScope(
  role: string,
  schoolId: string | null | undefined
): { schoolId?: string } {
  if (role === 'PLATFORM_ADMIN') return {};
  return { schoolId: schoolId ?? NO_SCHOOL_SENTINEL };
}

// Tenant-scoping rules (cycle 2.0a / D1):
//   - PLATFORM_ADMIN is vendor-side, cross-tenant by design.
//   - SCHOOL_ADMIN and TEACHER are scoped to their own schoolId. A SCHOOL_ADMIN
//     at school A CANNOT manage or proctor an exam at school B even if they
//     pass a forged examId. Callers MUST pass req.user.schoolId.
//   - TEACHER additionally must own the exam (manage) or be assigned as a
//     co-proctor (proctor).

/**
 * Returns true if the given user can proctor (monitor + take action on) an exam.
 * Allowed: owner teacher in same school | invited co-proctor in same school |
 *          school admin in same school | platform admin (any school)
 */
export async function canProctorExam(
  userId: string,
  role: string,
  schoolId: string | null | undefined,
  examId: string
): Promise<boolean> {
  if (role === 'PLATFORM_ADMIN') return true;
  if (!schoolId) return false;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { teacherId: true, schoolId: true },
  });
  if (!exam) return false;
  if (exam.schoolId !== schoolId) return false;
  if (role === 'SCHOOL_ADMIN') return true;
  if (role !== 'TEACHER') return false;
  if (exam.teacherId === userId) return true;

  // Check co-proctor assignment
  const coProctor = await prisma.examProctor.findUnique({
    where: { examId_teacherId: { examId, teacherId: userId } },
  });
  return !!coProctor;
}

/**
 * Returns true if the user can edit/manage an exam (owner or school admin in
 * same school, or platform admin). Co-proctors are explicitly excluded from
 * editing.
 */
export async function canManageExam(
  userId: string,
  role: string,
  schoolId: string | null | undefined,
  examId: string
): Promise<boolean> {
  if (role === 'PLATFORM_ADMIN') return true;
  if (!schoolId) return false;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { teacherId: true, schoolId: true },
  });
  if (!exam) return false;
  if (exam.schoolId !== schoolId) return false;
  if (role === 'SCHOOL_ADMIN') return true;
  if (role !== 'TEACHER') return false;
  return exam.teacherId === userId;
}

/**
 * Log an admin/teacher action to the audit table.
 *
 * Existing call sites continue to work — the new `actorRole`, `actorSchoolId`,
 * `targetSchoolId`, and `impersonation` columns (cycle 2.0f) default to null
 * / false when not supplied. The `auditFromReq` wrapper below is the
 * preferred entry point for new writes that reach across tenants
 * (PLATFORM_ADMIN actions, SCHOOL_ADMIN cross-school overrides), since it
 * populates all four columns correctly.
 */
export async function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  meta?: object,
  context?: {
    actorRole?: string | null;
    actorSchoolId?: string | null;
    targetSchoolId?: string | null;
  }
) {
  try {
    const impersonation = computeImpersonation(
      context?.actorRole,
      context?.actorSchoolId,
      context?.targetSchoolId
    );
    await prisma.auditLog.create({
      data: {
        actorId,
        action: action as any,
        targetType,
        targetId,
        meta: meta as any,
        actorRole: context?.actorRole ?? null,
        actorSchoolId: context?.actorSchoolId ?? null,
        targetSchoolId: context?.targetSchoolId ?? null,
        impersonation,
      },
    });
  } catch {
    // audit failures should never break the main flow
    console.error(`[audit] Failed to log action ${action}`);
  }
}

/**
 * Cycle 2.0f: write an audit entry with full impersonation metadata pulled
 * from the request. Use this in routes that PLATFORM_ADMIN can hit (any
 * /platform/* route, the admin overrides on /admin/*, the feature toggles)
 * or anywhere else the action could legitimately reach across tenants.
 *
 *   await auditFromReq(req, 'EXAM_CLOSED', 'Exam', exam.id, {
 *     targetSchoolId: exam.schoolId,
 *     meta: { title: exam.title },
 *   });
 *
 * Existing audit() callers don't need to migrate — the impersonation flag
 * defaults to false, which is correct for tenant-scoped actions.
 */
export async function auditFromReq(
  req: { user: { sub: string; role: string; schoolId?: string | null } },
  action: string,
  targetType: string,
  targetId: string,
  opts: { targetSchoolId?: string | null; meta?: object } = {}
) {
  return audit(req.user.sub, action, targetType, targetId, opts.meta, {
    actorRole: req.user.role,
    actorSchoolId: req.user.schoolId ?? null,
    targetSchoolId: opts.targetSchoolId ?? null,
  });
}

function computeImpersonation(
  actorRole: string | null | undefined,
  actorSchoolId: string | null | undefined,
  targetSchoolId: string | null | undefined
): boolean {
  // PLATFORM_ADMIN reaching INTO any specific tenant counts as impersonation.
  // Their own actions on the platform-wide tables (no targetSchoolId) do not.
  if (actorRole === 'PLATFORM_ADMIN' && targetSchoolId) return true;
  // Anyone else with a mismatched schoolId. Should not happen in normal flow
  // (the cycle 1.1a tenant guards prevent it) but we still flag it if it does.
  if (actorSchoolId && targetSchoolId && actorSchoolId !== targetSchoolId) return true;
  return false;
}
