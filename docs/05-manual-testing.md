# Manual Testing — End-to-end walkthroughs

**Date:** 2026-05-10
**Status:** Stage 0 + Stage 1 + Stage 2 prereqs landed on `Claudy`. Cycles
2.1a (bulk-import perf), 2.1b (integrity N+1 + README), 2.1c (admin.router
hygiene), and 2.1d (this doc + seed updates) wrap up Stage 2 prereqs.

This doc is the "I just pulled `Claudy`, what do I run to convince myself
it works" walkthrough. The automated test suite (`npm test --workspace=
apps/api`) covers the deterministic regressions; this file covers the
flows that need a real browser, a real WS connection, or a real Postgres
to demonstrate.

---

## 0. Prereqs

```bash
docker compose up -d postgres redis
npm install
npm run db:migrate --workspace=apps/api
npm run db:seed --workspace=apps/api
npm run dev
```

After seed, you have:

| Role             | Email                       | Password       |
| ---------------- | --------------------------- | -------------- |
| PLATFORM_ADMIN   | superadmin@demo.school.edu  | superadmin123  |
| SCHOOL_ADMIN     | admin@demo.school.edu       | admin123       |
| TEACHER (demo)   | teacher@demo.school.edu     | teacher123     |
| TEACHER (other)  | teacher@other.school.edu    | teacher123     |
| STUDENT 1..5     | student[1-5]@demo.school.edu | student123    |

URLs: student `:5173`, console (TEACHER + SCHOOL_ADMIN) `:5174`, platform
admin `:5176`, API `:4000`.

Feature flags after seed: `ai-authoring` ON for demo.school.edu, OFF for
other.school.edu.

---

## 1. Chaos test (audit §11 end-of-Stage-1 gate)

The Stage 1 closure (`docs/03-stage1-closure.md` §3) maps each chaos case
to where it was fixed. This is the manual run of that mapping.

### 1.1 Kill the database mid-request

Stop postgres:

```bash
docker compose stop postgres
```

Hit any authenticated route, e.g.:

```bash
curl -i http://localhost:4000/api/v1/sessions/my \
     -H "Authorization: Bearer $TEACHER_TOKEN"
```

**Expected:**
- API does NOT crash (process stays up; `pino` logs an error)
- `/health/ready` returns 503 with `{ "status": "unready", "reason": "database" }`
- Restarting postgres → `/health/ready` returns 200 again, requests resume

### 1.2 Send malformed input

```bash
curl -i http://localhost:4000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"not-an-email","password":""}'
```

**Expected:** 400 with Zod `details` field listing per-field errors. No
stack trace in the response body. Helmet headers (`Strict-Transport-
Security`, `X-Content-Type-Options`) present.

### 1.3 Hit the rate limiter

Loop 30+ logins in 10 s:

```bash
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:4000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"x@y.z","password":"x"}'
done
```

**Expected:** Some return 401 (auth fail), then several return 429 (Express
rate-limit). Behind nginx in prod, the `api_auth` zone (2 r/s) kicks in too.

### 1.4 Cross-tenant bypass attempt

Login as `teacher@other.school.edu`, save the token, then try to read
demo school's exam:

```bash
DEMO_EXAM_ID=$(psql $DATABASE_URL -tAc \
  "SELECT id FROM exams WHERE \"schoolId\"=(SELECT id FROM schools WHERE domain='demo.school.edu') LIMIT 1")

curl -i http://localhost:4000/api/v1/exams/$DEMO_EXAM_ID \
     -H "Authorization: Bearer $OTHER_TEACHER_TOKEN"
