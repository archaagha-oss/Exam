import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { audit, auditFromReq } from '../src/lib/examAccess';
import { getImpersonationEvents } from '../src/lib/auditQuery';

const prisma = new PrismaClient();

// Cycle 2.0f: cross-tenant audit columns + impersonation flag.
//
// Three things to assert:
//   1. A SCHOOL_ADMIN acting on a row in their own school produces a row
//      with impersonation=false.
//   2. A PLATFORM_ADMIN acting on a row in any school produces a row with
//      impersonation=true.
//   3. getImpersonationEvents() returns only the impersonation rows.

describe('audit impersonation (D1 follow-up / cycle 2.0f)', () => {
  let schoolI: { id: string };
  let schoolAdminI: { id: string };
  let platformAdmin: { id: string };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('test12345', 10);

    schoolI = await prisma.school.upsert({
      where: { domain: 'i.test.edu' },
      update: {},
      create: { name: 'Test School I', domain: 'i.test.edu' },
    });

    schoolAdminI = await prisma.user.upsert({
      where: { email: 'school.admin.i@i.test.edu' },
      update: {},
      create: {
        email: 'school.admin.i@i.test.edu',
        passwordHash,
        name: 'School Admin I',
        role: 'SCHOOL_ADMIN',
        schoolId: schoolI.id,
      },
    });

    platformAdmin = await prisma.user.upsert({
      where: { email: 'platform.admin@secureexam.app' },
      update: {},
      create: {
        email: 'platform.admin@secureexam.app',
        passwordHash,
        name: 'Platform Admin',
        role: 'PLATFORM_ADMIN',
        schoolId: null,
      },
    });
  });

  afterAll(async () => {
    // Tidy up the rows we just emitted so a second test run doesn't pile up.
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [schoolAdminI.id, platformAdmin.id] } },
    });
  });

  it('SCHOOL_ADMIN action inside own school: impersonation=false', async () => {
    await auditFromReq(
      { user: { sub: schoolAdminI.id, role: 'SCHOOL_ADMIN', schoolId: schoolI.id } },
      'EXAM_CLOSED',
      'Exam',
      'fake-exam-1',
      { targetSchoolId: schoolI.id, meta: { test: true } }
    );

    const row = await prisma.auditLog.findFirst({
      where: { actorId: schoolAdminI.id, targetId: 'fake-exam-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeDefined();
    expect(row!.impersonation).toBe(false);
    expect(row!.actorRole).toBe('SCHOOL_ADMIN');
    expect(row!.actorSchoolId).toBe(schoolI.id);
    expect(row!.targetSchoolId).toBe(schoolI.id);
  });

  it('PLATFORM_ADMIN action against a school: impersonation=true', async () => {
    await auditFromReq(
      { user: { sub: platformAdmin.id, role: 'PLATFORM_ADMIN', schoolId: null } },
      'SCHOOL_PROVISIONED',
      'School',
      schoolI.id,
      { targetSchoolId: schoolI.id, meta: { name: 'Test School I' } }
    );

    const row = await prisma.auditLog.findFirst({
      where: { actorId: platformAdmin.id, targetType: 'School', targetId: schoolI.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeDefined();
    expect(row!.impersonation).toBe(true);
    expect(row!.actorRole).toBe('PLATFORM_ADMIN');
    expect(row!.actorSchoolId).toBeNull();
    expect(row!.targetSchoolId).toBe(schoolI.id);
  });

  it('PLATFORM_ADMIN action with no targetSchoolId (platform-wide): impersonation=false', async () => {
    // e.g. updating a global feature catalogue entry. Not a tenant action.
    await audit(
      platformAdmin.id,
      'FEATURE_ENABLED',
      'Feature',
      'ai-authoring',
      { catalogue: true },
      { actorRole: 'PLATFORM_ADMIN', actorSchoolId: null, targetSchoolId: null }
    );

    const row = await prisma.auditLog.findFirst({
      where: { actorId: platformAdmin.id, targetType: 'Feature', targetId: 'ai-authoring' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeDefined();
    expect(row!.impersonation).toBe(false);
  });

  it('getImpersonationEvents filters to impersonation=true rows', async () => {
    const events = await getImpersonationEvents({
      targetSchoolId: schoolI.id,
      since: new Date(Date.now() - 60 * 1000), // last minute, to scope tightly
    });
    // Should include the PLATFORM_ADMIN provisioning, exclude the SCHOOL_ADMIN one.
    expect(events.length).toBeGreaterThanOrEqual(1);
    for (const e of events) {
      expect(e.actorRole).toBe('PLATFORM_ADMIN');
      expect(e.targetSchoolId).toBe(schoolI.id);
    }
  });
});
