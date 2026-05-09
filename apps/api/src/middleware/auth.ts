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

// Shorthand guards
export const isTeacher = requireRole('TEACHER', 'ADMIN', 'SUPER_ADMIN');
export const isAdmin = requireRole('ADMIN', 'SUPER_ADMIN');
export const isSuperAdmin = requireRole('SUPER_ADMIN');
export const isStudent = requireRole('STUDENT');
