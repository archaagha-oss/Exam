# SecureExam — Architecture

**Authoritative as of:** cycle 3.0c+3.0d (Stage 3 closure, 2026-05-10)
**Inputs:** [`docs/01-product.md`](01-product.md) · [`docs/02-north-star.md`](02-north-star.md) · [`docs/03-stage1-closure.md`](03-stage1-closure.md) · [`docs/04-stage2-prereqs-closure.md`](04-stage2-prereqs-closure.md) · [`docs/06-stage3-plan.md`](06-stage3-plan.md) · [`docs/07-stage3-closure.md`](07-stage3-closure.md) · [`docs/decisions.md`](decisions.md) · [`README.md`](../README.md)

This document describes what is true in the codebase **today**. Phase 1–9
history is archived in [`docs/archive/`](archive). When this doc and the
closure docs disagree, the closure docs win — they are the dated record of
what shipped in each cycle.

---

## 1. TL;DR

SecureExam is a **multi-tenant browser-based assessment platform for K-12
schools** in the UK, US, and EU. Three frontend SPAs (`apps/student`,
`apps/console`, `apps/platform`) front a single Node + Express + Prisma +
Postgres + Redis backend (`apps/api`). Four roles — `STUDENT`, `TEACHER`,
`SCHOOL_ADMIN`, `PLATFORM_ADMIN` — map to four hero workflows: student
exam-taking, teacher authoring, results review + grading, and school
onboarding ([`01-product.md`](01-product.md) §3). Compliance posture is the
full enterprise stack (GDPR + FERPA + COPPA + SOC 2 / ISO 27001).

The platform runs on Node 20, Postgres 15, Redis 7, behind nginx with TLS
1.2/1.3 + HSTS preload + OCSP stapling. Auth is JWT HS256-pinned, access
token in memory, refresh token in an httpOnly cookie, single-flight 401
refresh in `@secureexam/shared-frontend`. WebSocket auth uses the
`bearer.<jwt>` subprotocol header — the `?token=` query fallback was removed
in cycle 1.1b. Tenant isolation is enforced at the helper layer
(`apps/api/src/lib/examAccess.ts`) and pinned by a static-scan invariant
test that fails CI if a router reintroduces `findUnique`-by-URL-id outside
the platform-admin allowlist.

The single-replica deployment is the default. After Stage 3 (cycles 3.0a →
3.0d), the same code scales horizontally to ~5,000 concurrent students
(D7 Option 2) by setting `API_REPLICAS=N` and `WS_BROADCASTER=redis-pubsub`
— WS broadcasts fan out across replicas via a shared Redis `ws:broadcast`
channel with origin-uuid dedupe. Autosave is REST-authoritative
(cycle 3.0c) so durability does not depend on WS being the source of truth.

---

## 2. Roles

After cycle 2.0a (D1 — role split):

| Role             | Lives in            | Scope                                                   |
| ---------------- | ------------------- | ------------------------------------------------------- |
| `STUDENT`        | `apps/student`      | Own data only                                           |
| `TEACHER`        | `apps/console`      | Own + co-proctored exams within their `schoolId`        |
| `SCHOOL_ADMIN`   | `apps/console` (`/admin/*`) | Their school's data; `AdminRoute`-gated         |
| `PLATFORM_ADMIN` | `apps/platform`     | Vendor-side, **cross-tenant by design**, IP-allowlisted |

Tenant-scoping is centralised in `apps/api/src/lib/examAccess.ts`:

- `tenantScope(role, schoolId)` returns `{}` for `PLATFORM_ADMIN` and
  `{ schoolId }` for everyone else (with a `__NO_SCHOOL__` sentinel for
  the impossible case of a non-platform user with no school — denies by
  construction).
- `canManageExam(userId, role, schoolId, examId)` — owner teacher, school
  admin in same school, or platform admin. Co-proctors explicitly
  excluded from edit.
- `canProctorExam(userId, role, schoolId, examId)` — same set, plus
  invited co-proctors via `ExamProctor`.

Spread `tenantScope(...)` directly into Prisma `where` clauses; do not
hand-roll the schoolId filter at every call site. Pre-D1 names (`ADMIN`,
`SUPER_ADMIN`) are gone from the codebase; references in the audit and
earlier closure docs are explicitly marked as pre-decision state.

