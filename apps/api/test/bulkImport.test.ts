import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';

const prisma = new PrismaClient();

// Cycle 2.1a / audit P2: bulk-import correctness contract.
//
// The rewrite changed the implementation but not the public response shape.
// These cases pin the behaviours we don't want to silently regress:
//   - within-batch duplicates → 400, not "first one wins"
//   - existing-email rows → counted as `skipped`, not as `created`
//   - all-new batch → returns created = batch.length
//   - one BULK_IMPORT audit row per request, regardless of batch size
//   - tenant scope: imported users land in the actor's schoolId

describe('bulk import (cycle 2.1a)', () => {
  let school: { id: string };
  let admin: { id: string };
  let adminToken: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('test12345', 10);

    school = await prisma.school.upsert({
      where: { domain: 'bulk.test.edu' },
      update: {},
      create: { name: 'Bulk Test School', domain: 'bulk.test.edu' },
    });

    admin = await prisma.user.upsert({
      where: { email: 'bulk.admin@bulk.test.edu' },
      update: {},
      create: {
        email: 'bulk.admin@bulk.test.edu',
        passwordHash,
        name: 'Bulk Admin',
        role: 'SCHOOL_ADMIN',
        schoolId: school.id,
      },
    });

    // Pre-existing user used to drive the "skipped" path
    await prisma.user.upsert({
      where: { email: 'preexisting@bulk.test.edu' },
      update: {},
      create: {
        email: 'preexisting@bulk.test.edu',
        passwordHash,
        name: 'Pre Existing',
        role: 'STUDENT',
        schoolId: school.id,
      },
    });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bulk.admin@bulk.test.edu', password: 'test12345' });
    adminToken = login.body?.data?.accessToken;
    expect(adminToken).toBeTypeOf('string');
  });

  afterAll(async () => {
    // Tidy up users we created in the all-new test so reruns are stable.
    await prisma.user.deleteMany({
      where: { schoolId: school.id, email: { contains: '@bulk-fresh' } },
    });
  });

  it('rejects within-batch duplicate emails with 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/users/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        users: [
          { name: 'A', email: 'dup@bulk.test.edu', role: 'STUDENT', password: 'changeme1' },
          { name: 'B', email: 'dup@bulk.test.edu', role: 'STUDENT', password: 'changeme1' },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/duplicate/i);
    expect(res.body.duplicates).toContain('dup@bulk.test.edu');
  });

  it('counts pre-existing email as skipped, not error', async () => {
    const res = await request(app)
      .post('/api/v1/admin/users/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        users: [
          { name: 'Existing', email: 'preexisting@bulk.test.edu', role: 'STUDENT', password: 'changeme1' },
          { name: 'NewOne',   email: 'a@bulk-fresh.test',          role: 'STUDENT', password: 'changeme1' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.errors).toEqual([]);
  });

  it('all-new batch: every row counted as created', async () => {
    const users = [
      { name: 'Fresh1', email: 'b@bulk-fresh.test', role: 'STUDENT' as const, password: 'changeme1' },
      { name: 'Fresh2', email: 'c@bulk-fresh.test', role: 'STUDENT' as const, password: 'changeme1' },
      { name: 'Fresh3', email: 'd@bulk-fresh.test', role: 'TEACHER' as const, password: 'changeme1' },
    ];
    const res = await request(app)
      .post('/api/v1/admin/users/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ users });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(3);
    expect(res.body.data.skipped).toBe(0);
  });

  it('imported users land in the actor schoolId', async () => {
    const created = await prisma.user.findMany({
      where: { email: { in: ['b@bulk-fresh.test', 'c@bulk-fresh.test', 'd@bulk-fresh.test'] } },
      select: { schoolId: true, role: true },
    });
    expect(created).toHaveLength(3);
    for (const u of created) {
      expect(u.schoolId).toBe(school.id);
    }
    expect(created.filter((u) => u.role === 'STUDENT')).toHaveLength(2);
    expect(created.filter((u) => u.role === 'TEACHER')).toHaveLength(1);
  });

  it('writes exactly one BULK_IMPORT audit row per request', async () => {
    const before = await prisma.auditLog.count({
      where: { actorId: admin.id, action: 'BULK_IMPORT' },
    });

    await request(app)
      .post('/api/v1/admin/users/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        users: [
          { name: 'Audit1', email: 'e@bulk-fresh.test', role: 'STUDENT', password: 'changeme1' },
          { name: 'Audit2', email: 'f@bulk-fresh.test', role: 'STUDENT', password: 'changeme1' },
        ],
      });

    const after = await prisma.auditLog.count({
      where: { actorId: admin.id, action: 'BULK_IMPORT' },
    });
    expect(after - before).toBe(1);
  });
});
