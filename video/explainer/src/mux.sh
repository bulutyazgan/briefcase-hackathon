#!/bin/sh
# Muxes the rendered video tracks with out/mix.wav into the deliverables, then writes the
# landing-page copies (mp4, VP9/Opus webm, poster from the close frame).
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/../out"
WEB="$HERE/../../../web/public/demo"
finished() { grep -q "^exit 0" "$OUT/render_$1.log" 2>/dev/null; }   # only mux finished renders
mux() { ffmpeg -y -loglevel error -i "$OUT/$1" -i "$OUT/mix.wav" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT/$2"; echo "muxed $2"; }
finished 16x9 && mux video_16x9.mp4 master_16x9.mp4
finished 9x16 && mux video_9x16.mp4 cut_9x16.mp4
finished 1x1 && mux video_1x1.mp4 cut_1x1.mp4
if [ "${1:-}" = "web" ]; then
  mkdir -p "$WEB"
  cp "$OUT/master_16x9.mp4" "$WEB/tally-demo.mp4"
  ffmpeg -y -loglevel error -i "$OUT/master_16x9.mp4" -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -cpu-used 4 -c:a libopus -b:a 96k "$WEB/tally-demo.webm"
  ffmpeg -y -loglevel error -ss 73.5 -i "$OUT/master_16x9.mp4" -frames:v 1 "$WEB/tally-demo-poster.png"
  echo "web copies written to $WEB"
fi
