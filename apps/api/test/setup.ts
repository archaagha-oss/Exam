import 'dotenv/config';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-32-chars-minimum-xxxxxxxx';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-32-chars-minimum-xxxxxxxx';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://secureexam:changeme@localhost:5432/secureexam';
