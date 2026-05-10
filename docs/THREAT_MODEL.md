# SecureExam — Threat Model

**Date:** 2026-05-10
**State of the doc:** authoritative for current `Claudy`. Reflects Stage 1
(cycles 1.1a → 1.4) + Stage 2 prereqs (cycles 2.0a → 2.0f) + Stage 3
(cycles 3.0a → 3.0d). Pre-Stage-1 revisions of this file made several
implementation claims that the audit (`docs/00-audit.md` §8) proved
false; those have either been fixed and pinned in tests, or are listed
in §13 as still outstanding.

---

## 1. What we deter, what we detect, what we cannot prevent

This document is deliberately blunt. Marketing copy that promises
"lockdown browser security" inside a normal web browser misleads
schools. The honest picture below should inform how SecureExam is sold
to high-stakes customers and where you should be transparent about
residual risk.

The product:

- **Deters** casual cheating at Tier 2 with a stack of in-browser
  controls (fullscreen, visibility, copy/paste block, keyboard
  shortcut suppression).
- **Detects** server-side a defined set of integrity signals: timing
  too fast, per-question speed, answer-pattern collusion (cycle 9),
  fingerprint drift, lost heartbeat.
- **Cannot prevent**, and does not pretend to prevent, anything that
  happens outside the browser sandbox at Tier 2: a phone behind the
  laptop, a second person in the room, a VM with the answer document
  on the host OS. Tier 3 (SEB on Windows + invigilator) is the
  honest answer for sit-down stakes; the SEB handoff is roadmap
  (Stage 5).

If a buyer needs guarantees outside that envelope, the answer is
"in-person invigilation in a school computer lab" — not more
JavaScript.

---

## 2. Tiered stakes model

`Exam.securityLevel` (1, 2, 3) is the packaging spine. Per
`docs/01-product.md` §4:

| Tier | Stakes | Devices | Lockdown reality |
| --- | --- | --- | --- |
| **1 — Honour-code** | Weekly quiz, formative check | Any device, BYOD permitted | None. Browser lockdown at this tier is theatre and we don't ship it. |
| **2 — Best-effort lockdown** | End-of-unit test, mock | School-managed Chromebooks/Windows + iPads | Fullscreen API, visibility tracking, copy/paste block, keyboard-shortcut suppression, server-side integrity flags. iPad fullscreen is partial — documented, not papered over. |
| **3 — Sit-down exam** | Mocks, summative, internal certification | School-managed **Windows** in a lab | Safe Exam Browser handoff + mandatory IP allowlist + live invigilator. **Roadmap (Stage 5).** Today, Tier 3 is sold as "Tier 2 plus invigilator" until SEB lands. |

Phones are out of scope for exam-taking (north-star anti-pattern §7.4).
Schools that try anyway get the responsive web fallback at Tier 1
only.

---

## 3. In-browser anti-cheat (Tier 2)

Implemented in `apps/student/src/pages/ExamSessionPage.tsx`. From
`apps/student/README.md`:

| Mechanism | What it does |
| --- | --- |
| Fullscreen API | `requestFullscreen()` before exam; `fullscreenchange` triggers a violation |
| `visibilitychange` | Tab switch → violation |
| `window.blur` | Alt+Tab / window-focus loss → violation |
| `contextmenu` / `keydown` | Right-click + Ctrl+U/C/S/V/A/P/F/H/T/W/N/R + Alt+F4/Tab + Meta keys → suppressed + violation |
| `copy` / `cut` / `paste` | Block + violation |
| `dragstart` | Block |
| Print blocked | `@media print { body { display: none } }` injected at exam start |
| Heartbeat | WS heartbeat every ~15s; absence is a strong proctor signal |
| Violation debounce | Repeat violations within a short window collapse to one record (avoids log spam from a stuck `visibilitychange`) |
| PIN lock | Repeated violations → `LockScreen.tsx`; teacher-issued unlock PIN (bcrypt, single-use per `ExamPin` row) clears |
| Auto-submit | When the server-authoritative timer reaches 0, the client submits regardless of local state |

These are deterrents. A determined attacker with DevTools can defeat
any of them — see §9.

