#!/usr/bin/env node
// scripts/migrate-tenant.ts
//
// Migrates one school from the shared "public" schema to its own
// PostgreSQL schema (schema-per-tenant).
//
// Usage:
//   npx ts-node scripts/migrate-tenant.ts --schoolId <uuid> [--dry-run]
//
// What it does:
//   1. Creates schema school_<schoolId>
//   2. Copies all tables from public to the new schema (school's data only)
//   3. Runs a verification query to confirm row counts match
//   4. Updates MIGRATED_SCHOOL_IDS env var hint
//   5. Leaves public schema data intact (rollback-safe)
//
// To complete the migration:
//   - Add the schoolId to MIGRATED_SCHOOL_IDS in your .env
//   - Restart the API (new requests will use the new schema)
//   - After 1 week of stable operation, delete the school's rows from public

import { Client } from 'pg';
import * as readline from 'readline';

const args = process.argv.slice(2);
const schoolIdArg = args.find((_, i) => args[i - 1] === '--schoolId');
const dryRun = args.includes('--dry-run');
const forceYes = args.includes('--yes');

if (!schoolIdArg) {
  console.error('Usage: npx ts-node scripts/migrate-tenant.ts --schoolId <uuid> [--dry-run] [--yes]');
  process.exit(1);
}

const SCHOOL_ID = schoolIdArg;
const SCHEMA_NAME = `school_${SCHOOL_ID.replace(/-/g, '_')}`;

