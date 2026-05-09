# SecureExam — Migration Guide
# Phase 1 → Phase 4 Complete

You have your Phase 1 codebase running. This guide tells you exactly what to do
to bring it to the fully-featured Phase 4 build — using Claude Code (AI CLI) or
by following the manual steps yourself.

---

## The simplest option: full replacement

If you have no custom changes in your Phase 1 code, the easiest path is:

```bash
# 1. Back up your .env so you don't lose your secrets
cp apps/api/.env apps/api/.env.backup

# 2. Extract Phase 4 complete on top of your folder
# (replace "your-project-folder" with wherever your Phase 1 lives)
cd ..
unzip -o secureexam-phase4-complete.zip -d your-project-folder-parent

# 3. Restore your .env
cp your-project-folder/apps/api/.env.backup your-project-folder/apps/api/.env

# 4. Install new dependencies and migrate
cd your-project-folder
npm install
npm run db:migrate
npm run dev
```

Done. Skip the rest of this guide.

---

## If you have custom changes in Phase 1

Follow the sections below in order. Each section tells you exactly which files
changed and what to do with them.

---

## STEP 1 — Database migrations (run these first, before touching any code)

You need two SQL migrations. Run them in order against your existing database.

### Migration 1 — Phase 3 (co-proctors + audit log)

```bash
psql $DATABASE_URL << 'SQL'
-- Add isActive to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Co-proctor join table
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

-- Audit log
DO $$ BEGIN
    CREATE TYPE "AuditAction" AS ENUM (
        'USER_CREATED','USER_UPDATED','USER_DELETED','USER_DEACTIVATED',
        'EXAM_PUBLISHED','EXAM_CLOSED','EXAM_ARCHIVED',
        'SESSION_FORCE_SUBMITTED','SESSION_REMOTE_UNLOCKED','SESSION_FLAGGED',
        'PROCTOR_INVITED','PROCTOR_REMOVED','PIN_GENERATED','BULK_IMPORT'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

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
CREATE INDEX IF NOT EXISTS "audit_logs_actorId_idx"   ON "audit_logs"("actorId");
CREATE INDEX IF NOT EXISTS "audit_logs_targetId_idx"  ON "audit_logs"("targetId");
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
SQL
```

### Migration 2 — Phase 4C (sections + question pools)

```bash
psql $DATABASE_URL << 'SQL'
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

ALTER TABLE "exam_items"
    ADD COLUMN IF NOT EXISTS "sectionId" TEXT
    REFERENCES "exam_sections"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "exam_sections_examId_idx" ON "exam_sections"("examId");
CREATE INDEX IF NOT EXISTS "exam_pools_examId_idx"    ON "exam_pools"("examId");
SQL
```

### Regenerate Prisma client after both migrations

```bash
cd apps/api && npx prisma generate && cd ../..
```

---

## STEP 2 — Install new npm packages

Three new packages were added to the API. Run from your project root:

```bash
npm install --workspace=apps/api @anthropic-ai/sdk @aws-sdk/client-s3 @aws-sdk/s3-request-presigner multer
npm install --workspace=apps/api --save-dev @types/multer
npm install --workspace=apps/teacher katex
npm install --workspace=apps/teacher --save-dev @types/katex
npm install --workspace=apps/admin react react-dom react-router-dom axios zustand
```

Or simply run `npm install` from the root after copying the updated `package.json` files
(see Step 3 below).

---

## STEP 3 — Copy files from Phase 4 complete zip

Extract the Phase 4 complete zip to a temp folder:

```bash
mkdir /tmp/p4
unzip secureexam-phase4-complete.zip -d /tmp/p4
# All files are inside /tmp/p4/secureexam/
```

Now copy files in the groups below. Each group is ordered safest-first.

---

### GROUP A — Files you REPLACE entirely (safe, no custom logic expected)

These are config files and infrastructure. Just overwrite them.

```bash
P4=/tmp/p4/secureexam

# Root config
cp $P4/package.json                          ./package.json
cp $P4/docker-compose.yml                    ./docker-compose.yml
cp $P4/docker-compose.prod.yml               ./docker-compose.prod.yml
cp $P4/nginx/nginx.conf                      ./nginx/nginx.conf
cp $P4/docker/Dockerfile.api                 ./docker/Dockerfile.api
cp $P4/docker/Dockerfile.student             ./docker/Dockerfile.student
cp $P4/docker/Dockerfile.teacher             ./docker/Dockerfile.teacher

# API config
cp $P4/apps/api/package.json                 ./apps/api/package.json
cp $P4/apps/api/prisma/schema.prisma         ./apps/api/prisma/schema.prisma
cp $P4/apps/api/.env.example                 ./apps/api/.env.example

# Student portal config
cp $P4/apps/student/package.json             ./apps/student/package.json
cp $P4/apps/student/index.html               ./apps/student/index.html

# Teacher portal config
cp $P4/apps/teacher/package.json             ./apps/teacher/package.json
cp $P4/apps/teacher/index.html               ./apps/teacher/index.html
```

