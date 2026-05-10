# SecureExam — Operational Runbook

**Audience:** SRE / oncall during incidents. **Owners:** platform team.
**Scope:** prod stack per `docker-compose.prod.yml` + `nginx/nginx.conf`,
through Stage 3 / cycle 3.0d (multi-replica API + Redis pub/sub WS fan-out
+ REST-authoritative autosave).

---

## 1. Architecture quick reference

```
                 ┌── api replica 1 ──┐
                 │  ↑ ↓ pub/sub      │
nginx ──────────►├── api replica 2 ──┼──── postgres (pool sized via env)
(round-robin)    │                   │
                 └── api replica N ──┘
                          ↕
                   redis ws:broadcast channel
                       (all replicas sub + pub)
```

Four nginx vhosts in front of one API service (1..N replicas), Postgres 15,
Redis 7.

| Vhost                          | Audience                  | Serves        | Rate-limit zone           |
| ------------------------------ | ------------------------- | ------------- | ------------------------- |
| `exam.yourschool.edu`          | STUDENT                   | apps/student  | `api_general` + `api_auth` + `api_ai` |
| `console.yourschool.edu`       | TEACHER + SCHOOL_ADMIN    | apps/console  | same                      |
| `api.yourschool.edu`           | direct API (no SPA)       | API only      | `api_general` + `api_auth` |
| `platform.secureexam.app`      | PLATFORM_ADMIN (vendor)   | apps/platform | `platform_admin` (5 r/s)  |

- **API** Node 20 + Express + Prisma on `:4000`. Replicas via
  `deploy.replicas: ${API_REPLICAS:-1}`; Docker DNS round-robins `api`. No
  sticky sessions — broadcasts fan out via Redis.
- **Redis** uses: refresh-token rotation (`rt:family:*`), OTP rate-limit
  (`otp:lock:*`), idempotency cache, WS pub/sub channel `ws:broadcast`.
- **WS broadcaster** picked from `WS_BROADCASTER` env (`in-process` |
  `redis-pubsub`) in `apps/api/src/lib/wsBroadcast.ts`.

---

## 2. Required env vars at boot

Boot guard in `apps/api/src/lib/env.ts` refuses to start on missing, empty,
known-default, or shorter-than-32-char secrets. Failure looks like:

```
[env] JWT_SECRET is a known default value. Refusing to start.
```

**Required:** `JWT_SECRET`, `JWT_REFRESH_SECRET` (≥32 chars, must differ),
`DATABASE_URL`, `REDIS_URL`, `CORS_ORIGINS`, `POSTGRES_PASSWORD`.

**Optional:**

| Var                       | Default      | Effect                                                  |
| ------------------------- | ------------ | ------------------------------------------------------- |
| `API_REPLICAS`            | `1`          | Compose `deploy.replicas`.                              |
| `WS_BROADCASTER`          | `in-process` | Set to `redis-pubsub` whenever `API_REPLICAS > 1`.      |
| `PRISMA_CONNECTION_LIMIT` | `20`         | Per-replica Prisma pool. Math in §10.                   |
| `SMTP_HOST/PORT/USER/PASS`| unset        | Without SMTP, OTP delivery only logs a warn.            |
| `SENTRY_DSN`              | unset        | No-op without it; PII-safe `beforeSend` when set.       |
| `ANTHROPIC_API_KEY`       | unset        | Enables AI authoring + feedback (also gated by D4 flag).|
| `OTP_DEV_LOG`             | `0`          | **Dev only.** Logs OTP code values.                     |
| `S3_BUCKET`               | unset        | Backup uploads (§7).                                    |

---

## 3. Healthchecks

| Endpoint        | Behaviour                                                    | Use                            |
| --------------- | ------------------------------------------------------------ | ------------------------------ |
| `/health/live`  | `200 {status:"ok"}` — process up, no deps checked            | k8s liveness                   |
| `/health/ready` | DB `SELECT 1`; `503 {reason:"database"}` if down. Redis is best-effort (degraded Redis still returns 200). | nginx upstream / k8s readiness |
| `/health`       | `200` backwards-compat (used by docker healthcheck in compose) | legacy                       |
| `/metrics`      | Prometheus exposition (`nodejs_eventloop_lag_seconds`, `http_request_duration_seconds`, `secureexam_otp_attempts_total`, …) | scrape |

