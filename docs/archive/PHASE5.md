# SecureExam — Phase 5: Assessment & Analysis Tools

## What's new

### Scoring models (all per-question, set in the Exam Builder)

**Binary (default):** All-or-nothing — full points for correct, zero for wrong. Works for all question types.

**Partial credit (MCQ_MULTI only):** Points awarded proportionally.
Formula: `(correct_selected - wrong_selected) / total_correct × max_points`, minimum 0.
Example: 4 correct options, student picks 3 correct + 1 wrong → `(3-1)/4 × 4pts = 2pts`.

**Negative marking:** Deducts configurable penalty for each wrong answer.
Configurable per question (e.g. -0.25 for a 1-point MCQ).
Overall session score never drops below 0.

**Bonus points:** Extra points on top of `maxPoints` for correct answers.
Useful for challenge questions.

Set these in Exam Builder → Step 2 (Questions) — each item now shows Points / Scoring / Penalty / Bonus inputs.

### Exam blueprint

**Route:** `/exams/:id/blueprint`  
**What it shows:**

- Tag coverage bar chart — how many questions and what % of points each topic contributes
- Difficulty spread (Easy/Medium/Hard) with a warning if over 70% easy
- Question type breakdown
- Topics in your question bank that are NOT in this exam (coverage gap alert)

### Answer distribution with distractor analysis

**Route:** `/exams/:id/distribution`  
**What it shows:**

- Per-question collapsible rows — click to expand
- Per-option percentage bar chart (which answer did each % of students pick)
- Average time spent on each question
- Distractor alert: if a wrong option attracted >30% of students, flags it as potentially confusing
- Low-performance alert: if <20% correct, flags for question review

### Cross-exam student progress

**Route:** `/students/:studentId/progress` (click any student name in Results)  
**What it shows:**

- Score history bar chart across all exams
- Tag-level weak/strong/adequate classification across all sessions
- Violations per exam

### Student personalised feedback + AI remediation

**Route:** `/exams/:id/feedback` (button in Results page)  
**What it does:**

- Split-screen interface: student list on left, feedback editor on right
- "✨ AI Suggest" calls Claude to analyse the student's weak tags and wrong questions, then writes a personalised 3-4 sentence study recommendation
- Teacher can edit the AI suggestion before saving
- Student sees feedback in their Review page after submission
- Also shows in a separate "Study Recommendation" section if AI suggestion differs from teacher text

### Certificate on pass

**Auto-issued:** When a student submits an exam and meets the passing score threshold, a certificate record is created automatically.

**Student sees:**

- 🏆 Certified badge on the Results list for that exam
- "View Certificate" link on the Review page
- Printable certificate at `/results/:sessionId/certificate` (Print / Save as PDF button triggers `window.print()`)

**Certificate contains:** Student name, exam title, score ring, percentage, points breakdown, issue date, unique ID.

---

## New API endpoints

| Method | Path                                               | Who     | Description                                     |
| ------ | -------------------------------------------------- | ------- | ----------------------------------------------- |
| GET    | `/api/v1/assessment/exams/:id/blueprint`           | Teacher | Tag coverage, difficulty spread, gaps           |
| GET    | `/api/v1/assessment/exams/:id/answer-distribution` | Teacher | Per-option breakdown + avg time                 |
| GET    | `/api/v1/assessment/exams/:id/tag-performance`     | Teacher | Tag-level class averages                        |
| GET    | `/api/v1/assessment/students/:id/progress`         | Teacher | Cross-exam history + tag summary                |
| POST   | `/api/v1/assessment/sessions/:id/feedback`         | Teacher | Write feedback                                  |
| POST   | `/api/v1/assessment/sessions/:id/feedback/ai`      | Teacher | Generate AI remediation                         |
| GET    | `/api/v1/assessment/sessions/:id/feedback`         | Student | Read own feedback                               |
| GET    | `/api/v1/assessment/sessions/:id/certificate`      | Any     | Fetch certificate data                          |
| PUT    | `/api/v1/exams/:id/items/:itemId`                  | Teacher | Update item scoring (points/mode/penalty/bonus) |

---

## Database migration

```bash
psql $DATABASE_URL < apps/api/prisma/migrations/phase5_assessment_tools/migration.sql
cd apps/api && npx prisma generate && cd ../..
```

**What it adds:**

- `exam_items`: `scoringMode` (text, default 'binary'), `negativeMarks` (float, default 0), `bonusPoints` (float, default 0)
- `student_answers`: `timeSpentSeconds` (integer, nullable)
- New table `session_feedback` (sessionId, authorId, text, aiSuggested)
- New table `exam_certificates` (sessionId, studentName, examTitle, score, totalPoints, percentage, issuedAt, pdfUrl)

No existing data is changed. All new columns have safe defaults.

---

## New/changed files

### Backend

- `apps/api/prisma/schema.prisma` — updated
- `apps/api/prisma/migrations/phase5_assessment_tools/migration.sql` — new
- `apps/api/src/modules/sessions/sessions.service.ts` — full rewrite with scoring engine + auto-cert
- `apps/api/src/modules/sessions/sessions.router.ts` — timeSpentSeconds in answer save
- `apps/api/src/modules/exams/exams.router.ts` — PUT /items/:itemId endpoint
- `apps/api/src/modules/analytics/assessment.router.ts` — new module (8 endpoints)
- `apps/api/src/app.ts` — assessment router registered

### Teacher portal

- `apps/teacher/src/App.tsx` — blueprint, distribution, student progress, feedback routes
- `apps/teacher/src/pages/ExamBuilderPage.tsx` — scoring controls per item
- `apps/teacher/src/pages/ResultsPage.tsx` — Blueprint, Distribution, Feedback buttons; student names clickable
- `apps/teacher/src/pages/BlueprintPage.tsx` — new
- `apps/teacher/src/pages/AnswerDistributionPage.tsx` — new
- `apps/teacher/src/pages/StudentProgressPage.tsx` — new
- `apps/teacher/src/pages/FeedbackPage.tsx` — new

### Student portal

- `apps/student/src/App.tsx` — certificate route
- `apps/student/src/pages/ResultsListPage.tsx` — certificate badge and link
- `apps/student/src/pages/ReviewPage.tsx` — feedback + certificate sections
- `apps/student/src/pages/CertificatePage.tsx` — new (printable)
