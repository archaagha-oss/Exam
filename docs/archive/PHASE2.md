# SecureExam — Phase 2: Live Proctoring

## What's new in Phase 2

### Backend changes

**`apps/api/src/websocket/server.ts` — full rewrite**

- Stale heartbeat detection: students who miss 45s of heartbeats are flagged as offline
- `proctor:full_snapshot` message type — teacher requests all session snapshots on connect
- `buildSessionSnapshot()` — per-session live snapshot including connection status and time remaining
- `getExamSnapshots()` — bulk snapshot of all sessions for a given exam (also used by REST)
- Broadcasts `proctor:update` on every heartbeat and every answer save, so teacher cards update fluidly
- Broadcasts `proctor:student_disconnected` and `proctor:student_stale` when students go offline

**`apps/api/src/modules/sessions/sessions.router.ts` — new proctor endpoints**

- `GET /sessions/exam/:examId/live` — REST snapshot of all sessions (initial load)
- `GET /sessions/:id/violations` — violation log for one session
- `POST /sessions/:id/force-submit` — teacher submits a student's exam + WS push
- `POST /sessions/:id/remote-unlock` — teacher unlocks a locked student without PIN + WS push
- `POST /sessions/:id/flag` — add a manual flag/violation to a session

### Frontend changes

**`apps/teacher/src/hooks/useProctor.ts` — new**

- Manages WebSocket connection to `examId` proctor room
- Handles all `proctor:*` message types and merges them into a `Map<sessionId, StudentSnapshot>`
- Auto-reconnects on disconnect (3s delay)
- Exposes `forceSubmit`, `remoteUnlock`, `flagSession` async actions
- Loads initial REST snapshot on mount, then keeps it live via WebSocket

**`apps/teacher/src/components/StudentCard.tsx` — new**

- Displays one student's live status: name, status dot, connection indicator, timer, progress bar, violation dots
- Inline confirm flow for force-submit (prevents accidental clicks)
- Inline flag input with optional reason text
- Amber unlock button shown only when student is LOCKED

**`apps/teacher/src/components/ViolationFeed.tsx` — new**

- Scrolling feed of all violation events across all students, newest first
- Click any event to scroll to and highlight that student's card
- Color-coded by violation type
- Shows "connection lost" events alongside regular violations

**`apps/teacher/src/pages/LiveProctorPage.tsx` — new**

- Full-screen page (bypasses sidebar Layout)
- Real-time student grid using CSS Grid auto-fill at 280px min column
- Top bar: exam title, live/reconnecting badge, quick stats, refresh + results links
- Stats bar: active / locked / submitted / violations / offline counts
- Filter bar: All / Active / Locked / Submitted / Not started + search by name/email
- Sort: name / violations / progress / time left
- Right panel: ViolationFeed, hidden on mobile with a toggle button
- Click violation event → scrolls to student card + 3s amber ring highlight

**`apps/teacher/src/pages/DashboardPage.tsx` — updated**

- Added `● Live` button for exams with PUBLISHED or ACTIVE status

**`apps/teacher/src/App.tsx` — updated**

- Added `/exams/:id/live` route pointing to LiveProctorPage (outside Layout)

**`apps/student/src/pages/ExamSessionPage.tsx` — updated**

- Added handler for `session:unlocked` WS message — dismisses lock screen immediately when teacher remotely unlocks, without student needing to enter PIN

---

## WebSocket event reference (Phase 2 additions)

| Direction        | Event                          | Payload                                                                                   |
| ---------------- | ------------------------------ | ----------------------------------------------------------------------------------------- |
| Teacher → Server | `proctor:request_snapshot`     | `{ examId }`                                                                              |
| Server → Teacher | `proctor:full_snapshot`        | `{ sessions: StudentSnapshot[] }`                                                         |
| Server → Teacher | `proctor:update`               | `StudentSnapshot`                                                                         |
| Server → Teacher | `proctor:violation`            | `{ sessionId, studentName, violationType, violationCount, maxViolations, autoSubmitted }` |
| Server → Teacher | `proctor:student_disconnected` | `{ sessionId }`                                                                           |
| Server → Teacher | `proctor:student_stale`        | `{ sessionId, studentName, lastSeen }`                                                    |
| Server → Student | `session:unlocked`             | `{ by: 'instructor' }`                                                                    |

---

## How to open the live proctor view

1. In the teacher dashboard, click the green `● Live` button next to any published exam
2. Or navigate directly to `/exams/:examId/live`
3. The page connects via WebSocket and loads all current sessions
4. Student cards update in real time as students answer questions and violations are detected
