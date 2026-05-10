// apps/api/src/lib/auditQuery.ts
//
// Cycle 2.0f: thin compliance-query layer over AuditLog.
//
// The denormalised actorRole / actorSchoolId / targetSchoolId / impersonation
// columns added in cycle 2.0f make these queries cheap (no joins). The
// helpers here are the things SOC 2 / GDPR auditors will reach for; keeping
// them in one file means we can ship them out via a /api/v1/audit/* route
// without scattering per-question SQL.

import prisma from './prisma';

export interface ImpersonationEvent {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  targetSchoolId: string | null;
  actorId: string;
  actorRole: string | null;
  meta: unknown;
  createdAt: Date;
}

interface ImpersonationFilter {
  /**
   * If set, restrict to events that touched this school. Useful for the
   * SCHOOL_ADMIN view: "show me every PLATFORM_ADMIN action that touched my
   * school in the past 90 days."
   */
  targetSchoolId?: string;
  /**
   * Inclusive lower bound. Defaults to 90 days ago.
   */
  since?: Date;
  /**
   * Cap on rows returned. Defaults to 200.
   */
  limit?: number;
}

/**
 * Returns the cross-tenant action ledger:
 *   - every audit_logs row where impersonation = true
 *   - newest first
 *   - capped at `limit` rows
 *
 * Both PLATFORM_ADMIN and any (rare) cross-school SCHOOL_ADMIN actions land
 * here, so this is the single ledger to hand to compliance.
 */
export async function getImpersonationEvents(
  filter: ImpersonationFilter = {}
): Promise<ImpersonationEvent[]> {
  const since = filter.since ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const limit = Math.min(filter.limit ?? 200, 1000);

  const rows = await prisma.auditLog.findMany({
    where: {
      impersonation: true,
      createdAt: { gte: since },
      ...(filter.targetSchoolId ? { targetSchoolId: filter.targetSchoolId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      targetSchoolId: true,
      actorId: true,
      actorRole: true,
      meta: true,
      createdAt: true,
    },
  });

  return rows.map((r) => ({
    ...r,
    action: String(r.action),
  }));
}