---

### GROUP B — New files to ADD (these don't exist in Phase 1 at all)

Just copy them — nothing to merge.

```bash
P4=/tmp/p4/secureexam

# ── Entire admin portal (brand new app) ──
cp -r $P4/apps/admin ./apps/admin

# ── New API library files ──
cp $P4/apps/api/src/lib/examAccess.ts        ./apps/api/src/lib/examAccess.ts
cp $P4/apps/api/src/lib/storage.ts           ./apps/api/src/lib/storage.ts

# ── New API modules (entire folders, didn't exist in Phase 1) ──
cp -r $P4/apps/api/src/modules/admin         ./apps/api/src/modules/admin
cp -r $P4/apps/api/src/modules/ai            ./apps/api/src/modules/ai
cp -r $P4/apps/api/src/modules/analytics     ./apps/api/src/modules/analytics
cp -r $P4/apps/api/src/modules/audit         ./apps/api/src/modules/audit
cp -r $P4/apps/api/src/modules/exports       ./apps/api/src/modules/exports
cp -r $P4/apps/api/src/modules/grading       ./apps/api/src/modules/grading
cp -r $P4/apps/api/src/modules/media         ./apps/api/src/modules/media
cp -r $P4/apps/api/src/modules/notifications ./apps/api/src/modules/notifications
cp -r $P4/apps/api/src/modules/proctors      ./apps/api/src/modules/proctors
cp -r $P4/apps/api/src/modules/qti           ./apps/api/src/modules/qti
cp -r $P4/apps/api/src/modules/student-results ./apps/api/src/modules/student-results

# ── New exam submodule ──
cp $P4/apps/api/src/modules/exams/sections.router.ts \
   ./apps/api/src/modules/exams/sections.router.ts

# ── New API migration files ──
mkdir -p ./apps/api/prisma/migrations/phase3_proctors_audit
mkdir -p ./apps/api/prisma/migrations/phase4_sections_pools
cp $P4/apps/api/prisma/migrations/phase3_proctors_audit/migration.sql \
   ./apps/api/prisma/migrations/phase3_proctors_audit/migration.sql
cp $P4/apps/api/prisma/migrations/phase4_sections_pools/migration.sql \
   ./apps/api/prisma/migrations/phase4_sections_pools/migration.sql

# ── New teacher portal components ──
cp $P4/apps/teacher/src/components/MediaUpload.tsx   ./apps/teacher/src/components/MediaUpload.tsx
cp $P4/apps/teacher/src/components/ProctorsPanel.tsx ./apps/teacher/src/components/ProctorsPanel.tsx
cp $P4/apps/teacher/src/components/RichText.tsx      ./apps/teacher/src/components/RichText.tsx
cp $P4/apps/teacher/src/components/StudentCard.tsx   ./apps/teacher/src/components/StudentCard.tsx
cp $P4/apps/teacher/src/components/ViolationFeed.tsx ./apps/teacher/src/components/ViolationFeed.tsx

# ── New teacher portal hooks ──
mkdir -p ./apps/teacher/src/hooks
cp $P4/apps/teacher/src/hooks/useProctor.ts          ./apps/teacher/src/hooks/useProctor.ts

# ── New teacher portal pages ──
cp $P4/apps/teacher/src/pages/AIGeneratorPage.tsx    ./apps/teacher/src/pages/AIGeneratorPage.tsx
cp $P4/apps/teacher/src/pages/AnalyticsPage.tsx      ./apps/teacher/src/pages/AnalyticsPage.tsx
cp $P4/apps/teacher/src/pages/GradingPage.tsx        ./apps/teacher/src/pages/GradingPage.tsx
cp $P4/apps/teacher/src/pages/LiveProctorPage.tsx    ./apps/teacher/src/pages/LiveProctorPage.tsx
cp $P4/apps/teacher/src/pages/QTIImportPage.tsx      ./apps/teacher/src/pages/QTIImportPage.tsx
cp $P4/apps/teacher/src/pages/SectionsPage.tsx       ./apps/teacher/src/pages/SectionsPage.tsx
cp $P4/apps/teacher/src/pages/SharedExamsPage.tsx    ./apps/teacher/src/pages/SharedExamsPage.tsx

# ── New student portal components ──
mkdir -p ./apps/student/src/components
mkdir -p ./apps/student/src/hooks
cp $P4/apps/student/src/components/RichText.tsx          ./apps/student/src/components/RichText.tsx
cp $P4/apps/student/src/components/AccessibilityToolbar.tsx \
   ./apps/student/src/components/AccessibilityToolbar.tsx
cp $P4/apps/student/src/hooks/useAccessibility.ts        ./apps/student/src/hooks/useAccessibility.ts

# ── New student portal pages ──
cp $P4/apps/student/src/pages/ResultsListPage.tsx    ./apps/student/src/pages/ResultsListPage.tsx
cp $P4/apps/student/src/pages/ReviewPage.tsx         ./apps/student/src/pages/ReviewPage.tsx

# ── Documentation ──
cp $P4/PHASE2.md  ./PHASE2.md
cp $P4/PHASE3.md  ./PHASE3.md
cp $P4/PHASE4AB.md ./PHASE4AB.md
cp $P4/PHASE4CF.md ./PHASE4CF.md
```

