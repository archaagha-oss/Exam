# `apps/api` — SecureExam backend

Express + Prisma + Postgres + Redis. WebSocket via `ws`. Mounted at
`/api/v1`. The single source of truth for tenant scoping, AI prompt
construction, audit logging, and JWT auth.

## Quick start

```bash
docker compose up -d postgres redis
npm run db:migrate --workspace=apps/api
npm run db:seed --workspace=apps/api
npm run dev --workspace=apps/api    # serves on :4000
```

Env: copy `.env.example` to `.env`. The boot guard
(`src/lib/env.ts`) refuses to start with missing, default, or short
secrets.

## Layout

```
src/
├── app.ts              Express app: helmet, CORS, rate-limit, error handler
├── index.ts            HTTP server + WebSocket setup + Sentry init
├── lib/
│   ├── env.ts          Boot-time secret validation
│   ├── jwt.ts          HS256-pinned sign/verify (cycle 1.1a P1-1)
│   ├── examAccess.ts   tenantScope + canManageExam + canProctorExam +
│   │                   audit + auditFromReq (cycles 1.1a, 2.0a, 2.0f)
│   ├── featureFlags.ts schoolFeatureEnabled + setSchoolFeature
│   │                   (cycle 2.0e / D4 — Redis-cached, fail-closed)
│   ├── auditQuery.ts   getImpersonationEvents (cycle 2.0f compliance ledger)
│   ├── aiPrompt.ts     buildQuestionGenPrompt + buildFeedbackPrompt
│   │                   with sanitizeUserText injection guard (P1-6)
│   ├── sentry.ts       Optional integration; no-op without SENTRY_DSN
│   ├── logger.ts       pino structured logging
│   ├── metrics.ts      prom-client + custom exam-domain counters
│   ├── redis.ts        Connection pool + pub/sub stub
│   ├── refreshTokens.ts  Refresh-token family rotation in Redis
│   └── prisma.ts       Singleton Prisma client
├── middleware/
│   ├── auth.ts         authenticate + requireRole + isTeacher / isAdmin /
│   │                   isPlatformAdmin / isStudent (post-D1 names)
│   ├── idempotency.ts  Idempotency-Key handling for session writes
│   ├── requestId.ts    Per-request UUID for log correlation
│   ├── asyncHandler.ts Wraps async route handlers
│   └── validateBody.ts Zod body validator helper
├── modules/
│   ├── auth/           POST /auth/login + /refresh + /logout
│   ├── users/          User CRUD (admin)
│   ├── schools/        Read-only school info
│   ├── questions/      Question bank
│   ├── exams/          Exam authoring + scheduling + sections
│   ├── sessions/       Student-facing session start/answer/submit/violation
│   ├── reports/        Per-exam + per-student results
│   ├── pins/           UNLOCK + EXIT PINs (idempotent generation)
│   ├── proctors/       Co-proctor invite/remove
│   ├── admin/          School admin: user mgmt, classes, bulk-import,
│   │                   stats, school settings, GDPR export/erase,
│   │                   feature toggles
│   ├── audit/          Audit log read endpoints
│   ├── exports/        CSV exports (results + users)
│   ├── grading/        Rubric grading endpoints
│   ├── ai/             AI question generation (D4-gated)
│   ├── media/          File upload for question media
│   ├── student-results/ Student-facing result reads
│   ├── analytics/      Class-level analytics + assessment AI feedback
│   ├── qti/            QTI 1.2 / 2.x import
│   ├── sen/            SEN/IEP access arrangements + rest-break logging
│   ├── security/       Magic links + OTP + device fingerprint + IP allowlist
│   ├── platform/       Vendor-side cross-tenant ops (was superadmin/
│   │                   pre-cycle 2.0c)
│   └── integrity/      Cheat-detection analytics (parallelised cycle 2.1b)
└── websocket/
    └── server.ts       WS /ws — bearer.<jwt> subprotocol auth (cycle 1.1b),
                        heartbeat with server-authoritative timer (cycle 1.2)
```

## Tests

```bash
npm test --workspace=apps/api
```

Notable test files:

- `crossTenant.test.ts` — 14 negative cross-tenant regressions (cycle 1.1a)
- `tenantInvariant.test.ts` — static scan against `findUnique`-by-URL-id
  in router files; **fails CI if a new route reintroduces the IDOR
  pattern outside the platform-admin allowlist**
- `jwtAlg.test.ts` — alg-confusion regressions (cycle 1.1a / P1-1)
- `featureFlags.test.ts` — D4 helper + admin endpoints
- `auditImpersonation.test.ts` — cross-tenant audit columns + ledger
- `bulkImport.test.ts` — bulk-import behaviours (cycle 2.1a)
- `refresh.test.ts` — refresh-token rotation + cookie-only path (P1-7)
- `aiPrompt.test.ts` — prompt-injection guard + question/feedback shapes
- `idempotency.test.ts` — Idempotency-Key middleware
- `dbConstraints.test.ts` — schema-level FK + unique constraints

## Architecture invariants pinned in code

These came out of the cycle 1.1a → 2.0f work and are enforced by tests
(per `docs/02-north-star.md` §7.1):

1. **Every privileged route filters by `schoolId`.** Pinned by
   `tenantInvariant.test.ts`.
2. **JWT verify is HS256-only.** Pinned by `jwtAlg.test.ts`.
3. **Refresh token only travels via httpOnly cookie.** Pinned by the
   "rejects body-only refresh" case in `refresh.test.ts`.
4. **PLATFORM_ADMIN cross-tenant actions are flagged in `audit_logs`.**
   Pinned by `auditImpersonation.test.ts`.
5. **AI routes 403 when the per-school flag is off.** Pinned by
   `featureFlags.test.ts`.

## Cross-references

- [`docs/00-audit.md`](../../docs/00-audit.md) — original diagnosis
- [`docs/03-stage1-closure.md`](../../docs/03-stage1-closure.md) — Stage 1
  audit-finding-→-resolution map
- [`docs/04-stage2-prereqs-closure.md`](../../docs/04-stage2-prereqs-closure.md)
  — Stage 2 prereqs closure (D1, D6, D4, impersonation audit)
- [`docs/05-manual-testing.md`](../../docs/05-manual-testing.md) —
  end-to-end manual walkthroughs
- [`README.md`](../../README.md) — top-level quick-start + API reference
