# SecureExam — 12-cycle hardening summary

What changed in this branch and why. Each cycle was its own commit so
you can review them independently.

## Cycle 0 — Foundation

**Commit:** `fe907af`

- Vitest + supertest in apps/api
- ESLint + Prettier + Husky + lint-staged
- CI now actually runs lint, format check, typecheck, and tests (was
  silently passing on `--if-present`)

## Cycle 1 — Cross-tenant IDOR + JWT defaults

**Commit:** `07be659` — _highest-priority security fix_

- Every `getById/update/delete` on tenant-scoped resources now filters
  by `schoolId` (returns 404, doesn't leak existence)
- API refuses to start if `JWT_SECRET` / `JWT_REFRESH_SECRET` is
  missing, default, or shorter than 32 chars
- `lib/authz.ts`, `lib/env.ts`
- Cross-tenant test suite

## Cycle 2 — Auth hardening

**Commit:** `0c808f8`

- `crypto.randomInt` for OTP (was `Math.random`)
- Refresh-token family rotation in Redis: replay of an old token = 401
- WS auth via `Sec-WebSocket-Protocol: bearer.<jwt>` (was URL query)
- Bcrypt cost 12 on PINs
- Per-session OTP attempt counter (10/15min, can't be reset by new OTP)
- Magic-link pre-auth → proper signed JWT (was hand-rolled HMAC)
- `cookie-parser` middleware

## Cycle 3 — Input validation + injection hardening + headers

**Commit:** `6e19dde`

- `validateBody` middleware
- `lib/aiPrompt.ts` — wraps user content in `<SOURCE>` delimiters,
  rejects "ignore previous instructions" patterns, strips control chars
- Helmet CSP, HSTS preload, COOP/CORP
- CORS strict origin function
- nginx rate-limit zones (api_general 30r/s, api_auth 2r/s, api_ai 10r/min)
- CSV formula-injection escape
- Centralised error middleware (no stack-trace leaks in prod)

## Cycle 4 — Database hardening

**Commit:** `c677cd4`

- New migration `1_indexes_and_constraints`
- FK indexes on all tenant-scoped tables (was sequential scans)
- CHECK constraints (passingScore 0-100, durationMinutes>0,
  securityLevel 1-3, etc.)
- Cursor-based pagination helper, applied to listQuestions

## Cycle 5 — Backend code quality

**Commit:** `cc405e2`

- `middleware/asyncHandler.ts` (rejected promises always reach error
  middleware)
- `middleware/idempotency.ts` (Redis-backed, 10min TTL, 2xx only)
- Wired into POST /sessions/:id/{answer,violation,submit}

## Cycle 6 — Observability

**Commit:** `ba350e7`

- pino with sensitive-field redaction
- Request-id middleware, X-Request-Id response header
- `/health/live` (process up) + `/health/ready` (DB ping)
- Prometheus `/metrics` with custom counters + http duration histogram
- `unhandledRejection` / `uncaughtException` handlers

## Cycle 7 — Shared frontend package

**Commit:** `0caed74`

- New `packages/shared-frontend` with `createApiClient` (single-flight
  401 refresh queue) + `createAuthStore` (memory-only, no localStorage)
- All four portals migrated; ~180 LOC of duplicated logic gone

## Cycle 8 — Student exam page hardening

**Commit:** `06fca4b`

- `useIdempotency` hook
- `lib/answerQueue.ts` (IndexedDB persistent queue)
- `useExamWebSocket` (exponential backoff, subprotocol auth)
- `useFocusTrap`
- `AriaLive` provider
- (ExamSessionPage decomposition into hooks remains as a follow-up;
  primitives are in place.)

## Cycle 9 — Server-side anti-cheat + threat model

**Commit:** `6cfa58a`

- `modules/integrity/` with `analyzeSession` detecting:
  - timing too fast (total <30% allowed),
  - per-question timing (3+ Qs <1s),
  - answer-pattern collusion (≥5 identical answers between sessions)
- Endpoints `/integrity/sessions/:id` and `/integrity/exams/:id`
- `docs/THREAT_MODEL.md` — bluntly states what we deter, detect, and
  cannot prevent. Includes recommended customer-contract language.

## Cycle 10 — Ops + deployment

**Commit:** `320070f` (+ `47b2dde` cleanup)

- Multi-stage `docker/Dockerfile.api`, non-root `app` user, tini PID 1,
  HEALTHCHECK on /health/ready
- `docker-compose.yml`: api healthcheck, redis healthcheck, JWT secrets
  required from env (no default)
- Vite manualChunks split for student/teacher/admin
- `scripts/backup.sh` + `scripts/restore.sh`
- `docs/RUNBOOK.md`

## Cycle 11 — Architecture & docs

**This commit**

- `docs/ARCHITECTURE.md` — current state in one document
- Phase docs moved to `docs/archive/`
- `docs/CHANGES.md` (this file)
- README rewritten as an entry-point pointing at the three primary docs

---

## Test counts

- Cycle 0: 4 passing (3 skipped pending later cycles)
- Cycle 1: 9 passing
- Cycle 2: 12
- Cycle 3: 22
- Cycle 4: 26
- Cycle 5: 29
- Cycle 6: 33
- Cycles 7-11: still 33 (the remaining work was structural primitives
  - docs; their tests come with the call sites that use them)

## What's left

Listed in the bottom of `docs/ARCHITECTURE.md`:

- Strict-TS sweep (eliminate ~50 `any`s)
- Audit-log coverage sweep
- ExamSessionPage decomposition (primitives are ready)
- Postgres RLS
- Safe Exam Browser integration
- Portal consolidation (teacher + admin + superadmin → /console)

These are tracked debt items, not blockers for shipping.
