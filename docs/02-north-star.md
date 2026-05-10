# Stage 0 / Cycle 0.3 — North Star

**Date:** 2026-05-10
**Branch:** `claude/stage-0-repo-audit-euvjp`
**Status:** first draft, vision doc — opinionated by design
**Inputs:** `docs/00-audit.md`, `docs/01-product.md`, `docs/decisions.md`
**Horizon:** 12 months (target: 2027-05-10)
**Next:** Stage 1 — security & stability hardening (cycles 1.x)

---

## 0. TL;DR — the one-paragraph vision

In 12 months, **SecureExam is the assessment platform UK and US K-12 schools
choose because it is actually as boring and dependable as it claims to be.**
Teachers author exams in 30 minutes that used to take 3 hours. Students take
those exams without a single autosave gap, on whatever the school issues
them, with the right SEND arrangements applied automatically. IT leads
deploy the platform in an afternoon, prove every privileged action with an
audit-log they can hand to ICO or DfE without flinching, and trust that the
word *Secure* in the product name is earned, not painted on. We don't
promise to revolutionise education. We promise to be there, working, on the
morning of the exam — and to make the rest of the school year quietly
better.

We win by being the **anti-EdTech-bullshit** option: no marketing-AI
headline, no cross-tenant "minor incident," no "scheduled maintenance during
exam window," no upsell for the basic safety features. The four hero
workflows hit flagship quality. The other surfaces are utility-grade and we
say so. Trust compounds; trust is the moat.

---

## 1. Where we are today (the candid diagnosis)

Read `docs/00-audit.md` for detail. Compressed:

The codebase is **mid-maturity with a real engineering spine** — eslint,
husky, CI, multi-stage Docker, pino logs, Prometheus metrics, idempotency
middleware, Zod validation, a populated audit-log table, env-var enforcement
at boot. Eleven prior hardening cycles have shipped real work.

It is **not production-ready**, and the existing docs over-state where the
codebase is. The core multi-tenant invariant is broken in at least 10
routes. The student exam page's autosave is in-memory only despite an
IndexedDB queue having been "wired" two cycles ago. The superadmin
portal — the most-privileged surface — is the least-finished, with a token
in `localStorage`, no Dockerfile, no nginx vhost, and no integration with
the shared-frontend package the other portals adopted.

The gap between docs-claim and code-reality is itself the most important
finding. Each prior cycle added scope and re-claimed completeness without
re-verifying earlier invariants. Stage 1 closes that gap *first*. Until
the audit's P0 fixes ship, no new features ship.

---

## 2. Where we'll be in 12 months — a day in the life

Three vignettes. These are the demos we want to be able to give without
caveats.

### 2.1 Tuesday morning, Year 11 mock GCSE Maths

Mr K is invigilating in the lab. 32 students on school-issued Windows
laptops, Tier 3 lockdown, Safe Exam Browser kiosk. At 09:00 the exam
unlocks. Mr K's invigilator dashboard shows 32 active sessions, time
remaining synced from the server, three students with extended-time
arrangements clearly flagged with their longer end-time. At 09:47 the lab's
wifi blinks — three students see a brief "saving locally" indicator; their
work is queued in IndexedDB and replays cleanly when the network returns
22 seconds later. No-one loses an answer. At 10:30 the exam ends. Within 10
minutes the auto-graded sections are scored, and Mr K starts marking the
two essay questions while the rubric for the multi-mark questions is right
there beside the answer. Grades release at 14:00 to students and tutors;
the head of Maths sees the item-level distribution, spots a dud question,
flags it for the next mock.

The **audit log** for this exam contains every privileged action: who
unlocked the exam, who released grades, who edited a question after release,
which proctor extended whose time. The IT lead can hand the export to the
exams board if challenged.

### 2.2 Sunday afternoon, authoring next week's quiz

