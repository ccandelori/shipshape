#!/usr/bin/env bash
# Prerequisites: web app running at http://localhost:5173 (or pass URL as $1)
# Optional: pass session cookie as $2 to scan authenticated pages
#   ./a11y-scan-script.sh http://localhost:5173 "ship_session=..."
set -uo pipefail
BASE_URL="${1:-http://localhost:5173}"
COOKIE="${2:-}"

# Page list maps to the 7 candidate pages identified in the report.
# /login is public; the rest require auth. Lighthouse will follow redirects
# to /login when unauthenticated and score the login page instead — the
# parent runner should rerun the protected pages with --extra-headers
# once a session cookie is available.
PAGES=("/login" "/my-week" "/docs" "/issues" "/projects" "/team/allocation" "/settings")

OUTDIR="orientation/baselines/accessibility"
mkdir -p "$OUTDIR"

# Resolve a Chrome binary (Playwright's Chromium works for headless Lighthouse).
if [[ -z "${CHROME_PATH:-}" ]]; then
  CAND="$HOME/Library/Caches/ms-playwright/chromium-1200/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
  if [[ -x "$CAND" ]]; then export CHROME_PATH="$CAND"; fi
fi
echo "CHROME_PATH=${CHROME_PATH:-<auto-detect>}"

EXTRA_HEADERS=""
if [[ -n "$COOKIE" ]]; then
  EXTRA_HEADERS_FILE="$(mktemp)"
  printf '{"Cookie":"%s"}' "$COOKIE" > "$EXTRA_HEADERS_FILE"
  EXTRA_HEADERS="--extra-headers=$EXTRA_HEADERS_FILE"
fi

for page in "${PAGES[@]}"; do
  slug=$(echo "$page" | sed 's|/|_|g; s|^_||; s|^$|home|')
  slug=${slug:-home}
  echo "==> Lighthouse a11y scan: ${BASE_URL}${page}"
  npx --yes lighthouse "${BASE_URL}${page}" \
    --only-categories=accessibility \
    --output=json \
    --output-path="${OUTDIR}/lighthouse-${slug}.json" \
    --chrome-flags='--headless=new --no-sandbox --disable-gpu' \
    ${EXTRA_HEADERS} \
    --quiet || echo "WARN: lighthouse failed for ${page}"
done

# axe-core/cli for serious/critical-only triage
if command -v npx >/dev/null 2>&1; then
  for page in "${PAGES[@]}"; do
    slug=$(echo "$page" | sed 's|/|_|g; s|^_||; s|^$|home|')
    slug=${slug:-home}
    echo "==> axe-core scan: ${BASE_URL}${page}"
    if [[ -n "$COOKIE" ]]; then
      npx --yes @axe-core/cli "${BASE_URL}${page}" \
        --tags wcag2a,wcag2aa,wcag21a,wcag21aa,section508 \
        --chrome-options="no-sandbox" \
        --save "${OUTDIR}/axe-${slug}.json" \
        --exit \
        --cookie "$COOKIE" || echo "WARN: axe found violations for ${page}"
    else
      npx --yes @axe-core/cli "${BASE_URL}${page}" \
        --tags wcag2a,wcag2aa,wcag21a,wcag21aa,section508 \
        --chrome-options="no-sandbox" \
        --save "${OUTDIR}/axe-${slug}.json" \
        --exit || echo "WARN: axe found violations for ${page}"
    fi
  done
fi

echo "Done. Results in ${OUTDIR}/"
