-- Cycle 2.0f: SOC 2 / GDPR / FERPA evidence trail for cross-tenant audit
-- entries. Adds four columns + one index to audit_logs:
--
--   actorRole       denormalised from users.role at the time of the action
--   actorSchoolId   denormalised from users.schoolId
--   targetSchoolId  schoolId of the row being acted on, where known
--   impersonation   true when actor reached across tenants
--
-- Backfill assumes all existing rows are non-impersonation (which is true:
-- the previous codebase only logged actions inside the actor's own school
-- because cross-tenant breaches were unintended). New writes via
-- auditFromReq() will populate these correctly.

ALTER TABLE "audit_logs" ADD COLUMN "actorRole" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "actorSchoolId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "targetSchoolId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "impersonation" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "audit_logs_actorRole_impersonation_idx"
    ON "audit_logs" ("actorRole", "impersonation");

-- AuditAction enum gains SCHOOL_PROVISIONED / SCHOOL_DELETED so the
-- /platform/schools writes (currently unaudited; cycle 2.0f gap fix)
-- have first-class enum values rather than reusing USER_*.
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_PROVISIONED';
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_DELETED';