Ms A is a Year 7 English teacher. She opens the console, picks her class,
clicks *new exam*. The question bank shows everything she's authored or
inherited from her department. She drags six MCQs and two short-answer
questions onto the canvas, sets a 30-minute window, schedules for Wednesday
period 4. She spends 20 minutes total, plus a 5-minute preview-as-student
check. (Her school has *not* enabled AI authoring; the AI panel is hidden
from her UI entirely, and she doesn't have to think about it.) She closes
the laptop and goes back to her weekend.

### 2.3 First Monday of term, onboarding a new sixth-form college

The college's IT lead, Sam, signed the contract Friday. Monday morning Sam:

1. Logs into the new tenant via Azure AD SSO (first login auto-creates the
   `SCHOOL_ADMIN` account, scoped to their `schoolId`)
2. Pastes the SCIM provisioning endpoint into Microsoft Entra; staff and
   students sync over the next 20 minutes
3. Uploads three CSVs (departments, classes, teacher-to-class assignments).
   The import is idempotent, error-tolerant, and the failures it does flag
   are actionable ("row 47: teacher email not in directory")
4. Reviews the audit log of everything they just did, satisfied
5. Hands a quickstart guide to the head of department

By Tuesday afternoon, the college runs its first practice quiz. The IT
lead never had to write a support ticket.

---

## 3. The five bets

The strategic assumptions we're acting on. If any of these is wrong, the
plan changes.

### Bet 1 — Trust is the wedge, not features

**We believe** schools choose assessment platforms primarily on *trust* —
will it work on exam day, will it leak data, can I defend the result if a
parent challenges it — and only secondarily on feature breadth. Most
incumbents overinvest in marketing-shiny features and underinvest in the
unglamorous reliability and auditability work. We do the opposite.

**Falsifiable by:** schools telling us repeatedly they switched away from
us *because* we lacked feature X, with feature X never being
trust-related. If that happens 3+ times in year 1, the bet's wrong.

### Bet 2 — Microsoft-K12 is large enough to win without Google

**We believe** UK + US Microsoft-shop K-12 + EU is a big enough
addressable market to support v1 without building Google Classroom
integration. The Google half of US K-12 stays a year-2 conversation.

**Falsifiable by:** sales pipeline being >70% Google-school refusals in
the first two quarters of selling. If that happens, we accelerate D2's
revisit.

### Bet 3 — AI is a feature, not a category

**We believe** the wave of "AI-native assessment" startups will cool by
year 2 as the EU AI Act, COPPA enforcement, and parent backlash bite. The
schools that adopted them will be looking for a calmer, defensible
platform — and we'll already be there. AI-as-quiet-helper is the durable
position.

**Falsifiable by:** competitors in the AI-headline space converting K-12
contracts at >2× our rate sustained for 6 months. If so, we re-examine
our AI stance — but we still don't put it in the headline.

### Bet 4 — Compliance is a moat, not a tax

**We believe** the full GDPR + FERPA + COPPA + SOC 2/ISO 27001 stack is
expensive enough to deter the next wave of competitors and credible enough
to convert procurement-cautious customers. We invest in it from Stage 1
because it's the moat, not because it's a checkbox.

**Falsifiable by:** procurement cycles where compliance posture turns out
not to matter — schools sign with non-compliant competitors anyway. Some
of this will happen at the small-school end; we don't let small-school
sales drive the compliance decision.

### Bet 5 — The four hero workflows are sufficient

**We believe** if student-take, author, results, and onboard are all
flagship-quality, schools will tolerate utility-grade everything else
(parent portal, billing UI, comms templates) until v2. We do not have to
build a complete product to win — we have to build the right four
surfaces extremely well.

**Falsifiable by:** post-pilot interviews where churn or non-renewal is
attributed to a non-hero surface. Stage 8 (loop) catches this.

---

## 4. The wedge

**The thing that gets us in the door:**

> *"It works on exam day."*

Every K-12 IT lead has a horror story: the platform that crashed during
mocks, the cross-tenant breach in the local paper, the answers that
didn't save, the "scheduled maintenance" notice that arrived during the
exam window. The SaaS marketing language for "we don't do that" is
*reliability* — and most assessment platforms are bad at it.

The pitch is operational, not feature-led:

- "99.9%+ session-completion rate, measured publicly"
- "Autosave durability 100% — including a forced tab close mid-exam"
- "Zero cross-tenant violations since launch — alerted on the first one"
- "Audit-log coverage 100% on privileged actions"
- "Deployable in an afternoon by your IT lead, not a 6-week onboarding
  consultant"

Every one of those is a Stage 1-3 deliverable. By the time we sell, they
are a fact, not a promise.

---

## 5. The moat

After we win a school, why do we keep them?

1. **Operational dependability compounds.** Each exam season they don't
   have an incident, the cost of switching grows.
2. **Audit-log lock-in (the friendly kind).** Schools accumulate years of
   evidentiary data they trust the format of. Switching means rebuilding
   that evidence trail.
3. **Compliance posture transferability.** A school that adopted us under
   GDPR + FERPA + SOC 2 has built their internal policies referencing us.
   Replacing us means redoing their policies.
4. **SSO + LMS integration depth.** Microsoft-first SSO + LTI 1.3 grade
   passback + SCIM provisioning means we are wired into their identity
   and gradebook layers. Switching is real work, not a click.
5. **Per-school AI flag posture.** Schools that turned AI on tuned it to
   their style; schools that left it off built a workflow without it. In
   either direction, we are now part of their assessment culture.

We are *not* trying to build moats from feature breadth, network effects
across schools, or proprietary item banks. The moat is institutional
trust + integration depth.

---

## 6. The 12-month demo

The single scene we should be able to walk into any K-12 procurement
meeting and execute, end-to-end, in 30 minutes:

```
1.  Open the console as a school IT lead (SSO via Azure AD, MFA prompt).
2.  Show the audit log of the past month — every privileged action,
    timestamped, attributed, exportable.
3.  Switch to a teacher account (impersonation, fully audited).
4.  Author a sectioned 20-question mock GCSE exam.
    Show: question bank, sectioning, MCQ + short-answer + essay,
    access-arrangement awareness, preview-as-student in focus mode.
5.  Schedule the exam to a class. Show the assignment view from the
    student's perspective.
6.  Switch to a student account (in a separate window). Take three
    questions of the exam in focus mode — show the saving indicator,
    the time remaining, the submission state.
7.  Pull the network cable. Take three more questions. The local queue
    indicator is calm and clear.
8.  Reconnect. Watch the queue replay. No work lost. No drama.
9.  Submit. Switch to teacher view. Auto-graded sections are scored.
    Mark one essay with the rubric tool. Release grades.
10. Switch back to IT lead. Show the audit log of everything that
    just happened — including the grade-release action.
```

This demo is not a script we polish. Every step has to work in any tenant
on any environment, any time, on any of the supported devices. If it
doesn't, that step is a Stage 1-7 task.

---

## 7. Anti-patterns — the things we deliberately won't do

Calling these out so we recognise them when temptation hits.

### 7.1 Don't ship features faster than you fix invariants

The previous 11 cycles taught us this. New scope without re-verifying old
guarantees produces a product that is shinier *and* more broken.
**Discipline:** every cycle audits the invariants it claims to preserve.

### 7.2 Don't put "Secure" in the marketing copy without code to back it

The product is named SecureExam. The audit found multi-tenant breaches,
client-authoritative timers, tokens in localStorage. **Discipline:** if a
security claim is in our marketing or docs, it has a corresponding test
that fails the build when the claim becomes false.

### 7.3 Don't treat IT leads as obstacles

Most EdTech treats IT as a procurement gatekeeper to be flattered and
then ignored. We treat them as the daily-driver power user of the most
privileged customer-side role. Their workflow is a hero workflow. Their
audit log requirements drive our schema.

### 7.4 Don't add proctoring theatre

Browser fullscreen + tab-blur detection is not security. We will *use*
those signals at Tier 2 because they have value at Tier 2 stakes, but we
will never market them as "exam-grade lockdown." Tier 3 means SEB on
Windows, full stop.

### 7.5 Don't grow the role matrix

Four roles is plenty: `STUDENT`, `TEACHER`, `SCHOOL_ADMIN`,
`PLATFORM_ADMIN` (post-D1). Every "we need a separate role for examinations
officers" request gets answered with a permission scope on `TEACHER` or
`SCHOOL_ADMIN`, not a new role. Role explosions are a code-smell for
unclear ownership.

### 7.6 Don't build the parent portal in v1

It will be requested. The answer is: parents get an emailed PDF report
and a link to view the grade. The full parent portal is a v2 conversation.
Adding it in v1 doubles the auth + access-control surface for a feature
that doesn't gate purchase.

### 7.7 Don't optimise for the demo over the daily driver

The 12-month demo (§6) is a useful forcing function but the *teacher's
Sunday afternoon* (§2.2) is the real test. We catch this in Stage 8: we
shadow real teachers, not procurement panels.

### 7.8 Don't say "AI" in marketing copy

The AI feature is real, opt-in, useful — and not the headline. The
headline is reliability. AI mention in copy invites the EU AI Act +
COPPA conversation we don't need to have at the top of the funnel.

### 7.9 Don't accept "minor cross-tenant incident"

Zero is the only acceptable rate. Detection, alerting, blast-radius
limitation, post-incident review on the first occurrence. This is the
brand-defining commitment.

### 7.10 Don't run experiments on student exam-taking

Feature-flag everything *except* the hot path. Student-take is not the
place to A/B test. Stability there is sacred. Experiments live in
authoring, results, and admin.

---

## 8. The arc — how Stages 1-8 roll up to North Star

Cross-reference with the audit's recommended Stage 1 ordering (§11) and
the stage plan template.

| Stage | Focus | What it produces toward North Star |
| --- | --- | --- |
| **1 — Security & stability** | Close the audit's P0/P1 gaps. Multi-tenant invariants, server-authoritative timer, real autosave, refresh-token security, superadmin portal hardening (or D1-driven replacement). | Bet 1 (trust as wedge) becomes defensible. Antipattern 7.1, 7.2, 7.9 enforced in code. |
| **2 — Workflow redesign** | Land D1 (role split), D6 (portal consolidation). Rebuild the four hero workflows on the new role + portal architecture. | The four heroes hit flagship quality (§2). Bet 5 testable. |
| **3 — Scale & resilience** | Decide D7. WS fan-out via Redis (if needed). HTTP-idempotent autosave path. Postgres pool sizing. Load-test the hot path. | The §6 demo's pull-the-cable moment works. Bet 1 has hard numbers. |
| **4 — Design system** | Two-mode design system (D3). `shared-frontend` becomes a real DS, not just helpers. Notion-warm + focus mode, fully token-driven. WCAG 2.1 AA verified. | Day-in-the-life vignettes (§2) feel like one product, not five. |
| **5 — High-stakes integrations** | SEB on Windows. Microsoft Entra SSO + SCIM. LTI 1.3 grade passback. AI feature flag (D4). Vendor Platform Admin portal locked-down. | Tier 3 becomes real. Bet 2's "without Google" is sustainable because Microsoft is excellent. |
| **6 — Compliance evidence** | SOC 2 prep work. ISO 27001 mapping. Real DPA + DPIA + ROPA. Sub-processor list. Right-to-erase end-to-end. Audit-log coverage at 100%. | Bet 4 (compliance as moat) operational. |
| **7 — Operations & SLAs** | Public status page. Incident comms playbook. Observability dashboards. SLOs that match the wedge claims (§4). | The marketing claims are now measurable and published. |
| **8 — Continuous loop** | Real schools, real teachers shadowed, real metrics tracked against North Star, real revisits of the bets. Stage 0 documents updated quarterly. | All bets become falsifiable in practice, not just on paper. |

This is the **commitment**: the stages aren't a feature roadmap; they're
how we earn the one-paragraph claim in §0.

---

## 9. What success looks like in 12 months

By 2027-05-10, we should be able to answer *yes* to all of:

- Are the four hero workflows at flagship quality? (Stages 2, 4)
- Is the audit-vs-reality gap closed? (Stage 1, ongoing process)
- Is hot-path reliability ≥ 99.9% on 12-month rolling data? (Stage 7)
- Is autosave durability 100% on tab-close mid-exam? (Stages 1, 3)
- Are cross-tenant violations at zero? (Stage 1)
- Is audit-log coverage at 100% on privileged actions? (Stage 6)
- Can a new IT lead onboard a school in an afternoon, unassisted? (Stage 2)
- Is the public status page green ≥ 99.9% of exam-window minutes? (Stage 7)
- Are there at least 3 schools who would publicly endorse the platform on
  the strength of *reliability and trust*, not feature breadth? (All)
- Are we sustainably building toward SOC 2 Type II readiness? (Stage 6)

If we can answer yes to seven of ten, North Star is met. If we can answer
yes to all ten, we're ahead of plan.

---

## 10. Cross-references

- **Backward**: `docs/00-audit.md` — diagnosis | `docs/01-product.md` — brief
- **Sideways**: `docs/decisions.md` — open architectural calls (D1–D7)
- **Forward**: Stage 1 (cycle 1.x) — security & stability hardening, kicking
  off with the P0 fixes from `docs/00-audit.md` §11

---

**End of North Star. Stage 0 complete. Pausing for review before Stage 1.**
