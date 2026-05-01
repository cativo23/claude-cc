#!/usr/bin/env bash
# Render assets/showcase/themes-gallery.html → themes-gallery.png at 2x DPR.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/showcase"
PORT=8765

python3 -m http.server "$PORT" --directory "$OUT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT
sleep 1

png="$OUT/themes-gallery.png"
google-chrome-stable \
  --headless=new \
  --disable-gpu --hide-scrollbars --no-sandbox \
  --force-device-scale-factor=2 \
  --window-size=1700,1100 \
  --screenshot="$png" \
  "http://localhost:$PORT/themes-gallery.html" 2>/dev/null

convert "$png" -bordercolor '#1a1b26' -border 1 \
  -fuzz 1% -trim +repage \
  -bordercolor '#1a1b26' -border 32x32 \
  "$png" 2>/dev/null

dim=$(identify -format '%wx%h' "$png")
size=$(stat -c%s "$png")
echo "wrote $png  $dim  ($size bytes)"
