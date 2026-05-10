# SecureExam

A browser-based exam platform for K-12 schools. Three frontend SPAs
(student, school console, vendor platform admin) plus a
Node + Express + Prisma + Postgres + Redis backend.

> **Status (May 2026):** mid-stage rebuild. The current product brief, 12-month
> vision, and decision log live in `docs/`:
>
> - [`docs/00-audit.md`](docs/00-audit.md) — ground-truth audit of the
>   codebase as of cycle 0.1.
> - [`docs/01-product.md`](docs/01-product.md) — who buys this, who uses
>   it, what it ships.
> - [`docs/02-north-star.md`](docs/02-north-star.md) — 12-month vision +
>   anti-patterns.
> - [`docs/decisions.md`](docs/decisions.md) — ADR log (D1–D7).
> - [`docs/03-stage1-closure.md`](docs/03-stage1-closure.md) — Stage 1
>   security & stability hardening, what shipped vs deferred.
> - [`docs/04-stage2-prereqs-closure.md`](docs/04-stage2-prereqs-closure.md)
>   — Stage 2 prereqs (D1 role split, D6 portal merge, D4 feature flags,
>   cross-tenant impersonation audit).
> - [`docs/05-manual-testing.md`](docs/05-manual-testing.md) — end-to-end
>   walkthroughs: chaos test, per-cycle smoke checks, hot-path
>   durability for the four hero workflows, compliance smoke checks.
>
> Per-app overviews:
>
> - [`apps/api/README.md`](apps/api/README.md) — backend layout + tests
>   that pin the architecture invariants
> - [`apps/student/README.md`](apps/student/README.md) — exam-taking SPA,
>   anti-cheat surface, IndexedDB autosave + server-authoritative timer
> - [`apps/console/README.md`](apps/console/README.md) — TEACHER +
>   SCHOOL_ADMIN role-aware console (was teacher + admin pre-D6)
> - [`apps/platform/README.md`](apps/platform/README.md) — vendor-only
>   PLATFORM_ADMIN portal (was superadmin pre-2.0c)
>
> Older operational docs (`docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md`,
> `docs/RUNBOOK.md`) describe the pre-Stage-1 state and are accurate where
> they overlap with the closure docs above. Phase 1–9 history lives in
> [`docs/archive/`](docs/archive).

---

## Quick Start (Local Dev — 5 minutes)

### Prerequisites

- Node.js 20+
- Docker + Docker Compose

### 1. Clone and install

```bash
git clone https://github.com/yourorg/secureexam.git
cd secureexam
npm install
```

### 2. Start the database

```bash
docker compose up -d postgres redis
```

