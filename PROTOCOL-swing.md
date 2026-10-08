# Swing-indicator study: pre-registered protocol

**Written 2026-10-06, before any indicator was computed on any price series.** The one
thing touched beforehand was the data path itself: BITSTAMP:BTCUSD daily and a 3-bar AAPL
probe were downloaded to confirm the connector's format and history depth (daily Bitcoin
from 2013-01-25, daily TASI from 2006-09-12). Nothing was calculated on them.

Nothing in this document changes after results exist. If a rule turns out to be badly
chosen, the results say so and a second, separately labelled run is reported next to the
first. The first run is not edited away. If a **bug** is found after results exist, it is
fixed, and the report marks the fix as post-hoc and shows the numbers before and after.

> **ملخص بالعربي:** هذه الوثيقة تحدد كل قواعد الاختبار قبل رؤية أي نتيجة: الأسهم والعملات،
> إعدادات كل مؤشر (الافتراضية في TradingView بدون أي تعديل)، متى ندخل ومتى نخرج، الوقف
> والهدف، فترة الاكتشاف وفترة التحقق، وما الذي يعتبر "مؤشر ناجح". التعديل بعد رؤية النتائج
> ممنوع. هذا الالتزام هو الذي يمنع الغش.

---

## 1. The question

Which standard TradingView indicators, at their **default settings**, give long-only entry
signals that do better than entering at a random time, for three holding styles:

| track | style | bars | holding |
|---|---|---|---|
| **A** | short swing | daily | up to 10 sessions (1–2 weeks) |
| **B** | medium swing | weekly | up to 13 weeks (2–3 months) |
| **C** | investment | weekly | in/out regime, judged over years (1–2 year holds) |

"Better" has one meaning per track, fixed in §6. "Accuracy" (win rate) is reported for
every indicator because it was asked for, but it **does not decide the ranking**: a rule
that wins 80% of the time for +0.3R and loses 20% of the time for −2R is a losing rule.

### What is not tested, and why

- **Community scripts.** The TradingView connector serves prices, ratings and screeners.
  It does not serve Pine community scripts or their signals, so "thousands of indicators"
  cannot be run through it. The set below is TradingView's built-in technical indicators —
  the building blocks most community scripts recombine.
- **Parameter tuning.** Every indicator uses TradingView's default inputs. No parameter is
  chosen by looking at results. This removes the largest source of fake backtest accuracy.
- **Shorting.** Long only. A "sell" is an exit.

---

## 2. Universe (fixed, 33 symbols)

Chosen now, before results, to mix winners and losers — not the stocks that happened to
do well.

| group | symbols |
|---|---|
| crypto (4) | BITSTAMP:BTCUSD, BITSTAMP:ETHUSD, BITSTAMP:LTCUSD, BITSTAMP:XRPUSD |
| US ETFs (3) | AMEX:SPY, NASDAQ:QQQ, AMEX:IWM |
| US stocks (20) | AAPL, MSFT, AMZN, GOOGL, NVDA, JPM, XOM, JNJ, PG, KO, WMT, INTC, BA, DIS, PFE, GE, C, T, IBM, F |
| Saudi (6) | TADAWUL:TASI, 1120 Al Rajhi, 2010 SABIC, 7010 STC, 1180 SNB, 2222 Aramco |

If a ticker is listed under a different exchange prefix than expected (e.g. a stock that
moved exchange), the connector's own symbol is used and recorded. A symbol that cannot be
fetched at all is dropped and listed as dropped. No symbol is added or removed for any
other reason.

**Survivorship bias.** These are stocks that exist today; delisted companies are absent.
This flatters buy-and-hold and every long rule equally. The primary metrics in A and B are
measured **against random entries on the same symbol and period**, which cancels most of
it. Track C is measured against buy-and-hold on the same symbol, which cancels it too.

---

## 3. Data

- Daily OHLCV from the TradingView connector, one page of up to 5,000 bars per symbol,
  ending at the last **completed** session on or before 2026-10-05. Prices are
  split-adjusted, **not** dividend-adjusted (connector limitation; affects all rules and
  buy-and-hold the same way, except that in Track C buy-and-hold loses the dividend yield
  only while a timing rule is out of the market — stated as a bias against nothing in
  particular and reported).
- Weekly bars are built from the daily bars (Monday-keyed weeks, `engine/resample.js`).
  The current, incomplete week is dropped.
- Raw files are committed under `data/swing/` so every number reproduces offline.

---

## 4. Periods

| period | signals dated | role |
|---|---|---|
| **I — discovery** | before 2018-01-01 | stability check and the "selection test" |
| **II — holdout** | 2018-01-01 → end of data | **the headline ranking** |

**Selection test.** The five best indicators of Period I, per track, are listed now as
"would have been picked", and their Period II result is reported. This measures what a
person who picked the backtest winner in 2018 actually got afterwards.

