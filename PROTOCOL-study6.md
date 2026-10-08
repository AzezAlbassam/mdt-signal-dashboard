# Study 6 — open look-alikes of the TBO and TBT Divergence ideas

**Written 2026-10-08, before any study 6 signal has been computed and before the crypto
data below has been fetched.** The user follows the YouTube channel @MooninPapa and asked
for its two indicators — "TBO" and "TBT Divergence" — rebuilt exactly, then backtested.

> **بالعربي:** المؤشران الأصليان مغلقان ومدفوعان، فلا يمكن نسخهما «مية بالمية». هذه
> الدراسة تبني مؤشرين مفتوحين بأسماء مختلفة من الوصف المنشور فقط، وتثبّت كل إعداداتهما
> هنا قبل أي نتيجة، ثم تختبرهما على الكريبتو والأسهم الأمريكية مقارنةً بدخول عشوائي.
> لا ضبط للإعدادات بعد رؤية النتائج.

---

## 0. What can and cannot be done

- **TBO (Trending Break Out)** is an invite-only TradingView script credited to Drungle_OG
  and MooninPapa, sold by The Better Traders. **TBT Divergence** is a tool in The Better
  Traders' paid membership ("TBT" = The Better Traders). Both are closed source; no formula
  for either is published anywhere found on 2026-10-08.
- This environment cannot reach youtube.com, tradingview.com or thebettertraders.com, and
  the user has no subscription, so there is nothing to compare an output against.
- Therefore **this study does not claim to reproduce TBO or TBT Divergence.** It builds two
  open indicators from the public description, with different names, and tests those.
  Whether the real TBO works is a question this study cannot answer.

### What is public (from search snippets of the vendor's pages and of Kitco columns by
### The Better Traders' co-founder)

| Public description | My design choice (not the vendor's formula) |
|---|---|
| Four trend lines: Fast, Mid Fast, Mid Slow, Slow (Standard has Fast only) | EMA 20 / 50 / 100 / 200 of close |
| A cloud; price above = bullish, inside = consolidation, below = bearish | cloud between EMA 50 and EMA 100 |
| Open Long / Close Long / Open Short / Close Short signals | Fast crosses above / below Mid Fast |
| Cross Up / Cross Down | Fast crosses above / below Slow |
| Breakout / Breakdown; white "breakout clusters" | close above the prior 20-bar high and above all four lines; cluster = 3 of the last 5 bars |
| Support/resistance lines | pivot levels, drawn in Pine only, not tested |
| Divergence labels: price momentum vs strength indicators; several together form a "cluster flag"; read with RSI and OBV | regular divergence on 4 oscillators (RSI, MACD, OBV, MFI); a signal needs 2 of 4 |
| Columns describe "a divergence, then TBO breakouts" as a sequence | the first breakout within 20 bars after a divergence signal |

The names used here are **FLT** (Four-Line Trend) and **MOD** (Multi-Oscillator
Divergence), so no one mistakes them for the paid products.

## 1. Indicators (fixed now; never tuned)

All on daily bars, computed from bars 0..i only (no look-ahead), using the repo's Pine-
matching functions in `engine/indicators.js` (EMA seeded with SMA, Wilder RSI).

**FLT**
- Fast = EMA(close, 20); MidFast = EMA(close, 50); MidSlow = EMA(close, 100); Slow = EMA(close, 200).
- *Open Long* at bar i: Fast[i] > MidFast[i] and Fast[i−1] ≤ MidFast[i−1].
- *Close Long* at bar i: Fast[i] < MidFast[i] and Fast[i−1] ≥ MidFast[i−1].
- *Cross Up* at bar i: Fast[i] > Slow[i] and Fast[i−1] ≤ Slow[i−1].
- *Breakout bar* i: close[i] > max(high[i−20..i−1]) and close[i] > max(Fast, MidFast, MidSlow, Slow)[i].
- *Breakout cluster* at bar i: at least 3 breakout bars among i−4..i, and no cluster event
  in bars i−20..i−1.

**MOD**
- Pivot low at bar p: low[p] < low[p±k] for k = 1..5. It is known only at bar p+5.
- When a pivot low p2 is confirmed (at bar p2+5), compare it with the most recent earlier
  pivot low p1, if p2 − p1 ≤ 60. Regular bullish divergence on oscillator O:
  low[p2] < low[p1] and O[p2] > O[p1].
- Oscillators: RSI(close, 14); MACD line = EMA(close,12) − EMA(close,26); OBV; MFI(14).
- *MOD bullish signal* at bar p2+5 when at least 2 of the 4 oscillators diverge.
- Bearish and hidden divergences are drawn in Pine only, not tested.

## 2. What is tested (long only)

**Entries (5):**

| id | entry signal at bar i |
|---|---|
| OL | FLT Open Long |
| CU | FLT Cross Up |
| BC | FLT Breakout cluster |
| MOD | MOD bullish signal |
| DB | the first FLT breakout bar within 20 bars after a MOD bullish signal (one per MOD signal) |

**Exits (2):**

| id | exit |
|---|---|
| X | the indicator's own exit: sell at the next open after the first FLT Close Long after bar i; at most 250 bars (then sell at that bar's close) |
| H20 | sell at the close of bar i+20 |

