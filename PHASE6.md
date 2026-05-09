# SecureExam — Phase 6: SEN Access Arrangements & Calculator

## What's new

### SEN (Special Educational Needs) Access Arrangements

Configured once per student by SENCO/admin. Applied **automatically to every exam** that student sits — the student never has to ask.

| Arrangement | What it does |
|------------|-------------|
| Extra time (0 / 25% / 50% / 100%) | Multiplies exam duration. Timer shows adjusted time. |
| Text-to-speech | 🔊 button appears in top bar + bottom-left of screen. Reads the full question and all options aloud using the browser's SpeechSynthesis API. |
| Font size override (14–28px) | Overrides the student's own preference for every exam. |
| Rest breaks | ☕ button in top bar. Pauses the timer completely. Audit log records each break start/end/duration. |
| Focus mode | Hides the question dot navigation bar. Shows "1 / 12" counter instead. Removes sidebar panel. One question at a time. |
| High contrast (forced) | Forces high-contrast CSS filter on — student cannot turn it off. |

**Legal basis:** UK Equality Act 2010, JCQ access arrangement guidelines. All arrangement changes are logged to the audit trail with the SENCO's name, date, and previous values.

**Student sees (pre-exam):**
A yellow "Your access arrangements" panel summarising every accommodation active for their session, before they enter fullscreen.

**Student sees (during exam):**
- 🔊 appears in top bar if TTS enabled — click to read, click again to stop
- ☕ appears if rest breaks allowed (shows remaining time in tooltip)
- ∑ appears if calculator is enabled for this exam
- Navigation is hidden in focus mode, replaced with "Q 3 / 12" counter

### Calculator

Set per exam by the teacher in Exam Builder → Settings → "Calculator" dropdown.

- **None** (default) — no calculator shown
- **Basic** — shows +, −, ×, ÷ and decimal point
- **Scientific** — full scientific: sin/cos/tan and inverses, ln/log/eˣ/10ˣ, √, x², x³, xʸ, 1/x, n!, ±, memory (MC/MR/M+/M−/MS), DEG/RAD toggle

The calculator opens as a floating overlay (bottom-right corner) when the student clicks ∑. It does not trigger violations.

---

## New API endpoints

| Method | Path | Who | Description |
|--------|------|-----|-------------|
| GET | `/api/v1/sen/arrangements` | Admin | List all students with SEN profiles in school |
| GET | `/api/v1/sen/arrangements/:studentId` | Admin/Student | Read one student's arrangement |
| PUT | `/api/v1/sen/arrangements/:studentId` | Admin | Create/update arrangement (upsert) |
| DELETE | `/api/v1/sen/arrangements/:studentId` | Admin | Remove arrangement |
| POST | `/api/v1/sen/sessions/:id/rest-break/start` | Student | Start rest break (pauses timer) |
| POST | `/api/v1/sen/sessions/:id/rest-break/end` | Student | End rest break (resumes timer) |
| GET | `/api/v1/sen/sessions/:id/rest-breaks` | Any | Break audit log for session |

---

## Database migration

```bash
psql $DATABASE_URL < apps/api/prisma/migrations/phase6_sen/migration.sql
cd apps/api && npx prisma generate && cd ../..
```

**What it adds:**
- `exams.calculatorType` (text, nullable) — null = none, 'basic', 'scientific'
- New table `student_access_arrangements` (one row per student)
- New table `rest_break_logs` (one row per break event per session)

---

## New/changed files

### Backend
- `apps/api/prisma/schema.prisma` — StudentAccessArrangement, RestBreakLog, calculatorType on Exam
- `apps/api/prisma/migrations/phase6_sen/migration.sql` — new
- `apps/api/src/modules/sen/sen.router.ts` — new (7 endpoints)
- `apps/api/src/modules/sessions/sessions.service.ts` — loads SEN profile, applies extra time, subtracts break time
- `apps/api/src/modules/exams/exams.service.ts` — includes calculatorType
- `apps/api/src/app.ts` — SEN router registered

### Admin portal
- `apps/admin/src/App.tsx` — SEN route added
- `apps/admin/src/components/Layout.tsx` — ♿ SEN/Access nav item
- `apps/admin/src/pages/SENPage.tsx` — new (full arrangement management UI)

### Teacher portal
- `apps/teacher/src/pages/ExamBuilderPage.tsx` — calculator dropdown in Settings step

### Student portal
- `apps/student/src/pages/ExamSessionPage.tsx` — TTS, rest break, focus mode, calculator, SEN banner
- `apps/student/src/components/Calculator.tsx` — new (fully functional scientific calculator)

---

## Upgrade from Phase 5

```bash
psql $DATABASE_URL < apps/api/prisma/migrations/phase6_sen/migration.sql
cd apps/api && npx prisma generate && cd ../..
npm run dev
```

No new npm packages required.