A trade belongs to the period of its **signal** date. Trades still open at the end of data
are dropped (they have no outcome yet).

---

## 5. Execution rules (identical for every indicator)

- Signal is computed on bar *t*'s close. Entry is at bar *t+1*'s **open**. Nothing uses a
  value that was not known at the close of *t*.
- **Cost:** 0.10% per side (0.20% round trip) on every trade and every regime switch.
- **Intrabar ambiguity:** if one bar's range contains both stop and target, the **stop** is
  taken. Daily bars do not record which came first, and guessing in the trade's favour on
  the most volatile bars is how backtests lie.
- **Gaps:** a bar that opens beyond the stop exits at the open (worse than the stop); a bar
  that opens beyond the target exits at the open.
- **One trade at a time** per (symbol, indicator): signals while a trade is open are ignored.
- **Warm-up:** daily series start counting after 252 bars, weekly after 80 bars, so every
  indicator below is fully defined at the first eligible bar.

### Track A — short swing (daily bars)

| stop | target | time exit |
|---|---|---|
| entry − 2 × ATR(14) | entry + 3 × ATR(14) | close of the 10th session (entry session = 1) |

### Track B — medium swing (weekly bars)

| stop | target | time exit |
|---|---|---|
| entry − 2 × ATR(14) | entry + 4 × ATR(14) | close of the 13th week |

ATR is measured at the signal bar. **R** = 1 × (stop distance). Every trade's result is
expressed in R, net of cost, so Bitcoin's volatility does not swamp a utility stock.

### Track C — investment (weekly bars)

Each indicator defines a **state** (in / out) at every weekly close. In = hold from the
next week's open; out = cash at 0%. Compared with buy-and-hold of the same symbol over the
same weeks.

---

## 6. What counts as better

### Tracks A and B

- **Primary metric: edge** = mean R of the indicator's trades − mean R of a trade entered
  on *every* eligible bar of the same symbol and period (the random-entry expectation),
  weighted by the indicator's trade count per symbol. Pooled across symbols, Period II.
- **Significance:** permutation test. 2,000 draws; each draw takes, per symbol, the same
  number of entries uniformly at random from that symbol's eligible bars, same exits.
  One-sided *p* = share of draws whose pooled mean R ≥ the indicator's.
  **Holm correction** across all indicators within the track.
- **Reported alongside:** trade count, **win rate (accuracy)** with 95% Wilson interval,
  the random entries' win rate, mean R with bootstrap 95% interval, profit factor, mean
  holding time, share of symbols where edge > 0, and the split by group (crypto / US /
  Saudi — descriptive only, no significance claimed).

### Track C

- **Primary metric:** median across symbols of **ΔSharpe** = Sharpe(rule) − Sharpe(buy &
  hold), weekly returns, annualised × √52, risk-free 0, Period II.
- **Significance:** circular-shift null. Each symbol's in/out sequence is rotated by a
  random offset (keeps exposure and number of switches, destroys timing); 1,000 draws;
  *p* = share of draws whose median ΔSharpe ≥ the rule's. Holm across Track C rules.
- **Reported alongside:** median ΔCAGR, median Δ max drawdown, share of symbols where the
  rule's Sharpe beats buy-and-hold, exposure (% of weeks in), switches per year, and the
  per-trade win rate and mean return.

### Verdict labels (assigned mechanically from the numbers)

| label | rule |
|---|---|
| **Robust** | Period II edge > 0, Holm *p* < 0.05, **and** Period I edge > 0 |
| **Possible** | Period II edge > 0 and raw *p* < 0.05, but not Robust |
| **No edge** | anything else with edge ≥ its random baseline's 5th percentile |
| **Worse than random** | Period II lower-tail *p* < 0.05 |
| **Thin** | fewer than 100 Period II trades (A/B) — reported, ranked last |

The ranking table is sorted by Period II edge (A, B) or median ΔSharpe (C), best first.

---

## 7. Indicators (TradingView defaults)

Weekly bars use the same settings, except the 50/200-day moving averages, which become the
conventional **10/40-week** pair (≈ 50/200 days), so the weekly warm-up stays at 80 bars.

