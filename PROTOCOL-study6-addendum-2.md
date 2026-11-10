# Study 6 — addendum 2: weekly divergence, held about 3 months

**Written 2026-10-08, before any weekly MOD signal has been computed.** The user wants a
swing trade from the end of October 2026 into early 2027 — at most about 3 months — in
stocks that are not breaking support, and asked whether divergences on higher timeframes
work over that horizon. Addendum 1 already showed that the DAILY MOD signal held 3 months
does not beat random entries on US stocks (`reports/study6-long.txt`, MOD M3: edge −0.01%).
The weekly timeframe has not been tested.

> **بالعربي:** دايفرجنس MOD على الشارت الأسبوعي، العادي (قاع أدنى) والمخفي (قاع أعلى
> مع مؤشرات أضعف — سهم ما كسر دعمه)، مع وبدون شرط الاتجاه، احتفاظ شهرين أو 3 أشهر.
> 8 اختبارات فقط، مكتوبة قبل الحساب.

## 1. Signals (weekly bars, `toWeekly` from `engine/swing.js`, US weeks start Monday)

MOD exactly as in `PROTOCOL-study6.md` §1 (pivot lows 5 bars each side, known 5 bars
later; previous pivot within 60 bars; RSI 14, MACD line, OBV, MFI 14), applied to weekly
bars:

| id | signal at the confirmation week |
|---|---|
| MODW | regular bullish: low[p2] < low[p1] and at least 2 of 4 oscillators higher at p2 |
| HIDW | hidden bullish: low[p2] > low[p1] and at least 2 of 4 oscillators lower at p2 (the Pine script's hidden divergence) |

**Filters:** F0 none; F1 weekly close > SMA 40 at the signal week ("support not broken").

**Exits:** H8 = sell at the close of the 8th week after the signal week; H13 = 13th week
(≈ 3 months). Entry at the next week's open, 0.10% per side, one trade at a time per
symbol and strategy, warm-up 80 weeks (as study 5).

2 signals × 2 filters × 2 exits = **8 tests.**

## 2. Sample and verdict

All 311 symbols of `data/us/universe.json`, weekly bars to the week before 2026-10-06.
Periods I before 2018-01-01, II after. Edge = mean return − mean return of random entries
with the same exit and filter on the same symbols and periods (`pool`,
`scripts/study5-common.js`). Permutation test, 4,000 draws, seed 20261018; Holm across
the 8 tests. **Beats random** = edge > 0, Holm p < 0.05, edge > 0 in both periods.
Win rate is reported, never the verdict.

## 3. After the verdict

Whatever the result, list the stocks whose weekly MOD/HIDW signal fired in the last
completed weeks, marked with whether the rule they come from passed. If nothing passes,
say so and give no stock list as a recommendation.

## 4. Known bias

Large US companies today (survivorship) flatter any long entry; random entries carry the
same bias. Weekly pivots are confirmed 5 weeks after the low, so the signal comes late by
design.
