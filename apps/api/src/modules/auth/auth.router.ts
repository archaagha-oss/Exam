// apps/api/src/modules/auth/auth.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { login, refresh, logout } from './auth.service';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await login(parsed.data.email, parsed.data.password);
    res
      .cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      })
      .json({ data: { accessToken: result.accessToken, user: result.user } });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// POST /api/v1/auth/refresh
//
// Cookie-only as of cycle 1.3 / P1-7. The body fallback was a CSRF risk:
// SameSite=Strict protects the httpOnly cookie path from cross-site forgeries
// but a request body bypasses that protection entirely, letting any same-
// origin XSS lift the refresh token from JS-readable storage and post it
// back. Every customer client (student, teacher, admin, superadmin) sends
// the cookie via withCredentials; the body path was dead and dangerous.
router.post('/refresh', async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    res.status(401).json({ error: 'No refresh token' });
    return;
  }

  try {
    const result = await refresh(token);
    res
      .cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json({ data: { accessToken: result.accessToken } });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /api/v1/auth/logout — revoke the refresh-token family server-side too.
// Cookie-only path (P1-7): same rationale as /refresh.
router.post('/logout', async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  await logout(token);
  res.clearCookie('refreshToken').json({ data: { message: 'Logged out' } });
});

export default router;
