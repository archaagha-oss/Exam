// apps/api/src/index.ts
import { loadEnv } from './lib/env';
const env = loadEnv(); // refuses to start if secrets missing/default/short

import http from 'http';
import app from './app';
import { setupWebSocket } from './websocket/server';
import { logger } from './lib/logger';

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
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.stack }, 'uncaught exception');
  process.exit(1);
});

export default server;
