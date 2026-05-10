# Load test scaffolding (Stage 3 / D7 Option 2)

Targets the **5,000 concurrent students** ceiling ratified in
`docs/decisions.md` D7. Cycle 3.0a ships these scenarios runnable against
the existing single-replica setup as a baseline; cycle 3.0c re-runs them
against the multi-replica + Redis-pubsub stack from 3.0b.

## Prereqs

- [k6](https://k6.io) ≥ 0.50. On macOS: `brew install k6`. On Linux:
  see [k6.io/docs/get-started/installation/](https://k6.io/docs/get-started/installation/).
- A running SecureExam stack (api on `:4000`, postgres + redis up).
- Seed data applied: `npm run db:seed --workspace=apps/api`.

## Scenarios

### `chaos-take-exam.js` — the 5k hot path

Simulates `MAX_VUS` students taking the seeded exam concurrently. Each
virtual user:

1. POSTs `/auth/login` to get a JWT
2. POSTs `/sessions` to start the exam
3. Opens a WS to `/ws` with `bearer.<jwt>` subprotocol
4. Heartbeats every 15s; saves an answer every 10s
5. Submits after `EXAM_DURATION_S` seconds

```bash
# Default: 100 VUs, 60s ramp, 5min steady
k6 run scripts/load-test/chaos-take-exam.js

# Real ceiling test — careful, this is the 5k production target
k6 run -e MAX_VUS=5000 scripts/load-test/chaos-take-exam.js
```

What "passes":

- p95 of HTTP `POST /sessions/:id/answer` < 500 ms
- p99 < 2 s
- WS heartbeat round-trip p95 < 1 s
- 0 5xx responses
- 0 lost autosaves (queue drains by end of run)

### `bulk-import.js` — admin onboarding cliff

Validates cycle 2.1a's perf rewrite. 50 concurrent SCHOOL_ADMINs each
posting a 200-row bulk-import CSV-equivalent payload.

```bash
k6 run scripts/load-test/bulk-import.js
```

What "passes":

- Each individual import returns under 30 s wall clock
- Aggregate p99 < 60 s
- 200 × 50 = 10,000 users imported across the run
- 0 within-batch duplicate errors (the input avoids them)
- Exactly one `BULK_IMPORT` audit row per import

### `idempotency.js` — replay safety

The same `POST /sessions/:id/answer` request, replayed 100× with the
same `Idempotency-Key` header, must return the same response and only
take effect once.

```bash
k6 run scripts/load-test/idempotency.js
```

What "passes":

- All 100 responses are byte-identical
- DB has one `student_answers` row, not 100

## Running against staging

```bash
k6 run \
  -e API_BASE=https://api.staging.secureexam.app \
  -e WS_BASE=wss://api.staging.secureexam.app \
  scripts/load-test/chaos-take-exam.js
```

Don't run against production without ops sign-off — even at MAX_VUS=100
this hits real DB write rates that can affect real exams in flight.

## Where the numbers go

After each run, k6 prints summary stats. For the post-cycle-3.0c run,
results land in `docs/07-stage3-closure.md`'s "load-test numbers" table
so we have the audit trail of what we actually hit vs the 5k target.
