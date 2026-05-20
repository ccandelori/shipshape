import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const outDir = join(root, 'orientation/baselines/api-response-time');

const endpoints = [
  {
    name: 'GET /api/auth/me',
    path: '/api/auth/me',
    slug: 'api-api_auth_me',
    userFlow: 'Application boot and auth refresh',
    hypotheses: [
      'Runs session/user lookup plus auth middleware session validation on every request.',
      'Authenticated requests update sessions.last_activity, adding a database write to a read path.',
      'Workspace membership data is reloaded instead of being cached request-locally.',
    ],
  },
  {
    name: 'GET /api/documents?type=wiki',
    path: '/api/documents?type=wiki',
    slug: 'api-api_documents_type_wiki',
    userFlow: 'Dashboard/sidebar wiki document list',
    hypotheses: [
      'Returns an unpaginated list; the supplemental audit seed raises wiki rows to 241.',
      'Visibility checks and admin/membership lookups repeat work already done in auth middleware.',
      'Document properties are JSONB and may become payload/serialization heavy as content grows.',
    ],
  },
  {
    name: 'GET /api/issues',
    path: '/api/issues',
    slug: 'api-api_issues',
    userFlow: 'Issues list and issue tabs',
    hypotheses: [
      'Sorts/filtering depend on JSONB properties such as state, priority, and assignee_id.',
      'Joins user/person rows and then loads associations in a second batched query.',
      'Visibility context repeats membership checks already covered by auth middleware.',
    ],
  },
  {
    name: 'GET /api/projects',
    path: '/api/projects',
    slug: 'api-api_projects',
    userFlow: 'Project list and root layout project context',
    hypotheses: [
      'Per-project correlated subqueries compute sprint_count, issue_count, and inferred status.',
      'Status inference scans sprint/project associations and evaluates sprint dates per row.',
      'Results are not cached even though project summaries are read frequently.',
    ],
  },
  {
    name: 'GET /api/weeks',
    path: '/api/weeks',
    slug: 'api-api_weeks',
    userFlow: 'Dashboard week board and week overview tabs',
    hypotheses: [
      'Main query includes multiple correlated subqueries per week row for issue counts and plan/retro state.',
      'Filters cast JSONB sprint_number to integer, which will need expression indexes at higher volume.',
      'Owner/reporting data is resolved inside the SELECT rather than precomputed or joined once.',
    ],
  },
];

function readRun(endpoint, concurrency) {
  const file = join(outDir, `${endpoint.slug}-c${concurrency}.json`);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  return {
    concurrency,
    file: `orientation/baselines/api-response-time/${endpoint.slug}-c${concurrency}.json`,
    url: json.url,
    duration_seconds: json.duration,
    latency_ms: {
      p50: json.latency.p50,
      p95: null,
      p95_proxy_from_autocannon_p97_5: json.latency.p97_5,
      p99: json.latency.p99,
      mean: json.latency.mean,
      max: json.latency.max,
    },
    requests_per_second: json.requests.average,
    total_requests: json.requests.total,
    errors: json.errors,
    timeouts: json.timeouts,
    status_codes: json.statusCodeStats,
  };
}

const endpointResults = endpoints.map((endpoint) => ({
  name: endpoint.name,
  path: endpoint.path,
  method: 'GET',
  user_flow: endpoint.userFlow,
  runs: [10, 25, 50].map((concurrency) => readRun(endpoint, concurrency)),
  hypotheses: endpoint.hypotheses,
}));

const allRuns = endpointResults.flatMap((endpoint) =>
  endpoint.runs.map((run) => ({ endpoint: endpoint.name, ...run }))
);

const slowestByProxy = [...allRuns].sort(
  (a, b) => b.latency_ms.p95_proxy_from_autocannon_p97_5 - a.latency_ms.p95_proxy_from_autocannon_p97_5
)[0];
const slowestByP99 = [...allRuns].sort((a, b) => b.latency_ms.p99 - a.latency_ms.p99)[0];
const totalErrors = allRuns.reduce((sum, run) => sum + run.errors, 0);
const totalTimeouts = allRuns.reduce((sum, run) => sum + run.timeouts, 0);

const baseline = {
  captured_at: new Date().toISOString(),
  environment: {
    api_url: 'http://localhost:3000',
    database: 'Docker postgres container ship-postgres-1 / ship_dev',
    seed_counts: {
      documents: 500,
      issues: 104,
      users: 20,
      sprints: 35,
      supplemental_benchmark_docs: 243,
    },
  },
  tool: {
    name: 'autocannon',
    version: '8.0.0',
    node: '24.10.0',
    duration_seconds_per_run: 30,
    concurrency_levels: [10, 25, 50],
  },
  percentile_note:
    'autocannon v8 JSON includes p50, p90, p97_5, and p99, but not p95. p95 is stored as null; p95_proxy_from_autocannon_p97_5 is the conservative percentile used for ranking.',
  endpoints: endpointResults,
  summary: {
    total_runs: allRuns.length,
    total_errors: totalErrors,
    total_timeouts: totalTimeouts,
    slowest_by_p95_proxy: {
      endpoint: slowestByProxy.endpoint,
      concurrency: slowestByProxy.concurrency,
      p95_proxy_ms: slowestByProxy.latency_ms.p95_proxy_from_autocannon_p97_5,
      p99_ms: slowestByProxy.latency_ms.p99,
      requests_per_second: slowestByProxy.requests_per_second,
    },
    slowest_by_p99: {
      endpoint: slowestByP99.endpoint,
      concurrency: slowestByP99.concurrency,
      p95_proxy_ms: slowestByP99.latency_ms.p95_proxy_from_autocannon_p97_5,
      p99_ms: slowestByP99.latency_ms.p99,
      requests_per_second: slowestByP99.requests_per_second,
    },
    recommended_phase_2_targets: [
      'GET /api/issues: add expression indexes for hot JSONB properties, simplify priority sorting, and reduce repeated auth/visibility membership lookups.',
      'GET /api/documents?type=wiki: add pagination or list-summary responses so large wiki payloads do not dominate list-mode navigation.',
      'All authenticated routes: throttle sessions.last_activity writes instead of writing every request.',
    ],
  },
};