### 3. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env if needed (defaults work for local dev)
```

### 4. Run database migrations and seed demo data

```bash
npm run db:migrate    # creates all tables
npm run db:seed       # creates demo school, teacher, students, and one exam
```

### 5. Start all apps

```bash
npm run dev
```

| App                | URL                          | Audience                                           | Demo creds                                |
| ------------------ | ---------------------------- | -------------------------------------------------- | ----------------------------------------- |
| Student exam page  | http://localhost:5173        | STUDENT                                            | `student1@demo.school.edu` / `student123` |
| School console     | http://localhost:5174        | TEACHER + SCHOOL_ADMIN (role-aware sidebar)        | `teacher@demo.school.edu` / `teacher123`  |
| Platform admin     | http://localhost:5176        | PLATFORM_ADMIN (vendor-only)                       | `admin@demo.school.edu` / `admin123` *(seeded as PLATFORM_ADMIN per `prisma/seed.ts`)* |
| API                | http://localhost:4000/api/v1 | —                                                  | —                                         |
| API health         | http://localhost:4000/health/ready | —                                            | —                                         |

The school console at `:5174` is the merged customer-side surface from
cycle 2.0b (D6) — TEACHER and SCHOOL_ADMIN both land at `/`; the Admin
section of the sidebar renders only for SCHOOL_ADMIN / PLATFORM_ADMIN.

---

## Project Structure

```
secureexam/
├── apps/
│   ├── api/                    Node.js + Express + Prisma backend
│   │   ├── src/
│   │   │   ├── modules/        auth, users, schools, questions, exams,
│   │   │   │                   sessions, reports, pins, admin, audit,
│   │   │   │                   exports, grading, ai, media, sen,
│   │   │   │                   security, integrity, analytics, qti,
│   │   │   │                   assessment, platform
│   │   │   ├── websocket/      bearer.<jwt> subprotocol auth + heartbeat
│   │   │   ├── middleware/     auth (JWT), idempotency, requestId
│   │   │   └── lib/            prisma, jwt (HS256-pinned), examAccess
│   │   │                       (tenantScope + auditFromReq), featureFlags,
│   │   │                       auditQuery (impersonation ledger), sentry
│   │   │                       (no-op without SENTRY_DSN), env, redis,
│   │   │                       logger (pino), metrics (prom-client)
│   │   └── prisma/
│   │       ├── schema.prisma   Full schema; Role = STUDENT | TEACHER |
│   │       │                   SCHOOL_ADMIN | PLATFORM_ADMIN
│   │       └── seed.ts         Demo data
│   ├── student/                Student exam-taking SPA (port 5173)
│   ├── console/                Customer-side console (port 5174) — was
│   │                           apps/teacher + apps/admin pre-D6
│   └── platform/               Vendor Platform Admin SPA (port 5176) —
│                               was apps/superadmin pre-2.0c
├── packages/
│   ├── shared-types/           TypeScript types shared across all apps
│   └── shared-frontend/        Auth store + axios client w/ single-flight
│                               401 refresh; used by all 3 SPAs
├── docker/                     Dockerfile.{api,student,console,platform} +
│                               nginx-spa.conf
├── nginx/                      Production reverse proxy config (HTTPS;
│                               5 vhosts)
├── docker-compose.yml          Local dev (postgres + redis)
├── docker-compose.prod.yml     Production stack
├── docker-compose.staging.yml  Staging mirror with self-signed certs
└── scripts/
    └── dev-certs.sh            Generates self-signed certs for nginx
                                HTTPS on a developer's laptop
