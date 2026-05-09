import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const ROOT = path.resolve(__dirname, '..');
const ENV_TS = path.join(ROOT, 'src/lib/env.ts');

function run(env: Record<string, string | undefined>) {
  return spawnSync(
    'node',
    [
      '-e',
      `require('ts-node/register/transpile-only'); require('${path.join(ROOT, 'src/lib/env')}').loadEnv();`,
    ],
    {
      env: { ...process.env, ...env },
      cwd: ROOT,
      encoding: 'utf8',
    }
  );
}

describe.skipIf(!fs.existsSync(ENV_TS))('env boot validation', () => {
  it('refuses to start when JWT_SECRET is unset', () => {
    const out = run({
      JWT_SECRET: '',
      JWT_REFRESH_SECRET: 'test-refresh-secret-32-chars-minimum-xxxxxx',
    });
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/JWT_SECRET/i);
  });

  it('refuses to start when JWT_SECRET equals a known default', () => {
    const out = run({
      JWT_SECRET: 'dev-access-secret-change-in-production',
      JWT_REFRESH_SECRET: 'test-refresh-secret-32-chars-minimum-xxxxxx',
    });
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/JWT_SECRET/i);
  });

  it('refuses to start when JWT_SECRET is shorter than 32 chars', () => {
    const out = run({
      JWT_SECRET: 'short',
      JWT_REFRESH_SECRET: 'test-refresh-secret-32-chars-minimum-xxxxxx',
    });
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/JWT_SECRET/i);
  });
});
