// apps/api/src/middleware/tenant.ts
//
// Tenant middleware — runs after authenticate()
// Attaches req.db = getTenantClient(req.user.schoolId)
// All downstream handlers use req.db instead of importing prisma directly.
//
// For routes that don't need tenant isolation (auth, super-admin) this
// middleware is skipped or uses the platformClient.

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { getTenantClient, platformClient } from '../lib/tenant';

// Extend Express Request to carry tenant-scoped prisma
declare global {
  namespace Express {
    interface Request {
      db: PrismaClient;
    }
  }
}

export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  const schoolId = req.user?.schoolId;
  req.db = schoolId ? getTenantClient(schoolId) : platformClient;
  next();
}

// For super-admin routes that need cross-school access
export function platformMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.db = platformClient;
  next();
}
