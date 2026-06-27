#!/usr/bin/env bash
# 自社メディア進捗トラッカー — ローカルサーバー起動
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pick_port() {
  if [ -n "${PORT:-}" ]; then
    echo "$PORT"
    return
  fi
  for p in 8080 8081 8765 8766 8091 9000; do
    if ! lsof -nP -iTCP:"$p" -sTCP:LISTEN &>/dev/null; then
      echo "$p"
      return
    fi
  done
  echo 8766
}

PORT="$(pick_port)"
URL="http://localhost:${PORT}"

echo "→ CMO media-tracker"
echo "→ ${URL}"
echo "→ 停止: Ctrl+C"

if command -v open &>/dev/null; then
  (sleep 0.4 && open "$URL") &
fi

exec python3 -m http.server "$PORT"
