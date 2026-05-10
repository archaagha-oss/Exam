// apps/api/src/lib/featureFlags.ts
//
// Cycle 2.0e / D4: per-school feature flag helper.
//
// Two responsibilities:
//   1. Answer "is feature X enabled for school Y?" with a Redis cache so
//      hot-path requests don't add a DB roundtrip per call.
//   2. Wrap toggle + audit-log together so every flip is traceable.
//
// Deliberately small surface — most callers just need schoolFeatureEnabled().
// The toggle path is used by the SCHOOL_ADMIN console and (for support
// impersonation) the PLATFORM_ADMIN console.

import prisma from './prisma';
import { redis } from './redis';

const CACHE_TTL_SECONDS = 60; // 1 minute is plenty — flips are rare; staleness on toggle is acceptable

function cacheKey(schoolId: string, featureKey: string): string {
  return `feature:${schoolId}:${featureKey}`;
}

/**
 * Returns true if the given feature is enabled for the given school.
 *
 *   const aiOn = await schoolFeatureEnabled(req.user.schoolId!, 'ai-authoring');
 *   if (!aiOn) { res.status(403).json({ error: 'AI authoring is not enabled for your school' }); return; }
 *
 * Resolution order:
 *   1. Redis cache (1-min TTL)
 *   2. school_features row for (schoolId, featureKey)
 *   3. features.defaultEnabled if no school-specific row exists
 *   4. false if the feature key is unknown
 *
 * Errors: never throws. A degraded Redis or Postgres returns false (closed
 * by default), which is the safer fail-closed posture for AI / proctoring
 * gates. Callers don't need a try/catch.
 */
export async function schoolFeatureEnabled(
  schoolId: string | null | undefined,
  featureKey: string
): Promise<boolean> {
  if (!schoolId) return false;

  // Cache lookup
  try {
    const cached = await redis().get(cacheKey(schoolId, featureKey));
    if (cached === '1') return true;
    if (cached === '0') return false;
  } catch {
    // Redis miss/down — fall through to DB
  }

  let enabled = false;
  try {
    const row = await prisma.schoolFeature.findUnique({
      where: { schoolId_featureKey: { schoolId, featureKey } },
      select: { enabled: true },
    });
    if (row) {
      enabled = row.enabled;
    } else {
      const feature = await prisma.feature.findUnique({
        where: { key: featureKey },
        select: { defaultEnabled: true },
      });
      enabled = feature?.defaultEnabled ?? false;
    }
  } catch {
    // DB error — fail closed.
    return false;
  }

  // Best-effort cache write; ignore failure.
  try {
    await redis().set(cacheKey(schoolId, featureKey), enabled ? '1' : '0', 'EX', CACHE_TTL_SECONDS);
  } catch {
    /* noop */
  }

  return enabled;
}

/**
 * Toggle a feature for a school. Idempotent — calling with `enabled=true`
 * on an already-enabled flag updates the audit timestamps but doesn't error.
 *
 * The actorUserId is required and lands in school_features.enabledById so
 * we can answer "who turned this on?" from the audit trail.
 */
export async function setSchoolFeature(
  schoolId: string,
  featureKey: string,
  enabled: boolean,
  actorUserId: string
): Promise<void> {
  // Validate the feature exists in the catalogue. Otherwise a typo silently
  // creates an orphan row that nothing else queries.
  const feature = await prisma.feature.findUnique({
    where: { key: featureKey },
    select: { key: true },
  });
  if (!feature) {
    throw Object.assign(new Error(`Unknown feature: ${featureKey}`), { status: 400 });
  }

  const now = new Date();
  await prisma.schoolFeature.upsert({
    where: { schoolId_featureKey: { schoolId, featureKey } },
    create: {
      schoolId,
      featureKey,
      enabled,
      enabledAt: enabled ? now : null,
      enabledById: enabled ? actorUserId : null,
      disabledAt: enabled ? null : now,
    },
    update: {
      enabled,
      enabledAt: enabled ? now : undefined,
      enabledById: enabled ? actorUserId : undefined,
      disabledAt: enabled ? null : now,
    },
  });

  // Invalidate cache. A small race is fine — TTL is 60s.
  try {
    await redis().del(cacheKey(schoolId, featureKey));
  } catch {
    /* noop */
  }
}
