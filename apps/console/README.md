# `apps/console` — School Console (TEACHER + SCHOOL_ADMIN)

The customer-side console. Vite + React + Tailwind. Audience:
TEACHER + SCHOOL_ADMIN + PLATFORM_ADMIN (the last for support
impersonation). Was `apps/teacher` + `apps/admin` pre-cycle 2.0b — D6
collapsed them into this single role-aware SPA.

## Run

```bash
npm run dev --workspace=apps/console     # serves on :5174
```

Demo logins (after `npm run db:seed --workspace=apps/api`):
- `teacher@demo.school.edu` / `teacher123` → TEACHER (no Admin section)
- `admin@demo.school.edu`   / `admin123`   → SCHOOL_ADMIN (full Admin section)

## Role-aware routing

```
/                          TEACHER + SCHOOL_ADMIN + PLATFORM_ADMIN
/questions/*               teacher surface
/exams/*                   teacher surface
/admin/*                   SCHOOL_ADMIN + PLATFORM_ADMIN only (AdminRoute guard)
```

`src/components/Layout.tsx` is role-aware: the Admin nav section renders
only when `user.role` is SCHOOL_ADMIN or PLATFORM_ADMIN. Footer carries
the role badge so support engineers impersonating a school can see at a
glance which surface they're operating on.

`src/App.tsx`'s `AdminRoute` wrapper redirects TEACHER hitting `/admin/*`
back to `/` — feels like "wrong room" rather than 403.

## Two surfaces in one app

```
src/pages/
├── DashboardPage.tsx        teacher
├── QuestionBankPage.tsx     teacher (D4-gated AI Generator at /questions/ai)
├── AIGeneratorPage.tsx      teacher (only renders when D4 flag is on for school)
├── ExamBuilderPage.tsx      teacher
├── SectionsPage.tsx         teacher
├── PinsPage.tsx             teacher
├── LiveProctorPage.tsx      teacher
├── ResultsPage.tsx          teacher
├── GradingPage.tsx          teacher
├── AnalyticsPage.tsx        teacher
├── BlueprintPage.tsx        teacher
├── AnswerDistributionPage.tsx teacher
├── StudentProgressPage.tsx  teacher
├── FeedbackPage.tsx         teacher (uses D4-gated AI feedback)
├── MagicLinksPage.tsx       teacher
├── QTIImportPage.tsx        teacher
├── SharedExamsPage.tsx      teacher
├── LoginPage.tsx            shared
└── admin/                   SCHOOL_ADMIN-only, AdminRoute-gated:
    ├── OverviewPage.tsx     dashboard / org-level KPIs
    ├── MonitorPage.tsx      live proctoring across all exams
    ├── UsersPage.tsx        user CRUD
    ├── ClassesPage.tsx      class assignments
    ├── BulkImportPage.tsx   CSV import (cycle 2.1a perf rewrite — ~8× faster)
    ├── SENPage.tsx          access arrangements per student
    ├── AuditPage.tsx        audit log (incl. impersonation flag column)
    ├── SchoolSettingsPage.tsx branding + exam policy defaults
    └── GDPRPage.tsx         export/erase per data subject
```

## Login → API contract

`POST /api/v1/auth/login` → returns `{ accessToken, user: { role, ... } }`
+ sets `refreshToken` httpOnly cookie. Console accepts users whose role
is in `['TEACHER', 'SCHOOL_ADMIN', 'PLATFORM_ADMIN']` (rejects STUDENT).

On reload, `App.tsx` calls `POST /auth/refresh` once (uses the cookie).
On success, the auth store rehydrates with the new access token + user.
On failure, the user lands on `/login`.

## Live proctoring WS

`useProctor.ts` opens a WebSocket as `wss://console.../ws?examId=<id>`
with `bearer.${token}` subprotocol header (cycle 1.1b / P1-2). On
connect, requests a snapshot; thereafter receives:
- `proctor:update` — per-student snapshot updates
- `proctor:violation` — real-time violation events
- `proctor:student_disconnected` / `:student_stale` — connection state

## Cross-references

- [`docs/01-product.md`](../../docs/01-product.md) §3.2 (teacher
  authoring) + §3.3 (results review) + §3.4 (school onboarding)
- [`docs/04-stage2-prereqs-closure.md`](../../docs/04-stage2-prereqs-closure.md)
  §2 — apps + roles + hostnames
- [`docs/05-manual-testing.md`](../../docs/05-manual-testing.md) §2.2 +
  §3.2 + §3.3 + §3.4
