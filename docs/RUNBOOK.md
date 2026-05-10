# SecureExam — Operational Runbook

**Audience:** SRE / oncall during incidents. Owners: platform team.
**Scope:** production stack defined by `docker-compose.prod.yml` and
`nginx/nginx.conf`. Reflects state through Stage 3 (cycle 3.0d) — multi-replica
API + Redis pub/sub WS fan-out + REST-authoritative autosave.

For background see:

- [`README.md`](../README.md) §"Production Deployment" — current 4-vhost layout
- [`docs/04-stage2-prereqs-closure.md`](04-stage2-prereqs-closure.md) — D1 / D6 / D4 / 2.0f
- [`docs/07-stage3-closure.md`](07-stage3-closure.md) — multi-replica scale-out
- [`docs/05-manual-testing.md`](05-manual-testing.md) §1 — single-replica chaos
- [`docs/07-stage3-closure.md`](07-stage3-closure.md) §4 — multi-replica chaos

---

## 1. Architecture quick reference

Four nginx vhosts in front of one API service (1..N replicas) + Postgres + Redis:

```
                 ┌── api replica 1 ──┐
                 │  ↑ ↓ pub/sub      │
nginx ──────────►├── api replica 2 ──┼──── postgres (pool sized via env)
(round-robin)    │                   │
                 └── api replica N ──┘
                          ↕
                   redis ws:broadcast channel
                       (all replicas
                        sub + pub)
```

| Vhost                          | Audience                       | Serves       | Rate-limit zone        |
| ------------------------------ | ------------------------------ | ------------ | ---------------------- |
| `exam.yourschool.edu`          | STUDENT                        | apps/student | `api_general` / `api_auth` / `api_ai` |
| `console.yourschool.edu`       | TEACHER + SCHOOL_ADMIN         | apps/console | same                   |
| `api.yourschool.edu`           | M2M / direct API (no SPA)      | API only     | `api_general` / `api_auth` |
| `platform.secureexam.app`      | PLATFORM_ADMIN (vendor)        | apps/platform | `platform_admin` (5 r/s) |

Internals:

- **API**: Node 20 + Express + Prisma. Listens on `:4000`. Replicas via
  `deploy.replicas: ${API_REPLICAS:-1}`. Docker DNS round-robins `api`.
- **Postgres 15** primary, single instance. Volume `pgdata`.
- **Redis 7** with AOF on. Volume `redisdata`. Used for: refresh-token
  rotation (`rt:family:*`), OTP rate-limit (`otp:lock:*`), idempotency cache,
  WS pub/sub fan-out on channel `ws:broadcast`.
- **WS broadcaster**: `WS_BROADCASTER=in-process` (default, single-replica) or
  `redis-pubsub` (multi-replica). Selected at boot in `lib/wsBroadcast.ts`.
- **No sticky sessions.** Round-robin is fine because broadcasts fan out via Redis.

---

## 2. Required env vars at boot

The boot guard (`apps/api/src/lib/env.ts`) refuses to start on missing,
empty, default-value, or shorter-than-32-char secrets.

### Required

| Var                         | Notes                                                                  |
| --------------------------- | ---------------------------------------------------------------------- |
| `JWT_SECRET`                | ≥ 32 chars. Not a known default. Boot-fail if missing/short/default.   |
| `JWT_REFRESH_SECRET`        | Same rules. Must differ from `JWT_SECRET` operationally.               |
| `DATABASE_URL`              | `postgresql://user:pass@postgres:5432/db`                              |
| `REDIS_URL`                 | `redis://redis:6379`. Required in prod for refresh tokens + WS pub/sub. |
| `CORS_ORIGINS`              | Comma-separated list of vhost origins.                                 |
| `POSTGRES_PASSWORD`         | Consumed by both `postgres` and `api` (in `DATABASE_URL`).             |

### Optional

