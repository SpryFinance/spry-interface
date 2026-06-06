#!/usr/bin/env bash
#
# Land the upstream Uniswap apps/web fork into this repo, on top of the Spry
# foundation packages.
#
# RUN THIS IN AN ENVIRONMENT WITH Node 22.22.2 + bun >= 1.3.11 (the upstream
# toolchain). It is NOT runnable in a Node 20 / no-bun environment.
#
# This is a starting scaffold, not a one-shot guarantee: review each step and
# expect to iterate. See docs/landing-the-fork.md for the full runbook,
# reconciliation checklist, and the optional package-minimization list.
#
# It modifies the working tree (brings in the upstream monorepo). It runs on a
# fresh branch and leaves everything staged-but-uncommitted for you to review.

set -euo pipefail

PIN="${SPRY_UPSTREAM_PIN:-web/5.148.6}"
UPSTREAM="${SPRY_UPSTREAM_URL:-https://github.com/Uniswap/interface}"
BRANCH="${SPRY_FORK_BRANCH:-fork/apps-web-${PIN//\//-}}"

# --- preflight -------------------------------------------------------------
[ -d packages/spry-fee ] || { echo "error: run from the spry-interface repo root"; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo "error: working tree not clean; commit/stash first"; exit 1; }
command -v bun >/dev/null || { echo "error: bun not found (need >= 1.3.11)"; exit 1; }
NODE_V="$(node -v)"
[ "$NODE_V" = "v22.22.2" ] || echo "warning: Node is $NODE_V; upstream requires exactly v22.22.2 (use: nvm use)"

TMP="$(mktemp -d)/uni"
trap 'rm -rf "$(dirname "$TMP")"' EXIT

echo "==> 1/6  branch: $BRANCH"
git switch -c "$BRANCH"

echo "==> 2/6  clone upstream $PIN (shallow)"
git clone --depth 1 --branch "$PIN" "$UPSTREAM" "$TMP"
echo "    pinned commit: $(git -C "$TMP" rev-parse HEAD)"

echo "==> 3/6  bring upstream tree in (keeping Spry additions; dropping out-of-scope apps)"
# Excludes: out-of-scope apps + labs (drop), and the files we keep as ours
# (README.md, the @spry/* packages, tools/contract-diff, and docs all survive
# because rsync merges without --delete and these paths do not exist upstream).
rsync -a \
  --exclude='.git' \
  --exclude='apps/mobile' \
  --exclude='apps/extension' \
  --exclude='labs' \
  --exclude='README.md' \
  "$TMP/" ./

echo "==> 4/6  drop the npm bootstrap (upstream is bun-based)"
# Upstream's root package.json + tsconfig.base.json have now overwritten the
# bootstrap copies. Remove the leftover npm/vitest bootstrap files.
rm -f package-lock.json vitest.config.ts

echo "==> 5/6  install (preinstall enforces the runtime versions; npm is blocked)"
# If a native postinstall (e.g. hashcash-native) fails, retry with
# 'bun install --ignore-scripts' then run step 6 manually.
bun install

echo "==> 6/6  prepare web (graphql codegen, etc.)"
bun web prepare

git add -A
cat <<EOF

Done. The fork is staged on branch '$BRANCH' (not committed).

Next:
  bun web dev                      # boot the dev server
  bun web typecheck && bun web test
  # then prune the removed surfaces per docs/apps-web-integration.md
  # and review docs/landing-the-fork.md for the reconciliation checklist

Review with:  git status   and   git diff --cached --stat | tail
EOF
