// apps/api/src/lib/jwt.ts
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@secureexam/shared-types';
import { env } from './env';

export function signAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env().JWT_SECRET, {
    expiresIn: env().JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, env().JWT_REFRESH_SECRET, {
    expiresIn: env().JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, env().JWT_SECRET) as JWTPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env().JWT_REFRESH_SECRET) as { sub: string };
}