---

## 4. Server-authoritative defenses

Cycle 1 closed the gap between "the browser claims X" and "the server
believes X." The relevant mechanisms, with the cycles + audit IDs
they trace to:

- **Server-authoritative timer** (cycle 1.2 / P1-3). The WS heartbeat
  reply (`pong`) carries canonical `secondsRemaining`. The local 1s
  `setInterval` interpolates between heartbeats; client snaps to the
  server value when drift exceeds 3s. Tampering with the local
  `setInterval` or React state has no effect on submission deadline.
- **JWT HS256 pin** (cycle 1.1a / P1-1). Both `jwt.verify` and
  `jwt.sign` pin `algorithms: ['HS256']` / `algorithm: 'HS256'`. A
  forged token with `alg: none` or `alg: HS512` is rejected. Pinned in
  `apps/api/test/jwtAlg.test.ts` (3 cases).
- **Refresh-token cookie-only** (cycle 1.3 / P1-7). `/auth/refresh`
  and `/auth/logout` accept the token only via the
  `HttpOnly; SameSite=Strict; Secure` cookie. The body fallback was
  removed because it bypassed SameSite. Pinned in
  `apps/api/test/refresh.test.ts` (3 cases including the explicit
  "body-only request must 401" regression).
- **WebSocket subprotocol auth** (cycle 1.1b / P1-2). The token is
  carried in `Sec-WebSocket-Protocol: bearer.<jwt>` only. The
  `?token=` query-string fallback was removed server-side and both
  clients (student + console) migrated. Tokens no longer appear in
  proxy access logs.
- **Idempotent session writes** (cycle 1.3 / P1-15). `POST
  /sessions/:id/answer`, `/sessions/:id/violation`,
  `/sessions/:id/submit`, `/pins/generate`, and
  `/security/.../invites/generate` are wrapped with the existing
  `idempotency()` middleware. The IndexedDB answer queue
  (`apps/student/src/lib/answerQueue.ts`, cycle 1.2 / P1-4) rotates
  the `Idempotency-Key` per write so server-side dedupe doesn't
  confuse fresh writes with replays.
- **REST-authoritative autosave** (cycle 3.0c). `POST
  /api/v1/sessions/:id/answer` is the only durable write path. The WS
  `session:answer` handler is now a no-op stub; the REST handler
  pushes `proctor:update` via the broadcaster so the proctor view
  stays live without the WS being on the durability path.

---

## 5. Multi-tenant isolation

The audit (§8 P0-1, P0-2, P0-3) found 10 routes performing
`findUnique({ where: { id: req.params.<x> }})` with no `schoolId`
filter. Cycle 1.1a closed all 10 and added three layers of defense:

1. **`tenantScope(role, schoolId)` helper** in
   `apps/api/src/lib/examAccess.ts`. Spreads into a Prisma `where`.
   Returns `{}` for `PLATFORM_ADMIN` (cross-tenant by design), else
   `{ schoolId }`. A non-PLATFORM_ADMIN with a null `schoolId`
   substitutes a sentinel that matches no row.
2. **`canManageExam` / `canProctorExam`** in the same file. Loads the
   exam, checks tenant match, then checks role + ownership +
   co-proctor assignment.
3. **`apps/api/test/tenantInvariant.test.ts`** — a static-scan test
   that fails CI if any router reintroduces the
   `findUnique({ where: { id: req.params.<x> }})` shape. Allowlist
   contains exactly one file: the PLATFORM_ADMIN portal router
   (legitimate cross-tenant per D1). Adding to the allowlist is a
   reviewable code change.

Pinned by 14 cross-tenant regression cases in
`apps/api/test/crossTenant.test.ts` covering reports (P0-1a/b), admin
overrides (P0-2a/b/c/d), and media/sen/security/assessment/pins
(P0-3a..g). Each asserts 403 or 404 — never 200.

The role split (D1, cycle 2.0a) renamed `ADMIN` →
`Role.SCHOOL_ADMIN` and `SUPER_ADMIN` → `Role.PLATFORM_ADMIN`. After
the split, the school IT lead can be served by `SCHOOL_ADMIN`
(scoped to one `schoolId`) without giving them cross-tenant powers.

