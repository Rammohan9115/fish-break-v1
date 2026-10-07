#!/usr/bin/env bash
# Tile a scene's frames into one image for quick review: preview.sh <frames-dir> <out.png> [cols] [thumb-width]
set -euo pipefail
FF="$(node -e "console.log(require('ffmpeg-static'))")"
DIR="$1"; OUT="$2"; COLS="${3:-4}"; W="${4:-640}"
N=$(ls "$DIR"/*.png | wc -l | tr -d ' ')
ROWS=$(( (N + COLS - 1) / COLS ))
"$FF" -y -loglevel error -pattern_type glob -i "$DIR/*.png" -vf "scale=$W:-1,tile=${COLS}x${ROWS}" -frames:v 1 "$OUT"