| Var                         | Default       | Effect                                                              |
| --------------------------- | ------------- | ------------------------------------------------------------------- |
| `API_REPLICAS`              | `1`           | Number of API instances. Docker `deploy.replicas`.                  |
| `WS_BROADCASTER`            | `in-process`  | Set to `redis-pubsub` whenever `API_REPLICAS > 1`.                  |
| `PRISMA_CONNECTION_LIMIT`   | `20`          | Per-replica Prisma pool size. See §10 for the math.                 |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASS` | unset | Without SMTP, OTP delivery logs a warn, code is *not* in logs unless `OTP_DEV_LOG=1` (dev only). |
| `EMAIL_FROM`                | `noreply@school.edu` | From-address on OTP / system mail.                          |
| `SENTRY_DSN`                | unset (no-op) | Enables `apps/api/src/lib/sentry.ts`. PII-safe `beforeSend`.        |
| `SENTRY_RELEASE`            | unset         | Tag the release in Sentry.                                          |
| `ANTHROPIC_API_KEY`         | unset         | Enables AI authoring + feedback (gated by D4 flag too).             |
| `OTP_DEV_LOG`               | `0`           | **Dev only.** Logs OTP code values. Refuses in production.          |
| `S3_BUCKET`                 | unset         | Backup uploads (see §8).                                            |

Boot-fail signature:

```
[env] JWT_SECRET is a known default value. Refusing to start.
[env] JWT_REFRESH_SECRET must be at least 32 chars. Refusing to start.
```

---

## 3. Healthchecks + readiness

| Endpoint        | Returns                                                       | Use                              |
| --------------- | ------------------------------------------------------------- | -------------------------------- |
| `/health/live`  | `200 {status: "ok"}` — process up; no dependency check        | k8s liveness, container restart  |
| `/health/ready` | `200 {status: "ready"}` if Postgres `SELECT 1` ok; `503 {status: "unready", reason: "database"}` otherwise. Redis is best-effort (degraded Redis returns 200). | nginx upstream / k8s readiness |
| `/health`       | `200 {status: "ok", timestamp}` — backwards-compat            | Old probes; new code: use `/live` |
| `/metrics`      | Prometheus exposition. `nodejs_eventloop_lag_seconds`, `http_request_duration_seconds`, `secureexam_otp_attempts_total`, etc. | Scrape |

Docker healthcheck on the api service uses `/health` (compose file). Docker
restarts an unhealthy container after 5 failed checks.

---

## 4. Common incidents and triage

### 4.1 Postgres unreachable

**Detection.** `/health/ready` → 503 `reason: "database"`. nginx returns 502s
on routes that touch DB. `pg_isready` from the api container fails.

**Immediate.**
```bash
docker compose -f docker-compose.prod.yml ps postgres
docker compose -f docker-compose.prod.yml logs --tail=200 postgres
docker exec -it $(docker ps -qf name=postgres) pg_isready -U secureexam
```

**Restore.**
- Volume mount intact? `docker volume inspect secureexam_pgdata`.
- Disk pressure? `df -h` on the host.
- Restart: `docker compose -f docker-compose.prod.yml restart postgres`.
- API auto-recovers — Prisma reconnects on next query. No api restart needed.

### 4.2 Redis unreachable

**Impact**: refresh-token rotation fails (users get logged out on token refresh),
idempotency cache resets (replays may execute twice), OTP rate-limit resets,
**and WS pub/sub fan-out stops** (multi-replica → cross-replica WS messages
silently drop).

**Detection.** `/health/ready` still 200 (Redis is best-effort). Symptoms:
proctor view stops updating across replicas; refresh failures in logs;
`secureexam_otp_attempts_total` flatlines.

**Immediate.**
```bash
docker compose -f docker-compose.prod.yml logs --tail=200 redis
docker exec -it $(docker ps -qf name=redis) redis-cli ping
```

**Restore.**
- `docker compose -f docker-compose.prod.yml restart redis`.
- The WS broadcaster auto-reconnects — watch for `[wsBroadcast] subscriber error`
  followed by recovery (~5s). Verified by chaos test §4.3 of the Stage 3 closure.
- Autosave is REST-authoritative since cycle 3.0c — exam-taking continues
  uninterrupted while Redis is down.
- Any in-flight refresh-token families that landed mid-outage are revoked;
  affected users must log in again. By design.

### 4.3 One API replica unhealthy

**Detection.** Docker `STATUS = unhealthy` on one of N. nginx still serves traffic
from the surviving replicas. `nodejs_eventloop_lag_seconds` for the bad replica
elevated; or the container is OOMKilled.

**Immediate.**
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=500 api
docker stats $(docker ps -qf name=api) --no-stream
```

