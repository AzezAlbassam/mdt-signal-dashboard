# Study 6 — addendum 3: monthly divergence, held 3 or 6 months

**Written 2026-10-14, before any monthly MOD signal has been computed.** The user showed
NYSE:SE on the monthly chart with a MOD bullish divergence (price lower low 2022→2024, RSI
higher low, then a rally) and asked for stocks with the same picture. Daily (addendum 1)
and weekly (addendum 2) divergence held about 3 months did not beat random entries; the
monthly timeframe has not been tested.

> **بالعربي:** نفس دايفرجنس MOD على الشارت الشهري، على أسهم قائمتك (631 سهماً)،
> احتفاظ 3 أو 6 أشهر، مقارنة بالدخول العشوائي. اختباران فقط، مكتوبان قبل الحساب.

## 1. Data

The 631 monthly OHLCV series of the user's watchlists stored by study 7
(`data/fv/raw/px/*.json`, TradingView `1M` bars). The month that is still forming
(October 2026) is dropped; last month used: 2026-09.

## 2. Signal and exits

MOD regular bullish exactly as `PROTOCOL-study6.md` §1 (`mod()` in `engine/study6.js`),
on monthly bars: pivot lows 5 bars each side (known 5 months later), previous pivot within
60 bars, at least 2 of RSI 14 / MACD line / OBV / MFI 14 higher at the second low.

Entry at the next month's open; exit at the close of month i+3 (H3) or i+6 (H6); 0.10% per
side; one trade at a time per stock and exit; warm-up 36 months. No filter.

**2 tests.** Periods: I before 2018-01-01, II after (signal month).

## 3. Verdict

Edge = mean return − mean return of random entries with the same exit on the same stocks
and periods (`pool`). Permutation test, 4,000 draws, seed 20261019; Holm over the 2 tests.
**Beats random** = edge > 0, Holm p < 0.05, edge > 0 in both periods.

## 4. After the verdict

List every watchlist stock whose monthly MOD signal fired in the last 12 completed months
(signal month, the two lows, price now), marked with the verdict. If the test fails, the
list is shown as what the chart displays, not as a recommendation.

## 5. Known bias, stated now

These are the user's watchlist stocks chosen today: strong survivorship and selection bias
(stocks that went to zero after a "divergence" are not on anyone's watchlist). Random
entries on the same stocks share it; the edge over them is the measure. Monthly signals
are few per stock; expect a small sample.
