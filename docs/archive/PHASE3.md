# SecureExam — Phase 3: Admin, Co-proctoring & Notifications

## What's new in Phase 3

### New feature: Exam ownership and co-proctor sharing

**The core idea:** Every exam has one owner (the teacher who created it). The owner can invite
other teachers in the same school to co-proctor. Co-proctors get read access to the live view and
results, but cannot edit the exam or generate PINs.

**Permission matrix:**

| Action                     | Owner | Co-proctor | Admin |
| -------------------------- | ----- | ---------- | ----- |
| Create / edit exam         | ✓     | —          | —     |
| Publish / activate / close | ✓     | —          | ✓     |
| Generate PINs              | ✓     | —          | —     |
| View live proctor          | ✓     | ✓          | ✓     |
| Force-submit / unlock      | ✓     | ✓          | ✓     |
| Flag student               | ✓     | ✓          | ✓     |
| View results               | ✓     | ✓          | ✓     |
| Invite co-proctor          | ✓     | —          | —     |
| Remove co-proctor          | ✓     | —          | ✓     |

---

## Database changes (one migration)

```sql
-- 1. Add isActive column to users
ALTER TABLE users ADD COLUMN isActive BOOLEAN NOT NULL DEFAULT true;

-- 2. New exam_proctors table
CREATE TABLE exam_proctors (
  id        TEXT PRIMARY KEY,
  examId    TEXT REFERENCES exams(id) ON DELETE CASCADE,
  teacherId TEXT REFERENCES users(id),
  invitedBy TEXT REFERENCES users(id),
  invitedAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(examId, teacherId)
);

-- 3. New audit_logs table (14 action types)
CREATE TABLE audit_logs (
  id         TEXT PRIMARY KEY,
  actorId    TEXT REFERENCES users(id),
  action     AuditAction,     -- enum
  targetType TEXT,
  targetId   TEXT,
  meta       JSONB,
  createdAt  TIMESTAMP DEFAULT NOW()
);
```

**Run migration:**

```bash
# Fresh install — Prisma handles it automatically:
npm run db:migrate

# Existing Phase 1/2 database — run the raw SQL:
psql $DATABASE_URL < apps/api/prisma/migrations/phase3_proctors_audit/migration.sql
# Then regenerate Prisma client:
cd apps/api && npx prisma generate
```

---

## New API endpoints

### Co-proctor management

| Method | Path                                        | Who                      | Description          |
| ------ | ------------------------------------------- | ------------------------ | -------------------- |
| GET    | `/api/v1/proctors/exams/:examId`            | Owner, Co-proctor, Admin | List co-proctors     |
| POST   | `/api/v1/proctors/exams/:examId`            | Owner only               | Invite by email      |
| DELETE | `/api/v1/proctors/exams/:examId/:teacherId` | Owner, Admin             | Remove co-proctor    |
| GET    | `/api/v1/proctors/shared-with-me`           | Teacher                  | Exams shared with me |

**Invite a co-proctor:**

```bash
POST /api/v1/proctors/exams/:examId
{ "email": "colleague@school.edu" }
```

### Admin endpoints

| Method | Path                                        | Description                                   |
| ------ | ------------------------------------------- | --------------------------------------------- |
| GET    | `/api/v1/admin/monitor`                     | All active exams school-wide with live counts |
| GET    | `/api/v1/admin/stats`                       | Dashboard overview numbers                    |
| GET    | `/api/v1/admin/users`                       | List users (search, filter, paginate)         |
| POST   | `/api/v1/admin/users`                       | Create user                                   |
| PUT    | `/api/v1/admin/users/:id`                   | Update user (name, role, isActive)            |
| DELETE | `/api/v1/admin/users/:id`                   | Delete user                                   |
| POST   | `/api/v1/admin/users/bulk-import`           | Import up to 500 users from JSON array        |
| GET    | `/api/v1/admin/classes`                     | List classes                                  |
| POST   | `/api/v1/admin/classes`                     | Create class                                  |
| POST   | `/api/v1/admin/classes/:id/members`         | Add students/teachers to class                |
| DELETE | `/api/v1/admin/classes/:id/members/:userId` | Remove member                                 |
| POST   | `/api/v1/admin/exams/:id/close`             | Close any exam                                |
| DELETE | `/api/v1/admin/proctors/:examId/:teacherId` | Remove any co-proctor                         |

### Audit log

| Method | Path            | Description                      |
| ------ | --------------- | -------------------------------- |
| GET    | `/api/v1/audit` | Paginated audit log (admin only) |

Query params: `?page=1&pageSize=50&action=USER_CREATED&actorId=...`

### Exports

| Method | Path                                          | Description                  |
| ------ | --------------------------------------------- | ---------------------------- |
| GET    | `/api/v1/exports/exams/:id/results.csv`       | Download exam results as CSV |
| GET    | `/api/v1/exports/schools/:schoolId/users.csv` | Download all users as CSV    |

### Exam lifecycle

| Method | Path                         | Description             |
| ------ | ---------------------------- | ----------------------- |
| POST   | `/api/v1/exams/:id/activate` | Move PUBLISHED → ACTIVE |
| POST   | `/api/v1/exams/:id/close`    | Close exam (owner only) |

