// apps/api/src/modules/exams/sections.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, isTeacher } from '../../middleware/auth';
import { canManageExam } from '../../lib/examAccess';
import prisma from '../../lib/prisma';

const router = Router({ mergeParams: true }); // access :examId
router.use(authenticate, isTeacher);

// ── SECTIONS ──────────────────────────────────────────────

// GET /api/v1/exams/:examId/sections
router.get('/', async (req: Request, res: Response) => {
  const sections = await prisma.examSection.findMany({
    where: { examId: req.params.examId },
    include: {
      items: { include: { question: { select: { id: true, body: true, type: true, points: true } } }, orderBy: { order: 'asc' } },
      pools: { orderBy: { order: 'asc' } },
    },
    orderBy: { order: 'asc' },
  });
  res.json({ data: sections });
});

// POST /api/v1/exams/:examId/sections
router.post('/', async (req: Request, res: Response) => {
  const ok = await canManageExam(req.user.sub, req.user.role, req.params.examId);
  if (!ok) { res.status(403).json({ error: 'Forbidden' }); return; }

  const schema = z.object({
    title: z.string().min(1),
    instructions: z.string().optional(),
    durationMinutes: z.number().int().positive().optional(),
    order: z.number().int().min(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const maxOrder = await prisma.examSection.aggregate({
    where: { examId: req.params.examId },
    _max: { order: true },
  });

  const section = await prisma.examSection.create({
    data: {
      examId: req.params.examId,
      title: parsed.data.title,
      instructions: parsed.data.instructions,
      durationMinutes: parsed.data.durationMinutes,
      order: parsed.data.order ?? (maxOrder._max.order ?? 0) + 1,
    },
  });
  res.status(201).json({ data: section });
});

// PUT /api/v1/exams/:examId/sections/:sectionId
router.put('/:sectionId', async (req: Request, res: Response) => {
  const ok = await canManageExam(req.user.sub, req.user.role, req.params.examId);
  if (!ok) { res.status(403).json({ error: 'Forbidden' }); return; }

  const schema = z.object({
    title: z.string().min(1).optional(),
    instructions: z.string().optional(),
    durationMinutes: z.number().int().positive().nullable().optional(),
    order: z.number().int().min(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const section = await prisma.examSection.update({
    where: { id: req.params.sectionId },
    data: parsed.data,
  });
  res.json({ data: section });
});

// DELETE /api/v1/exams/:examId/sections/:sectionId
router.delete('/:sectionId', async (req: Request, res: Response) => {
  const ok = await canManageExam(req.user.sub, req.user.role, req.params.examId);
  if (!ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  await prisma.examSection.delete({ where: { id: req.params.sectionId } });
  res.json({ data: { deleted: true } });
});

// ── POOLS ─────────────────────────────────────────────────

// POST /api/v1/exams/:examId/pools
router.post('/pools', async (req: Request, res: Response) => {
  const ok = await canManageExam(req.user.sub, req.user.role, req.params.examId);
  if (!ok) { res.status(403).json({ error: 'Forbidden' }); return; }

  const schema = z.object({
    title: z.string().min(1),
    sectionId: z.string().uuid().optional(),
    drawCount: z.number().int().min(1),
    tags: z.array(z.string()).default([]),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    type: z.string().optional(),
    order: z.number().int().min(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  // Validate pool: check how many matching questions exist
  const available = await prisma.question.count({
    where: {
      schoolId: req.user.schoolId!,
      ...(parsed.data.tags.length ? { tags: { hasSome: parsed.data.tags } } : {}),
      ...(parsed.data.difficulty ? { difficulty: parsed.data.difficulty } : {}),
      ...(parsed.data.type ? { type: parsed.data.type as any } : {}),
    },
  });

  if (available < parsed.data.drawCount) {
    res.status(400).json({
      error: `Only ${available} matching questions found, but drawCount is ${parsed.data.drawCount}. Add more questions or reduce drawCount.`,
    });
    return;
  }

  const maxOrder = await prisma.examPool.aggregate({
    where: { examId: req.params.examId },
    _max: { order: true },
  });

  const pool = await prisma.examPool.create({
    data: {
      examId: req.params.examId,
      sectionId: parsed.data.sectionId,
      title: parsed.data.title,
      drawCount: parsed.data.drawCount,
      tags: parsed.data.tags,
      difficulty: parsed.data.difficulty,
      type: parsed.data.type,
      order: parsed.data.order ?? (maxOrder._max.order ?? 0) + 1,
    },
  });
  res.status(201).json({ data: { pool, available } });
});

// DELETE /api/v1/exams/:examId/pools/:poolId
router.delete('/pools/:poolId', async (req: Request, res: Response) => {
  const ok = await canManageExam(req.user.sub, req.user.role, req.params.examId);
  if (!ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  await prisma.examPool.delete({ where: { id: req.params.poolId } });
  res.json({ data: { deleted: true } });
});

// GET /api/v1/exams/:examId/pools/preview  — show which questions would be drawn
router.get('/pools/preview', async (req: Request, res: Response) => {
  const pools = await prisma.examPool.findMany({
    where: { examId: req.params.examId },
    orderBy: { order: 'asc' },
  });

  const previews = await Promise.all(pools.map(async pool => {
    const questions = await prisma.question.findMany({
      where: {
        schoolId: req.user.schoolId!,
        ...(pool.tags.length ? { tags: { hasSome: pool.tags } } : {}),
        ...(pool.difficulty ? { difficulty: pool.difficulty } : {}),
        ...(pool.type ? { type: pool.type as any } : {}),
      },
      select: { id: true, body: true, type: true, difficulty: true, tags: true, points: true },
    });
    return { pool, available: questions.length, sample: questions.slice(0, 3) };
  }));

  res.json({ data: previews });
});

export default router;
