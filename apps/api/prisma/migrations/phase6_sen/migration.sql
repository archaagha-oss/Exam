-- apps/api/prisma/migrations/phase6_sen/migration.sql
-- SEN Access Arrangements + Calculator
-- Safe to run on existing databases (all IF NOT EXISTS)

-- Calculator type on exams
ALTER TABLE "exams"
  ADD COLUMN IF NOT EXISTS "calculatorType" TEXT;

-- Student access arrangement profile (one per student)
CREATE TABLE IF NOT EXISTS "student_access_arrangements" (
    "id"                  TEXT NOT NULL,
    "studentId"           TEXT NOT NULL UNIQUE,
    "configuredById"      TEXT NOT NULL,
    "extraTimePercent"    INTEGER NOT NULL DEFAULT 0,
    "textToSpeech"        BOOLEAN NOT NULL DEFAULT false,
    "fontSizeOverride"    INTEGER,
    "restBreaksAllowed"   BOOLEAN NOT NULL DEFAULT false,
    "restBreakMinutes"    INTEGER NOT NULL DEFAULT 0,
    "focusMode"           BOOLEAN NOT NULL DEFAULT false,
    "highContrastForced"  BOOLEAN NOT NULL DEFAULT false,
    "notes"               TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_access_arrangements_pkey"        PRIMARY KEY ("id"),
    CONSTRAINT "student_access_arrangements_student_fk"  FOREIGN KEY ("studentId")     REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "student_access_arrangements_senco_fk"    FOREIGN KEY ("configuredById") REFERENCES "users"("id")
);

-- Rest break audit log
CREATE TABLE IF NOT EXISTS "rest_break_logs" (
    "id"              TEXT NOT NULL,
    "sessionId"       TEXT NOT NULL,
    "startedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumedAt"       TIMESTAMP(3),
    "durationSeconds" INTEGER,
    CONSTRAINT "rest_break_logs_pkey"       PRIMARY KEY ("id"),
    CONSTRAINT "rest_break_logs_session_fk" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "rest_break_logs_sessionId_idx" ON "rest_break_logs"("sessionId");
