# `apps/student` — Student exam-taking SPA

The hot path. Vite + React + Tailwind. Audience: STUDENT role only.
Reaches the API at `/api/v1/*` and the WebSocket at `/ws`. Designed for
focus-mode use — generous whitespace, status-first chrome, no decoration
during an exam.

## Run

```bash
npm run dev --workspace=apps/student     # serves on :5173
```

Demo login (after `npm run db:seed --workspace=apps/api`):
`student1@demo.school.edu` / `student123`.

## Anti-cheat surface (Tier 2)

Implemented in `src/pages/ExamSessionPage.tsx`:

| Mechanism                  | What it does                                                          |
| -------------------------- | --------------------------------------------------------------------- |
| Fullscreen API             | `requestFullscreen()` before exam; `fullscreenchange` triggers a violation |
| `visibilitychange`         | Tab switch → violation                                                |
| `window.blur`              | Alt+Tab → violation                                                   |
| `contextmenu` / `keydown`  | Right-click + Ctrl+U/C/S/V/A/P/F/H/T/W/N/R + Alt+F4/Tab + Meta keys → suppressed + violation |
| `copy` / `cut` / `paste`   | Block + violation                                                     |
| `dragstart`                | Block                                                                 |
| Print blocked              | `@media print { body { display: none } }` injected at exam start      |

Tier 3 (sit-down exams) needs Safe Exam Browser on Windows — placeholder
feature flag `seb-tier-3` exists in the catalogue (cycle 2.0e); the SEB
handoff is Stage 5 work.

## Hot-path correctness (cycle 1.2)

- **Server-authoritative timer.** WS heartbeat reply (`pong`) carries
  canonical `secondsRemaining`. Local 1s `setInterval` interpolates between
  heartbeats; client snaps to server value if drift exceeds 3 s. When the
  server says 0, the client auto-submits regardless of local state.
- **Persistent answer queue.** `src/lib/answerQueue.ts` is IndexedDB-
  backed. Every answer save:
    1. Enqueues to IDB (durable across tab close)
    2. Attempts the POST with an Idempotency-Key
    3. On success, removes from queue
    4. On failure, leaves in queue — drained on reconnect or on next mount
  `dedupeKey` keeps exactly one queued entry per question; the
  Idempotency-Key rotates per save, so server-side dedupe doesn't confuse
  fresh writes with replays.

## WebSocket connect

```js
new WebSocket(
  `wss://exam.yourschool.edu/ws?sessionId=${sessionId}&examId=${examId}`,
  [`bearer.${accessToken}`]   // subprotocol header — never in URL (cycle 1.1b / P1-2)
)
```

The token MUST go in the subprotocol header. The `?token=` query
fallback was removed in cycle 1.1b for being a proxy-log leak.

## Layout

```
src/
├── components/
│   ├── AriaLive.tsx        Screen-reader announcements
│   ├── Calculator.tsx      In-exam calculator (per-exam config)
│   ├── ExitModal.tsx       PIN-confirm exit
│   ├── LockScreen.tsx      Post-violation lock
│   ├── OtpModal.tsx        Pre-exam OTP gate (security tier 2+)
│   ├── RichText.tsx        KaTeX + LaTeX rendering for question bodies
│   └── SubmitConfirmModal.tsx
├── hooks/
│   ├── useDeviceFingerprint.ts
│   ├── useExamWebSocket.ts  bearer.<jwt> subprotocol + reconnect
│   ├── useFocusTrap.ts      Modal a11y
│   └── useIdempotency.ts
├── lib/
│   ├── api.ts               Axios instance with single-flight 401 refresh
│   └── answerQueue.ts       IndexedDB persistence layer
├── pages/
│   ├── ExamListPage.tsx
│   ├── ExamSessionPage.tsx  The hot path. ~1.1k lines.
│   ├── LoginPage.tsx
│   ├── MagicLinkPage.tsx    Pre-exam invite redemption
│   ├── ResultPage.tsx
│   ├── ReviewPage.tsx       Post-submission review
│   └── SubmittedPage.tsx
└── store/
    └── authStore.ts         Memory-only access token (Zustand)
```

## Cross-references

- [`docs/01-product.md`](../../docs/01-product.md) §3.1 — student
  exam-taking is the highest-stakes hero workflow
- [`docs/02-north-star.md`](../../docs/02-north-star.md) §7.10 — "Don't run
  experiments on student exam-taking"
- [`docs/05-manual-testing.md`](../../docs/05-manual-testing.md) §3.1 —
  end-to-end student walkthrough
