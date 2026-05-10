# Decisions log

**Format:** lightweight ADR. One section per decision. Each has an ID,
status, context, options considered, decision (or **OPEN** with a
recommendation), and consequences. New decisions append to the bottom; never
delete or rewrite history — supersede with a new ID and link.

**Status values:** `Proposed` · `Open` · `Decided` · `Superseded by Dn`

---

## D1 — `SUPER_ADMIN` role: split into vendor + customer admins

- **Status:** Decided — Option 1 (split). Implemented in cycle 2.0a.
- **Raised:** Cycle 0.2, batch 1
- **Implemented:** Cycle 2.0a (branch `claude/stage-2-cycle-2-0a-role-split`)

### Context

*Pre-decision state, preserved for the record. The schema and code below
describe what was true before cycle 2.0a; see Consequences for what is true
now.*

The schema today (`apps/api/prisma/schema.prisma`) has `Role.SUPER_ADMIN`
with `User.schoolId` nullable, so a SUPER_ADMIN can have no school
affiliation. Routes like `/platform/schools` allow that role to create,
suspend, or delete *any* school. This is a vendor-level capability set.

Cycle 0.2 picked **the school IT lead** as the most-privileged customer-side
role. If we hand them `SUPER_ADMIN` as it stands today, they can manage
every other school on the platform — a cross-tenant nightmare and a clear
contract violation (multi-tenant invariant #1 from `ARCHITECTURE.md`).

### Options

1. **Split into two roles** *(recommended)*
   - `PLATFORM_ADMIN` — vendor staff only. Cross-tenant. Lives in a separate
     locked-down portal at a non-customer subdomain. MFA-required, IP
     allowlist, full audit-log. Replaces today's null-`schoolId`
     `SUPER_ADMIN`.
   - `SCHOOL_ADMIN` — replaces today's `ADMIN`, scope-locked to a single
     `schoolId`. The IT lead's daily portal. Beefed up with SSO config,
     bulk import, audit-log review, data-export.
2. **Scope `SUPER_ADMIN` to a single school** — keep the name, add a
   non-null `schoolId` constraint, demote `/platform/*` to a new
   `PLATFORM_ADMIN`. Functionally identical to option 1 with a more
   confusing name.
3. **Status quo** — give school IT a `SUPER_ADMIN` account. Rejected:
   cross-tenant breach by design.

### Recommendation

Option 1. The naming is clearer ("platform" = vendor, "school" = customer)
and the migration is mechanical: rename `ADMIN` → `SCHOOL_ADMIN`, rename
`SUPER_ADMIN` → `PLATFORM_ADMIN`, add a nullability constraint on `schoolId`
that depends on role.

### Consequences

- ✓ Schema migration shipped: `prisma/migrations/20260510120000_2_role_split_d1/`
- ✓ All `/platform/*` routes guard `req.user.role === 'PLATFORM_ADMIN'`
- ✓ All `requireRole('SCHOOL_ADMIN', 'PLATFORM_ADMIN')` (formerly `'ADMIN', 'SUPER_ADMIN'`) flows scope by `schoolId` via `tenantScope()` (cycle 1.1a) or `canManageExam()` / `canProctorExam()`.
- ✓ The `apps/superadmin` portal is now the vendor Platform Admin portal (cycle 1.1b).
- 〇 Audit-log every cross-tenant action by `PLATFORM_ADMIN` — partial: existing audit middleware fires on writes; explicit cross-tenant impersonation tracking is a follow-up.
- See also D6 — portal consolidation depends on this split.

---

## D2 — Google Classroom: punt from v1

- **Status:** Decided
- **Raised:** Cycle 0.2, batch 2
- **Owner:** product (revisit at year-1 review)

### Context

Cycle 0.2 LMS/SSO selection: **MS Teams for Education + Azure AD**, Canvas/
Moodle/Schoology, and standalone email/password. **Google Classroom +
Google Workspace SSO was explicitly not selected.**

K-12 device share is roughly half Google (Chromebook-heavy US districts)
and half Microsoft (UK/EU + US 1:1 Windows districts). Punting Google means
we cannot land most US K-12 districts in v1.

### Options

1. **Punt Google entirely from v1** *(decided)* — focus engineering on a
   single excellent SSO integration (Microsoft) rather than two mediocre ones.
2. **Build both in v1** — rejected: doubles integration work, slows
   everything else.
3. **Build Google instead of Microsoft** — rejected against Cycle 0.2
   selection.

### Decision

Option 1. v1 ships with Microsoft SSO + email/password fallback. Google
Classroom integration enters the roadmap conversation at the year-1 review
once we have signed UK/EU customers using Microsoft.

### Consequences

- US sales conversations explicitly say "Microsoft schools first; Google
  schools waitlist."
- We do not advertise Google support anywhere.
- The schema/auth abstraction is built generic (OIDC + SCIM) so adding a
  Google IdP later is configuration, not a new code path.

---

## D3 — Two-mode design system: focus + warm

- **Status:** Open (recommendation: adopt)
- **Raised:** Cycle 0.2, batch 3 (extension of brand answer)
- **Owner:** unassigned

### Context

Cycle 0.2 brand selection was **Notion — calm, content-dense, friendly.**
The student exam-taking surface is in genuine tension with that register —
during a sit-down exam, "calm and friendly" is wrong; the right register is
"focused, status-first, no decoration."

### Options

1. **One mode, Notion-warm everywhere** — risks under-serving the hot path.
2. **Two modes sharing one token set** *(recommended)* — Notion-warm by
   default; focus mode (Stripe-discipline) for student exam-taking. Same
   colours, type scale tightens, chrome strips down, status surfaces become
   omnipresent.
3. **Two completely separate design systems** — rejected: doubles maintenance,
   creates inconsistency at handoff points (e.g. submitting an exam takes
   you back into Notion-warm).

### Recommendation

Option 2. The `shared-frontend` package already exists; adding a `mode`
prop or theme switch at the app-shell level is a small change.

### Consequences

- Stage 4 (design system) builds two app-shell variants
- Tokens stay unified in `shared-frontend`
- All four hero workflows except student exam-taking ship in default mode
- Clear handoff points (entering the exam, submitting) get explicit visual
  transitions

---

## D4 — AI feature flag: where does it live?

- **Status:** Decided — Option 2 (dedicated `Feature` + `SchoolFeature` tables). Implemented in cycle 2.0e.
- **Raised:** Cycle 0.2, batch 3 (AI authoring stance)
- **Implemented:** Cycle 2.0e (branch `claude/stage-2-cycle-2-0e-d4-feature-flags`)

### Context

Cycle 0.2 chose **per-school admin-toggleable AI authoring**, off by default.
The toggle has to be queryable cheaply on every authoring request, and we'll
likely have more flags over time (proctoring features, accessibility flags,
LMS feature gates). The schema currently has no feature-flag column.

### Options

1. **`School.featureFlags Json`** — single JSONB column on `School`. Cheap,
   minimal schema change. Flexible. Hard to index, hard to audit per-flag.
2. **Dedicated `Feature` + `SchoolFeature` tables** *(recommended)* —
   normalised. Per-flag audit log via existing `AuditLog` table. Per-flag
   default values, per-flag descriptions, per-flag rollout dates. Slightly
   more code.
3. **Hardcoded in env-vars** — rejected: not per-school.

### Recommendation

Option 2. The audit/compliance posture (SOC 2 + COPPA) means we need to
prove who turned what on, when, and why. JSONB makes that hard. A
`SchoolFeature` row with `enabledBy`, `enabledAt`, `disabledAt` falls
naturally into our `AuditLog` discipline.

### Consequences

- ✓ New tables shipped: `prisma/migrations/20260510130000_3_d4_feature_flags/`
  — `features` (catalogue, vendor-managed) + `school_features` (per-tenant
  toggle, with `enabledById` / `enabledAt` / `disabledAt` for the audit trail).
- ✓ Server-side helper: `apps/api/src/lib/featureFlags.ts` — fail-closed,
  Redis-cached at 60s TTL, `setSchoolFeature()` flips the toggle and the
  caller audit-logs via the existing `AuditLog` table (new `FEATURE_ENABLED`
  / `FEATURE_DISABLED` `AuditAction` values).
- ✓ AI gate wired: `apps/api/src/modules/ai/ai.router.ts` and the
  `/assessment/sessions/:id/feedback/ai` endpoint both 403 with
  `code: 'feature_disabled'` for non-PLATFORM_ADMIN callers when the school
  has not opted in. `PLATFORM_ADMIN` bypasses for support; their actions
  remain auditable via the existing audit log.
- ✓ Admin endpoints: `GET /api/v1/admin/features` (catalogue + per-school
  state) and `PUT /api/v1/admin/features/:key` (toggle, audit-logged).
  Tenant-scoped via `req.user.schoolId`.
- ✓ Three flags seeded: `ai-authoring` (active, gates AI routes today),
  `live-proctoring` (placeholder for a future cycle), `seb-tier-3`
  (placeholder for Stage 5).
- 〇 Console UI for the SCHOOL_ADMIN to toggle flags is deferred to cycle
  2.4 (school-admin surface polish) — the API is ready, the UI is the
  remaining piece.

---

## D5 — Canvas/Moodle/Schoology in v1: confirm K-12 footprint

- **Status:** Open (needs product input)
- **Raised:** Cycle 0.2, batch 2
- **Owner:** product

### Context

Cycle 0.2 segment was **K-12 schools (UK/US/EU)**, but the LMS picks
included **Canvas + Moodle + Schoology**. Canvas is overwhelmingly
higher-ed. Moodle has a notable UK FE / sixth-form footprint and
international K-12 use. Schoology is more K-12-native (US).

The combination suggests one of:
- a deliberate higher-ed/FE/sixth-form opportunism alongside K-12
- a misclick — really meant Schoology + maybe Moodle
- intent to serve UK schools that happen to run Moodle for non-exam material

### Options

1. **Keep Schoology + Moodle in v1, drop Canvas** — most K-12-coherent
2. **Keep all three but document Canvas as "best-effort, no SLA"**
3. **Drop all three from v1; LMS integration is v2** — let v1 be SSO + CSV
   only, prove the product first
4. **Keep all three; admit the higher-ed/FE adjacent market**

### Recommendation

Pending product call. **Defaulting to option 3** until we hear otherwise —
v1 ships LMS integration via LTI 1.3 (the standard) which all three speak,
and we don't certify against any specific LMS.

### Consequences

- If option 3: Stage 2 includes a generic LTI 1.3 launch + grade-passback
  flow tested against one reference LMS only (likely Moodle, since it's
  free to set up)
- If options 1/2/4: dedicated test/cert burden per LMS, and we'd need to
  staff that

---

## D6 — Portal consolidation: collapse teacher + admin into `/console`?

- **Status:** Decided — Option 1 (collapse). Implemented in cycle 2.0b.
- **Raised:** `docs/00-audit.md` §12 Q4
- **Implemented:** Cycle 2.0b (branch `claude/stage-2-cycle-2-0b-console-merge`)

### Context

*Pre-decision state, preserved for the record. The repo state below is
what existed before cycle 2.0b; see Consequences for what's true now.*

Today the repo has **five frontend portals**: `student`, `teacher`, `admin`,
`superadmin`, plus the `api`. The teacher and admin portals share most of
their build configuration, design, and shared-frontend integration. The
divergence between them is shallower than the build cost of running them
as separate Vite apps.

Cycle 0.2 confirmed the school IT lead is the most-privileged customer
role; that role naturally sits in the same portal as the teacher (same
school, same SSO context, same nav shell, just more capabilities).

The vendor `Platform Admin` portal (per D1) stays separate by design — it
is a different audience on a different subdomain.

### Options

1. **Collapse `teacher` + `admin` into a single `console` app, role-aware**
   *(recommended)* — drops build matrix from 5 to 4 (then 3 once Platform
   Admin replaces today's superadmin per D1). Same shared-frontend, same
   tokens, role gates the routes.
2. **Keep separate** — clearer URL structure, double the build cost.
3. **Collapse all three (teacher + admin + superadmin)** — rejected: D1
   says vendor-side stays separate.

### Recommendation

Option 1, after D1 is decided. The split is logically: customer console
(teacher + school admin) vs. vendor console (platform admin) vs. student
exam-taking.

### Consequences

- ✓ `apps/teacher` renamed to `apps/console` via `git mv` (history preserved); `apps/admin` deleted; admin pages moved to `apps/console/src/pages/admin/*`.
- ✓ Role-aware routing: TEACHER + SCHOOL_ADMIN + PLATFORM_ADMIN all land at `/`. The new `AdminRoute` wrapper guards `/admin/*` for SCHOOL_ADMIN / PLATFORM_ADMIN only. `Layout` shows the Admin nav section conditionally on role.
- ✓ Single deploy target: `docker/Dockerfile.console` (replaces `Dockerfile.teacher` + `Dockerfile.admin`); single nginx vhost (`console.yourschool.edu` replaces `teacher.*` + `admin.*`); single CI build step.
- ✓ Root `package.json` `dev` and `build` scripts updated; staging + prod compose volumes consolidated.
- 〇 The merged `Layout` keeps the existing teacher visual treatment for now. Stage 4 (design system) will give teachers and admins a more obviously-segmented chrome if needed; for now the role badge in the sidebar footer is the only visual difference.

---

## D7 — Concurrent-scale ceiling and WebSocket horizontal scaling

- **Status:** Decided — Option 2 (multi-school peak day, ~5,000 concurrent students). Stage 3 work begins cycle 3.0a.
- **Raised:** `docs/00-audit.md` §12 Q5
- **Implemented:** in flight (cycle 3.0a)

### Context

WebSocket pub/sub is **single-instance today** (audit §5.3). Horizontal
scaling needs Redis pub/sub fan-out (already a dependency for refresh
tokens, OTP rate-limit, idempotency — audit §1) but not yet wired for WS.

We need a target peak concurrency to size:

- WS connections per node
- Postgres connection pool
- Redis throughput
- Whether autosave goes through WS or HTTP (HTTP scales easier)

### Options to put in front of product

1. **Single school, ~500 concurrent students** — single-instance is fine.
   No infra investment in Stage 1.
2. **Multi-school peak day, ~5,000 concurrent students** — needs WS
   fan-out via Redis. Stage 3 work.
3. **National exam day, ~50,000+ concurrent students** — different
   architecture entirely (regional shards, dedicated WS tier, Postgres
   read replicas, queue-backed autosave). Not a v1 ask.

### Decision

Option 2. Realistic K-12 ceiling: a typical UK secondary school running
mock GCSEs has ~250 students per year group; 20 schools doing that on
the same morning is 5k. Below that we're under-investing in the wedge
("works on exam day"); above 50k we'd need a different architecture
and probably a different conversation about who's buying.

### Consequences

- ✓ Stage 3 plan documented in `docs/06-stage3-plan.md` (cycle 3.0a).
- ✓ Postgres connection pool exposed via env (`apps/api/src/lib/prisma.ts`)
  so ops can tune for the multi-replica deploy without rebuilding.
- ✓ WS broadcast abstraction landed (`apps/api/src/lib/wsBroadcast.ts`):
  in-process implementation (cycle 3.0a) + `RedisPubSubBroadcaster`
  (cycle 3.0b). Factory picks based on `WS_BROADCASTER` env. Default
  stays in-process; production deploy sets `WS_BROADCASTER=redis-pubsub`
  + `REDIS_URL` and bumps `API_REPLICAS`.
- ✓ Load-test scaffolding (`scripts/load-test/`) targets 5k concurrent
  WS + 10k req/s of HTTP autosave so we can negotiate with numbers.
- ✓ Redis pub/sub WS fan-out (cycle 3.0b).
- ✓ REST autosave authoritative; WS `session:answer` reduced to a no-op
  stub for backwards compat (cycle 3.0c). REST handler now also pushes
  `proctor:update` via the broadcaster.
- 〇 Postgres read-replica wiring (deferred — D7 Option 2 doesn't need
  it; if peak-day numbers from the load test push past 5k, revisit).

### Recommendation history

Pending product input was the original status; pre-decision recommendation
was Option 2 ("multi-school peak day"). Ratified 2026-05-10.

### Consequences

- If option 1: defer Stage 3 WS fan-out
- If option 2: Stage 3 includes Redis pub/sub fan-out + horizontal WS;
  autosave moves to HTTP idempotent POST (already partly in place via
  idempotency middleware — audit §1)
- If option 3: re-architect; this is a separate Stage altogether

---

**End of decisions log. Append new decisions below.**
