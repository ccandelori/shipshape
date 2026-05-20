#!/usr/bin/env bash
# Driver for the k6 PRD-literal P95 capture. Logs in once against the
# E2E_TEST=1 API instance, captures the session cookie, then runs k6 across
# the slowest 2 endpoints × 3 concurrency levels. See k6-bench.js for env
# var contract.

set -euo pipefail

API="${K6_API:-http://localhost:3001}"
OUT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# 1. Get a CSRF token + session cookie via the real login flow.
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT
CSRF=$(curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" "${API}/api/csrf-token" | jq -r '.token')
curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "${API}/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ${CSRF}" \
  -d '{"email":"dev@ship.local","password":"admin123"}' \
  >/dev/null
SESSION_COOKIE=$(awk '$6 == "session_id" { print $7 }' "$COOKIE_JAR")
if [ -z "$SESSION_COOKIE" ]; then
  echo "Login failed — no session_id in cookie jar"; exit 1
fi

# 2. Sanity probe: with E2E_TEST=1 + X-Bench: 1, /api/auth/me bursts should all 200.
for i in $(seq 1 30); do
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Cookie: session_id=${SESSION_COOKIE}" -H "X-Bench: 1" \
    "${API}/api/auth/me")
  if [ "$status" = "429" ]; then
    echo "Rate-limit hit on probe — confirm API started with E2E_TEST=1"; exit 1
  fi
done

# 3. Bench the 2 slowest endpoints (from autocannon) at c=10/25/50.
for path_slug in "/api/issues:api_issues" "/api/documents?type=wiki:api_documents_type_wiki"; do
  PATH_ENC="${path_slug%:*}"
  SLUG="${path_slug##*:}"
  for vus in 10 25 50; do
    out="${OUT_DIR}/k6-${SLUG}-c${vus}.json"
    echo "==> ${PATH_ENC} c=${vus}"
    K6_API="$API" \
    SESSION_COOKIE="$SESSION_COOKIE" \
    K6_VUS="$vus" \
    K6_PATH="$PATH_ENC" \
    k6 run --quiet --summary-export="$out" "$OUT_DIR/k6-bench.js" 2>&1 | tail -2
  done
done

echo ""
echo "==> Done. Summary JSONs at ${OUT_DIR}/k6-*-c{10,25,50}.json"
