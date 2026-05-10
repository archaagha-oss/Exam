// scripts/load-test/chaos-take-exam.js
//
// Stage 3 / D7 Option 2 load test: 5,000 concurrent students taking an
// exam. See ./README.md for prereqs and pass criteria.
//
// Usage:
//   k6 run scripts/load-test/chaos-take-exam.js
//   k6 run -e MAX_VUS=5000 -e EXAM_DURATION_S=600 scripts/load-test/chaos-take-exam.js

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const API_BASE = __ENV.API_BASE || 'http://localhost:4000/api/v1';
const WS_BASE = __ENV.WS_BASE || 'ws://localhost:4000';
const MAX_VUS = parseInt(__ENV.MAX_VUS || '100', 10);
const EXAM_DURATION_S = parseInt(__ENV.EXAM_DURATION_S || '300', 10);
const STUDENT_PASSWORD = __ENV.STUDENT_PASSWORD || 'student123';

export const options = {
  scenarios: {
    students: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '60s', target: MAX_VUS }, // ramp up
        { duration: `${EXAM_DURATION_S}s`, target: MAX_VUS }, // steady-state exam-taking
        { duration: '30s', target: 0 }, // cool down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'http_req_duration{name:answer-save}': ['p(95)<500', 'p(99)<2000'],
    'http_req_duration{name:start-session}': ['p(95)<1000'],
    'http_req_failed': ['rate<0.001'], // 0.1% error budget
    'ws_round_trip': ['p(95)<1000'],
  },
};

const wsRoundTrip = new Trend('ws_round_trip', true);
const answersSaved = new Counter('answers_saved');
const heartbeatsSent = new Counter('heartbeats_sent');

// Pre-seeded student accounts. seed.ts gives us 5; for >5 VUs we need to
// either pre-seed more (recommended) or have all VUs share the same 5
// (simpler but contention on the same exam session row).
function studentEmailFor(vu) {
  // student1@demo.school.edu .. student5@demo.school.edu round-robin
  const idx = ((vu - 1) % 5) + 1;
  return `student${idx}@demo.school.edu`;
}

export default function () {
  const email = studentEmailFor(__VU);

  // 1. Login
  const loginRes = http.post(
    `${API_BASE}/auth/login`,
    JSON.stringify({ email, password: STUDENT_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } }
  );
  check(loginRes, { 'login 200': (r) => r.status === 200 });
  const token = loginRes.json('data.accessToken');
  if (!token) return;

  // 2. List exams to find one we can take
  const listRes = http.get(`${API_BASE}/sessions/my`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name: 'list-exams' },
  });
  check(listRes, { 'list 200': (r) => r.status === 200 });
  const exams = listRes.json('data') || [];
  const examToTake = exams.find((e) => e.canStart) || exams[0];
  if (!examToTake) return;
  const examId = examToTake.exam?.id || examToTake.examId;
  if (!examId) return;

  // 3. Start (or resume) the session
  const startRes = http.post(
    `${API_BASE}/sessions`,
    JSON.stringify({ examId }),
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      tags: { name: 'start-session' },
    }
  );
  check(startRes, { 'start 2xx': (r) => r.status >= 200 && r.status < 300 });
  const sessionId = startRes.json('data.session.id') || startRes.json('data.sessionId');
  if (!sessionId) return;

  // 4. Open the WS with bearer.<jwt> subprotocol
  const wsUrl = `${WS_BASE}/ws?sessionId=${sessionId}&examId=${examId}`;
  const wsRes = ws.connect(
    wsUrl,
    {
      protocols: [`bearer.${token}`],
    },
    function (socket) {
      let pongAt = 0;
      let pingAt = 0;

      socket.on('open', () => {
        // Heartbeat every 15s
        socket.setInterval(() => {
          pingAt = Date.now();
          socket.send(
            JSON.stringify({
              type: 'session:heartbeat',
              payload: { sessionId },
              timestamp: new Date().toISOString(),
            })
          );
          heartbeatsSent.add(1);
        }, 15000);
      });

      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          if (msg.type === 'pong') {
            pongAt = Date.now();
            if (pingAt > 0) wsRoundTrip.add(pongAt - pingAt);
          }
        } catch {
          /* ignore */
        }
      });

      // Save an answer every 10s via REST (the durable path; WS answer
      // is a duplicate today, will be dropped in cycle 3.0c).
      socket.setInterval(() => {
        const answerPayload = {
          questionId: examToTake.questions?.[0]?.id || 'placeholder',
          selectedIds: ['a'],
        };
        const idempotencyKey = `${sessionId}-${__VU}-${Date.now()}-${Math.random()}`;
        const res = http.post(
          `${API_BASE}/sessions/${sessionId}/answer`,
          JSON.stringify(answerPayload),
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
            },
            tags: { name: 'answer-save' },
          }
        );
        if (res.status === 200 || res.status === 201) answersSaved.add(1);
      }, 10000);

      socket.setTimeout(() => socket.close(), EXAM_DURATION_S * 1000);
    }
  );
  check(wsRes, { 'ws 101': (r) => r && r.status === 101 });

  sleep(1);
}
