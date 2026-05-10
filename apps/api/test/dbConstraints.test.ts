import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('database CHECK constraints', () => {
  let schoolId: string;
  let teacherId: string;

  beforeAll(async () => {
    const school = await prisma.school.upsert({
      where: { domain: 'check.test.edu' },
      update: {},
      create: { name: 'Check Test School', domain: 'check.test.edu' },
    });
    schoolId = school.id;
    const t = await prisma.user.upsert({
      where: { email: 'check.t@check.test.edu' },
      update: {},
      create: {
        email: 'check.t@check.test.edu',
        passwordHash: 'x',
        name: 'Check T',
        role: 'TEACHER',
        schoolId,
      },
    });
    teacherId = t.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects passingScore > 100', async () => {
    await expect(
      prisma.exam.create({
        data: {
          title: 'Bad exam',
          schoolId,
          teacherId,
          passingScore: 150,
          durationMinutes: 30,
        },
      })
    ).rejects.toThrow();
  });

  it('rejects negative passingScore', async () => {
    await expect(
      prisma.exam.create({
        data: {
          title: 'Bad exam',
          schoolId,
          teacherId,
          passingScore: -10,
          durationMinutes: 30,
        },
      })
    ).rejects.toThrow();
  });

  it('rejects durationMinutes <= 0', async () => {
    await expect(
      prisma.exam.create({
        data: { title: 'Bad', schoolId, teacherId, durationMinutes: 0 },
      })
    ).rejects.toThrow();
  });

  it('accepts a valid exam', async () => {
    const e = await prisma.exam.create({
      data: { title: 'OK exam', schoolId, teacherId, passingScore: 60, durationMinutes: 30 },
    });
    expect(e.id).toBeTypeOf('string');
    await prisma.exam.delete({ where: { id: e.id } });
  });
});