```

**Expected:** 403 or 404. **Not** 200. Same shape for `/reports/exams/:id`,
`/integrity/exams/:id`, `/pins/:examId`, etc. The 14 cases in
`apps/api/test/crossTenant.test.ts` cover these in CI; this is the manual
proof.

### 1.5 Drop the WebSocket mid-exam

In a student session at `/exam/:sessionId`:
1. Start the exam, answer a couple of questions
2. Open DevTools → Network → right-click the WS connection → Block / kill
3. Answer 2 more questions while disconnected
4. Unblock the WS

**Expected:**
- Banner shows "No internet connection — answers are being saved locally"
- Local "queued" counter increments
- On unblock: banner switches to "Reconnecting…", queue drains, banner
  disappears
- Submit → all 4 answers saved server-side (verify via SQL or the teacher
  results page)

### 1.6 Expire the access token mid-exam

Wait 16+ minutes after login (access token = 15 min) OR force-expire the
token by editing it client-side. Then take an action:

**Expected:** seamless. The `shared-frontend/apiClient` single-flight
refresh queue catches the 401, calls `/auth/refresh` once, replays the
original request. No UI flicker.

### 1.7 Tamper with the client timer

Open DevTools console mid-exam, run:

```js
// Try to extend the exam — set local timer way in the future
window.__SECONDS_LEFT_OVERRIDE__ = 999999;
```

(There's no actual override hook — tampering would be by editing `setInterval`
or React state.)

**Expected:** Within 15 seconds, the WS heartbeat reply (`pong`
with `secondsRemaining`) arrives and snaps the local timer back to the
server-authoritative value. When the server says 0, the client auto-
submits regardless of what the local state shows.

### 1.8 Forge a JWT with `alg: none`

```bash
HEADER=$(echo -n '{"alg":"none","typ":"JWT"}' | base64)
PAYLOAD=$(echo -n '{"sub":"attacker","role":"PLATFORM_ADMIN"}' | base64)
TOKEN="${HEADER}.${PAYLOAD}."

curl -i http://localhost:4000/api/v1/sessions/my \
     -H "Authorization: Bearer $TOKEN"
```

**Expected:** 401. Same for HS512-signed tokens with the right secret —
the JWT lib only accepts HS256 (`apps/api/src/lib/jwt.ts`).

### 1.9 Try to read an OTP from logs

Trigger an OTP send while `SMTP_HOST` is unset and `OTP_DEV_LOG` is **not**
set to `1`:

```bash
curl -X POST http://localhost:4000/api/v1/security/sessions/$SESSION_ID/otp/send \
     -H "Authorization: Bearer $STUDENT_TOKEN"
```

**Expected:** API returns success, but `docker compose logs api` shows a
`logger.warn` ("SMTP not configured; OTP not delivered") and **no** OTP
code value. Set `OTP_DEV_LOG=1` (dev only!) and the code shows up in the
debug log.

---

## 2. Per-cycle smoke checks

For each merged cycle, the smallest manual test that proves it landed.

### 2.1 D1 — role split (cycle 2.0a)

```bash
# School admin can manage their own school
curl -s http://localhost:4000/api/v1/admin/users \
     -H "Authorization: Bearer $SCHOOL_ADMIN_TOKEN" | jq '.data | length'
# >> 7 (in seed: 1 admin + 1 teacher + 5 students)

# School admin CANNOT manage another school
curl -i http://localhost:4000/api/v1/admin/users \
     -H "Authorization: Bearer $OTHER_SCHOOL_ADMIN_TOKEN"
# >> Returns rows for OTHER school only (different list)
```

The schema migration is `20260510120000_2_role_split_d1`. After
`prisma migrate deploy`, `psql -c "SELECT unnest(enum_range(NULL::\"Role\"))"`
shows `STUDENT, TEACHER, SCHOOL_ADMIN, PLATFORM_ADMIN` (no `ADMIN` /
`SUPER_ADMIN`).

### 2.2 D6 — console merge (cycle 2.0b)

Hit `:5174`. Login as `teacher@demo.school.edu` — sidebar shows the
teacher items only (Dashboard, Question Bank, AI Generator, etc.).

Logout, login as `admin@demo.school.edu` — sidebar shows the same teacher
items **plus** an "Admin" section (Overview, Live monitor, Users, etc.).
Footer badge shows `SCHOOL_ADMIN`.

URL `/admin/users` works for the admin, redirects to `/` for the teacher.

### 2.3 D4 — per-school AI feature flag (cycle 2.0e)

```bash
# Demo school has the flag ON (seeded). Teacher AI route works:
curl -s -X POST http://localhost:4000/api/v1/ai/generate-questions \
     -H "Authorization: Bearer $DEMO_TEACHER_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"text":"Photosynthesis converts sunlight…","count":2}' \
     | jq '.data | length'
