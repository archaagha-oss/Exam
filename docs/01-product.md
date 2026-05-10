# Stage 0 / Cycle 0.2 — Product Brief

**Date:** 2026-05-10
**Branch:** `claude/stage-0-repo-audit-euvjp`
**Status:** first draft, captures Cycle 0.2 product-discovery dialogue
**Inputs:** `docs/00-audit.md` §12, three rounds of clarifying questions
**Outputs:** this brief + `docs/decisions.md` (open architectural calls)
**Next:** Cycle 0.3 — North Star (vision + 12-month bets + non-goals)

---

## 0. TL;DR

SecureExam is a **multi-tenant browser-based assessment platform for K-12
schools in the UK, US, and EU**. The buyer is the school (procurement-led,
multi-stakeholder); the day-to-day power user is the **teacher**; the
high-leverage admin is the **school IT lead**. Stakes range from low-stakes
classroom quizzes to formal sit-down examinations, packaged via the existing
`Exam.securityLevel 1/2/3` field. Compliance posture is the full enterprise
stack — GDPR/UK-GDPR + FERPA + COPPA + SOC 2/ISO 27001 — meaning auditability,
least-privilege, and data-region pinning are baked in from Stage 1, not bolted
on later. The product is **greenfield from a customer standpoint** (nobody is
in production yet) so we can rename routes, restructure data, and break URLs
freely between now and first-paying-school.

The four hero workflows that define the product:

1. **Student exam-taking** — the hot path; if this is bad, we lose customers
   immediately
2. **Teacher exam-authoring** — daily-driver between exam events, with
   AI-assist as an opt-in feature behind a per-school flag
3. **Results review + grading** — the proof-of-value moment teachers, parents,
   and students all touch
4. **School onboarding + bulk import** — the cliff that decides whether a
   signed contract becomes a deployed product

Brand language: **Notion-warm by default** (calm, content-dense, friendly)
across authoring, results, admin, and onboarding. The student exam-taking
surface gets a **focus mode** variant of the same design system —
Stripe-Dashboard discipline (visible time, clear status, nothing decorative).
Same tokens, two interaction registers.

There is no fixed launch deadline. We iterate continuously, shipping each
audit-derived stage independently. Pace is set by quality of the four hero
workflows, not a calendar.

---

## 1. Customer & buyer

### 1.1 Segment

**K-12 schools (primary).** UK is home turf; US K-12 and EU schools are
explicit secondary markets. We are *not* targeting:

- Universities / higher ed (different procurement, different exam formats,
  Canvas-native expectations)
- Bootcamps / corporate training (different threat model — adults, no
  parental consent, no FERPA/COPPA)
- Test-prep / self-study consumer apps (we are B2B; students do not buy)

**The Canvas/Moodle/Schoology integration** the user picked in Cycle 0.2 is
unusual for K-12-only positioning. Captured as **D5** in `decisions.md` —
either we're admitting an opportunistic higher-ed/FE/sixth-form footprint, or
we narrow the v1 LMS list to MS Teams for Education + standalone.

### 1.2 Buyer vs. user

K-12 school sales is multi-stakeholder. Roughly:

| Persona | Cares about | Touches the product |
| --- | --- | --- |
| **Head of department** (Maths/English/Science) | Whether the exam is fair, secure, defensible to parents | Reviews results, signs off on summative tests |
| **School IT lead** | SSO, data-region, audit logs, can-I-deprovision-a-leaver-in-under-60-seconds | Onboarding, role assignment, integrations, incident triage |
| **Senior leadership / Bursar** | Price per student, contract terms, GDPR/DPA, insurance | DPA review, signs the order form |
| **Teacher** | Time saved on Sunday-night marking; how easy authoring is; reliability mid-exam | Daily — authoring, scheduling, grading, feedback |
| **Student** | Doesn't crash; clear time remaining; can pause for SEND arrangements | Exam-taking only |
| **Parent** | Did their child do well; was the assessment fair | View results (read-only portal eventually) |
| **Examinations Officer** (UK secondary) | Calendaring, access arrangements, evidence trail | Heavy use during exam season |

