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
  role: z.enum(['STUDENT', 'TEACHER', 'SCHOOL_ADMIN']),
  schoolId: z.string().uuid(),
});

// GET /api/v1/users
router.get('/', isAdmin, async (req: Request, res: Response) => {
  const users = await listUsers(req.user.schoolId!, req.query.role as any);
  res.json({ data: users });
});

// GET /api/v1/users/:id
router.get('/:id', async (req: Request, res: Response) => {
  // Self-fetch always allowed; otherwise must be admin in same school
  if (req.params.id === req.user.sub) {
    const user = await getUser(req.params.id, req.user.schoolId!);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ data: user });
    return;
  }
  if (!['SCHOOL_ADMIN', 'PLATFORM_ADMIN'].includes(req.user.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const user = await getUser(req.params.id, req.user.schoolId!);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ data: user });
});

// POST /api/v1/users
router.post('/', isAdmin, async (req: Request, res: Response) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }
  // Admins can only create users in their own school
  if (req.user.role !== 'PLATFORM_ADMIN' && parsed.data.schoolId !== req.user.schoolId) {
    res.status(403).json({ error: 'Cannot create users in another school' });
    return;
  }
  try {
    const user = await createUser(parsed.data);
    res.status(201).json({ data: user });
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }
    throw err;
  }
});

// PUT /api/v1/users/:id
router.put('/:id', async (req: Request, res: Response) => {
  if (req.params.id !== req.user.sub && !['SCHOOL_ADMIN', 'PLATFORM_ADMIN'].includes(req.user.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    const user = await updateUser(req.params.id, req.user.schoolId!, req.body);
    res.json({ data: user });
  } catch (err: any) {
    if (err?.status === 404 || err?.name === 'NotFoundError') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    throw err;
  }
});

// DELETE /api/v1/users/:id
router.delete('/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    await deleteUser(req.params.id, req.user.schoolId!);
    res.json({ data: { message: 'User deleted' } });
  } catch (err: any) {
    if (err?.status === 404 || err?.name === 'NotFoundError') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    throw err;
  }
});

export default router;
