# Study 14 — ranks from the research literature, for the stock page — pre-registered

**Written 2026-10-20, before any value below has been computed on any stock and before the
total-assets data it needs has been fetched.** After study 13 (no own-history zone beat
chance), the user asked to look for indicators beyond the ones already tried. A research
pass (academic papers, practitioner tools, data feasibility; summarized in §6) proposed eight
candidates. Four are tested here and four are reported only, chosen now, before any result
exists, for the strength of their published evidence and the length of data behind them:
with Holm over eight and 14–25 yearly observations, an honest power estimate (§6) says even
real effects of the size reported after 2010 would rarely confirm. An independent review of
the draft (it counted data coverage and formats only, computed no rank or return, called no
data source) led to the precise wording below.

**Already known before this protocol:** studies 7, 9 (part A1) and 13 tested value against a
stock's *own* history only (not confirmed or weak); study 9's score (IC +0.027, confirmed)
contains no price trend, no gross profit ÷ assets and no share issuance; study 13's Z7
(48-month price stretch against its own history) had a mean D of −3.5%, i.e. stretched stocks
did better than unstretched ones; study 8's 10-month trend filter was not confirmed. None of
these is a cross-sectional rank of the kind below.

## 1. Data and dates

- **Universe:** study 13's 815 stocks (`data/fv` + `data/fv8`, `scripts/lib/universe.js`,
  last complete month 2026-09, one symbol per set of identical accounts, first in load order).
  Sectors from `sectors.json`.
- **Test dates:** the end of May of each year R. **Outcome:** fwd = c(May R+1) ÷ c(May R) − 1,
  price return.
- **Ranked set and pool:** a stock is ranked for a candidate at May R when it has the
  candidate's value and a positive close at May R; all sector and global percentiles are
  taken over these stocks. The year's pool for D, IC and hit rates is the ranked stocks that
  also have a positive close at May R+1; the sides keep the ranking's percentiles.
- **Fundamentals:** st = `stateAt(funds, 'R-05')` (fiscal years up to R−1 known from May R);
  F0 = st.fiscalYear, F1 = F0 − 1. c(m) = monthly close, h(m) = monthly high.
- **Total assets (new data):** TradingView's `total_assets_fy_h` and `total_revenue_fy_h`
  (newest first, up to 20 fiscal years, no labels), fetched together in
  `get-symbol-data-batch` calls for all 815 stocks after this protocol is committed. The run
  starts only after every symbol has been requested; a symbol with no row has no total assets.
  Index i *matches* stored year Y when both revenues are > 0 and |rev_i ÷ rev_Y − 1| ≤ 0.001.
  A stock's offset o is the most common value of Y + i over pairs where i is the only index
  matching Y and Y is the only stored year matching i (no offset on a tie or with no such
  pair). Year Y takes the total assets at i = o − Y when that index matches Y and its total
  assets are > 0; otherwise it has none. Stocks whose stored, USD-converted revenues use a
  different exchange rate from the scanner's find no offset and drop out of T2 and T4; this
  is expected and is not fixed after the run. The report gives the number of stocks and
  stock-years with total assets.
- **Implementation:** `engine/ranks.js` (committed with this protocol) and a run script
  committed before the first run; any change after the first run is post-hoc.

## 2. Ranking rules

- **Percentile** of x within a group of n values: (average rank − 0.5) ÷ n, ties sharing the
  average rank, oriented so that higher = better by the hypothesis.
- **Sector-relative:** the percentile within the stock's sector that year among ranked stocks
  with a value; a sector-year needs at least 5 such stocks, else those stocks have no value
  for that component. The candidate's score is then re-ranked as a percentile over all of the
  year's ranked stocks.
- **Sides:** top fifth (final percentile ≥ 0.80) = buy side, bottom fifth (≤ 0.20) = sell side.

## 3. Candidates

**Tested:**

| | Candidate | Value at May R (higher = buy side) | Years |
|---|---|---|---|
| T1 | Nearness to the 52-week high (after George & Hwang 2004) | c(May R) ÷ the highest h of the 12 monthly bars Jun R−1 … May R (all 12 present): the intraday 52-week high as quotes show it, not George & Hwang's highest daily close, so the value sits at or below theirs, more so for volatile stocks; global percentile | 2001–2025 |
| T2 | Gross profitability (Novy-Marx 2013) | gross profit of F0 ÷ total assets of F0 (total assets > 0, gross profit present); not for Finance; sector-relative | 2011–2025 |
| T3 | Net share issuance (fiscal-year form of Fama & French 2008; Pontiff & Woodgate 2008 use 11 months of shares outstanding) | −ln(shares F0 ÷ shares F1), shares = net income ÷ diluted EPS as `parseFundamentals` sets them (a weighted-average diluted count, so the change is centred about a year before May R); both years present with |EPS| ≥ 0.25 and EPS of the same sign in F0 and F1 (a loss year's diluted count is the basic count); buybacks rank high; sector-relative | 2012–2025 |
| T4 | Profitable value (after Novy-Marx 2013) | mean of V's final percentile (as for R3, over V's whole ranked set, Finance included) and T2's final percentile, both required, non-Finance; re-ranked over the T4 ranked set. (Novy-Marx uses book-to-market; book value is not in the data (§6), so V stands in, and V's EY already carries part of profitability.) | 2011–2025 |

