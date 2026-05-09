-- Phase 4C: Exam sections and question pools
-- Run after Phase 3 migration

CREATE TABLE IF NOT EXISTS "exam_sections" (
    "id"              TEXT NOT NULL,
    "examId"          TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "instructions"    TEXT,
    "order"           INTEGER NOT NULL,
    "durationMinutes" INTEGER,
    "pointsAvailable" DOUBLE PRECISION,

    CONSTRAINT "exam_sections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exam_sections_examId_fkey"
        FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "exam_pools" (
    "id"         TEXT NOT NULL,
    "examId"     TEXT NOT NULL,
    "sectionId"  TEXT,
    "title"      TEXT NOT NULL,
    "drawCount"  INTEGER NOT NULL,
    "tags"       TEXT[] NOT NULL DEFAULT '{}',
    "difficulty" INTEGER,
    "type"       TEXT,
    "order"      INTEGER NOT NULL,

    CONSTRAINT "exam_pools_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exam_pools_examId_fkey"
        FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE,
    CONSTRAINT "exam_pools_sectionId_fkey"
        FOREIGN KEY ("sectionId") REFERENCES "exam_sections"("id") ON DELETE SET NULL
);

-- Add sectionId to exam_items
ALTER TABLE "exam_items"
    ADD COLUMN IF NOT EXISTS "sectionId" TEXT
    REFERENCES "exam_sections"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "exam_sections_examId_idx" ON "exam_sections"("examId");
CREATE INDEX IF NOT EXISTS "exam_pools_examId_idx"    ON "exam_pools"("examId");
