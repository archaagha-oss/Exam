import { describe, it, expect, beforeAll } from 'vitest';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';

const prisma = new PrismaClient();

// Cross-tenant isolation contract — extended in cycle 1.1a.
//
// The invariant: a teacher / admin / student in school A can never read or
// mutate a row that belongs to school B. Pass criterion is 403 or 404 (we
// accept either: 404 hides existence; 403 confirms it but denies access).
// 200 is a fail.

describe('cross-tenant isolation', () => {
  let schoolA: { id: string };
  let schoolB: { id: string };
  let teacherA: { id: string };
  let teacherB: { id: string };
  let adminA: { id: string };
  let studentB: { id: string };
  let examB: { id: string };
  let classB: { id: string };
  let questionB: { id: string };
  let sessionB: { id: string };

  let teacherAToken: string;
  let adminAToken: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('test12345', 10);

    schoolA = await prisma.school.upsert({
      where: { domain: 'a.test.edu' },
      update: {},
      create: { name: 'Test School A', domain: 'a.test.edu' },
    });
    schoolB = await prisma.school.upsert({
      where: { domain: 'b.test.edu' },
      update: {},
      create: { name: 'Test School B', domain: 'b.test.edu' },
    });

    teacherA = await prisma.user.upsert({
      where: { email: 'teacher.a@a.test.edu' },
      update: {},
      create: {
        email: 'teacher.a@a.test.edu',
        passwordHash,
        name: 'Teacher A',
        role: 'TEACHER',
        schoolId: schoolA.id,
      },
    });
    adminA = await prisma.user.upsert({
      where: { email: 'admin.a@a.test.edu' },
      update: {},
      create: {
        email: 'admin.a@a.test.edu',
        passwordHash,
        name: 'Admin A',
        role: 'SCHOOL_ADMIN',
        schoolId: schoolA.id,
      },
    });
    teacherB = await prisma.user.upsert({
      where: { email: 'teacher.b@b.test.edu' },
      update: {},
      create: {
        email: 'teacher.b@b.test.edu',
        passwordHash,
        name: 'Teacher B',
        role: 'TEACHER',
        schoolId: schoolB.id,
      },
    });
    studentB = await prisma.user.upsert({
      where: { email: 'student.b@b.test.edu' },
      update: {},
      create: {
        email: 'student.b@b.test.edu',
        passwordHash,
        name: 'Student B',
        role: 'STUDENT',
        schoolId: schoolB.id,
      },
    });

    examB = await prisma.exam.upsert({
      where: { id: '00000000-0000-0000-0000-0000000000b1' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-0000000000b1',
        title: 'Confidential B exam',
        schoolId: schoolB.id,
        teacherId: teacherB.id,
        durationMinutes: 30,
      },
    });

    classB = await prisma.class.upsert({
      where: { id: '00000000-0000-0000-0000-0000000000b2' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-0000000000b2',
        name: 'Class B',
        schoolId: schoolB.id,
      },
    });

    questionB = await prisma.question.upsert({
      where: { id: '00000000-0000-0000-0000-0000000000b3' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-0000000000b3',
        body: 'B-school question',
        type: 'MCQ',
        schoolId: schoolB.id,
        // Cycle 2.1d bug fix: schema field is `createdBy`, not `authorId`;
        // schema field is `options`, not `choices`. The earlier values
        // would have failed Prisma's create with "Unknown argument".
        createdBy: teacherB.id,
        options: [
          { id: 'a', text: 'a' },
          { id: 'b', text: 'b' },
          { id: 'c', text: 'c' },
          { id: 'd', text: 'd' },
        ],
        correctIds: ['a'],
      },
    });

    sessionB = await prisma.examSession.upsert({
      where: { id: '00000000-0000-0000-0000-0000000000b4' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-0000000000b4',
        examId: examB.id,
        studentId: studentB.id,
        status: 'IN_PROGRESS',
      },
    });

    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher.a@a.test.edu', password: 'test12345' });
    teacherAToken = loginA.body?.data?.accessToken;
    expect(teacherAToken).toBeTypeOf('string');

    const loginAdminA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin.a@a.test.edu', password: 'test12345' });
    adminAToken = loginAdminA.body?.data?.accessToken;
    expect(adminAToken).toBeTypeOf('string');
  });

  // ── Pre-existing cases (cycle 1) ──────────────────────────

  it('teacher in school A must NOT read exam in school B by id', async () => {
    const res = await request(app)
      .get(`/api/v1/exams/${examB.id}`)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('teacher in school A must NOT delete exam in school B', async () => {
    const res = await request(app)
      .delete(`/api/v1/exams/${examB.id}`)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  // ── P0-1: reports (cycle 1.1a) ────────────────────────────

  it('P0-1a: teacher A must NOT read reports for school B exam', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/exams/${examB.id}`)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('P0-1b: teacher A must NOT read a single school B session', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/exams/${examB.id}/sessions/${sessionB.id}`)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  // ── P0-2: admin overrides (cycle 1.1a) ────────────────────

  it('P0-2a: admin A must NOT close school B exam', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/exams/${examB.id}/close`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('P0-2b: admin A must NOT remove a proctor from a school B exam', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/proctors/${examB.id}/${teacherB.id}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('P0-2c: admin A must NOT add members to a school B class', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/classes/${classB.id}/members`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ userIds: [studentB.id], memberType: 'student' });
    expect([403, 404]).toContain(res.status);
  });

  it('P0-2d: admin A must NOT remove members from a school B class', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/classes/${classB.id}/members/${studentB.id}?memberType=student`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  // ── P0-3: media / sen / security / assessment / pins (cycle 1.1a) ─

  it('P0-3a: teacher A must NOT delete media on a school B question', async () => {
    const res = await request(app)
      .delete(`/api/v1/media/questions/${questionB.id}`)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('P0-3b: admin A must NOT read SEN arrangements for a school B student', async () => {
    const res = await request(app)
      .get(`/api/v1/sen/arrangements/${studentB.id}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('P0-3c: admin A must NOT delete SEN arrangements for a school B student', async () => {
    const res = await request(app)
      .delete(`/api/v1/sen/arrangements/${studentB.id}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('P0-3d: teacher A must NOT read rest breaks for a school B session', async () => {
    const res = await request(app)
      .get(`/api/v1/sen/sessions/${sessionB.id}/rest-breaks`)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('P0-3e: teacher A must NOT read device alerts for a school B session', async () => {
    const res = await request(app)
      .get(`/api/v1/security/sessions/${sessionB.id}/device-alerts`)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('P0-3f: teacher A must NOT read a certificate from a school B session', async () => {
    const res = await request(app)
      .get(`/api/v1/assessment/sessions/${sessionB.id}/certificate`)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('P0-3g: teacher A must NOT list PINs for a school B exam', async () => {
    const res = await request(app)
      .get(`/api/v1/pins/${examB.id}`)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect([403, 404]).toContain(res.status);
  });
});
