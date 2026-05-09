// apps/api/src/lib/tenant.ts
//
// Schema-per-tenant Prisma client pool.
//
// Architecture:
//   PostgreSQL has one "public" schema used during the transition period.
//   Each school is migrated to its own schema: school_<id>
//   The tenant middleware calls getTenantClient(schoolId) which returns a
//   PrismaClient scoped to that school's schema via search_path.
//
//   For backwards compatibility:
//   - Schools not yet migrated continue using the shared "public" schema
//   - Migrated schools use their own schema
//   - The super-admin uses a special "platform" client across all schemas

import { PrismaClient } from '@prisma/client';

// Cache: schoolId → PrismaClient
const clientCache = new Map<string, PrismaClient>();

// Schools that have been migrated to their own schema
// In production this comes from an env var or a platform DB table
const MIGRATED_SCHOOLS = new Set<string>(
  (process.env.MIGRATED_SCHOOL_IDS ?? '').split(',').filter(Boolean)
);

function getSchemaName(schoolId: string): string {
  return `school_${schoolId.replace(/-/g, '_')}`;
}

export function getTenantClient(schoolId: string): PrismaClient {
  if (clientCache.has(schoolId)) return clientCache.get(schoolId)!;

  const schema = MIGRATED_SCHOOLS.has(schoolId)
    ? getSchemaName(schoolId)
    : 'public';

  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

  // Set search_path on every connection via middleware
  // $use is deprecated in Prisma 5 — we use $extends for Prisma 5+
  // For Prisma 4 compatibility we use $use:
  (client as any).$use(async (params: any, next: any) => {
    if (schema !== 'public') {
      await client.$executeRawUnsafe(`SET search_path TO "${schema}", public`);
    }
    return next(params);
  });

  clientCache.set(schoolId, client);
  return client;
}

// Shared platform client — used by super-admin and auth (before tenant is known)
export const platformClient = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
});

// Graceful shutdown — close all cached clients
export async function disconnectAll(): Promise<void> {
  const disconnects = [...clientCache.values()].map(c => c.$disconnect());
  disconnects.push(platformClient.$disconnect());
  await Promise.all(disconnects);
}

// Mark a school as migrated (called by the migration script)
export function markSchoolMigrated(schoolId: string): void {
  MIGRATED_SCHOOLS.add(schoolId);
  // Invalidate cached client so next request gets schema-aware one
  const old = clientCache.get(schoolId);
  if (old) {
    old.$disconnect().catch(() => {});
    clientCache.delete(schoolId);
  }
}

export { getSchemaName };
