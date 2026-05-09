// apps/api/src/modules/schools/schools.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, isAdmin } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

// GET /api/v1/schools/:id/classes
router.get('/:id/classes', isAdmin, async (req: Request, res: Response) => {
  const classes = await prisma.class.findMany({
    where: { schoolId: req.params.id },
    include: {
      _count: { select: { students: true, teachers: true, exams: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json({ data: classes });
});

// POST /api/v1/schools/:id/classes
router.post('/:id/classes', isAdmin, async (req: Request, res: Response) => {
  const schema = z.object({ name: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const cls = await prisma.class.create({
    data: { name: parsed.data.name, schoolId: req.params.id },
  });
  res.status(201).json({ data: cls });
});

// POST /api/v1/classes/:id/students — add students to class
router.post('/classes/:id/students', isAdmin, async (req: Request, res: Response) => {
  const schema = z.object({ studentIds: z.array(z.string().uuid()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  await prisma.classStudent.createMany({
    data: parsed.data.studentIds.map((sid) => ({ classId: req.params.id, studentId: sid })),
    skipDuplicates: true,
  });
  res.json({ data: { message: 'Students added' } });
});

// GET /api/v1/schools/classes — list teacher's classes
router.get('/my-classes', async (req: Request, res: Response) => {
  const classes = await prisma.class.findMany({
    where: {
      teachers: { some: { teacherId: req.user.sub } },
    },
    include: {
      _count: { select: { students: true } },
    },
  });
  res.json({ data: classes });
});

export default router;