| id | indicator | A/B entry event (on bar *t*) | C state "in" |
|---|---|---|---|
| `ma_cross` | SMA 50/200 (weekly 10/40) | fast crosses above slow | fast > slow |
| `ema_20_50` | EMA 20/50 | EMA20 crosses above EMA50 | EMA20 > EMA50 |
| `price_ma` | SMA 200 (weekly 40) | close crosses above it | close > it |
| `macd_signal` | MACD 12/26/9 | MACD crosses above signal | MACD > signal |
| `macd_zero` | MACD 12/26/9 | MACD crosses above 0 | MACD > 0 |
| `supertrend` | Supertrend 10, 3 | flips to uptrend | uptrend |
| `psar` | Parabolic SAR 0.02/0.02/0.2 | flips below price | below price |
| `ichimoku` | Ichimoku 9/26/52/26 | close crosses above cloud top | close > cloud top |
| `adx_di` | DMI/ADX 14, 14 | +DI crosses above −DI while ADX > 20 | +DI > −DI |
| `aroon` | Aroon 14 | Up crosses above Down | Up > Down |
| `hma` | Hull MA 9 | turns up | rising |
| `donchian20` | Donchian 20 | close > prior 20-bar high (first bar) | in on 20-bar high, out on close < prior 10-bar low |
| `donchian55` | Donchian 55 | close > prior 55-bar high (first bar) | in on 55-bar high, out on close < prior 20-bar low |
| `keltner_break` | Keltner EMA20, 2×ATR10 | close crosses above upper | — |
| `bb_break` | Bollinger 20, 2 | close crosses above upper | — |
| `tv_rating` | TradingView Technical Rating (reconstructed, §8) | "All" crosses above +0.5 (Strong Buy) | "All" > +0.1 (Buy or Strong Buy) |
| `rsi_30` | RSI 14 | crosses above 30 | — |
| `rsi_50` | RSI 14 | crosses above 50 | RSI > 50 |
| `rsi2` | RSI 2 + SMA 200 (weekly 40) | RSI2 < 10 with close > SMA (first bar) | — |
| `stoch` | Stochastic 14/3/3 | %K crosses above %D, both < 20 | — |
| `stochrsi` | Stoch RSI 3/3/14/14 | K crosses above D, both < 20 | — |
| `cci` | CCI 20 | crosses above −100 | — |
| `willr` | Williams %R 14 | crosses above −80 | — |
| `bb_revert` | Bollinger 20, 2 | close crosses back above lower band | — |
| `ao` | Awesome Oscillator 5/34 | crosses above 0 | — |
| `momentum` | Momentum 10 | crosses above 0 | — |
| `tsmom` | 12-month return (252 d / 52 w) | crosses above 0 | > 0 |
| `uo` | Ultimate Oscillator 7/14/28 | crosses above 30 | — |
| `trix` | TRIX 18 | crosses above 0 | — |
| `vortex` | Vortex 14 | VI+ crosses above VI− | VI+ > VI− |
| `obv` | OBV vs its SMA 20 | OBV crosses above its SMA | OBV > SMA |
| `mfi` | Money Flow Index 14 | crosses above 20 | — |
| `cmf` | Chaikin Money Flow 20 | crosses above 0 | CMF > 0 |

34 entry rules in A, the same 34 in B, 18 state rules in C. Oscillator mean-reversion
rules have no natural "in" state and are not forced into one.

Hypotheses: 34 + 34 + 18 = 86. Holm is applied within each track. With 86 tests, about
four would show raw *p* < 0.05 by luck alone — which is why "Possible" is not "Robust".

---

## 8. TradingView Technical Rating — reconstruction

TradingView's live rating (`get-technicals-rating`) only gives today's value, so its
history must be rebuilt. Implemented from TradingView's published description of the
Technical Ratings: 15 moving-average votes (SMA and EMA 10/20/30/50/100/200, VWMA 20,
Hull 9, Ichimoku) and 11 oscillator votes (RSI 14, Stoch 14/3/3, CCI 20, ADX 14, AO,
Momentum 10, MACD, Stoch RSI, Williams %R, Bull Bear Power 13, Ultimate Oscillator), each
+1 / 0 / −1; MA = mean of MA votes, Osc = mean of oscillator votes, All = (MA + Osc) / 2.

**Validation, fixed now:** after building it, today's reconstructed "All" value is
compared with the connector's live rating on all 33 symbols (daily). Agreement in
direction (sign, and the Buy/Neutral/Sell bucket) is reported as a count. A poor agreement
is reported as such; the rule is not re-fitted to match.

---

## 9. Implementation checks, written before the backtest

1. **No look-ahead:** every indicator's value at bar *t* is identical whether the series
   ends at *t* or continues — tested by truncation on real data.
2. Trade simulator: stop-first on ambiguous bars, gap fills, time exit, cost.
3. Known-value checks for SMA, EMA, RSI (Wilder), ATR (Wilder), MACD on hand-computed input.

---

## 10. Output

- `reports/swing-A.txt`, `swing-B.txt`, `swing-C.txt` — full tables, both periods.
- `swing.html` — the ranking in Arabic, best to worst, with each indicator's exact buy and
  sell rule, win rate, edge, and verdict.
- A "current signals" sheet: which Robust/Possible rules fire on the universe as of the
  last bar, with the entry, stop and target the rules define. **It is the output of a
  rule, not advice**, and its own forward record starts from that date.
