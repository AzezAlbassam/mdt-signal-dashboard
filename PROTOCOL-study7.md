# Study 7 — the fair value indicator on the user's stocks, and a gold regression band — pre-registered

**Written 2026-10-12, before any data for this study is fetched or computed.** Only the
response format of the TradingView connector was looked at (one META call for annual and
quarterly fundamentals, a 3-bar monthly price call, a sector lookup, and a price-summary
call on TVC:GOLD that returned no prices, only the history length). The indicator under
test is `pine/fair-value.pine` as committed in f816472; it is not changed for part A.

---

## A. Does `pine/fair-value.pine` point at stocks that go on to do better?

### A1. Universe — fixed by rule

Every symbol on NASDAQ, NYSE or AMEX that appears in any of the user's TradingView
watchlists on 2026-10-12 (756 distinct symbols; the full list response is saved as
`data/fv/watchlists.json`). A symbol is **testable** when:
- TradingView's screener says `type = stock` (ETFs, funds, preferreds drop out), and
- annual fundamentals have at least 6 fiscal years with both revenue and EPS, and
- monthly prices cover at least 5 years.

Everything else is listed in the report with the reason it was left out.

The list was picked by the user, today, knowing how these stocks did; companies that went
bust are missing. Absolute returns are therefore inflated. The tests below rank stocks
against each other within the same year, which this bias hurts less, but does not remove.

### A2. Data

- Fundamentals: `get_financial_history`, `period = fy`, `date_from = 2000-01-01` (the
  connector returns up to 16 fiscal years: revenue, EPS, net income, free cash flow,
  EBITDA, total debt). Responses are read from the session transcript by a script, never
  copied by hand.
- Prices: `get_ohlcv`, interval `M`, monthly closes, split-adjusted, not dividend-adjusted.
- Sector: TradingView screener `sector` today, applied to every year.
- **No look-ahead:** fiscal year labelled Y is used only from the end of May of Y+1 (US
  annual reports are due within 60–90 days of a December year end). Companies whose fiscal
  year ends mid-year are used later than necessary; that only costs signal, not honesty.
- Shares = net income / EPS of the same fiscal year (both non-zero, same sign); otherwise
  that year has no per-share values.

### A3. What can and cannot be tested

The connector has no book value, cash or quarterly history before 2022. So the test uses
the methods the data allows, with the same formulas and parameters as the Pine script
(9% discount, 2.5% terminal growth, 25% growth cap, fair PEG 1, 5-year own-history window
of monthly samples, at least 12 samples):

| Method | Tested | Note |
|---|---|---|
| P/E vs own history | yes | annual EPS instead of TTM |
| PEG | yes | 3-year EPS CAGR, else revenue CAGR |
| DCF (FCF) | yes | 3-year revenue CAGR, else EPS CAGR |
| EV/EBITDA vs own history | yes, changed | EV without cash (cash not available), same definition in history and today |
| P/S vs own history | yes | |
| P/E on 5-year average EPS | yes | |
| Graham, P/B, P/B from ROE, net cash | **no** | need book value or cash |

Company type and weights follow the Pine script exactly; methods that cannot be computed
drop out and the rest are re-weighted, as the script does. Pre-revenue stocks (revenue under
1% of market value) get no fair value from these methods and are left out of that year.

### A4. The signal and the outcome

Once a year, at the last monthly close of May (2012 onward, when enough history exists):
- upside U = fair value / price − 1;
- outcome = price return over the next 12 monthly closes (May to May). Windows that end
  after the last completed month are not used.

### A5. H1 — confirmatory, one test, on all testable stocks

Per year, the Spearman rank correlation between U and the 12-month return across stocks
(the "IC"). H1: the mean IC over years is above zero.

Confirmed only if **both**: (a) a permutation test that shuffles U across stocks within
each year (10,000 shuffles, seed 7) gives one-sided p < 0.05, and (b) a one-sided t-test of
the yearly ICs gives p < 0.05. Anything else: not confirmed.

### A6. H2 — looking for an improvement, then checking it on stocks it never saw

Testable stocks are sorted by symbol. **Even positions** (0, 2, 4, …) are the search half;
**odd positions** the check half. The search may only look at the search half.

Candidates, fixed now:
- V0 the published blend;
- V1–V6 each tested method alone (P/E own, PEG, DCF, EV/EBITDA own, P/S own, P/E on 5y EPS);
- V7 equal weight over every available method;
- V8 own-history methods only (V1, V4, V5, V6), equal weight;
- V9 PEG and DCF only, equal weight.

Rule: on the search half, pick the candidate with the highest mean IC among those that
give a value for at least half as many stock-years as V0. Write the pick to
`reports/study7-pick.json` and commit it **before** computing anything on the check half.

H2: on the check half, mean over years of (IC of the pick − IC of V0) > 0, by sign-flip
permutation of the yearly differences (all 2^n flips if n ≤ 20), one-sided p < 0.05. If the
pick is V0 itself, H2 is "no improvement found".

### A7. Reported, not tested

- Per year: mean 12-month return of stocks below the green line (price < 0.8 × fair),
  between the lines, and above the red line (price > 1.2 × fair), with counts.
- Per company type and per method: IC and coverage.
- Every number is shown with its sample size. A handful of years is a small sample:
  even a confirmed H1 says the ranking helped on these stocks in these years, not that it
  will.

---

## B. A logarithmic regression band for gold

### B1. The indicator (`pine/gold-log-regression.pine`)

- Fit: ln(price) = a + b·t by least squares on monthly closes, with t in years. A power-law
  option (ln price on ln time since the start date) is offered for users who want the
  shape of the usual crypto bands, but linear time is the default: gold has no genesis
  date, and a constant long-run growth rate is the natural null.
- **Start date 1971-08** (the end of dollar convertibility). Before that the gold price was
  fixed by law, so it carries no information about a market trend. TradingView's TVC:GOLD
  goes back to 1833; the start date is an input.
- Bands at ±1 and ±2 standard deviations of the residuals; the table shows the current
  position in standard deviations.
- Two fit modes: **"All data"**, fitted on the whole history to today — this is what most
  published regression bands do, and it redraws the past every month; and **"Past only"**,
  where each bar's band uses only data up to that bar. The default is "Past only"; the
  table states which mode is drawn.

### B2. Check — descriptive only, no hypothesis test

Gold since 1971 has had only two or three complete boom-and-bust cycles, far too few
independent episodes for a p-value to mean anything. So nothing is "confirmed". Reported,
from TVC:GOLD monthly closes, using the **past-only** fit (at least 20 years of data before
a month counts, so from 1991):
- each episode in which the close fell below the −1 SD band: dates, how deep, and the price
  return 12, 36 and 60 months later;
- the same forward returns averaged over all months, for comparison;
- the same table for the all-data fit, labelled as hindsight.
