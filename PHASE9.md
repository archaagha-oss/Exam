# SecureExam — Phase 9: Security Framework

## Overview

Five-layer security system that separates low-stakes quizzes from high-stakes exams.
Configured per exam. Applied automatically at runtime.

---

## Security levels

Set in Exam Builder → Settings → Security level card picker.

| Level | Name | What it enforces |
|-------|------|-----------------|
| 1 | Basic | Username + password login only. Standard for quizzes. |
| 2 | Medium | Single-use magic link per student + optional IP allowlisting. |
| 3 | High | Magic link + IP check + email OTP (6-digit code, 60s expiry). |

All three levels include the existing lockdown browser, tab/focus detection,
violation counter, and device fingerprinting (automatic on all sessions).

---

## Feature 1 — Magic links

### What they are
A cryptographically secure, 64-character hex URL generated per student per exam.
Each link is single-use — once clicked, it cannot be reused.

### Teacher workflow
1. Set security level to 2 or 3 in Exam Builder
2. Publish the exam
3. Go to Results → 🔗 Magic Links (or Dashboard → 🔗 Links button on the exam row)
4. Select a class + set expiry datetime
5. Click "Generate & email links"
6. Links are emailed automatically. Teacher can also copy individual links manually.

### Student workflow
1. Student receives email: "Your access link for: [Exam Title]"
2. Clicks the big green button in the email
3. Browser opens `/join/:token` in the student portal
4. Link is validated server-side (IP check runs here)
5. Student is authenticated and redirected to the exam

### What happens if the link is reused
`GET /security/join/:token` returns HTTP 410 with message
"This link has already been used". The student portal shows a clear error page.

### What happens if IP is blocked
`GET /security/join/:token` returns HTTP 403 with `code: IP_BLOCKED`.
The student portal shows: "You are not connecting from an allowed network."

---

## Feature 2 — IP allowlisting

### Configuration
Exam Builder → Settings → (appears when security level ≥ 2) → "IP allowlist" field.
Enter comma-separated CIDR ranges: `192.168.1.0/24, 10.0.0.0/8`

### How it works
- Checked at the moment the magic link is clicked (before authentication)
- Also available as an on-demand check via `GET /security/exams/:id/ip-check`
- CIDR matching is done in pure Node.js — no external library
- Empty allowlist = any IP is allowed

### When to use
- Computer labs with fixed IP ranges
- Corporate networks for compliance testing
- Any scenario where you need to ensure the exam is taken on-site

---

## Feature 3 — Email OTP

### Configuration
Exam Builder → Security level 3 → Enable "Require email OTP at exam start" toggle.

### Student flow
1. After clicking magic link, student sees the exam pre-flight screen
2. Clicks "Enter Fullscreen & Begin"
3. OTP modal appears BEFORE fullscreen — shows 6 individual digit boxes
4. Student checks email for a 6-digit code (subject: "Your verification code — [Exam Title]")
5. Enters the code — auto-submits when 6th digit is entered
6. On success: fullscreen activates, exam starts
7. Code expires in 60 seconds; resend button available after expiry

### Security properties
- Code is bcrypt-hashed before storage (server never stores plain code)
- Max 3 attempts before lockout (must request new code)
- Each code single-use; old codes invalidated on resend
- Even if student A forwards their magic link to student B,
  B cannot complete OTP without access to A's email inbox

### Dev/test mode
If `SMTP_HOST` is not set, the plain code is printed to the server console:
`[OTP] Code for student@example.com: 483921`

---

## Feature 4 — Device fingerprinting

### Automatic
Runs on every session, all security levels — no configuration required.

### What it collects (in-browser, no library)
- User-agent, platform, language, timezone, screen resolution/color depth
- Hardware concurrency (CPU core count)
- Canvas fingerprint (text rendered through Canvas 2D API — very stable)
- WebGL renderer string (GPU/driver identification)

All components are combined and SHA-256 hashed before leaving the browser.
No raw PII is sent — only the hash and structured metadata.

### What it detects
- `NEW_DEVICE` — student logs in from a device fingerprint not seen in their last 10 sessions
- `FINGERPRINT_MISMATCH` — fingerprint changes mid-session (indicates device handoff)

### Where alerts appear
- `DeviceAlert` record created in `device_alerts` table
- Also logged as a `Violation` — appears in the live proctor dashboard
  immediately alongside tab-switch and fullscreen violations

---

## New API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/security/exams/:id/invites/generate` | Teacher | Generate magic links for student IDs + email them |
| GET  | `/api/v1/security/exams/:id/invites` | Teacher | List all invites with status |
| POST | `/api/v1/security/exams/:id/invites/send-all` | Teacher | Resend emails for active invites |
| GET  | `/api/v1/security/join/:token` | Public | Validate magic link (IP check runs here) |
| POST | `/api/v1/security/sessions/:id/otp/send` | Student | Send OTP to student email |
| POST | `/api/v1/security/sessions/:id/otp/verify` | Student | Verify OTP code |
| POST | `/api/v1/security/sessions/:id/fingerprint` | Student | Submit device fingerprint |
| GET  | `/api/v1/security/sessions/:id/device-alerts` | Teacher/Admin | View device alerts for session |
| GET  | `/api/v1/security/exams/:id/ip-check` | Public | Check if current IP is allowed |

---

## Database migration

```bash
psql $DATABASE_URL < apps/api/prisma/migrations/phase9_security/migration.sql
cd apps/api && npx prisma generate && cd ../..
npm run dev
```

**Adds:**
- `exams.securityLevel` (int, default 1), `exams.ipAllowlist` (text), `exams.requireOtp` (bool)
- `exam_sessions.deviceFingerprint` (text), `exam_sessions.otpVerifiedAt` (timestamp)
- New table `exam_invites` (magic link tokens)
- New table `exam_otps` (OTP codes, bcrypt-hashed)
- New table `device_alerts` (fingerprint mismatch events)

---

## Files changed

### Backend
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/phase9_security/migration.sql`
- `apps/api/src/modules/security/security.router.ts` ← new
- `apps/api/src/modules/exams/exams.service.ts`
- `apps/api/src/app.ts`

### Teacher portal
- `apps/teacher/src/pages/ExamBuilderPage.tsx` (security level picker, IP input, OTP toggle, publish callout)
- `apps/teacher/src/pages/MagicLinksPage.tsx` ← new
- `apps/teacher/src/pages/ResultsPage.tsx` (🔗 Magic links button)
- `apps/teacher/src/pages/DashboardPage.tsx` (L2/L3 badge, 🔗 Links button)
- `apps/teacher/src/App.tsx`

### Student portal
- `apps/student/src/pages/ExamSessionPage.tsx` (OTP gate, fingerprint on start)
- `apps/student/src/pages/MagicLinkPage.tsx` ← new
- `apps/student/src/components/OtpModal.tsx` ← new
- `apps/student/src/hooks/useDeviceFingerprint.ts` ← new
- `apps/student/src/App.tsx`
