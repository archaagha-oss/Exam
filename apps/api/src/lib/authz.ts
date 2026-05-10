/**
 * Authorization helpers for tenant isolation.
 *
 * The cardinal rule: every getById / updateById / deleteById on a tenant-scoped
 * resource must filter by the caller's schoolId. This module provides the
 * primitives.
 */
import prisma from './prisma';

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  status = 404;
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN';
  schoolId: string | null;
  name?: string;
}

/**
 * Throw if the caller's schoolId doesn't match the resource's schoolId.
 * Super-admins bypass the school check.
 */
export function assertSameSchool(user: AuthUser, resourceSchoolId: string | null | undefined) {
  if (user.role === 'SUPER_ADMIN') return;
  if (!user.schoolId) throw new ForbiddenError('User has no school');
  if (resourceSchoolId !== user.schoolId) throw new NotFoundError(); // 404, not 403, to avoid leaking existence
}

/**
 * Look up an exam by id and assert the caller's school matches.
 * Returns the exam or throws NotFoundError.
 */
export async function findExamForUser(
  examId: string,
  user: AuthUser,
  include?: Parameters<typeof prisma.exam.findUnique>[0]['include']
) {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, include });
  if (!exam) throw new NotFoundError();
  assertSameSchool(user, exam.schoolId);
  return exam;
}

export async function findQuestionForUser(questionId: string, user: AuthUser) {
  const q = await prisma.question.findUnique({ where: { id: questionId } });
  if (!q) throw new NotFoundError();
  assertSameSchool(user, q.schoolId);
  return q;
}

export async function findUserForUser(userId: string, user: AuthUser) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new NotFoundError();
  assertSameSchool(user, u.schoolId);
  return u;
}

/**
 * Assert a teacher actually owns or proctors an exam (extra check on top of
 * school membership). Admins and SUPER_ADMINs skip this.
 */
export async function assertCanManageExam(examId: string, user: AuthUser) {
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return;
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      teacherId: true,
      schoolId: true,
      proctors: { where: { teacherId: user.id }, select: { id: true } },
    },
  });
  if (!exam) throw new NotFoundError();
  assertSameSchool(user, exam.schoolId);
  if (exam.teacherId !== user.id && exam.proctors.length === 0) {
    throw new ForbiddenError('Not the exam owner or a proctor');
  }
}