---

## 4. Common incidents

### 4.1 Postgres unreachable

**Signal:** `/health/ready` → 503 `reason:"database"`. nginx 502s on DB-touching routes.

```bash
docker compose -f docker-compose.prod.yml ps postgres
docker compose -f docker-compose.prod.yml logs --tail=200 postgres
```

**Fix:** disk pressure (`df -h`), volume mount, then
`docker compose -f docker-compose.prod.yml restart postgres`. API auto-reconnects.

### 4.2 Redis unreachable

**Impact:** refresh-token rotation fails (users dropped on next refresh),
idempotency cache resets (replays may double-execute), OTP rate-limit resets,
**WS pub/sub fan-out stops** (cross-replica messages drop silently).

**Signal:** `/health/ready` still 200 (best-effort). Symptoms: proctor view stalls
across replicas; logs show `[wsBroadcast] subscriber error`.

```bash
docker exec -it $(docker ps -qf name=redis) redis-cli ping
docker compose -f docker-compose.prod.yml restart redis
```

Autosave is REST-authoritative since cycle 3.0c — exam-taking continues
uninterrupted while Redis is down. Broadcaster auto-reconnects (~5s).

### 4.3 One API replica unhealthy

**Signal:** Docker `unhealthy` on one of N. nginx routes around it.

```bash
docker compose -f docker-compose.prod.yml logs --tail=500 api
docker stats $(docker ps -qf name=api) --no-stream
docker kill <container_id>   # restart: always + replicas relaunches it
```

### 4.4 All API replicas unhealthy

**Signal:** nginx 502/504 across all vhost API routes.

```bash
docker compose -f docker-compose.prod.yml logs --tail=1000 api | grep -E 'env|error|fatal|EADDR'
```

Common causes: boot guard tripped (`[env] …` — fix env, redeploy); DB/Redis
unreachable on boot; bad release (§5 rollback); mid-deploy migration mismatch
(§6).

### 4.5 nginx 502

```bash
docker compose -f docker-compose.prod.yml logs --tail=200 nginx
docker exec $(docker ps -qf name=nginx) wget -qO- http://api:4000/health/live
docker exec $(docker ps -qf name=nginx) getent hosts api  # one IP per replica
```

If `getent hosts api` is short, nginx cached stale DNS — `restart nginx`.

### 4.6 Cert expiry imminent

```bash
certbot renew  # idempotent; only acts when ≤30d to expiry
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

The `/.well-known/acme-challenge/` path stays on port 80 in `nginx.conf` for
HTTP-01. nginx reload is zero-downtime.

### 4.7 High WS round-trip latency

**Signal:** k6 `ws_round_trip` p95 > 1.5s on multi-replica; proctor view delayed.

```bash
docker exec $(docker ps -qf name=redis) redis-cli --stat 1
docker exec $(docker ps -qf name=redis) redis-cli pubsub numsub ws:broadcast
# numsub should equal API_REPLICAS
```

If sustained, scale Redis CPU first. Per Stage 3 closure §5, the next
mitigation is splitting `ws:broadcast` into per-exam channels — not yet
shipped; open a cycle if you hit the bound.

### 4.8 High autosave latency / Postgres pool exhausted

**Signal:** `http_req_duration{name:answer-save}` p95 > 500ms; `pg_stat_activity`
shows saturated connections.

```bash
docker exec -it $(docker ps -qf name=postgres) \
  psql -U secureexam -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
docker exec -it $(docker ps -qf name=postgres) \
  psql -U secureexam -c "SHOW max_connections;"
