# SecureExam — Architecture

The current state, in one document. Phase docs (history of how each
feature evolved) live in `docs/archive/`.

## System overview

```
                 ┌────────────┐  ┌────────────┐  ┌────────────┐
                 │  Student   │  │  Teacher   │  │   Admin    │  …
                 │  :5173     │  │  :5174     │  │  :5175     │
                 └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
                       │ HTTPS+CSP/HSTS│              │
                       └───────┬───────┴──────────────┘
                               │ /api/* /ws
                       ┌───────▼────────┐
                       │     nginx      │ rate-limit (auth/ai/general)
                       └───────┬────────┘
                               │
                       ┌───────▼────────┐
                       │  API (Express) │ :4000
                       │  - 80+ routes  │ helmet · cookies · zod
                       │  - WebSocket   │ Sec-WebSocket-Protocol auth
                       │  - /metrics    │ pino logs · request-id
                       └─┬───────┬──────┘
                         │       │
                ┌────────▼─┐  ┌──▼───────┐
                │ Postgres │  │  Redis   │
                │ + Prisma │  │ refresh  │
                │  + RLS*  │  │ + OTP    │
                └──────────┘  │ + idemp. │
                              └──────────┘
```

\* Postgres RLS is the recommended next step (see "Multi-tenancy" below).

## Repo layout

```
apps/
  api/         Express + Prisma. Modules under src/modules/<domain>/.
               Lib helpers under src/lib/. Middleware under src/middleware/.
  student/     Lockdown exam UI (port 5173)
  teacher/     Authoring + proctoring (port 5174)
  admin/       School admin (port 5175)
  superadmin/  Platform owner (port 5176)
packages/
  shared-types/    Plain TS types shared across apps
  shared-frontend/ axios client + zustand auth store + refresh queue
docs/
  ARCHITECTURE.md   (this file)
  RUNBOOK.md        operator playbook
  THREAT_MODEL.md   honest defense-in-depth assessment
  archive/          phase 1-9 history
nginx/         reverse-proxy config
docker/        per-service Dockerfiles
scripts/       backup.sh, restore.sh, tenant migration
```

## Key invariants

These are the rules every change must respect.

1. **Tenant isolation.** Every read or write of a tenant-scoped resource
   filters by `schoolId`. The pattern is `findFirst({ where: { id, schoolId } })`,
   never `findUnique({ where: { id } })`. See `src/lib/authz.ts` for
   shared helpers and `test/crossTenant.test.ts` for the regression
   suite.

2. **No default secrets in production.** `src/lib/env.ts` refuses to
   start the API if `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing,
   shorter than 32 chars, or matches a known dev default. CI passes
   real secrets via env.

3. **Refresh-token rotation.** Every `/auth/refresh` revokes the
   presented family-id and issues a new one in Redis (`rt:family:*`).
   Replay of an old refresh token returns 401. Logout deletes the family.

4. **Tokens stay out of localStorage.** Access tokens are in memory
   (zustand without persist); refresh tokens are in the httpOnly
   `refreshToken` cookie set by the API.

5. **WebSocket auth via subprotocol header.** Clients send
   `Sec-WebSocket-Protocol: bearer.<jwt>` rather than `?token=`.

6. **Idempotency on session writes.** Clients send `Idempotency-Key`
   on `POST /sessions/:id/answer`, `/violation`, `/submit`. The server
   caches the 2xx response in Redis for 10 minutes so retries don't
   double-write.

7. **Server-side integrity > browser lockdown.** See
   `docs/THREAT_MODEL.md`. The browser lockdown is a deterrent. The
   real defenses are timing analysis, answer-pattern detection, IP
   allowlist, OTP, and (future) Safe Exam Browser integration.

## Data model

24 Prisma models in `apps/api/prisma/schema.prisma`. Highlights:

- **Tenant root:** `School`. Branding, policy defaults, defaults
  applied to new exams.
- **Identity:** `User` with `schoolId` (nullable for SUPER_ADMIN).
  Roles: STUDENT, TEACHER, ADMIN, SUPER_ADMIN.
- **Exam authoring:** `Exam` → `ExamItem` (with optional `ExamSection`
  / `ExamPool` for randomised draws) → `Question`.
- **Exam taking:** `ExamSession` per (examId, studentId), with
  `StudentAnswer`, `Violation`, `RestBreakLog`, `ExamOtp`, `DeviceAlert`.
- **SEN:** `StudentAccessArrangement` (extra time, TTS, rest breaks).
- **Magic link auth:** `ExamInvite` with single-use tokens.
- **Audit:** `AuditLog` with `AuditAction` enum.

Indexes added in `0_init` plus `1_indexes_and_constraints`:

- `(schoolId)` on every tenant-scoped table
- `(schoolId, status)` on exams, `(examId, status)` on sessions
- CHECK constraints on percentage/duration/score ranges

## Multi-tenancy

Today: **shared database, every query filtered by `schoolId`.** This
is operationally cheap and works up to ~50 customers.

Schema-per-tenant tooling exists (`scripts/migrate-tenant.ts`) for
when you need stronger isolation. **Recommended intermediate step:**
add Postgres Row-Level Security policies that bind connections to a
school context. Defense in depth — a missed `where: { schoolId }` in
app code can no longer leak data.

```sql
-- example RLS policy (NOT yet applied)
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
CREATE POLICY exams_tenant_isolation ON exams
  USING (schoolId = current_setting('app.school_id')::uuid);