### PIN delivery (updated)

```bash
POST /api/v1/pins/generate
{
  "examId": "...",
  "purposes": ["UNLOCK", "EXIT"],
  "deliverTo": "invigilator@school.edu"   # optional email delivery
}
```

---

## New frontend pages

### Teacher portal (port 5174)

| Page               | Route             | What's new                                  |
| ------------------ | ----------------- | ------------------------------------------- |
| Dashboard          | `/`               | ▶ Activate and Close buttons per exam       |
| Pins + Co-proctors | `/exams/:id/pins` | New "Co-proctors" tab, email delivery field |
| Shared with me     | `/shared`         | Exams where you are a co-proctor            |

**Sidebar** now has a "🤝 Shared with me" nav item.

**Co-proctor invite flow:**

1. Open any exam → click PINs → switch to "Co-proctors" tab
2. Enter colleague's school email → Invite
3. They receive an email notification (if SMTP configured) and the exam appears in their "Shared with me" page
4. They can open the Live view and Results — but not edit the exam or generate PINs

### Admin portal (port 5175) — brand new

| Page         | Route           | Description                                                         |
| ------------ | --------------- | ------------------------------------------------------------------- |
| Overview     | `/`             | Stats cards + role breakdown + recent audit feed                    |
| Live Monitor | `/monitor`      | All active exams, student counts, violations, co-proctors           |
| Users        | `/users`        | Full CRUD: search, filter by role, create, edit, deactivate, delete |
| Bulk Import  | `/users/import` | CSV paste or file upload, up to 500 users                           |
| Classes      | `/classes`      | Create and view classes                                             |
| Audit Log    | `/audit`        | Paginated log of all admin/teacher actions                          |

---

## How to run Phase 3

### Fresh install (recommended)

```bash
# Phase 2 zip is included — just extract and run
unzip secureexam-phase3.zip && cd secureexam
npm install
docker compose up -d postgres redis
npm run db:migrate      # applies all migrations including Phase 3
npm run db:seed         # creates demo data
npm run dev             # starts all 4 apps in parallel
```

**Ports:**

- Student browser: http://localhost:5173
- Teacher portal: http://localhost:5174
- Admin portal: http://localhost:5175
- API: http://localhost:4000

**Demo credentials:**
| Role | Email | Password |
|---------|------------------------------|------------|
| Admin | admin@demo.school.edu | admin123 |
| Teacher | teacher@demo.school.edu | teacher123 |
| Student | student1@demo.school.edu | student123 |

### Upgrading from Phase 2

If you have a Phase 2 database with real data:

```bash
# 1. Run only the Phase 3 migration SQL
psql $DATABASE_URL < apps/api/prisma/migrations/phase3_proctors_audit/migration.sql

# 2. Regenerate Prisma client
cd apps/api && npx prisma generate && cd ../..

# 3. Copy these new/changed files from Phase 3 zip:
#    NEW (backend):
#    - apps/api/src/lib/examAccess.ts
#    - apps/api/src/modules/proctors/proctors.router.ts
#    - apps/api/src/modules/admin/admin.router.ts
#    - apps/api/src/modules/audit/audit.router.ts
#    - apps/api/src/modules/notifications/notifications.service.ts
#    - apps/api/src/modules/exports/exports.router.ts
#    - apps/api/prisma/schema.prisma (updated)
#
#    CHANGED (backend):
#    - apps/api/src/app.ts
#    - apps/api/src/modules/sessions/sessions.router.ts
#    - apps/api/src/modules/pins/pins.router.ts
#    - apps/api/src/modules/exams/exams.router.ts
#    - apps/api/src/websocket/server.ts
#
#    NEW (teacher portal):
#    - apps/teacher/src/components/ProctorsPanel.tsx
#    - apps/teacher/src/pages/SharedExamsPage.tsx
#
#    CHANGED (teacher portal):
#    - apps/teacher/src/App.tsx
#    - apps/teacher/src/components/Layout.tsx
#    - apps/teacher/src/pages/DashboardPage.tsx
#    - apps/teacher/src/pages/PinsPage.tsx
#
#    NEW (admin portal — entire app):
#    - apps/admin/ (all files)

# 4. Restart dev server
npm run dev
```

---

## Security notes for Phase 3

**canProctorExam guard** is now enforced at three layers:

1. REST endpoints (sessions router) — 403 if not owner/co-proctor/admin
2. WebSocket connection — 4003 close if not authorized to join proctor room
3. Admin endpoints — schoolId scoping so admins only see their own school

**Co-proctor constraints:**

- Can only invite teachers in the same school (enforced server-side)
- Cannot invite themselves
- Invitations are idempotent (re-inviting same teacher just updates the timestamp)

**Audit log:** Every destructive or sensitive action (user CRUD, session force-submit,
proctor invite/remove, PIN generation, bulk import) is logged to `audit_logs`.
The audit table is append-only — no update or delete routes are exposed.

**Email PINs:** If SMTP is not configured, PINs are still generated and shown on screen.
The `emailSent: false` response tells the frontend to show the "save now" warning.
