# Stage 3 — Closure

**Date:** 2026-05-10 (cycle 3.0c-3.0d)
**Status:** Code complete. Numbers in §3 are **TBD until reviewer runs the load test on staging.**
**Inputs:** `docs/06-stage3-plan.md`, `docs/decisions.md` D7, the cycle 3.0a → 3.0c diffs.

---

## 0. What this stage was for

Per `docs/decisions.md` D7 (ratified 2026-05-10): take SecureExam from
single-instance-by-default to a multi-replica deployment that can carry
~5,000 concurrent students taking exams simultaneously, without
re-architecting for the post-50k case.

Three engineering changes shipped:

1. **WS broadcast abstraction** (cycle 3.0a) so the multi-replica path is
   one file swap.
2. **Redis pub/sub WS fan-out** (cycle 3.0b) so a broadcast on replica A
   reaches sockets on replica B.
3. **REST autosave authoritative** (cycle 3.0c) so durability doesn't
   depend on the WS path being the source of truth.

Plus three pieces of infrastructure / instrumentation:

- Postgres pool size from env (cycle 3.0a).
- `docker-compose.prod.yml` `API_REPLICAS` + `WS_BROADCASTER` env (cycle
  3.0b).
- k6 load-test scaffolding (cycle 3.0a) — the scenarios that produce the
  numbers in §3.

---

## 1. Cycle-→-implementation map

| Cycle | Status | What landed |
| --- | --- | --- |
| **3.0a** | ✅ | D7 ratified. `docs/06-stage3-plan.md`. Postgres pool from env (`PRISMA_CONNECTION_LIMIT`). `WsBroadcaster` interface + in-process impl in `lib/wsBroadcast.ts`. `apps/api/src/websocket/server.ts` refactored to route through the broadcaster. k6 scenarios in `scripts/load-test/`. |
| **3.0b** | ✅ | `RedisPubSubBroadcaster` added. Origin-uuid dedupe. Membership ops stay local; broadcasts go through `ws:broadcast` channel. Factory picks impl from `WS_BROADCASTER` env. `docker-compose.prod.yml` gains `API_REPLICAS` + `WS_BROADCASTER=redis-pubsub`. nginx upstream comment confirms no sticky sessions. |
| **3.0c** | ✅ | REST `POST /api/v1/sessions/:id/answer` is now the **only** authoritative autosave path. WS `session:answer` handler reduced to a no-op stub for backwards compat with stale clients (drop in a future cycle). REST handler triggers `proctor:update` snapshot via `setImmediate` so proctor view stays live without the WS write path. Student client (`apps/student/src/pages/ExamSessionPage.tsx`) no longer sends `session:answer` over WS. |
| **3.0d** | ✅ *(this doc)* | This closure doc. `docs/06-stage3-plan.md` updated with a pointer here. |

---

## 2. The repo's new shape

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

Single replica = `API_REPLICAS=1` (default) — `WsBroadcaster` factory
picks the in-process impl, behaviour identical to the cycle 1.4 baseline
plus the Stage 2 prereqs already shipped.

Multi-replica = `API_REPLICAS=2..N` + `WS_BROADCASTER=redis-pubsub` —
factory picks the Redis-backed impl, every replica subscribes to the
`ws:broadcast` channel, broadcasts and sends fan out via Redis with
origin-uuid dedupe.

---

## 3. Load-test numbers vs the 5k target

> ⚠️ **Reviewer to fill in after running on staging.** Cycle 3.0a shipped
> the k6 scenarios; this section captures the actual numbers vs the D7
> Option 2 target. See `scripts/load-test/README.md` for run commands.

### 3.1 Single-replica baseline

Run: `k6 run -e MAX_VUS=2000 scripts/load-test/chaos-take-exam.js`

| Metric | Target | Actual | Pass / fail |
| --- | --- | --- | --- |
| `http_req_duration{name:answer-save}` p95 | <500 ms | _TBD_ | _TBD_ |
| `http_req_duration{name:answer-save}` p99 | <2,000 ms | _TBD_ | _TBD_ |
| `ws_round_trip` p95 | <1,000 ms | _TBD_ | _TBD_ |
| `http_req_failed` rate | <0.001 | _TBD_ | _TBD_ |
| `answers_saved` | 2k VUs × 30 saves = 60k | _TBD_ | _TBD_ |
| Postgres CPU | <70% sustained | _TBD_ | _TBD_ |
| Redis CPU | <30% sustained | _TBD_ | _TBD_ |
| API CPU | _record per-replica_ | _TBD_ | _TBD_ |

### 3.2 Multi-replica run (the D7 ceiling test)

Run:

```bash
API_REPLICAS=4 WS_BROADCASTER=redis-pubsub PRISMA_CONNECTION_LIMIT=20 \
  docker compose -f docker-compose.prod.yml up -d --build

k6 run -e MAX_VUS=5000 -e EXAM_DURATION_S=900 scripts/load-test/chaos-take-exam.js
```