---

### GROUP C — Files to REPLACE (existed in Phase 1, now fully updated)

These files changed significantly across phases. Replace them wholesale.
If you have custom changes in any of these, do a diff first (see note at bottom).

```bash
P4=/tmp/p4/secureexam

# ── API — changed files ──
cp $P4/apps/api/src/app.ts                              ./apps/api/src/app.ts
cp $P4/apps/api/src/websocket/server.ts                 ./apps/api/src/websocket/server.ts
cp $P4/apps/api/src/modules/sessions/sessions.router.ts ./apps/api/src/modules/sessions/sessions.router.ts
cp $P4/apps/api/src/modules/sessions/sessions.service.ts ./apps/api/src/modules/sessions/sessions.service.ts
cp $P4/apps/api/src/modules/exams/exams.router.ts       ./apps/api/src/modules/exams/exams.router.ts
cp $P4/apps/api/src/modules/pins/pins.router.ts         ./apps/api/src/modules/pins/pins.router.ts
cp $P4/apps/api/src/modules/reports/reports.router.ts   ./apps/api/src/modules/reports/reports.router.ts

# ── Teacher portal — changed files ──
cp $P4/apps/teacher/src/App.tsx                         ./apps/teacher/src/App.tsx
cp $P4/apps/teacher/src/components/Layout.tsx           ./apps/teacher/src/components/Layout.tsx
cp $P4/apps/teacher/src/pages/DashboardPage.tsx         ./apps/teacher/src/pages/DashboardPage.tsx
cp $P4/apps/teacher/src/pages/ExamBuilderPage.tsx       ./apps/teacher/src/pages/ExamBuilderPage.tsx
cp $P4/apps/teacher/src/pages/PinsPage.tsx              ./apps/teacher/src/pages/PinsPage.tsx
cp $P4/apps/teacher/src/pages/QuestionBankPage.tsx      ./apps/teacher/src/pages/QuestionBankPage.tsx
cp $P4/apps/teacher/src/pages/ResultsPage.tsx           ./apps/teacher/src/pages/ResultsPage.tsx

# ── Student portal — changed files ──
cp $P4/apps/student/src/App.tsx                         ./apps/student/src/App.tsx
cp $P4/apps/student/src/index.css                       ./apps/student/src/index.css
cp $P4/apps/student/src/pages/ExamListPage.tsx          ./apps/student/src/pages/ExamListPage.tsx
cp $P4/apps/student/src/pages/ExamSessionPage.tsx       ./apps/student/src/pages/ExamSessionPage.tsx
cp $P4/apps/student/src/pages/SubmittedPage.tsx         ./apps/student/src/pages/SubmittedPage.tsx
```

---

### GROUP D — Files that did NOT change (leave yours alone)

These are identical between Phase 1 and Phase 4. Do nothing with them.

