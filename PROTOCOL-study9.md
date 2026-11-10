# Study 9 — a 0–10 stock score where each part covers another's blind spot — pre-registered

**Written 2026-10-12, before the score has been computed for any stock.** The US data it
uses was fetched for studies 7 and 8; there, only the fair value line and a 10-month
trend filter were looked at, never margins, cash conversion, growth, debt or the year-on-year
checks below. The user asked for one score per stock for a private stock page.

## 1. The score

Five parts, each worth 0–2 points, total 0–10. Dates and data lag are as in study 7: at the
last monthly close of May of year R, fiscal years up to R−1 are known (F0 = the latest known
fiscal year, which must be R−1 or R−2; F1 the year before it). `lin(x, a, b)` is 0 at a, 1
at b, straight in between and clamped to [0, 1] (for a > b it falls).

**A. Price (what you pay)**
- A1 (0–1), cheap against its own past: for each of P/E, P/S, EV/EBITDA and P/FCF that is
  positive now and has ≥ 12 positive monthly values in the 60 months up to now, the share
  of those months whose value was below today's (ties count half). A1 = 1 − the mean share.
  EV here is market value + total debt (cash is not available), as in study 7.
- A2 (0–1), what the price expects: the free-cash-flow growth g* that makes the study 7
  DCF (9% discount, 2.5% terminal, 10-year fade) equal today's price, searched in
  [−20%, +60%]; the realistic rate g_r = 3-year revenue CAGR (else EPS CAGR, else 0).
  A2 = lin(g* − g_r, +0.20, 0): 1 when the price needs no more growth than the company has
  delivered, 0 when it needs 20 points more a year. Not computable when FCF ≤ 0.
- A = A1 + A2; if one of them is missing, twice the other.

**B. Quality (is the business good)**
- B1 (0–1): EBITDA margin of F0, lin(m, 0, 0.30). Without EBITDA (banks, insurers): net
  margin, lin(m, 0, 0.20).
- B2 (0–1): cash conversion over the last 3 known years, Σ FCF ÷ Σ net income,
  lin(r, 0, 0.8). If Σ net income ≤ 0: 0.5 when Σ FCF > 0, else 0.

**C. Growth (is it getting bigger)**
- C1 (0–1): 3-year revenue CAGR, lin(g, 0, 0.20).
- C2 (0–1): 3-year EPS CAGR, lin(g, 0, 0.20); when not computable (a loss at either end):
  0.5 if EPS of F0 is above EPS three years earlier (or the earliest of those), else 0.
- C = C1 + C2; if one of them is missing, twice the other.

**D. Safety (can it survive a bad year)**
- D1 (0–1): total debt ÷ EBITDA, lin(x, 4, 1) (1 at ≤ 1×, 0 at ≥ 4×); 1 if debt is 0;
  0 if EBITDA ≤ 0 or missing while there is debt. Skipped for the Finance sector, where
  debt is the product: there D = 2 × D2.
- D2 (0–1): losses in the last 5 known years, 1 − (number of years with net income < 0) ÷ 3,
  floored at 0.

**E. Direction (are the numbers getting better)** — F0 against F1, the checks that the data
allows (a partial Piotroski score): net income > 0; FCF > 0; FCF > net income; revenue up;
EPS up; EBITDA margin up; gross margin up; debt ÷ EBITDA down (debt down when EBITDA is
missing; skipped for Finance). A check whose inputs are missing is skipped.
E = 2 × passed ÷ checked, and needs at least 5 checks.

A stock gets a score only when all five parts are computable. No score for pre-revenue
stocks (revenue ≤ 0 or under 1% of market value).

**What is not in the score, because it has no history to test it on:** analysts'
forecasts (forward P/E, price targets), Altman Z, ROIC, book value, cash. The stock page
shows them next to the score as information, outside the 0–10 number. The page computes
the score with exactly these rules.

## 2. Universes

- **US (confirmatory):** the 552 testable watchlist stocks of study 7 plus the 267 testable
  S&P 500 stocks of study 8 (no overlap by construction), 819 stocks, data as already
  committed in `data/fv` and `data/fv8`.
- **Saudi (reported, not tested):** the Tadawul main-market stocks in the user's "🇸🇦"
  watchlist (four-digit codes; the index and ratio symbols excluded), fetched the same way
  into `data/fv-sa`. Histories are short (Aramco from 2017), so there is no test.

## 3. Hypotheses — US, years 2012–2025, a year counts with ≥ 20 scored stocks

- **H1:** the yearly Spearman rank correlation between the score and the next 12-month
  price return has a mean above zero. p-value: shuffle the scores across stocks within each
  year, 10,000 times, seed 9, one-sided.
- **H2:** the yearly difference, median 12-month return of the top fifth by score minus the
  median of the bottom fifth, has a mean above zero. p-value: exact sign-flip over years,
  one-sided.
- Holm correction over the two. A hypothesis is confirmed when its effect is positive and
  its adjusted p < 0.05.

## 4. Reported, not tested

The same tables per universe (watchlist, S&P 500) and per part A–E; quintile medians per
year; coverage (how many stocks got a score each year); the Saudi table.

## 5. What the page says either way

If H1 and H2 are confirmed, the page sorts by score by default and states the test result.
If not, the page still shows the score, labelled as a summary of the company's numbers that
did not predict next year's return in this test, and states the result.
