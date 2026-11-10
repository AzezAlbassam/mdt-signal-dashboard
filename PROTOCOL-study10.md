# Study 10 — "the price expects more than the company delivers" — pre-registered

**Written 2026-10-13, before the flags below have been computed for any stock-year.** The
idea comes from the user's example, The Trade Desk: for years the price assumed more growth
than the company delivered while growth slowed, and the study 9 score still rated it 9.0
out of 10 in May 2025, a year before a 71% fall. One stock was looked at (TTD, the table in
the conversation of 2026-10-13); no other stock and no aggregate was computed.

## 1. Universe, dates, data

The 819 US stocks of study 9 (552 watchlist + 267 S&P 500 outside the watchlists), the same
committed data (`data/fv`, `data/fv8`), the same dates (last monthly close of May, 2012–2025)
and outcome (price return over the next 12 monthly closes). Fiscal year Y is known from May of
Y+1, as in study 7.

## 2. The two flags — fixed now, thresholds not tuned

At each date, for a stock with positive free cash flow per share (else no flag):
- **gap** = g* − g_r: the free-cash-flow growth the price implies (study 9 §1 A2: the study 7
  DCF at 9% / 2.5% / 10-year fade, solved for growth in [−20%, 60%]) minus the growth the
  company delivered (3-year revenue CAGR, else EPS CAGR, else 0).
- **slowing** = last known year's revenue growth (F0 vs F1) is below the 3-year revenue CAGR.

**RED, "the price expects more than it delivers":** gap ≥ +10 points and slowing.
**GREEN, "the market is more pessimistic than the numbers":** gap ≤ −10 points, not slowing,
and last year's revenue growth > 0.
Every other stock with a gap is **neutral**.

## 3. Hypotheses, Holm-corrected at 0.05

Per year, compare against all other stocks with a gap that year. A year counts when the flag
has at least 5 stocks.
- **H1:** RED does worse. d1 = median 12-month return of RED − median of the rest; the mean of
  d1 over years is below zero.
- **H2:** GREEN does better. d2 = median of GREEN − median of the rest; mean above zero.

p-values: exact one-sided sign-flip over years. Holm over the two. Confirmed when the effect
has the stated sign and the adjusted p < 0.05.

## 4. Reported, not tested

- Per year: counts and medians of RED, GREEN, neutral; the mean as well as the median.
- Stocks scoring ≥ 7 in study 9, with and without RED: median 12-month return (does RED catch
  the score's blind spot?).
- The same tables for the watchlist and the S&P 500 parts separately.
- TTD year by year, labelled as the example that prompted the study, not evidence.

## 5. What the page shows either way

The flags appear on the stock page with this study's result written next to them. If a flag
is not confirmed, it is shown as information with that result, never as a signal. Analysts'
forward estimates (next year's revenue and EPS against the last 12 months) are shown next to
the flags as information only: there is no history to test them on.
