# The decade study

`scripts/study.mjs` rebuilds the daily expected-move band for every SPY session
from 2016-01-04 to 2026-09-14 and measures what actually happened next. The
fixture is `tests/fixtures/market-long.json`: 2,689 sessions of open, high, low,
close and the VIX close, which gives 2,688 bands. The engine is `lib/study.js`,
the arithmetic is pinned by `tests/study*.test.js` and `tests/enhancements.test.js`,
and the output is `data/em/study-spy.json`.

Every figure below was reproduced twice, by two subagents writing their own
Python from the definitions alone, without reading `lib/study.js`, `scripts/study.mjs`
or the stored result. Both matched to the printed digit. The only differences
found were rounding conventions: Python rounds half to even and JavaScript rounds
half up, which moves the strike by a dollar on the eleven entry closes that sit
exactly on a half cent.

## Is the band honest?

Band for session *t*: centre is the close of *t−1*, half width is
`centre × 0.92 × vix[t−1]/100 × √(1/365)`.

| Measured over 2,688 bands | Band | Theory for a true one sigma |
| --- | --- | --- |
| Range stayed entirely inside | 48.8% | ~43% (78-step simulation) |
| Upper side reached intraday | 26.9% | 31.7% |
| Lower side reached intraday | 25.6% | 31.7% |
| Closed above the upper side | 16.4% | 15.87% |
| Closed below the lower side | 12.7% | 15.87% |
| Mean absolute z of the close | 0.770 | 0.7979 |
| Mean z of the close | +0.059 | 0 (plus drift) |

Close breaks straddle theory while intraday reaches fall short of it and
containment beats it. That is the signature of mean-reverting intraday paths,
not of a mis-sized band: real sessions wander less within the day and settle
further from the centre than a random walk does.

Mean absolute z scales as `1/k`, so the multiplier that calibrates the close
distribution exactly is `0.92 × 0.770 / 0.7979 = 0.888`. The charts use 0.92,
which is about four per cent wide. That is a rounding, not an error.

## The setups a trader takes off the levels

Each is k of n with a Wilson 95 per cent interval, next to the base rate the same
rule earns on a random path.

| Setup | Measured | n | 95% interval | Base rate |
| --- | --- | --- | --- | --- |
| Lower tagged, closes back inside | 50.4% | 688 | 46.7 – 54.2 | 50% |
| Upper tagged, closes back inside | 39.0% | 724 | 35.5 – 42.6 | 50% |
| Lower tagged, next session closes higher | 56.8% | 687 | 53.0 – 60.4 | 55.0% |
| Upper tagged, next session closes lower | 47.5% | 724 | 43.9 – 51.2 | 44.8% |
| Close break, weekly band reached later that week | 44.4% | 781 | 41.0 – 47.9 | — |

Fading a tag for the same session's close is a coin flip, and it has to be: by
the reflection principle, the chance a level that was touched is closed back
inside is exactly one half. The decade lands on it. The upper side is worse than
a coin flip because the index drifts up.

The next-session numbers are the same story. A lower tag is followed by an up
close 56.8 per cent of the time, against an unconditional 55.0 per cent. The
gap is inside its own confidence interval.

The 70 per cent that showed up on the first 96-session sample is not in the
decade. It was twenty observations.

## Enhancements tested

Seven candidates, measured over the same 2,688 bands and then attacked by an
independent review that recomputed each one from the raw fixture. The review
overturned three of the four verdicts the first pass reached, in both
directions, and the table below is what survived it.

| Candidate | Verdict | The deciding number |
| --- | --- | --- |
| Volatility-regime multiplier | adopt | refitted on a rolling 500-session window with no look-ahead, the weighted calibration error falls from 0.077 to 0.011 |
| Calibrated multiplier 0.888 instead of 0.92 | adopt, third order | mean absolute z is 0.770 with a 95 per cent interval of 0.745 to 0.796, which excludes the 0.798 a true one sigma gives |
| Outer two-sigma band as a target | reject | it is reached 57.5 per cent of the time and a random walk of the same width reaches it 58 per cent of the time |
| Flag a band the session opened beyond | keep as a fill note, not an edge | 22 per cent of lower tags and 14 per cent of upper tags were gaps, but filtering trades on it improves nothing |
| Skewed band | reject | walk-forward it makes the per-side breach error worse, 5.7 points against 3.4 |
| Blend implied with realised volatility | reject | the best weight is worth 0.7 per cent of calibration error |
| Anchor the band on today's open | reject | the overnight gap is 41 per cent of daily variance and the open sits inside the day's range by construction |

### The one that works

A single multiplier near 0.92 is not wrong on average. It is wrong in a
pattern. Sorted into VIX terciles, the fixed band realises a mean absolute z
of 0.643 in the calmest third and 0.902 in the most stressed, against 0.798
for a true one sigma. It is about a quarter too wide when nothing is
happening and a tenth too narrow when everything is.

The first pass tested this and rejected it, on a split fitted before 2022 and
another before 2020, because the pooled mean absolute z over the test span did
not improve. That test was worthless. A pooled average is satisfied by any
pair of errors that cancel, and a band too wide in calm markets and too narrow
in stressed ones cancels perfectly. Scored inside each regime instead, and
refitted on a rolling window so no session is ever priced by its own future:

