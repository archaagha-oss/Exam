# SecureExam — Phase 1

A browser-based lockdown exam platform for schools.

**Phase 1 includes:**
- ✅ JWT authentication with role-based access (Student / Teacher / Admin)
- ✅ School, class, and user management
- ✅ Full question bank (MCQ, Multi-Select, True/False, Short Text, Essay)
- ✅ Multi-step exam builder (Settings → Questions → Assign → Publish)
- ✅ Student lockdown browser (fullscreen, violation detection, timer, PIN unlock/exit)
- ✅ Server-side session management with auto-grading for MCQ and True/False
- ✅ WebSocket for real-time violation streaming
- ✅ Teacher results dashboard with per-question breakdown
- ✅ Secure PIN generation (hashed, never stored plain)
- ✅ Docker Compose for local dev and production

---

## Quick Start (Local Dev — 5 minutes)

### Prerequisites

- Node.js 20+
- Docker + Docker Compose

### 1. Clone and install

```bash
git clone https://github.com/yourorg/secureexam.git
cd secureexam
npm install
```

### 2. Start the database

```bash
docker compose up -d postgres redis
```

### 3. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env if needed (defaults work for local dev)
```

### 4. Run database migrations and seed demo data

```bash
npm run db:migrate    # creates all tables
npm run db:seed       # creates demo school, teacher, students, and one exam
```

### 5. Start all apps

```bash
npm run dev
```

| App | URL | Credentials |
|-----|-----|-------------|
| Student Portal | http://localhost:5173 | student1@demo.school.edu / student123 |
| Teacher Portal | http://localhost:5174 | teacher@demo.school.edu / teacher123 |
| API | http://localhost:4000/api/v1 | — |
| API Health | http://localhost:4000/health | — |

---

## Project Structure

```
secureexam/
├── apps/
│   ├── api/                    # Node.js + Express + Prisma backend
│   │   ├── src/
│   │   │   ├── modules/        # auth, users, schools, questions, exams, sessions, reports, pins
│   │   │   ├── websocket/      # WebSocket server (violations, heartbeat)
│   │   │   ├── middleware/     # JWT auth, role guards
│   │   │   └── lib/            # prisma client, jwt helpers
│   │   └── prisma/
│   │       ├── schema.prisma   # Full database schema
│   │       └── seed.ts         # Demo data seeder
│   ├── student/                # React + Vite student lockdown browser (port 5173)
│   └── teacher/                # React + Vite teacher portal (port 5174)
├── packages/
│   └── shared-types/           # TypeScript types shared across all apps
├── docker/                     # Dockerfiles + nginx SPA config
├── nginx/                      # Production reverse proxy config
└── docker-compose.yml          # Local dev stack
```

---

## API Reference

Base URL: `http://localhost:4000/api/v1`

All authenticated routes require: `Authorization: Bearer <access_token>`

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | No | Login → access + refresh tokens |
| POST | `/auth/refresh` | Cookie | Refresh access token |
| POST | `/auth/logout` | Cookie | Clear refresh token |

### Questions (Teacher only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/questions` | List questions (filter: `type`, `difficulty`, `search`, `tags`) |
| POST | `/questions` | Create question |
| PUT | `/questions/:id` | Update question |
| DELETE | `/questions/:id` | Delete question |

### Exams (Teacher only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/exams` | List teacher's exams |
| POST | `/exams` | Create exam |
| GET | `/exams/:id` | Get exam with items |
| PUT | `/exams/:id` | Update exam |
| POST | `/exams/:id/publish` | Publish exam |
| POST | `/exams/:id/assign` | Assign to classes `{ classIds: [...] }` |
| POST | `/exams/:id/items` | Add question `{ questionId, points? }` |
| DELETE | `/exams/:id/items/:itemId` | Remove question |
| PUT | `/exams/:id/items/reorder` | Reorder `{ itemIds: [...] }` |

### Sessions (Student)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sessions/my` | List available exams + session status |
| POST | `/sessions` | Start/resume session `{ examId }` |
| POST | `/sessions/:id/answer` | Save answer `{ questionId, selectedIds?, textAnswer? }` |
| POST | `/sessions/:id/violation` | Report violation `{ type, description? }` |
| POST | `/sessions/:id/submit` | Submit exam |
| POST | `/sessions/:id/unlock` | Unlock after violation `{ pin, examId }` |
| POST | `/sessions/:id/exit` | Exit with PIN `{ pin, examId }` |

### Reports (Teacher)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/reports/exams/:id` | Full results: summary, per-question, per-student |
| GET | `/reports/exams/:id/sessions/:sessionId` | Single student detail |

### PINs (Teacher)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/pins/generate` | Generate PINs `{ examId, purposes: ['UNLOCK','EXIT'] }` |
| GET | `/pins/:examId` | Check PIN status (not values) |

---

## WebSocket Protocol

Connect: `ws://localhost:4000/ws?token=<jwt>&sessionId=<id>&examId=<id>`

### Client → Server

