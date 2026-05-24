#!/usr/bin/env bash
# Deploy the ShipShape dashboard to the droplet.
#
# Pipeline:
#   1. local build:  pnpm --filter @ship/dashboard build  (generates fresh snapshot.json + vite build)
#   2. rsync dashboard/dist/             → /opt/ship/dashboard/
#   3. rsync orientation/shipshape-report.json → /opt/ship/dashboard-data/shipshape-report.json
#   4. ssh: optional nginx reload (if first deploy, ensure /dashboard/ location block exists)
#   5. smoke test: curl http://<droplet>/dashboard/
#
# Idempotent. No symlinks, no service restart needed — the dashboard is
# static files. The API endpoints at /api/shipshape/* live in ship-api.service
# and require a normal API redeploy via scripts/deploy-droplet.sh.
#
# Required env: same as deploy-droplet.sh (DROPLET_HOST).
#
# Prerequisites on the droplet (one-time):
#   - /opt/ship/dashboard/         (owned by deploy user; nginx alias target)
#   - /opt/ship/dashboard-data/    (owned by deploy user; shipshape-report.json target)
#   - nginx location /dashboard/   (see scripts/nginx/ship-dashboard.conf)
#   - /etc/ship/env contains SHIPSHAPE_DATA_DIR=/opt/ship/dashboard-data

set -euo pipefail

DROPLET_HOST="${DROPLET_HOST:-ship@143.198.163.184}"
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT"

echo "==> [1/5] build dashboard (snapshot + vite)"
pnpm --filter @ship/dashboard build

DIST="${REPO_ROOT}/dashboard/dist"
SNAPSHOT="${REPO_ROOT}/orientation/shipshape-report.json"

if [ ! -d "$DIST" ]; then
  echo "  dashboard/dist not found — build failed?" >&2
  exit 1
fi
if [ ! -f "$SNAPSHOT" ]; then
  echo "  orientation/shipshape-report.json not found — run \`pnpm shipshape\` first" >&2
  exit 1
fi

echo "==> [2/5] ensure remote dirs exist"
ssh "${DROPLET_HOST}" "mkdir -p /opt/ship/dashboard /opt/ship/dashboard-data"

echo "==> [3/5] rsync dashboard/dist/ → /opt/ship/dashboard/"
rsync -az --delete "${DIST}/" "${DROPLET_HOST}:/opt/ship/dashboard/"

echo "==> [4/5] rsync shipshape-report.json → /opt/ship/dashboard-data/"
rsync -az "${SNAPSHOT}" "${DROPLET_HOST}:/opt/ship/dashboard-data/shipshape-report.json"

echo "==> [5/5] smoke test"
PROBE_URL="http://${DROPLET_HOST#*@}/dashboard/"
curl -sS -o /dev/null -w "  /dashboard/ → HTTP %{http_code} in %{time_total}s\n" --max-time 10 "${PROBE_URL}"
PROBE_API="http://${DROPLET_HOST#*@}/api/shipshape/latest"
curl -sS -o /dev/null -w "  /api/shipshape/latest → HTTP %{http_code} in %{time_total}s\n" --max-time 10 "${PROBE_API}"

echo
echo "✅ dashboard deployed to ${DROPLET_HOST}"
echo "   open: http://${DROPLET_HOST#*@}/dashboard/"
echo
echo "   If this is the first deploy, also need to:"
echo "     1. install nginx config: scripts/nginx/ship-dashboard.conf → /etc/nginx/sites-available/"
echo "     2. add SHIPSHAPE_DATA_DIR=/opt/ship/dashboard-data to /etc/ship/env"
echo "     3. systemctl restart ship-api && systemctl reload nginx"