**Restore.**
- Restart just the bad container: `docker kill <container_id>`. Compose's
  `restart: always` plus `deploy.replicas` re-launches it. No traffic gap —
  nginx upstream excludes the unhealthy peer.
- Confirm post-restart: `/health/ready` 200 from inside the container.

### 4.4 All API replicas unhealthy

**Detection.** nginx returns 502/504 across all vhost API routes. `/health/live`
is unreachable on every replica.

**Immediate.**
```bash
docker compose -f docker-compose.prod.yml logs --tail=1000 api | grep -E 'error|fatal|env|EADDR'
```

Common causes:
- **Boot guard tripped** — `[env] JWT_SECRET …`. Fix env, redeploy.
- **DB / Redis unreachable on boot** — fix the dep, restart api.
- **Bad release** — see §6 rollback.
- **Schema migration mid-deploy** — see §7. Replicas crash-loop until the
  expected schema is in place.

**Restore.** After fixing root cause:
```bash
docker compose -f docker-compose.prod.yml up -d api
```

### 4.5 nginx returning 502

**Detection.** Browser shows nginx 502 page. nginx access log shows `upstream`
errors.

**Immediate.**
```bash
docker compose -f docker-compose.prod.yml logs --tail=200 nginx
docker exec $(docker ps -qf name=nginx) wget -qO- http://api:4000/health/live
```

If the api is unhealthy → §4.3 / §4.4. If the api is healthy but nginx still
502s, check that nginx resolved `api` to all replica IPs (Docker internal DNS):
```bash
docker exec $(docker ps -qf name=nginx) getent hosts api
```
Should return one IP per replica. If not, restart nginx (it caches DNS):
```bash
docker compose -f docker-compose.prod.yml restart nginx
```

### 4.6 Cert expiry imminent

**Detection.** Certbot pre-renew cron alert; or browser TLS warning.

