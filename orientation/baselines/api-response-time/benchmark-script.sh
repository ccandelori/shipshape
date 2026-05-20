#!/usr/bin/env bash
# ShipShape audit — Category 3: API Response Time baseline.
#
# Prerequisites (the parent thread runs these BEFORE this script):
#   1. PostgreSQL running locally on :5432
#   2. API running on :3000 with E2E_TEST=1 set, e.g.:
#        E2E_TEST=1 pnpm dev:api
#      The E2E_TEST flag activates the test-mode `X-Bench: 1` rate-limit
#      skip in `apiLimiter` (`api/src/app.ts`), so the benchmark measures
#      route+DB latency instead of rate-limiter behavior. The skip is
#      unreachable in dev or production (isTestEnv guard).
#   3. DB seeded: `pnpm db:seed`  → verify counts with the psql block below
#   4. A valid session cookie exported as $SESSION_COOKIE. Easiest:
#        - open http://localhost:5173, sign in as a seeded user
#        - DevTools → Application → Cookies → copy the `session_id` value
#        - export SESSION_COOKIE=<value>
#      (Use an admin user — visibility filter then short-circuits to TRUE and gives
#      a worst-case workload across all documents.)
#   5. autocannon available via `pnpm exec autocannon`.
#
# Idempotent: re-running overwrites the JSON files in this directory.
# Fail-fast: any non-zero exit or unset variable aborts the run.

set -euo pipefail

: "${SESSION_COOKIE:?Set SESSION_COOKIE env var to a valid session_id cookie value}"

API="${API_URL:-http://localhost:3000}"
OUT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DURATION="${DURATION:-30}"

# Sanity: server up?
curl -sf --max-time 3 "${API}/health" >/dev/null \
  || { echo "API not reachable at ${API}/health"; exit 1; }

# Sanity: X-Bench rate-limit skip is active. Burst 30 requests under 1s and
# require all 200s. Without the skip, autocannon at c=10+ would 429 within
# seconds. Aborts early if the API wasn't started with E2E_TEST=1.
burst_status=$(for _ in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code} " \
    -H "Cookie: session_id=${SESSION_COOKIE}" \
    -H "X-Bench: 1" \
    "${API}/api/auth/me"
done)
if echo "$burst_status" | grep -q "429"; then
  echo "Rate-limit hit on burst probe — start the API with E2E_TEST=1 to activate the X-Bench bypass."
  echo "Got: $burst_status"
  exit 1
fi

# Sanity: session cookie actually authenticates?
status=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Cookie: session_id=${SESSION_COOKIE}" "${API}/api/auth/me")
if [ "$status" != "200" ]; then
  echo "Session cookie rejected by /api/auth/me (HTTP $status). Re-export SESSION_COOKIE."
  exit 1
fi

# Top-5 endpoints (ranked by static analysis — see api-response-time section of
# audit-report.md for derivation):
ENDPOINTS=(
  "/api/auth/me"
  "/api/documents?type=wiki"
  "/api/issues"
  "/api/projects"
  "/api/weeks"
)

run_bench () {
  local endpoint="$1" conc="$2"
  # Make a filesystem-safe slug for the output filename.
  local slug
  slug=$(printf '%s' "$endpoint" \
    | sed -e 's|^/||' -e 's|[/?=&]|_|g')
  local out="${OUT_DIR}/api-${slug}-c${conc}.json"
  echo ">>> ${endpoint} @ c=${conc} -> ${out}"
  pnpm exec autocannon \
    -c "$conc" -d "$DURATION" \
    -H "Cookie: session_id=${SESSION_COOKIE}" \
    -H "X-Bench: 1" \
    --json \
    "${API}${endpoint}" \
    > "$out"
}

for endpoint in "${ENDPOINTS[@]}"; do
  for conc in 10 25 50; do
    run_bench "$endpoint" "$conc"
  done
done

echo "Done. JSON results in ${OUT_DIR}/api-*-c{10,25,50}.json"
echo "Parse P50/P95*/P99 with: jq '.latency | {p50, p97_5, p99, mean}' <file>"
echo "Note: autocannon v8 emits p97_5, not native p95; use p97_5 as a conservative P95* proxy."
