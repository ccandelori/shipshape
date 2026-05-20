// k6 benchmark for ShipShape Cat 3 PRD-literal P95 capture.
// k6 emits native P95 (autocannon doesn't), so this script complements the
// autocannon p97.5 captures already in this directory.
//
// Prereqs (same as benchmark-script.sh):
//   - API running on :3001 (or override via K6_API env var) started with E2E_TEST=1
//   - SESSION_COOKIE env var set to a valid session_id
//   - X-Bench: 1 header bypasses the rate limiter (guarded by isTestEnv)
//
// Run examples (driver writes one JSON per endpoint × concurrency):
//   K6_API=http://localhost:3001 SESSION_COOKIE=<...> K6_VUS=10 K6_PATH=/api/issues \
//     k6 run --quiet --summary-export=k6-api_issues-c10.json k6-bench.js
//
// We use constant-VUs scenario (matches autocannon's c=N model: N concurrent
// connections sending in tight loop for the duration).

import http from 'k6/http';
import { check } from 'k6';

const VUS = Number(__ENV.K6_VUS || 10);
const DURATION = __ENV.K6_DURATION || '30s';
const API = __ENV.K6_API || 'http://localhost:3001';
const PATH = __ENV.K6_PATH || '/api/issues';
const SESSION_COOKIE = __ENV.SESSION_COOKIE;
if (!SESSION_COOKIE) {
  throw new Error('SESSION_COOKIE env var required');
}

export const options = {
  scenarios: {
    bench: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(97.5)', 'p(99)', 'max'],
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

const params = {
  headers: {
    Cookie: `session_id=${SESSION_COOKIE}`,
    'X-Bench': '1',
  },
};

export default function () {
  const res = http.get(`${API}${PATH}`, params);
  check(res, { 'status is 2xx': (r) => r.status >= 200 && r.status < 300 });
}
