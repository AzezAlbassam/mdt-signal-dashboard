# Study 4 — a wide search for high-accuracy swing strategies, with a held-out confirmation

**Written 2026-10-07, before any study 4 strategy has been computed.** Studies 1–2 used 33
indicators and one fixed exit per track. The user asked for (a) many more indicators, (b)
strategies closer to how traders use them, and (c) a win rate of at least 60%. A wide
search finds things by luck, so this study separates **search** from **judgement** by
stock: the search never sees the confirmation stocks.

> **بالعربي:** نبحث في ~900 استراتيجية على نصف الأسهم فقط، ونختار ما يحقق ربح 60%+ ويتفوق
> على العشوائي ويثبت قبل 2018 وبعدها. ثم نختبر المختار على النصف الآخر (لم نره أبداً) +
> الكريبتو + السعودي. فقط ما ينجح هناك يُعتبر نتيجة.

---

## 1. Samples (fixed now)

- **Search set:** study 2 stage-1 US symbols (`data/us/universe.json`) whose position in the
  alphabetically sorted symbol list is **even** (0, 2, 4, …).
- **Confirmation set:** the **odd** positions, plus study 1's non-US symbols (BITSTAMP BTC,
  ETH, LTC, XRP; TADAWUL TASI, 1120, 2010, 7010, 1180, 2222).
- The confirmation set is not loaded by the search code (`scripts/study4-search.js`). It is
  loaded only by `scripts/study4-confirm.js`, which reads the frozen shortlist file.

## 2. Strategy space

**Entries** — every study 1 entry event (33) plus these TradingView built-ins and widely used
open-source community scripts, default inputs, each as one entry event:

| id | indicator | buy event |
|---|---|---|
| tsi | True Strength Index 25/13/13 | TSI crosses above its signal |
| kst | Know Sure Thing (default) | KST crosses above its signal |
| dpo | Detrended Price Osc 21 | crosses above 0 |
| coppock | Coppock 10/14/11 | turns up while below 0 |
| fisher | Fisher Transform 9 | crosses above its trigger while < 0 |
| smi | Stochastic Momentum Index 10/3/3 | crosses above signal while < −40 |
| smio | SMI Ergodic 5/20/5 | crosses above its signal |
| rvgi | Relative Vigor Index 10 | crosses above its signal |
| rvi_vol | Relative Volatility Index 10 | crosses above 50 |
| cmo | Chande Momentum 9 | crosses above −50 |
| stc | Schaff Trend Cycle 10/23/50 | crosses above 25 |
| ac | Accelerator Osc (AO − SMA5 AO) | crosses above 0 |
| bbp | Bull Bear Power 13 | crosses above 0 |
| efi | Elder Force Index 13 | crosses above 0 |
| eom | Ease of Movement 14 | crosses above 0 |
| chosc | Chaikin Oscillator 3/10 | crosses above 0 |
| klinger | Klinger Oscillator 34/55/13 | crosses above its signal |
| adl | Accumulation/Distribution | crosses above its SMA 20 |
| pvt | Price Volume Trend | crosses above its SMA 20 |
| bop | Balance of Power (SMA 14) | crosses above 0 |
| macdh | MACD histogram | turns up while below 0 |
| ema_9_21 | EMA 9/21 | EMA9 crosses above EMA21 |
| tk_cross | Ichimoku Tenkan/Kijun | Tenkan crosses above Kijun |
| alligator | Williams Alligator 13/8/5 | lips > teeth > jaw begins |
| mcginley | McGinley Dynamic 14 | close crosses above it |
| alma | ALMA 9/0.85/6 | close crosses above it |
| lsma | Least Squares MA 25 | close crosses above it |
| kama | Kaufman Adaptive MA 10/2/30 | close crosses above it |
| envelope | Envelope 20, 10% | close crosses back above lower band |
| heikin | Heikin Ashi | first up candle after ≥ 2 down candles |
| impulse | Elder Impulse (EMA13 + MACD hist) | first bar both rising |
| squeeze | Squeeze Momentum (LazyBear) | squeeze ends with momentum > 0 and rising |
| wavetrend | WaveTrend (LazyBear 10/21) | WT1 crosses above WT2 while < −53 |
| ut_bot | UT Bot (key 1, ATR 10) | flips to buy |
| ssl | SSL Channel 10 | up line crosses above down line |
| chandelier | Chandelier Exit 22/3 | flips to long |
| qqe | QQE (RSI 14, SF 5, 4.238) | RSI-MA crosses above its trailing line |
| crsi | Connors RSI 3/2/100 | crosses above 10 |
| vixfix | Williams Vix Fix 22/20/2 (CM) | first bar at/above its upper band |
| ibs | Internal Bar Strength | IBS < 0.2 (first bar) |
| pullback5 | 5-bar low close | close is the lowest of 5 bars (first bar) |
| down3 | three lower closes | third consecutive lower close |
| double7 | Connors double-7 | close is the lowest of 7 bars (first bar) |

**Exits** (generic, so the random-entry baseline is exact):

| id | exit |
|---|---|
| E1 | study 1 exits: stop 2×ATR14, target 3×ATR14 (weekly 4×), time 10 bars (weekly 13) |
| E2 | mean-reversion exit: first close above SMA 5; disaster stop 3×ATR14; time 10 bars (weekly 13) |
| E3 | trend exit: Chandelier trailing stop (highest high since entry − 3×ATR22); time 40 bars (weekly 26) |

**Trend filter:** F0 none; F1 entry only when close > SMA 200 (weekly SMA 40).

**Timeframes:** daily and weekly. Total: 76 entries × 3 exits × 2 filters × 2 timeframes =
**912 strategies**. Execution as studies 1–2: next-open entry, 0.10% per side, stop first
on ambiguous bars, gaps fill at the open, one trade at a time.

## 3. Search (search set only)

For each strategy: trades, **win rate**, mean R, and **edge** over random entries with the
same exit and filter (random bars drawn from the bars that pass the filter). Permutation
test, 2,000 draws.

**Shortlisted** if all hold, on the search set:
1. win rate ≥ 60% overall, and ≥ 55% in each of Period I and Period II;
2. edge > 0 in both periods;
3. permutation p < 0.001 overall (~1 false pass expected among 912);
4. ≥ 300 trades.

Up to **10** shortlisted strategies go forward, highest edge first. The shortlist is
written to `reports/study4-shortlist.json` and committed **before** the confirmation code
runs.

## 4. Confirmation (confirmation set only)

Each shortlisted strategy, unchanged, on the confirmation set:

- **Confirmed** = win rate ≥ 60% **and** edge > 0 with one-sided permutation p < 0.05 after
  Holm correction across the shortlist.
- Reported also: per period, per group (US / crypto / Saudi), and current signals.

If nothing is shortlisted, or nothing confirms, that is the result.

## 5. Also reported (descriptive, no claims)

The 20 highest-win-rate strategies on the search set regardless of edge — because a high
win rate with negative edge (small wins, large losses) is the trap this study exists to
expose.
