#!/usr/bin/env bash
# Rebuilds the poster and the explainer video from the study data.
#
# The two templates that need data (poster.html, anim.html) carry a __CASES__
# placeholder. cases.mjs writes the four real months into it; everything after
# that is Chromium for the pixels and ffmpeg for the encode.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HERE/out}"
export SP="$OUT"
CHROME="${CHROME:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}"
FF="${FF:-ffmpeg}"
mkdir -p "$OUT/v3"

node "$HERE/cases.mjs" > "$OUT/v3/cases.json"
for f in poster anim; do
  node -e '
    const fs = require("fs")
    const [tpl, cases, out] = process.argv.slice(1)
    fs.writeFileSync(out, fs.readFileSync(tpl, "utf8").replace("__CASES__", fs.readFileSync(cases, "utf8")))
  ' "$HERE/$f.html" "$OUT/v3/cases.json" "$OUT/v3/$f.built.html"
done
cp "$HERE/slides.html" "$OUT/v3/slides.html"

node "$HERE/shot.mjs" "$OUT/v3/poster.built.html" "$OUT/calls-and-puts.png" 1900
node "$HERE/slideshot.mjs"
node "$HERE/frames.mjs"

cd "$OUT/v3"
mkdir -p clips
enc=(-c:v libx264 -pix_fmt yuv420p -r 30 -preset medium -crf 20)
for spec in 00:5 01:13 02:14 03:12 04:12 05:13 06:13 07:15 08:12; do
  i="${spec%%:*}"; secs="${spec##*:}"
  "$FF" -y -loglevel error -loop 1 -t "$secs" -i "slide$i.png" "${enc[@]}" "clips/s$i.mp4"
done
for c in 0 1 2 3; do
  "$FF" -y -loglevel error -framerate 20 -i "frames/c$c/%04d.png" "${enc[@]}" "clips/c$c.mp4"
done
printf "file 'clips/%s.mp4'\n" s00 s01 s02 s03 s04 s05 c0 c1 c2 c3 s06 s07 s08 > order.txt
"$FF" -y -loglevel error -f concat -safe 0 -i order.txt -c copy "$OUT/calls-and-puts.mp4"
echo "wrote $OUT/calls-and-puts.png and $OUT/calls-and-puts.mp4"
