// apps/api/src/modules/proctors/proctors.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, isTeacher } from '../../middleware/auth';
import { canManageExam, canProctorExam, audit } from '../../lib/examAccess';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, isTeacher);

// GET /api/v1/proctors/exams/:examId  — list co-proctors for an exam
router.get('/exams/:examId', async (req: Request, res: Response) => {
  const allowed = await canProctorExam(req.user.sub, req.user.role, req.user.schoolId, req.params.examId);
  if (!allowed) { res.status(403).json({ error: 'Access denied' }); return; }

  const proctors = await prisma.examProctor.findMany({
    where: { examId: req.params.examId },
    include: {
      teacher: { select: { id: true, name: true, email: true } },
      inviter: { select: { id: true, name: true } },
    },
    orderBy: { invitedAt: 'asc' },
  });
  res.json({ data: proctors });
});

// POST /api/v1/proctors/exams/:examId  — invite a co-proctor by email
router.post('/exams/:examId', async (req: Request, res: Response) => {
  const allowed = await canManageExam(req.user.sub, req.user.role, req.user.schoolId, req.params.examId);
  if (!allowed) { res.status(403).json({ error: 'Only the exam owner can invite co-proctors' }); return; }

  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  // Find teacher in same school
  const exam = await prisma.exam.findUnique({
    where: { id: req.params.examId },
    select: { schoolId: true, teacherId: true, title: true },
  });
  if (!exam) { res.status(404).json({ error: 'Exam not found' }); return; }

  const invitee = await prisma.user.findFirst({
    where: {
      email: parsed.data.email.toLowerCase(),
      role: 'TEACHER',
      schoolId: exam.schoolId,
    },
    select: { id: true, name: true, email: true },
  });

  if (!invitee) {
    res.status(404).json({ error: 'No teacher found with that email in your school' });
    return;
  }
  if (invitee.id === exam.teacherId) {
    res.status(400).json({ error: 'Cannot invite yourself — you already own this exam' });
    return;
  }

  // Upsert (idempotent)
  const proctor = await prisma.examProctor.upsert({
    where: { examId_teacherId: { examId: req.params.examId, teacherId: invitee.id } },
    create: { examId: req.params.examId, teacherId: invitee.id, invitedBy: req.user.sub },
    update: { invitedBy: req.user.sub, invitedAt: new Date() },
    include: { teacher: { select: { id: true, name: true, email: true } } },
  });

  await audit(req.user.sub, 'PROCTOR_INVITED', 'Exam', req.params.examId, {
    inviteeId: invitee.id,
    inviteeName: invitee.name,
    examTitle: exam.title,
  });

  res.status(201).json({ data: proctor });
});

// DELETE /api/v1/proctors/exams/:examId/:teacherId  — remove a co-proctor
router.delete('/exams/:examId/:teacherId', async (req: Request, res: Response) => {
  const allowed = await canManageExam(req.user.sub, req.user.role, req.user.schoolId, req.params.examId);
  if (!allowed) { res.status(403).json({ error: 'Only the exam owner can remove co-proctors' }); return; }

  await prisma.examProctor.deleteMany({
    where: { examId: req.params.examId, teacherId: req.params.teacherId },
  });

  await audit(req.user.sub, 'PROCTOR_REMOVED', 'Exam', req.params.examId, {
    removedTeacherId: req.params.teacherId,
  });

  res.json({ data: { removed: true } });
});

// GET /api/v1/proctors/shared-with-me  — exams shared with the current teacher
router.get('/shared-with-me', async (req: Request, res: Response) => {
  const assignments = await prisma.examProctor.findMany({
    where: { teacherId: req.user.sub },
    include: {
      exam: {
        include: {
          teacher: { select: { id: true, name: true } },
          _count: { select: { items: true, sessions: true } },
        },
      },
      inviter: { select: { id: true, name: true } },
    },
    orderBy: { invitedAt: 'desc' },
  });

  res.json({ data: assignments });
});

export default router;
