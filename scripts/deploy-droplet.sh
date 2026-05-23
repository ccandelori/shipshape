#!/usr/bin/env bash
# Deploy Ship to a DigitalOcean droplet (or any single-box Linux host).
#
# Pipeline:
#   1. local build  (pnpm build → api/dist + web/dist + shared/dist)
#   2. pnpm deploy --legacy --filter=@ship/api --prod  → self-contained api bundle
#   3. strip non-runtime cruft (.env files, coverage, src, vitest, eb files)
#   4. rsync api bundle  → /opt/ship/releases/<ts>/api/
#   5. rsync web/dist   → /opt/ship/releases/<ts>/web/dist/
#   6. ssh: switch /opt/ship/current symlink → new release
#   7. ssh: systemctl restart ship-api
#   8. ssh: smoke /health through nginx
#
# Idempotent: every release is timestamp-keyed; old releases are kept until
# manually pruned. To roll back, edit /opt/ship/current symlink + restart.
#
# Required env:
#   DROPLET_HOST   — ssh target, e.g. ship@143.198.163.184 (default: ship@143.198.163.184)
#   DROPLET_USER   — deploy user (default: ship)
#
# Prerequisites on the droplet (one-time, see orientation/deployment.md):
#   - Node 22, pnpm, Postgres 16, nginx installed
#   - /etc/ship/env populated with DATABASE_URL + SESSION_SECRET + PORT + NODE_ENV
#   - ship-api.service systemd unit installed and enabled
#   - /opt/ship/{releases,shared} owned by the deploy user

set -euo pipefail

DROPLET_HOST="${DROPLET_HOST:-ship@143.198.163.184}"
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
BUNDLE_DIR="${REPO_ROOT}/.deploy/ship-api-${TS}"
REMOTE_RELEASE="/opt/ship/releases/${TS}"

cd "$REPO_ROOT"

echo "==> [1/8] local build (pnpm build)"
pnpm build

echo "==> [2/8] pnpm deploy --legacy → ${BUNDLE_DIR}"
pnpm deploy --legacy --filter=@ship/api --prod "${BUNDLE_DIR#$REPO_ROOT/}"

echo "==> [3/8] strip non-runtime cruft from bundle"
for d in coverage src uploads __tests__ .ebextensions .platform; do
  [ -e "${BUNDLE_DIR}/${d}" ] && rm -rf "${BUNDLE_DIR}/${d}"
done
for f in .env.local .env.example .dockerignore .ebignore vitest.config.ts; do
  [ -e "${BUNDLE_DIR}/${f}" ] && rm -f "${BUNDLE_DIR}/${f}"
done
find "${BUNDLE_DIR}/dist" -type d -name "__tests__" -exec rm -rf {} + 2>/dev/null || true

echo "==> [4/8] ensure remote dirs exist"
ssh "${DROPLET_HOST}" "mkdir -p ${REMOTE_RELEASE}/api ${REMOTE_RELEASE}/web/dist"

echo "==> [5/8] rsync api bundle → ${REMOTE_RELEASE}/api/"
rsync -az --delete "${BUNDLE_DIR}/" "${DROPLET_HOST}:${REMOTE_RELEASE}/api/"

echo "==> [6/8] rsync web/dist → ${REMOTE_RELEASE}/web/dist/"
rsync -az --delete "${REPO_ROOT}/web/dist/" "${DROPLET_HOST}:${REMOTE_RELEASE}/web/dist/"

echo "==> [7/8] swap symlink + restart ship-api"
ssh "${DROPLET_HOST}" "bash -se" <<REMOTE
set -euo pipefail
ln -sfn "${REMOTE_RELEASE}" /opt/ship/current
sudo -n systemctl restart ship-api
sudo -n systemctl reload nginx
sleep 2
sudo -n systemctl is-active ship-api
REMOTE

echo "==> [8/8] smoke /health through nginx"
PROBE_URL="http://${DROPLET_HOST#*@}/health"
curl -sS -o /dev/null -w "  /health → HTTP %{http_code} in %{time_total}s\n" --max-time 10 "${PROBE_URL}"

echo
echo "✅ deployed release ${TS} to ${DROPLET_HOST}"
echo "   open: http://${DROPLET_HOST#*@}/"
echo "   roll back: ssh ${DROPLET_HOST} 'ls /opt/ship/releases/'  → pick a prior ts → ln -sfn"
