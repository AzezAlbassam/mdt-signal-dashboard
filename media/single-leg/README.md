# The poster and the explainer video

Source for the two things the single-leg study is explained with. Both are
built from `lib/premium.js`, so the numbers on them cannot drift away from the
numbers in `docs/single-leg.md` without the build breaking.

```
./build.sh [outdir]      # default outdir is ./out
```

Needs Chromium (`CHROME=`) and ffmpeg (`FF=`) on the path. Nothing is committed
but the source: the PNG and the MP4 are build products.

| file | what it is |
|---|---|
| `cases.mjs` | pulls the four real months out of the simulation, as JSON |
| `poster.html` | the one-page summary, `__CASES__` filled in by the build |
| `slides.html` | the nine static panels of the video, in order |
| `anim.html` | one chart that walks forward a session at a time; `window.render(caseIndex, t)` with `t` from 0 to 1 |
| `frames.mjs` | drives `render` and screenshots every frame |
| `shot.mjs`, `slideshot.mjs` | Chromium screenshots for the poster and the panels |

The video has **no narration**: the generated voice-over ran out of credits, so
every word is on screen instead and the panels hold long enough to read. If
credits come back, the script is thirteen lines long and sits in the session
history rather than here, because a half-generated audio track is worse than
none.
