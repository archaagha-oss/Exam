# SecureExam Platform — Phase 9 Complete Guide

**Phase 9 — April 2026**

5 portals · 24 database models · 80+ API endpoints · 109 source files

## 1. Architecture Overview

SecureExam is a monorepo with five independent React apps sharing a single Express/Prisma API.

| Portal             | Port | Who uses it     | Purpose                                       |
| ------------------ | ---- | --------------- | --------------------------------------------- |
| Student portal     | 5173 | Students        | Lockdown exam-taking, results, certificates   |
| Teacher portal     | 5174 | Teachers/SENCOs | Exam authoring, live proctoring, analytics    |
| Admin portal       | 5175 | School admin    | User management, SEN profiles, GDPR, settings |
| Super admin portal | 5176 | Platform owner  | Provision schools, manage tenancy, migrations |
| API                | 4000 | All portals     | 80+ endpoints, JWT auth, WebSocket            |

### Database

PostgreSQL + Prisma ORM. Redis for WebSocket session coordination. 24 models across 6 migration phases.

> ℹ The platform currently runs in shared-database mode (all schools share one PostgreSQL database with `schoolId` isolation). Schema-per-tenant migration tooling is built and ready when you have paying customers.

## 2. Setup & Installation

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Git
- 8 GB RAM minimum (for running all 5 services locally)

### Step 1 — Extract and install

```bash
unzip secureexam-phase9.zip
cd secureexam
npm install
```

### Step 2 — Start infrastructure

```bash
docker compose up -d postgres redis
```

This starts PostgreSQL on port 5432 and Redis on 6379. Wait 10 seconds for them to be ready.

### Step 3 — Configure the API environment

```bash
cp apps/api/.env.example apps/api/.env
```

The defaults work for local development. For Phase 9 security features, you need:

```env
# apps/api/.env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/secureexam
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-this-to-a-long-random-string
JWT_REFRESH_SECRET=another-long-random-string
STUDENT_APP_URL=http://localhost:5173

# Optional — enables OTP emails and magic link emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=SecureExam <your@gmail.com>

# Optional — enables AI question generation and AI feedback
ANTHROPIC_API_KEY=sk-ant-...
```

> ⚠ If SMTP is not configured, OTP codes are printed to the server console — safe for testing.

### Step 4 — Run migrations and seed demo data

```bash
npm run db:migrate   # applies all 6 migration phases
npm run db:seed      # creates demo school, users, and a sample exam
```

### Step 5 — Start all apps

```bash
npm run dev
```

This starts the API (4000), student portal (5173), teacher portal (5174), admin portal (5175), and super admin (5176) concurrently.

## 3. Demo Accounts

Created by the seed script. All passwords are for testing only.

| Role          | Email                      | Password      | Portal         |
| ------------- | -------------------------- | ------------- | -------------- |
| Super Admin   | superadmin@demo.school.edu | superadmin123 | localhost:5176 |
| Admin / SENCO | admin@demo.school.edu      | admin123      | localhost:5175 |
| Teacher       | teacher@demo.school.edu    | teacher123    | localhost:5174 |
| Student 1     | student1@demo.school.edu   | student123    | localhost:5173 |
| Student 2     | student2@demo.school.edu   | student123    | localhost:5173 |
| Student 3     | student3@demo.school.edu   | student123    | localhost:5173 |
| Student 4     | student4@demo.school.edu   | student123    | localhost:5173 |
| Student 5     | student5@demo.school.edu   | student123    | localhost:5173 |

## 4. Comprehensive Testing Guide

Work through each scenario in order. Each one builds on the previous.

### Scenario 1 — Basic exam end-to-end (30 minutes)

**Goal:** create an exam, take it as a student, review results as a teacher.

**Step 1: Create an exam (Teacher portal)**

1. Open http://localhost:5174 and log in as `teacher@demo.school.edu`
2. Click "New Exam" in the top right
3. Settings step: Title = "Biology Test 1", Duration = 30 minutes, Max violations = 3, Security level = 1
4. Click "Save & Continue"
5. Questions step: from the Question Bank on the right, add 5 questions to the exam
6. Set different points per question (1pt, 2pt, etc.) and try changing a question to "Partial credit" scoring
7. Click "Continue → Assign"
8. Assign step: tick "Demo Class" and click "Save & Continue"
9. Publish step: review the summary and click "🚀 Publish Exam"

