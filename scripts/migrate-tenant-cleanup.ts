#!/usr/bin/env node
// scripts/migrate-tenant-cleanup.ts
//
// After a school has been successfully migrated to its own schema and running
// stably for at least a week, this script removes the school's rows from
// the shared public schema (completing the migration and reclaiming space).
//
// Usage:
//   npx ts-node scripts/migrate-tenant-cleanup.ts --schoolId <uuid> [--yes]
//
// SAFETY: This script refuses to run unless the school is already listed
// in MIGRATED_SCHOOL_IDS (confirming the API is routing to the new schema).

import { Client } from 'pg';
import * as readline from 'readline';

const args = process.argv.slice(2);
const schoolIdArg = args.find((_, i) => args[i - 1] === '--schoolId');
const forceYes = args.includes('--yes');

if (!schoolIdArg) {
  console.error('Usage: npx ts-node scripts/migrate-tenant-cleanup.ts --schoolId <uuid> [--yes]');
  process.exit(1);
}

const SCHOOL_ID = schoolIdArg;
const MIGRATED = new Set((process.env.MIGRATED_SCHOOL_IDS ?? '').split(',').filter(Boolean));

// Ordered for safe deletion (children before parents)
const DELETE_ORDER = [
  { table: 'audit_logs',         filter: `"actorId" IN (SELECT id FROM public.users WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'student_access_arrangements', filter: `"studentId" IN (SELECT id FROM public.users WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exam_certificates',  filter: `"sessionId" IN (SELECT id FROM public.exam_sessions WHERE "examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}'))` },
  { table: 'session_feedback',   filter: `"sessionId" IN (SELECT id FROM public.exam_sessions WHERE "examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}'))` },
  { table: 'rest_break_logs',    filter: `"sessionId" IN (SELECT id FROM public.exam_sessions WHERE "examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}'))` },
  { table: 'violations',         filter: `"sessionId" IN (SELECT id FROM public.exam_sessions WHERE "examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}'))` },
  { table: 'student_answers',    filter: `"sessionId" IN (SELECT id FROM public.exam_sessions WHERE "examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}'))` },
  { table: 'exam_sessions',      filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exam_pins',          filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exam_proctors',      filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exam_assignments',   filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exam_pools',         filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exam_sections',      filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exam_items',         filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exams',              filter: `"schoolId" = '${SCHOOL_ID}'` },
  { table: 'questions',          filter: `"schoolId" = '${SCHOOL_ID}'` },
  { table: 'class_students',     filter: `"classId" IN (SELECT id FROM public.classes WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'class_teachers',     filter: `"classId" IN (SELECT id FROM public.classes WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'classes',            filter: `"schoolId" = '${SCHOOL_ID}'` },
  { table: 'users',              filter: `"schoolId" = '${SCHOOL_ID}'` },
  { table: 'schools',            filter: `"id" = '${SCHOOL_ID}'` },
];

async function confirm(q: string): Promise<boolean> {
  if (forceYes) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${q} [y/N] `, ans => { rl.close(); resolve(ans.toLowerCase() === 'y'); });
  });
}

async function run() {
  // Safety gate: refuse unless school is listed as migrated
  if (!MIGRATED.has(SCHOOL_ID)) {
    console.error(`\n❌  Safety gate: School ${SCHOOL_ID} is NOT in MIGRATED_SCHOOL_IDS.`);
    console.error(`    This script refuses to delete data for a school that hasn't been migrated.`);
    console.error(`    Add the schoolId to MIGRATED_SCHOOL_IDS in .env first.\n`);
    process.exit(1);
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  try {
    const schoolRes = await db.query(`SELECT name FROM public.schools WHERE id = $1`, [SCHOOL_ID]);
    if (schoolRes.rows.length === 0) {
      console.log('School rows already removed from public schema.');
      await db.end(); return;
    }
    const schoolName = schoolRes.rows[0].name;

    console.log(`\n🗑   Cleanup: removing "${schoolName}" from public schema`);
    console.log(`    School ID: ${SCHOOL_ID}`);
    console.log(`    ⚠  This is IRREVERSIBLE. The schema copy is the only remaining data.\n`);

    // Count rows to delete
    let totalRows = 0;
    for (const { table, filter } of DELETE_ORDER) {
      const res = await db.query(`SELECT COUNT(*) FROM public."${table}" WHERE ${filter}`);
      totalRows += parseInt(res.rows[0].count);
    }
    console.log(`    Rows to delete: ${totalRows}\n`);

    const ok = await confirm(`Confirm permanent deletion of ${totalRows} rows for "${schoolName}"?`);
    if (!ok) { console.log('Aborted.'); await db.end(); return; }

    await db.query('BEGIN');

    for (const { table, filter } of DELETE_ORDER) {
      const res = await db.query(`DELETE FROM public."${table}" WHERE ${filter}`);
      if ((res as any).rowCount > 0) {
        console.log(`    ✓ Deleted ${(res as any).rowCount} rows from ${table}`);
      }
    }

    await db.query('COMMIT');
    console.log(`\n✅  Cleanup complete. "${schoolName}" data removed from public schema.`);

  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('\n❌  Cleanup failed:', err);
    process.exit(1);
  } finally {
    await db.end();
  }
}

run();
