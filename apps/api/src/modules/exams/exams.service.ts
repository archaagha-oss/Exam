// apps/api/src/modules/exams/exams.service.ts
import prisma from '../../lib/prisma';
import { NotFoundError } from '../../lib/authz';

export async function listExams(teacherId: string, schoolId: string) {
  return prisma.exam.findMany({
    where: { teacherId, schoolId },
    include: {
      _count: { select: { items: true, sessions: true, assignments: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

/**
 * Look up an exam scoped to the caller's school. Returns null when not found
 * OR when the caller is in a different school (no existence leak).
 */
export async function getExam(id: string, schoolId: string) {
  return prisma.exam.findFirst({
    where: { id, schoolId },
    include: {
      items: {
        include: { question: true },
        orderBy: { order: 'asc' },
      },
      assignments: {
        include: { class: { select: { id: true, name: true } } },
      },
      _count: { select: { sessions: true } },
    },
  });
}

export interface CreateExamInput {
  title: string;
  description?: string;
  durationMinutes?: number;
  maxViolations?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResultsAfter?: boolean;
  passingScore?: number;
  instructions?: string;
  calculatorType?: string | null;
  securityLevel?: number;
  ipAllowlist?: string | null;
  requireOtp?: boolean;
  startsAt?: string;
  endsAt?: string;
}

export async function createExam(teacherId: string, schoolId: string, data: CreateExamInput) {
  return prisma.exam.create({
    data: {
      title: data.title,
      description: data.description,
      schoolId,
      teacherId,
      durationMinutes: data.durationMinutes ?? 60,
      maxViolations: data.maxViolations ?? 3,
      shuffleQuestions: data.shuffleQuestions ?? false,
      shuffleOptions: data.shuffleOptions ?? false,
      showResultsAfter: data.showResultsAfter ?? true,
      passingScore: data.passingScore,
      instructions: data.instructions,
      calculatorType: data.calculatorType ?? null,
      securityLevel: data.securityLevel ?? 1,
      ipAllowlist: data.ipAllowlist ?? null,
      requireOtp: data.requireOtp ?? false,
      startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
      endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
    },
  });
}

async function assertExamInSchool(id: string, schoolId: string) {
  const exam = await prisma.exam.findFirst({ where: { id, schoolId }, select: { id: true } });
  if (!exam) throw new NotFoundError();
}

export async function updateExam(id: string, schoolId: string, data: Partial<CreateExamInput>) {
  await assertExamInSchool(id, schoolId);
  return prisma.exam.update({
    where: { id },
    data: {
      ...data,
      startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
      endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
    },
  });
}

export async function deleteExam(id: string, schoolId: string) {
  await assertExamInSchool(id, schoolId);
  return prisma.exam.delete({ where: { id } });
}

export async function publishExam(id: string, schoolId: string) {
  // Validate exam has at least one question and belongs to this school
  const exam = await prisma.exam.findFirst({
    where: { id, schoolId },
    include: { _count: { select: { items: true } } },
  });
  if (!exam) throw new NotFoundError();
  if (exam._count.items === 0) throw new Error('Exam must have at least one question');

  return prisma.exam.update({
    where: { id },
    data: { status: 'PUBLISHED' },
  });
}

export async function assignExam(examId: string, schoolId: string, classIds: string[]) {
  await assertExamInSchool(examId, schoolId);
  await prisma.examAssignment.createMany({
    data: classIds.map((classId) => ({ examId, classId })),
    skipDuplicates: true,
  });
}

// ── Exam Items ──────────────────────────────────────────────

export async function addExamItem(
  examId: string,
  schoolId: string,
  questionId: string,
  points?: number
) {
  await assertExamInSchool(examId, schoolId);
  // Also assert the question is in the same school
  const q = await prisma.question.findFirst({
    where: { id: questionId, schoolId },
    select: { id: true },
  });
  if (!q) throw new NotFoundError();

  const maxOrder = await prisma.examItem.aggregate({
    where: { examId },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? 0) + 1;

  return prisma.examItem.create({
    data: { examId, questionId, order, points },
    include: { question: true },
  });
}

export async function removeExamItem(itemId: string, schoolId: string) {
  // Verify the item's exam belongs to caller's school
  const item = await prisma.examItem.findFirst({
    where: { id: itemId, exam: { schoolId } },
    select: { id: true },
  });
  if (!item) throw new NotFoundError();
  return prisma.examItem.delete({ where: { id: itemId } });
}

export async function reorderExamItems(examId: string, schoolId: string, orderedItemIds: string[]) {
  await assertExamInSchool(examId, schoolId);
  // Verify every id belongs to this exam (and therefore this school)
  const items = await prisma.examItem.findMany({
    where: { id: { in: orderedItemIds }, examId },
    select: { id: true },
  });
  if (items.length !== orderedItemIds.length) throw new NotFoundError();

  await prisma.$transaction(
    orderedItemIds.map((id, index) =>
      prisma.examItem.update({ where: { id }, data: { order: index + 1 } })
    )
  );
}
