#!/usr/bin/env bash
# Regenerate the Cat 2 bundle baseline (treemap + build log).
#
# Why this script exists:
#   The audit flagged that bundle-baseline.html was generated ad-hoc
#   without checked-in config. This script + the BUNDLE_ANALYZE=1 hook
#   in web/vite.config.ts make the treemap reproducible from a clean
#   checkout.
#
# Output paths (relative to repo root):
#   orientation/baselines/bundle/bundle-baseline.html  ← treemap
#   orientation/baselines/bundle/build.txt             ← build log

set -euo pipefail

# Resolve repo root from this script's location so it works from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="$REPO_ROOT/orientation/baselines/bundle"

cd "$REPO_ROOT"

echo "==> Building web with BUNDLE_ANALYZE=1 (this is slower than a normal build)"
BUNDLE_ANALYZE=1 pnpm build:web 2>&1 | tee "$OUT_DIR/build.txt"

if [[ ! -f "$REPO_ROOT/web/dist/stats.html" ]]; then
  echo "ERROR: web/dist/stats.html was not produced. Did the analyze build fail?" >&2
  exit 1
fi

cp "$REPO_ROOT/web/dist/stats.html" "$OUT_DIR/bundle-baseline.html"
echo "==> Copied web/dist/stats.html → $OUT_DIR/bundle-baseline.html"
echo "==> Done. Open $OUT_DIR/bundle-baseline.html in a browser to inspect."
