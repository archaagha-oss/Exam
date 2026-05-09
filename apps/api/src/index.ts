// apps/api/src/index.ts
import 'dotenv/config';
import http from 'http';
import app from './app';
import { setupWebSocket } from './websocket/server';

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);
setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`\n🚀 SecureExam API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   API:         http://localhost:${PORT}/api/v1`);
  console.log(`   Health:      http://localhost:${PORT}/health\n`);
});

export default server;
