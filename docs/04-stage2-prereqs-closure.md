# Stage 2 prereqs — Closure

**Date:** 2026-05-10
**Branches:** `claude/stage-2-cycle-2-0a-role-split` → `…2-0b-console-merge` → `…2-0c-platform-rename` → `…2-0d-prereqs-closure` → `…2-0e-d4-feature-flags` → `…2-0f-impersonation-audit` (this)
**Inputs:** `docs/00-audit.md`, `docs/01-product.md`, `docs/02-north-star.md`, `docs/decisions.md` (D1, D4, D6), `docs/03-stage1-closure.md`
**Status:** Stage 2 structural prerequisites closed. Hero workflows (cycles 2.1+) can now begin.

> **Cycle 2.0f update (this revision):** sub-stage rolls up two more cycles
> after the original 2.0d closure — D4 implementation (cycle 2.0e) and the
> cross-tenant impersonation audit trail (cycle 2.0f). Six cycles total now
> in this prereqs sub-stage.

---

## 0. What this sub-stage was for

Stage 2 was always going to need two structural calls before any hero-workflow rebuild made sense:

- **D1** — split the conflated `SUPER_ADMIN` role into vendor-side `PLATFORM_ADMIN` (cross-tenant) + customer-side `SCHOOL_ADMIN` (scoped to one school). Without this, the school IT lead — the most-privileged customer-side persona per `docs/01-product.md` §1.2 — could only be served by handing them a role that legally controls every other school on the platform.
- **D6** — collapse `apps/teacher` + `apps/admin` into a single role-aware `apps/console`. With D1's role names cleaned up, the visual + URL separation between TEACHER and SCHOOL_ADMIN was shallower than the build cost of running two SPAs.

Plus a third tactical cleanup that fell out of D1:

- **2.0c rename** — `apps/superadmin` → `apps/platform`, and `apps/api/src/modules/superadmin` → `apps/api/src/modules/platform`, so the file system matches the role names.

Six commits, one coherent unit:

| Commit | Cycle | Scope |
| --- | --- | --- |
| `db6fcd5` | **2.0a** | Schema + 58-touchpoint code sweep + `/auth/refresh` user-payload bug fix |
| `46431ac` | **2.0b** | `git mv` teacher → console; admin pages folded in under `/admin/*` with `AdminRoute` guard; `apps/admin` deleted; build matrix collapsed |
| `8ecaeb8` | **2.0c** | `git mv` superadmin → platform; api module rename; infra (CI / nginx / compose) caught up |
| `f9b528c` | **2.0d** | This closure doc (initial revision) |
| `6d740cb` | **2.0e** | D4 — `Feature` + `SchoolFeature` tables + helper + AI-route gating + admin endpoints |
| *(this commit)* | **2.0f** | AuditLog cross-tenant columns (`actorRole` / `actorSchoolId` / `targetSchoolId` / `impersonation`); `auditFromReq` helper; PLATFORM_ADMIN provisioning + offboarding + admin overrides + feature toggles all flow through it |

---

## 1. Decision-→-implementation map

| Decision | Status before | Status after | Cycle | Outcome |
| --- | --- | --- | --- | --- |
| **D1** — split `SUPER_ADMIN` | Open (recommendation: split) | Decided — Option 1 | 2.0a | `Role.ADMIN` → `Role.SCHOOL_ADMIN`; `Role.SUPER_ADMIN` → `Role.PLATFORM_ADMIN`. Schema migration + 58 code touchpoints + middleware + comments. |
| **D6** — collapse teacher + admin into `/console` | Open (recommendation: collapse, gated on D1) | Decided — Option 1 | 2.0b | `apps/teacher` → `apps/console`; `apps/admin` deleted, pages folded in under `/admin/*`; `AdminRoute` gate + role-aware `Layout`; build matrix 4 SPAs → 3. |
| **2.0c** — finish post-D1 cleanup | n/a | Done | 2.0c | `apps/superadmin` → `apps/platform`; api module rename; nginx vhost + Docker volume + CI step renamed. |
| **D4** — per-school AI feature flag | Open (recommendation: dedicated `Feature` table) | Decided — Option 2 | 2.0e | `Feature` + `SchoolFeature` tables; `schoolFeatureEnabled()` helper (Redis-cached, fail-closed); AI routes return 403 + `code: 'feature_disabled'` for non-PLATFORM_ADMIN callers when off; `GET/PUT /admin/features/:key` admin endpoints. |
| **2.0f** — cross-tenant impersonation audit | n/a (deferred from 2.0d closure §4) | Done | 2.0f | `audit_logs` gains `actorRole` / `actorSchoolId` / `targetSchoolId` / `impersonation` columns; `auditFromReq()` helper auto-flags PLATFORM_ADMIN actions on tenants; PLATFORM_ADMIN provisioning + offboarding now audit-logged (previously a gap); SOC 2 / GDPR ledger query helper `getImpersonationEvents()`. |

