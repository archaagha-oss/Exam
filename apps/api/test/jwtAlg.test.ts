import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../src/lib/jwt';

// Cycle 1.1a / P1-1: JWT algorithm pinning.
//
// Without `algorithms: ['HS256']` on `jwt.verify`, the library accepts whichever
// algorithm the token's header claims. Two attack shapes that this test guards
// against:
//   1. `alg: none` — an unsigned token is accepted as valid.
//   2. `alg: HS512` (or any other) — accepted as long as the secret is the
//      same; this is real because some libraries previously verified across
//      algorithms when the secret was symmetric.
//
// Both should be rejected after the pin.

describe('JWT algorithm pinning', () => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret-32-chars-minimum-xxxxxxxx';

  it('rejects a token signed with alg: none', () => {
    // Hand-craft an unsigned JWT (header.payload.<empty signature>)
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'attacker', role: 'SUPER_ADMIN' })
    ).toString('base64url');
    const token = `${header}.${payload}.`;

    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('rejects a token signed with HS512 even with the right secret', () => {
    const token = jwt.sign({ sub: 'attacker', role: 'SUPER_ADMIN' }, secret, {
      algorithm: 'HS512',
    });
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('accepts a token signed with HS256', () => {
    const token = jwt.sign(
      { sub: 'legit', role: 'TEACHER', schoolId: 'school-a' },
      secret,
      { algorithm: 'HS256', expiresIn: '5m' }
    );
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe('legit');
    expect(decoded.role).toBe('TEACHER');
  });
});
