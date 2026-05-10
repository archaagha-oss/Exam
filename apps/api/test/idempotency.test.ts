import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { idempotency } from '../src/middleware/idempotency';

/**
 * Test the idempotency middleware in isolation against a tiny app so
 * the assertion is about the middleware, not exam-flow side effects.
 */
function makeApp() {
  const app = express();
  app.use(express.json());
  let counter = 0;
  app.post('/echo', idempotency('test'), (_req, res) => {
    counter += 1;
    res.json({ data: { counter, msg: 'hi' } });
  });
  app.post('/fail', idempotency('test'), (_req, res) => {
    res.status(400).json({ error: 'boom' });
  });
  return app;
}

describe('idempotency middleware', () => {
  it('replays the cached body when the same key is reused (2xx)', async () => {
    const app = makeApp();
    const key = 'k1';
    const r1 = await request(app).post('/echo').set('Idempotency-Key', key).send({});
    expect(r1.status).toBe(200);
    expect(r1.body.data.counter).toBe(1);

    const r2 = await request(app).post('/echo').set('Idempotency-Key', key).send({});
    expect(r2.status).toBe(200);
    // Same response replayed — counter not incremented again
    expect(r2.body.data.counter).toBe(1);
  });

  it('runs the handler again with no key', async () => {
    const app = makeApp();
    const r1 = await request(app).post('/echo').send({});
    const r2 = await request(app).post('/echo').send({});
    expect(r1.body.data.counter).toBe(1);
    expect(r2.body.data.counter).toBe(2);
  });

  it('does NOT cache non-2xx responses', async () => {
    const app = makeApp();
    const key = 'k-fail';
    const r1 = await request(app).post('/fail').set('Idempotency-Key', key).send({});
    expect(r1.status).toBe(400);

    // After a failure, the handler should run again on the same key
    const r2 = await request(app).post('/fail').set('Idempotency-Key', key).send({});
    expect(r2.status).toBe(400);
  });
});
