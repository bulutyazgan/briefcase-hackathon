#!/bin/sh
# Renders the 9:16 and 1:1 recompositions in parallel (two Chromium + ffmpeg pairs), then muxes.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/../out"
cd "$HERE"
node render.mjs --aspect 9x16 --out "$OUT/video_9x16.mp4" > "$OUT/render_9x16.log" 2>&1 &
P1=$!
node render.mjs --aspect 1x1 --out "$OUT/video_1x1.mp4" > "$OUT/render_1x1.log" 2>&1 &
P2=$!
wait $P1; E1=$?
wait $P2; E2=$?
echo "9x16 exit $E1, 1x1 exit $E2"
sh "$HERE/mux.sh"
echo "cuts done"
