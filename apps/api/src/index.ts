// apps/api/src/index.ts
import { loadEnv } from './lib/env';
const env = loadEnv(); // refuses to start if secrets missing/default/short

import http from 'http';
import app from './app';
import { setupWebSocket } from './websocket/server';

const server = http.createServer(app);
setupWebSocket(server);

server.listen(env.PORT, () => {
  console.log(`\n🚀 SecureExam API running on port ${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   API:         http://localhost:${env.PORT}/api/v1`);
  console.log(`   Health:      http://localhost:${env.PORT}/health\n`);
});

export default server;