---

## 6. AI prompt injection

Two AI surfaces exist today: `buildQuestionGenPrompt` (teacher
authoring) and `buildFeedbackPrompt` (per-student AI feedback,
post-submission). Both go through the same defense:

- **`sanitizeUserText`** strips zero-width characters, normalises
  newlines, caps length, and applies sentinel regexes against
  "ignore previous instructions"-class injection patterns.
- **`<SOURCE>...</SOURCE>` named blocks** wrap every untrusted
  string. The system prompt instructs the model to treat content
  inside `<SOURCE>` as data, not instructions.
- The shared lib (`apps/api/src/lib/aiPrompt.ts`) has zero raw-string
  interpolation — new AI surfaces either use the sanitiser + wrapper
  or they don't merge.

The question-gen path was cycle 1.1a; the feedback path is cycle 1.3
/ P1-6 (the audit found `assessment.router.ts:314-387` building the
feedback prompt with raw student essay text).

**AI is gated by per-school feature flag** (cycle 2.0e / D4).
`schoolFeatureEnabled(schoolId, 'ai-authoring')` is a Redis-cached,
fail-closed check on every AI route. When off, both routes return
`403 { code: 'feature_disabled' }` for non-PLATFORM_ADMIN callers.
PLATFORM_ADMIN bypasses for support; the bypass is audit-logged. The
catalogue lives in the `features` table; per-tenant state in
`school_features`. Toggle audit rows
(`FEATURE_ENABLED` / `FEATURE_DISABLED`) carry `actorRole`,
`actorSchoolId`, `targetSchoolId` and the `impersonation` flag
(see §7).

Pinned in `apps/api/test/featureFlags.test.ts` (5 cases).

---

## 7. Audit + impersonation evidence trail

The audit-log spine that backs SOC 2 / GDPR / FERPA evidence
requirements (`docs/01-product.md` §5).

`audit_logs` columns of interest (cycle 2.0f, schema in
`apps/api/prisma/schema.prisma`):

```
actorId          fk → users.id
actorRole        'PLATFORM_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT'
actorSchoolId    schoolId of the actor at write time (null for PLATFORM_ADMIN)
targetType       'Exam' | 'Class' | 'User' | 'School' | 'Feature' | …
targetId         row id of the affected entity
targetSchoolId   schoolId of the affected entity, where known
impersonation    true iff actor's schoolId differs from target's schoolId
                 (PLATFORM_ADMIN acting on a tenant is always impersonation=true)
action           enum (FEATURE_ENABLED, EXAM_CLOSED, SCHOOL_PROVISIONED, …)
meta             JSON, redacted of bodies/cookies/auth headers
createdAt
```

`auditFromReq(req, action, targetType, targetId, opts)` populates all
five derived columns automatically. Existing `audit()` calls keep
working and default to `impersonation=false`.

`getImpersonationEvents({ targetSchoolId?, since? })` in
`apps/api/src/lib/auditQuery.ts` is the single SOC 2 / GDPR ledger
query: "every cross-tenant action in the last N days, optionally
scoped to one school." Indexed at the DB level via
`@@index([actorRole, impersonation])`.

Every PLATFORM_ADMIN action against a school produces
`impersonation=true`. Provisioning, offboarding, admin overrides, and
on-behalf-of feature-flag toggles all flow through this. Pinned in
`apps/api/test/auditImpersonation.test.ts` (4 cases).

---

## 8. Operational protections

Defense-in-depth around the trust boundaries.