```

Verify `PRISMA_CONNECTION_LIMIT × API_REPLICAS ≤ max_connections − 5`. See §10.

### 4.9 Mid-exam student session lost

1. `SELECT id, status, "violationCount", "lockedAt" FROM exam_sessions WHERE id='<id>'`.
2. `status='ACTIVE'` → student refreshes; IndexedDB restores answers; server
   timer resumes.
3. `status='LOCKED'` → §4.10.
4. Lost device entirely: server-saved answers are intact (REST-authoritative
   since 3.0c). No "transfer session" route — student logs in elsewhere.

### 4.10 Mid-exam violation false positive — proctor unlock

```bash
curl -X POST https://console.yourschool.edu/api/v1/pins/generate \
     -H "Authorization: Bearer $TEACHER_TOKEN" \
     -H "Idempotency-Key: $(uuidgen)" \
     -d '{"examId":"<id>","purposes":["UNLOCK"]}'
```

PIN values returned **once** (bcrypt cost-12 in `exam_pins`). Read 4-digit code
to student → student `POST /sessions/:id/unlock`. UNLOCK PINs reusable until
24h expiry; EXIT PINs single-use.

---

## 5. Deploy procedure

**Pre-deploy checklist:**

- [ ] CI green on the deploy SHA (`lint`, `typecheck`, `test-api`, `build`).
- [ ] New env vars present in `.env.production.example` and the secrets store.
- [ ] Migration deltas reviewed and reversible.
- [ ] Backup taken in last 24h (verify in `$BACKUP_DIR`).
- [ ] Deploy window posted in `#secureexam-deploys`.

```bash
cd /opt/secureexam
git fetch && git checkout <deploy-sha>
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml --profile migrate up migrate
docker compose -f docker-compose.prod.yml up -d
```

Compose rolls api replicas one at a time; nginx healthcheck + `start_period: 20s`
keeps the upstream window clean.

**Post-deploy smoke:**

```bash
curl -fsS https://api.yourschool.edu/health/ready
TOKEN=$(curl -s -X POST https://api.yourschool.edu/api/v1/auth/login \
  -d '{"email":"smoke@…","password":"…"}' | jq -r .accessToken)
curl -s https://api.yourschool.edu/api/v1/sessions/my -H "Authorization: Bearer $TOKEN"
```

**Rollback:** `git checkout <prior-sha> && docker compose pull && up -d`.
Schema migrations are not auto-rolled-back — see §6.

---

## 6. Schema migration runbook

Migrations live in `apps/api/prisma/migrations/`:

| Migration                                      | Cycle | Effect                                                    |
| ---------------------------------------------- | ----- | --------------------------------------------------------- |
| `0_init`                                       | 0.x   | Initial schema                                            |
| `20260509201938_1_indexes_and_constraints`     | 1.x   | Stage 1 indexes                                           |
| `20260510120000_2_role_split_d1`               | 2.0a  | D1: `ADMIN`/`SUPER_ADMIN` → `SCHOOL_ADMIN`/`PLATFORM_ADMIN` |
| `20260510130000_3_d4_feature_flags`            | 2.0e  | D4: `school_features` table                               |
| `20260510140000_4_audit_impersonation_columns` | 2.0f  | `audit_logs` denormalised cols (`actorRole`, `actorSchoolId`, `targetSchoolId`, `impersonation`) |

**Apply in prod** (always before `up -d`):

```bash
docker compose -f docker-compose.prod.yml --profile migrate up migrate
```

Staging applies on every `up` (profile is on by default).

**Roll back.** Prisma does not auto-revert.

- *Reversible delta* (column add, index): hand-write inverse SQL as the next migration.
- *Destructive / data-bearing*: restore from backup (§7), then mark the migration rolled back so Prisma won't retry it:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate \
  npx prisma migrate resolve --rolled-back 20260510140000_4_audit_impersonation_columns
