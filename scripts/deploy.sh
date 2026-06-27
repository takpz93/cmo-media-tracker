#!/usr/bin/env bash
# GitHub Pages へデプロイ（data/schedule.json は preserve-schedule.js で保護）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${GITHUB_REPO:-takpz93/cmo-media-tracker}"
TMP="$(mktemp -d)"

echo "→ Preserving schedule.json..."
node "$ROOT/scripts/preserve-schedule.js" || true

echo "→ Packaging..."
rsync -a \
  --exclude '.git' \
  --exclude '.github' \
  "$ROOT/" "$TMP/"

cd "$TMP"
git init -b main
git add -A
git commit -m "${1:-Update cmo-media-tracker app}"

gh auth setup-git 2>/dev/null || true

if ! gh repo view "$REPO" &>/dev/null; then
  echo "→ Creating repo $REPO ..."
  gh repo create "$REPO" --public --description "自社メディア進捗トラッカー（note / Medium / Ronin Pop / 管理人）"
fi

git remote add origin "https://github.com/${REPO}.git" 2>/dev/null || \
  git remote set-url origin "https://github.com/${REPO}.git"

git push origin main --force

if ! gh api "repos/${REPO}/pages" &>/dev/null; then
  gh api "repos/${REPO}/pages" -X POST --input - <<EOF
{"build_type":"legacy","source":{"branch":"main","path":"/"}}
EOF
fi

echo ""
echo "→ Deployed: https://takpz93.github.io/cmo-media-tracker/"
