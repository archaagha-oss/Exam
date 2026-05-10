/**
 * Environment validation. The API refuses to boot with missing, default, or
 * insufficiently long secrets so that "we shipped dev config to prod" can't
 * silently happen.
 */
import 'dotenv/config';

const KNOWN_DEFAULT_SECRETS = new Set([
  'dev-access-secret-change-in-production',
  'dev-refresh-secret-change-in-production',
  'replace-with-random-256-bit-hex',
  'replace-with-different-random-256-bit-hex',
  'change-this-to-a-long-random-string',
  'another-long-random-string',
  'changeme',
  'secret',
  'jwt-secret',
]);

const MIN_SECRET_LENGTH = 32;

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`[env] ${msg}`);
  process.exit(1);
}

function requireSecret(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') fail(`${name} is not set. Refusing to start.`);
  if (KNOWN_DEFAULT_SECRETS.has(v.trim()))
    fail(`${name} is a known default value. Refusing to start.`);
  if (v.length < MIN_SECRET_LENGTH)
    fail(`${name} must be at least ${MIN_SECRET_LENGTH} chars. Refusing to start.`);
  return v;
}

function requireUrl(name: string): string {
  const v = process.env[name];
  if (!v) fail(`${name} is not set. Refusing to start.`);
  return v;
}

export interface AppEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL?: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  CORS_ORIGINS: string[];
}

let cached: AppEnv | null = null;

export function loadEnv(): AppEnv {
  if (cached) return cached;
  cached = {
    NODE_ENV: (process.env.NODE_ENV as AppEnv['NODE_ENV']) || 'development',
    PORT: Number(process.env.PORT) || 4000,
    DATABASE_URL: requireUrl('DATABASE_URL'),
    REDIS_URL: process.env.REDIS_URL,
    JWT_SECRET: requireSecret('JWT_SECRET'),
    JWT_REFRESH_SECRET: requireSecret('JWT_REFRESH_SECRET'),
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
  return cached;
}

export const env = (): AppEnv => loadEnv();