---

## 3. Apps and hostnames

After cycles 2.0b (D6 console merge) and 2.0c (apps/superadmin →
apps/platform rename):

```
apps/
├── api/        Express + Prisma + WS + Sentry shim          (port 4000)
├── student/    Student exam-taking SPA                      (port 5173)
├── console/    Customer console — TEACHER + SCHOOL_ADMIN    (port 5174)
└── platform/   Vendor Platform Admin — PLATFORM_ADMIN only  (port 5176)
```

Production hostnames (nginx, all on 443 with TLS + HSTS preload + OCSP
stapling — cycle 1.1b / P0-5):

| Hostname                       | Vhost serves       | Audience            |
| ------------------------------ | ------------------ | ------------------- |
| `exam.yourschool.edu`          | `apps/student`     | STUDENT             |
| `console.yourschool.edu`       | `apps/console`     | TEACHER + SCHOOL_ADMIN (+ PLATFORM_ADMIN on impersonation) |
| `api.yourschool.edu`           | `apps/api`         | All authenticated clients |
| `platform.secureexam.app`      | `apps/platform`    | PLATFORM_ADMIN only — vendor-only subdomain, stricter `platform_admin` rate-limit zone, IP allowlist expected at the upstream proxy |

Build matrix is 4 images (`docker/Dockerfile.{api,student,console,platform}`),
4 vhosts, 1 nginx config. Pre-2.0b there were 5 apps + 5 vhosts; the
collapse was D6.

---

## 4. Auth flow

```
1. POST /api/v1/auth/login { email, password }
   → 200 { accessToken, user }
   → Set-Cookie: refreshToken=<JWT>; HttpOnly; Secure (prod); SameSite=strict
   → Redis: rt:family:<userId>:<fid> = 1, TTL 7d

2. Client uses accessToken in Authorization: Bearer <token> for ~15 min.
   Token lives in memory (Zustand, no persist). Never in localStorage —
   the cycle 1.1b superadmin migration (P0-4) closed the last violation.

3. 401 → @secureexam/shared-frontend createApiClient queues all concurrent
   401s, calls /auth/refresh ONCE (single-flight), replays the queue with
   the new access token.

4. POST /api/v1/auth/refresh (cookie-only — body fallback removed in
   cycle 1.3 / P1-7)
   → validate fid against Redis, revoke fid, issue new fid + new tokens
   → returns { accessToken, user } so silent-refresh-on-mount has the
     user payload (cycle 2.0a fix to the cycle 1.1b regression)
   → 401 if fid was already revoked (replay attack)

5. POST /api/v1/auth/logout → revoke fid, clear cookie.
```

JWT discipline (cycle 1.1a / P1-1):

- Sign: `algorithm: 'HS256'`
- Verify: `algorithms: ['HS256']` — explicit allowlist; `alg: none` and
  algorithm-confusion attacks return 401
- Pinned by `apps/api/test/jwtAlg.test.ts`

WebSocket auth (cycle 1.1b / P1-2):

