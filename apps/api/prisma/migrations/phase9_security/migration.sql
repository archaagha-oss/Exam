-- apps/api/prisma/migrations/phase9_security/migration.sql
-- Security: Magic links, OTP, IP allowlist, Device fingerprinting, Security levels
-- Safe to run on existing Phase 8 database (all IF NOT EXISTS)

-- Security settings on exams
ALTER TABLE "exams"
  ADD COLUMN IF NOT EXISTS "securityLevel"  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "ipAllowlist"    TEXT,
  ADD COLUMN IF NOT EXISTS "requireOtp"     BOOLEAN NOT NULL DEFAULT false;

-- Device fingerprint and OTP tracking on sessions
ALTER TABLE "exam_sessions"
  ADD COLUMN IF NOT EXISTS "deviceFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "otpVerifiedAt"      TIMESTAMP(3);

-- Magic link invites (per-student, single-use)
CREATE TABLE IF NOT EXISTS "exam_invites" (
    "id"         TEXT NOT NULL,
    "examId"     TEXT NOT NULL,
    "studentId"  TEXT NOT NULL,
    "token"      TEXT NOT NULL UNIQUE,
    "usedAt"     TIMESTAMP(3),
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exam_invites_pkey"        PRIMARY KEY ("id"),
    CONSTRAINT "exam_invites_exam_fk"     FOREIGN KEY ("examId")    REFERENCES "exams"("id")  ON DELETE CASCADE,
    CONSTRAINT "exam_invites_student_fk"  FOREIGN KEY ("studentId") REFERENCES "users"("id"),
    CONSTRAINT "exam_invites_unique"      UNIQUE ("examId", "studentId")
);
CREATE INDEX IF NOT EXISTS "exam_invites_token_idx" ON "exam_invites"("token");

-- OTP codes for exam start verification
CREATE TABLE IF NOT EXISTS "exam_otps" (
    "id"         TEXT NOT NULL,
    "sessionId"  TEXT NOT NULL UNIQUE,
    "code"       TEXT NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exam_otps_pkey"       PRIMARY KEY ("id"),
    CONSTRAINT "exam_otps_session_fk" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE
);

-- Device alerts (fingerprint mismatch, new device, etc.)
CREATE TABLE IF NOT EXISTS "device_alerts" (
    "id"          TEXT NOT NULL,
    "sessionId"   TEXT NOT NULL,
    "alertType"   TEXT NOT NULL,
    "details"     JSONB,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "device_alerts_pkey"       PRIMARY KEY ("id"),
    CONSTRAINT "device_alerts_session_fk" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "device_alerts_sessionId_idx" ON "device_alerts"("sessionId");