**Step 2: Take the exam (Student portal)**

1. Open http://localhost:5173 in a different browser or incognito window
2. Log in as `student1@demo.school.edu` / `student123`
3. You should see "Biology Test 1" in the exam list
4. Click "Start Exam"
5. Read the pre-exam checklist — system check should show all green
6. Click "Enter Fullscreen & Begin"
7. Answer all questions. Try flagging one question with the 🚩 button
8. Try eliminating an answer option with the ✕ button
9. Try hiding the timer (👁 button next to the clock)
10. Try opening the question navigator (☰ button) — click a question number to jump
11. Click "Submit" and confirm in the modal — note it shows answered/unanswered/flagged counts

**Step 3: Review results (Teacher portal)**

1. Back in the teacher portal, go to Dashboard
2. Find "Biology Test 1" and click "Results"
3. You should see student1 with their score
4. Click "📊 Analytics" to see discrimination index and difficulty categories
5. Click "📈 Distribution" to see per-option answer breakdown
6. Click "🗺 Blueprint" to see tag coverage map

> ℹ Expected: student1 appears with score, all analytics pages load correctly

### Scenario 2 — Violation detection (15 minutes)

**Goal:** verify the lockdown browser catches and logs violations correctly.

1. Start a new exam session as student2
2. Once inside the exam (fullscreen active), press `Ctrl+T` — this is blocked, a `KEYBOARD_SHORTCUT` violation should be logged
3. Press `F12` — blocked, another violation
4. Try right-clicking on the question text — context menu should be suppressed, `RIGHT_CLICK` violation logged
5. Switch to another app (Alt+Tab on Windows, Cmd+Tab on Mac) — `FOCUS_LOST` violation after 1.5 seconds
6. In the teacher portal, open "● Live" for this exam — you should see the violations appearing in real time
7. On the 3rd violation (max=3), the student screen should lock and show the 🚨 Lock Screen
8. In teacher portal, use "Remote Unlock" to unlock the session — student screen should clear

> ℹ Expected: violations appear in live proctor dashboard within 2 seconds. Lock screen appears at maxViolations threshold.

### Scenario 3 — Essay grading workflow (20 minutes)

**Goal:** create an exam with essay questions, grade them manually with AI assistance.

1. In the question bank, create a new Essay question: "Describe the process of photosynthesis." (5 points, add a rubric)
2. Create a new exam including this essay question
3. Have student3 take the exam and type a response in the essay box
4. Back in the teacher portal, go to Results → "Grade Essays" button
5. In the grading panel, score the essay and add written feedback
6. Click "Finalize Grades"
7. Check the student portal — student3 should see their score and feedback

> ℹ Expected: essay answers are saved with auto-debounce. Grading panel shows split-screen with student answer on left and rubric on right.

### Scenario 4 — AI question generation (10 minutes)

**Goal:** generate questions from source material using Claude.

> ⚠ Requires `ANTHROPIC_API_KEY` in `apps/api/.env`

1. In the teacher portal, click "✨ AI Generator" in the left nav
2. Paste a paragraph of text from a textbook (or use the sample biology text provided)
3. Set: 5 questions, type = MCQ, difficulty = Medium
4. Click Generate — questions appear within 10 seconds
5. Edit any question inline — change the body or adjust options
6. Select 4 of the 5 questions and click "Save to Question Bank"
7. Go to Question Bank — the new questions should appear tagged with the subject

> ℹ Expected: 5 questions generated in ~8 seconds. All editable before saving. Questions appear in bank immediately.

### Scenario 5 — SEN access arrangements (20 minutes)

**Goal:** configure accommodations for a student and verify they apply automatically.

**Configure SEN profile (Admin portal)**

1. Open http://localhost:5175 and log in as `admin@demo.school.edu`
2. Click "♿ SEN / Access" in the left nav
3. Find student4 and click "Add arrangement"
4. Set: Extra time = 25%, Text-to-speech = enabled, Rest breaks = allowed (10 minutes)
5. Add an EHCP note and save

