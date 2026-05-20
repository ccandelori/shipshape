#!/usr/bin/env bash
# ShipShape audit — Category 3: API Response Time baseline.
#
# Prerequisites (the parent thread runs these BEFORE this script):
#   1. PostgreSQL running locally on :5432
#   2. API running on :3000 (e.g. `pnpm dev:api`)
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
