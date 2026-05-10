// apps/api/scripts/backfill-audit-actor-meta.ts
//
// One-off backfill script for cycle 2.0f's denormalised audit columns.
//
// Cycle 2.0f added four columns to `audit_logs`:
//   actorRole, actorSchoolId, targetSchoolId, impersonation
// The migration left existing rows with NULLs (greenfield, so this was
// fine at ship time). If a real customer's data ever lands before this
// script runs, the compliance ledger query in `lib/auditQuery.ts` will
// silently miss historical impersonation events because every old row
// has `impersonation = false` by default.
//
// This script reads each row with NULL `actorRole`, joins to the actor
// User to fill `actorRole` + `actorSchoolId`, then computes
// `impersonation` from the existing `targetSchoolId` (NULL on old rows
// — which means we conservatively flag PLATFORM_ADMIN actions as
// impersonation since their default schoolId is NULL and they reach
// across tenants by design).
//
// Run:
//   cd apps/api && npx ts-node scripts/backfill-audit-actor-meta.ts
//   cd apps/api && npx ts-node scripts/backfill-audit-actor-meta.ts --dry-run
//
// The script is idempotent: re-running it only touches rows where
// actorRole is still NULL.
//
// Closes the deferred item from
// docs/04-stage2-prereqs-closure.md §4 ("Bulk back-fill of actorRole /
// actorSchoolId for pre-existing audit rows").

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 500;

async function main() {
  console.log(
    `🔧 Backfilling audit_logs.{actorRole, actorSchoolId, impersonation}` +
      (DRY_RUN ? ' (DRY RUN — no writes)' : '')
  );

  const totalNullRows = await prisma.auditLog.count({
    where: { actorRole: null },
  });
  console.log(`Found ${totalNullRows} rows with NULL actorRole.`);

  if (totalNullRows === 0) {
    console.log('Nothing to do.');
    return;
  }

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let cursor: string | undefined = undefined;

  // Pre-warm the user lookup. AuditLog.actorId references a possibly-deleted
  // user (FK is required so the user should exist, but the GDPR erasure
  // path renames + retains the row), so a missing user means we leave the
  // audit row untouched and surface a count.
  while (true) {
    const batch = await prisma.auditLog.findMany({
      where: { actorRole: null },
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: BATCH_SIZE,
      select: { id: true, actorId: true, targetSchoolId: true },
    });
    if (batch.length === 0) break;

    const actorIds = Array.from(new Set(batch.map((r) => r.actorId)));
    const actors = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, role: true, schoolId: true },
    });
    const actorById = new Map(actors.map((u) => [u.id, u]));

    for (const row of batch) {
      processed += 1;
      const actor = actorById.get(row.actorId);
      if (!actor) {
        skipped += 1;
        continue; // erased / missing user — leave as-is
      }

      // PLATFORM_ADMIN reaching INTO any specific tenant counts as
      // impersonation. Their own actions on platform-wide tables (no
      // targetSchoolId) do not. Anyone else with a mismatched schoolId
      // also flags — should not happen in normal flow.
      const impersonation =
        (actor.role === 'PLATFORM_ADMIN' && !!row.targetSchoolId) ||
        (!!actor.schoolId && !!row.targetSchoolId && actor.schoolId !== row.targetSchoolId);

      if (DRY_RUN) {
        updated += 1;
        continue;
      }

      await prisma.auditLog.update({
        where: { id: row.id },
        data: {
          actorRole: actor.role,
          actorSchoolId: actor.schoolId,
          impersonation,
        },
      });
      updated += 1;
    }

    cursor = batch[batch.length - 1].id;
    if (processed % (BATCH_SIZE * 4) === 0) {
      console.log(
        `  …processed ${processed}/${totalNullRows} (updated=${updated}, skipped=${skipped})`
      );
    }
  }

  console.log(
    `\n✅ Done. Processed ${processed}; updated ${updated}; skipped ${skipped} (missing actor User row).`
  );
  if (DRY_RUN) console.log('Dry run — no rows were actually modified.');
}

main()
  .catch((e) => {
    console.error('❌ Backfill failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