**Verify accommodations in exam**

1. Log in as student4 in the student portal
2. Start any available exam
3. On the pre-exam screen, verify the yellow "Your access arrangements" panel shows: "+25% extra time", "Read aloud available", "Rest breaks up to 10 minutes"
4. Verify the timer shows the adjusted duration (e.g. 75 minutes instead of 60)
5. Verify the 🔊 button appears in the top bar — click it to hear the question read aloud
6. Verify the ☕ button appears — click it to start a rest break. Timer should pause. Click "Resume Exam" to continue.

> ℹ Expected: All accommodations visible before exam starts. Timer correctly calculates 25% extra. TTS reads full question + options. Rest break pauses timer exactly.

### Scenario 6 — Calculator (10 minutes)

**Goal:** enable both calculator types and verify they work correctly.

1. Create a new exam. In Settings, set Calculator = "Basic"
2. Publish and take as student1 — verify the ∑ button appears in the top bar
3. Click ∑ — basic calculator overlay should appear in the bottom right
4. Test: 123 × 456 = 56088. Test: 15 ÷ 4 = 3.75
5. Create another exam with Calculator = "Scientific"
6. Take as student2 — click ∑ to open scientific calculator
7. Test: sin(90) in DEG mode = 1. Test: log(100) = 2. Test: √144 = 12
8. Test memory: enter 50, press M+ (stores 50). Clear display. Press MR (recalls 50).

> ℹ Expected: Calculator never triggers violations. All mathematical operations produce correct results.

### Scenario 7 — Security levels (30 minutes)

**Goal:** test magic links, IP allowlisting, and OTP verification.

> ⚠ For OTP testing: without SMTP, check the server console for the OTP code (printed as `[OTP] Code for ...: XXXXXX`)

**Level 2 — Magic link + IP check**

