# mdt-signal-dashboard

Static research pages, deployed from the repository root by GitHub Pages. No build
step and no runtime dependencies.

| Page | What it is |
| --- | --- |
| `index.html` | Index |
| `em.html` | SPY expected-move bands, rebuilt from the option chain |
| `spx.html`, `plan-a.html`, `plan-b.html` | Strategy studies on real 0DTE data |
| `tracker-a.html`, `tracker-b.html` | Trade trackers |

## The expected-move reconstruction

`em.html` reproduces the daily, weekly and month-to-date expected-move overlay
seen on a set of TrendSpider charts. It is an independent reconstruction from a
public option chain, not affiliated with or endorsed by TrendSpider or anyone
else.

### What the charts showed

Ten chart screenshots were read to the cent and each band's centre was checked
against end-of-day data. All 41 bands are symmetric about a real SPY close, and
every anchor matched exactly.

Five bands are plotted, in two families per horizon.

| Band | Centre | Horizon | Volatility |
| --- | --- | --- | --- |
| iVol daily | previous close | 1 session | thirty-day constant maturity |
| iVol weekly | previous Friday close | 4 or 5 sessions | thirty-day constant maturity |
| Plain daily | previous close | 1 session | that expiry's own |
| Plain weekly | previous Friday close | 5 sessions | that expiry's own |
| Month to date | previous month-end close | sessions in the month | that expiry's own |

The half width is always `close × volatility × √(sessions / 365)`.

### Why the two families are different inputs

Expressed as a share of the VIX close, the implied volatility each band demands:

| Band | Range | Spread |
| --- | --- | --- |
| iVol daily | 0.88 to 0.96 | 0.08 |
| iVol weekly | 0.80 to 0.90 | 0.10 |
| Plain daily | 0.59 to 1.04 | 0.44 |
| Plain weekly | 0.65 to 0.91 | 0.26 |

The plain daily sits near 0.59 of VIX on a quiet Monday, because a front expiry
is crushed over a weekend, and jumps to 0.97 into an inflation print. No constant
multiple of any volatility index produces that. It has to be the actual expiry
being priced. The iVol family, holding inside a tenth across every observation,
is a smooth volatility series.

The interval between the two lines on each side is the shaded zone on the charts,
and it is what the levels are used for.

### Roll behaviour

The daily centre rolls after that session's close, the weekly only on a Friday,
the monthly only at month end. The plain half widths freeze once set; the iVol
half widths keep moving. One capture shows this directly: between Friday evening
and the following Monday afternoon the centre and both plain widths were
unchanged, while the iVol daily went from 5.32 to 5.63 and the iVol weekly from
11.11 to 11.45.

The vendor's roll cannot be predicted from the clock. Across the ten captures it
had happened at 17:33 and 17:36 New York time but not at 17:39. This pipeline
therefore anchors on the closes it actually holds and never on a wall time.

### Two constants the screenshots cannot settle

1. **The weekly session count, 4 or 5.** Counting real sessions gives five in a
   normal week. The observations are also consistent with a fixed four. At a
   typical volatility the two differ by about $1.44 a side.
2. **What the plain line plots**, the straddle price or a one-standard-deviation
   move on the same volatility. They differ by `√(2/π) ≈ 0.7979`, a gap of 25 per
   cent that no quote noise can hide.

Both are single flags in `MODEL` in `lib/implied-move.js`. Every candidate is
computed and stored on every run, so the archive settles them with no refetch.
The first live chain compared against a chart from the same evening resolves the
second immediately.

## Layout

```
lib/calendar.js       NYSE sessions, holidays by rule, anchors, eastern time
lib/implied-move.js   half widths, bands, zones, horizon lengths
lib/cboe-chain.js     option chain parsing, at-the-money straddles
lib/bands.js          the five families from one chain and the closes held
lib/score.js          grading sessions against bands, Wilson intervals
lib/snapshot.js       assembling one evening's record
scripts/snapshot.mjs  the I/O shell around all of the above
```

The page imports the same modules the tests do, so it cannot drift from them.

## Running

```sh
npm test                              # 68 tests, no dependencies
node scripts/snapshot.mjs --fixture --dry-run   # the whole pipeline, offline
node scripts/snapshot.mjs             # live; needs the chain and price feeds
```

`.github/workflows/em-snapshot.yml` runs the snapshot twice each weekday so one
run always lands after the New York close in either half of the year. It runs the
test suite first, then commits the record to `data/em/`. A run that could not
fetch is still written as a row, because a history that skips the days the feed
was unhealthy is biased toward calm markets.

Scheduled workflows only run from the default branch, so nothing is collected
until this is merged.

## Honesty constraints on the page

Reproduction fidelity and calibration are separate measurements and are never
added together. The model was fitted on the same ten charts it reproduces, so
that figure is in-sample and is labelled as such. Rates are shown as Wilson
intervals and the point estimate is withheld below twenty observations. With no
history the page says zero sessions scored and prints no number. There is no
backtest framing and no profit or loss anywhere: these are levels, not trades.