```

`prisma migrate resolve --rolled-back` only updates `_prisma_migrations` —
the schema revert itself is the backup restore.

---

## 7. Backup + restore

**Backup:** `scripts/backup.sh`. Cron daily at 02:00 UTC:

```cron
0 2 * * *  /opt/secureexam/scripts/backup.sh >>/var/log/secureexam-backup.log 2>&1
```

`pg_dump --format=custom` → gzipped to `$BACKUP_DIR` (default
`/var/backups/secureexam`). S3 upload if `S3_BUCKET=s3://bucket/prefix` set.
Local retention `RETENTION_DAYS` (default 30); S3 lifecycle owns long-term.

**RPO** 24h. **RTO** ~30 min for a 10GB DB.

**Restore:**

```bash
DATABASE_URL=postgresql://… CONFIRM=yes \
  ./scripts/restore.sh /var/backups/secureexam/secureexam-20260510T020000Z.sql.gz
```

Refuses without `CONFIRM=yes`. Uses `pg_restore --clean --if-exists`.

**Quarterly drill:** restore a recent dump into staging, run
`npm test --workspace=apps/api`, record wall-clock time.

---

## 8. Cert provisioning + renewal

**Production — Let's Encrypt HTTP-01:**

```bash
apt-get install -y certbot
certbot certonly --standalone \
  -d exam.yourschool.edu -d console.yourschool.edu \
  -d api.yourschool.edu -d platform.secureexam.app
```

Certs at `/etc/letsencrypt/live/<domain>/{fullchain.pem,privkey.pem}` —
already bind-mounted to `/etc/nginx/ssl/` per `docker-compose.prod.yml`.

**Renewal cron:**

```cron
0 3 * * *  certbot renew --quiet --deploy-hook "docker compose -f /opt/secureexam/docker-compose.prod.yml exec -T nginx nginx -s reload"
```

**Staging / dev — self-signed:** `./scripts/dev-certs.sh` produces RSA-2048
1-year certs in `nginx/dev-ssl/<domain>/` for the four vhosts. Add
`127.0.0.1 exam.yourschool.edu …` to `/etc/hosts`. Browser will warn — that's
the point.

---

## 9. Multi-replica scale-up

```bash
# .env or secrets store:
API_REPLICAS=4
WS_BROADCASTER=redis-pubsub
PRISMA_CONNECTION_LIMIT=20

docker compose -f docker-compose.prod.yml up -d
```

**Watch during ramp:**

| Metric                                   | Bound                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Postgres active connections              | `< (PRISMA_CONNECTION_LIMIT × API_REPLICAS) × 0.8`                     |
| Redis pub/sub msg/s                      | `redis-cli info stats \| grep instantaneous_ops_per_sec` (Stage 3 §5 has the back-of-envelope) |
| nginx upstream peers                     | `docker exec $(docker ps -qf name=nginx) getent hosts api` returns `API_REPLICAS` IPs |
| Per-replica WS connection count          | `/metrics` `ws_connections_total`; ~1,250 at 5k students × 4 replicas  |
| Per-replica CPU                          | `docker stats`; below 70% sustained                                    |

**`PRISMA_CONNECTION_LIMIT` math:**

```
PRISMA_CONNECTION_LIMIT × API_REPLICAS  ≤  max_connections − 5
```

Reserve 5 for `migrate`, backup, ad-hoc psql, slack. Postgres default
`max_connections=100` → with 4 replicas, conservative `PRISMA_CONNECTION_LIMIT=20`.
With 8 replicas → 11. Below ~10, autosave throughput suffers under burst — bump
Postgres `max_connections` first (requires restart).

---

## 10. Load testing

Scenarios in `scripts/load-test/`:

- `chaos-take-exam.js` — N students through full hot path.
- `bulk-import.js` — 50 admins × 200 rows; validates 2.1a perf rewrite.
- `idempotency.js` — 100× replay, one row in `student_answers`.

```bash
k6 run \
  -e API_BASE=https://api.staging.secureexam.app \
  -e WS_BASE=wss://api.staging.secureexam.app \
  -e MAX_VUS=2000 \
  scripts/load-test/chaos-take-exam.js
```