# >> 2 (the route ran)

# Other school has it OFF. Same call returns 403:
curl -i -X POST http://localhost:4000/api/v1/ai/generate-questions \
     -H "Authorization: Bearer $OTHER_TEACHER_TOKEN" \
     -d '{"text":"…","count":2}'
# >> 403, body: { "error": "AI authoring is not enabled…", "code": "feature_disabled" }
```

Toggle off via the API:

```bash
curl -X PUT http://localhost:4000/api/v1/admin/features/ai-authoring \
     -H "Authorization: Bearer $DEMO_SCHOOL_ADMIN_TOKEN" \
     -d '{"enabled":false}'
```

The next demo-teacher AI call now returns 403 too. An audit row lands
in `audit_logs` with `action=FEATURE_DISABLED`.

### 2.4 Cross-tenant impersonation audit (cycle 2.0f)

The seed wrote one sample impersonation row. Verify:

```sql
-- In psql:
SELECT action, "actorRole", "targetSchoolId", "impersonation"
FROM audit_logs
WHERE impersonation = true
LIMIT 5;
```

**Expected:** at least the seeded `SCHOOL_PROVISIONED` row, with
`actorRole='PLATFORM_ADMIN'`, `actorSchoolId=NULL`,
`targetSchoolId=<demo school id>`.

Then provision a real school via the platform portal at `:5176` (login
as PLATFORM_ADMIN). The `audit_logs` table gets a new row with the same
shape. The compliance ledger query is in
`apps/api/src/lib/auditQuery.ts`.

### 2.5 Bulk-import perf (cycle 2.1a)

Generate a 200-row CSV-equivalent payload and POST it:

```bash
USERS=$(node -e "
  console.log(JSON.stringify({users: Array.from({length: 200}, (_, i) => ({
    name: 'Bulk User ' + i,
    email: 'bulk' + i + '@bulk.test',
    role: 'STUDENT',
    password: 'changeme1'
  }))}));
")

time curl -s -X POST http://localhost:4000/api/v1/admin/users/bulk-import \
     -H "Authorization: Bearer $DEMO_SCHOOL_ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d "$USERS" | jq
```

**Expected:** ~5–10s wall clock (vs 50–60s pre-cycle). Response shape
`{ created: 200, skipped: 0, errors: [] }`. Within-batch duplicates →
400 with `duplicates` array.

### 2.6 Integrity N+1 fix (cycle 2.1b)

For an exam with multiple submitted sessions, hit:

```bash
time curl -s http://localhost:4000/api/v1/integrity/exams/$DEMO_EXAM_ID \
     -H "Authorization: Bearer $TEACHER_TOKEN" \
     | jq '. | length'
```

**Expected:** sub-second response regardless of session count (cycle 2.1b
parallelised the per-session analysis with `Promise.all`).

---

## 3. Hot-path durability (the four hero workflows)

Per `docs/01-product.md` §3, these are the four flagship-quality surfaces.

### 3.1 Student exam-taking (focus mode)

1. Login at `:5173` as `student1@demo.school.edu`
2. Start the seeded exam
3. Answer 2 questions
4. Refresh the page (or close + reopen the tab)

**Expected:** Exam resumes, both answers preserved (IndexedDB autosave +
session resume), timer continues from server-authoritative value.

5. Block the WS in DevTools, answer 2 more questions, unblock

**Expected:** Banner shows offline state, queue drains on reconnect,
all answers visible in teacher results.

6. Submit. Verify on the teacher console at `:5174` → `Results` page.

### 3.2 Teacher authoring

1. Login at `:5174` as teacher
2. Go to Question Bank → New Question. Create an MCQ.
3. Go to "New Exam", drag the new question in, set duration, save as DRAFT.
4. Click "Preview as student" (if implemented; otherwise: assign to a
   class, login as that student, hit it from the student portal).

**Expected:** Authoring is single-page, save-on-blur, no destructive
modals. AI Generator (gated by D4 feature flag — ON for demo school)
returns suggestions when seeded with curriculum text.

### 3.3 Results review + grading

1. As teacher, open the seeded exam's `/results` after a student has
   submitted
2. Verify per-question distribution + per-student percentage
3. For an essay question, click "Grade" → rubric editor → save grade

**Expected:** Cross-tenant: an `other.school.edu` teacher hitting the
same URL gets 404. Class-level analytics computed on the fly.

### 3.4 School onboarding + bulk import

Already covered in §2.5. End-to-end path:

1. PLATFORM_ADMIN logs in at `:5176`
2. Provision a new school (gets `SCHOOL_PROVISIONED` audit row)
3. Get the new school admin's email/temp password from the response
4. Login as that admin at `:5174`
5. Bulk-import students via the Admin → Bulk Import page
6. Assign them to a class; create an exam; assign the exam to the class

The whole flow should take under 10 minutes for an IT lead doing it for
the first time.

---

## 4. Compliance smoke checks

These exercise the SOC 2 / FERPA / COPPA evidence trail (per
`docs/01-product.md` §5).

### 4.1 Audit log coverage

After each privileged write in §2 above, verify the `audit_logs` row
exists:

```sql
SELECT action, "targetType", "targetId", "actorRole", "impersonation", "createdAt"
FROM audit_logs
ORDER BY "createdAt" DESC
LIMIT 20;
```

Privileged writes that should always produce a row: USER_CREATED,
USER_UPDATED, USER_DELETED, EXAM_CLOSED, PROCTOR_REMOVED, PIN_GENERATED,
BULK_IMPORT, FEATURE_ENABLED, FEATURE_DISABLED, SCHOOL_PROVISIONED,
SCHOOL_DELETED.

### 4.2 Data-region pinning (GDPR)

```sql
SELECT name, "dataRegion" FROM schools;
```

**Expected:** every school has a non-NULL `dataRegion` (`'UK'` by
default). The field exists on the schema; the actual data-residency
enforcement is ops territory (DB shard per region) — this just confirms
the field is populated.

### 4.3 Student PII hidden from cross-tenant queries

A teacher in school B querying anything that returns student names,
emails, or grades for school A should get 403/404. The 14 regression
cases in `apps/api/test/crossTenant.test.ts` cover the surface.

---

## 5. What's NOT covered here

- **Real Let's Encrypt cert provisioning** — see `docs/RUNBOOK.md` and
  `scripts/dev-certs.sh` (self-signed for local).
- **Hot-path load test** — doesn't exist yet. `docs/decisions.md` D7
  (concurrent-students target) is still Open; without that we don't know
  the load profile to target.
- **A11y conformance** — Stage 4 work (gated on D3). The audit's P2
  flagged 6 icon-only buttons in `ExamSessionPage` missing `aria-label`;
  not yet fixed.
- **AI proxy abuse cases** (token-spend caps, prompt-input length
  bombing). Cycle 1.3 / P1-6 wired the prompt-injection guard; rate-limit
  + spend caps are a Stage 6 / observability concern.

---

## 6. Cross-references

- [`docs/00-audit.md`](00-audit.md) — original diagnosis
- [`docs/03-stage1-closure.md`](03-stage1-closure.md) §3 — chaos test
  mapping
- [`docs/04-stage2-prereqs-closure.md`](04-stage2-prereqs-closure.md) §1 —
  decision-→-implementation map
- [`docs/decisions.md`](decisions.md) — ADRs (D1, D2, D4, D6 Decided;
  D3, D5, D7 Open)
- [`README.md`](../README.md) — quick start + API reference

---

**End of manual testing doc. Updated cycle 2.1d.**