D1, D4, D6 are now marked **Decided** in `docs/decisions.md` with implementation-traceable consequences lists.

---

## 2. The repo's new shape

### Apps

```
apps/
├── api/        Express + Prisma + WS                    (unchanged structure; module rename only)
├── student/    Student exam-taking SPA                  (unchanged)
├── console/    School Console — TEACHER + SCHOOL_ADMIN  (NEW — was teacher + admin)
└── platform/   Platform Admin — PLATFORM_ADMIN          (was superadmin)
```

### Roles

```
PLATFORM_ADMIN  vendor-side, cross-tenant by design
SCHOOL_ADMIN    customer-side, scoped to one schoolId
TEACHER         scoped to one schoolId, owns/co-proctors exams
STUDENT         scoped to one schoolId, sees own data only
```

The pre-D1 names (`ADMIN`, `SUPER_ADMIN`) are gone from the codebase. Pre-decision-state references in `docs/decisions.md` D1/D6 are explicitly marked as such; everything else describes the current state.

### Hostnames

```
exam.yourschool.edu          STUDENT
console.yourschool.edu       TEACHER + SCHOOL_ADMIN  (was teacher.* + admin.*)
api.yourschool.edu           API
platform.secureexam.app      PLATFORM_ADMIN          (vendor-only subdomain)
```

### Build matrix

```
docker/
├── Dockerfile.api
├── Dockerfile.student
├── Dockerfile.console     (was Dockerfile.teacher + Dockerfile.admin)
├── Dockerfile.platform    (was Dockerfile.superadmin)
└── nginx-spa.conf
```

CI builds 4 images instead of 5; nginx serves 4 vhosts instead of 5.

---

## 3. What ships beyond the renames

This stack isn't only mechanical sweeps — six real engineering items landed:

1. **`AdminRoute` guard** (`apps/console/src/App.tsx`) — `SCHOOL_ADMIN` and `PLATFORM_ADMIN` only. TEACHER hitting `/admin/users` redirects to `/`, not 403, so the rejection feels like "wrong room" rather than "you tripped a trap."
2. **Role-aware `Layout`** (`apps/console/src/components/Layout.tsx`) — Admin nav section renders only when the user has the role. Footer carries the role badge so support engineers impersonating a school can see at a glance which surface they're operating on.
3. **`/auth/refresh` user-payload bug fix** (`apps/api/src/modules/auth/auth.service.ts`) — the cycle-1.1b superadmin silent-refresh-on-mount expected `data.user` in the response, but the API only returned tokens. Every reload was silently bouncing to `/login`. Fixed: `refresh()` now returns `user` alongside the tokens; `auth.router.ts` passes it through.
4. **`schoolFeatureEnabled()` + `setSchoolFeature()` helper** (`apps/api/src/lib/featureFlags.ts`) — Redis-cached, fail-closed feature gate used by every AI route. PLATFORM_ADMIN bypasses for support; toggle writes audit-log via the existing audit table.
5. **`auditFromReq()` helper** (`apps/api/src/lib/examAccess.ts`) — populates `actorRole`, `actorSchoolId`, `targetSchoolId` and computes the `impersonation` flag automatically. Existing `audit()` calls keep working (impersonation defaults to false, which is correct for tenant-scoped actions).
6. **`getImpersonationEvents()` ledger** (`apps/api/src/lib/auditQuery.ts`) — single query for "every cross-tenant action in the last N days, optionally scoped to one school." This is the SOC 2 / GDPR evidence trail that was promised in `docs/01-product.md` §5 and was previously distributed across handler-specific log calls.

---

## 4. What didn't ship (and why)

Honest list, mirroring the discipline of `docs/03-stage1-closure.md` §4:

