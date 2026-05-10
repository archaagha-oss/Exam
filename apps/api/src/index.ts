// apps/api/src/index.ts
import { loadEnv } from './lib/env';
const env = loadEnv(); // refuses to start if secrets missing/default/short

import http from 'http';
import app from './app';
import { setupWebSocket } from './websocket/server';
import { logger } from './lib/logger';
import { initSentry, captureError } from './lib/sentry';

// Sentry init (cycle 1.4 / P1-10). No-op without SENTRY_DSN. Must happen
// before any potentially-throwing code so error handlers see the SDK ready.
initSentry().catch((err) => logger.warn({ err }, '[sentry] init promise rejected'));

const server = http.createServer(app);
setupWebSocket(server);

server.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      api: `http://localhost:${env.PORT}/api/v1`,
      health: `http://localhost:${env.PORT}/health/ready`,
      metrics: `http://localhost:${env.PORT}/metrics`,
    },
    'SecureExam API ready'
  );
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled promise rejection');
  captureError(reason, { source: 'unhandledRejection' });
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.stack }, 'uncaught exception');
  captureError(err, { source: 'uncaughtException' });
  process.exit(1);
});

export default server;
