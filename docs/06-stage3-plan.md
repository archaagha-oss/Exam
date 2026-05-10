# Stage 3 — Scale & Resilience plan

**Date:** 2026-05-10
**Status:** Plan, not closure. **D7 ratified Option 2 (~5,000 concurrent students)** so the work below now has a concrete target.
**Inputs:** `docs/decisions.md` D7, `docs/02-north-star.md` §8 (Stage 3 row), `docs/03-stage1-closure.md` §3 (chaos test list), `docs/04-stage2-prereqs-closure.md`.

---

## 0. The target

- **Peak concurrency:** ~5,000 students taking exams at the same minute. Bound by typical K-12 mock-exam morning across ~20 UK secondary schools simultaneously.
- **Peak QPS:** ~10k req/s on the autosave path (5k students × ~2 saves/s during essay writing, with bursts higher).
- **Peak WS connections:** ~5k student sessions + ~200 proctor connections + ~50 platform admin = ~5,250 concurrent WS clients.
- **Peak Postgres write rate:** ~2k writes/s from autosave alone, plus periodic violation + heartbeat side-effects.

We do **not** target geo-sharding, regional replicas, or queue-backed autosave at this stage. Those are post-50k architecture work.

---

## 1. The architecture move

Today (post-Stage-2 prereqs):

```
                                                  ┌────────────┐
   nginx ────► API (single instance) ────────────►│ Postgres   │
   (TLS, vhosts)   ▲                              └────────────┘
                   │
                   ├── ws:/ws  (in-process Map of clients)
                   └──────────────────────► Redis (refresh tokens, OTP rate-limit, idempotency, feature-flag cache)
```

After Stage 3:

```
                  ┌── API replica 1 ──┐
                  │                   ├──── Postgres
   nginx ────────►├── API replica 2 ──┤   (pool sized via env)
                  │                   ├──── Redis (existing) +
                  └── API replica N ──┘     pub/sub channel for WS broadcast
```

The two pieces:

1. **Multiple API replicas behind nginx.** State lives in Postgres + Redis; nothing in-process.
2. **Redis pub/sub WS fan-out.** A WS message published on replica A reaches the WS clients connected to replica B via a shared Redis channel.

---

## 2. Cycle plan

| Cycle | Scope | What it ships | Risk |
| --- | --- | --- | --- |
| **3.0a** ✅ | Stage 3 prep + abstractions | D7 ratified in `decisions.md`. This plan doc. Postgres pool size from env. WS broadcast abstraction (`lib/wsBroadcast.ts`) used by all current callers; in-process impl today. Load-test scaffolding (`scripts/load-test/`) ready to run at any concurrency. | Low — no behaviour change. |
| **3.0b** ✅ *(this cycle)* | Redis pub/sub WS fan-out | `RedisPubSubBroadcaster` added to `lib/wsBroadcast.ts`. Each API replica still tracks its own local sockets; outbound broadcasts/sends go through Redis pub/sub on `ws:broadcast` channel. Origin-uuid dedupe prevents loop-back. Membership ops (register/join) stay local. Default round-robin nginx routing — no sticky sessions required. `docker-compose.prod.yml` gains `API_REPLICAS` + `WS_BROADCASTER=redis-pubsub` env. Set `WS_BROADCASTER=in-process` to opt out (default behaviour preserved for single-replica deploys). | Medium — touches the hot WS path; needs a soak test against a 2-replica stack. |
| **3.0c** ✅ *(this cycle)* | HTTP-only autosave authoritative | REST `POST /sessions/:id/answer` is now the sole authoritative path. WS `session:answer` handler reduced to a no-op stub (kept one release for backwards compat with stale clients; cleanup in cycle 4.x). REST handler triggers `proctor:update` via `setImmediate` so proctors stay live without the WS write path. Student client (`ExamSessionPage.tsx`) no longer sends WS `session:answer`. Load-test scenarios from cycle 3.0a are runnable; numbers go into `07-stage3-closure.md` once a reviewer runs them on staging. | Medium — small surface area but changes the durability invariant. |
| **3.0d** ✅ *(this cycle)* | Stage 3 closure | `docs/07-stage3-closure.md` shipped. Maps every cycle to what landed, plus a multi-replica chaos-test addendum (replica fail-over, cross-replica proctor visibility, Redis fail-over). Numbers in §3 are **TBD until the reviewer runs the load test on staging** — sections + tables are pre-built so the fill-in is mechanical. | Low — doc only. |

