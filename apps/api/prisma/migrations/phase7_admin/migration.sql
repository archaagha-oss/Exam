-- apps/api/prisma/migrations/phase7_admin/migration.sql
-- Professional Admin Dashboard
-- Safe to run on existing Phase 6 database (all IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

-- School branding & policy
ALTER TABLE "schools"
  ADD COLUMN IF NOT EXISTS "logoUrl"               TEXT,
  ADD COLUMN IF NOT EXISTS "primaryColour"         TEXT    NOT NULL DEFAULT '#10b981',
  ADD COLUMN IF NOT EXISTS "address"               TEXT,
  ADD COLUMN IF NOT EXISTS "contactEmail"          TEXT,
  ADD COLUMN IF NOT EXISTS "website"               TEXT,
  ADD COLUMN IF NOT EXISTS "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "defaultMaxViolations"   INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "defaultPassingScore"    INTEGER,
  ADD COLUMN IF NOT EXISTS "defaultShowResults"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allowEssayQuestions"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "requireLockdown"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "gdprDpoName"            TEXT,
  ADD COLUMN IF NOT EXISTS "gdprDpoEmail"           TEXT,
  ADD COLUMN IF NOT EXISTS "dataRegion"             TEXT    NOT NULL DEFAULT 'UK',
  ADD COLUMN IF NOT EXISTS "lastActivityAt"         TIMESTAMP(3);

-- User login tracking
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