### 1.3 Customer state

**Greenfield.** No paying schools, no production data, nobody to break.
Schema migrations don't need to be online. Old screens don't need to coexist
with new screens. URLs are not stable contracts. Data shapes are mutable. We
move at maximum sane speed until the first design partner signs.

---

## 2. Roles & portals

The repo has **five portals** today (`apps/student`, `apps/teacher`,
`apps/admin`, `apps/superadmin`, `apps/api`) and **four `Role` enum values**
(`STUDENT`, `TEACHER`, `ADMIN`, `SUPER_ADMIN`). Per the audit (§5.2, §0
mismatches), `apps/superadmin` is the unloved orphan: token in `localStorage`,
no Dockerfile, no nginx vhost, no `@secureexam/shared-frontend` adoption. That
matters because Cycle 0.2 confirms the most-privileged customer-side role is
the **school IT lead** — exactly the persona that sits in front of that
portal today.

### 2.1 Role mental model (target state)

```
Vendor side (us — SecureExam staff)
└── Platform Admin            (NEW — vendor-only; replaces today's null-school SUPER_ADMIN)
    • cross-tenant operations: create schools, suspend, billing, support impersonation
    • lives in a separate portal at a non-customer subdomain
    • MFA-required, allowlisted IPs, full audit-log

Customer side (the school)
├── School Admin              (current ADMIN role, beefed up)
│   • the IT lead's daily portal
│   • SSO config, role assignments, audit-log review, data-export, bulk import
│   • scoped strictly to their own schoolId
├── Teacher
│   • author exams, run sessions, grade, view results
│   • scoped to assigned classes/departments
└── Student
    • take exams, view results, manage profile
```

**This is not the current schema.** `SUPER_ADMIN.schoolId` is nullable today
and `/platform/schools` lets it create/delete *any* school. Giving that role
to a single school's IT lead is a cross-tenant nightmare. The redesign is
**D1** in `decisions.md` — recommended split is "vendor Platform Admin
(internal-only) + School Admin (customer)". Until D1 lands, no school-IT
account ever gets `SUPER_ADMIN`.

### 2.2 Portal consolidation

The audit (§12 Q4) raised whether teacher + admin + superadmin should
collapse into a single `/console` portal, since the role-based UX divergence
between them is shallower than the build-system divergence. **D6** in
`decisions.md`. Recommendation: collapse `teacher` + `admin` into one
`console` app with role-aware routing; keep the vendor Platform Admin (per
D1) as a separate, locked-down app. Cuts build matrix from 5 to 3 portals
without losing role separation.

---

## 3. Hero workflows

Cycle 0.2 picked **all four** as hero-tier rather than ranking them. Reading:
in this market, none of these can be a weak link. Anything *outside* this
list (parent portal, billing/usage views, comms templates, integrations
admin) gets utility-grade polish, not hero-tier.

### 3.1 Student exam-taking (the hot path)

The single most consequential surface. Failures here are not bugs — they are
news stories.

**Required behaviours:**

- Server-authoritative timer (audit §0: currently client-authoritative — Stage 1 P0)
- Autosave every answer, locally + remotely; survive a tab crash, network
  blip, or laptop-lid-close
- IndexedDB answer queue actually wired (audit §0: `lib/answerQueue.ts` exists
  with zero importers — Stage 1 P0)
- Recovery from network partition without losing work
- Clear time-remaining, clear submission status, clear "your work is saved"
  signal — at all times, never ambiguous
- Tier-aware lockdown: Tier 1 honour-code, Tier 2 best-effort browser
  lockdown (fullscreen API, visibility tracking, paste blocking), Tier 3
  Safe Exam Browser handoff on Windows

**Design register:** focus mode. Stripe-Dashboard discipline. No decorative
chrome. One column of question, time-remaining always visible, submission
state never ambiguous. Calm, not stressful — but functional, not friendly.

### 3.2 Teacher exam-authoring

Where teachers spend their non-exam time. The product lives or dies on this
flow's quality.

**Required behaviours:**

