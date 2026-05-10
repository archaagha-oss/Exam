// apps/api/src/modules/security/security.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { authenticate, isTeacher, isStudent } from '../../middleware/auth';
import { canManageExam, tenantScope } from '../../lib/examAccess';
import { logger } from '../../lib/logger';
import prisma from '../../lib/prisma';

const router = Router();

// ── IP VALIDATION HELPER ──────────────────────────────────

function ipInCidr(ip: string, cidr: string): boolean {
  try {
    const [range, bits = '32'] = cidr.trim().split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1) >>> 0;
    const ipNum = ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0;
    const rangeNum = range.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0;
    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}

function checkIpAllowed(clientIp: string, allowlist: string): boolean {
  const cidrs = allowlist
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (cidrs.length === 0) return true;
  return cidrs.some((cidr) => ipInCidr(clientIp, cidr));
}

function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '0.0.0.0'
  );
}

// ── MAGIC LINKS ──────────────────────────────────────────

// POST /api/v1/security/exams/:id/invites/generate
// Teacher generates magic links for their class roster
router.post(
  '/exams/:id/invites/generate',
  authenticate,
  isTeacher,
  async (req: Request, res: Response) => {
    const canManage = await canManageExam(req.user.sub, req.user.role, req.user.schoolId, req.params.id);
    if (!canManage) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const schema = z.object({
      studentIds: z.array(z.string().uuid()).min(1).max(500),
      expiresAt: z.string().datetime(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input' });
      return;
    }

    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      select: { id: true, title: true, securityLevel: true },
    });
    if (!exam) {
      res.status(404).json({ error: 'Exam not found' });
      return;
    }

    const expiresAt = new Date(parsed.data.expiresAt);
    const results: {
      studentId: string;
      email: string;
      name: string;
      token: string;
      magicLink: string;
    }[] = [];

    for (const studentId of parsed.data.studentIds) {
      const student = await prisma.user.findUnique({
        where: { id: studentId },
        select: { id: true, email: true, name: true },
      });
      if (!student) continue;

      // Generate cryptographically secure token
      const token = crypto.randomBytes(32).toString('hex');

      // Upsert invite (re-generate if one already exists)
      await prisma.examInvite.upsert({
        where: { examId_studentId: { examId: req.params.id, studentId } },
        create: { examId: req.params.id, studentId, token, expiresAt },
        update: { token, expiresAt, usedAt: null }, // re-enable if previously used
      });

      const baseUrl = process.env.STUDENT_APP_URL ?? 'http://localhost:5173';
      const magicLink = `${baseUrl}/join/${token}`;
      results.push({ studentId, email: student.email, name: student.name, token, magicLink });

      // Send email (non-blocking)
      sendInviteEmail(student.email, student.name, exam.title, magicLink, expiresAt).catch(
        () => {}
      );
    }

    res.json({ data: { generated: results.length, invites: results } });
  }
);

// POST /api/v1/security/exams/:id/invites/send-all
// Resend emails for all existing invites
router.post(
  '/exams/:id/invites/send-all',
  authenticate,
  isTeacher,
  async (req: Request, res: Response) => {
    const canManage = await canManageExam(req.user.sub, req.user.role, req.user.schoolId, req.params.id);
    if (!canManage) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      select: { title: true },
    });
    if (!exam) {
      res.status(404).json({ error: 'Exam not found' });
      return;
    }

    const invites = await prisma.examInvite.findMany({
      where: { examId: req.params.id, usedAt: null, expiresAt: { gte: new Date() } },
      include: { student: { select: { email: true, name: true } } },
    });

    const baseUrl = process.env.STUDENT_APP_URL ?? 'http://localhost:5173';
    let sent = 0;
    for (const invite of invites) {
      const magicLink = `${baseUrl}/join/${invite.token}`;
      await sendInviteEmail(
        invite.student.email,
        invite.student.name,
        exam.title,
        magicLink,
        invite.expiresAt
      ).catch(() => {});
      sent++;
    }

    res.json({ data: { sent } });
  }
);

