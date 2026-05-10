# Stage 1 — Closure

**Date:** 2026-05-10
**Branch:** `claude/stage-1-security-stability`
**Inputs:** `docs/00-audit.md` (the diagnosis), `docs/01-product.md`, `docs/02-north-star.md`
**Status:** P0 backlog closed; P1 mostly closed; chaos-test ready to run

---

## 0. What this stage was for

Per the audit's Stage 1 ordering (`docs/00-audit.md` §11) and the North Star
anti-pattern "don't ship features faster than you fix invariants" (`02-north-
star.md` §7.1), Stage 1's job was to close the doc-vs-code gap that the audit
surfaced and stop the security bleed before any Stage 2+ feature work.

Four cycles shipped on `claude/stage-1-security-stability`:

| Commit | Cycle | Focus |
| --- | --- | --- |
| `02c5650` | **1.1a** | Tenant isolation sweep + JWT alg pin + OTP scrub |
| `e381c2f` | **1.1b** | Superadmin hardening + nginx HTTPS + WS auth model |
| `a0b1bdb` | **1.2** | Server-authoritative timer + IndexedDB autosave |
| `a1fc8b2` | **1.3** | Auth tightening + AI feedback guard + idempotent generators |

---

## 1. Audit findings → resolution map

### P0 (must-fix before any external user)

| ID | Finding | Cycle | Outcome |
| --- | --- | --- | --- |
| **P0-1** | Cross-tenant IDOR in `reports/*` | 1.1a | `findFirst` + `tenantScope` on both routes; regression tests |
| **P0-2** | Cross-tenant bypass via admin overrides (4 routes) | 1.1a | Pre-check `exam.schoolId` / `class.schoolId` before mutate; regression tests |
| **P0-3** | Cross-tenant bypass in media / sen / security / assessment / pins (6 routes) | 1.1a | Tenant-scoped lookups across all six; regression tests |
| **P0-4** | Superadmin token in `localStorage` | 1.1b | Migrated to `@secureexam/shared-frontend`. Memory-only token, httpOnly refresh cookie, single-flight 401 refresh |
| **P0-5** | nginx HTTP-only in production | 1.1b | All vhosts on 443 with TLS 1.2/1.3 + HSTS preload + OCSP stapling; port-80 redirect |
| **P0-6** | OTP plaintext logged to console | 1.1a | `console.log` removed; structured `logger.debug` only when `OTP_DEV_LOG=1` and not prod |

### P1 (Stage 1)

| ID | Finding | Cycle | Outcome |
| --- | --- | --- | --- |
| **P1-1** | JWT verify lacks `algorithms` array | 1.1a | `algorithms: ['HS256']` on verify, `algorithm: 'HS256'` on sign; alg-confusion test |
| **P1-2** | WebSocket `?token=` query fallback | 1.1b | Removed server-side; both clients (student / teacher) migrated to `bearer.<jwt>` subprotocol |
| **P1-3** | Client-authoritative exam timer | 1.2 | New `computeSecondsRemaining` helper; WS heartbeat reply carries server-authoritative seconds; client snaps when drift >3s |
| **P1-4** | Offline answer queue not wired | 1.2 | IndexedDB queue wired with `dedupeKey`, idempotency key per write, mount-time drain |
| **P1-5** | Bulk-import bcrypt cost 10 | 1.3 | Cost 12 to match the rest of the codebase |
| **P1-6** | AI feedback path lacks injection guard | 1.3 | New `buildFeedbackPrompt` runs every input through the existing `sanitizeUserText` and wraps in named `<SOURCE>` blocks |
| **P1-7** | Refresh-token body fallback weakens CSRF | 1.3 | Cookie-only `/refresh` and `/logout`; body fallback removed; regression test |
| **P1-8** | No `Dockerfile.superadmin`, no nginx vhost, no CI build | 1.1b | New `Dockerfile.superadmin`, new `platform.secureexam.app` nginx vhost, CI build for both admin and superadmin (admin was also missing) |
| **P1-14** | Dev SPA Dockerfiles use `npm install`, not `npm ci` | 1.1b | All four SPA Dockerfiles now use `npm ci`, and all four COPY shared-frontend (three were silently missing it) |
| **P1-15** | `POST /pins/generate` and `/security/.../invites/generate` not idempotent | 1.3 | Both wrapped with the existing `idempotency()` middleware |

### P1 deferred

| ID | Finding | Why deferred |
| --- | --- | --- |
| **P1-9** | nginx / api / redis healthchecks | api + redis added in 1.1b; nginx healthcheck is partial (best-effort). Full nginx liveness needs a dedicated cycle. |
| **P1-10** | Sentry / error tracking | Real value but adds a vendor + ~3 dep updates across api + 4 SPAs. Better as a focused observability cycle (Stage 6 territory). |
| **P1-11** | No staging environment | Pure infra, not code. Needs a `docker-compose.staging.yml` plus a real DNS/cert path. Owner: ops. |
| **P1-12** | CI branch protection | GitHub setting, not in code. Needs admin-side toggle. CI gates exist; protection is one click. |
| **P1-13** | 30 type suppressions in `ExamSessionPage` | The page is 1.1k lines. Will piggy-back on Stage 4 when it's split. Fighting it during a cycle that already touches it heavily would risk regressions on the hot path. |

