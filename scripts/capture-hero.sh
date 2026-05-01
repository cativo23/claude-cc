#!/usr/bin/env bash
# Capture hero PNGs at 2x device pixel ratio (retina). Captures generously,
# then auto-crops uniform background borders so the image fits content with
# a constant breathing margin.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/showcase"
PORT=8765

# capture-w capture-h crop-margin-px (final pad after trim, in 2x DPR pixels)
declare -A sizes=(
  [hero-5-2]="1280 600 48"
  [hero-16-9]="1280 800 96"
)

for page in "${!sizes[@]}"; do
  read -r w h pad <<< "${sizes[$page]}"
  png="$OUT/${page}.png"
  google-chrome-stable \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --no-sandbox \
    --force-device-scale-factor=2 \
    --window-size="$w,$h" \
    --screenshot="$png" \
    "http://localhost:$PORT/${page}.html" 2>/dev/null
  if [ ! -f "$png" ]; then
    echo "FAILED: $page" >&2
    exit 1
  fi
  # Auto-trim uniform bg borders, then re-add a fixed margin.
  # -fuzz 1% absorbs JPEG-style edge artefacts (we're PNG but font antialias).
  convert "$png" -bordercolor '#1a1b26' -border 1 \
    -fuzz 1% -trim +repage \
    -bordercolor '#1a1b26' -border "${pad}x${pad}" \
    "$png"
  size=$(stat -c%s "$png")
  dim=$(identify -format '%wx%h' "$png")
  echo "wrote $png  $dim  ($size bytes)"
done
