// apps/api/src/modules/platform/platform.router.ts
//
// Platform-admin routes — accessible only to PLATFORM_ADMIN role.
// These operate across all schools (use platformClient, not tenant client).
// Mounted at /api/v1/platform.
//
// Cycle 2.0c renamed this from superadmin/superadmin.router.ts so the
// directory + file match the post-D1 PLATFORM_ADMIN role.

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { authenticate } from '../../middleware/auth';
import { platformClient } from '../../lib/tenant';

const router = Router();

function isPlatformAdmin(req: Request, res: Response, next: Function) {
  if (!req.user || req.user.role !== 'PLATFORM_ADMIN') {
    res.status(403).json({ error: 'Platform admin only' }); return;
  }
  next();
}

router.use(authenticate, isPlatformAdmin as any);

// ── SCHOOLS (all tenants) ──────────────────────────────────

// GET /api/v1/platform/schools
router.get('/schools', async (_req: Request, res: Response) => {
  const schools = await platformClient.school.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { users: true, exams: true } },
    },
  });

  // For each school, check if it's migrated to its own schema
  const migratedIds = new Set((process.env.MIGRATED_SCHOOL_IDS ?? '').split(',').filter(Boolean));

  res.json({
    data: schools.map(s => ({
      ...s,
      userCount: s._count.users,
      examCount: s._count.exams,
      isMigrated: migratedIds.has(s.id),
      schemaName: `school_${s.id.replace(/-/g, '_')}`,
    })),
  });
});

// POST /api/v1/platform/schools  — provision a new school
router.post('/schools', async (req: Request, res: Response) => {
  const schema = z.object({
    name:         z.string().min(2).max(200),
    domain:       z.string().optional(),
    adminName:    z.string().min(2).max(100),
    adminEmail:   z.string().email(),
    adminPassword:z.string().min(8),
    plan:         z.enum(['trial', 'standard', 'enterprise']).default('trial'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }

  const { name, domain, adminName, adminEmail, adminPassword, plan } = parsed.data;

  // Check email not taken
  const existing = await platformClient.user.findUnique({ where: { email: adminEmail.toLowerCase() } });
  if (existing) { res.status(409).json({ error: 'Email already in use' }); return; }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // Create school + admin user in one transaction
  const school = await platformClient.school.create({
    data: {
      name,
      domain: domain ?? null,
      users: {
        create: {
          email: adminEmail.toLowerCase(),
          name: adminName,
          passwordHash,
          role: 'SCHOOL_ADMIN',
        },
      },
    },
    include: { users: { select: { id: true, email: true, name: true, role: true } } },
  });

  res.status(201).json({
    data: {
      school: { id: school.id, name: school.name },
      admin: school.users[0],
      plan,
      nextStep: `Run: npm run migrate:tenant -- --schoolId ${school.id} --dry-run`,
    },
  });
});

// GET /api/v1/platform/schools/:id
router.get('/schools/:id', async (req: Request, res: Response) => {
  const school = await platformClient.school.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { users: true, exams: true } },
      users: {
        where: { role: { in: ['SCHOOL_ADMIN', 'PLATFORM_ADMIN'] } },
        select: { id: true, name: true, email: true, role: true, lastLoginAt: true, isActive: true },
        take: 10,
      },
    },
  });
  if (!school) { res.status(404).json({ error: 'School not found' }); return; }

  // Stats
  const sessions = await platformClient.examSession.findMany({
    where: { exam: { schoolId: req.params.id }, startedAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    select: { status: true },
  });

  const migratedIds = new Set((process.env.MIGRATED_SCHOOL_IDS ?? '').split(',').filter(Boolean));

  res.json({
    data: {
      ...school,
      userCount: school._count.users,
      examCount: school._count.exams,
      sessions30d: sessions.length,
      isMigrated: migratedIds.has(school.id),
      schemaName: `school_${school.id.replace(/-/g, '_')}`,
    },
  });
});

// DELETE /api/v1/platform/schools/:id  — offboard a school
router.delete('/schools/:id', async (req: Request, res: Response) => {
  const schema = z.object({ confirmName: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Must confirm school name' }); return; }

  const school = await platformClient.school.findUnique({ where: { id: req.params.id }, select: { name: true } });
  if (!school) { res.status(404).json({ error: 'Not found' }); return; }
  if (parsed.data.confirmName !== school.name) {
    res.status(400).json({ error: 'School name confirmation does not match' }); return;
  }

  // Cascade delete is handled by DB constraints
  await platformClient.school.delete({ where: { id: req.params.id } });
  res.json({ data: { deleted: true, name: school.name } });
});

// ── PLATFORM STATS ────────────────────────────────────────

// GET /api/v1/platform/stats
router.get('/stats', async (_req: Request, res: Response) => {
  const [schoolCount, userCount, examCount, sessionCount] = await Promise.all([
    platformClient.school.count(),
    platformClient.user.count(),
    platformClient.exam.count(),
    platformClient.examSession.count(),
  ]);

  const activeNow = await platformClient.examSession.count({ where: { status: 'IN_PROGRESS' } });

  const last30 = new Date(Date.now() - 30 * 86400000);
  const sessions30d = await platformClient.examSession.count({ where: { startedAt: { gte: last30 } } });
  const newSchools30d = await platformClient.school.count({ where: { createdAt: { gte: last30 } } });
  const newUsers30d = await platformClient.user.count({ where: { createdAt: { gte: last30 } } });

  const migratedCount = (process.env.MIGRATED_SCHOOL_IDS ?? '').split(',').filter(Boolean).length;

  res.json({
    data: {
      schools: { total: schoolCount, migrated: migratedCount, onSharedDb: schoolCount - migratedCount, new30d: newSchools30d },
      users: { total: userCount, new30d: newUsers30d },
      exams: { total: examCount },
      sessions: { total: sessionCount, activeNow, last30d: sessions30d },
    },
  });
});

// ── MIGRATION STATUS ──────────────────────────────────────

// GET /api/v1/platform/migration-status
router.get('/migration-status', async (_req: Request, res: Response) => {
  const schools = await platformClient.school.findMany({
    select: { id: true, name: true, createdAt: true, _count: { select: { users: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const migratedIds = new Set((process.env.MIGRATED_SCHOOL_IDS ?? '').split(',').filter(Boolean));

  res.json({
    data: schools.map(s => ({
      id: s.id,
      name: s.name,
      userCount: s._count.users,
      createdAt: s.createdAt,
      status: migratedIds.has(s.id) ? 'migrated' : 'shared',
      schemaName: `school_${s.id.replace(/-/g, '_')}`,
      migrateCommand: `npm run migrate:tenant -- --schoolId ${s.id} --dry-run`,
    })),
  });
});

export default router;