- **Helmet** in `apps/api/src/app.ts`: CSP (script-src `'self'`,
  style-src `'self' 'unsafe-inline'`, frame-ancestors `'none'`),
  HSTS (preload), COOP `same-origin`, CORP `same-site`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`. Stack traces never leak to the
  client in production.
- **Env-var enforcement at boot** (`apps/api/src/lib/env.ts`).
  Refuses to start with default, short, or missing `JWT_SECRET` /
  `JWT_REFRESH_SECRET`. Strong, real, and tested.
- **OTP plaintext scrub** (cycle 1.1a / P0-6). The
  `console.log("[OTP] Code for ${email}: ${code}")` was removed.
  When `SMTP_HOST` is unset, the API issues a structured
  `logger.warn("SMTP not configured; OTP not delivered")` with no
  code value. A dev-only `OTP_DEV_LOG=1` env var re-enables a
  `logger.debug` for local testing; it is gated against
  `NODE_ENV=production`.
- **Bcrypt cost 12 everywhere**, including bulk import (cycle 1.3 /
  P1-5; the audit caught a regression to cost 10).
- **`crypto.randomInt` / `crypto.randomBytes`** for every security
  random — no `Math.random` for tokens, OTPs, or IDs.
- **Refresh-token rotation** — Redis-backed family revocation; replay
  of a rotated `fid` returns 401. Logout revokes the family.
- **nginx HTTPS + rate-limit zones** (cycle 1.1b / P0-5).
  All four production vhosts (`exam.*`, `console.*`, `api.*`,
  `platform.secureexam.app`) listen on 443 with TLS 1.2/1.3, HSTS
  preload, OCSP stapling, port-80 redirect. Rate-limit zones:
  `api_auth` (2 r/s), `api_ai` (10 r/min), `api_general` (30 r/s),
  `platform_admin` (5 r/s).
- **Idempotency middleware** wired on all session writes + PIN/invite
  generation.
- **CSV formula-injection escape** in exports (cycle 3, pre-audit).
- **Centralised error middleware** + `Sentry` shim (cycle 1.4 /
  P1-10). 5xxs and unhandled rejections forward to Sentry when
  `SENTRY_DSN` is set, with PII-safe `beforeSend` that strips
  bodies, cookies, auth headers, and idempotency keys.

---

## 9. What we cannot prevent

Honest list. Anything outside the browser sandbox at Tier 2:

- **A phone behind the laptop, a second monitor, a roommate.** No
  browser code reaches these. Tier 3 (SEB + invigilator) is the
  answer.
- **A VM with the answer document on the host OS.** SEB integration
  detects "running inside a VM" via the OS attestation surface; the
  browser does not.
- **DevTools-savvy attackers.** A user who disables JavaScript,
  blocks `/violation` requests via the Network tab, or pauses
  `setInterval` defeats the in-browser layer. Server-authoritative
  defenses (timer, integrity timing, heartbeat absence) catch a
  subset; not all.
- **Impersonation by another human.** Magic-link email + OTP + IP
  allowlist mitigate to the extent the email account and network are
  trusted. They do not survive a coordinated student-pair handoff.
- **Compromised devices.** A keylogger on the student's machine
  exfiltrates anything they type, including the OTP. Out of scope
  for browser-based mitigation.
- **Social engineering of teachers / school admins.** A teacher who
  hands their session cookie to an attacker bypasses every layer.
  Audit logs catch the consequences after the fact; they do not
  prevent the action.
- **Coordinated answer collusion across two students.** The
  `integrity` module catches identical answer sequences (cycle 9)
  but the signal is probabilistic — flag for human review, not auto-
  penalty.

Tier 3 (SEB on Windows + live invigilator + IP allowlist) is the
class of mitigation for these. SEB is roadmap (Stage 5 / D4 flag
`seb-tier-3` already in catalogue as placeholder).

---

## 10. How we test it (chaos cases)

The 9 chaos cases from `docs/05-manual-testing.md` §1 are the
end-of-Stage-1 acceptance gate. They exercise the layers in §4–§8
end-to-end. Listed here so a reader knows what to run, not run
inline:

1. **Kill the database mid-request** — API does not crash;
   `/health/ready` returns 503; restart resumes.
2. **Send malformed input** — Zod 400 with field-level errors, no
   stack trace.
3. **Hit the rate limiter** — 429 from `express-rate-limit` and from
   nginx `limit_req` zones.
4. **Cross-tenant bypass attempt** — 403/404 across the 14
   regression-tested routes. (Static-scan invariant test runs
   alongside.)
5. **Drop the WebSocket mid-exam** — IndexedDB queue absorbs writes;
   reconnect drains.
6. **Expire the access token mid-exam** — single-flight refresh
   queue replays the 401'd request; no UI flicker.
7. **Tamper with the client timer** — server-authoritative
   `secondsRemaining` snaps the local timer back within a
   heartbeat.
8. **Forge a JWT with `alg: none`** — 401. Same for `HS512`-signed
   tokens with the right secret.
9. **Try to read an OTP from logs** — no plaintext code value
   present; `logger.warn` only.

The Stage 3 multi-replica addendum (`docs/07-stage3-closure.md` §4)
adds three more cases for the multi-replica path:

10. **Replica fail-over mid-exam** — student WS reconnects within
    ~2s; queue drains; submit succeeds.
11. **Cross-replica proctor visibility** — proctor on replica A sees
    `proctor:update` from a student on replica B (Redis pub/sub
    fan-out + origin-uuid dedupe).
12. **Redis fail-over mid-exam** — broadcaster reconnects; exam-
    taking continues uninterrupted because autosave is REST-
    authoritative, not Redis-dependent.

---

## 11. Cross-tenant impersonation by vendor (PLATFORM_ADMIN)

Per D1 (Decided, cycle 2.0a), the `PLATFORM_ADMIN` role is
**legitimately cross-tenant by design.** Vendor staff need to be able
to provision schools, suspend tenants, run support investigations,
and on-behalf-of toggle feature flags. This is the only role with
that capability, and the only role allowed in
`apps/platform/` (the vendor portal at
`platform.secureexam.app`).

Three guard-rails apply:

1. **Hostname segregation.** Customer subdomains (`exam.*`,
   `console.*`, `api.*`) never see the platform-admin SPA. The
   vendor portal lives on a separate, non-customer subdomain with
   its own nginx vhost and its own `platform_admin` rate-limit
   zone (5 r/s).
2. **Audit-log impersonation flag.** Every PLATFORM_ADMIN action on
   a tenant row writes `impersonation=true` (§7). Provisioning,
   offboarding, admin overrides, and on-behalf-of feature toggles
   all flow through `auditFromReq()` and produce a row in
   `getImpersonationEvents()`.
3. **Static-scan allowlist.** The tenant-invariant test
   (`tenantInvariant.test.ts`) allowlists exactly one file:
   `apps/api/src/modules/platform/platform.router.ts`. Cross-tenant
   `findUnique` patterns elsewhere fail CI.

The platform admin portal still requires login + access token + (in
production) MFA + IP allowlist (operational concern, owned by ops,
not in code).

---

## 12. Compliance regimes

From `docs/01-product.md` §5. The full enterprise stack:

| Regime | Code/process implication |
| --- | --- |
| **GDPR / UK-GDPR + DPA 2018** | DPA-signable; DPO fields on `School`; `dataRegion` populated per school (default `'UK'`); right-to-erase flow; subprocessor list maintained; breach-notification process. |
| **FERPA (US K-12)** | Student records are the school's data. Cross-tenant invariant + 14 regression cases enforce this in code. Retention configurable. School can export everything on demand. |
| **COPPA (US under-13)** | School consent acts in loco parentis. AI flag (D4) defaults off; SOC 2-grade audit-log every flip. No third-party tracking, no marketing pixels, no behavioural ads — ever. |
| **SOC 2 Type II / ISO 27001** | Mostly process work. Code touchpoints: `audit_logs` populated for every privileged action (`auditFromReq`); least-privilege RBAC (cycle 2.0a / D1); HSTS + TLS 1.2/1.3; encryption-at-rest is ops-owned; MFA for PLATFORM_ADMIN. We don't pursue certification in year one — but every Stage 1-3 decision was made *as if* we will. |

The auditability principle is **auditability-by-default, not bolt-on.**
Every state mutation that crosses a trust boundary writes an
`AuditLog` row.

---

## 13. What's NOT yet covered

Honest list, mirroring the closure-doc discipline.

- **D3 design pass** — Notion-warm + focus-mode split. Stage 4
  territory. Today the student exam-taking surface uses a
  serviceable but not yet design-system-grade focus mode; the
  console retains its pre-D3 visual treatment.
- **Full Safe Exam Browser integration.** Tier 3 is sold as
  "Tier 2 + invigilator" until Stage 5 lands the SEB handoff
  (`X-SafeExamBrowser-RequestHash` validation on
  `/sessions/:examId/start` for high-stakes exams). The
  `seb-tier-3` feature-flag placeholder exists in the catalogue
  (cycle 2.0e) but the handoff code path does not.
- **Live proctoring video** — deferred per north-star anti-pattern
  §7.4 ("Don't add proctoring theatre"). Tier 3's answer is
  in-person invigilator + SEB; an algorithm staring at a webcam is
  not on the roadmap. This is a deliberate position, not an
  oversight.
- **Production Let's Encrypt automation.** `scripts/dev-certs.sh`
  generates self-signed certs for the 4 vhosts so the cycle-1.1b
  HTTPS config exercises locally; production cert renewal is
  ops-owned and needs a dedicated cycle alongside a RUNBOOK
  update.
- **SQL `CHECK` constraint** on role↔schoolId pairing (PLATFORM_ADMIN
  may have NULL `schoolId`; every other role must not). Enforced at
  the application layer + by `tenantScope` sentinel; a hand-written
  Prisma migration would close the defense-in-depth gap.
- **Postgres Row-Level Security.** Documented as outstanding in the
  audit. App-side `tenantScope` is the only layer; the static-scan
  invariant + 14 regressions reduce the risk of regression but
  RLS would be a second layer.
- **CI branch protection.** GitHub setting, not in code. CI gates
  exist (`lint`, `typecheck`, `test-api`, `tenantInvariant`); a
  one-click toggle in repo settings is the missing piece.
- **SPA Sentry** for the four frontends. Deferred to Stage 6. The
  api-side Sentry shim (cycle 1.4) catches the higher-leverage
  failure class (server 5xxs, unhandled rejections).

---

## 14. Cross-references

- [`docs/00-audit.md`](00-audit.md) §8 — original P0/P1/P2 list
- [`docs/01-product.md`](01-product.md) §4 (stakes ladder), §5
  (compliance posture)
- [`docs/02-north-star.md`](02-north-star.md) §7.4 (proctoring
  theatre anti-pattern)
- [`docs/03-stage1-closure.md`](03-stage1-closure.md) §1 (audit →
  resolution map), §3 (chaos test mapping)
- [`docs/04-stage2-prereqs-closure.md`](04-stage2-prereqs-closure.md)
  §1 (D1 / D6 / D4 / 2.0f mappings), §3 (engineering items)
- [`docs/05-manual-testing.md`](05-manual-testing.md) §1 (the 9
  chaos cases), §4 (compliance smoke checks)
- [`docs/07-stage3-closure.md`](07-stage3-closure.md) §4
  (multi-replica chaos test addendum)
- [`docs/decisions.md`](decisions.md) — D1, D2, D4, D6, D7 Decided;
  D3, D5 Open
- [`apps/student/README.md`](../apps/student/README.md) — Tier 2
  anti-cheat surface inventory
- [`apps/api/test/crossTenant.test.ts`](../apps/api/test/crossTenant.test.ts)
  — 14 cross-tenant regressions
- [`apps/api/test/tenantInvariant.test.ts`](../apps/api/test/tenantInvariant.test.ts)
  — static-scan invariant
- [`apps/api/test/jwtAlg.test.ts`](../apps/api/test/jwtAlg.test.ts)
  — JWT algorithm pin
- [`apps/api/test/refresh.test.ts`](../apps/api/test/refresh.test.ts)
  — refresh-token rotation + cookie-only
- [`apps/api/test/auditImpersonation.test.ts`](../apps/api/test/auditImpersonation.test.ts)
  — impersonation flag
- [`apps/api/test/featureFlags.test.ts`](../apps/api/test/featureFlags.test.ts)
  — D4 per-school flag

---

**End of threat model. Defensible to a security-aware buyer because
the claims trace to tests, the gaps trace to roadmap items, and
nothing here is marketing copy.**
