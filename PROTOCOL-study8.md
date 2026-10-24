# Study 8 — "below the green line AND the trend has turned up" — pre-registered

**Written 2026-10-12, after study 7 and before any data for this study is fetched or
computed.**

## Where the idea comes from — and why it needs new stocks

Study 7 found that `pine/fair-value.pine` did not rank the user's watchlist stocks: stocks
below the green line (price < 0.8 × fair value) mostly did worse over the next 12 months.
A post-hoc look (`reports/study7-posthoc.txt`, labelled not evidence) showed 12-month price
momentum doing better than value on the same stocks. The idea tested here, buy cheap only
once the price has turned up, came from looking at that data. Testing it on the same
stocks would test the idea on the data that suggested it. So the confirmatory test uses
**stocks the user never put on a watchlist**; the watchlist stocks are reported alongside,
labelled "not independent".

## 1. Universes

**Fresh (confirmatory):** every constituent of the S&P 500 and the S&P MidCap 400, as the
TradingView screener lists them on the fetch date (`market: america`,
`filters: {index: ...}`), **minus every symbol in any of the user's watchlists**
(`data/fv/watchlists.json`). If the screener does not accept the MidCap 400 filter, the
S&P 500 alone is used, and the report says so. Testable stocks are filtered by the same
rules as study 7 §A1 (`type = stock`, ≥ 6 fiscal years with revenue and EPS, ≥ 60 months
of prices).

Today's index members are companies that survived and grew into the index. That bias
helps every group equally in absolute terms; the tests compare groups within the same year.

**Watchlist (reported, not tested):** the 552 testable stocks of study 7.

## 2. Data, fair value, dates

Exactly as study 7 (§A2–A4): annual fundamentals from `get_financial_history` (fy, from
2000), monthly closes from `get_ohlcv` (interval M, 320 bars), fiscal year Y usable from end
of May Y+1, the published blend V0 of `engine/fairvalue.js`, unchanged. One date per year,
the last monthly close of May, 2012–2025; outcome = price return over the next 12 monthly
closes. Responses are extracted from the session transcripts by
`scripts/study7-collect.js` (output to `data/fv8/`), never copied by hand.

## 3. The signal — one definition, fixed now

At each May date, among stocks with a V0 fair value:
- **Green** = close < 0.8 × fair value (the indicator's green line).
- **Trend up** = close > the simple average of the last 10 monthly closes, this month
  included (the classic 10-month rule; nothing about it is tuned here).

Groups: **G-up** = green and trend up. **G-down** = green and not trend up.
**All** = every stock with a V0 fair value and a 12-month outcome.

A year counts for a comparison when each group in it has at least 5 stocks.

## 4. Hypotheses (fresh universe only), Holm-corrected at 0.05

- **H1:** within cheap stocks, a turned-up trend helps. Per year,
  d1 = median 12-month return of G-up − median of G-down. Mean of d1 over years > 0.
- **H2:** buying G-up beats owning everything. Per year,
  d2 = median of G-up − median of All. Mean of d2 over years > 0.

Each p-value is an exact sign-flip test of the yearly differences, one-sided (all 2^n sign
patterns; n ≤ 14). The two p-values are Holm-corrected. A hypothesis is confirmed only if
its corrected p < 0.05.

## 5. Reported, not tested

- The same per-year table for the watchlist stocks, labelled "not independent: the idea
  came from these stocks".
- Per year: group sizes and medians, and the mean as well as the median.
- How often each group was empty or too small.

## 6. What happens to the indicator

If H1 **and** H2 are confirmed, `pine/fair-value.pine` gets a marker for "below the green
line and above the 10-month average", with this study's numbers in its header. If either
fails, the indicator is not changed and its header says this idea was tested and failed.
