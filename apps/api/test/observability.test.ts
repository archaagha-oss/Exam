import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('observability endpoints', () => {
  it('GET /health/live returns 200', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health/ready returns 200 when DB is up', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('GET /metrics returns Prometheus exposition format', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/^# HELP /m);
    expect(res.text).toMatch(/^# TYPE /m);
    expect(res.text).toMatch(/http_request_duration_seconds/);
  });

  it('every response carries an X-Request-Id header', async () => {
    const res = await request(app).get('/health/live');
    expect(res.headers['x-request-id']).toBeTypeOf('string');
    expect(res.headers['x-request-id']!.length).toBeGreaterThan(8);
  });
});