// GET /api/v1/security/exams/:id/invites
// List all invites for an exam (teacher)
router.get('/exams/:id/invites', authenticate, isTeacher, async (req: Request, res: Response) => {
  const canManage = await canManageExam(req.user.sub, req.user.role, req.user.schoolId, req.params.id);
  if (!canManage) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const invites = await prisma.examInvite.findMany({
    where: { examId: req.params.id },
    include: { student: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const baseUrl = process.env.STUDENT_APP_URL ?? 'http://localhost:5173';
  res.json({
    data: invites.map((i) => ({
      id: i.id,
      student: i.student,
      magicLink: `${baseUrl}/join/${i.token}`,
      status: i.usedAt ? 'used' : new Date() > i.expiresAt ? 'expired' : 'active',
      usedAt: i.usedAt,
      expiresAt: i.expiresAt,
    })),
  });
});

// GET /api/v1/security/join/:token  — student clicks magic link
// Validates token and returns exam + student info (no auth required — this IS the auth)
router.get('/join/:token', async (req: Request, res: Response) => {
  const invite = await prisma.examInvite.findUnique({
    where: { token: req.params.token },
    include: {
      exam: {
        select: {
          id: true,
          title: true,
          securityLevel: true,
          ipAllowlist: true,
          requireOtp: true,
          status: true,
        },
      },
      student: { select: { id: true, name: true, email: true } },
    },
  });

  if (!invite) {
    res.status(404).json({ error: 'Invalid or expired link' });
    return;
  }
  if (invite.usedAt) {
    res.status(410).json({ error: 'This link has already been used', usedAt: invite.usedAt });
    return;
  }
  if (new Date() > invite.expiresAt) {
    res.status(410).json({ error: 'This link has expired', expiresAt: invite.expiresAt });
    return;
  }
  if (!['PUBLISHED', 'ACTIVE'].includes(invite.exam.status)) {
    res.status(403).json({ error: 'This exam is not currently available' });
    return;
  }

  // IP check (if exam has allowlist configured)
  if (invite.exam.ipAllowlist) {
    const clientIp = getClientIp(req);
    if (!checkIpAllowed(clientIp, invite.exam.ipAllowlist)) {
      res.status(403).json({
        error: 'Access denied: you are not connecting from an allowed network',
        detail: `Your IP address (${clientIp}) is not in the allowed range for this exam.`,
        code: 'IP_BLOCKED',
      });
      return;
    }
  }

  // Mark invite as used
  await prisma.examInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });

  // Short-lived pre-auth token (5 min) — proper signed JWT, not hand-rolled HMAC
  const { default: jwt } = await import('jsonwebtoken');
  const { env } = await import('../../lib/env');
  const preAuthToken = jwt.sign(
    {
      sub: invite.studentId,
      examId: invite.examId,
      kind: 'magic-link-preauth',
    },
    env().JWT_SECRET,
    { expiresIn: '5m' } as jwt.SignOptions
  );

  res.json({
    data: {
      examId: invite.exam.id,
      examTitle: invite.exam.title,
      student: invite.student,
      securityLevel: invite.exam.securityLevel,
      requireOtp: invite.exam.requireOtp,
      preAuthToken,
    },
  });
});

// ── OTP ───────────────────────────────────────────────────

// POST /api/v1/security/sessions/:id/otp/send
// Sends OTP to student's email before exam starts
router.post(
  '/sessions/:sessionId/otp/send',
  authenticate,
  isStudent,
  async (req: Request, res: Response) => {
    const session = await prisma.examSession.findUnique({
      where: { id: req.params.sessionId },
      include: {
        exam: { select: { requireOtp: true, title: true } },
        student: { select: { email: true, name: true } },
      },
    });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.studentId !== req.user.sub) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (!session.exam.requireOtp) {
      res.status(400).json({ error: 'OTP not required for this exam' });
      return;
    }
    if (session.otpVerifiedAt) {
      res.status(400).json({ error: 'OTP already verified' });
      return;
    }

    // Generate 6-digit OTP using crypto-secure RNG
    const plainCode = String(crypto.randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(plainCode, 12);
    const expiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds

    await prisma.examOtp.upsert({
      where: { sessionId: req.params.sessionId },
      create: { sessionId: req.params.sessionId, code: codeHash, expiresAt },
      update: { code: codeHash, expiresAt, attempts: 0, verifiedAt: null },
    });

    // Send email
    await sendOtpEmail(session.student.email, session.student.name, plainCode, session.exam.title);

    res.json({ data: { sent: true, expiresAt, destination: maskEmail(session.student.email) } });
  }
);

// POST /api/v1/security/sessions/:id/otp/verify
router.post(
  '/sessions/:sessionId/otp/verify',
  authenticate,
  isStudent,
  async (req: Request, res: Response) => {
    const schema = z.object({ code: z.string().length(6) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid code format' });
      return;
    }

    const session = await prisma.examSession.findUnique({
      where: { id: req.params.sessionId },
      select: { studentId: true, otpVerifiedAt: true },
    });
    if (!session || session.studentId !== req.user.sub) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (session.otpVerifiedAt) {
      res.json({ data: { verified: true } });
      return;
    }

    // Per-session attempt counter (cumulative across OTP regenerations).
    // Hard cap at 10 attempts per 15 min, regardless of how many OTPs sent.
    const { redis } = await import('../../lib/redis');
    const lockKey = `otp:lock:${req.params.sessionId}`;
    const totalAttempts = Number((await redis().get(lockKey)) ?? '0');
    if (totalAttempts >= 10) {
      res
        .status(429)
        .json({ error: 'Session locked — too many OTP attempts', code: 'SESSION_LOCKED' });
      return;
    }

    const otp = await prisma.examOtp.findUnique({
      where: { sessionId: req.params.sessionId },
    });
    if (!otp) {
      res.status(400).json({ error: 'No OTP found — request a new one' });
      return;
    }
    if (otp.verifiedAt) {
      res.json({ data: { verified: true } });
      return;
    }
    if (new Date() > otp.expiresAt) {
      res.status(400).json({ error: 'OTP expired — request a new one', code: 'EXPIRED' });
      return;
    }
    if (otp.attempts >= 3) {
      res
        .status(429)
        .json({ error: 'Too many attempts — request a new OTP', code: 'TOO_MANY_ATTEMPTS' });
      return;
    }

    const valid = await bcrypt.compare(parsed.data.code, otp.code);
    if (!valid) {
      await prisma.examOtp.update({
        where: { sessionId: req.params.sessionId },
        data: { attempts: { increment: 1 } },
      });
      const newTotal = await redis().incr(lockKey);
      if (newTotal === 1) await redis().expire(lockKey, 15 * 60);
      res.status(400).json({ error: 'Incorrect code', attemptsLeft: 3 - (otp.attempts + 1) });
      return;
    }

    const now = new Date();
    await Promise.all([
      prisma.examOtp.update({
        where: { sessionId: req.params.sessionId },
        data: { verifiedAt: now },
      }),
      prisma.examSession.update({
        where: { id: req.params.sessionId },
        data: { otpVerifiedAt: now },
      }),
    ]);
    // Clear the per-session attempt counter on success
    await redis().del(lockKey);

    res.json({ data: { verified: true } });
  }
);

// ── DEVICE FINGERPRINT ────────────────────────────────────

// POST /api/v1/security/sessions/:id/fingerprint
// Student submits their device fingerprint; we check it against their history
router.post(
  '/sessions/:sessionId/fingerprint',
  authenticate,
  isStudent,
  async (req: Request, res: Response) => {
    const schema = z.object({
      fingerprint: z.string().min(8).max(512), // hash sent from client
      components: z
        .object({
          userAgent: z.string().optional(),
          screenRes: z.string().optional(),
          timezone: z.string().optional(),
          language: z.string().optional(),
          platform: z.string().optional(),
          colorDepth: z.number().optional(),
          hardwareConcurrency: z.number().optional(),
        })
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input' });
      return;
    }

    const session = await prisma.examSession.findUnique({
      where: { id: req.params.sessionId },
      select: { studentId: true, examId: true, deviceFingerprint: true },
    });
    if (!session || session.studentId !== req.user.sub) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { fingerprint, components } = parsed.data;
    const clientIp = getClientIp(req);

    // Look up this student's fingerprint history across all sessions
    const previousSessions = await prisma.examSession.findMany({
      where: {
        studentId: req.user.sub,
        deviceFingerprint: { not: null },
        id: { not: req.params.sessionId },
      },
      select: { deviceFingerprint: true, ipAddress: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    let alertType: string | null = null;
    let alertDetails: any = null;

    const knownFingerprints = new Set(
      previousSessions.map((s) => s.deviceFingerprint).filter(Boolean)
    );

    if (knownFingerprints.size > 0 && !knownFingerprints.has(fingerprint)) {
      // Different device from what this student has used before
      alertType = 'NEW_DEVICE';
      alertDetails = {
        currentFingerprint: fingerprint,
        knownFingerprintsCount: knownFingerprints.size,
        components,
        ip: clientIp,
      };
    }

    // Check for impossible location change (same session, different IP subnet)
    if (session.deviceFingerprint && session.deviceFingerprint !== fingerprint) {
      alertType = 'FINGERPRINT_MISMATCH';
      alertDetails = {
        sessionFingerprint: session.deviceFingerprint,
        currentFingerprint: fingerprint,
        ip: clientIp,
      };
    }

    // Store fingerprint on session
    await prisma.examSession.update({
      where: { id: req.params.sessionId },
      data: { deviceFingerprint: fingerprint, ipAddress: clientIp },
    });

    // Create alert if suspicious
    if (alertType) {
      await prisma.deviceAlert.create({
        data: { sessionId: req.params.sessionId, alertType, details: alertDetails },
      });

      // Also log as a violation so proctors see it
      await prisma.violation.create({
        data: {
          sessionId: req.params.sessionId,
          type: 'FOCUS_LOST' as any, // closest existing type — we'll treat device alerts as violations
          description: `Device alert: ${alertType} — ${JSON.stringify(alertDetails)}`,
        },
      });
    }

    res.json({ data: { recorded: true, alert: alertType } });
  }
);

// GET /api/v1/security/sessions/:id/device-alerts  (proctor view)
router.get(
  '/sessions/:sessionId/device-alerts',
  authenticate,
  isTeacher,
  async (req: Request, res: Response) => {
    const session = await prisma.examSession.findFirst({
      where: {
        id: req.params.sessionId,
        exam: tenantScope(req.user.role, req.user.schoolId),
      },
      select: { id: true },
    });
    if (!session) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const alerts = await prisma.deviceAlert.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: alerts });
  }
);

// ── IP CHECK (on-demand) ──────────────────────────────────

// GET /api/v1/security/exams/:id/ip-check
// Student portal calls this before showing exam — instant IP validation
router.get('/exams/:id/ip-check', async (req: Request, res: Response) => {
  const exam = await prisma.exam.findUnique({
    where: { id: req.params.id },
    select: { ipAllowlist: true },
  });
  if (!exam) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!exam.ipAllowlist) {
    res.json({ data: { allowed: true } });
    return;
  }

  const clientIp = getClientIp(req);
  const allowed = checkIpAllowed(clientIp, exam.ipAllowlist);

  res.json({ data: { allowed, clientIp: allowed ? undefined : clientIp } });
});

// ── EMAIL HELPERS ─────────────────────────────────────────

async function sendInviteEmail(
  email: string,
  name: string,
  examTitle: string,
  magicLink: string,
  expiresAt: Date
) {
  if (!process.env.SMTP_HOST) return; // Gracefully skip if SMTP not configured
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'exams@secureexam.app',
    to: email,
    subject: `Your access link for: ${examTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#111">Hello ${name},</h2>
        <p>You have been invited to take the exam: <strong>${examTitle}</strong></p>
        <p>Click the button below to access your exam. This link is <strong>single-use</strong> and expires on ${expiresAt.toLocaleString()}.</p>
        <a href="${magicLink}" style="display:inline-block;background:#10b981;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;margin:16px 0">
          Open My Exam →
        </a>
        <p style="color:#666;font-size:13px">Do not share this link. It is unique to you and will become invalid once used.</p>
        <p style="color:#999;font-size:12px">If you did not expect this email, please ignore it.</p>
      </div>
    `,
  });
}

async function sendOtpEmail(email: string, name: string, code: string, examTitle: string) {
  if (!process.env.SMTP_HOST) {
    // SMTP not configured. Do NOT log the OTP value: it is plaintext-equivalent
    // to a session token, would be persisted in any log aggregator the API
    // ships to, and is exactly the leak P0-6 was about. Local devs who need
    // the code can pull it from the OtpToken row in Postgres or Redis.
    if (process.env.NODE_ENV !== 'production' && process.env.OTP_DEV_LOG === '1') {
      logger.debug({ email, examTitle, code }, '[dev] OTP code (OTP_DEV_LOG=1)');
    } else {
      logger.warn({ email, examTitle }, 'SMTP not configured; OTP not delivered');
    }
    return;
  }
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'exams@secureexam.app',
    to: email,
    subject: `Your verification code — ${examTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
        <h2 style="color:#111">Hello ${name},</h2>
        <p>Your one-time verification code for <strong>${examTitle}</strong> is:</p>
        <div style="font-size:40px;font-weight:bold;font-family:monospace;letter-spacing:12px;color:#10b981;padding:24px;background:#f0fdf4;border-radius:12px;text-align:center;margin:16px 0">
          ${code}
        </div>
        <p style="color:#666;font-size:13px">This code expires in <strong>60 seconds</strong>. Do not share it.</p>
      </div>
    `,
  });
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user[0]}${'*'.repeat(Math.max(0, user.length - 2))}${user.slice(-1)}@${domain}`;
}

export default router;
