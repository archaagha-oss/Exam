import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Architecture invariant test (cycle 1.1a).
//
// Audit §9 found that `ARCHITECTURE.md` invariants drifted from the code
// because no test pinned them. This file fails CI when the most dangerous
// shape — `findUnique({ where: { id: req.params.<x> } })` in a router —
// reappears. That shape was the source of every P0-1, P0-2, and P0-3 IDOR.
//
// What this catches:
//   prisma.exam.findUnique({ where: { id: req.params.id } })
//   prisma.foo.findUnique({ where: { id: req.params.fooId } })
//
// What this allows:
//   prisma.user.findUnique({ where: { id: req.user.sub } })   // own data
//   prisma.foo.findUnique({ where: { compositeUnique: ... } }) // not by id
//   prisma.foo.findFirst({ where: { id: req.params.id, ...tenantScope(...) } })
//
// If a legitimate findUnique-by-URL-id appears (rare; almost always wrong),
// add an explicit tenant check on the immediately preceding lines and add
// the file to the allowlist below with a comment explaining why.

const MODULES_ROOT = join(__dirname, '..', 'src', 'modules');

// Files exempt from the findUnique-by-URL-id ban. Every entry needs a written
// reason. Adding to this list should be a reviewable change, not a reflex.
const ALLOWLIST: string[] = [
  // PLATFORM_ADMIN portal is cross-tenant by design — it manages every school
  // on the platform. After cycle 2.0a / D1, this is the vendor-side
  // PLATFORM_ADMIN role; the cross-tenant findUnique pattern in this single
  // file is the intended behaviour.
  join(MODULES_ROOT, 'superadmin', 'superadmin.router.ts'),
];

function walkRouters(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkRouters(full));
    } else if (entry.endsWith('.router.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('Architecture invariant — tenant-scoped queries', () => {
  it('no router uses findUnique with an id taken from req.params', () => {
    const files = walkRouters(MODULES_ROOT);
    expect(files.length, 'expected router files to exist').toBeGreaterThan(0);

    const dangerous = /findUnique\s*\(\s*\{\s*where\s*:\s*\{\s*id\s*:\s*req\.params/;
    const offenders: string[] = [];

    for (const file of files) {
      if (ALLOWLIST.includes(file)) continue;
      const src = readFileSync(file, 'utf8');
      if (dangerous.test(src)) {
        offenders.push(file);
      }
    }

    expect(
      offenders,
      `findUnique-by-URL-id is forbidden in routers (cycle 1.1a). Use findFirst with ` +
        `the tenantScope helper or canManageExam/canProctorExam. Offenders:\n  ` +
        offenders.join('\n  ')
    ).toEqual([]);
  });
});
