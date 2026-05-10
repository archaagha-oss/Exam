// apps/api/src/modules/audit/audit.router.ts
import { Router, Request, Response } from 'express';
import { authenticate, isAdmin } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, isAdmin);

// GET /api/v1/audit?page=1&pageSize=50&action=&actorId=&targetId=
router.get('/', async (req: Request, res: Response) => {
  const page     = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Number(req.query.pageSize) || 50);
  const skip     = (page - 1) * pageSize;

  const where: any = {};
  if (req.query.action)   where.action   = req.query.action;
  if (req.query.actorId)  where.actorId  = req.query.actorId;
  if (req.query.targetId) where.targetId = req.query.targetId;

  // Admins can only see their own school's logs
  if (req.user.role === 'SCHOOL_ADMIN') {
    where.actor = { schoolId: req.user.schoolId };
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ data: logs, total, page, pageSize });
});

export default router;
