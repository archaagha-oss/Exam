# SecureExam — Threat Model

> **⚠ Pre-Stage-1 document.** Several "we mitigate X" claims in earlier
> revisions of this file were proven false by cycle 0.1's audit (e.g.
> tenant isolation, server-authoritative timer, JWT algorithm pinning, OTP
> log scrubbing). Stage 1 (cycles 1.1a → 1.4) closed those gaps and pinned
> the relevant invariants in tests. For the current state of what's
> actually in code, read:
>
> - [`docs/03-stage1-closure.md`](03-stage1-closure.md) §1, §3 — every audit
>   P0 / P1 finding mapped to where it was fixed
> - `apps/api/test/crossTenant.test.ts` (14 cross-tenant regressions),
>   `apps/api/test/jwtAlg.test.ts` (alg-confusion), and
>   `apps/api/test/tenantInvariant.test.ts` (static scan against the
>   `findUnique`-by-URL-id pattern that was the source of every IDOR)
> - [`docs/01-product.md`](01-product.md) §4 (stakes ladder) and §5
>   (compliance posture: GDPR + FERPA + COPPA + SOC 2)
>
> Where this file describes attacker capabilities and mitigations
> conceptually it remains useful; where it makes implementation claims
> that conflict with the closure docs above, trust the closure docs.

## What we deter, what we detect, what we cannot prevent

This document is deliberately blunt. Marketing copy that promises "lockdown
browser security" inside a normal web browser misleads schools. The
honest picture below should inform how you sell SecureExam to high-stakes
customers and where you should be transparent about residual risk.

---

## 1. What "browser-based lockdown" actually does

Inside the student tab, our JavaScript:

- Blocks common keyboard shortcuts (Ctrl+T, F12, etc.)
- Suppresses the right-click context menu
- Detects `document.visibilitychange` (tab switch / window blur) and
  reports it as a `FOCUS_LOST` violation
- Watches `document.fullscreenchange` and reports `FULLSCREEN_EXIT`
- Reports each violation to `POST /sessions/:id/violation`

These are **deterrents for casual cheating**: students who don't think
to look for a way around will be caught. They will fail to copy/paste
and panic; they will see the "violation logged" toast and stop.

## 2. What a determined cheater can do

All of the below defeat the in-browser lockdown without our defaults
catching them:

| Attack                                                              | Mitigation today                                                                                                                                | Reality                                                                                                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Open DevTools and disable JavaScript                                | Detection of `document.visibilitychange` won't fire if JS is off.                                                                               | Cannot prevent. Server-side timing analysis (cycle 9) may catch suspiciously fast submissions; honest UI: tell schools "browser lockdown is deterrent only". |
| DevTools → Network tab → block `/violation` requests                | None client-side.                                                                                                                               | Cannot prevent. Idempotency keys + heartbeat absence detection on the server (`session:heartbeat` stops arriving) can flag, not block.                       |
| Run the exam in a VM with the answer document on the host OS        | None.                                                                                                                                           | Cannot prevent. Real proctoring (in-person or live webcam) is the only defense.                                                                              |
| Use a second physical monitor                                       | None.                                                                                                                                           | Cannot prevent.                                                                                                                                              |
| Have someone else take the exam (impersonation)                     | Magic-link auth + IP allowlist (level 2) + OTP to school email (level 3).                                                                       | Mitigated only as far as the email account / network is trusted.                                                                                             |
| Coordinate answers with another student                             | Server-side answer-pattern detection (cycle 9) catches identical answer sequences.                                                              | High signal but probabilistic.                                                                                                                               |
| Reverse-engineer the API and submit answers without taking the exam | JWT auth + session ownership checks + idempotency keys.                                                                                         | The student must be the legitimate session owner. They could submit faster than humanly possible but timing analysis (cycle 9) flags it.                     |
| Page refresh / tab close mid-exam to retry questions                | Answer queue is persisted (IndexedDB, cycle 8) and restored on reload. The session row already has the answers; refresh resumes, doesn't reset. | Working as designed.                                                                                                                                         |

## 3. What only server-side defenses can catch (and what we now do)

Cycle 9 added `apps/api/src/modules/integrity/`:

- **Timing too fast** — total exam time < 30% of allowed.
- **Per-question timing** — three or more questions answered in <1s.
- **Answer-pattern collusion** — two students in the same exam with
  identical (questionId, selectedIds) sequences (≥5 answers).

Findings show up in the teacher's "Integrity" panel (per session and
per exam). They are **flags for human review, not auto-penalties.** A
flagged session is not automatically failed.

## 4. Defenses that would meaningfully raise the bar

In rough order of cost / value:

1. **Live proctoring (camera, microphone, screen share)** — what
   well-funded competitors (ProctorU, Honorlock, Examity) do. Heavy
   privacy and cost implications. Out of scope for self-served K-12.
2. **Hardware-attested clients** — Safe Exam Browser, Apple ASAM.
   Not browser-based; the OS enforces lockdown. **Recommended next
   integration** for schools that need real assurance.
3. **In-person invigilation** — paper sheets aside, students take
   the exam in a school computer lab on supervised devices. The IP
   allowlist (level 2) is designed for this.
4. **Item randomisation + question pools** (already supported) — even
   if a student copies a neighbour's screen, the questions/options
   don't match.
5. **Time pressure on calibrated questions** — exams whose duration
   matches the time required reduces opportunity for outside lookups.

## 5. Honest customer messaging

If you sell to a school, the contract should say:

> SecureExam's in-browser lockdown deters casual cheating but is not a
> substitute for in-person invigilation or hardware-attested kiosk
> software. We provide tooling — magic links, IP allowlists, OTP,
> server-side timing and pattern analysis — that flags suspicious
> activity for human review. We do not guarantee detection of all
> cheating. For high-stakes assessments we recommend (a) running the
> exam in a school computer lab with IP allowlist and live invigilation,
> or (b) using Safe Exam Browser / equivalent kiosk software in
> conjunction with our platform.

Saying this up front protects you in disputes and is correct.

## 6. Where to push next

- **Safe Exam Browser integration**: SEB sends an
  `X-SafeExamBrowser-RequestHash` header derived from the exam config
  key. Validate that header on `/sessions/:examId/start` for high-stakes
  exams; reject the session otherwise. ~2 days work.
- **Hardware fingerprint diff alarms**: already partially implemented.
  Tighten so any change in canvas-fingerprint mid-session is flagged.
- **Heartbeat-based liveness signals**: WS already heartbeats every
  ~15s; if the heartbeat stops while the student is supposedly still
  taking the exam, treat as a strong proctor signal.
- **Cross-exam integrity dashboard**: aggregate findings across the
  school for trend analysis (e.g. always-fast student across all
  exams = different signal from one-off).
