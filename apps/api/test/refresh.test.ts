import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('refresh token rotation', () => {
  it('issues a new refresh token on /refresh and the old one is revoked', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@demo.school.edu', password: 'teacher123' });
    expect(login.status).toBe(200);

    // Extract refresh token from cookie
    const setCookie = login.headers['set-cookie'];
    const cookieArr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const refresh1 = cookieArr.find((c: string) => c.startsWith('refreshToken='));
    expect(refresh1).toBeDefined();

    // First refresh works
    const r1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', refresh1!);
    expect(r1.status).toBe(200);

    // Reusing the original refresh1 should now be rejected (rotation invalidates old)
    const r2 = await request(app).post('/api/v1/auth/refresh').set('Cookie', refresh1!);
    expect(r2.status).toBe(401);
  });

  it('logout revokes the family — subsequent refresh fails', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@demo.school.edu', password: 'teacher123' });
    expect(login.status).toBe(200);
    const cookieArr = ([] as string[]).concat(login.headers['set-cookie'] || []);
    const refresh1 = cookieArr.find((c) => c.startsWith('refreshToken='))!;

    const logoutRes = await request(app).post('/api/v1/auth/logout').set('Cookie', refresh1);
    expect(logoutRes.status).toBe(200);

    const r = await request(app).post('/api/v1/auth/refresh').set('Cookie', refresh1);
    expect(r.status).toBe(401);
  });

  // Cycle 1.3 / P1-7: refresh-token CSRF posture. The body fallback was
  // removed because it bypassed SameSite=Strict on the cookie. A refresh
  // request that ONLY supplies the token in the body must now be rejected.
  it('rejects a refresh request whose token is in the body, not the cookie', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@demo.school.edu', password: 'teacher123' });
    expect(login.status).toBe(200);

    const cookieArr = ([] as string[]).concat(login.headers['set-cookie'] || []);
    const cookie = cookieArr.find((c) => c.startsWith('refreshToken='))!;
    // Pull the raw token value out of the cookie string for the body attempt.
    const rawToken = cookie.split('refreshToken=')[1].split(';')[0];

    // No Cookie header set; token only in the body.
    const r = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rawToken });
    expect(r.status).toBe(401);
  });
});
