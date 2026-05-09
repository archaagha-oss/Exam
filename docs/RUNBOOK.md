# SecureExam — Operational Runbook

For oncall / SRE during incidents. Owners: platform team.

## Architecture quick reference

- **API** (Express + Prisma) on `:4000`
- **Postgres 15** primary
- **Redis 7** for refresh-token rotation, OTP rate limit, idempotency cache
- **5 frontend portals** (student/teacher/admin/superadmin) served via nginx
- nginx with `limit_req` zones (api_general 30r/s, api_auth 2r/s, api_ai 10r/min)

## Key endpoints

- `GET /health/live` — process is up (k8s liveness)
- `GET /health/ready` — also pings Postgres (k8s readiness, docker healthcheck)
- `GET /metrics` — Prometheus exposition

## Common incidents

### 1. API not responding / hanging

1. Check `/health/live` — if 200, the process is alive.
2. Check `/health/ready` — if 503, Postgres is the problem; look at the
   `database` reason in the body and check Postgres connectivity.
3. Look at logs (`docker logs api` or your log aggregator). Filter on
   `level=error`. Each entry has `requestId` — trace a slow request
   end-to-end via that.
4. If event loop is wedged, the process metric `nodejs_eventloop_lag_seconds`
   in `/metrics` will be elevated. Restart the API container.

### 2. "Refresh token revoked" errors after deploy

The Redis key namespace `rt:family:*` is the source of truth for valid
families. If Redis was wiped (e.g. ephemeral storage), every existing
session sees its refresh family revoked and must log in again.

- **Workaround**: this is by design. Tell users to log in again.
- **Prevent recurrence**: ensure Redis volume is persistent in your
  compose / k8s spec.

### 3. OTP emails not arriving

1. Confirm SMTP env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
   `SMTP_PASS`) are set.
2. Look for `[OTP]` log lines — without SMTP, the OTP code is logged
   to stdout (intended for dev only).
3. Check the rate limiter isn't blocking: `secureexam_otp_attempts_total`
   counter, and the per-session lock at `otp:lock:<sessionId>` in Redis.

### 4. Cross-tenant data appearing where it shouldn't

This is a critical security incident.

1. Capture the full audit log around the time. Tables: `audit_logs`,
   nginx access log.
2. Check the offending route in `apps/api/src/modules/<module>/<module>.service.ts`
   — does it call `findFirst({ where: { id, schoolId } })` rather than
   `findUnique({ where: { id } })`?
3. Add a regression test in `apps/api/test/crossTenant.test.ts`.
4. Ship the fix in a same-day patch. **Do not** wait for the next
   release window — IDOR is P0.

### 5. Suspected cheating / integrity findings

1. Open the teacher's Integrity panel for the exam:
   `GET /api/v1/integrity/exams/:id` returns flagged sessions with
   findings.
2. Findings are **flags for review**, not auto-penalties. Decision
   stays with the teacher.
3. See `docs/THREAT_MODEL.md` for the limits of detection and how to
   talk to schools about disputes.

### 6. Suspect compromised JWT secret

1. Rotate `JWT_SECRET` and `JWT_REFRESH_SECRET` in your secrets store.
2. Restart the API. The boot guard (`lib/env.ts`) will refuse to start
   on default / short / missing secrets.
3. All in-flight access tokens become invalid; all refresh tokens
   become invalid.
4. Tell users to log in again.
5. Audit logs: `audit_logs` table, look for unexpected `EXAM_PUBLISHED`
   / `USER_DELETED` actions.

## Backups

- Cron `scripts/backup.sh` daily (02:00 UTC).
- Default retention 30 days local + S3 if `S3_BUCKET` set.
- **RPO**: 24h (improvable with WAL archiving).
- **RTO**: ~30 min for a full restore (db size ~10GB).
- **Quarterly drill**: pick a recent dump, restore into a staging DB
  with `CONFIRM=yes ./scripts/restore.sh <dump>`, run the API smoke
  tests against it, document the time taken.

## Deployment

CI/CD lives at `.github/workflows/ci.yml`. The pipeline:

1. **Lint** — `npm run lint`, `prettier --check`
2. **Typecheck** — `tsc --noEmit` on api
3. **Test** — `npm test --workspace=apps/api` (Vitest with Postgres
   service)
4. **Build** — multi-stage Docker images for api/student/teacher/admin
5. **Deploy** — SSH to host, `docker compose -f docker-compose.prod.yml
up -d`

Migrations run separately via the `migrate` profile before `up`:

```
docker compose -f docker-compose.prod.yml --profile migrate up migrate
```

Rollback: `git revert <sha> && git push` triggers a redeploy of the
prior image. **Database schema migrations are not auto-rolled-back** —
each migration must be designed reversibly. If a migration corrupted
data, restore from backup is the path.

## Secrets

- `JWT_SECRET`, `JWT_REFRESH_SECRET` (32+ chars, random)
- `POSTGRES_PASSWORD`
- `SMTP_PASS`
- `ANTHROPIC_API_KEY`
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (S3 backups + media)

Stored in: GitHub Actions secrets (CI), production secret manager
(Vault / AWS Secrets Manager / Doppler — pick one). Rotate annually.

## Useful queries

```sql
-- Today's exam volume
SELECT count(*) FROM exam_sessions WHERE "startedAt" > now() - interval '1 day';

-- Suspicious sessions (joining integrity findings)
SELECT s.id, u.name, e.title, s."violationCount"
FROM exam_sessions s
JOIN users u ON u.id = s."studentId"
JOIN exams e ON e.id = s."examId"
WHERE s."violationCount" > 3
  AND s."startedAt" > now() - interval '7 days'
ORDER BY s."violationCount" DESC;

-- Which schools generate most audit log volume
SELECT u."schoolId", count(*) AS events
FROM audit_logs a
JOIN users u ON u.id = a."actorId"
WHERE a."createdAt" > now() - interval '30 days'
GROUP BY u."schoolId"
ORDER BY events DESC LIMIT 20;
```
