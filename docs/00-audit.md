# Stage 0 / Cycle 0.1 — Repo Audit

**Date:** 2026-05-10
**Branch:** `claude/stage-0-repo-audit-euvjp`
**Scope:** ground-truth pass over the entire repo. Trust-but-verify against
existing `docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, `docs/RUNBOOK.md`,
`docs/CHANGES.md`. Findings are based on reading the code, not the docs.

---

## 0. TL;DR — what you are actually shipping

SecureExam is a **multi-tenant browser-based exam platform** for schools, built
as a 5-portal React monorepo with an Express + Prisma + Postgres + Redis
backend. The codebase is **mid-maturity**: there is a real engineering spine
(eslint+prettier+husky, CI gates, multi-stage Docker, pino logs, Prometheus
metrics, idempotency middleware, audit log table, Zod validation, env-var
secret enforcement at boot). 11 prior "hardening cycles" have shipped.

**It is not production-ready, and the existing docs over-state where the
codebase is.** Specifically:

| Doc claim | Reality |
| --- | --- |
| `ARCHITECTURE.md` invariant #1 — every tenant query filters by `schoolId` | **At least 10 routes do not.** Two are P0 IDORs in `reports/*` (any teacher reads any school's full results). |
| `ARCHITECTURE.md` invariant #4 — "tokens stay out of localStorage" | **Superadmin portal stores the access token in `localStorage`** (the highest-privilege role). |
| `ARCHITECTURE.md` invariant #5 — "WebSocket auth via subprotocol header" | **Server still accepts `?token=` query param ("backward compat"); the student client only uses `?token=`.** The subprotocol path is never exercised. |
| `ARCHITECTURE.md` / README — "Server-authoritative timer" | **Client-authoritative.** Server sends `secondsRemaining` once at load; client decrements with `setInterval`. |
| `CHANGES.md` Cycle 8 — "answer queue (IndexedDB) wired" | `lib/answerQueue.ts` exists; **zero importers**. The student page uses an in-memory `useState<any[]>([])` queue lost on tab close. |
| `CHANGES.md` Cycle 11 — "all four portals migrated to shared-frontend" | **Three did.** `apps/superadmin` does not depend on `@secureexam/shared-frontend` and has its own inline `apiFetch` with no 401 refresh, no single-flight, hardcoded `localhost` fallback. |
| README / nginx — production deploy | **nginx config has 0 HTTPS server blocks**, all 4 vhosts `listen 80`, all hostnames are `*.yourschool.edu` placeholders, and there is **no superadmin vhost** at all. |
| README — "five React portals" deploy via Docker | **No `docker/Dockerfile.superadmin` exists**, and CI does not build it. The superadmin portal cannot be deployed via the documented path. |

The gap between the docs and the code is itself the most important finding:
each new "cycle" has added scope and re-claimed completeness without
re-verifying earlier invariants. **Stage 1 must close this gap before any new
features ship**, because the platform is being sold as "secure" while
multiple advertised defenses are not in place.

---

## 1. Stack & versions

| Layer | Choice | Version |
| --- | --- | --- |
| Runtime | Node.js | 20+ (declared in `Dockerfile.api`) |
| Language | TypeScript | 5.3.3 |
| API framework | Express | 4.18.2 |
| ORM | Prisma | 5.7.0 |
| Database | PostgreSQL | 15 |
| Cache / pub-sub | Redis | 7 (refresh tokens, OTP rate limit, idempotency) |
| WebSocket | `ws` | 8.16 |
| Validation | Zod | 3.22 |
| JWT | `jsonwebtoken` | 9.0.2 |
| Passwords | `bcrypt` | 5.1.1 (cost 12 normally, **cost 10 in bulk import — bug**) |
| Frontend | React + Vite | 18.2 / 5.0.11 |
| Routing | React Router | 6.21 |
| State | Zustand | 4.4.7 (student/teacher/admin); **none in superadmin** |
| Styling | Tailwind | 3.4 (everywhere except superadmin which uses inline `style={}`) |
| Logging | pino | 9.2 |
| Metrics | prom-client | 15.1 |
| AI | `@anthropic-ai/sdk` | 0.20.9 |
| Mail | nodemailer | 6.9 |
| Storage | `@aws-sdk/client-s3` | 3.490 (presigned URLs for backups + media) |
| Tests | Vitest + supertest | 1.6 |
| Container | Docker + docker-compose | — |
| Reverse proxy | nginx | alpine (rate-limit zones configured) |
| CI/CD | GitHub Actions | — |

Dependency audit not yet run (Stage 1 task). No lockfile drift; all apps share
the root `package-lock.json` via npm workspaces.

---

## 2. Repo structure & entry points

```
secureexam/
├── apps/
│   ├── api/               Express+Prisma backend         entry: src/index.ts → src/app.ts
│   ├── student/           Lockdown exam UI    :5173      entry: src/main.tsx → App.tsx
│   ├── teacher/           Authoring + proctoring :5174   entry: src/main.tsx → App.tsx
│   ├── admin/             School admin       :5175       entry: src/main.tsx → App.tsx
│   └── superadmin/        Platform owner     :5176       entry: src/main.tsx → App.tsx
├── packages/
│   ├── shared-types/      Plain TS types
│   └── shared-frontend/   axios client + zustand auth store + refresh queue
│                          (NOT consumed by superadmin)
├── docker/                Dockerfile.api/student/teacher/admin
│                          (Dockerfile.superadmin missing)
├── nginx/nginx.conf       Reverse proxy + rate-limit zones (HTTP-only today)
├── scripts/               backup.sh, restore.sh, migrate-tenant{,-cleanup}.ts
├── .github/workflows/     CI (lint, typecheck, test, build, deploy)
├── docker-compose.yml     Local dev
├── docker-compose.prod.yml Prod (only postgres has a healthcheck)
└── docs/                  ARCHITECTURE / THREAT_MODEL / RUNBOOK / CHANGES + this file
```

Workspaces: `npm` workspaces, root `package.json` orchestrates `dev`,
`build`, `db:migrate`, `db:seed`, `lint`, `format`, `typecheck`, `test`.

---

## 3. Data model

24 Prisma models in `apps/api/prisma/schema.prisma` (542 LOC). Two migrations:
`0_init` and `1_indexes_and_constraints` (Cycle 4: FK indexes + CHECK
constraints).

```
School (tenant root, branding, policy defaults, GDPR DPO fields)
 ├─ User (STUDENT | TEACHER | ADMIN | SUPER_ADMIN; nullable schoolId for SUPER_ADMIN)
 │   ├─ ClassStudent / ClassTeacher (M:N → Class)
 │   ├─ AuditLog (actorId)
 │   └─ StudentAccessArrangement (SEN: extra time, TTS, rest breaks, focus mode)
 ├─ Class
 │   └─ ExamAssignment (M:N Class↔Exam)
 └─ Exam (status: DRAFT|PUBLISHED|ACTIVE|CLOSED|ARCHIVED)
     ├─ ExamItem ──→ Question (typed: MCQ|MCQ_MULTI|TRUE_FALSE|SHORT_TEXT|ESSAY)
     │   └─ scoringMode: binary | partial | negative; bonusPoints; negativeMarks
     ├─ ExamSection / ExamPool (random draw by tag/difficulty/type)
     ├─ ExamProctor (co-proctors)
     ├─ ExamPin (UNLOCK | EXIT, bcrypt-hashed)
     ├─ ExamInvite (single-use magic-link token)
     └─ ExamSession (per (examId, studentId), unique)
         ├─ StudentAnswer (sessionId, questionId, unique)
         ├─ Violation (TAB_SWITCH | FULLSCREEN_EXIT | … | MANUAL_FLAG)
         ├─ RestBreakLog (SEN)
         ├─ ExamOtp (6-digit, hashed; 10-attempt cap per session)
         ├─ DeviceAlert (NEW_DEVICE | LOCATION_CHANGE | FINGERPRINT_MISMATCH)
         ├─ SessionFeedback (teacher text + AI-suggested remediation)
         └─ ExamCertificate (issued on pass; pdfUrl optional)
```

Indexes: every tenant-scoped table has `(schoolId)`; exams/sessions also have
composite `(schoolId, status)` / `(examId, status)`. CHECK constraints on
`passingScore`, `durationMinutes`, `securityLevel`, etc. (per Cycle 4).

**Schema observations / risks:**

- `Exam.ipAllowlist` is a comma-separated string, not a structured array.
  Validation is ad-hoc on the input route.
- `ExamPin.@@unique([examId, purpose])` means **only one UNLOCK + one EXIT pin
  per exam can exist at a time**; rotation requires delete-then-recreate.
  The README claims unlock PINs are reusable — schema agrees.
- No `deletedAt` on any model. **No soft-delete strategy.** Hard deletes are
  cascade-permitted on `Exam → ExamItem`, `ExamSession → StudentAnswer/Violation`,
  etc. Stage 1 should pick a soft-delete policy for compliance/forensics
  (especially given the GDPR module which does hard erasure).
- `User.schoolId` is nullable but only legitimately so for `SUPER_ADMIN`. No
  DB-level CHECK enforces "schoolId IS NULL ↔ role = SUPER_ADMIN". A
  misconfigured `STUDENT` with no schoolId would leak across tenants in any
  query that filters by `schoolId = req.user.schoolId`.
- No Postgres Row-Level Security. App-side `where: { schoolId }` is the only
  layer. **Documented as outstanding work; the IDOR findings below show this
  single layer is leaky.**
- **`AuditLog.actorId` is a hard FK to `User`.** If a user is hard-deleted
  (GDPR erase), all their audit log rows must be relocated or the FK breaks.
  Need to confirm the GDPR erasure path nulls or anonymises `actorId`.

---

## 4. Auth flow (actual)

```
1. POST /auth/login { email, password }
   → 200 { accessToken, user }
   → Set-Cookie: refreshToken=<JWT>; HttpOnly; SameSite=strict; Secure (prod)
   → Redis: rt:family:<userId>:<fid> = 1, TTL 7d

2. Client uses accessToken in Authorization: Bearer ... for ~15 min.

3. 401 → shared-frontend createApiClient queues all concurrent 401s, calls
   /auth/refresh once (single-flight), replays queue.            (✅ verified)

4. POST /auth/refresh (cookie OR body) → revoke fid in Redis, issue new fid +
   new tokens. Replay of revoked fid → 401.                     (✅ verified)

5. POST /auth/logout → revoke fid, clear cookie.

6. Magic-link auth: GET /security/join/:token → no auth required;
   single-use token → mints session.                            (verified, IP
   allowlist + OTP gate the higher security levels)
```

**Caveats vs documented architecture:**

- **Superadmin does not participate in this flow.** Inline `apiFetch` in
  `apps/superadmin/src/App.tsx:12-23` is a bare `fetch` with no refresh
  interceptor. A 15-min access-token expiry **immediately drops the user out**
  with no recovery beyond re-login. Token is in `localStorage` (line 137,
  141-142) — **XSS exposes the highest-privilege session.**
- **Refresh endpoint accepts the token in the request body as a fallback**
  (`auth.router.ts` — both cookie and `req.body.refreshToken`). This is a
  CSRF softening: legitimate clients should only ever use the cookie, and
  body fallback should be removed in Stage 1.
- **WebSocket auth duality.** Server (`apps/api/src/websocket/server.ts:46-56`):
  prefers `Sec-WebSocket-Protocol: bearer.<jwt>`, falls back to `?token=`.
  Student client (`ExamSessionPage.tsx:107`) only sends `?token=`. Net effect:
  **subprotocol auth path is unused; tokens travel in URL query strings**,
  which proxies and access logs commonly capture.

---

## 5. Routes / Screens / Features — inventory

### 5.1 API routes (24 modules, all mounted in `apps/api/src/app.ts`)

Total: ~95 endpoints. All are mounted under `/api/v1/*`. Two health endpoints
(`/health/live`, `/health/ready`) and Prometheus `/metrics` outside the API
prefix. (Inventory below is grouped; for the line-by-line list see commit
`107467b` and the per-router file under `apps/api/src/modules/*`.)

| Module | Status | Notes |
| --- | --- | --- |
| `auth` | ✅ working | 3 routes; rate limited (20/min). |
| `users` | ✅ working | RBAC enforced. |
| `schools` | ✅ working | classes CRUD scoped per school. |
| `questions` | ✅ working | cursor pagination (Cycle 4). |
| `exams` | ✅ working | builder + publish/assign/items reorder. |
| `sections` (inside exams) | ✅ working | sections + pools, random draw. |
| `sessions` | ✅ working | start, answer, violation, submit, unlock, exit; idempotency wired on the three POST writes. |
| `reports` | 🟥 **BROKEN — P0 IDOR** | `findUnique` with no `schoolId` filter, twice (`reports.router.ts:11`, `:96`). **Any teacher can read any school's results.** |
| `pins` | 🟧 partial | tenant check missing on `GET /pins/:examId`. |
| `proctors` | ✅ working | co-proctor CRUD. |
| `admin` | 🟧 partial | several admin overrides skip tenant check (`POST /admin/exams/:id/close`, `DELETE /admin/proctors/:examId/:teacherId`, class-membership routes). **`POST /admin/users/bulk-import` hashes at bcrypt cost 10 instead of 12.** Code has routes registered *after* `export default router;` (admin.router.ts:318+) — works at runtime, smells. |
| `audit` | ✅ working | read-only list. |
| `exports` | ✅ working | CSV with formula-injection escape (Cycle 3). |
| `grading` | ✅ working | manual grading of essay/short text. |
| `ai` | ✅ working | uses `lib/aiPrompt.ts` injection guard. **AI feedback path (`assessment.router.ts:314-387`) does NOT use the same guard** — student essay text becomes part of the model prompt. |
| `media` | 🟧 partial | multer 10 MB limit + MIME filter, **no tenant check on `:questionId`** (upload + delete). No virus scanning. |
| `student-results` | ✅ working | scoped by studentId. |
| `analytics` | ✅ working | per-exam, per-class, per-school. |
| `assessment` | 🟧 partial | tenant check missing on `GET /assessment/sessions/:id/certificate`; AI feedback unsafe (above). |
| `qti` | ✅ working | XML import + save. |
| `sen` | 🟧 partial | tenant check missing on multiple routes (`GET /sen/arrangements/:studentId` admin path; `DELETE /sen/arrangements/:studentId`; `GET /sen/sessions/:sessionId/rest-breaks`). |
| `security` | 🟧 partial | OTP/magic-link/fingerprint/IP allowlist all working. **`GET /security/sessions/:sessionId/device-alerts` missing tenant check.** **`console.log("[OTP] Code for ${email}: ${code}")` at `security.router.ts:599`** — fires whenever `SMTP_HOST` is unset, including any prod misconfig. |
| `superadmin` (`/platform/*`) | ✅ working server-side | but client portal is half-built (see 5.2). |
| `integrity` | ✅ working | timing + answer-pattern detection. **N+1 loop at `integrity.router.ts:38-46`** — sequential `await analyzeSession(...)` instead of `Promise.all`. |

### 5.2 Frontend portals

#### Student (`:5173`, 8 pages)
**Status: functional, but the ExamSessionPage is fragile and the lockdown story is weaker than advertised.**

| Route | Page | Notes |
| --- | --- | --- |
| `/login` | LoginPage (89 LOC) | ✅ |
| `/join/:token` | MagicLinkPage (120) | ✅ |
| `/` | ExamListPage (132) | ✅ |
| `/exam/:sessionId` | **ExamSessionPage (1104)** | 🟧 see below |
| `/submitted` | SubmittedPage (72) | ✅ |
| `/results` | ResultsListPage (173) | ✅ |
| `/results/:sessionId` | ReviewPage (244) | ✅ |
| `/results/:sessionId/certificate` | CertificatePage (120) | ✅ |

ExamSessionPage issues (verified by reading the file):
- Anti-cheat handlers are wired: `visibilitychange`, `fullscreenchange`,
  `contextmenu`, `keydown`, `copy`/`paste`/`cut`, `blur`, `dragstart`,
  `beforeprint` — consistent with the README.
- **Timer is client-authoritative** (line 79 / 88 / 191-198). A user with
  DevTools can pause `setInterval` or set `secondsLeft` to `999999`. There is
  no server-side check on submit that the elapsed wall-clock time is plausible
  (the `integrity` module's "timing too fast" finding catches the *fast*
  direction; not the slow direction).
- **Offline answer queue is in-memory** (`useState<any[]>([])` at line 47,
  flushed at line 176-186). The `lib/answerQueue.ts` IndexedDB module exists
  but **has no importers anywhere in the monorepo** (verified via grep). Tab
  close mid-exam = answers in the in-memory queue are lost.
- **WebSocket auth uses `?token=` query param** (line 107). Documented
  invariant (`Sec-WebSocket-Protocol: bearer.<jwt>`) is unused on the wire.
- 30 `as any` / `@ts-ignore` suppressions (mostly around the SEN payload).
- Decomposition primitives exist (`useExamWebSocket`, `useFocusTrap`,
  `useIdempotency`, `AriaLive`) but are **not used by ExamSessionPage** — the
  hooks are imported by other components or unused. This is the "ExamSessionPage
  decomposition pending" debt called out in the architecture doc.

#### Teacher (`:5174`, 18 pages)
**Status: complete, well-typed (~10 type suppressions across 18 pages).**

Pages: Login, Dashboard, QuestionBank, AIGenerator, QTIImport, ExamBuilder
(633 LOC), Sections, Results, Analytics, Blueprint, AnswerDistribution, Pins,
LiveProctor, Grading, Feedback, MagicLinks, StudentProgress, SharedExams.

#### Admin (`:5175`, 10 pages)
**Status: complete, 0 type suppressions.**

Pages: Login, Overview, Users, BulkImport, Classes, Monitor, Audit, SEN,
SchoolSettings, GDPR.

#### Superadmin (`:5176`, 6 pages)
**Status: 🟥 highest-privilege portal in the worst state of all four.**

- Routes work; page components (Overview, Schools, NewSchool, SchoolDetail,
  Migration) render. But:
- **No `@secureexam/shared-frontend` dep** — bypasses the whole single-flight
  refresh + memory-only token machinery the other three portals use.
- **Token in `localStorage`** (`App.tsx:137`).
- **No 401 refresh logic** — token expires after 15 min and the user is
  silently locked out until they re-login.
- **Hardcoded `http://localhost:4000/api/v1` fallback** (`App.tsx:10`) — if
  the build forgets `VITE_API_URL`, the production bundle calls localhost.
- **Inline styles, no Tailwind, no dark/light parity** with the rest of the
  product.
- **No `Dockerfile.superadmin`**, **no nginx vhost**, **CI doesn't build
  it**. In its current form **it cannot be deployed via the documented path**.
  Either it's a dev-only tool today (which is fine if we're explicit) or it's
  vapor — the docs imply the latter.

### 5.3 WebSocket (`apps/api/src/websocket/server.ts`)
- Server connects on `/ws`. Auth: prefers subprotocol `bearer.<jwt>`, falls
  back to `?token=` (verified line 46-56).
- Verifies access token via `verifyAccessToken` — **no algorithm pin** (see
  red flags).
- Heartbeat from client every 15 s; server tracks per-session connection.
- Server pushes `violation:recorded`, `session:locked`, `session:unlocked`,
  `session:force_submit`, `answer:saved`.
- Proctor side: stub events documented; teacher's LiveProctorPage subscribes
  but the pub/sub fan-out across multiple API replicas is not implemented
  (single-instance assumption baked in). **Will not scale horizontally** as
  written.

---

## 6. Integrations

| Integration | Where | State |
| --- | --- | --- |
| Anthropic Claude | `modules/ai/ai.router.ts`, `modules/analytics/assessment.router.ts` | ✅ used; question gen has prompt-injection guard, AI feedback does not. |
| AWS S3 | `lib/storage.ts`, `scripts/backup.sh` | ✅ presigned URLs for media + nightly backups. Optional (no S3 = local-only retention). |
| SMTP (nodemailer) | `modules/security/security.router.ts` | ✅ for OTP + magic-link emails. **Dev fallback `console.log`s the OTP code** — fires in any env without `SMTP_HOST`. |
| Postgres | Prisma 5 | ✅ |
| Redis | refresh-token families, OTP rate limit, idempotency cache | ✅ |
| Prometheus | `/metrics` | ✅ default node + custom counters (exams_started, violations, auth_failures, otp_attempts). No alerting wired. |
| Sentry / error tracking | — | ❌ none. Errors go to pino → stdout. |
| Product analytics | — | ❌ none. (Stage 6 task per your plan.) |

---

## 7. Deployment & ops

| Concern | State |
| --- | --- |
| `Dockerfile.api` | ✅ multi-stage, non-root `app` user, tini PID 1, `HEALTHCHECK /health/ready`. |
| `Dockerfile.{student,teacher,admin}` | 🟧 multi-stage, but use `npm install` not `npm ci` (lockfile not enforced). nginx-alpine runner; no explicit non-root user (alpine nginx defaults to `nginx`). |
| `Dockerfile.superadmin` | 🟥 **does not exist**. |
| `docker-compose.yml` (dev) | ✅ healthchecks on postgres/redis/api; ports bound to localhost only. |
| `docker-compose.prod.yml` | 🟧 **only postgres has a healthcheck**; api, redis, nginx do not. Redis runs without `requirepass` (internal-network only, but defence-in-depth missed). Restart policies set. |
| `nginx/nginx.conf` | 🟥 **HTTP-only**: 4 vhosts all `listen 80`, **zero `listen 443`**. HSTS header is configured but pointless without TLS. All hostnames are `*.yourschool.edu` placeholders. **No vhost for superadmin.** WebSocket reverse-proxied on port 80 → tokens (in `?token=`) travel **plaintext**. Rate-limit zones are correctly defined: `api_general 30r/s`, `api_auth 2r/s`, `api_ai 10r/min`. |
| CI (`.github/workflows/ci.yml`) | ✅ lint + format-check + typecheck + tests (with real Postgres service) + build + deploy. **Deploy uses long-lived SSH key** (`secrets.DEPLOY_SSH_KEY`) on `appleboy/ssh-action`. **No pre-deploy DB backup step.** **CI does not build superadmin** (only api/student/teacher/admin). |
| Pre-commit | ✅ husky + lint-staged enforce eslint --fix + prettier on staged TS/JS/JSON/MD/CSS. |
| `.gitignore` | ✅ `.env*`, `dump.rdb`, `node_modules`, `dist`. No committed `.env` files in tree (`find -name .env*` returns only `.env.production.example`). |
| `.env.production.example` | ✅ all required vars listed with explicit `CHANGE_ME_*` placeholders; SSH key explicitly noted as "in GitHub Secrets, not here". |
| Backups (`scripts/backup.sh`) | ✅ `set -euo pipefail`, gzip, optional S3 upload, 30-day local retention. |
| Restore (`scripts/restore.sh`) | ✅ requires `CONFIRM=yes` env. Uses `pg_restore --clean --if-exists`. |
| Migrations | Prisma migrate; two migrations to date. **Not auto-rolled-back** — RUNBOOK calls this out. |
| Branch protection | ❌ **not enforced via Actions config**. CI runs but does not gate PR merge. (Whether it's enforced via GitHub UI settings cannot be verified from the repo.) |
| Staging env | ❌ none. Plan calls for one in Stage 1. |

---

## 8. Red flags — prioritised

### P0 — must fix before ANY external user touches this build

| # | Finding | File / Line |
| --- | --- | --- |
| P0-1 | **Cross-tenant IDOR in reports**: `findUnique({ where: { id }})` without `schoolId`. Any authenticated teacher can read any school's full exam — every question, every student name + email, every answer, every violation. | `apps/api/src/modules/reports/reports.router.ts:11`, `:96` |
| P0-2 | **Cross-tenant bypass via admin overrides**: `POST /admin/exams/:id/close`, `DELETE /admin/proctors/:examId/:teacherId`, `POST /admin/classes/:id/members`, `DELETE /admin/classes/:id/members/:userId`. | `apps/api/src/modules/admin/admin.router.ts:296-315`, `:215-253` |
| P0-3 | **Cross-tenant bypass in media, sen, security, assessment, pins**: 6 more routes lack tenant scoping. Severity varies (PII leak, file write, certificate access). | `media.router.ts:25-72`, `sen.router.ts:36-46/89-92/180-186`, `security.router.ts:516-536`, `assessment.router.ts:407-410`, `pins.router.ts:91-97` |
| P0-4 | **Superadmin token in `localStorage`**, no refresh logic, hardcoded `localhost` API fallback. The highest-privilege role has the weakest auth surface. | `apps/superadmin/src/App.tsx:10,12-23,137-142` |
| P0-5 | **nginx is HTTP-only in production config.** Tokens (incl. WebSocket `?token=` query) travel plaintext. HSTS is set but useless without TLS. Domains are `*.yourschool.edu` placeholders. | `nginx/nginx.conf:29,77,125,157` |
| P0-6 | **OTP plaintext logged to console** when `SMTP_HOST` is unset — a misconfigured prod env leaks every OTP to stdout / log aggregator. | `apps/api/src/modules/security/security.router.ts:599` |

### P1 — fix in Stage 1

| # | Finding | File / Line |
| --- | --- | --- |
| P1-1 | **JWT verify lacks `algorithms` array.** Algorithm-confusion class. Should be `jwt.verify(t, secret, { algorithms: ['HS256'] })`. Also pin algorithm on `sign`. | `apps/api/src/lib/jwt.ts:21,25` |
| P1-2 | **WebSocket `?token=` fallback** is the only path the student client uses, despite docs claiming subprotocol is mandatory. Tokens captured by every proxy access log on the path. Either remove the fallback (and migrate the client) or accept the model and update the docs. | `apps/api/src/websocket/server.ts:55-56`; `apps/student/src/pages/ExamSessionPage.tsx:107` |
| P1-3 | **Client-authoritative exam timer.** Student can extend their exam with DevTools + the integrity module won't catch *slower* than expected. | `apps/student/src/pages/ExamSessionPage.tsx:79,88,191-198` |
| P1-4 | **Offline answer queue not wired.** `lib/answerQueue.ts` has zero importers. In-memory `pendingAnswers` is lost on tab close. | `apps/student/src/pages/ExamSessionPage.tsx:47,176-186` |
| P1-5 | **Bulk-import passwords hashed at bcrypt cost 10**, not 12. | `apps/api/src/modules/admin/admin.router.ts:161` |
| P1-6 | **AI feedback path lacks injection guard.** Student-supplied essay text becomes part of the LLM prompt. The question-generation route does have a guard (`lib/aiPrompt.ts`) — extend it. | `apps/api/src/modules/analytics/assessment.router.ts:314-387` |
| P1-7 | **Refresh-token body fallback** weakens CSRF posture. Cookie-only would be tighter. | `apps/api/src/modules/auth/auth.router.ts` |
| P1-8 | **No `Dockerfile.superadmin`; no superadmin nginx vhost; no CI build.** Superadmin is undeployable through the documented path. Decide: rebuild as a /console route, or finish the deploy story. | `docker/`, `nginx/nginx.conf`, `.github/workflows/ci.yml` |
| P1-9 | **Healthchecks missing on api / nginx / redis** in `docker-compose.prod.yml`. Failed boots go silent. | `docker-compose.prod.yml` |
| P1-10 | **No Sentry / error tracking.** Errors hit stdout only — can't see them post-deploy without log aggregator. | — |
| P1-11 | **No staging environment** matching prod. Today there is only "dev on laptop" and "prod via SSH." | — |
| P1-12 | **No CI branch protection in code.** PRs can in principle bypass the checks. | `.github/workflows/ci.yml` |
| P1-13 | **30 type suppressions in `ExamSessionPage`.** Bug-prone surface for the highest-stakes user journey. | `apps/student/src/pages/ExamSessionPage.tsx` |
| P1-14 | **Dev Dockerfiles use `npm install`, not `npm ci`.** Lockfile not enforced in builds. | `docker/Dockerfile.{student,teacher,admin}` |
| P1-15 | **`POST /pins/generate` and `/security/exams/:id/invites/generate` are not idempotent.** A retried request creates duplicate PINs / invites. | — |

### P2 — Stage 2/3 hygiene

- **N+1 query in integrity** (`integrity.router.ts:38-46`) — sequential
  `await analyzeSession(s.id)` should be `Promise.all`.
- **Bulk import** creates users one at a time; could be `prisma.user.createMany`.
- **`as any` debt** — eslint warns, but ~50 instances on the API side, ~30
  in the student app.
- **WebSocket pub/sub does not cross API replicas** — single-instance only.
- **No soft-delete strategy.** Hard deletes cascade.
- **Audit log coverage gaps** — helper exists; not every admin mutation
  records.
- **Postgres RLS not applied** — defence-in-depth gap; called out in the
  architecture doc.
- **Routes registered after `export default`** in `admin.router.ts:318+` —
  legal, but invites mistakes.
- **dangerouslySetInnerHTML in `RichText.tsx`** — input is LaTeX-parsed and
  HTML-escaped, so likely safe today, but the surface should be
  documented and locked down via CSP `script-src 'self'` (currently set) +
  `style-src` review.
- **Icon-only buttons in `ExamSessionPage`** lack `aria-label` (lines 726,
  747, 759, 779, 788, 797). Accessibility miss for screen-reader users.
- **No feature flags / kill switches** for AI, proctoring, lockdown — every
  feature is hard-on for every customer.

---

## 9. Doc-vs-reality gaps (process problem)

The codebase has shipped 11 cycles of changes without re-verifying earlier
invariants. **Five of the seven invariants in `ARCHITECTURE.md` are
partially or wholly false in current code.** Examples:

- "Tenant isolation … `findFirst({ where: { id, schoolId }})`, never
  `findUnique({ where: { id }})`" — 10+ violations, including in code
  shipped *after* Cycle 1's IDOR fix.
- "Tokens stay out of localStorage" — superadmin shipped in Cycle 9 with
  inline auth that puts the token in localStorage; never reconciled.
- "WebSocket auth via subprotocol header" — server has the path; client
  doesn't use it.
- "Server-authoritative timer" — client-authoritative.

This is the failure mode I'd push back hardest on for Stage 1. **Before any
of the new feature work in Stages 2+, we should adopt:**

1. A **single source-of-truth document** (this file, kept fresh) — the four
   existing docs need to be reconciled and trimmed.
2. **Invariant tests, not invariant prose.** Each architecture invariant
   becomes a test in `apps/api/test/` (cross-tenant suite already shows the
   pattern). If an invariant isn't testable, it isn't an invariant.
3. **Definition-of-done discipline:** every cycle's ending demo has to show
   the tests for prior invariants still passing — no green-field builds on a
   foundation we never re-verified.

---

## 10. What's working well — credit where due

- **Env-var enforcement at boot** (`lib/env.ts`) refuses to start with default,
  short, or missing `JWT_SECRET` / `JWT_REFRESH_SECRET`. Genuinely strong.
- **Refresh-token rotation in Redis** with family revocation — replay = 401.
- **Bcrypt costs 12** for passwords + PINs (single bulk-import bug aside).
- **`crypto.randomInt` / `crypto.randomBytes`** used everywhere a
  cryptographic random is needed — no `Math.random` for security tokens.
- **Idempotency middleware** correctly wired on the three session writes
  (answer / violation / submit).
- **Centralised error middleware** — no stack traces leak to clients in prod.
- **AI prompt injection guard** in `lib/aiPrompt.ts` is well-designed
  (`<SOURCE>` delimiter + regex sentinels for "ignore previous instructions"
  patterns).
- **CSV formula-injection escape** in exports.
- **Single-flight 401 refresh queue** in `shared-frontend/apiClient.ts` is
  textbook-correct.
- **Helmet CSP / HSTS / COOP / CORP** configured.
- **Prometheus metrics** with custom exam-domain counters (good signal for
  Stage 6 observability work).
- **Backup + restore scripts** are real, with safety guards.
- **Test suite** covers the right things: cross-tenant isolation, refresh
  rotation, OTP, idempotency, observability, AI prompt safety, CSV escape,
  DB constraints, health.

This is a real engineering codebase with real engineering practice. The gaps
above are the gap between "good engineering" and "production-grade for
high-stakes assessment in regulated environments."

---

## 11. Recommended Stage 1 order (handoff to Cycle 1.x)

When you sign off on this audit, I'd propose the following sequence for
Stage 1 (reorders the plan template slightly to put the worst bleeding first):

1. **Cycle 1.1a — Tenant isolation sweep + JWT alg pin + OTP log scrub**
   Fix all 10 IDOR routes. Add `algorithms: ['HS256']` to JWT verify/sign.
   Replace the OTP `console.log` with a dev-only pino debug. Add cross-tenant
   tests for every newly-fixed route. Add the architecture invariant test
   harness so this can't silently regress again.
2. **Cycle 1.1b — Superadmin auth migration + nginx HTTPS + WS auth model
   chosen.** Migrate `apps/superadmin` to `shared-frontend`; remove
   `localStorage` token; add `Dockerfile.superadmin` and an nginx vhost (or
   decide to retire the portal in favour of `/console`). Add HTTPS server
   blocks in nginx (Let's Encrypt cert paths from RUNBOOK). Pick: subprotocol
   only or query-only — and update both ends to match.
3. **Cycle 1.2 — Critical bugs + error handling + Sentry.** Wire Sentry,
   global error boundaries on each portal, retry-with-back-off on the
   front-end API client where missing.
4. **Cycle 1.3 — Database hardening (pick up the leftovers).** Soft-delete
   policy, audit-log coverage sweep, GDPR erase path correctness, FK on
   `actorId` reconsidered.
5. **Cycle 1.4 — Dev infra + branch protection + staging env + healthchecks**
   for api/nginx/redis. Switch `npm install` → `npm ci` in the SPA Dockerfiles.
   Get a staging env with seed data (not prod data) up.

End-of-Stage-1 chaos test (per your plan): kill DB, send bad input, hit rate
limits, try to access another role's data, drop the WebSocket mid-exam,
expire the access token mid-exam. Nothing crashes; nothing leaks. Then we go
to Stage 2 with a credible foundation.

---

## 12. Open questions for product discovery (Cycle 0.2)

These came up during the audit and you'll want answers before North Star:

1. **Who is the buyer / user?** Schools (K-12)? Universities? Bootcamps?
   The threat model and "premium internal tool" framing diverge sharply
   depending.
2. **What's the highest-stakes assessment we'll ever support?** GCSE / SAT
   class = different conversation from "weekly quiz." Drives whether SEB and
   live proctoring are roadmap items or not.
3. **What roles exist day-to-day?** SUPER_ADMIN is a platform-owner role —
   is that "us" (SecureExam staff) or the school's IT? If it's school IT,
   the superadmin portal becomes a customer surface and its current state
   is a serious commercial risk.
4. **Is `/console` consolidation (teacher + admin + superadmin) on or off
   the table?** Affects how much we invest in the existing portals.
5. **How many concurrent exams / students at peak?** WebSocket pub/sub is
   single-instance today; this becomes a hard ceiling if we need to scale
   horizontally.
6. **Any compliance regime in scope?** GDPR DPO fields are in the schema,
   but no SOC2, FERPA, ISO27001 controls live in the code/process. Drives
   audit log scope, retention, encryption-at-rest, vendor list.
7. **Internal tool vs customer product?** The plan template treats this as
   "premium internal tool." But SecureExam is a multi-tenant SaaS with
   external buyers. The "no SEO, no marketing site" framing fits, but the
   security bar is closer to "premium B2B SaaS" than "internal tool" —
   especially for a product with the word "Secure" in the name.

---

**End of audit. Pausing for review.**
