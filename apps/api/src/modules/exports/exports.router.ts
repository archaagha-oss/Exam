// apps/api/src/modules/exports/exports.router.ts
import { Router, Request, Response } from 'express';
import { authenticate, isTeacher, isAdmin } from '../../middleware/auth';
import { canProctorExam } from '../../lib/examAccess';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

function escapeCSV(val: any): string {
  if (val == null) return '';
  let str = String(val);
  // Defang spreadsheet formulas: leading =, +, -, @, tab, CR
  if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(rows: object[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escapeCSV((r as any)[h])).join(',')),
  ];
  return lines.join('\n');
}

// GET /api/v1/exports/exams/:id/results.csv
router.get('/exams/:id/results.csv', isTeacher, async (req: Request, res: Response) => {
  const allowed = await canProctorExam(req.user.sub, req.user.role, req.user.schoolId, req.params.id);
  if (!allowed) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  // Tenant scope: also verify the exam belongs to caller's school
  const exam = await prisma.exam.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId! },
    include: {
      sessions: {
        include: {
          student: { select: { name: true, email: true } },
          violations: true,
          answers: true,
        },
      },
      items: {
        include: { question: { select: { body: true, points: true } } },
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!exam) {
    res.status(404).json({ error: 'Exam not found' });
    return;
  }

  const rows = exam.sessions.map((s) => {
    const timeTaken =
      s.startedAt && s.submittedAt
        ? Math.round((new Date(s.submittedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)
        : null;
    const pct = s.totalPoints ? Math.round(((s.score ?? 0) / s.totalPoints) * 100) : null;
    const passed = exam.passingScore && pct !== null ? pct >= exam.passingScore : null;

    return {
      'Student Name': s.student.name,
      'Student Email': s.student.email,
      Status: s.status,
      Score: s.score ?? '',
      'Total Points': s.totalPoints ?? '',
      Percentage: pct !== null ? `${pct}%` : '',
      Passed: passed !== null ? (passed ? 'Yes' : 'No') : '',
      Violations: s.violationCount,
      'Started At': s.startedAt ? new Date(s.startedAt).toISOString() : '',
      'Submitted At': s.submittedAt ? new Date(s.submittedAt).toISOString() : '',
      'Time Taken (s)': timeTaken ?? '',
    };
  });

  const csv = toCSV(rows);
  const filename = `${exam.title.replace(/[^a-z0-9]/gi, '_')}_results.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// GET /api/v1/exports/schools/:schoolId/users.csv  — bulk user export
router.get('/schools/:schoolId/users.csv', isAdmin, async (req: Request, res: Response) => {
  // Admin can only export their own school. SUPER_ADMIN can export any.
  if (req.user.role !== 'SUPER_ADMIN' && req.params.schoolId !== req.user.schoolId) {
    res.status(403).json({ error: 'Cannot export users from another school' });
    return;
  }
  const users = await prisma.user.findMany({
    where: { schoolId: req.params.schoolId },
    select: { name: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });

  const rows = users.map((u) => ({
    Name: u.name,
    Email: u.email,
    Role: u.role,
    Active: u.isActive ? 'Yes' : 'No',
    'Created At': u.createdAt.toISOString(),
  }));

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
  res.send(toCSV(rows));
});

export default router;
