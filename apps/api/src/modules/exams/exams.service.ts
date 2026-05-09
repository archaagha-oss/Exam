// apps/api/src/modules/exams/exams.service.ts
import prisma from '../../lib/prisma';

export async function listExams(teacherId: string, schoolId: string) {
  return prisma.exam.findMany({
    where: { teacherId, schoolId },
    include: {
      _count: { select: { items: true, sessions: true, assignments: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getExam(id: string) {
  return prisma.exam.findUnique({
    where: { id },
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

export async function updateExam(id: string, data: Partial<CreateExamInput>) {
  return prisma.exam.update({
    where: { id },
    data: {
      ...data,
      startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
      endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
    },
  });
}

export async function deleteExam(id: string) {
  return prisma.exam.delete({ where: { id } });
}

export async function publishExam(id: string) {
  // Validate exam has at least one question
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  });
  if (!exam) throw new Error('Exam not found');
  if (exam._count.items === 0) throw new Error('Exam must have at least one question');

  return prisma.exam.update({
    where: { id },
    data: { status: 'PUBLISHED' },
  });
}

export async function assignExam(examId: string, classIds: string[]) {
  await prisma.examAssignment.createMany({
    data: classIds.map((classId) => ({ examId, classId })),
    skipDuplicates: true,
  });
}

// ── Exam Items ──────────────────────────────────────────────

export async function addExamItem(examId: string, questionId: string, points?: number) {
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

export async function removeExamItem(itemId: string) {
  return prisma.examItem.delete({ where: { id: itemId } });
}

export async function reorderExamItems(examId: string, orderedItemIds: string[]) {
  await Promise.all(
    orderedItemIds.map((id, index) =>
      prisma.examItem.update({ where: { id }, data: { order: index + 1 } })
    )
  );
}