```json
{ "type": "session:heartbeat", "payload": { "sessionId": "..." }, "timestamp": "..." }
{ "type": "session:answer",    "payload": { "sessionId": "...", "questionId": "...", "selectedIds": ["a"] }, "timestamp": "..." }
{ "type": "session:violation", "payload": { "sessionId": "...", "type": "TAB_SWITCH" }, "timestamp": "..." }
```

### Server → Client

```json
{ "type": "violation:recorded", "payload": { "violationCount": 1, "maxViolations": 3 } }
{ "type": "session:locked",     "payload": { "reason": "TAB_SWITCH" } }
{ "type": "session:force_submit", "payload": { "reason": "Maximum violations reached" } }
{ "type": "answer:saved",       "payload": { "questionId": "..." } }
```

---

## Database

### Migrate and seed

```bash
# Apply all migrations
npm run db:migrate

# Seed with demo data
npm run db:seed

# Open Prisma Studio (visual DB browser)
npm run db:studio
```

### Demo accounts (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@demo.school.edu | admin123 |
| Teacher | teacher@demo.school.edu | teacher123 |
| Student 1 | student1@demo.school.edu | student123 |
| Student 2 | student2@demo.school.edu | student123 |
| Student 3–5 | student3-5@demo.school.edu | student123 |

---

## Lockdown Browser — Anti-Cheat Features

The student browser (`apps/student`) enforces:

| Feature | Implementation |
|---------|----------------|
| Fullscreen required | `requestFullscreen()` before exam starts; `fullscreenchange` event monitors exit |
| Tab switching | `visibilitychange` event |
| Window blur (Alt+Tab) | `window.blur` event |
| Right-click | `contextmenu` event → `preventDefault()` |
| Keyboard shortcuts | `keydown` capture: F1–F12, Ctrl+U/C/S/V/A/P/F/H/T/W/N/R, Alt+F4/Tab, Meta+R/C/Q/W/N |
| Copy/paste/cut | `copy`, `cut`, `paste` events → `preventDefault()` |
| Drag & drop | `dragstart` → `preventDefault()` |
| Heartbeat | Sent every 15s via WebSocket; server detects disconnection |
| Violation debounce | Same violation type throttled to once per 2s |
| PIN lock screen | After N violations, exam locks; instructor PIN required to resume |
| Auto-submit | On max violations or timer expiry |
| Server-authoritative timer | Client syncs from `startedAt + durationMinutes`, not trusting client clock |

---

## PIN Security

- PINs are 4-digit random numbers generated with `crypto.randomInt`
- Stored as **bcrypt hashes** (cost factor 10) in the `exam_pins` table
- Plain PIN is returned **once** at generation time and never stored
- Unlock PINs can be reused within the exam; Exit PINs are single-use
- Expire after 24 hours automatically

---

## Production Deployment

### 1. Prepare the server

```bash
# On your server (Ubuntu 22.04+)
apt-get update && apt-get install -y docker.io docker-compose-plugin
systemctl enable --now docker
mkdir -p /opt/secureexam && cd /opt/secureexam
```

### 2. Configure environment

```bash
cp .env.production.example .env
nano .env   # fill in all values
```

### 3. Deploy

```bash
# Pull images and start
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml --profile migrate up migrate
docker compose -f docker-compose.prod.yml up -d

# Seed initial data (first deploy only)
docker compose -f docker-compose.prod.yml exec api node -e "
  const { execSync } = require('child_process');
  execSync('npx ts-node prisma/seed.ts', { stdio: 'inherit' });
"
```

### 4. Update nginx hostnames

Edit `nginx/nginx.conf` and replace `exam.yourschool.edu` and `teacher.yourschool.edu` with your actual domains.

### 5. SSL (Let's Encrypt)

```bash
apt-get install -y certbot
certbot certonly --standalone -d exam.yourschool.edu -d teacher.yourschool.edu
# Then update nginx.conf to enable the HTTPS server blocks and mount certs
```

---

## Adding New Features (Phase 2 checklist)

When you're ready to move to Phase 2 (Live Proctoring):

- [ ] Teacher live proctor page (`/teacher/exams/:id/live`)
- [ ] Teacher connects to WebSocket with `examId` param → joins proctor room
- [ ] Server broadcasts `proctor:violation` and `proctor:update` events (stubs already in WebSocket server)
- [ ] Teacher can send `force-submit` and `unlock` via `POST /sessions/:id/force-submit`
- [ ] Heartbeat timeout detection → mark session as disconnected in proctor view

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API runtime | Node.js 20 + TypeScript |
| API framework | Express.js |
| ORM | Prisma 5 |
| Database | PostgreSQL 15 |
| Cache / pub-sub | Redis 7 |
| WebSocket | `ws` library |
| Validation | Zod |
| Auth | JWT (access 15m + refresh 7d in httpOnly cookie) |
| Passwords | bcrypt (cost 12) |
| Frontend | React 18 + TypeScript + Vite |
| Routing | React Router v6 |
| State | Zustand |
| Styling | Tailwind CSS v3 |
| Containerization | Docker + Docker Compose |
| Reverse proxy | Nginx |
| CI/CD | GitHub Actions |