| Metric | Target | Actual | Pass / fail |
| --- | --- | --- | --- |
| `http_req_duration{name:answer-save}` p95 | <500 ms | _TBD_ | _TBD_ |
| `http_req_duration{name:answer-save}` p99 | <2,000 ms | _TBD_ | _TBD_ |
| `ws_round_trip` p95 | <1,500 ms (one extra Redis hop) | _TBD_ | _TBD_ |
| `http_req_failed` rate | <0.001 | _TBD_ | _TBD_ |
| `answers_saved` | 5k VUs × 90 saves = 450k | _TBD_ | _TBD_ |
| Per-replica WS connections | ~1,250 | _TBD_ | _TBD_ |
| Redis pub/sub channel msg/s | _record_ | _TBD_ | _TBD_ |
| Postgres connection-pool saturation | <80% | _TBD_ | _TBD_ |
| Idempotency-key store size at peak | _record_ | _TBD_ | _TBD_ |

### 3.3 Bulk-import + idempotency baselines

Run:

```bash
k6 run scripts/load-test/bulk-import.js
k6 run scripts/load-test/idempotency.js
```

| Scenario | Target | Actual | Pass / fail |
| --- | --- | --- | --- |
| `bulk-import` p95 (200 rows × 50 admins) | <30 s | _TBD_ | _TBD_ |
| `bulk-import` p99 | <60 s | _TBD_ | _TBD_ |
| `bulk-import` 0 errors | yes | _TBD_ | _TBD_ |
| `idempotency` 100× replay byte-identical | yes | _TBD_ | _TBD_ |
| `idempotency` exactly one student_answers row | yes | _TBD_ | _TBD_ |

---

## 4. Chaos test (multi-replica edition)

The cycle 1.1a chaos test cases in `docs/03-stage1-closure.md` §3 still
apply to the single-replica path. After cycle 3.0b/c, add these:

### 4.1 Replica fail-over mid-exam

1. Start `API_REPLICAS=2` with `WS_BROADCASTER=redis-pubsub`.
2. Take an exam (lands on replica A — confirm via API logs).
3. `docker compose stop api_2` (or whichever holds the student).
4. **Expected:** student WS gets a clean close; `useExamWebSocket` reconnects within ~2s; nginx routes to the surviving replica; queue drains; exam state intact via Postgres + Redis. Submit succeeds.

### 4.2 Cross-replica proctor visibility

1. With 2+ replicas: a teacher opens the proctor view (lands on replica A).
2. A student takes the exam (lands on replica B).
3. **Expected:** teacher's `proctor:update` and `proctor:violation` events fire as the student progresses. Both originate from replica B's REST handler, publish to Redis, replica A's subscriber routes to the local proctor socket.

### 4.3 Redis fail-over mid-exam

1. Start `API_REPLICAS=2` + `WS_BROADCASTER=redis-pubsub`.
2. Take an exam.
3. `docker compose restart redis`.
4. **Expected:** the WS broadcaster logs reconnect attempts (`[wsBroadcast] subscriber error` then recovery). Within ~5s, fan-out resumes. Exam-taking continues uninterrupted (autosave is REST-authoritative — does not depend on Redis pub/sub).

---

## 5. What didn't ship (and why)

- **Per-channel pub/sub.** Currently one shared `ws:broadcast` channel. Every replica receives every message and filters locally. At 5k students × ~30 saves/exam × 4 replicas, that's ~600k pub/sub round-trips per exam window. Acceptable for D7 Option 2; if peak-day load testing pushes the bound, splitting into per-exam channels (`ws:exam:${examId}`) is the next move.
- **Idempotency-key store size mitigation.** At 10k req/s × 600s TTL × ~1KB = ~6GB of Redis hot keys at peak. Will surface in §3 numbers; mitigations are shorter TTL or a Redis eviction policy. Deferred until we have the actual numbers.
- **Postgres read replicas.** Out of D7 Option 2 by design. If §3.2 shows we're saturating writes earlier than 5k, revisit.
- **Geo-shard / regional deployment.** Out of D7 Option 2 by design. Post-50k territory.
- **Removing the WS `session:answer` no-op stub.** Stays for one release for backwards compat with stale student clients. Clean up in cycle 4.x.

---

## 6. Cross-references

- [`docs/decisions.md`](decisions.md) D7 — the ratified target
- [`docs/06-stage3-plan.md`](06-stage3-plan.md) — cycle plan (now fully ✅)
- [`docs/05-manual-testing.md`](05-manual-testing.md) §1 — the original chaos-test list (still applies, plus §4 above)
- [`scripts/load-test/README.md`](../scripts/load-test/README.md) — how to run the scenarios on staging
- [`apps/api/src/lib/wsBroadcast.ts`](../apps/api/src/lib/wsBroadcast.ts) — the abstraction that swaps in/out the impl

---

**End of Stage 3 closure (code complete; numbers in §3 to be filled in by the reviewer post-staging soak).**
