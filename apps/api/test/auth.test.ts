import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('auth', () => {
  beforeAll(() => {
    // app is imported with env already loaded
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@demo.school.edu', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  it('logs in the seeded teacher and returns an access token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@demo.school.edu', password: 'teacher123' });
    expect(res.status).toBe(200);
    expect(res.body?.data?.accessToken).toBeTypeOf('string');
    expect(res.body?.data?.user?.role).toBe('TEACHER');
  });

  it('rejects login with missing email', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ password: 'x' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
