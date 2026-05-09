// apps/api/src/modules/pins/pins.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { authenticate, isTeacher } from '../../middleware/auth';
import { canManageExam, audit } from '../../lib/examAccess';
import { sendPinEmail } from '../notifications/notifications.service';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, isTeacher);

router.post('/generate', async (req: Request, res: Response) => {
  const schema = z.object({
    examId: z.string().uuid(),
    purposes: z.array(z.enum(['UNLOCK', 'EXIT'])).min(1),
    deliverTo: z.string().email().optional(), // if set, email the PINs
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const allowed = await canManageExam(req.user.sub, req.user.role, parsed.data.examId);
  if (!allowed) { res.status(403).json({ error: 'Only the exam owner can generate PINs' }); return; }

  const exam = await prisma.exam.findUnique({
    where: { id: parsed.data.examId },
    select: { title: true },
  });
  if (!exam) { res.status(404).json({ error: 'Exam not found' }); return; }

  const results: Record<string, string> = {};
  for (const purpose of parsed.data.purposes) {
    const pin = crypto.randomInt(1000, 9999).toString();
    const pinHash = await bcrypt.hash(pin, 10);
    await prisma.examPin.upsert({
      where: { examId_purpose: { examId: parsed.data.examId, purpose } },
      create: { examId: parsed.data.examId, purpose, pinHash, createdBy: req.user.sub, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      update: { pinHash, createdBy: req.user.sub, usedAt: null, usedBy: null, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    results[purpose] = pin;
  }

  await audit(req.user.sub, 'PIN_GENERATED', 'Exam', parsed.data.examId, {
    purposes: parsed.data.purposes,
    examTitle: exam.title,
  });

  // Email delivery if requested
  let emailSent = false;
  if (parsed.data.deliverTo) {
    emailSent = await sendPinEmail({
      to: parsed.data.deliverTo,
      recipientName: 'Invigilator',
      examTitle: exam.title,
      unlockPin: results['UNLOCK'],
      exitPin: results['EXIT'],
    });
  }

  res.json({
    data: {
      pins: results,
      emailSent,
      warning: 'Store these PINs securely. They cannot be retrieved again.',
    },
  });
});

router.get('/:examId', async (req: Request, res: Response) => {
  const pins = await prisma.examPin.findMany({
    where: { examId: req.params.examId },
    select: { purpose: true, createdAt: true, expiresAt: true, usedAt: true },
  });
  res.json({ data: pins });
});

export default router;
