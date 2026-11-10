# Study 13 — buy and sell zones for profitable companies: which history marks them best — pre-registered

**Written 2026-10-20, before any zone below has been computed for any stock.** The user saw
the SVR chart (Nanalyze's ratio, shown on the stock page only for companies not yet
profitable) and asked for the same kind of chart for profitable companies: a history with a
buy zone ("accumulate") and a sell zone ("the price has run"), with several options tested
and the most accurate one used on the page. An independent review of the draft (it counted
data coverage only, computed no zone or return) led to the precise wording below.

**Already known before this protocol:** study 9 reported (not tested) its price part A —
the mean of the own-history percentiles of P/E, P/S, EV/EBITDA and P/FCF over 60 months,
plus implied growth — at mean IC +0.020, positive in 6 of 14 years, top − bottom fifth
+4.3%; after the post-hoc fixes (multiples above 100 left out, no P/FCF for financials)
+0.029, 9 of 14, +4.6% (reports/study9-posthoc-fixes.txt). Study 7 (552 watchlist stocks,
60-month medians) reported each method alone: P/E against its own history mean IC −0.018,
PEG −0.012, EV/EBITDA own −0.039, P/S own −0.016 (post-hoc −0.015, −0.012, −0.037, −0.005);
its blend was not confirmed (mean IC −0.032). The sectors tab draws bottom and top 10% zones
of sector P/E as an untested description. So the prior evidence for "cheap against its own
past" is weak; this study asks about the extremes (zones), not the full ranking, and
compares eight ways to draw them.

## 1. Data and dates

- **Universe:** the 819 US stocks of study 9 (`data/fv` + `data/fv8`, loaded with
  `scripts/lib/universe.js`, last complete month 2026-09), keeping one symbol per set of
  identical accounts — the first in load order (watchlist folder first) among stocks whose
  latest fiscal year has the same revenue and net income, as `scripts/sector-pe.js` does
  (GOOG/GOOGL, BRK.A/BRK.B, FOX/FOXA, NWS/NWSA; 815 stocks expected). Sectors from each
  folder's `sectors.json`.
- **Months:** every month m uses the close of m and the fiscal year known at m by study 7's
  rule (`stateAt(funds, m)`: fiscal years up to R−1 are known from the end of May of R).
- **Test dates:** the end of May of each year R = 2014 … 2025 (2014 is the first year a
  stock can have 36 months of multiples, the earliest fiscal year being 2010). Outcome: the
  price return from the end of May R to the end of May R+1 (dividends not included).
- **Profitable at a month m:** the fiscal year known at m has net income > 0 and EPS > 0.
- **In a zone at R:** a stock counts only when it is profitable at the end of May R, has a
  value for the candidate there, and has positive closes at the end of May R and May R+1.
- **Implementation:** `engine/zones.js` and `scripts/study13-run.js` as committed together
  with this protocol; any change after the first run is post-hoc.

## 2. The eight candidates

Monthly multiples (st = the fiscal-year state at m, c = the close of m), each only when
positive and with **no upper cap**: `MULT_MAX` (the 2026-10-14 post-hoc cap at 100 in
`fairValuesAt` and `scoreAt`) is not applied, neither to the history nor to the value at d;
its effect on study 9 part A is already known (above). P/E = c ÷ EPS; P/S = c ÷ revenue per
share; EV/EBITDA = (c × shares + total debt) ÷ EBITDA; P/FCF = c ÷ FCF per share, not
computed for the Finance sector. Shares are net income ÷ EPS, as `parseFundamentals` sets them.

**Own-history percentile** of a series X at date d: the share of the months before d whose
X was below X(d), ties counting half, over every month before d where X is defined; needs
at least 36 such months, else the stock has no value for that candidate at d.