```
apps/api/src/index.ts
apps/api/src/lib/jwt.ts
apps/api/src/lib/prisma.ts
apps/api/src/middleware/auth.ts
apps/api/src/modules/auth/auth.router.ts
apps/api/src/modules/auth/auth.service.ts
apps/api/src/modules/exams/exams.service.ts
apps/api/src/modules/questions/questions.router.ts
apps/api/src/modules/questions/questions.service.ts
apps/api/src/modules/schools/schools.router.ts
apps/api/src/modules/users/users.router.ts
apps/api/src/modules/users/users.service.ts
apps/api/src/websocket/server.ts  ← replaced above
apps/api/tsconfig.json
apps/api/prisma/seed.ts
apps/student/src/components/ExitModal.tsx
apps/student/src/components/LockScreen.tsx
apps/student/src/lib/api.ts
apps/student/src/main.tsx
apps/student/src/pages/LoginPage.tsx
apps/student/src/store/authStore.ts
apps/student/tailwind.config.js
apps/student/tsconfig.json
apps/student/vite.config.ts
apps/teacher/src/lib/api.ts
apps/teacher/src/main.tsx
apps/teacher/src/pages/LoginPage.tsx
apps/teacher/src/store/authStore.ts
apps/teacher/tailwind.config.js
apps/teacher/tsconfig.json
apps/teacher/vite.config.ts
packages/shared-types/package.json
packages/shared-types/src/index.ts
```

---

## STEP 4 — Add new environment variables

Open `apps/api/.env` and add these lines (values are optional — features degrade gracefully without them):

```bash
# AI question generation (Track B) — get key at console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-api03-...

# Media storage for question images/audio (Track A)
# Leave blank to use local /tmp storage in development
S3_BUCKET=
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Email delivery for PINs and co-proctor invites (optional)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@yourschool.edu

# Default password for bulk-imported users
BULK_IMPORT_DEFAULT_PASSWORD=ChangeMe123!
```

---

## STEP 5 — Final install and start

```bash
npm install          # picks up all new packages
npm run db:migrate   # if using Prisma migrate dev (fresh DB only)
# OR for existing DB: you already ran the SQL in Step 1
cd apps/api && npx prisma generate && cd ../..
npm run dev
```

**Four apps now run in parallel:**

| App | URL | Login |
|-----|-----|-------|
| Student browser | http://localhost:5173 | student1@demo.school.edu / student123 |
| Teacher portal | http://localhost:5174 | teacher@demo.school.edu / teacher123 |
| Admin portal | http://localhost:5175 | admin@demo.school.edu / admin123 |
| API | http://localhost:4000 | — |

---

## If you used Claude Code (AI CLI) to apply this

Paste the following prompt to your AI CLI session. It will do everything in Steps 1–5 for you:

```
I have a SecureExam Phase 1 project in the current directory. I also have the
Phase 4 complete zip extracted at /tmp/p4/secureexam/. Please migrate my
project to Phase 4 by doing the following in order:

1. Run both SQL migration blocks from MIGRATION_GUIDE.md against my database
   using the DATABASE_URL from apps/api/.env

2. Copy all GROUP A files (config overrides) from /tmp/p4/secureexam/ to ./

3. Copy all GROUP B files (new additions) from /tmp/p4/secureexam/ to ./,
   creating any missing directories

4. Copy all GROUP C files (changed files) from /tmp/p4/secureexam/ to ./

5. Append the new environment variable keys to apps/api/.env (leave values
   blank, I will fill them in)

6. Run: npm install && cd apps/api && npx prisma generate && cd ../..

7. Confirm all files are in place and show me the diff count between my
   original files and the Phase 4 versions for Group C files so I can
   review any conflicts with my custom changes.

Do not modify any Group D files. Ask me before overwriting anything in
Group C if I have local git changes in those files.
```

---

## Troubleshooting

**`prisma generate` fails with "unknown field sectionId on ExamItem"**
→ You ran `prisma generate` before the SQL migration. Run Step 1 first, then regenerate.

**Admin portal (port 5175) shows blank page**
→ Run `npm install` from the root — the admin app's dependencies weren't installed.

**"ANTHROPIC_API_KEY not set" in AI generator**
→ Add the key to `apps/api/.env`. The generator won't work without it but
  everything else will.

**WebSocket connects but teacher gets "Access denied" on live view**
→ The Phase 3 permission guard is working correctly — only the exam owner,
  invited co-proctors, and admins can access the live view. Check that the
  logged-in teacher owns the exam or has been invited via the Pins → Co-proctors tab.

**Student sees "Results pending" instead of score**
→ The exam has "Show results after submission" disabled, or it has essay questions
  that haven't been manually graded yet. Go to Results → Grade Essays.