writeFileSync(
  join(root, 'orientation/baselines/api-baseline.json'),
  `${JSON.stringify(baseline, null, 2)}\n`
);

const tableRows = [
  'Endpoint | C | P50 ms | P95* ms | P99 ms | Mean ms | RPS | Requests | Errors | Timeouts',
  '--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:',
];
for (const endpoint of endpointResults) {
  for (const run of endpoint.runs) {
    tableRows.push(
      [
        endpoint.name,
        run.concurrency,
        run.latency_ms.p50,
        run.latency_ms.p95_proxy_from_autocannon_p97_5,
        run.latency_ms.p99,
        run.latency_ms.mean,
        run.requests_per_second,
        run.total_requests,
        run.errors,
        run.timeouts,
      ].join(' | ')
    );
  }
}

const metricsText = [
  'Taskmaster Task 4 API response-time metrics',
  `Captured: ${baseline.captured_at}`,
  '',
  'P95 note:',
  'autocannon v8.0.0 JSON does not emit a native p95 field. The P95* column below is autocannon p97_5, used as a conservative p95 proxy. Raw JSON files preserve the original p97_5 field.',
  '',
  ...tableRows,
  '',
  'Slowest by P95* proxy:',
  `${slowestByProxy.endpoint} @ c=${slowestByProxy.concurrency}: ${slowestByProxy.latency_ms.p95_proxy_from_autocannon_p97_5} ms P95*, ${slowestByProxy.latency_ms.p99} ms P99, ${slowestByProxy.requests_per_second} rps`,
  '',
  'Slowest by P99:',
  `${slowestByP99.endpoint} @ c=${slowestByP99.concurrency}: ${slowestByP99.latency_ms.p99} ms P99, ${slowestByP99.latency_ms.p95_proxy_from_autocannon_p97_5} ms P95*, ${slowestByP99.requests_per_second} rps`,
  '',
  `Errors: ${totalErrors}`,
  `Timeouts: ${totalTimeouts}`,
  '',
].join('\n');
writeFileSync(join(root, 'orientation/baselines/api-metrics-extracted.txt'), metricsText);

const endpointText = [
  'Taskmaster Task 4 endpoint analysis',
  `Captured: ${baseline.captured_at}`,
  '',
  'Selection method:',
  'Endpoints were selected from the audit trace/static-analysis work already recorded in orientation/audit-report.md: high-frequency authenticated routes used during app boot, dashboard load, sidebar/list refreshes, issue/project views, and week board views.',
  '',
  'Top 5 endpoints:',
  ...endpointResults.map(
    (endpoint, index) => `${index + 1}. ${endpoint.name} - ${endpoint.user_flow}`
  ),
  '',
  'Raw benchmark files:',
  ...allRuns.map((run) => `- ${run.file}`),
  '',
].join('\n');
writeFileSync(join(root, 'orientation/baselines/endpoint-analysis.txt'), endpointText);

const setupText = [
  'Taskmaster Task 4 load-testing setup',
  `Captured: ${baseline.captured_at}`,
  '',
  'Tool:',
  '- autocannon v8.0.0 installed as a root workspace dev dependency (`pnpm add -D -w autocannon`).',
  '- Verification command: `pnpm exec autocannon --version`.',
  '- node v24.10.0',
  '',
  'Invocation:',
  '- SESSION_COOKIE=<session_id> DURATION=30 bash orientation/baselines/api-response-time/benchmark-script.sh',
  '',
  'Authentication:',
  '- GET /api/csrf-token to obtain CSRF token and connect.sid cookie.',
  '- POST /api/auth/login with dev@ship.local / admin123 and x-csrf-token header.',
  '- Exported the resulting session_id as SESSION_COOKIE.',
  '',
  'Environment:',
  '- API: http://localhost:3000',
  '- Database: Docker container ship-postgres-1, database ship_dev',
  '- Seed verification: orientation/baselines/db-seed-verification.txt',
  '',
  'Rate limiting:',
  '- The worktree already contained an X-Bench: 1 rate-limit bypass in api/src/app.ts before this extraction step. The benchmark script sends X-Bench: 1 so results measure route/database behavior instead of 429 responses.',
  '',
].join('\n');
writeFileSync(join(root, 'orientation/baselines/load-testing-setup.txt'), setupText);