| | Candidate | Value at d | Buy zone | Sell zone |
|---|---|---|---|---|
| Z1 | P/E history | own-history percentile of P/E | ≤ 0.20 | ≥ 0.80 |
| Z2 | P/S history | own-history percentile of P/S | ≤ 0.20 | ≥ 0.80 |
| Z3 | EV/EBITDA history | own-history percentile of EV/EBITDA | ≤ 0.20 | ≥ 0.80 |
| Z4 | P/FCF history | own-history percentile of P/FCF | ≤ 0.20 | ≥ 0.80 |
| Z5 | Combined | mean of Z1–Z4's percentiles, at least two of them | ≤ 0.20 | ≥ 0.80 |
| Z6 | PEG rule | P/E at d ÷ (100 × g) | < 1 | > 2 |
| Z7 | Price stretch | own-history percentile of c ÷ the mean of the 48 monthly closes m−47 … m (m included; all 48 present, else no value that month) — price only | ≤ 0.20 | ≥ 0.80 |
| Z8 | P/E against its sector | own-history percentile of the stock's P/E ÷ that month's sector median | ≤ 0.20 | ≥ 0.80 |

- **Z6:** g = `stateAt(funds, d).epsG` as computed (growth over the last up to three
  intervals of the known non-missing annual EPS, so 1–2 years when fewer are known), not
  capped, only when g > 0. This is not the page's PEG column (which uses analysts' growth).
- **Z8:** the median P/E that month of all stocks in the full universe (both folders, the
  stock itself included) with the same `sectors.json` sector that are profitable at m and
  have a close at m; a month counts only with at least 5 such stocks. A plain median, not
  the sectors tab's earnings-weighted P/E. The same medians are used in the §4 splits.

## 3. Hypotheses

For each candidate and year, **D** = median 12-month return of the stocks in its buy zone −
median of those in its sell zone. A year counts for a candidate
when each zone holds at least 10 stocks; a candidate is tested when at least 10 of the 12
years count.

- **H_Zk (k = 1 … 8):** the mean of D over the counted years is above zero. p-value: exact
  sign-flip over years, one-sided (`signFlipGreater`). Holm correction over the testable
  candidates. A candidate is confirmed when its mean D is positive and its adjusted p < 0.05.
- **The most accurate** = the confirmed candidate with the largest mean D over the years in
  which every confirmed candidate counts (its own counted years if only one is confirmed); on
  a tie, the lower k.

## 4. Reported, not tested

Per candidate: yearly D and zone sizes; the 36-month version of D (May R → May R+3, R ≤
2023, same zones and the same 10-stock floor among the stocks that also have a close at May
R+3; windows overlap, so no p-value); the yearly Spearman IC between the value (sign turned
so that cheaper = higher; −PEG for Z6) and the 12-month return over all profitable stocks
with a value, in years with at least 20 of them; hit rates pooled over all 12 years (share
of buy-zone stocks beating that year's median return of all profitable stocks, share of
sell-zone stocks below it); the halves 2014–2019 and 2020–2025; the watchlist and S&P 500
universes apart (the 10-stock floor applied inside each); Z1–Z5 on the common set where all
of Z1–Z4 exist (it has no Finance stocks, which have no P/FCF); zones at 10% / 90%.

Known limits, stated in the report: survivorship (today's listed stocks only); price return
without dividends; annual fundamentals only (the live page reads the last twelve months
from quarters, a post-hoc difference); one date a year; fundamentals are TradingView's
current, restated values, not as first reported; sectors are today's classification for
every year (Z8's groups, the Finance exclusion).

## 5. What the page does either way

- If a candidate is confirmed, profitable stocks on the page get a chart of the winner's
  monthly value computed by `engine/zones.js` as tested (every earlier month, at least 36).
  Each past month is marked buy or sell by the tested cutoffs applied to that month's
  past-only value: for Z1–Z4, Z7 and Z8, two moving lines at the 20th and 80th percentile of
  the months before it; for Z5, the combined value against 0.20 / 0.80; for Z6, PEG against
  fixed lines at 1 and 2, with growth from past fiscal years, never analysts' forecasts. The
  position now is today's value against all earlier months. Where the live page differs from
  the test (last twelve months from quarters, the mid-year fiscal-year shift), the chart
  says so, and it states this test's result in plain words.
- If none is confirmed, the page may still draw the P/E history (Z1, chosen here for being
  the most familiar, not by its result) the same way, labelled as a description that did not
  beat chance in this test, and says so plainly. It does not call any zone a buy or sell
  signal.
