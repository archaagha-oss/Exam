// apps/api/src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Cycle 3.0a / D7: Postgres connection pool size is configurable so a
 * multi-replica production deploy doesn't blow Postgres's `max_connections`
 * cap. Resolution order:
 *
 *   1. `DATABASE_URL?connection_limit=N` — Prisma reads this natively.
 *   2. `PRISMA_CONNECTION_LIMIT` env var — appended to DATABASE_URL.
 *   3. Prisma's default (~10).
 *
 * For D7 Option 2 (5k concurrent students, multi-replica), set
 * PRISMA_CONNECTION_LIMIT to (Postgres max_connections / replica_count) so
 * the cluster can saturate its own pool without crowding out the other
 * replicas. Typical: pg max=100, 4 replicas → connection_limit=20.
 */
function buildDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return url;
  // If the URL already pins connection_limit, the user has decided.
  if (/[?&]connection_limit=/i.test(url)) return url;
  const limit = process.env.PRISMA_CONNECTION_LIMIT;
  if (!limit) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=${encodeURIComponent(limit)}`;
}

const tunedUrl = buildDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    ...(tunedUrl ? { datasources: { db: { url: tunedUrl } } } : {}),
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