```js
new WebSocket(
  `wss://exam.yourschool.edu/ws?sessionId=${id}&examId=${eid}`,
  [`bearer.${accessToken}`]      // Sec-WebSocket-Protocol header
)
```

The `?token=` query fallback was removed server-side and both clients
(`apps/student/src/pages/ExamSessionPage.tsx`,
`apps/console/src/hooks/useProctor.ts`) migrated. Tokens never travel
through proxy access logs.

---

## 5. Data model overview

Full schema: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma).
Migrations under `apps/api/prisma/migrations/`. Grouped by purpose:

### 5.1 Identity + tenant

- **`School`** — tenant root. Branding, GDPR DPO fields, `dataRegion`,
  policy defaults.
- **`User`** — `STUDENT | TEACHER | SCHOOL_ADMIN | PLATFORM_ADMIN`.
  `schoolId` is non-null for the first three; null only for
  PLATFORM_ADMIN. The runtime constraint is enforced at the application
  layer; a SQL `CHECK` for role↔schoolId pairing is deferred (Stage 2
  prereqs closure §4).
- **`Class`**, **`ClassStudent`**, **`ClassTeacher`** — many-to-many
  membership. **`ExamAssignment`** — exams ↔ classes.

### 5.2 Authoring

- **`Question`** — typed: `MCQ | MCQ_MULTI | TRUE_FALSE | SHORT_TEXT | ESSAY | NUMERIC | CODE`.
  Tags, difficulty, scoring mode (`binary | partial | negative`).
- **`Exam`** — `status: DRAFT | PUBLISHED | ACTIVE | CLOSED | ARCHIVED`,
  `securityLevel 1/2/3` (Tier 1 honour, Tier 2 best-effort lockdown,
  Tier 3 SEB sit-down). IP allowlist, time window, defaults per school.
- **`ExamItem`**, **`ExamSection`**, **`ExamPool`** — sectioned exams +
  random-draw pools by tag/difficulty/type.
- **`ExamProctor`** — co-proctor invites.
- **`ExamPin`** — bcrypt-hashed UNLOCK + EXIT PINs (cost 12).
- **`ExamInvite`** — single-use magic-link tokens.

### 5.3 Sessions + answers

- **`ExamSession`** — unique `(examId, studentId)`. Tracks elapsed time,
  current state, timestamps for the server-authoritative timer.
- **`StudentAnswer`** — unique `(sessionId, questionId)`.
- **`Violation`** — `TAB_SWITCH | FULLSCREEN_EXIT | … | MANUAL_FLAG`.
- **`RestBreakLog`** — SEN extra-time / rest-break audit.
- **`ExamOtp`** — 10-attempt cap per session, hashed.
- **`DeviceAlert`** — `NEW_DEVICE | LOCATION_CHANGE | FINGERPRINT_MISMATCH`.
- **`SessionFeedback`** — teacher text + AI-suggested remediation
  (D4-gated).
- **`ExamCertificate`** — issued on pass.
- **`StudentAccessArrangement`** — SEN: extra time, TTS, rest breaks,
  scribe mode.

### 5.4 Audit

- **`AuditLog`** — `actorId`, `action`, `targetType`, `targetId`, `meta`,
  plus the cycle 2.0f columns: `actorRole`, `actorSchoolId`,
  `targetSchoolId`, `impersonation` (boolean, auto-computed by
  `auditFromReq`). `AuditAction` enum extended in cycle 2.0e with
  `FEATURE_ENABLED` / `FEATURE_DISABLED`.

### 5.5 Feature flags (cycle 2.0e / D4)

- **`Feature`** — vendor-managed catalogue: `key`, `name`, `description`,
  `defaultEnabled`. Three rows seeded today: `ai-authoring` (active),
  `live-proctoring` (placeholder for a future cycle), `seb-tier-3`
  (placeholder for Stage 5).
- **`SchoolFeature`** — per-tenant toggle: `(schoolId, featureKey)` with
  `enabled`, `enabledById`, `enabledAt`, `disabledAt` for the audit
  trail.

---

## 6. Multi-tenant invariants

This is the rule the audit found violated 10 times and Stage 1 closed:

> Every privileged route filters by `schoolId` via `tenantScope(...)` in
> the Prisma `where` clause, or via `canManageExam` / `canProctorExam`
> which require schoolId. PLATFORM_ADMIN is the only role that legitimately
> escapes this filter, and its cross-tenant actions are audit-logged with
> `impersonation=true`.

Operationally:

- **Pattern, not ad-hoc.** New routes use
  `prisma.exam.findFirst({ where: { id, ...tenantScope(req.user.role, req.user.schoolId) } })`
  — never `findUnique({ where: { id } })`.
- **Pinned by static scan.**
  [`apps/api/test/tenantInvariant.test.ts`](../apps/api/test/tenantInvariant.test.ts)
  greps every router file under `src/modules/` and fails CI if it sees
  `findUnique({ where: { id: req.params.<x> } })` outside the
  PLATFORM_ADMIN allowlist (`platform.router.ts`). Adding a file to the
  allowlist is a code-review event, not an env flag.
- **Pinned by regression suite.** `apps/api/test/crossTenant.test.ts`
  carries 14 negative cases — for every IDOR fixed in cycle 1.1a, there
  is a test that re-fails the day someone reintroduces it.
- **Cross-tenant impersonation is auditable.** Every
  `auditFromReq(req, action, ...)` call in a route a PLATFORM_ADMIN can
  reach populates `actorRole`, `actorSchoolId`, `targetSchoolId`, and
  computes `impersonation = (actorRole === 'PLATFORM_ADMIN' && targetSchoolId != null)`.
  The compliance ledger query is `getImpersonationEvents()` in
  `apps/api/src/lib/auditQuery.ts` (cycle 2.0f).

---

## 7. Hot-path correctness

The student exam-taking surface is the hot path
([`02-north-star.md`](02-north-star.md) §7.10 — "don't run experiments
on student exam-taking"). Three correctness invariants pinned in code:

### 7.1 Server-authoritative timer (cycle 1.2 / P1-3)

- WS heartbeat reply (`pong`) carries canonical `secondsRemaining`
  computed by `computeSecondsRemaining()` server-side from
  `ExamSession.startedAt` + `Exam.durationMinutes` + SEN extra-time.
- Client interpolates 1s ticks between heartbeats for smooth UI.
- Client snaps to server value when drift > 3 s.
- When the server says 0, client auto-submits regardless of local state.
- DevTools tampering with `setInterval` does not extend the exam.

### 7.2 Persistent answer queue (cycle 1.2 / P1-4)

- `apps/student/src/lib/answerQueue.ts` is IndexedDB-backed.
- Every save: enqueue to IDB → POST with `Idempotency-Key` → on success
  remove from queue → on failure leave in queue.
- `dedupeKey` keeps exactly one queued entry per question; the
  Idempotency-Key rotates per save attempt so server-side dedupe doesn't
  confuse a fresh write with a replay.
- Queue drains on mount and on reconnect. Tab close mid-exam does not
  lose answers.

### 7.3 REST autosave authoritative (cycle 3.0c)

- `POST /api/v1/sessions/:id/answer` is the **only** durability path.
- The WS `session:answer` handler is now a no-op stub kept for one
  release for backwards-compat with stale clients (cleanup in cycle 4.x).
- The REST handler triggers a `proctor:update` snapshot via
  `setImmediate` so proctor view stays live without depending on the WS
  write path. In a multi-replica deploy, that snapshot publishes to
  Redis and reaches the proctor on whichever replica they're connected
  to (§8 below).
- Idempotency-Key middleware caches the 2xx response in Redis for 10 min
  so retries don't double-write. Pinned by
  [`apps/api/test/idempotency.test.ts`](../apps/api/test/idempotency.test.ts).

---

## 8. Scale architecture (post-Stage-3)

Default deploy is single-replica. The same code scales to D7 Option 2's
~5,000 concurrent students by flipping two env vars.

### 8.1 Single-replica (default)

```
                                           ┌────────────┐
   nginx ────► apps/api (1 instance) ─────►│ Postgres   │
   (TLS, vhosts)         ▲                 └────────────┘
                         │
                         ├── ws:/ws (in-process Map of clients)
                         └────────► Redis (refresh tokens, OTP rate-limit,
                                           idempotency, feature-flag cache)
