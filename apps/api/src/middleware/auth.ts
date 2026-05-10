// apps/api/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import type { JWTPayload, Role } from '@secureexam/shared-types';

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user: JWTPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!roles.includes(req.user.role as Role)) {
      res.status(403).json({ error: 'Forbidden: insufficient permissions' });
      return;
    }
    next();
  };
}

// Shorthand guards. After cycle 2.0a / D1:
//   - isTeacher passes for TEACHER + SCHOOL_ADMIN + PLATFORM_ADMIN (anyone
//     with a legitimate reason to see exam-author-or-above scoped data)
//   - isAdmin passes for SCHOOL_ADMIN + PLATFORM_ADMIN
//   - isPlatformAdmin is the strictest gate, vendor-side only.
export const isTeacher = requireRole('TEACHER', 'SCHOOL_ADMIN', 'PLATFORM_ADMIN');
export const isAdmin = requireRole('SCHOOL_ADMIN', 'PLATFORM_ADMIN');
export const isPlatformAdmin = requireRole('PLATFORM_ADMIN');
export const isStudent = requireRole('STUDENT');
