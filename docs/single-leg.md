# Calls and puts, one at a time

Two questions, asked separately, because they have opposite answers.

1. **Can you buy a call or a put off the band and make money?** No. Searched 576
   ways, and the best of them is smaller than what the same search finds in
   noise.
2. **Can you sell one at the band?** Yes, and it is the same variance premium the
   condor study found, in a shape with two legs instead of four.

Everything below is SPY, 2016-01-04 to 2026-09-14, 2,689 sessions, priced off
the VIX close of the session the trade opened on, five cents a leg in costs.

---

## 1. Buying is dead, and the search is why you can be sure

Eight entry rules, two directions, four targets, three stops, three holding
limits. 576 combinations. Entry is the **open of the session after** the signal,
never the close that produced it, and a session that touches both the target
and the stop is scored as the **stop**, because a daily bar cannot say which
came first.

The arithmetic that bounds the whole exercise: on a path with no edge, a target
`T` and a stop `S` are reached first with probability `S/(T+S)` and `T/(T+S)`. A
90 per cent win rate forces a reward near one to nine. A three-to-one reward
forces a win rate near a quarter. **Wanting both high is wanting an edge over
that line**, so the only honest measurement is against it.

Three controls, each stricter than the last.

### The driftless walk

Every row is shown against a seeded simulation of the same target, stop and
time limit on a path with no edge. Leaders cleared it by up to 14 points of win
rate.

### Taking the trade anyway

The index rises, so a long call beats a driftless walk before any rule is
involved. `unconditionalBaseline` takes the identical trade on every session
with a cooldown. Against it the edges collapse:

| rule | dir | tgt/stop/hold | n | per yr | win | anyway | R:R | expR | vs anyway |
|---|---|---|---|---|---|---|---|---|---|
| twoClosesAboveBand | call | 3/1/21 | 36 | 3.4 | 44.4% | 32.5% | 3.00 | 0.78 | **0.51** |
| closeAboveOuter | put | 3/1/10 | 40 | 3.7 | 35.0% | 22.0% | 2.70 | 0.30 | **0.47** |
| closeBelowBand | call | 3/1/10 | 149 | 14.0 | 37.6% | 36.3% | 2.89 | 0.46 | **0.22** |

**292 of 576 combinations beat their own unconditional version.** That is 50.7
per cent — a coin flip. A set of rules carrying information does not split down
the middle.

### The placebo

576 tries is 576 chances to find noise, and the best of 576 noisy estimates is a
maximum, not an average. So: take the same number of trades, at the same
rarity, on **dates no rule chose**, and run the whole search again. Combinations
sharing a rule share their random dates, exactly as the real sweep reuses one
rule's dates across every target and stop.

```
Best edge actually found across 576 combinations:                0.51 R
Best edge the same search finds in noise, on average:            0.57 R
                                          19 times in 20 under:  0.85 R
                                        largest of 400 draws:    1.04 R
Share of null searches that did at least as well as the real one: 64.3%
```

**The real search underperformed the average noise search.** Each leader looks
respectable alone — `twoClosesAboveBand` at p = 3.2 per cent — and that is
precisely the trap: at a 5 per cent threshold, 576 tries produce about 29 false
positives by construction. Six leaders under 8 per cent is fewer than chance
hands you for free.

### And out of sample

The 20 best rules fitted before 2022, re-run on 2022 onward, measured against
the anyway control in **both** halves: **4 of 14** still beat it. Ranked on raw
expectancy, 13 of 20 stayed positive — every one of those 13 was the market's
drift wearing a rule's clothes.

**Verdict: do not buy a call or a put off this band.** The band forecasts the
*size* of a move and says nothing about its direction, which is what the
same-session study found when it measured the move from a band touch to the
close at −0.01 per cent.

---

## 2. Selling works, and it is two legs, not four

`shortSingle` sells one option at the band. `creditSpread` sells the same option
and buys a second of the same kind half a sigma further out, so the worst case
is a number you know on the day you open it.

Held to expiry, European cash settlement, averaged over every start offset.

| side | width | hold | n | win | on risk | worst phase | profitable phases | loses it all |
|---|---|---|---|---|---|---|---|---|
| **call** | **1.25σ** | **21** | **127** | **96.9%** | **+5.3%** | **+3.6%** | **21 of 21** | **0.4%** |
| call | 1σ | 21 | 127 | 91.5% | +6.4% | +3.7% | 21 of 21 | 1.2% |
| put | 0.75σ | 21 | 127 | 90.0% | +9.2% | +5.2% | 21 of 21 | 5.0% |
| put | 1σ | 21 | 127 | 93.3% | +5.2% | +2.6% | 21 of 21 | 3.1% |
| call | 1.5σ | 21 | 127 | 99.0% | +3.5% | +3.1% | 21 of 21 | 0.1% |

