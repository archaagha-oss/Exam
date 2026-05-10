// scripts/load-test/bulk-import.js
//
// Validates cycle 2.1a's bulk-import perf rewrite under load: 50
// concurrent SCHOOL_ADMINs each posting a 200-row import. See ./README.md.

import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const API_BASE = __ENV.API_BASE || 'http://localhost:4000/api/v1';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@demo.school.edu';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'admin123';

export const options = {
  scenarios: {
    importers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 },
        { duration: '90s', target: 50 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    'http_req_duration{name:bulk-import}': ['p(95)<30000', 'p(99)<60000'],
    'http_req_failed': ['rate<0.001'],
  },
};

const importLatency = new Trend('bulk_import_ms', true);

function randomBatch(vu, iter) {
  return {
    users: Array.from({ length: 200 }, (_, i) => ({
      name: `Bulk ${vu}-${iter}-${i}`,
      email: `bulk-${vu}-${iter}-${i}@bulk-test.local`,
      role: 'STUDENT',
      password: 'changeme1',
    })),
  };
}

export function setup() {
  // Single login → token shared across VUs (the actual write path is what
  // we want to measure).
  const loginRes = http.post(
    `${API_BASE}/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  return { token: loginRes.json('data.accessToken') };
}

export default function (data) {
  const start = Date.now();
  const res = http.post(
    `${API_BASE}/admin/users/bulk-import`,
    JSON.stringify(randomBatch(__VU, __ITER)),
    {
      headers: {
        Authorization: `Bearer ${data.token}`,
        'Content-Type': 'application/json',
      },
      tags: { name: 'bulk-import' },
      timeout: '120s',
    }
  );
  importLatency.add(Date.now() - start);

  check(res, {
    'bulk-import 200': (r) => r.status === 200,
    'created = 200': (r) => r.json('data.created') === 200,
    'no errors': (r) => (r.json('data.errors') || []).length === 0,
  });
}