- Question bank: reusable across exams, taggable, importable
- Question types already in schema: MCQ, multi-select, short-answer, essay,
  numerical, code (audit §3) — UI must cover all
- AI-assist (Gemini/Anthropic — audit §6) hidden behind a per-school flag,
  off by default. When on: question generation, distractor generation,
  rubric drafting. Never auto-publish; always teacher-reviewed.
- **Preview-as-student:** one-click, full fidelity, including the lockdown
  shell so teachers see what students see
- Sectioned exams (`ExamSection` model exists — audit §3)
- Question pools (`ExamPool` model exists — audit §3)
- Schedule + assign-to-class flow (`ExamAssignment` model exists)
- Access arrangements (`StudentAccessArrangement` model exists — extended
  time, rest breaks, scribe notes)

**Design register:** Notion-warm. Generous whitespace. Inline editing where
possible. Drafts saved automatically. Keyboard shortcuts for power users.

### 3.3 Results review + grading

The moment a teacher sees who learned what, and the moment a student/parent
sees the grade. Trust is established or lost here.

**Required behaviours:**

- Per-question rubric grading for essay/short-answer
- Auto-grading for MCQ/multi-select/numerical
- Class-level analytics: distribution, item-level difficulty, time-on-question
- Per-student feedback (free-text + rubric notes)
- Release controls: hold grades until full class is graded; bulk-release
- **Cross-tenant safety:** the audit flagged P0 IDORs in `reports/*` (any
  teacher reads any school's results — §0, §8). Stage 1 fixes these *before*
  any results UI ships.

**Design register:** Notion-warm. Charts that mean something (Stripe-style
restraint on colour). Tables that scan well. Tiered disclosure: summary →
class → student → question.

### 3.4 School onboarding + bulk import

The onboarding cliff. If the IT lead can't get teachers + students + classes
loaded in their first afternoon, the contract evaporates.

**Required behaviours:**

- SSO setup: Azure AD / Microsoft 365 first (per Cycle 0.2). Email/password
  fallback (current state) kept until SSO is everywhere.
- Bulk import: CSV for students, classes, teachers. Idempotent. Re-runnable.
  Error-tolerant. Audit §0 flagged the bulk-import bcrypt-cost regression
  (cost 10 vs cost 12) — Stage 1 fix.
- Department / term / year-group structure
- Role assignment with explicit cross-tenant guards
- Full audit-log of every onboarding action (the IT lead has to be able to
  prove who did what, when)

**Design register:** Notion-warm with a strong wizard frame. Multi-day flow
is fine; resumability is mandatory. Templates and example CSVs everywhere.

---

## 4. Stakes ladder & device matrix

Cycle 0.2 confirmed **mixed stakes** with `Exam.securityLevel 1/2/3` as the
packaging spine. Crosswalk against device fleet:

| Tier | Stakes example | Devices | Lockdown reality |
| --- | --- | --- | --- |
| **1 — Honour** | Weekly quiz, formative check | Any device, including BYOD | None. Browser lockdown is theatre at this tier; we don't pretend. |
| **2 — Lockdown best-effort** | End-of-unit test, mock exam | School-managed Chromebooks/Windows + school iPads | Fullscreen API, visibility tracking, copy/paste block, dev-tools heuristic. iPad fullscreen is partial — documented limitation, not papered over. |
| **3 — Sit-down exam** | Mocks, internal certification, summative | School-managed **Windows** in a lab | Safe Exam Browser handoff. Mandatory IP allowlist. Live invigilator presence. SEB on iPad does not exist; Tier 3 is Windows-only by design. |

**Phones are explicitly out of scope** for exam-taking (Cycle 0.2). Schools
that try anyway get the responsive web fallback at Tier 1 only.

**SEB integration is real roadmap**, not optional. Without it, we cannot sell
into UK secondary schools running mocks under JCQ-ish discipline. Stage 5 or
later — but we don't pretend it's impossible.

---

## 5. Compliance posture

Cycle 0.2 selected the full enterprise stack. Translation into code/process:

| Regime | Code/process implication |
| --- | --- |
| **GDPR / UK-GDPR + DPA 2018** | DPA-signable, DPO-fields-in-schema (already there — audit §3), data-region pinning (`School.dataRegion` exists), right-to-erase flow, subprocessor list maintained, breach-notification process. |
| **FERPA (US K-12)** | Treat student records as the school's data, not ours. Restrict who can see grades (role + relationship). Retention configurable. School can export everything on demand. Directory-info opt-out. |
| **COPPA (US under-13)** | School consent acts in loco parentis. Data minimisation for under-13s. No third-party tracking, no marketing pixels, no behavioural ads — ever. AI authoring (per D4) opt-in only and the per-school flag flips off any AI processing of under-13 data when uncertain. |
| **SOC 2 Type II / ISO 27001** | Mostly org/process work — policies, vendor management, access reviews, change management, incident response. *Code* implications: the existing `AuditLog` table actually gets populated for every privileged action (audit §0 says it's there but underused), least-privilege RBAC (Stage 1 invariant), encryption-at-rest verified, session timeouts, MFA for privileged roles. We don't pursue certification in year one — but every Stage 1-3 decision is made *as if* we will. |

**Decision principle:** auditability-by-default, not bolt-on. Every state
mutation that crosses a trust boundary writes an `AuditLog` row. We accept
the storage cost.

---

## 6. Integrations

### 6.1 SSO / identity

Per Cycle 0.2:

- **MS Teams for Education + Azure AD SSO** — primary v1 target. OIDC + SCIM
  for provisioning. Covers Microsoft-shop UK schools.
- **Email + password** (current state) — fallback. Kept indefinitely for
  pilots and small schools without IdP investment.
- **Google Classroom + Google Workspace SSO** — explicitly **not v1**.
  Captured as **D2** in `decisions.md`. This cuts off ~half of US K-12 by
  device share; the call is owned and revisitable.

### 6.2 LMS / gradebook

Per Cycle 0.2:

- **Canvas / Moodle / Schoology** — secondary integrations. v1 priority is
  inbound roster sync (LTI 1.3) and outbound grade pass-back. Note D5: the
  K-12 footprint here is light, so this priority assumes some higher-ed /
  UK FE / sixth-form interest worth confirming.

### 6.3 Storage / mail / AI

Already in the stack (audit §1, §6):

- S3 for backups and media (`@aws-sdk/client-s3`). Retain.
- nodemailer for transactional. Retain. Verify SPF/DKIM/DMARC during Stage 1
  domain setup.
- `@anthropic-ai/sdk` already a dependency (audit §1). Gemini also referenced
  in `geminiService` (audit §6). **D4** decides where the per-school AI flag
  lives.

---

## 7. AI authoring stance

Cycle 0.2: **optional per-school, admin-toggleable, off by default.**

- AI is *not* the marketing wedge. The headline is "fair, fast, defensible
  exams" — not "AI-generated questions."
- The existing `geminiService` is preserved, wrapped in a feature flag (per
  D4), and exposed in the teacher authoring flow only when the school's IT
  admin opts in.
- When opt-in is off: zero AI calls server-side, zero AI UI client-side.
  This is the COPPA-safe default for under-13 cohorts.
- When opt-in is on: question-generation, distractor-generation, rubric
  drafting, difficulty calibration. Every AI suggestion is teacher-reviewed
  before publish; never auto-publish.
- **Disclosure:** any AI-assisted question is flagged in the audit log so
  schools have evidence trail. No silent AI use.

---

## 8. Brand & UX direction

Cycle 0.2: **Notion — calm, content-dense, friendly.**

### 8.1 Two-mode design system (one token set)

- **Default mode (Notion-warm):** authoring, results, admin, onboarding,
  vendor platform admin. Generous whitespace, soft greys, humanist sans
  (Inter or similar), low decoration density, content-first.
- **Focus mode (Stripe-discipline):** student exam-taking only. Same colour
  tokens but tighter type scale, fewer surfaces, status-first chrome,
  visible time-remaining and submission state at all times.

This is **D3** in `decisions.md` — recommended adoption, not yet ratified.

### 8.2 Component direction

- Tailwind already standardised across 4/5 portals (audit §1; superadmin is
  the outlier with inline `style={}` — Stage 4 brings it into line)
- `shared-frontend` package already exists (audit §1, §0) — Stage 4 expands
  it from auth-helpers into a real design system
- No third-party UI kit. No Material, no Chakra, no shadcn-as-shipped.
  We borrow patterns from shadcn/Radix primitives but own the visual layer.

### 8.3 Accessibility

- WCAG 2.1 AA target. Non-negotiable for K-12 (SEND, IEP, accessibility
  arrangements are first-class — `StudentAccessArrangement` model exists).
- Keyboard navigation for every workflow, including exam-taking
- Screen-reader QA for the four hero workflows (Stage 4 deliverable)
- High-contrast mode, reduced-motion, font-size override
- Per-student access arrangements applied at exam-render time (extended
  time, rest breaks, scribe mode, simplified-language version where
  authored)

---

## 9. Non-goals (v1)

What we deliberately do not do:

- **Live video proctoring.** Roadmap candidate, not v1. Tier 3 is
  invigilator-present in a lab; we don't pretend an algorithm replaces a human.
- **Native mobile apps.** Responsive web only. Phones are not for exam-taking.
- **Marketing site / SEO surface.** B2B, sales-led. Static landing page, no
  blog, no content marketing in v1.
- **Plagiarism detection / similarity scoring.** Out of scope. Schools that
  need this use Turnitin alongside.
- **Standalone gradebook.** We pass grades back to the LMS or export CSV. We
  are not the system of record for grades.
- **Parent comms / messaging.** Email release notifications only. No
  in-product messaging in v1.
- **Question marketplace / shared item bank across schools.** Tenant
  boundary is sacred. No cross-school data flow, full stop.
- **Google Classroom integration.** Per D2.
- **AI as headline feature.** Per §7.

---

## 10. Success metrics

Stage 8 (continuous learning loop, per audit handoff) needs metrics. First
draft, refined as we get real data:

| Metric | Definition | Target |
| --- | --- | --- |
| **Hot-path reliability** | % of exam sessions completed without server-side error or client-side crash | ≥ 99.9% |
| **Autosave durability** | % of submitted answers that survive a forced tab-close mid-exam | 100% |
| **Onboarding time-to-first-exam** | Days from contract-signed to first real exam administered | ≤ 14 days |
| **Authoring time** | Median time to author a 20-question MCQ exam end-to-end | ≤ 30 minutes |
| **Grade-release time** | Median wall-clock from exam-end to grades-released for an MCQ exam | ≤ 10 minutes |
| **Audit-log coverage** | % of privileged actions that produce an `AuditLog` row | 100% |
| **Cross-tenant violation rate** | Any request that returns data outside requester's `schoolId` | 0 (alerts on >0) |
| **Accessibility score** | axe-core CI score on hero flows | 0 violations |

These are the numbers we publish internally. The customer-visible SLA is a
separate document (Stage 7).

---

## 11. Open decisions

Tracked in `docs/decisions.md`. Summary:

- **D1** — split `SUPER_ADMIN` into vendor Platform Admin + customer School Admin
- **D2** — punt Google Classroom from v1 (decided; revisit at year-1 review)
- **D3** — two-mode design system (focus + warm)
- **D4** — per-school AI flag location (`School.featureFlags` JSON vs. dedicated table)
- **D5** — Canvas/Moodle as v1 LMS targets given K-12-only positioning
- **D6** — collapse teacher + admin portals into a single `console`
- **D7** — concurrent-scale ceiling and WebSocket horizontal scaling

D1 and D6 in particular gate large refactors and should be ratified before
Stage 2 begins.

---

## 12. Cross-references

- **Backward**: `docs/00-audit.md` — what the codebase actually is today
- **Sideways**: `docs/decisions.md` — the open architectural calls this brief
  surfaces
- **Forward**: Cycle 0.3 (next) — North Star: 12-month bets, what we want
  the product to *be*, anti-patterns we won't fall into

---

**End of brief. Pausing for review before Cycle 0.3.**
