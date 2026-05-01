#!/usr/bin/env bash
# Render the three Display-section HTML mockups to PNG via headless Chrome.
# Auto-trims uniform background and re-applies a fixed margin so each PNG
# is content-tight regardless of the chrome window size.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/showcase"
PORT=8765
PAD=32

# Fire up the local server in the background
python3 -m http.server "$PORT" --directory "$OUT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT
sleep 1

for name in mode-custom mode-minimal mode-powerline; do
  png="$OUT/${name}.png"
  google-chrome-stable \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --no-sandbox \
    --force-device-scale-factor=2 \
    --window-size=1400,400 \
    --screenshot="$png" \
    "http://localhost:$PORT/${name}.html" 2>/dev/null

  if [ ! -f "$png" ]; then
    echo "FAILED: $name" >&2
    exit 1
  fi

  convert "$png" -bordercolor '#1a1b26' -border 1 \
    -fuzz 1% -trim +repage \
    -bordercolor '#1a1b26' -border "${PAD}x${PAD}" \
    "$png" 2>/dev/null

  size=$(stat -c%s "$png")
  dim=$(identify -format '%wx%h' "$png")
  echo "wrote $png  $dim  ($size bytes)"
done
