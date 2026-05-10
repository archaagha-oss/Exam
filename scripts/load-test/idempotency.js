// scripts/load-test/idempotency.js
//
// Replays the same POST /sessions/:id/answer 100× with the same
// Idempotency-Key. The middleware should return identical responses and
// the underlying student_answers row should be written only once. See
// ./README.md for context.

import http from 'k6/http';
import { check } from 'k6';

const API_BASE = __ENV.API_BASE || 'http://localhost:4000/api/v1';
const STUDENT_EMAIL = __ENV.STUDENT_EMAIL || 'student1@demo.school.edu';
const STUDENT_PASSWORD = __ENV.STUDENT_PASSWORD || 'student123';
const REPLAY_COUNT = parseInt(__ENV.REPLAY_COUNT || '100', 10);

export const options = {
  scenarios: {
    replayer: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1, // One iteration of the default function — that fn does the replays
      maxDuration: '60s',
    },
  },
  thresholds: {
    'http_req_failed': ['rate==0'],
  },
};

export default function () {
  // Login + start session (one-time setup inside the run)
  const loginRes = http.post(
    `${API_BASE}/auth/login`,
    JSON.stringify({ email: STUDENT_EMAIL, password: STUDENT_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  const token = loginRes.json('data.accessToken');
  if (!token) throw new Error('login failed');

  const examsRes = http.get(`${API_BASE}/sessions/my`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const examId = examsRes.json('data.0.exam.id') || examsRes.json('data.0.examId');
  if (!examId) throw new Error('no exam available to take');

  const startRes = http.post(
    `${API_BASE}/sessions`,
    JSON.stringify({ examId }),
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  const sessionId = startRes.json('data.session.id') || startRes.json('data.sessionId');
  if (!sessionId) throw new Error('no session id');
  const questionId = startRes.json('data.questions.0.id');
  if (!questionId) throw new Error('no question to answer');

  // The single Idempotency-Key we replay
  const idemKey = `idempotency-test-${sessionId}-${Date.now()}`;
  const body = JSON.stringify({ questionId, selectedIds: ['a'] });
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': idemKey,
  };

  // Replay
  const responses = [];
  for (let i = 0; i < REPLAY_COUNT; i++) {
    responses.push(http.post(`${API_BASE}/sessions/${sessionId}/answer`, body, { headers }));
  }

  // All responses should be identical
  const first = responses[0].body;
  const allIdentical = responses.every((r) => r.body === first);
  check(null, {
    [`${REPLAY_COUNT}x replays return identical body`]: () => allIdentical,
    'first replay 200/201': () => responses[0].status >= 200 && responses[0].status < 300,
  });

  // Sanity check: a follow-up GET should show only one answer row for this
  // (sessionId, questionId). Verifying by reading the session state.
  const sessionRes = http.get(`${API_BASE}/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const answers = sessionRes.json('data.answers') || {};
  const answerForQ = answers[questionId];
  check(null, {
    'exactly one stored answer for the question': () => !!answerForQ && !Array.isArray(answerForQ),
  });
}
