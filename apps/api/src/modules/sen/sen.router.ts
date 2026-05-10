// apps/api/src/modules/sen/sen.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, isAdmin, isStudent } from '../../middleware/auth';
import { tenantScope } from '../../lib/examAccess';
import prisma from '../../lib/prisma';

const router = Router();

const arrangementSchema = z.object({
  extraTimePercent:   z.number().int().min(0).max(100).default(0),
  textToSpeech:       z.boolean().default(false),
  fontSizeOverride:   z.number().int().min(14).max(28).nullable().optional(),
  restBreaksAllowed:  z.boolean().default(false),
  restBreakMinutes:   z.number().int().min(0).max(60).default(0),
  focusMode:          z.boolean().default(false),
  highContrastForced: z.boolean().default(false),
  notes:              z.string().max(1000).optional(),
});

// ── ADMIN / SENCO: manage student arrangements ─────────────

// GET /api/v1/sen/arrangements  — list all students with SEN arrangements in school
router.get('/arrangements', authenticate, isAdmin, async (req: Request, res: Response) => {
  const arrangements = await prisma.studentAccessArrangement.findMany({
    where: { student: { schoolId: req.user.schoolId! } },
    include: {
      student:     { select: { id: true, name: true, email: true } },
      configuredBy:{ select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ data: arrangements });
});

// GET /api/v1/sen/arrangements/:studentId  — get one student's arrangement
router.get('/arrangements/:studentId', authenticate, async (req: Request, res: Response) => {
  // Students can read their own; admins/teachers can read anyone in same school.
  if (req.user.role === 'STUDENT') {
    if (req.user.sub !== req.params.studentId) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
  } else {
    // Verify the student exists in the caller's school before disclosing the row.
    const student = await prisma.user.findFirst({
      where: { id: req.params.studentId, ...tenantScope(req.user.role, req.user.schoolId) },
      select: { id: true },
    });
    if (!student) { res.status(404).json({ error: 'Student not found' }); return; }
  }

  const arr = await prisma.studentAccessArrangement.findUnique({
    where: { studentId: req.params.studentId },
    include: { configuredBy: { select: { id: true, name: true } } },
  });
  res.json({ data: arr ?? null });
});

// PUT /api/v1/sen/arrangements/:studentId  — upsert arrangement (admin/SENCO only)
router.put('/arrangements/:studentId', authenticate, isAdmin, async (req: Request, res: Response) => {
  const parsed = arrangementSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }

  // Verify student is in same school
  const student = await prisma.user.findUnique({
    where: { id: req.params.studentId },
    select: { id: true, schoolId: true, role: true },
  });
  if (!student || student.schoolId !== req.user.schoolId) {
    res.status(404).json({ error: 'Student not found in your school' }); return;
  }
  if (student.role !== 'STUDENT') {
    res.status(400).json({ error: 'Access arrangements are only for students' }); return;
  }

  const arr = await prisma.studentAccessArrangement.upsert({
    where: { studentId: req.params.studentId },
    create: {
      studentId: req.params.studentId,
      configuredById: req.user.sub,
      ...parsed.data,
      fontSizeOverride: parsed.data.fontSizeOverride ?? null,
    },
    update: {
      configuredById: req.user.sub,
      updatedAt: new Date(),
      ...parsed.data,
      fontSizeOverride: parsed.data.fontSizeOverride ?? null,
    },
    include: {
      student:     { select: { id: true, name: true, email: true } },
      configuredBy:{ select: { id: true, name: true } },
    },
  });

  res.json({ data: arr });
});

// DELETE /api/v1/sen/arrangements/:studentId  — remove arrangement
router.delete('/arrangements/:studentId', authenticate, isAdmin, async (req: Request, res: Response) => {
  const student = await prisma.user.findFirst({
    where: { id: req.params.studentId, ...tenantScope(req.user.role, req.user.schoolId) },
    select: { id: true },
  });
  if (!student) { res.status(404).json({ error: 'Student not found' }); return; }

  await prisma.studentAccessArrangement.deleteMany({ where: { studentId: student.id } });
  res.json({ data: { removed: true } });
});

// ── REST BREAKS (called from student exam session) ─────────

// POST /api/v1/sen/sessions/:sessionId/rest-break/start
router.post('/sessions/:sessionId/rest-break/start', authenticate, isStudent, async (req: Request, res: Response) => {
  const session = await prisma.examSession.findUnique({
    where: { id: req.params.sessionId },
    include: { student: { include: { senProfile: true } } },
  });
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  if (session.studentId !== req.user.sub) { res.status(403).json({ error: 'Forbidden' }); return; }

  const sen = session.student.senProfile;
  if (!sen?.restBreaksAllowed) { res.status(403).json({ error: 'Rest breaks not enabled for this student' }); return; }

  // Check how many break minutes have been used
  const existing = await prisma.restBreakLog.findMany({
    where: { sessionId: req.params.sessionId },
    select: { durationSeconds: true },
  });
  const usedSeconds = existing.reduce((s, b) => s + (b.durationSeconds ?? 0), 0);
  const allowedSeconds = (sen.restBreakMinutes ?? 0) * 60;
  const remaining = allowedSeconds - usedSeconds;

  if (remaining <= 0) {
    res.status(400).json({ error: 'No rest break time remaining', remainingSeconds: 0 }); return;
  }

  // Any open break? Close it first
  const openBreak = await prisma.restBreakLog.findFirst({
    where: { sessionId: req.params.sessionId, resumedAt: null },
  });
  if (openBreak) {
    res.status(400).json({ error: 'A rest break is already active' }); return;
  }

  const log = await prisma.restBreakLog.create({
    data: { sessionId: req.params.sessionId },
  });

  res.json({ data: { breakId: log.id, remainingSeconds: remaining } });
});

// POST /api/v1/sen/sessions/:sessionId/rest-break/end
router.post('/sessions/:sessionId/rest-break/end', authenticate, isStudent, async (req: Request, res: Response) => {
  const session = await prisma.examSession.findUnique({
    where: { id: req.params.sessionId },
    select: { studentId: true },
  });
  if (!session || session.studentId !== req.user.sub) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  const openBreak = await prisma.restBreakLog.findFirst({
    where: { sessionId: req.params.sessionId, resumedAt: null },
  });
  if (!openBreak) { res.status(400).json({ error: 'No active rest break' }); return; }

  const now = new Date();
  const durationSeconds = Math.round((now.getTime() - openBreak.startedAt.getTime()) / 1000);

  const updated = await prisma.restBreakLog.update({
    where: { id: openBreak.id },
    data: { resumedAt: now, durationSeconds },
  });

  // Check remaining
  const allBreaks = await prisma.restBreakLog.findMany({
    where: { sessionId: req.params.sessionId },
    select: { durationSeconds: true },
  });
  const student = await prisma.user.findUnique({
    where: { id: req.user.sub },
    include: { senProfile: true },
  });
  const allowedSeconds = (student?.senProfile?.restBreakMinutes ?? 0) * 60;
  const usedSeconds = allBreaks.reduce((s, b) => s + (b.durationSeconds ?? 0), 0);

  res.json({
    data: {
      durationSeconds,
      remainingSeconds: Math.max(0, allowedSeconds - usedSeconds),
    },
  });
});

// GET /api/v1/sen/sessions/:sessionId/rest-breaks  — break log for this session
router.get('/sessions/:sessionId/rest-breaks', authenticate, async (req: Request, res: Response) => {
  // Tenant scope: students can only see their own session; teachers/admins
  // can see sessions in their school; super_admin sees any.
  const session = await prisma.examSession.findFirst({
    where: {
      id: req.params.sessionId,
      ...(req.user.role === 'STUDENT'
        ? { studentId: req.user.sub }
        : { exam: tenantScope(req.user.role, req.user.schoolId) }),
    },
    select: { id: true },
  });
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  const breaks = await prisma.restBreakLog.findMany({
    where: { sessionId: session.id },
    orderBy: { startedAt: 'asc' },
  });
  res.json({ data: breaks });
});

export default router;