1. Create a new exam. Settings: Security level = 2, IP allowlist = `127.0.0.1/32`
2. Publish and assign to Demo Class
3. Go to Results → 🔗 Magic Links
4. Select Demo Class, set expiry to tomorrow, click "Generate & email links"
5. The page shows each student with status "active" and a "Copy link" button
6. Copy student1's magic link
7. Open it in a new browser tab — student should be auto-authenticated and redirected to the exam
8. Try opening the same link again — should show "This link has already been used"
9. Now test IP blocking: change the exam IP allowlist to `1.2.3.4/32` (an IP you don't have)
10. Generate a new link for student2 and open it — should show "Access denied: not on allowed network"

**Level 3 — Magic link + IP + OTP**

1. Create a new exam. Security level = 3, OTP toggle = enabled
2. Generate a magic link for student3
3. Open the link — student reaches the pre-exam screen
4. Click "Enter Fullscreen & Begin" — OTP modal should appear (NOT the exam)
5. Check the server console or email for the 6-digit code
6. Enter the code in the 6 digit boxes — auto-submits on last digit
7. On success: fullscreen activates and exam starts
8. Test wrong code: request a new OTP, type 999999 — should show "Incorrect code, 2 attempts left"
9. Type wrong code 3 times — should show "Too many attempts — request a new OTP"

> ℹ Expected: OTP blocks exam access until verified. Wrong codes are counted. Expired codes show specific message.

### Scenario 8 — Device fingerprinting (10 minutes)

**Goal:** verify device alerts appear when a student logs in from a different device.

1. Take an exam as student5 in Chrome on your main browser
2. Complete and submit the exam
3. Now open a different browser (Firefox, Edge, or Safari) and log in as student5
4. Start another available exam
5. In the teacher portal, open the live proctor view for this exam
6. You should see a violation flagged as "Device alert: NEW_DEVICE"
7. Click on student5's card — the violation feed should show the device alert with the device details

> ℹ Expected: NEW_DEVICE alert appears within 5 seconds of the exam starting. Canvas fingerprints differ between browsers so this should trigger reliably.

### Scenario 9 — Certificate on pass (10 minutes)

**Goal:** verify certificates are automatically issued when a student passes.

1. Create an exam. In Settings, set Passing score = 60%
2. Take the exam as student1 — answer enough questions to score over 60%
3. Submit the exam
4. In the student portal, go to My Results
5. You should see a 🏆 Certified badge on the exam result row
6. Click "View Certificate" — printable certificate opens with score ring, date, and ID
7. Click "🖨 Print / Save as PDF" — browser print dialog should open
8. Now take the same exam as student2 but answer incorrectly — score below 60%
9. Verify NO certificate badge appears for student2

> ℹ Expected: Certificate issued immediately on submission if score ≥ passing threshold. Not issued if score below threshold or if exam has no passing score set.

### Scenario 10 — Question pools and sections (20 minutes)

**Goal:** create a randomised exam where each student gets different questions.

1. First, ensure you have at least 10 tagged questions in the question bank. Add tags like "algebra" and "geometry".
2. Create a new exam and go past the questions step
3. Click "Sections & Pools" (or go to the exam's Sections tab)
4. Create a section called "Part A — Algebra"
5. Add a pool within that section: tag = algebra, draw count = 3 (draws 3 random from all algebra questions)
6. Create another section "Part B — Geometry" with a pool drawing 3 geometry questions
7. Publish the exam
8. Have both student1 and student2 take the exam
9. Compare their question sets — they should be different (random draw from pool)

> ℹ Expected: Each student receives a unique, randomly drawn subset. Question order can also differ if shuffle is enabled.

### Scenario 11 — GDPR tools (15 minutes)

**Goal:** verify subject access export and right to erasure work correctly.

**Subject Access Request (export)**

1. Log into the Admin portal as `admin@demo.school.edu`
2. Go to "🔒 GDPR tools"
3. Search for "student1" — the student should appear in results
4. Click on student1 to select them
5. Click "Subject Access Request" card → "Download data export"
6. A JSON file downloads containing all their sessions, answers, violations, SEN profile, and certificates
7. Open the file and verify it contains the expected data

**Right to erasure**

1. Search for student5 (who has taken fewer tests to make this easier to verify)
2. Click "Right to Erasure" card
3. Type `student5@demo.school.edu` in the confirmation box
4. Click "Permanently erase personal data"
5. Verify: student5 no longer appears in the users list
6. Verify: exam session data is retained (for reporting) but the name shows "[Deleted user]"

> ⚠ This is irreversible in a real environment. Use only test accounts during testing.

### Scenario 12 — Admin dashboard and school settings (15 minutes)

**Goal:** verify the admin overview, trend charts, and school configuration.

1. Log into http://localhost:5175
2. Verify the Dashboard shows: total users count, active sessions (0 if no exams running), sessions in 30 days, pass rate
3. Click the 7d / 30d / 90d toggle — charts should update
4. Check the three bar charts (exam sessions, passes per day, new registrations)
5. Click "⚙ Settings" in the left nav
6. **Branding tab:** change the school name and set a brand colour — click Save
7. **Policy tab:** change default duration to 45 minutes and default max violations to 2 — click Save
8. Create a new exam in the teacher portal — verify it defaults to 45 minutes and 2 violations
9. **GDPR tab:** enter a DPO name and email — click Save

> ℹ Expected: Policy defaults apply to new exams. Brand settings are stored. All three tabs save independently.

### Scenario 13 — Feedback and AI remediation (15 minutes)

**Goal:** write feedback for a student and generate AI study recommendations.

> ⚠ AI remediation requires `ANTHROPIC_API_KEY`

1. In the teacher portal, go to an exam with submitted sessions
2. Click "💬 Feedback" in the Results action bar
3. Select a student in the left sidebar
4. Click "✨ AI Suggest" — Claude analyses their weak tags and wrong questions
5. A personalised 3-4 sentence study recommendation appears in the purple box
6. Edit the suggestion if desired, then click "Save Feedback"
7. Log in as that student in the student portal → My Results → Review answers
8. Scroll to the bottom — "💬 Instructor Feedback" section should show your written feedback
9. If AI suggestion differs from the written feedback, a "✨ Study Recommendation" section also appears

> ℹ Expected: Feedback visible to student immediately after saving. AI suggestion takes 5-10 seconds.

### Scenario 14 — QTI import (10 minutes)

**Goal:** import questions from another platform using the QTI XML standard.

1. In the teacher portal, click "📥 QTI Import" in the left nav
2. The page shows a sample QTI XML you can use for testing
3. Click "Use sample QTI" to load the demo XML
4. Click "Parse QTI" — questions appear as a preview
5. Tick all questions and click "Save to Bank"
6. Go to Question Bank — the imported questions should appear tagged as "qti-import"

> ℹ Expected: QTI 1.2 and 2.x formats both parse correctly. Questions are editable before saving.

### Scenario 15 — Super admin portal (15 minutes)

**Goal:** provision a new school and inspect the migration status.

1. Open http://localhost:5176 — the super admin portal
2. Log in as `superadmin@demo.school.edu` / `superadmin123`
3. Overview page: verify platform KPIs (schools, users, exams, active sessions)
4. Check the database split — should show "Demo School" under "Shared schema"
5. Click "Schools" in the nav → click "+ Provision school"
6. Fill in: School name = "Test Academy", Admin email = "admin@testacademy.edu", Password = "Admin1234"
7. Click "Provision school"
8. Success screen shows the school ID and the migration command
9. Click "View school" — stats page shows 1 admin account, 0 exams
10. Go to "Migration" page — Test Academy appears under "Pending migration" with the exact command to run
11. Copy the migration command from the page

> ℹ Expected: School provisioned in under 2 seconds. Migration status page shows all schools correctly categorised.

## 5. Known Behaviours & Edge Cases

| Behaviour                   | What to expect                             | Notes                                           |
| --------------------------- | ------------------------------------------ | ----------------------------------------------- |
| No SMTP configured          | OTP code printed to server console         | Safe for testing — check terminal               |
| No `ANTHROPIC_API_KEY`      | AI features return error 400               | All other features work normally                |
| Student fails OTP 3 times   | Locked out, must request new code          | Resend button unlocks after old code expires    |
| Magic link already used     | HTTP 410 with "already been used" message  | New link can be regenerated by teacher          |
| IP blocked                  | HTTP 403 before reaching exam              | Error shows student's actual IP                 |
| Timer at 0                  | Auto-submits and navigates to `/submitted` | Answers saved up to that point                  |
| Rest break timer runs out   | No automatic resume — student must click   | Remaining time shown in tooltip                 |
| Focus mode + question panel | Panel hidden, dots replaced with counter   | Can still submit from top bar                   |
| Essay without grading       | Score shows null until manually graded     | `isCorrect` stays null; points awarded manually |
| Score below passing         | No certificate issued                      | Badge does not appear in results                |
| GDPR erasure                | Account anonymised, sessions retained      | Email becomes `deleted-xxxxx@erased.invalid`    |
| Pool draw count > available | Pool draws available count                 | No error, just fewer questions                  |

## 6. API Quick Reference

Base URL: `http://localhost:4000/api/v1`

All authenticated endpoints require: `Authorization: Bearer <token>`

### Authentication

```
POST /auth/login          { email, password }  →  { accessToken, user }
POST /auth/refresh        { refreshToken }     →  { accessToken }
```

### Core exam flow

```
GET  /exams               list teacher's exams
POST /exams               create exam
POST /exams/:id/items     add question to exam
POST /exams/:id/publish   publish exam
POST /exams/:id/activate  activate exam (open for students)
```

### Student session

```
POST /sessions/:examId/start     start or resume session
POST /sessions/:id/answer        save answer (debounced)
POST /sessions/:id/violation     log violation
POST /sessions/:id/submit        submit exam
POST /sessions/:id/unlock        unlock with PIN
```

### Security (Phase 9)

```
POST /security/exams/:id/invites/generate   generate magic links
GET  /security/join/:token                  validate magic link
POST /security/sessions/:id/otp/send        send OTP email
POST /security/sessions/:id/otp/verify      verify OTP code
POST /security/sessions/:id/fingerprint     submit device fingerprint
```

### Analytics

```
GET  /assessment/exams/:id/blueprint            tag coverage map
GET  /assessment/exams/:id/answer-distribution  per-option stats
GET  /assessment/students/:id/progress          cross-exam progress
```

> Note: this guide was provided truncated mid-sentence in the API quick reference. Additional endpoints exist beyond what is documented above.
