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

Six candidates, all measured over the same 2,688 bands.

| Candidate | Verdict | The deciding number |
| --- | --- | --- |
| Outer two-sigma band as a target | adopted | after a close through the inner band, two sigma is reached that session or the next 57.5% of the time, n=783 |
| Flag a band the session opened beyond | adopted | one lower tag in five was a gap; a level that never traded offers no fill |
| Volatility-regime multiplier | rejected | fits beautifully in sample, fails both out-of-sample splits |
| Skewed band | rejected | the asymmetry is drift, and drift is not volatility |
| Blend implied with realised volatility | rejected | pure implied calibrates best at every weight tried |
| Anchor the band on today's open | rejected | contains 65.0% with mean absolute z 0.603, far too wide once the gap has already happened |

The regime multiplier is the instructive failure. Cutting the decade into VIX
terciles and solving a multiplier per regime gives 0.742, 0.883 and 1.040, and
the in-sample calibration is near perfect. Refit on data before 2022 and tested
after it, the fixed 0.92 lands at mean absolute z 0.813 against theory's 0.798,
and the regime version at 0.828. Refit before 2020, fixed scores 0.795 and regime
0.718. The regime version is worse on both splits. Volatility regimes are
identified after the fact.

Both adopted enhancements are in `lib/implied-move.js` as `outerBand` and
`gapThrough`, in `lib/bands.js` behind `OUTER_SIGMA`, and in both Pine scripts
under the Enhancements group.
