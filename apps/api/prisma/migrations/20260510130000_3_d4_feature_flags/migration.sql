-- Cycle 2.0e / D4: per-school feature flags.
--
-- Two tables:
--   features         row-per-flag with metadata (description, category,
--                    default-enabled). Vendor-managed; schools don't add
--                    rows here.
--   school_features  per-school toggle, with enabledBy / enabledAt for the
--                    audit trail required by GDPR/SOC 2/COPPA posture
--                    (docs/01-product.md §5).
--
-- Defaults to 'ai-authoring' as the first flag, off by default everywhere.
-- Schools opt in via the SCHOOL_ADMIN console; PLATFORM_ADMIN can also
-- toggle for support.

CREATE TABLE "features" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "defaultEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "features_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "school_features" (
    "schoolId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "enabledById" TEXT,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_features_pkey" PRIMARY KEY ("schoolId","featureKey")
);

CREATE INDEX "school_features_schoolId_idx" ON "school_features"("schoolId");

ALTER TABLE "school_features"
    ADD CONSTRAINT "school_features_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "school_features"
    ADD CONSTRAINT "school_features_featureKey_fkey"
    FOREIGN KEY ("featureKey") REFERENCES "features"("key")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the catalogue. Always-off-by-default per docs/01-product.md §7.
INSERT INTO "features" ("key", "name", "description", "category", "defaultEnabled") VALUES
    ('ai-authoring',  'AI question authoring',  'Lets teachers generate questions and grading feedback with Claude. Off by default; opt-in per school. Question and feedback prompts are guarded against injection (docs/decisions.md D2 / cycle 1.3 P1-6). When off, no AI calls are made and the AI UI is hidden from teachers.', 'ai', false),
    ('live-proctoring', 'Live video proctoring', 'Reserved for a future cycle. Not built yet — placeholder so the catalogue is forward-compatible.', 'proctoring', false),
    ('seb-tier-3',    'Safe Exam Browser (Tier 3)', 'Reserved for Stage 5. SEB handoff for Tier-3 sit-down exams on Windows (docs/01-product.md §4).', 'proctoring', false);

-- AuditAction enum gains FEATURE_ENABLED / FEATURE_DISABLED so the
-- /admin/features/:key writes can be audit-logged via the existing
-- AuditLog table without a sentinel string.
ALTER TYPE "AuditAction" ADD VALUE 'FEATURE_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE 'FEATURE_DISABLED';