// Tables that belong to a school (ordered by FK dependency)
const SCHOOL_TABLES = [
  // Core
  { table: 'schools',    schoolCol: 'id',       filter: `"id" = '${SCHOOL_ID}'` },
  { table: 'users',      schoolCol: 'schoolId', filter: `"schoolId" = '${SCHOOL_ID}'` },
  { table: 'classes',    schoolCol: 'schoolId', filter: `"schoolId" = '${SCHOOL_ID}'` },
  { table: 'class_students',   schoolCol: null, filter: `"classId" IN (SELECT id FROM public.classes WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'class_teachers',   schoolCol: null, filter: `"classId" IN (SELECT id FROM public.classes WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'questions',  schoolCol: 'schoolId', filter: `"schoolId" = '${SCHOOL_ID}'` },
  { table: 'exams',      schoolCol: 'schoolId', filter: `"schoolId" = '${SCHOOL_ID}'` },
  { table: 'exam_items',       schoolCol: null, filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exam_sections',    schoolCol: null, filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exam_pools',       schoolCol: null, filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exam_assignments', schoolCol: null, filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exam_proctors',    schoolCol: null, filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exam_pins',        schoolCol: null, filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'exam_sessions',    schoolCol: null, filter: `"examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'student_answers',  schoolCol: null, filter: `"sessionId" IN (SELECT id FROM public.exam_sessions WHERE "examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}'))` },
  { table: 'violations',       schoolCol: null, filter: `"sessionId" IN (SELECT id FROM public.exam_sessions WHERE "examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}'))` },
  { table: 'rest_break_logs',  schoolCol: null, filter: `"sessionId" IN (SELECT id FROM public.exam_sessions WHERE "examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}'))` },
  { table: 'session_feedback', schoolCol: null, filter: `"sessionId" IN (SELECT id FROM public.exam_sessions WHERE "examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}'))` },
  { table: 'exam_certificates',schoolCol: null, filter: `"sessionId" IN (SELECT id FROM public.exam_sessions WHERE "examId" IN (SELECT id FROM public.exams WHERE "schoolId" = '${SCHOOL_ID}'))` },
  { table: 'student_access_arrangements', schoolCol: null, filter: `"studentId" IN (SELECT id FROM public.users WHERE "schoolId" = '${SCHOOL_ID}')` },
  { table: 'audit_logs',       schoolCol: null, filter: `"actorId" IN (SELECT id FROM public.users WHERE "schoolId" = '${SCHOOL_ID}')` },
];

// Global tables shared across tenants (stay in public)
// - _prisma_migrations: shared
// - refresh_tokens: can stay shared or be moved
// These are intentionally left in public schema

async function confirm(question: string): Promise<boolean> {
  if (forceYes) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${question} [y/N] `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function run() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  console.log(`\n🏫  Tenant migration: school ${SCHOOL_ID}`);
  console.log(`    Target schema:     ${SCHEMA_NAME}`);
  console.log(`    Dry run:           ${dryRun ? 'YES — no changes will be made' : 'NO — real migration'}\n`);

  try {
    // 1. Check school exists
    const schoolRes = await db.query(`SELECT id, name FROM public.schools WHERE id = $1`, [SCHOOL_ID]);
    if (schoolRes.rows.length === 0) {
      console.error(`❌  School ${SCHOOL_ID} not found in public schema.`);
      process.exit(1);
    }
    const school = schoolRes.rows[0];
    console.log(`✓   School found: "${school.name}"`);

    // 2. Count rows to migrate
    console.log('\n📊  Row counts to migrate:');
    const counts: Record<string, number> = {};
    for (const { table, filter } of SCHOOL_TABLES) {
      const res = await db.query(`SELECT COUNT(*) FROM public."${table}" WHERE ${filter}`);
      counts[table] = parseInt(res.rows[0].count);
      if (counts[table] > 0) console.log(`    ${table.padEnd(30)} ${counts[table].toString().padStart(6)} rows`);
    }

    const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`\n    Total: ${totalRows} rows\n`);

    if (dryRun) {
      console.log('🏁  Dry run complete. No changes made.');
      console.log(`    Re-run without --dry-run to perform the migration.`);
      await db.end();
      return;
    }

    // Confirm before proceeding
    const ok = await confirm(`Proceed with migration of "${school.name}" to schema ${SCHEMA_NAME}?`);
    if (!ok) { console.log('Aborted.'); await db.end(); return; }

    // 3. Begin transaction
    console.log('\n🔄  Starting migration...');
    await db.query('BEGIN');

    // 4. Create schema
    console.log(`    Creating schema ${SCHEMA_NAME}...`);
    await db.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA_NAME}"`);

    // 5. Get DDL for all tables and recreate in new schema
    console.log('    Creating tables in new schema...');

    // Get all table definitions from information_schema
    const tablesRes = await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name = ANY($1)
    `, [SCHOOL_TABLES.map(t => t.table)]);

    // For each table: create it in the new schema using CREATE TABLE ... LIKE
    for (const { table } of SCHOOL_TABLES) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS "${SCHEMA_NAME}"."${table}"
        (LIKE public."${table}" INCLUDING ALL)
      `);
    }

    // 6. Copy data
    console.log('    Copying data...');
    for (const { table, filter } of SCHOOL_TABLES) {
      if (counts[table] === 0) continue;
      await db.query(`
        INSERT INTO "${SCHEMA_NAME}"."${table}"
        SELECT * FROM public."${table}" WHERE ${filter}
        ON CONFLICT DO NOTHING
      `);
      process.stdout.write(`    ✓ ${table}: ${counts[table]} rows\n`);
    }

    // 7. Verify counts
    console.log('\n🔍  Verifying row counts...');
    let allMatch = true;
    for (const { table, filter } of SCHOOL_TABLES) {
      if (counts[table] === 0) continue;
      const res = await db.query(`SELECT COUNT(*) FROM "${SCHEMA_NAME}"."${table}"`);
      const newCount = parseInt(res.rows[0].count);
      const match = newCount === counts[table];
      if (!match) {
        console.error(`    ❌ ${table}: expected ${counts[table]}, got ${newCount}`);
        allMatch = false;
      }
    }

    if (!allMatch) {
      await db.query('ROLLBACK');
      console.error('\n❌  Verification failed. Migration rolled back.');
      process.exit(1);
    }

    // 8. Commit
    await db.query('COMMIT');
    console.log('\n✅  Migration complete!\n');

    // 9. Instructions
    console.log('📋  Next steps:');
    console.log(`    1. Add this school ID to MIGRATED_SCHOOL_IDS in your .env:`);
    console.log(`       MIGRATED_SCHOOL_IDS=${SCHOOL_ID}`);
    console.log(`       (comma-separate if adding multiple)`);
    console.log(`    2. Restart the API: npm run dev  (or restart your process manager)`);
    console.log(`    3. Verify the school's admin can log in and access their data`);
    console.log(`    4. After 1 week of stable operation, remove this school's rows from public:`);
    console.log(`       npm run migrate:cleanup -- --schoolId ${SCHOOL_ID}`);
    console.log('');
    console.log(`    Schema name: ${SCHEMA_NAME}`);
    console.log(`    Connection:  SET search_path TO "${SCHEMA_NAME}", public;`);

  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('\n❌  Migration failed:', err);
    process.exit(1);
  } finally {
    await db.end();
  }
}

run();
