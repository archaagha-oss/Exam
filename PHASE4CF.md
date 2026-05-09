# SecureExam — Phase 4 Tracks C, D, E, F

## What's in each track

### Track C — Exam flexibility (sections + question pools)

**Sections** let you divide an exam into named parts with optional per-section timers.
Go to Dashboard → Edit Exam → click "Sections" from any exam's action row.

- Each section has a title, optional instructions, and optional time limit
- Questions in the Exam Builder can be assigned to a section
- If a section has a timer, students must move on when it expires

**Question Pools** draw a random subset from your question bank each time a student starts.
Students taking the same exam get different questions — better academic integrity.

- Filter by tags, difficulty (Easy/Medium/Hard), or question type
- Set `drawCount` — how many questions to pick
- Preview which questions would be drawn before publishing
- Works standalone or scoped to a section

**API:**
```
GET    /api/v1/exams/:id/sections          — list sections + pools
POST   /api/v1/exams/:id/sections          — create section
PUT    /api/v1/exams/:id/sections/:sid     — update section
DELETE /api/v1/exams/:id/sections/:sid     — delete section
POST   /api/v1/exams/:id/sections/pools    — create pool
DELETE /api/v1/exams/:id/sections/pools/:pid — remove pool
GET    /api/v1/exams/:id/sections/pools/preview — preview pool draws
```

**Database migration (Phase 4C only):**
```bash
psql $DATABASE_URL < apps/api/prisma/migrations/phase4_sections_pools/migration.sql
cd apps/api && npx prisma generate
```

---

### Track D — Student result portal

Students can now see their scores and review answers after submitting.

- "📊 View My Results" button on the submission confirmation screen
- "📊 My Results" link in the exam list navigation
- Results list page: all completed exams with score ring, pass/fail, time taken
- Per-exam review page: every question with colour-coded correct/incorrect answers,
  rubric for essay questions, feedback from teacher grading
- Correct answers are only shown if the teacher enabled "Show results after submission"
  on the exam

**Routes added to student portal:**
```
/results             — ResultsListPage
/results/:sessionId  — ReviewPage (per-exam answer review)
```

**API:**
```
GET /api/v1/student/results                — all submitted sessions
GET /api/v1/student/results/:sessionId     — full review for one session
```

---

### Track E — Analytics

New "📊 Analytics" button on every Results page. Three tabs:

**Overview tab:**
- Score distribution bar chart (0–20, 21–40, 41–60, 61–80, 81–100%)
- Average, median, pass rate, standard deviation
- Completion time (average, fastest, slowest)
- Suspected academic integrity alert: students who scored high, finished fast, and had violations

**Questions tab:**
- Per-question table: % correct, correct/answered counts
- Discrimination index (how well each question separates high/low scorers)
  - ≥ 0.30 = good · 0.10–0.29 = fair · < 0.10 = consider rewriting
- Difficulty category: too easy / appropriate / challenging / too hard

**Violations tab:**
- % of students with violations
- Auto-submitted count
- Breakdown by violation type
- Suspected cheating panel with session details

**API:**
```
GET /api/v1/analytics/exams/:id     — full exam analytics
GET /api/v1/analytics/class/:classId — class trends over time
GET /api/v1/analytics/school        — school-wide overview
```

---

### Track F — QTI Import + Accessibility

**QTI Import** — new "📥 QTI Import" in the sidebar:
- Supports IMS QTI 2.1 / 2.2 (`assessmentItem`) and QTI 1.2 (`item`)
- Compatible with exports from Moodle, Canvas, Blackboard, most LMSes
- Paste XML or upload a `.xml` file
- Preview all parsed questions before saving
- Select/deselect individual questions
- Saved questions get the tag `qti-import` for easy filtering
- Sample QTI XML included in the UI for testing

**Supported question types via QTI:**
- `choiceInteraction` with maxChoices=1 → MCQ
- `choiceInteraction` with maxChoices>1 → MCQ_MULTI
- True/False options auto-detected → TRUE_FALSE
- `extendedTextInteraction` / `textEntryInteraction` → SHORT_TEXT
- QTI 1.2 `response_label` → MCQ

**API:**
```
POST /api/v1/qti/import       — parse XML → returns questions for preview
POST /api/v1/qti/import/save  — save selected parsed questions
```

**Accessibility controls** — persistent toolbar in the student portal (bottom-right corner):
- **A− / A+** — adjust base font size (14–22px), saved to localStorage
- **◑** — high contrast mode (increases CSS contrast filter)
- **⏸** — reduced motion (disables animations for vestibular disorders)

Settings persist across sessions via `localStorage`. All interactive elements in the
student portal have proper `aria-label`, `aria-pressed`, `role` attributes,
and visible focus rings for keyboard navigation.

---

## Complete new/changed file list (Phase 4 C–F)

### Backend
- `apps/api/src/app.ts` (updated — new routers)
- `apps/api/src/modules/exams/sections.router.ts` (new — Track C)
- `apps/api/src/modules/sessions/sessions.service.ts` (updated — pool resolver)
- `apps/api/src/modules/student-results/student-results.router.ts` (new — Track D)
- `apps/api/src/modules/analytics/analytics.router.ts` (new — Track E)
- `apps/api/src/modules/qti/qti.router.ts` (new — Track F)
- `apps/api/prisma/schema.prisma` (updated — ExamSection, ExamPool)
- `apps/api/prisma/migrations/phase4_sections_pools/migration.sql` (new)

### Teacher portal
- `apps/teacher/src/App.tsx` (updated)
- `apps/teacher/src/components/Layout.tsx` (updated — QTI Import nav)
- `apps/teacher/src/pages/SectionsPage.tsx` (new — Track C)
- `apps/teacher/src/pages/AnalyticsPage.tsx` (new — Track E)
- `apps/teacher/src/pages/QTIImportPage.tsx` (new — Track F)
- `apps/teacher/src/pages/ResultsPage.tsx` (updated — Analytics link)
- `apps/teacher/src/pages/DashboardPage.tsx` (updated — Sections link)

### Student portal
- `apps/student/src/App.tsx` (updated — results routes + a11y wrapper)
- `apps/student/src/pages/ResultsListPage.tsx` (new — Track D)
- `apps/student/src/pages/ReviewPage.tsx` (new — Track D)
- `apps/student/src/pages/SubmittedPage.tsx` (updated — View Results button)
- `apps/student/src/pages/ExamListPage.tsx` (updated — My Results link)
- `apps/student/src/hooks/useAccessibility.ts` (new — Track F)
- `apps/student/src/components/AccessibilityToolbar.tsx` (new — Track F)
- `apps/student/src/index.css` (updated — a11y CSS)

---

## Upgrading from Phase 4 A+B

Phase 4 C–F adds one database migration (sections + pools) and no breaking changes.

```bash
# 1. Run the migration
psql $DATABASE_URL < apps/api/prisma/migrations/phase4_sections_pools/migration.sql

# 2. Regenerate Prisma client
cd apps/api && npx prisma generate && cd ../..

# 3. Restart dev server
npm run dev
```

No new npm packages are required for C–F.