**V (value composite, used by T4 and R4 and reported alone as R3):** EY = EPS of F0 ÷ c,
FY = `st.fcfPS` ÷ c, EBY = EBITDA of F0 ÷ (c × shares + `st.debt`, a missing total debt
counting as 0 as `stateAt` sets it), c = c(May R); negative values allowed (they rank low);
FY and EBY need shares > 0 and are not computed for Finance. Each is ranked within its sector.
A non-Finance stock needs at least 2 of the 3 and takes the mean of their percentiles; Finance
takes EY's percentile alone. That score is re-ranked within the sector (same 5-stock floor),
then globally.

**Reported, not tested:**

| | Candidate | Value at May R | Years |
|---|---|---|---|
| R1 | 12-1 month momentum (Jegadeesh & Titman 1993) | c(Apr R) ÷ c(May R−1) − 1, both present; global percentile | 2001–2025 |
| R2 | Residual momentum, market form (Blitz, Huij & Martens 2011) | the 36 monthly returns of Jun R−3 … May R, each c(m) ÷ c(m−1) − 1 (all 37 closes May R−3 … May R present); OLS with an intercept on the equal-weighted mean return that month of the 815 universe stocks with closes at m−1 and m (the stock included); the sum of the 11 residuals of Jun R−1 … Apr R ÷ their sample standard deviation; global percentile | 2003–2025 |
| R3 | Value composite V alone | V's final percentile | 2011–2025 |
| R4 | Value + momentum (Asness, Moskowitz & Pedersen 2013) | mean of V's and R1's final percentiles (each from its own ranked set), both required; re-ranked over the R4 ranked set | 2011–2025 |

## 4. Hypotheses

For each tested candidate and year, **D** = median fwd of the buy side − median fwd of the sell
side, over the year's pool. A year counts when the pool holds at least 100 stocks; a candidate
is tested when at least 10 years count.

- **H_Tk (k = 1 … 4):** the mean of D over the counted years is above zero. p-value: exact
  one-sided sign-flip over years (`signFlipGreater`). Holm over the testable candidates. A
  candidate is confirmed when its mean D > 0 and its adjusted p < 0.05.
- **Most useful:** the confirmed candidate with the largest mean D over the years in which
  every confirmed candidate counts; on a tie, the lower k.

## 5. Reported, not tested

For T1–T4 and R1–R4:
- yearly D, pool sizes, yearly Spearman IC (final percentile vs fwd over the pool);
- halves: T1 and R1 2001–12 / 2013–25; R2 2003–13 / 2014–25; T2, T4, R3, R4 2011–17 /
  2018–25; T3 2012–18 / 2019–25;
- T1, R1 and R2 on 2011–2025 alone (the fundamentals' years);
- every candidate without the May 2009 and May 2020 cross-sections;
- a 6-month D for T1, R1, R2: c(Nov R) ÷ c(May R) − 1 over ranked stocks with a positive close
  at Nov R, sides as ranked at May R;
- for T1, R1 and R2, 12 formation dates: year R's dates are the month-ends Jun R−1 … May R, each
  ranked by the same rules at that month with its own 12-month outcome; a date counts with a
  pool of at least 100; the year's value is the mean D over its counting dates; outcomes
  overlap, so no p-value;
- the watchlist and S&P 500 universes apart: sides kept from the full ranking; a year counts
  with at least 10 stocks per side;
- large caps: each year the 300 ranked stocks with the largest c(May R) × shares of F0
  (shares > 0, R ≥ 2011), re-ranked within them by the same rules;
- hit rates pooled over the counted years (share of the buy side above that year's pool
  median, share of the sell side below it);
- correlations: the yearly Spearman correlation of two candidates' final percentiles over
  stocks having both, averaged over the years both count; study 9's score the same way.

Known limits, stated in the report: survivorship (today's listed stocks; dead losers are
missing, which flatters the sell side of price-trend ranks and the cheap side of value);
price return without dividends (high-yield value stocks lose 2–4 points a year here);
TradingView's current, restated fundamentals; today's sectors; one date a year; EV without
cash; share counts from net income ÷ EPS are distorted by preferred dividends, minority
interests and SPAC years; the 52-week high from intraday highs.

## 6. Background the choice rests on

- Evidence: George & Hwang 2004 (52-week high absorbs most of momentum and does not reverse);
  Novy-Marx 2013 (gross profitability; value works much better among profitable firms,
  especially large ones); Pontiff & Woodgate 2008 and Fama & French 2008 (issuance among the
  few anomalies pervasive in big stocks); Jegadeesh & Titman 1993, Blitz, Huij & Martens 2011,
  Asness, Moskowitz & Pedersen 2013.
- Decay: McLean & Pontiff 2016 (returns about 58% lower after publication, more in large
  liquid stocks); Hou, Xue & Zhang 2020 (most anomalies fail with value weights); Blitz 2020
  (value, profitability and investment weak in 2010–19, momentum about +3.5% a year).
- Power: a true D of +3% a year with a yearly standard deviation of 10% gives t ≈ 1.2 over 15
  years and ≈ 1.5 over 25; "not confirmed" is the likely outcome even for a real effect.
- Not feasible with this data (no history): analyst revisions, earnings-surprise drift with
  report dates, insider buying, short interest, book value, full Piotroski or quality-minus-
  junk. A forward log of today's analyst estimates could make revisions testable later.

## 7. What the page does either way

- A confirmed candidate gets a plain-words line per stock ("closer to its 52-week high than
  X% of stocks", "earns more gross profit per dollar of assets than X% of its sector", "its
  diluted share count fell 3% between its last two fiscal years", …) with the test's result.
- An unconfirmed one may be shown only as a labelled description that did not beat chance in
  this test, never as a buy or sell signal.