**Immediate (Let's Encrypt renew):**
```bash
certbot renew --cert-name exam.yourschool.edu \
              --cert-name console.yourschool.edu \
              --cert-name api.yourschool.edu \
              --cert-name platform.secureexam.app
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

`certbot renew` is idempotent — safe to run as a daily cron. nginx reload is
zero-downtime (no socket close).

If certbot fails, check that the HTTP-01 challenge path is reachable (port 80
must be open; the nginx config keeps `/.well-known/acme-challenge/` on port 80).

### 4.7 High WS round-trip latency

**Detection.** Student reports proctor view delayed. k6 `ws_round_trip` p95
above the 1.5s ceiling for the multi-replica path.

**Triage.**
- `redis-cli --stat 1` from inside the redis container — watch `clients`,
  `keys`, `mem`. Saturation likely.
- `redis-cli pubsub numsub ws:broadcast` — should equal `API_REPLICAS`.
- `redis-cli info stats | grep pubsub` — `pubsub_channels`, `pubsub_patterns`.

**Mitigations.**
- Scale Redis up first (CPU is the usual bound).
- Per the Stage 3 closure §5: if pub/sub channel msg/s sustains the bound,
  split `ws:broadcast` into per-exam channels (`ws:exam:${examId}`). Not yet
  shipped — open a cycle if you hit this.

### 4.8 High autosave latency / Postgres pool exhausted

**Detection.** `http_req_duration{name:answer-save}` p95 above 500ms.
Postgres `pg_stat_activity` shows `state='idle in transaction'` rows or
saturated `max_connections`.

**Triage.**
```bash
docker exec -it $(docker ps -qf name=postgres) \
  psql -U secureexam -d secureexam \
  -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
docker exec -it $(docker ps -qf name=postgres) \
  psql -U secureexam -c "SHOW max_connections;"
```

**Mitigations.**
- Verify `PRISMA_CONNECTION_LIMIT × API_REPLICAS ≤ max_connections − 5`
  (reserve headroom for `migrate`, ad-hoc psql, backups). See §10.
- If saturated, either bump Postgres `max_connections` (requires restart) or
  lower `PRISMA_CONNECTION_LIMIT` and redeploy.

### 4.9 Mid-exam student session lost

**Recovery procedure.**

1. Confirm session exists: in psql,
   `SELECT id, status, "violationCount", "lockedAt", "studentId", "examId" FROM exam_sessions WHERE id='<sessionId>'`.
2. If `status='ACTIVE'`, the student can refresh — IndexedDB restores answers,
   server-authoritative timer resumes from `startedAt + duration`.
3. If `status='LOCKED'`, see §4.10 for unlock. Status `SUBMITTED` is terminal.
4. If the student lost the device entirely: only a TEACHER on that exam (via
   `canManageExam` / `canProctorExam`) can intervene. There's no "transfer
   session" route — the student logs in elsewhere, IndexedDB is empty, but
   server-saved answers are intact (REST-authoritative since 3.0c).

### 4.10 Mid-exam violation false positive — proctor unlock

**Detection.** Student locked out (`session:locked` on WS); contacts proctor.

**Procedure.**

1. Teacher / SCHOOL_ADMIN generates an UNLOCK PIN if not pre-generated:
   ```bash
   curl -X POST https://console.yourschool.edu/api/v1/pins/generate \
        -H "Authorization: Bearer $TEACHER_TOKEN" \
        -H "Idempotency-Key: $(uuidgen)" \
        -d '{"examId":"<id>","purposes":["UNLOCK"]}'
   ```
   PIN values are returned **once**; bcrypt-hashed cost-12 in `exam_pins`.
2. Read the 4-digit code to the student.
3. Student hits `POST /sessions/:id/unlock` with the pin; session resumes.
4. UNLOCK PINs are reusable until 24h expiry (Exit PINs are single-use).

---

## 5. Deploy procedure

### Pre-deploy checklist

- [ ] CI green on the deploy SHA (`lint`, `typecheck`, `test-api`, `build`).
- [ ] No new env vars without a corresponding entry in `.env.production.example`.
- [ ] Secrets in the secrets store match the boot-guard rules (§2).
- [ ] Migration deltas reviewed (`apps/api/prisma/migrations/`) and reversible.
- [ ] Backup taken in the last 24h (cron should have it; verify in `$BACKUP_DIR`).
- [ ] Status posted in `#secureexam-deploys` (manual, until status page lands).

### Deploy

```bash
cd /opt/secureexam
git fetch && git checkout <deploy-sha>
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml --profile migrate up migrate
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

Compose rolling-restarts api replicas one at a time; nginx healthcheck excludes
the restarting peer, so there's no 502 window if `start_period` (20s) is honoured.

### Post-deploy verification

```bash
curl -fsS https://api.yourschool.edu/health/ready
curl -fsS https://exam.yourschool.edu/ -o /dev/null -w "%{http_code}\n"
# Smoke the exam path
TOKEN=$(curl -s -X POST https://api.yourschool.edu/api/v1/auth/login \
  -d '{"email":"smoke@…","password":"…"}' | jq -r .accessToken)
curl -s https://api.yourschool.edu/api/v1/sessions/my -H "Authorization: Bearer $TOKEN"
```

---

## 6. Schema migration runbook

Migrations live in `apps/api/prisma/migrations/`. Currently:

| Migration                                           | Cycle  | Effect                                           |
| --------------------------------------------------- | ------ | ------------------------------------------------ |
| `0_init`                                            | 0.x    | Initial schema                                   |
| `20260509201938_1_indexes_and_constraints`          | 1.x    | Stage 1 hardening indexes                        |
| `20260510120000_2_role_split_d1`                    | 2.0a   | D1 role split: `ADMIN`/`SUPER_ADMIN` → `SCHOOL_ADMIN`/`PLATFORM_ADMIN` |
| `20260510130000_3_d4_feature_flags`                 | 2.0e   | `school_features` table + per-school flag rows   |
| `20260510140000_4_audit_impersonation_columns`      | 2.0f   | `audit_logs` denormalised cols (`actorRole`, `actorSchoolId`, `targetSchoolId`, `impersonation`) |

### Apply (production)

Always via the dedicated `migrate` profile, before bringing api up:

```bash
docker compose -f docker-compose.prod.yml --profile migrate up migrate
```

Staging applies pending migrations on every `up` (profile is on by default in
`docker-compose.staging.yml`). Production is explicit on purpose.

### Roll back a migration

Prisma does not auto-rollback. Two paths:

**Path A — reversible migration.** Hand-write the inverse SQL, ship it as the
next migration. Preferred for column adds and index changes.

**Path B — destructive / data-bearing.** Restore from backup (§8) and replay any
post-backup writes that you can recover. Then mark the bad migration rolled
back so Prisma doesn't try to reapply:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate \
  npx prisma migrate resolve --rolled-back 20260510140000_4_audit_impersonation_columns
```

Note: `prisma migrate resolve --rolled-back` only updates the
`_prisma_migrations` table — it does not undo schema changes. The DB-level
revert is the backup restore.

---

## 7. Backup + restore

### Backup

`scripts/backup.sh`. Cron daily at 02:00 UTC on the host:

```cron
0 2 * * *  /opt/secureexam/scripts/backup.sh >>/var/log/secureexam-backup.log 2>&1
```

- Format: `pg_dump --format=custom` → gzipped to `$BACKUP_DIR` (default
  `/var/backups/secureexam`).
- S3 upload if `S3_BUCKET` set (`s3://bucket/optional-prefix`).
- Local retention `RETENTION_DAYS` (default 30); S3 lifecycle policy owns
  long-term retention.

**RPO:** 24h. **RTO:** ~30 min for a 10GB DB.

### Restore

```bash
DATABASE_URL=postgresql://… CONFIRM=yes \
  ./scripts/restore.sh /var/backups/secureexam/secureexam-20260510T020000Z.sql.gz
```

Refuses to run without `CONFIRM=yes` (overwrites the target DB). Uses
`pg_restore --clean --if-exists`.

### Quarterly drill

Pick a recent dump, restore into a fresh staging DB, run the api smoke tests
(`npm test --workspace=apps/api`), record wall-clock time. Document in the
ops runbook ledger (out of scope here).

---

## 8. Cert provisioning + renewal

### Production — Let's Encrypt (HTTP-01 via certbot)

One-time provisioning:

```bash
apt-get install -y certbot
certbot certonly --standalone \
  -d exam.yourschool.edu \
  -d console.yourschool.edu \
  -d api.yourschool.edu \
  -d platform.secureexam.app
```

Certs land at `/etc/letsencrypt/live/<domain>/{fullchain.pem,privkey.pem}`.
Bind-mount the parent directory to `/etc/nginx/ssl/` (already wired in
`docker-compose.prod.yml`).

Renewal (cron daily; certbot only acts when ≤30d to expiry):

```cron
0 3 * * *  certbot renew --quiet --deploy-hook "docker compose -f /opt/secureexam/docker-compose.prod.yml exec -T nginx nginx -s reload"
```

The `/.well-known/acme-challenge/` path stays on port 80 in `nginx.conf` for
HTTP-01 to keep working; everything else 301s to HTTPS.

### Staging / dev — self-signed

```bash
./scripts/dev-certs.sh
```

Generates `nginx/dev-ssl/<domain>/{fullchain.pem,privkey.pem}` for the four
vhosts (1y validity, RSA-2048, SAN). Idempotent — skips existing files. Add
`127.0.0.1 exam.yourschool.edu …` to `/etc/hosts`. Browser will warn on
first connect — that's the point.

---

## 9. Multi-replica scale-up

### Bumping `API_REPLICAS`

```bash
# In .env or the secrets store:
API_REPLICAS=4
WS_BROADCASTER=redis-pubsub
PRISMA_CONNECTION_LIMIT=20

docker compose -f docker-compose.prod.yml up -d --scale api=4
# or just `up -d` if API_REPLICAS is in .env
```

### What to watch during ramp

| Metric                            | Watch                                                       |
| --------------------------------- | ----------------------------------------------------------- |
| Postgres connection-pool saturation | `SELECT count(*) FROM pg_stat_activity WHERE state='active';` should stay below `(PRISMA_CONNECTION_LIMIT × API_REPLICAS) × 0.8` |
| Redis pub/sub channel msg/s       | `redis-cli info stats \| grep instantaneous_ops_per_sec`. Stage 3 §5 has the back-of-envelope (acceptable through 5k students). |
| nginx upstream peers              | `docker exec $(docker ps -qf name=nginx) getent hosts api` should return `API_REPLICAS` IPs. |
| Per-replica WS connection count   | At 5k students × 4 replicas → ~1,250/replica. Visible via the api's `/metrics` `ws_connections_total` gauge. |
| Per-replica CPU                   | `docker stats`. p95 below 70% sustained.                   |

### `PRISMA_CONNECTION_LIMIT` math

```
PRISMA_CONNECTION_LIMIT × API_REPLICAS  ≤  postgres max_connections − 5
```

Reserve 5 for: `migrate` runner (1), backup process (1), ad-hoc psql (2),
slack (1).

Postgres 15 default `max_connections=100`. With 4 replicas:
`PRISMA_CONNECTION_LIMIT = (100 − 5) / 4 ≈ 23` → conservative pick is `20`.

If you push to `API_REPLICAS=8` without raising `max_connections`:
`PRISMA_CONNECTION_LIMIT = 11`. Below that, autosave throughput suffers
under burst load — bump Postgres first.

---

## 10. Load testing

Scenarios in `scripts/load-test/`:

- `chaos-take-exam.js` — N students, full hot path (login → start → WS heartbeat → answer → submit). Targets in §3.2 of the Stage 3 closure.
- `bulk-import.js` — 50 admins × 200 rows; validates cycle 2.1a perf rewrite.
- `idempotency.js` — 100× replay of `POST /sessions/:id/answer` with same `Idempotency-Key`; one row in `student_answers`.

Run against staging:

```bash
k6 run \
  -e API_BASE=https://api.staging.secureexam.app \
  -e WS_BASE=wss://api.staging.secureexam.app \
  -e MAX_VUS=2000 \
  scripts/load-test/chaos-take-exam.js
```

**Do not run against production without ops sign-off.** Even `MAX_VUS=100`
generates real DB write rates that can affect real exams in flight.

---

## 11. Audit log compliance queries

Schema (post 2.0f): `audit_logs` has denormalised `actorRole`,
`actorSchoolId`, `targetSchoolId`, `impersonation` columns so compliance
queries don't need joins.

### Cross-tenant impersonation ledger (PLATFORM_ADMIN actions)

The library function `getImpersonationEvents()` in
`apps/api/src/lib/auditQuery.ts` is the canonical query. From psql:

```sql
SELECT id, "createdAt", action, "actorId", "actorRole",
       "targetType", "targetId", "targetSchoolId"
FROM audit_logs
WHERE impersonation = true
  AND "createdAt" >= now() - interval '90 days'
ORDER BY "createdAt" DESC
LIMIT 200;
```

Per-school filter — "show me every PLATFORM_ADMIN action that touched school X
in the last 90 days":

```sql
SELECT * FROM audit_logs
WHERE impersonation = true
  AND "targetSchoolId" = '<school-uuid>'
  AND "createdAt" >= now() - interval '90 days'
ORDER BY "createdAt" DESC;
```

### FERPA "show me everything about student X"

```sql
-- Their auth + session + violation history
SELECT 'session' AS kind, id, "examId", "startedAt", "submittedAt", "violationCount"
FROM exam_sessions WHERE "studentId" = '<student-uuid>'
UNION ALL
SELECT 'answer', a.id, s."examId", a."createdAt", NULL, NULL
FROM student_answers a JOIN exam_sessions s ON s.id = a."sessionId"
WHERE s."studentId" = '<student-uuid>'
ORDER BY 4 DESC;

-- Audit rows where they were target or actor
SELECT * FROM audit_logs
WHERE "actorId" = '<student-uuid>' OR "targetId" = '<student-uuid>'
ORDER BY "createdAt" DESC;
```

### Today's exam volume

```sql
SELECT count(*) FROM exam_sessions WHERE "startedAt" > now() - interval '1 day';
```

### Suspicious sessions (high violation count)

```sql
SELECT s.id, u.name, e.title, s."violationCount"
FROM exam_sessions s
JOIN users u ON u.id = s."studentId"
JOIN exams e ON e.id = s."examId"
WHERE s."violationCount" > 3
  AND s."startedAt" > now() - interval '7 days'
ORDER BY s."violationCount" DESC;
```

---

## 12. Incident comms

There is no automated status page yet (Stage 7 roadmap). Until then:

| Severity            | Audience                  | Channel                       | Cadence       |
| ------------------- | ------------------------- | ----------------------------- | ------------- |
| **SEV-1** (exam-disrupting outage during active exam window) | All affected school IT contacts | Email blast from a real human + `#secureexam-incidents` | Initial within 15 min; updates every 30 min until resolved |
| **SEV-2** (degraded — slow autosaves, partial vhost down) | Affected schools          | Email                         | Initial within 1 h; resolution notice |
| **SEV-3** (single user / cohort bug, not infrastructure)   | Reporter only             | Reply to ticket               | Per-ticket     |

Templates and contact lists live in the ops repo (out of scope here). Always
include: what's affected, what's not (so schools know whether to reschedule
exams), ETA confidence (low/medium/high), and a callback identifier.

For a SEV-1 mid-exam outage, the call to schools is: **don't reschedule yet
— the server-authoritative timer pauses with the session, IndexedDB holds
unsaved answers, and submissions resume on recovery.** Only escalate to
"reschedule the exam window" after 30 min sustained outage.

---

## 13. Cross-references

- [`README.md`](../README.md) §"Production Deployment" — fresh-host walkthrough
- [`docs/03-stage1-closure.md`](03-stage1-closure.md) §3 — single-replica chaos test
- [`docs/04-stage2-prereqs-closure.md`](04-stage2-prereqs-closure.md) — D1/D6/D4/2.0f
- [`docs/05-manual-testing.md`](05-manual-testing.md) — chaos / smoke / hot-path / compliance
- [`docs/06-stage3-plan.md`](06-stage3-plan.md) — multi-replica plan
- [`docs/07-stage3-closure.md`](07-stage3-closure.md) §2 — topology diagram, §4 — multi-replica chaos
- [`scripts/load-test/README.md`](../scripts/load-test/README.md) — k6 scenarios
- [`apps/api/src/lib/env.ts`](../apps/api/src/lib/env.ts) — boot guard
- [`apps/api/src/lib/auditQuery.ts`](../apps/api/src/lib/auditQuery.ts) — `getImpersonationEvents`
- [`apps/api/src/lib/wsBroadcast.ts`](../apps/api/src/lib/wsBroadcast.ts) — broadcaster impl
- [`nginx/nginx.conf`](../nginx/nginx.conf) — vhost layout + rate-limit zones
- [`docker-compose.prod.yml`](../docker-compose.prod.yml) — prod stack
- [`docker-compose.staging.yml`](../docker-compose.staging.yml) — staging mirror

---

**End of runbook. Owners: platform team. Update on every Stage closure.**
