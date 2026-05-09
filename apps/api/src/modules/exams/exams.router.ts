// apps/api/src/modules/exams/exams.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, isTeacher } from '../../middleware/auth';
import {
  listExams, getExam, createExam, updateExam, deleteExam,
  publishExam, assignExam, addExamItem, removeExamItem, reorderExamItems,
} from './exams.service';

const router = Router();
router.use(authenticate);

const examSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  maxViolations: z.number().int().min(1).max(10).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  showResultsAfter: z.boolean().optional(),
  passingScore: z.number().min(0).max(100).optional(),
  instructions: z.string().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

// GET /api/v1/exams
router.get('/', isTeacher, async (req: Request, res: Response) => {
  const exams = await listExams(req.user.sub, req.user.schoolId!);
  res.json({ data: exams });
});

// GET /api/v1/exams/:id
router.get('/:id', isTeacher, async (req: Request, res: Response) => {
  const exam = await getExam(req.params.id);
  if (!exam) { res.status(404).json({ error: 'Exam not found' }); return; }
  res.json({ data: exam });
});

// POST /api/v1/exams
router.post('/', isTeacher, async (req: Request, res: Response) => {
  const parsed = examSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }
  const exam = await createExam(req.user.sub, req.user.schoolId!, parsed.data);
  res.status(201).json({ data: exam });
});

// PUT /api/v1/exams/:id
router.put('/:id', isTeacher, async (req: Request, res: Response) => {
  const parsed = examSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }
  const exam = await updateExam(req.params.id, parsed.data);
  res.json({ data: exam });
});

// DELETE /api/v1/exams/:id
router.delete('/:id', isTeacher, async (req: Request, res: Response) => {
  await deleteExam(req.params.id);
  res.json({ data: { message: 'Exam deleted' } });
});

// POST /api/v1/exams/:id/publish
router.post('/:id/publish', isTeacher, async (req: Request, res: Response) => {
  try {
    const exam = await publishExam(req.params.id);
    res.json({ data: exam });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/v1/exams/:id/assign
router.post('/:id/assign', isTeacher, async (req: Request, res: Response) => {
  const schema = z.object({ classIds: z.array(z.string().uuid()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }
  await assignExam(req.params.id, parsed.data.classIds);
  res.json({ data: { message: 'Exam assigned' } });
});

// POST /api/v1/exams/:id/items
router.post('/:id/items', isTeacher, async (req: Request, res: Response) => {
  const schema = z.object({ questionId: z.string().uuid(), points: z.number().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }
  const item = await addExamItem(req.params.id, parsed.data.questionId, parsed.data.points);
  res.status(201).json({ data: item });
});

// DELETE /api/v1/exams/:id/items/:itemId
router.delete('/:id/items/:itemId', isTeacher, async (req: Request, res: Response) => {
  await removeExamItem(req.params.itemId);
  res.json({ data: { message: 'Item removed' } });
});

// PUT /api/v1/exams/:id/items/:itemId — update points / scoring mode
router.put('/:id/items/:itemId', isTeacher, async (req: Request, res: Response) => {
  const schema = z.object({
    points:       z.number().min(0).optional(),
    scoringMode:  z.enum(['binary', 'partial', 'negative']).optional(),
    negativeMarks: z.number().min(0).optional(),
    bonusPoints:  z.number().min(0).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const prisma = (await import('../../lib/prisma')).default;
  const item = await prisma.examItem.update({
    where: { id: req.params.itemId },
    data: parsed.data,
    include: { question: { select: { id: true, body: true, type: true, points: true } } },
  });
  res.json({ data: item });
});

// PUT /api/v1/exams/:id/items/reorder
router.put('/:id/items/reorder', isTeacher, async (req: Request, res: Response) => {
  const schema = z.object({ itemIds: z.array(z.string().uuid()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }
  await reorderExamItems(req.params.id, parsed.data.itemIds);
  res.json({ data: { message: 'Items reordered' } });
});

// POST /api/v1/exams/:id/activate  — move from PUBLISHED → ACTIVE (starts live session)
router.post('/:id/activate', isTeacher, async (req: Request, res: Response) => {
  const { canManageExam, audit } = await import('../../lib/examAccess');
  const allowed = await canManageExam(req.user.sub, req.user.role, req.params.id);
  if (!allowed) { res.status(403).json({ error: 'Only the exam owner can activate it' }); return; }
  const prisma = (await import('../../lib/prisma')).default;
  const exam = await prisma.exam.update({
    where: { id: req.params.id },
    data: { status: 'ACTIVE' },
    select: { id: true, title: true, status: true },
  });
  await audit(req.user.sub, 'EXAM_PUBLISHED', 'Exam', exam.id, { title: exam.title, status: 'ACTIVE' });
  res.json({ data: exam });
});

// POST /api/v1/exams/:id/close
router.post('/:id/close', isTeacher, async (req: Request, res: Response) => {
  const { canManageExam, audit } = await import('../../lib/examAccess');
  const allowed = await canManageExam(req.user.sub, req.user.role, req.params.id);
  if (!allowed) { res.status(403).json({ error: 'Only the exam owner can close it' }); return; }
  const prisma = (await import('../../lib/prisma')).default;
  const exam = await prisma.exam.update({
    where: { id: req.params.id },
    data: { status: 'CLOSED' },
    select: { id: true, title: true, status: true },
  });
  await audit(req.user.sub, 'EXAM_CLOSED', 'Exam', exam.id, { title: exam.title });
  res.json({ data: exam });
});

export default router;