### The thing that cannot be wished away

| side | width | win | mean win | mean loss | R:R | break-even rate | edge |
|---|---|---|---|---|---|---|---|
| call | 1.25σ | 96.9% | +6.4% | −40.9% | **0.16** | 86.5% | **+10.4 pts** |
| call | 1σ | 91.5% | +10.8% | −43.4% | 0.25 | 80.1% | +11.4 pts |
| put | 0.75σ | 90.0% | +17.3% | −69.3% | 0.25 | 80.0% | +10.0 pts |
| put | 1σ | 93.3% | +10.2% | −70.5% | 0.14 | 87.4% | +5.9 pts |

A 96.9 per cent win rate comes with a reward-to-risk of **0.16**. One loss takes
back six wins. That is not a flaw in this trade; it is the same law as section
one, seen from the other side. **There is no structure anywhere in this study
with a high win rate and a high reward-to-risk at once.** The edge is the gap
between 96.9 and the 86.5 the payoff demands — ten points, and ten points is a
real, tradeable edge.

### What that is worth to an actual account

`+5.3% of the money at risk` is not an account return. At the 5 per cent sizing
rule the money at risk **is** 5 per cent of the account, so the account earns
about 0.27 per cent a month. Run over the decade at every start offset, with
enough capital that whole-contract rounding stops distorting it:

| risk per trade | CAGR worst / median / best | max drawdown median / worst |
|---|---|---|
| 5% | 1.9% / **2.9%** / 3.8% | 4.4% / 5.7% |
| 10% | 3.7% / **5.8%** / 7.8% | 8.9% / 11.4% |
| 20% | 7.1% / **11.8%** / 16.1% | 17.8% / 22.2% |
| 30% | 10.2% / **17.8%** / 25.1% | 26.7% / 32.6% |

Holding the index over the same decade returned **13.3 per cent a year with a
34.1 per cent drawdown**. So the trade is not a way to beat the index; at 20 per
cent risk a trade it roughly matches it with half the drawdown, and at the
prescribed 5 per cent it returns less than cash. **Pick the risk rule knowing
that, and not from the headline.**

### How often it really loses everything

0.4 per cent of trades, which is **one every twenty-two years of monthly
trading** — not once every two and a half years, which is the *put* spread's
figure (3.07 per cent) and was wrongly carried over here in an earlier draft.

Across all 21 start offsets the decade produced ten full losses, but they
cluster into **three market episodes**: December 2017, July 2022, October 2023.
Whether your own calendar catches one is luck: the median phase saw **none**,
the worst saw two.

### Year by year, every start date averaged

`call` spread, 1.25σ, monthly:

| 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|---|
| +5.4% | +4.2% | +2.7% | +5.3% | +6.9% | +6.8% | +5.9% | +2.9% | +5.6% | +6.3% | +3.8% |

Eleven years, eleven positive. The thin years are 2018 and 2023, both of which
had a month that lost the full maximum.

### Why the second leg is not optional

The naked single leg returns roughly nothing on the capital it ties up, and on
the worst month of the decade:

- Naked 1σ put, 2020-02-21 → 2020-03-23: **−92.70 index points, 72 times the
  credit it collected.** The requirement grew to 3.7× what the account was
  funded with and the broker called on **2020-02-21 — the day it was opened.**
- The same month, two legs: **−7.53 points**, which was 100 per cent of a
  maximum known in advance and twelve times smaller.

A backtest that settles every trade on the terminal close cannot see the first
of those. That is why `singleMarginPath` exists.

### Fill floor

The model collects about 11 per cent of the spread's width in credit. Below
**5.6 per cent** the call spread stops paying. If you cannot fill above the
floor, cancel and skip the month — there is no edge left to trade.

---

## The poster and the video

`media/single-leg/build.sh` rebuilds both from `lib/premium.js`, so the figures
on them cannot drift from the figures here. The video has no narration — the
generated voice-over ran out of credits, so every word is on screen and the
panels hold long enough to read.

## Reproducing

```
node --test 'tests/*.test.js'     # 208 tests
node scripts/signals.mjs          # the buying search and its placebo
node scripts/single-leg.mjs       # the selling study
node scripts/ten-thousand.mjs     # what a real account of a given size does
```