### P2 (Stage 2/3 hygiene)

Untouched — those were always Stage 2/3 by audit triage.

---

## 2. Process changes that ship with the code

These three are how we keep this stage's work from drifting back to where the
audit found it (per `docs/02-north-star.md` §7.1 — "don't ship features
faster than you fix invariants"):

1. **Architecture-invariant test.** `apps/api/test/tenantInvariant.test.ts`
   fails CI if any router reintroduces `findUnique({ where: { id:
   req.params.<x> } })`. Allowlist starts with only the SUPER_ADMIN portal
   (legitimate cross-tenant pending D1). Adding a file to the allowlist
   requires a code-review, not an env flag.
2. **`tenantScope(role, schoolId)` helper.** Consistent shape for tenant-
   scoped queries. Every route either uses it directly, uses
   `canManageExam` / `canProctorExam` (which now also require schoolId), or
   is in the allowlisted vendor portal.
3. **AI prompt builder.** Two surfaces (`buildQuestionGenPrompt`,
   `buildFeedbackPrompt`) now share `sanitizeUserText` + the
   `<SOURCE>...</SOURCE>` wrapping pattern. New AI surfaces follow this or
   they don't merge — the lib has zero raw-string interpolation.

---

## 3. Chaos test (audit §11 end-of-Stage-1 gate)

Chaos test from the audit, mapped to what's now in place:

| Chaos | Expected | What's in place |
| --- | --- | --- |
| Kill DB | API returns 5xx but doesn't crash; `/health` reports unhealthy | Centralised error middleware + `/health` endpoint; redis healthcheck added in 1.1b |
| Send bad input | 400 with field-level error from Zod, no stack trace | Zod validation everywhere; helmet hides stack traces in prod |
| Hit rate limits | 429 from `express-rate-limit` AND from nginx `limit_req` | Both layers wired; nginx zones `api_general`, `api_auth`, `api_ai`, `platform_admin` |
| Try to access another role's data | 403 / 404 | Tenant invariant test + 14 cross-tenant regressions |
| Drop the WebSocket mid-exam | Exam continues; queue absorbs writes; reconnect drains | IndexedDB queue (1.2); WS reconnect logic in `useExamWebSocket`; tested manually via `ws.onclose` handler |
| Expire access token mid-exam | Single-flight refresh; no UI flicker | `shared-frontend/apiClient` single-flight refresh queue (already existed, now used by superadmin too) |
| Tamper with client timer | Auto-submit when server says 0 | Server-authoritative seconds in heartbeat reply (1.2) |
| Forge a JWT with `alg: none` | 401 | JWT alg pin (1.1a) + jwtAlg.test.ts |
| Replay an OTP code from console log | Impossible — code never logged | OTP scrub (1.1a) |

A real run of this list belongs to the next reviewer / ops engineer with a
running staging environment. The instrumentation and code paths are in
place; the assertions in the test suite cover the deterministic ones.

---

## 4. What didn't ship

Honest list of what this stage did **not** do:

- **No staging environment was created.** `docker-compose.prod.yml` got
  healthchecks and the new admin / superadmin volumes, but no
  `docker-compose.staging.yml` exists. Real Let's Encrypt cert paths in
  `nginx.conf` are placeholders (`*.yourschool.edu`).
- **No Sentry / observability work.** `docs/00-audit.md` §10 already
  credits the existing pino logs, prom-client metrics, request IDs, and
  audit log. Sentry is a Stage 6 / cycle 1.4 item.
- **D1 (split SUPER_ADMIN) was not ratified.** The cycle 1.1b superadmin
  hardening fixes the bleed but does not split the role. Until D1 is
  ratified, the `superadmin` portal is effectively the future
  PLATFORM_ADMIN portal but still uses the `SUPER_ADMIN` enum value.
- **Branch protection** is not enforced at the GitHub-settings level. The
  CI gates exist (`lint`, `typecheck`, `test-api`); a one-click toggle in
  the repo settings is the missing piece, owned by the repo admin.

---

## 5. Recommended next moves

1. **Ratify D1 + D6.** They gate Stage 2's role refactor and portal
   consolidation. Recommendations are in `docs/decisions.md`.
2. **Run the chaos test against a real staging environment.** Catches
   anything the test harness misses (TLS handshakes, cert expiry, real
   nginx behaviour, real Postgres failover behaviour).
3. **Decide on cycle 1.4 scope.** Sentry + staging + branch protection +
   nginx healthcheck. Each is small individually, all four together are
   a coherent ops cycle. Or: defer to Stage 6 (observability/SLOs) and
   move directly to Stage 2 (hero-workflow rebuilds).
4. **Open a Stage 1 review PR** so this branch goes through the same
   reviewable artifact pattern as Stage 0 (PR #2).

---

## 6. Cross-references

- **Backward**: `docs/00-audit.md` (the diagnosis we set out to close)
- **Sideways**: `docs/decisions.md` (open D1–D7), `docs/02-north-star.md`
  §7.1, §7.2, §7.9 (the anti-patterns this stage operationalises)
- **Forward**: Stage 2 — workflow redesign on the new role / portal
  architecture (gated on D1 + D6)

---

**End of Stage 1 closure. Pausing for review.**
