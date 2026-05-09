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
});