Hero-workflow rebuilds (cycles 2.1+ teacher authoring / results / student polish / onboarding UI) can run in parallel — they touch different surfaces.

---

## 3. What lands in cycle 3.0a (this cycle)

### 3.1 Decision log

`docs/decisions.md` D7 marked Decided — Option 2.

### 3.2 Postgres pool size from env

`apps/api/src/lib/prisma.ts` reads the connection pool size from `DATABASE_URL`'s `connection_limit` query param if present, falls back to `PRISMA_CONNECTION_LIMIT` env var, then to 10 (Prisma's default). Production deploys with N replicas can set per-replica pool to (max_connections / N) so the cluster doesn't blow Postgres' connection cap.

### 3.3 WS broadcast abstraction

New `apps/api/src/lib/wsBroadcast.ts` wraps the four operations the WS server does:

- `broadcastToProctors(examId, msg)` — the existing helper
- `sendToSession(sessionId, msg)` — currently inlined
- `joinProctorRoom(examId, ws)` / `leaveProctorRoom(examId, ws)` — bookkeeping

Today the implementation is in-process (the existing `proctorRooms` Map + `sessionClients` Map). The interface is shaped so 3.0b can swap in a Redis pub/sub implementation by replacing one file, with zero call-site changes.

### 3.4 Load-test scaffolding

`scripts/load-test/` with:

- `README.md` — what to install (`k6`), how to run, what each scenario tests
- `chaos-take-exam.js` — k6 scenario: 5,000 virtual users, each opening a WS subprotocol-auth connection and simulating a 30-minute exam (heartbeat + answer save every 10s). Targets the hot path.
- `bulk-import.js` — k6 scenario: 200-row bulk import × 50 concurrent admins. Validates cycle 2.1a's perf rewrite.
- `idempotency.js` — k6 scenario: same answer save replayed 100×; expect identical response from idempotency-key middleware.

The scenarios are runnable today against the single-replica setup; the numbers are the baseline. After cycle 3.0b they get re-run against the multi-replica stack to validate fan-out.

### 3.5 Out of scope this cycle

- The actual Redis pub/sub WS fan-out (cycle 3.0b)
- HTTP-only autosave change (cycle 3.0c)
- Read-replica Postgres wiring (out of D7 Option 2)
- A new metrics dashboard (cycle 3.0c will add the load-test result table)
- nginx upstream config for multiple API replicas (cycle 3.0b)

---

## 4. Open questions for cycle 3.0b / 3.0c

These need to surface during 3.0b / 3.0c, not block 3.0a:

- **Sticky sessions or full fan-out?** With Redis pub/sub, a student doesn't need to stay connected to the same replica — every replica gets every message. But nginx default is round-robin, which means the connection-state-of-mind for the student WS (which session, which exam, etc.) needs to be re-established on reconnect. Options: (a) accept reconnect → re-state cost, (b) sticky sessions via `ip_hash` for /ws only.
- **WS message ordering across replicas.** Redis pub/sub doesn't guarantee global ordering. For exam-taking this is fine (heartbeats and answers are independent); for proctor-monitoring it's also fine (snapshots overwrite). Document the limit.
- **Idempotency-key store size.** Currently 10-min TTL in Redis. At 10k autosave req/s × 600s = 6M keys hot at peak. Each key ~1KB → 6GB. May need shorter TTL or eviction policy. Will surface from the load test.
- **Proctor-room membership.** Currently a per-replica `Set<WebSocket>`. Across replicas, the membership is per-replica too (each replica knows only its own connected proctors). A "broadcast to all proctors of exam X" needs the publish-to-Redis pattern — fine — but a "list of currently-connected proctors" query needs a cross-replica view. May not need to support that.

---

## 5. Cross-references

- [`docs/decisions.md`](decisions.md) D7 — the ratified decision
- [`docs/02-north-star.md`](02-north-star.md) §8 — Stage 3 row in the arc table
- [`docs/03-stage1-closure.md`](03-stage1-closure.md) §3 — the chaos test list (will be re-run against multi-replica in cycle 3.0d)
- [`docs/05-manual-testing.md`](05-manual-testing.md) §1.5 — student "drop the WebSocket mid-exam" walkthrough; cycle 3.0c verifies it on multi-replica

---

**End of Stage 3 plan. Cycle 3.0a ships now; 3.0b and 3.0c follow once 3.0a soaks.**
