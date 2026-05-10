# `apps/platform` — Platform Admin (vendor-only)

Vendor-side cross-tenant SPA. Vite + React. Audience: PLATFORM_ADMIN
only. Was `apps/superadmin` pre-cycle 2.0c — renamed to align with the
post-D1 role name.

**This SPA is vendor-only.** It runs on a non-customer subdomain
(`platform.secureexam.app` in the nginx config) with a stricter rate-
limit zone, and an IP allowlist on the upstream proxy is expected. No
school subdomain ever serves it.

## Run

```bash
npm run dev --workspace=apps/platform     # serves on :5176
```

Demo login (after `npm run db:seed --workspace=apps/api`):
`superadmin@demo.school.edu` / `superadmin123`. The login form rejects
any role that is not PLATFORM_ADMIN.

## What it does

- **Provision new schools.** `POST /api/v1/platform/schools` creates a
  school + its first SCHOOL_ADMIN account in one transaction. Cycle 2.0f
  added a `SCHOOL_PROVISIONED` audit row with `impersonation=true` for
  every provision (the action is by definition cross-tenant).
- **Offboard schools.** `DELETE /api/v1/platform/schools/:id` with a
  `confirmName` body field. Cascade-deletes via DB constraints; emits a
  `SCHOOL_DELETED` audit row.
- **Cross-tenant stats.** `GET /api/v1/platform/stats` aggregates over all
  schools (school count, user count, exam count, sessions in flight).
- **Per-school detail.** `GET /api/v1/platform/schools/:id` returns the
  school + its admins + last-30-day session counts. Used by the Schools
  detail page for support troubleshooting.
- **Schema migration controls.** Plan + execute the per-school schema
  migrations (still in dry-run mode in production).

## Auth posture

- Memory-only access token (Zustand). Never localStorage. Cycle 1.1b
  closed P0-4 (the original superadmin shipped a localStorage token —
  the most-privileged role had the weakest auth surface).
- Refresh via httpOnly cookie + single-flight 401 refresh through
  `@secureexam/shared-frontend`. Every reload re-validates the
  PLATFORM_ADMIN role.
- nginx vhost: stricter `platform_admin` rate-limit zone (5 r/s vs the
  customer 30 r/s), separate cert path, different subdomain.

## Layout

```
src/
├── App.tsx              Login + AdminRoute equivalent for PLATFORM_ADMIN
├── lib/api.ts           shared-frontend axios + single-flight refresh
├── store/authStore.ts   shared-frontend memory store
└── pages/
    ├── OverviewPage.tsx       cross-tenant KPIs
    ├── SchoolsPage.tsx        list + provision + offboard
    ├── SchoolDetailPage.tsx   per-school detail
    ├── NewSchoolPage.tsx      provisioning form
    └── MigrationPage.tsx      schema migration planning
```

## Compliance notes

Every action a PLATFORM_ADMIN takes is implicitly cross-tenant. Cycle
2.0f added the `actorRole` / `actorSchoolId` / `targetSchoolId` /
`impersonation` columns on `audit_logs` so the SOC 2 / FERPA auditor
question "show me every cross-tenant action by vendor staff in the last
quarter" is one query (`getImpersonationEvents()` in
`apps/api/src/lib/auditQuery.ts`), not a hand-written join.

## Cross-references

- [`docs/decisions.md`](../../docs/decisions.md) D1 — the role-split that
  made this app `apps/platform` rather than the (mis-named) `superadmin`
- [`docs/04-stage2-prereqs-closure.md`](../../docs/04-stage2-prereqs-closure.md)
  §2 — post-rename topology
- [`docs/05-manual-testing.md`](../../docs/05-manual-testing.md) §2.4 +
  §4.1 — manual flows that exercise this app
