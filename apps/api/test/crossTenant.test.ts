import { describe, it, expect, beforeAll } from 'vitest';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';

const prisma = new PrismaClient();

// Cycle 1 unlocks these tests by enforcing schoolId on getById/update/delete.
// Before cycle 1 these would fail; flip describe.skip → describe to enable.
describe.skip('cross-tenant isolation', () => {
  let schoolBExamId: string;
  let schoolATeacherToken: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('test12345', 10);

    const schoolA = await prisma.school.upsert({
      where: { domain: 'a.test.edu' },
      update: {},
      create: { name: 'Test School A', domain: 'a.test.edu' },
    });
    const schoolB = await prisma.school.upsert({
      where: { domain: 'b.test.edu' },
      update: {},
      create: { name: 'Test School B', domain: 'b.test.edu' },
    });

    const teacherA = await prisma.user.upsert({
      where: { email: 'teacherA@a.test.edu' },
      update: {},
      create: {
        email: 'teacherA@a.test.edu',
        passwordHash,
        name: 'Teacher A',
        role: 'TEACHER',
        schoolId: schoolA.id,
      },
    });
    const teacherB = await prisma.user.upsert({
      where: { email: 'teacherB@b.test.edu' },
      update: {},
      create: {
        email: 'teacherB@b.test.edu',
        passwordHash,
        name: 'Teacher B',
        role: 'TEACHER',
        schoolId: schoolB.id,
      },
    });

    const examB = await prisma.exam.create({
      data: {
        title: 'Confidential B exam',
        schoolId: schoolB.id,
        teacherId: teacherB.id,
        durationMinutes: 30,
      },
    });
    schoolBExamId = examB.id;

    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacherA@a.test.edu', password: 'test12345' });
    schoolATeacherToken = loginA.body?.data?.accessToken;
    expect(schoolATeacherToken).toBeTypeOf('string');
  });

  it('teacher in school A must NOT read exam in school B by id', async () => {
    const res = await request(app)
      .get(`/api/v1/exams/${schoolBExamId}`)
      .set('Authorization', `Bearer ${schoolATeacherToken}`);
    // Pass criterion (after cycle 1): 403 or 404
    expect([403, 404]).toContain(res.status);
  });

  it('teacher in school A must NOT delete exam in school B', async () => {
    const res = await request(app)
      .delete(`/api/v1/exams/${schoolBExamId}`)
      .set('Authorization', `Bearer ${schoolATeacherToken}`);
    expect([403, 404]).toContain(res.status);
  });
});
