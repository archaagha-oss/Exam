// apps/api/src/modules/questions/questions.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, isTeacher } from '../../middleware/auth';
import {
  listQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  deleteQuestion,
} from './questions.service';

const router = Router();
router.use(authenticate, isTeacher);

const questionSchema = z.object({
  type: z.enum(['MCQ', 'MCQ_MULTI', 'TRUE_FALSE', 'SHORT_TEXT', 'ESSAY']),
  body: z.string().min(1),
  options: z
    .array(z.object({ id: z.string(), text: z.string(), mediaUrl: z.string().optional() }))
    .optional(),
  correctIds: z.array(z.string()).optional(),
  rubric: z.string().optional(),
  points: z.number().positive().optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  tags: z.array(z.string()).optional(),
});

// GET /api/v1/questions
router.get('/', async (req: Request, res: Response) => {
  const questions = await listQuestions(req.user.schoolId!, req.query as any);
  res.json({ data: questions });
});

// GET /api/v1/questions/:id
router.get('/:id', async (req: Request, res: Response) => {
  const question = await getQuestion(req.params.id);
  if (!question) { res.status(404).json({ error: 'Question not found' }); return; }
  res.json({ data: question });
});

// POST /api/v1/questions
router.post('/', async (req: Request, res: Response) => {
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }
  const question = await createQuestion(req.user.sub, req.user.schoolId!, parsed.data);
  res.status(201).json({ data: question });
});

// PUT /api/v1/questions/:id
router.put('/:id', async (req: Request, res: Response) => {
  const parsed = questionSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }
  const question = await updateQuestion(req.params.id, parsed.data);
  res.json({ data: question });
});

// DELETE /api/v1/questions/:id
router.delete('/:id', async (req: Request, res: Response) => {
  await deleteQuestion(req.params.id);
  res.json({ data: { message: 'Question deleted' } });
});

export default router;
