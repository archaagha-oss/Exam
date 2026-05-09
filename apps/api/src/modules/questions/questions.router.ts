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

// GET /api/v1/questions  — paginated. Query: type, tags, difficulty, search,
// cursor (id of last item), take (default 50, max 200).
router.get('/', async (req: Request, res: Response) => {
  const page = await listQuestions(req.user.schoolId!, req.query as any);
  // page.data + page.nextCursor; preserve old shape under .data, expose nextCursor at top level
  res.json({ data: page.data, nextCursor: page.nextCursor });
});

// GET /api/v1/questions/:id
router.get('/:id', async (req: Request, res: Response) => {
  const question = await getQuestion(req.params.id, req.user.schoolId!);
  if (!question) {
    res.status(404).json({ error: 'Question not found' });
    return;
  }
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
  try {
    const question = await updateQuestion(req.params.id, req.user.schoolId!, parsed.data);
    res.json({ data: question });
  } catch (err: any) {
    if (err?.status === 404 || err?.name === 'NotFoundError') {
      res.status(404).json({ error: 'Question not found' });
      return;
    }
    throw err;
  }
});

// DELETE /api/v1/questions/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteQuestion(req.params.id, req.user.schoolId!);
    res.json({ data: { message: 'Question deleted' } });
  } catch (err: any) {
    if (err?.status === 404 || err?.name === 'NotFoundError') {
      res.status(404).json({ error: 'Question not found' });
      return;
    }
    throw err;
  }
});

export default router;