Entry at the next bar's open; 0.10% per side; one trade at a time per symbol and strategy;
a trade whose exit is past the data is dropped. Warm-up: no signal before bar 250.
Shorts are not tested (the repo's studies are long-only, and short crypto carries funding
costs the data does not have).

5 entries × 2 exits × 2 groups = **20 tests.**

## 3. Samples

- **Crypto (primary — the channel's market):** BTC, ETH, LTC, XRP from the stored Bitstamp
  series (`data/swing/`, longer history); BNB, SOL, DOGE, ADA, TRX, LINK, AVAX, XLM, BCH,
  DOT, HBAR, UNI, ETC, ATOM, NEAR, FIL, AAVE, ALGO, VET, ICP as `BINANCE:<COIN>USDT` daily,
  fetched with the TradingView connector after this file is committed. Bars dated
  2026-10-08 or later are dropped (still forming). A symbol the connector cannot return
  with at least 500 bars is dropped and listed. Periods: I before 2022-01-01, II after
  (by signal date).
- **US:** all 311 symbols in `data/us/universe.json`, daily, to 2026-10-06. Periods: I
  before 2018-01-01, II after.

There is no search/confirm split because nothing is searched: every parameter above is
fixed before any computation, and all data is used once.

## 4. Metrics and verdict

Returns in percent. For each test: trades, win rate (net return > 0), mean and median
return, average bars held, and **edge** = mean return − mean return of random entries with
the same exit on the same symbols and periods (every eligible bar, weighted by trade count
per symbol and period; `pool` in `scripts/study5-common.js`). One-sided permutation p
(2,000 draws, seed 20261016) as in study 5. Holm correction across all 20 tests.

**Beats random entries** if: edge > 0, Holm p < 0.05, and edge > 0 in both periods.
Win rate alone is never the verdict. If nothing passes, that is the result, and the
indicator settings are not changed to make something pass; any later change is post-hoc
and labelled so.

Reported only: each test's numbers per period; BTC alone; random entries' win rate.

## 5. Matching the Pine to the backtest

The Pine script (`pine/flt-mod.pine`, one script so it fits a free TradingView plan) must
give the same signals as the JS engine. It cannot be run from this environment, so
`scripts/study6-verify.js` compares the JS signals with a CSV exported from TradingView
(chart data export with the script on the chart). Agreement is reported as counted, never
assumed.

## 6. Known biases, stated now

- Every coin and stock here is large **today**. That flatters any long entry. Random entries
  carry the same bias, which is why the edge over random entries is the measure.
- Crypto history is short (most Binance pairs start 2017–2021) and dominated by a few
  bull runs; period II is the check on that.
- The vendor's real indicators may differ completely from FLT and MOD. A result here says
  nothing about them.
