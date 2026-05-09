// apps/api/src/modules/questions/questions.service.ts
import prisma from '../../lib/prisma';

export interface CreateQuestionInput {
  type: string;
  body: string;
  options?: { id: string; text: string; mediaUrl?: string }[];
  correctIds?: string[];
  rubric?: string;
  points?: number;
  difficulty?: number;
  tags?: string[];
}

export async function listQuestions(
  schoolId: string,
  filters: { type?: string; tags?: string; difficulty?: string; search?: string }
) {
  return prisma.question.findMany({
    where: {
      schoolId,
      ...(filters.type ? { type: filters.type as any } : {}),
      ...(filters.difficulty ? { difficulty: Number(filters.difficulty) } : {}),
      ...(filters.tags ? { tags: { hasSome: filters.tags.split(',') } } : {}),
      ...(filters.search ? { body: { contains: filters.search, mode: 'insensitive' } } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getQuestion(id: string, schoolId: string) {
  return prisma.question.findFirst({ where: { id, schoolId } });
}

export async function createQuestion(
  createdBy: string,
  schoolId: string,
  data: CreateQuestionInput
) {
  return prisma.question.create({
    data: {
      createdBy,
      schoolId,
      type: data.type as any,
      body: data.body,
      options: data.options as any,
      correctIds: data.correctIds as any,
      rubric: data.rubric,
      points: data.points ?? 1,
      difficulty: data.difficulty ?? 2,
      tags: data.tags ?? [],
    },
  });
}

async function assertQuestionInSchool(id: string, schoolId: string) {
  const q = await prisma.question.findFirst({ where: { id, schoolId }, select: { id: true } });
  if (!q) {
    const e: any = new Error('Question not found');
    e.status = 404;
    e.name = 'NotFoundError';
    throw e;
  }
}

export async function updateQuestion(
  id: string,
  schoolId: string,
  data: Partial<CreateQuestionInput>
) {
  await assertQuestionInSchool(id, schoolId);
  return prisma.question.update({
    where: { id },
    data: {
      ...(data.type ? { type: data.type as any } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.options !== undefined ? { options: data.options as any } : {}),
      ...(data.correctIds !== undefined ? { correctIds: data.correctIds as any } : {}),
      ...(data.rubric !== undefined ? { rubric: data.rubric } : {}),
      ...(data.points !== undefined ? { points: data.points } : {}),
      ...(data.difficulty !== undefined ? { difficulty: data.difficulty } : {}),
      ...(data.tags !== undefined ? { tags: data.tags } : {}),
    },
  });
}

export async function deleteQuestion(id: string, schoolId: string) {
  await assertQuestionInSchool(id, schoolId);
  return prisma.question.delete({ where: { id } });
}
