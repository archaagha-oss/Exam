-- apps/api/prisma/migrations/phase3_proctors_audit/migration.sql
-- Phase 3: Co-proctor sharing and audit logging
-- Run: npx prisma migrate dev --name phase3_proctors_audit

-- Add isActive to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- ExamProctor table
CREATE TABLE IF NOT EXISTS "exam_proctors" (
    "id"        TEXT NOT NULL,
    "examId"    TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_proctors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exam_proctors_examId_teacherId_key" UNIQUE ("examId", "teacherId"),
    CONSTRAINT "exam_proctors_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE,
    CONSTRAINT "exam_proctors_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id"),
    CONSTRAINT "exam_proctors_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "users"("id")
);

-- AuditLog action enum
DO $$ BEGIN
    CREATE TYPE "AuditAction" AS ENUM (
        'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_DEACTIVATED',
        'EXAM_PUBLISHED', 'EXAM_CLOSED', 'EXAM_ARCHIVED',
        'SESSION_FORCE_SUBMITTED', 'SESSION_REMOTE_UNLOCKED', 'SESSION_FLAGGED',
        'PROCTOR_INVITED', 'PROCTOR_REMOVED',
        'PIN_GENERATED', 'BULK_IMPORT'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AuditLog table
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id"         TEXT NOT NULL,
    "actorId"    TEXT NOT NULL,
    "action"     "AuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId"   TEXT NOT NULL,
    "meta"       JSONB,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_actorId_idx"  ON "audit_logs"("actorId");
CREATE INDEX IF NOT EXISTS "audit_logs_targetId_idx" ON "audit_logs"("targetId");
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
