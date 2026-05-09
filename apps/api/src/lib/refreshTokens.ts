/**
 * Refresh-token rotation + revocation backed by Redis.
 *
 * Each refresh token carries a "family id" (fid). On every refresh:
 *   1. The fid is checked against Redis.
 *   2. If found, it's revoked (deleted) immediately.
 *   3. A brand-new fid is issued and stored.
 *   4. The new refresh token returns to the client.
 *
 * Replay attack: presenting an already-rotated token fails step 1 → 401.
 * Logout: revoke() deletes the family.
 */
import crypto from 'crypto';
import { redis } from './redis';

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function familyKey(userId: string, familyId: string) {
  return `rt:family:${userId}:${familyId}`;
}

/** Issue a new family for the given user. Returns its id. */
export async function issueFamily(userId: string): Promise<string> {
  const familyId = crypto.randomUUID();
  await redis().set(familyKey(userId, familyId), '1', 'EX', REFRESH_TTL_SECONDS);
  return familyId;
}

/**
 * Rotate: validate the old family id, revoke it, issue a fresh one.
 * Returns the new family id, or null if the old one is invalid/revoked.
 */
export async function rotate(userId: string, oldFamilyId: string): Promise<string | null> {
  const exists = await redis().get(familyKey(userId, oldFamilyId));
  if (!exists) return null;
  await redis().del(familyKey(userId, oldFamilyId));
  return issueFamily(userId);
}

export async function revoke(userId: string, familyId: string): Promise<void> {
  await redis().del(familyKey(userId, familyId));
}