- **SQL `CHECK` constraint** enforcing role↔schoolId pairing (`PLATFORM_ADMIN` may have NULL `schoolId`; every other role must not). Prisma doesn't generate it from schema; needs a deferred-genericity hook. The runtime constraint is enforced at the application layer instead. Follow-up: own cycle when there's appetite for hand-written migrations alongside Prisma's.
- **`package-lock.json` regeneration**. CI's `npm ci` will fail across PRs #5/#6/#7/#9 (schema migrations rename workspace dirs) until someone runs `npm install` and commits the regenerated lockfile. One regen covers all four. Easier to do as a single follow-up commit than to ask each PR to handle it.
- **Stage 4 design system** — Notion-warm vs focus-mode split (D3) and a proper visual treatment for the platform admin portal (currently still inheriting its dark dashboard look from the original superadmin app). Deliberately deferred: doing it on top of teacher + admin merged into console is cheaper than doing it on each separately.
- **SCHOOL_ADMIN console UI for feature flags.** The `/admin/features/:key` API is ready (cycle 2.0e) and audit-logged via the impersonation ledger (cycle 2.0f), but the toggle UI in `apps/console` is deferred to cycle 2.4 (school-admin surface polish). Until then, flags get flipped via direct API call or the platform admin portal acting on a school's behalf.
- **Bulk back-fill of `actorRole` / `actorSchoolId` for pre-existing audit rows.** Cycle 2.0f only enriches new writes; the migration leaves historical rows with NULL in the new columns. Greenfield posture means no real history to back-fill, but if a real customer ever lands before this is addressed, the back-fill needs a one-shot script that joins to `users` (or to a `users_history` table — which doesn't exist yet either).
- **Hero-workflow rebuilds** (cycles 2.1+). The infrastructure is now coherent enough for them to begin; what blocks now is product input on what "good" looks like for each surface, not engineering.

---

## 5. The PR stack

In dependency order. Each PR's base is the previous one so the chain reviews together.

| # | Cycle | What | Base |
| --- | --- | --- | --- |
| **#2** | Stage 0 | Audit + brief + decisions + north star | `Claudy` |
| **#3** | Stage 1 (1.1a → 1.3 + closure) | All P0s + 10 P1s + invariant tests | `Claudy` |
| **#4** | Cycle 1.4 | Sentry + staging + dev-certs + PR template | PR #3 |
| **#5** | Cycle 2.0a | **D1** — role split | PR #4 |
| **#6** | Cycle 2.0b | **D6** — `apps/console` merge | PR #5 |
| **#7** | Cycle 2.0c | post-D1 rename — `apps/platform` | PR #6 |
| **#8** | Cycle 2.0d | this closure doc (initial) | PR #7 |
| **#9** | Cycle 2.0e | **D4** — per-school AI feature flag | PR #8 |
| **#10** | Cycle 2.0f | impersonation audit + closure-doc rollup | PR #9 |

After PR #2 lands, retargets cascade. Recommend merging the chain bottom-to-top (`#2` → … → `#10`) rather than squashing — the cycle granularity is real review cadence and bisect-friendly.

---

## 6. What hero workflows want next

The four heroes from `docs/01-product.md` §3, ordered by recommended cycle priority:

| Cycle | Hero | Notes |
| --- | --- | --- |
| **2.1** | Teacher exam-authoring | Largest surface. Sectioning, question-pool fluency, AI-assist gated by **D4** (per-school feature flag), preview-as-student. Wants product input on what cleanup vs. rebuild looks like for `apps/console/src/pages/ExamBuilderPage.tsx`. |
| **2.2** | Results review + grading | Per-question rubric, class-level analytics, release controls. Cross-tenant safety already enforced by Stage 1; the UI just needs to be useful. |
| **2.3** | Student exam-taking (focus-mode polish) | Hot-path correctness landed in cycle 1.2. Stage 4 will give it the focus-mode design treatment per **D3**. Worth doing together with Stage 4 rather than in isolation. |
| **2.4** | School onboarding + bulk import | The cliff. SSO setup (Microsoft-first per `docs/01-product.md` §6.1) + CSV import + audit-log review. Touches Stage 5 (real SSO/SCIM). |

Two open ADRs remain that gate parts of Stage 2 (D4 was Decided in cycle 2.0e):

- **D5** — Canvas/Moodle/Schoology v1 priority given K-12-only positioning. Recommendation: defer all three to v2; v1 ships LTI 1.3 generic, no certification per LMS. Cycle 2.4 (onboarding) will trip over this.
- **D7** — concurrent-students target. Recommendation: plan for 5,000 concurrent (multi-school peak day), defer geo-shard. Cycle 2.3 / Stage 3 work depends on this.

Plus **D3** (two-mode design system: Notion-warm + focus-mode) is still Open but explicitly Stage-4 territory, not blocking any 2.x work.

---

## 7. Cross-references

- **Backward**: `docs/00-audit.md` (diagnosis), `docs/01-product.md` (brief), `docs/02-north-star.md` (12-month vision), `docs/03-stage1-closure.md` (Stage 1 closure), `docs/decisions.md` (D1, D2, D4, D6 marked Decided; D3, D5, D7 still Open)
- **Sideways**: PRs #2 → #10 (the implementation chain)
- **Forward**: Stage 2 hero cycles (2.1 → 2.4); Stage 3 (scale + WS fan-out, gated on D7); Stage 4 (design system, gated on D3); Stage 5 (high-stakes integrations + SEB)

---

**End of Stage 2 prereqs closure. The chain is review-ready; hero work pauses for product input on D5 + D7 and on cycle 2.1 scope.**