```

---

## Roles

After cycle 2.0a (D1 role split):

| Role             | Where                                  | Scope                                      |
| ---------------- | -------------------------------------- | ------------------------------------------ |
| `STUDENT`        | apps/student                           | Own data only                              |
| `TEACHER`        | apps/console                           | Their own + co-proctored exams             |
| `SCHOOL_ADMIN`   | apps/console (`/admin/*`)              | Their school's data                        |
| `PLATFORM_ADMIN` | apps/platform                          | Vendor-side, cross-tenant by design        |

Tenant scoping is enforced at the helper layer (`apps/api/src/lib/examAccess.ts`)
via `tenantScope(role, schoolId)` and `canManageExam` / `canProctorExam`. The
static-scan invariant test (`apps/api/test/tenantInvariant.test.ts`) fails CI
if a router reintroduces `findUnique({ where: { id: req.params.x }})` outside
the platform admin allowlist.

---

## API Reference

Base URL: `http://localhost:4000/api/v1`

All authenticated routes require: `Authorization: Bearer <access_token>`

### Auth

| Method | Path            | Auth   | Description                                                 |
| ------ | --------------- | ------ | ----------------------------------------------------------- |
| POST   | `/auth/login`   | No     | Login → access token + refreshToken cookie + user           |
| POST   | `/auth/refresh` | Cookie | Cookie-only (P1-7); body fallback removed in cycle 1.3      |
| POST   | `/auth/logout`  | Cookie | Revoke refresh-token family + clear cookie                  |

### Questions (TEACHER+)

| Method | Path             | Description                                                     |
| ------ | ---------------- | --------------------------------------------------------------- |
| GET    | `/questions`     | List questions (filter: `type`, `difficulty`, `search`, `tags`) |
| POST   | `/questions`     | Create question                                                 |
| PUT    | `/questions/:id` | Update question                                                 |
| DELETE | `/questions/:id` | Delete question                                                 |

### Exams (TEACHER+)

| Method | Path                       | Description                             |
| ------ | -------------------------- | --------------------------------------- |
| GET    | `/exams`                   | List teacher's exams                    |
| POST   | `/exams`                   | Create exam                             |
| GET    | `/exams/:id`               | Get exam with items                     |
| PUT    | `/exams/:id`               | Update exam                             |
| POST   | `/exams/:id/publish`       | Publish exam                            |
| POST   | `/exams/:id/assign`        | Assign to classes `{ classIds: [...] }` |
| POST   | `/exams/:id/items`         | Add question `{ questionId, points? }`  |
| DELETE | `/exams/:id/items/:itemId` | Remove question                         |
| PUT    | `/exams/:id/items/reorder` | Reorder `{ itemIds: [...] }`            |

### Sessions (STUDENT)

| Method | Path                      | Description                                             |
| ------ | ------------------------- | ------------------------------------------------------- |
| GET    | `/sessions/my`            | List available exams + session status                   |
| POST   | `/sessions`               | Start/resume session `{ examId }`                       |
| POST   | `/sessions/:id/answer`    | Save answer `{ questionId, selectedIds?, textAnswer? }`. Idempotent (idempotency-key middleware) |
| POST   | `/sessions/:id/violation` | Report violation `{ type, description? }`               |
| POST   | `/sessions/:id/submit`    | Submit exam                                             |
| POST   | `/sessions/:id/unlock`    | Unlock after violation `{ pin, examId }`                |
| POST   | `/sessions/:id/exit`      | Exit with PIN `{ pin, examId }`                         |

### Reports (TEACHER+)

| Method | Path                                     | Description                                                          |
| ------ | ---------------------------------------- | -------------------------------------------------------------------- |
| GET    | `/reports/exams/:id`                     | Full results: summary, per-question, per-student. Tenant-scoped.     |
| GET    | `/reports/exams/:id/sessions/:sessionId` | Single student detail. Tenant-scoped.                                |

### PINs (TEACHER+)

| Method | Path             | Description                                                                       |
| ------ | ---------------- | --------------------------------------------------------------------------------- |
| POST   | `/pins/generate` | Generate PINs `{ examId, purposes: ['UNLOCK','EXIT'] }`. Idempotent (cycle 1.3).  |
| GET    | `/pins/:examId`  | Check PIN status (not values). Tenant-scoped via `canManageExam`.                 |

### School Admin (`SCHOOL_ADMIN` + `PLATFORM_ADMIN`)

| Method | Path                                          | Description                                                                |
| ------ | --------------------------------------------- | -------------------------------------------------------------------------- |
| POST   | `/admin/users/bulk-import`                    | CSV import (rewritten cycle 2.1a — batched bcrypt + `createMany`, ~8× faster) |
| POST   | `/admin/exams/:id/close`                      | Close any exam in caller's school. Audit-logged with impersonation flag.   |
| GET    | `/admin/features`                             | List feature catalogue + this school's enabled state (cycle 2.0e / D4)     |
| PUT    | `/admin/features/:key`                        | Toggle a feature `{ enabled: boolean }`. Audit-logged (cycle 2.0e / D4).   |

### Platform Admin (`PLATFORM_ADMIN` only)

| Method | Path                       | Description                                                |
| ------ | -------------------------- | ---------------------------------------------------------- |
| POST   | `/platform/schools`        | Provision a new school. Audit-logged with impersonation=true (cycle 2.0f). |
| DELETE | `/platform/schools/:id`    | Offboard a school. Audit-logged with impersonation=true.   |
| GET    | `/platform/stats`          | Cross-tenant aggregate stats                               |

---

## WebSocket Protocol

Connect: `ws://localhost:4000/ws?sessionId=<id>&examId=<id>`
Subprotocol header: `bearer.<jwt>`

The `?token=` query fallback was removed in cycle 1.1b (P1-2) — query
strings travel through proxy access logs; subprotocol headers do not. Both
clients (`apps/student/src/pages/ExamSessionPage.tsx` and
`apps/console/src/hooks/useProctor.ts`) use the subprotocol path.

### Client → Server

```json
{ "type": "session:heartbeat", "payload": { "sessionId": "..." }, "timestamp": "..." }
{ "type": "session:answer",    "payload": { "sessionId": "...", "questionId": "...", "selectedIds": ["a"] }, "timestamp": "..." }
{ "type": "session:violation", "payload": { "sessionId": "...", "type": "TAB_SWITCH" }, "timestamp": "..." }
```

### Server → Client

```json
{ "type": "pong",                "payload": { "secondsRemaining": 1734 } }
{ "type": "violation:recorded",  "payload": { "violationCount": 1, "maxViolations": 3 } }
{ "type": "session:locked",      "payload": { "reason": "TAB_SWITCH" } }
{ "type": "session:force_submit", "payload": { "reason": "Maximum violations reached" } }
{ "type": "answer:saved",        "payload": { "questionId": "..." } }
```

The `secondsRemaining` field on `pong` is the server-authoritative timer
(cycle 1.2 / P1-3). Client interpolates between pongs for smooth UI but
snaps to the server value if drift exceeds 3 s.

---

## Database

### Migrate and seed

```bash
# Apply all migrations
npm run db:migrate

# Seed with demo data
npm run db:seed

# Open Prisma Studio (visual DB browser)
npm run db:studio
```

### Demo accounts (after seeding)

| Role             | Email                      | Password   |
| ---------------- | -------------------------- | ---------- |
| `PLATFORM_ADMIN` | admin@demo.school.edu      | admin123   |
| `SCHOOL_ADMIN`   | school.admin@demo.school.edu | admin123 |
| `TEACHER`        | teacher@demo.school.edu    | teacher123 |
| `STUDENT` 1      | student1@demo.school.edu   | student123 |
| `STUDENT` 2      | student2@demo.school.edu   | student123 |
| `STUDENT` 3–5    | student3-5@demo.school.edu | student123 |

---

## Lockdown Browser — Anti-Cheat Features

The student SPA (`apps/student`) enforces:

| Feature                      | Implementation                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Fullscreen required          | `requestFullscreen()` before exam starts; `fullscreenchange` event monitors exit    |
| Tab switching                | `visibilitychange` event                                                            |
| Window blur (Alt+Tab)        | `window.blur` event                                                                 |
| Right-click                  | `contextmenu` event → `preventDefault()`                                            |
| Keyboard shortcuts           | `keydown` capture: F1–F12, Ctrl+U/C/S/V/A/P/F/H/T/W/N/R, Alt+F4/Tab, Meta+R/C/Q/W/N |
| Copy/paste/cut               | `copy`, `cut`, `paste` events → `preventDefault()`                                  |
| Drag & drop                  | `dragstart` → `preventDefault()`                                                    |
| Heartbeat                    | Sent every 15s via WebSocket; server detects disconnection                          |
| Violation debounce           | Same violation type throttled to once per 2s                                        |
| PIN lock screen              | After N violations, exam locks; instructor PIN required to resume                   |
| Auto-submit                  | On max violations or timer expiry                                                   |
| **Server-authoritative timer** | WS heartbeat reply carries canonical `secondsRemaining` (cycle 1.2)               |
| **Persistent answer queue**  | IndexedDB-backed; survives tab close + network blip (cycle 1.2)                     |

Tier-3 sit-down exams need Safe Exam Browser on Windows (Stage 5
roadmap; placeholder feature flag `seb-tier-3` already in catalogue).

---

## PIN Security

- PINs are 4-digit random numbers generated with `crypto.randomInt`
- Stored as **bcrypt hashes (cost 12)** in the `exam_pins` table
- Plain PIN is returned **once** at generation time and never stored
- Unlock PINs can be reused within the exam; Exit PINs are single-use
- Expire after 24 hours automatically
- `POST /pins/generate` is idempotency-key safe (cycle 1.3 / P1-15) — a
  retried request returns the cached response, not a fresh PIN set

---

## Production Deployment

### 1. Prepare the server

```bash
# On your server (Ubuntu 22.04+)
apt-get update && apt-get install -y docker.io docker-compose-plugin
systemctl enable --now docker
mkdir -p /opt/secureexam && cd /opt/secureexam
```

### 2. Configure environment

```bash
cp .env.production.example .env
nano .env   # fill in all values
```

The API refuses to start if `JWT_SECRET` / `JWT_REFRESH_SECRET` are
missing, default, or shorter than 32 chars (`apps/api/src/lib/env.ts`).
Set `SENTRY_DSN` to enable error tracking (cycle 1.4); leave it unset
for a no-op.

### 3. Deploy

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml --profile migrate up migrate
docker compose -f docker-compose.prod.yml up -d
```

### 4. Update nginx hostnames

Edit `nginx/nginx.conf` and replace the four customer subdomains
(`exam.yourschool.edu`, `console.yourschool.edu`, `api.yourschool.edu`)
plus the vendor subdomain (`platform.secureexam.app`) with your actual
DNS. Each vhost has its own `ssl_certificate` path under
`/etc/nginx/ssl/<domain>/`.

### 5. SSL (Let's Encrypt)

```bash
apt-get install -y certbot
certbot certonly --standalone -d exam.yourschool.edu \
                              -d console.yourschool.edu \
                              -d api.yourschool.edu \
                              -d platform.secureexam.app
# certs land at /etc/letsencrypt/live/<domain>/{fullchain.pem,privkey.pem}
# bind-mount that path to /etc/nginx/ssl/ in docker-compose.prod.yml
```

For a non-prod environment (laptop or staging without real DNS), run
`./scripts/dev-certs.sh` to generate self-signed certs for the four
vhosts and add `127.0.0.1 exam.yourschool.edu …` entries to your hosts
file.

---

## Tech Stack

| Layer            | Technology                                       |
| ---------------- | ------------------------------------------------ |
| API runtime      | Node.js 20 + TypeScript                          |
| API framework    | Express.js                                       |
| ORM              | Prisma 5                                         |
| Database         | PostgreSQL 15                                    |
| Cache / pub-sub  | Redis 7                                          |
| WebSocket        | `ws` library, `bearer.<jwt>` subprotocol auth    |
| Validation       | Zod                                              |
| Auth             | JWT HS256-pinned (access 15m + refresh 7d in httpOnly cookie) |
| Passwords / PINs | bcrypt (cost 12 everywhere — cycle 1.3 / P1-5 closed the cost-10 outlier) |
| Error tracking   | Sentry (optional; no-op without `SENTRY_DSN`)    |
| Frontend         | React 18 + TypeScript + Vite                     |
| Routing          | React Router v6                                  |
| State            | Zustand (memory-only token; httpOnly refresh cookie) |
| Styling          | Tailwind CSS v3                                  |
| Containerization | Docker + Docker Compose                          |
| Reverse proxy    | Nginx (TLS 1.2/1.3, HSTS preload, OCSP stapling) |
| CI/CD            | GitHub Actions (lint, typecheck, test, build)    |

---

## Manual testing

End-to-end walkthroughs (chaos test, per-cycle smoke checks, hot-path
durability, compliance evidence trail) live in
[`docs/05-manual-testing.md`](docs/05-manual-testing.md). After
`npm run db:seed --workspace=apps/api` you have:

| Role             | Email                       | Password       |
| ---------------- | --------------------------- | -------------- |
| PLATFORM_ADMIN   | superadmin@demo.school.edu  | superadmin123  |
| SCHOOL_ADMIN     | admin@demo.school.edu       | admin123       |
| TEACHER (demo)   | teacher@demo.school.edu     | teacher123     |
| TEACHER (other)  | teacher@other.school.edu    | teacher123     |
| STUDENT 1..5     | student[1-5]@demo.school.edu | student123    |

Two schools are seeded so cross-tenant chaos cases have a real B-side.
The `ai-authoring` feature flag (cycle 2.0e / D4) is ON for the demo
school, OFF for the other one — so reviewers see both behaviours of the
gate.

## Contributing

PRs follow the template at [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md):
*Summary / Audit-link / Test-plan / Risk / Out-of-scope*. Three
discipline rules pinned by tests in `apps/api/test/`:

1. **New routes that mutate by id** use `findFirst` + `tenantScope` —
   the `tenantInvariant.test.ts` static scan fails CI on regressions.
2. **New JWT verification paths** stay HS256-only (`jwtAlg.test.ts`).
3. **New audit writes that PLATFORM_ADMIN can trigger** use
   `auditFromReq` so the `impersonation` flag gets set automatically
   (cycle 2.0f).

When in doubt, walk the relevant section of
[`docs/05-manual-testing.md`](docs/05-manual-testing.md) before
opening the PR.
