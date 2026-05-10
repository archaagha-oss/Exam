// apps/api/src/lib/jwt.ts
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@secureexam/shared-types';
import { env } from './env';

// Algorithm pinning: every sign/verify uses HS256 explicitly. Without an
// `algorithms` array on verify, the default accepts whichever algorithm the
// token claims in its header — which opens the door to algorithm-confusion
// attacks (e.g. a forged token with `alg: none` or `alg: RS256` against an
// HMAC secret). Pin both directions.
const JWT_ALG: jwt.Algorithm = 'HS256';

export function signAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env().JWT_SECRET, {
    expiresIn: env().JWT_EXPIRES_IN,
    algorithm: JWT_ALG,
  } as jwt.SignOptions);
}

export function signRefreshToken(userId: string, familyId?: string): string {
  return jwt.sign(
    { sub: userId, ...(familyId ? { fid: familyId } : {}) },
    env().JWT_REFRESH_SECRET,
    { expiresIn: env().JWT_REFRESH_EXPIRES_IN, algorithm: JWT_ALG } as jwt.SignOptions
  );
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, env().JWT_SECRET, { algorithms: [JWT_ALG] }) as JWTPayload;
}

export function verifyRefreshToken(token: string): { sub: string; fid?: string } {
  return jwt.verify(token, env().JWT_REFRESH_SECRET, {
    algorithms: [JWT_ALG],
  }) as { sub: string; fid?: string };
}