**Do not run against production without ops sign-off** — even `MAX_VUS=100`
hits real DB write rates that can disrupt live exams.

---

## 11. Audit log compliance queries

Schema (post 2.0f) has denormalised `actorRole`, `actorSchoolId`,
`targetSchoolId`, `impersonation` on `audit_logs` so compliance queries are
join-free. Canonical lib: `apps/api/src/lib/auditQuery.ts` (`getImpersonationEvents`).

**Cross-tenant impersonation ledger (PLATFORM_ADMIN actions):**

```sql
SELECT id, "createdAt", action, "actorId", "actorRole",
       "targetType", "targetId", "targetSchoolId"
FROM audit_logs
WHERE impersonation = true
  AND "createdAt" >= now() - interval '90 days'
ORDER BY "createdAt" DESC
LIMIT 200;
```

Per-school filter — "every PLATFORM_ADMIN action that touched school X":

```sql
SELECT * FROM audit_logs
WHERE impersonation = true AND "targetSchoolId" = '<school-uuid>'
  AND "createdAt" >= now() - interval '90 days'
ORDER BY "createdAt" DESC;
```

**FERPA "show me everything about student X":**

```sql
-- Sessions + answers
SELECT 'session' AS kind, id, "examId", "startedAt", "submittedAt"
FROM exam_sessions WHERE "studentId" = '<student-uuid>'
UNION ALL
SELECT 'answer', a.id, s."examId", a."createdAt", NULL
FROM student_answers a JOIN exam_sessions s ON s.id = a."sessionId"
WHERE s."studentId" = '<student-uuid>';

-- Audit rows where they were actor or target
SELECT * FROM audit_logs
WHERE "actorId" = '<student-uuid>' OR "targetId" = '<student-uuid>'
ORDER BY "createdAt" DESC;
```

---

## 12. Incident comms

No automated status page yet (Stage 7 roadmap). Until then:

| Severity                                              | Channel                          | Cadence                                |
| ----------------------------------------------------- | -------------------------------- | -------------------------------------- |
| **SEV-1** exam-disrupting outage in active exam window | Email blast + `#secureexam-incidents` | Initial within 15 min; updates every 30 min |
| **SEV-2** degraded (slow autosaves, partial vhost down) | Email                          | Initial within 1 h; resolution notice  |
| **SEV-3** single user / cohort, not infrastructure    | Reply to ticket                  | Per-ticket                             |

Always include: what's affected, what's not, ETA confidence, callback id.

For a SEV-1 mid-exam outage the message to schools is: **don't reschedule yet
— the server-authoritative timer pauses with the session, IndexedDB holds
unsaved answers, submissions resume on recovery.** Only escalate to
"reschedule the exam window" after 30 min sustained outage.

---

## 13. Cross-references

- [`README.md`](../README.md) §"Production Deployment"
- [`docs/03-stage1-closure.md`](03-stage1-closure.md) §3 — single-replica chaos
- [`docs/04-stage2-prereqs-closure.md`](04-stage2-prereqs-closure.md) — D1 / D6 / D4 / 2.0f
- [`docs/05-manual-testing.md`](05-manual-testing.md) — chaos + smoke + hot-path
- [`docs/07-stage3-closure.md`](07-stage3-closure.md) §2 (topology), §4 (multi-replica chaos), §5 (deferred work)
- [`scripts/load-test/README.md`](../scripts/load-test/README.md)
- [`apps/api/src/lib/env.ts`](../apps/api/src/lib/env.ts) — boot guard
- [`apps/api/src/lib/auditQuery.ts`](../apps/api/src/lib/auditQuery.ts) — compliance queries
- [`apps/api/src/lib/wsBroadcast.ts`](../apps/api/src/lib/wsBroadcast.ts) — broadcaster
- [`nginx/nginx.conf`](../nginx/nginx.conf), [`docker-compose.prod.yml`](../docker-compose.prod.yml), [`docker-compose.staging.yml`](../docker-compose.staging.yml)

---

**End of runbook. Update on every Stage closure.**
