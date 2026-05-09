// apps/api/src/modules/users/users.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, isAdmin } from '../../middleware/auth';
import { listUsers, getUser, createUser, updateUser, deleteUser } from './users.service';

const router = Router();
router.use(authenticate);

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['STUDENT', 'TEACHER', 'ADMIN']),
  schoolId: z.string().uuid(),
});

// GET /api/v1/users
router.get('/', isAdmin, async (req: Request, res: Response) => {
  const users = await listUsers(req.user.schoolId!, req.query.role as any);
  res.json({ data: users });
});

// GET /api/v1/users/:id
router.get('/:id', async (req: Request, res: Response) => {
  // Users can view themselves; admins can view anyone in their school
  const user = await getUser(req.params.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  if (user.id !== req.user.sub && req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  res.json({ data: user });
});

// POST /api/v1/users
router.post('/', isAdmin, async (req: Request, res: Response) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }
  try {
    const user = await createUser(parsed.data);
    res.status(201).json({ data: user });
  } catch (err: any) {
    if (err.code === 'P2002') { res.status(409).json({ error: 'Email already in use' }); return; }
    throw err;
  }
});

// PUT /api/v1/users/:id
router.put('/:id', async (req: Request, res: Response) => {
  if (req.params.id !== req.user.sub && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const user = await updateUser(req.params.id, req.body);
  res.json({ data: user });
});

// DELETE /api/v1/users/:id
router.delete('/:id', isAdmin, async (req: Request, res: Response) => {
  await deleteUser(req.params.id);
  res.json({ data: { message: 'User deleted' } });
});

export default router;