```

`WS_BROADCASTER=in-process` (default). `WsBroadcaster` factory in
`apps/api/src/lib/wsBroadcast.ts` picks the in-process implementation;
the existing `proctorRooms` and `sessionClients` Maps stay local.

### 8.2 Multi-replica (D7 Option 2)

```
                  ┌── api replica 1 ──┐
                  │  ↑ ↓ pub/sub      │
   nginx ────────►├── api replica 2 ──┼──── postgres (pool sized via env)
   (round-robin)  │                   │
                  └── api replica N ──┘
                          ↕
                   redis ws:broadcast channel
                       (all replicas
                        sub + pub, origin-uuid dedupe)
```

Set:

```
API_REPLICAS=N
WS_BROADCASTER=redis-pubsub
PRISMA_CONNECTION_LIMIT=<max_connections / N>
```

What changes:

- **WS broadcasts fan out via Redis.** `RedisPubSubBroadcaster`
  (cycle 3.0b) subscribes every replica to the shared `ws:broadcast`
  channel. A broadcast on replica A reaches sockets on replica B.
  Origin-uuid dedupe prevents loop-back.
- **Membership stays local.** Each replica's `proctorRooms` /
  `sessionClients` maps track only its own connected sockets.
  "Broadcast to all proctors of exam X" is publish-to-Redis; "list of
  currently-connected proctors" would need a cross-replica view (not a
  current requirement).
- **No sticky sessions required.** nginx default round-robin is fine
  because session state lives in Postgres + Redis, and autosave is REST
  (cycle 3.0c). Reconnect cost is "re-establish WS connection-of-mind,"
  no answer loss.
- **Postgres pool sized per replica.** `apps/api/src/lib/prisma.ts`
  reads from `PRISMA_CONNECTION_LIMIT` so the cluster doesn't blow
  Postgres' connection cap.

The factory swap is one file
([`apps/api/src/lib/wsBroadcast.ts`](../apps/api/src/lib/wsBroadcast.ts));
zero call-site changes between modes.

### 8.3 What is explicitly out of scope

Per D7 Option 2 — these are post-50k-concurrent territory:

- Postgres read replicas (revisit if §3.2 of the closure shows write
  saturation before 5k)
- Geo-shards / regional deployments
- Queue-backed autosave
- Per-channel pub/sub (`ws:exam:${examId}` instead of one shared
  `ws:broadcast`) — deferred until peak-day numbers warrant it

See [`docs/07-stage3-closure.md`](07-stage3-closure.md) §3 for the
load-test scenarios and §4 for the multi-replica chaos-test cases.

---

## 9. Compliance posture

Per [`01-product.md`](01-product.md) §5 — full enterprise stack from
day one. Translation into code/process:

| Regime | Enforced by |
| --- | --- |
| **GDPR / UK-GDPR + DPA 2018** | DPO fields on `School`; `dataRegion` for region-pinning; right-to-erase via `apps/console/src/pages/admin/GDPRPage.tsx`; subprocessor list maintained out-of-band; breach-notification process in `RUNBOOK.md`. |
| **FERPA (US K-12)** | Tenant-scoping treats student records as the school's data, not ours. Role + relationship gates on `/reports/*` and `/student-results/*`. School can export everything via the admin GDPR page. |
| **COPPA (US under-13)** | AI feature flag (D4) defaults off; the `ai-authoring` toggle is per-school and audit-logged. AI routes 403 when off (`feature_disabled`). No third-party tracking, no marketing pixels in any SPA. |
| **SOC 2 / ISO 27001** | Audit-log discipline — every privileged mutation writes an `AuditLog` row via `audit()` or `auditFromReq()`. `getImpersonationEvents()` answers "every cross-tenant action by vendor staff in the last N days" in one query. JWT HS256-pinned, refresh-token rotation in Redis, env-var enforcement at boot, `Dockerfile.api` runs non-root with tini PID 1, helmet + CSP + HSTS in nginx. |

The principle is **auditability-by-default, not bolt-on**: every state
mutation that crosses a trust boundary writes an `AuditLog` row, and we
accept the storage cost ([`01-product.md`](01-product.md) §5).

The per-school AI flag (D4) is not just a UX gate — it is the COPPA-safe
default for under-13 cohorts: when off, **zero AI calls server-side, zero
AI UI client-side**, even for PLATFORM_ADMIN-impersonated sessions on
that school. Pinned by
[`apps/api/test/featureFlags.test.ts`](../apps/api/test/featureFlags.test.ts).

---

## 10. The five architecture invariants pinned in tests

Per [`apps/api/README.md`](../apps/api/README.md) and
[`02-north-star.md`](02-north-star.md) §7.1 — "if an invariant isn't
testable, it isn't an invariant":

| # | Invariant | Pinned by |
| - | --- | --- |
| 1 | **Every privileged route filters by `schoolId`.** New routes that mutate by id use `findFirst` + `tenantScope`; static scan rejects `findUnique`-by-URL-id outside the platform-admin allowlist. | [`apps/api/test/tenantInvariant.test.ts`](../apps/api/test/tenantInvariant.test.ts) |
| 2 | **JWT verify is HS256-only.** No algorithm-confusion, no `alg: none`. | [`apps/api/test/jwtAlg.test.ts`](../apps/api/test/jwtAlg.test.ts) |
| 3 | **Refresh token only travels via httpOnly cookie.** Body-only refresh requests return 401. | [`apps/api/test/refresh.test.ts`](../apps/api/test/refresh.test.ts) — "rejects body-only refresh" case |
| 4 | **PLATFORM_ADMIN cross-tenant actions are flagged in `audit_logs`.** `actorRole` / `actorSchoolId` / `targetSchoolId` populated; `impersonation=true` when actor crosses tenant. | [`apps/api/test/auditImpersonation.test.ts`](../apps/api/test/auditImpersonation.test.ts) |
| 5 | **AI routes 403 when the per-school flag is off.** PLATFORM_ADMIN bypasses for support; their bypass is audit-logged. | [`apps/api/test/featureFlags.test.ts`](../apps/api/test/featureFlags.test.ts) |

These five tests are the architectural contract. CI is the enforcement
mechanism. A change that breaks any of them does not merge.

Other notable test files (full list:
[`apps/api/README.md`](../apps/api/README.md#tests)):
`crossTenant.test.ts` (14 negative cross-tenant regressions),
`bulkImport.test.ts`, `aiPrompt.test.ts`, `idempotency.test.ts`,
`dbConstraints.test.ts`, `otp.test.ts`, `boot.test.ts`,
`observability.test.ts`, `csv.test.ts`.

---

## 11. Cross-references

### Backward (history of how we got here)

- [`docs/00-audit.md`](00-audit.md) — Stage 0 cycle 0.1 — the original
  audit; 5 of 7 invariants in the pre-Stage-1 ARCHITECTURE.md were
  partially or wholly false. This doc is the rewrite.
- [`docs/01-product.md`](01-product.md) — Stage 0 cycle 0.2 — product
  brief; K-12, four roles, four hero workflows, full enterprise
  compliance.
- [`docs/02-north-star.md`](02-north-star.md) — Stage 0 cycle 0.3 —
  12-month vision + anti-patterns. §7.1 (don't ship features faster
  than you fix invariants), §7.2 (don't put "Secure" in copy without
  code), §7.10 (don't experiment on student-take) are the rules this
  architecture earns.
- [`docs/03-stage1-closure.md`](03-stage1-closure.md) — Stage 1
  closure — P0/P1 audit findings → resolution map.
- [`docs/04-stage2-prereqs-closure.md`](04-stage2-prereqs-closure.md) —
  Stage 2 prereqs — D1 role split (cycle 2.0a), D6 console merge (2.0b),
  apps/platform rename (2.0c), D4 feature flags (2.0e), impersonation
  audit (2.0f).
- [`docs/06-stage3-plan.md`](06-stage3-plan.md) +
  [`docs/07-stage3-closure.md`](07-stage3-closure.md) — Stage 3 —
  multi-replica + Redis pub/sub WS fan-out + REST autosave
  authoritative.

### Sideways (parallel current-state docs)

- [`README.md`](../README.md) — top-level quick-start + API reference + WS
  protocol. The front-matter source of truth (rewritten cycle 2.1b).
- [`apps/api/README.md`](../apps/api/README.md) — backend layout + the
  five invariants list.
- [`apps/student/README.md`](../apps/student/README.md) — anti-cheat
  surface + hot-path correctness.
- [`apps/console/README.md`](../apps/console/README.md) — role-aware
  routing + the two surfaces in one app.
- [`apps/platform/README.md`](../apps/platform/README.md) — vendor-only
  posture + impersonation audit columns.
- [`docs/decisions.md`](decisions.md) — ADR log. Decided: D1, D2, D4, D6,
  D7. Open: D3 (two-mode design system, Stage 4), D5 (Canvas/Moodle/
  Schoology v1, awaiting product input).
- [`docs/05-manual-testing.md`](05-manual-testing.md) — end-to-end
  walkthroughs: chaos test, hot-path durability, compliance smoke.

### Forward

- Stage 2 hero cycles (2.1+) — the four hero workflows on the post-D1 /
  post-D6 architecture.
- Stage 4 — D3 two-mode design system (Notion-warm + focus mode).
- Stage 5 — high-stakes integrations: SEB on Windows, Microsoft Entra
  SSO + SCIM, LTI 1.3 grade passback.
- Stage 6 — compliance evidence: SOC 2 prep, ISO 27001 mapping, DPIA +
  ROPA, audit-log coverage at 100%.
- Stage 7 — operations & SLAs: public status page, observability
  dashboards, SLOs matching the wedge claims.

---

**End of architecture doc. Authoritative as of cycle 3.0c+3.0d.**