| Rolling window | Fixed 0.92 | Regime | 
| --- | --- | --- |
| 250 sessions | 0.092 | 0.014 |
| 500 sessions | 0.077 | 0.011 |
| 1,000 sessions | 0.079 | 0.036 |

Weighted calibration error, lower is better. The regime version wins on every
window. The pooled score, the one the first pass used, actually prefers the
fixed multiplier at the two longer windows, which is exactly why it was the
wrong scorecard.

`REGIME_FIT` in `lib/implied-move.js` publishes the latest 500-session fit:
cuts at VIX 16.35 and 18.67, multipliers 0.729, 0.812 and 0.980. Both Pine
scripts carry it as a switch that is **off by default**, because the published
charts plot a constant and reproducing them is what this repository is for.

### The one that was wrong

The outer two-sigma band looked like the best result of the first pass: after
a close through the inner band, two sigma was reached that session or the next
57.5 per cent of the time, on 783 events. It is not a result at all.

Two things kill it. Of the 450 reaches, 243 had already happened *before* the
close that defined the setup, so they were never tradeable; of the 540 breaks
that had not already reached two sigma, only 38.3 per cent reached it next
session. And the headline rate has no edge over chance: a driftless random
walk whose band is the width this one actually is reaches two sigma, given a
close beyond one sigma, 58.0 per cent of the time. Measured 57.5, base rate
58.0. Conditioning on the break adds nothing.

The line is still drawn, as an option that is off by default, because a level
reached more often than not is a reasonable place to rest an order. It is
labelled as geometry, not as a signal.

## Which days to expiry

The question was: buy a call when the lower band is tagged, at zero, one, two
or five days to expiry. Every premium here is Black-Scholes on the real path.
No bid or ask was ever touched, because this repository holds no option price
history. Costs are a penny and a half of half-spread plus 65 cents a contract
each way, charged on the way out only when the leg is worth closing.

| Structure | Win | Mean per trade | n | Distinguishable from zero |
| --- | --- | --- | --- | --- |
| 0DTE, entered at the band, closed at the bell | 38.9% | +35.1% | 535 | yes, t = 3.8 |
| 1DTE, entered at the close, held one session | 36.8% | +5.7% | 687 | no, p = 0.28 |
| 2DTE, same | 39.6% | +1.4% | 687 | no, p = 0.65 |
| 5DTE, same | 42.9% | +0.1% | 687 | no, p = 0.74 |
| 0DTE put at the upper band | 23.0% | −14.3% | 623 | loses |

The answer is none of them, and the reasons matter more than the table.

**The ladder was never measured.** The same-session leg is entered intraday,
so the only volatility known is the previous VIX close. The held legs are
entered at the close, when that session's VIX close is known. Those are
different inputs, and repricing every rung on the anchor moves them to +14.0,
+9.6 and +8.1 per cent. A five-session leg that reads flat on one convention
and clearly positive on another has not been measured at all. Both runs are in
`data/em/study-spy.json` under `options.ladder`.

**The one significant result is not about direction.** The same-session leg
breaks even at an entry volatility of 1.26 times VIX. Sessions that reach a
one-sigma band are, by selection, the volatile ones: their mean range is 1.50
times an average session's and 2.25 times a session that touched nothing. The
study's own pricer values a whole-session at-the-money straddle on those days
at 0.39 per cent of spot while they actually move 0.89 per cent open to close,
which is not a price anyone would quote. At 1.26 times VIX the trade is flat;
at 1.46 it loses 15 per cent.

**The mirror settles it.** Buying a put at the upper band loses at every
expiry. The two legs break even at 1.26 and 0.82 times VIX, and the constant
the study chose, 0.92, happens to fall between them. That, and nothing else,
is why one side looks like a trade and the other does not. Measured directly,
the underlying's move from the fill to the close is −0.015 per cent on the
call leg: the zero that optional stopping demands of a touched level.

**And it is a handful of trades.** The median same-session trade loses 80 per
cent, 47.5 per cent are total losses, and the best 25 of 535 are 85 per cent
of the mean. Strip them and the mean is +6 per cent, inside the cost and
volatility uncertainty.

What would settle it in ten minutes: record a real 0DTE bid and ask at the
moment the lower band is touched on the next five occasions, and back the
implied volatility out as a multiple of the previous VIX close. At or above
1.24, the trade is dead. Every indirect measurement says the real multiple is
1.4 to 1.5.

## What the study does not cover

**Option prices are modelled, not historical.** There is no archive of SPY option
quotes in this repository, so every option figure in the study is Black-Scholes
priced on the real path with the volatility set to a multiple of the prior VIX
close. That makes the entry volatility an assumption rather than a measurement,
and the whole options conclusion turns on it. The sensitivity ladder in
`data/em/study-spy.json` exists for exactly that reason.

**The index, not the fund.** Everything is measured on SPY. An SPX trade is the
same band arithmetic on a ticket about ten times the size. In the chains captured
here the index strikes sit five points apart on a 7,655 index, which is 0.065 per
cent, and the fund's sit a dollar apart on a 765 fund, which is 0.13 per cent, so
relative to price the index grid is the finer of the two. What differs is size:
one contract is a much larger commitment, and a structure sized as a lottery
ticket in the fund is not one in the index.

**One underlying, one decade.** 2,688 bands is a lot of sessions but one market
regime sequence. The out-of-sample splits test whether a fitted parameter
survives a different span; they cannot test whether the whole relationship
survives a market nobody has seen yet.
