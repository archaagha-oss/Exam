-- apps/api/prisma/migrations/phase5_assessment_tools/migration.sql
-- Assessment & Analysis Tools
-- Safe to run on existing Phase 4 database (all IF NOT EXISTS / IF COLUMN NOT EXISTS)

-- Scoring model on exam items
ALTER TABLE "exam_items"
  ADD COLUMN IF NOT EXISTS "scoringMode"   TEXT    NOT NULL DEFAULT 'binary',
  ADD COLUMN IF NOT EXISTS "negativeMarks" FLOAT   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bonusPoints"   FLOAT   NOT NULL DEFAULT 0;

-- Time tracking on answers
ALTER TABLE "student_answers"
  ADD COLUMN IF NOT EXISTS "timeSpentSeconds" INTEGER;

-- Session feedback table
CREATE TABLE IF NOT EXISTS "session_feedback" (
    "id"          TEXT NOT NULL,
    "sessionId"   TEXT NOT NULL UNIQUE,
    "authorId"    TEXT NOT NULL,
    "text"        TEXT NOT NULL,
    "aiSuggested" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_feedback_pkey"       PRIMARY KEY ("id"),
    CONSTRAINT "session_feedback_session_fk" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
    CONSTRAINT "session_feedback_author_fk"  FOREIGN KEY ("authorId")  REFERENCES "users"("id")
);

-- Certificates table
CREATE TABLE IF NOT EXISTS "exam_certificates" (
    "id"          TEXT NOT NULL,
    "sessionId"   TEXT NOT NULL UNIQUE,
    "studentName" TEXT NOT NULL,
    "examTitle"   TEXT NOT NULL,
    "score"       FLOAT NOT NULL,
    "totalPoints" FLOAT NOT NULL,
    "percentage"  INTEGER NOT NULL,
    "issuedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfUrl"      TEXT,
    CONSTRAINT "exam_certificates_pkey"       PRIMARY KEY ("id"),
    CONSTRAINT "exam_certificates_session_fk" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE
);