```

## Auth flow

```
1. POST /auth/login {email, password}
   → 200 {accessToken, user}
   + Set-Cookie: refreshToken=<jwt>; httpOnly; secure; sameSite=strict
   + Redis: rt:family:<userId>:<fid> = 1 (TTL 7d)

2. Client uses accessToken in Authorization: Bearer header for ~15min

3. accessToken expires → 401
   → shared-frontend's createApiClient queues all concurrent 401s,
     calls /auth/refresh ONCE, replays the queue with the new token

4. POST /auth/refresh (cookie)
   → validate fid against Redis, revoke fid, issue new fid + new tokens
   → 401 if fid was already revoked (replay attack)

5. POST /auth/logout
   → revoke fid, clear cookie
```

## Observability

- **Logs:** pino, JSON in prod, pretty in dev. Sensitive fields
  redacted. Every log entry carries `requestId` set by
  `middleware/requestId.ts`.
- **Metrics:** Prometheus at `/metrics`. Default Node metrics + custom
  counters (exams_started, violations, auth_failures, otp_attempts) +
  http_request_duration_seconds histogram.
- **Health:** `/health/live` (process up) and `/health/ready` (DB ping).
  Docker healthchecks use `/health/ready`.

## CI/CD

`.github/workflows/ci.yml`:

1. Lint: ESLint + Prettier
2. Typecheck: `tsc --noEmit`
3. Test: Vitest with a real Postgres service, ~33 tests across health,
   auth, cross-tenant isolation, refresh rotation, OTP entropy, AI
   prompt safety, CSV escape, DB constraints, idempotency,
   observability.
4. Build: multi-stage Docker images (non-root user)
5. Deploy: SSH to host, `docker compose up`

## Outstanding work

These are tracked debt items, not blockers.

- **Strict TS sweep.** `tsconfig.json` has `strict: true` but the
  modules retain ~50 `any`s. ESLint warns on new ones. Mechanical
  cleanup PR.
- **Audit-log coverage sweep.** Helper exists at
  `src/lib/examAccess.audit`; not every admin mutation calls it yet.
- **ExamSessionPage decomposition.** The 1,100-LOC component has
  hooks and primitives waiting for it (cycle 8); the actual split
  into `useExamTimer` / `useViolationReporter` / `useAnswerQueue` etc
  is mechanical and the next student PR.
- **Postgres RLS.** Defence-in-depth on top of app-side schoolId.
- **Safe Exam Browser integration.** The path to "real" lockdown for
  high-stakes customers (see `THREAT_MODEL.md`).
- **Portal consolidation.** Teacher + admin + superadmin overlap by
  ~70%. A single `/console` portal with role-based routes would cut a
  lot of duplication. Student stays separate.
