# Study 16 — the stock page's untested valuation choices, decided by test — pre-registered

**Written 2026-10-23, before any value below has been computed on any stock and before the
balance-sheet history it needs has been fetched.** The page audit (v24) left open questions the
user handed back with "you're the expert, test each one and use what tests best". The first is
Visa and Mastercard sitting about 45% under their price because P/B-from-ROE is capped at 4×
book. Several other rules on the page went in as post-hoc fixes for single bad cases, or were
copied from the Pine script without a test. Each becomes a decision below, with the page's
current rule as option A. (The number 15 belongs to the Flow VWAP study on the same branch.)

Two rounds of independent review led to the precise wording below: three reviewers, plus a
skeptic for each must-fix finding. They checked code references, data coverage, formats,
wording and the design; none computed a fair value, error or return, or called a data source.
The second round added the price-closeness control, the market-adjusted outcome and D2's
geometric mean.

**Already known before this protocol:**
- Studies 7, 9 (part A1) and 13: the blended fair value's upside, against the stock's own
  history, did not sort the next 12 months reliably.
- Study 9's score is a different tool and is not touched here.
- None of the choices below has been scored against later prices.

## 1. Data and dates

- **Universe:** study 13's and 14's 815 stocks.
  - Source: `data/fv` + `data/fv8`, `scripts/lib/universe.js`, last complete month 2026-09.
  - Dedupe (study14-run.js): one symbol per set with the same latest stored fiscal year,
    revenue and net income, the first in load order (data/fv before data/fv8).
  - Sector and industry: today's, from the `sectors.json` of the folder the stock is loaded
    from.
- **Test dates and outcome:**
  - Test date: the end of May of each year R = 2012 … 2025, with c0 = c(May R).
  - c(m) is the monthly close in `raw/px`, as TradingView gives it (split-adjusted, no
    dividends).
  - **Outcome:** c1 = c(May R+1) × S(May R) ÷ S(May R+1), the price a year later with the
    market's move over that year taken out. S(m) is SPY's monthly close (see Beta below).
    - Within a year this only rescales every stock's c1 by the same factor, so ranks and
      ICs are unchanged.
    - A rising or falling market then favours neither higher nor lower fair values.
    - c1 needs c(May R+1) > 0 and both SPY closes.
- **Fundamentals:** as stored, through `parseFundamentals`. Shares = NI ÷ EPS when both are
  non-zero and of the same sign, else none.
  - st = `stateAt(funds, 'R-05')`: fiscal years up to R−1 are known from May R.
  - F0 = st.fiscalYear, F1 = F0 − 1.
- **New data (fetched only after this protocol is committed):**
  - Columns: `total_equity_fy_h`, `cash_n_short_term_invest_fy_h`, `oper_income_fy_h` and
    `total_revenue_fy_h` (all newest first, no labels).
  - How: `get-symbol-data-batch`, 50 symbols per call, for all 815 stocks.
  - Saved by `scripts/study16-collect.js`, which reads the session transcript as study 14's
    did, to `<dir>/raw/bal/<SYM>.json`.
    - It keeps only calls that ask for all four columns.
    - When a symbol comes back more than once, the row with more non-empty columns is kept;
      on a tie, the later one.
  - Failed calls: a call that fails (no readable answer, or `success: false`) is repeated
    until it succeeds or has failed 3 times. After that, its symbols count as having no row, and
    any later answer for them is ignored. The collector prints these symbols.
  - "Later" means later in the transcript files, in the order they are passed to the
    collector. A column counts as non-empty when it holds at least one finite number.
  - The run starts only after every symbol has been requested. A symbol with no row, or a
    column that comes back empty, has no value for that column.
- **A column with no aligned value for any stock** (alignment below): no other column is
  substituted after the fetch.
  - With equity empty, B0 has no pbj, and D1, D7 and D9 are reported as not testable.
  - With cash empty, D4 runs with rdcf's no-cash rule (§3.1). With operating income empty, it
    runs with net income in its place. D4 is reported as not testable only when both are empty.
- **Aligning the columns to fiscal years:** study 14's matching rule, `assetsByYear(funds,
  column, total_revenue_fy_h, ok)` in engine/ranks.js.
  - The optional 4th argument `ok` defaults to `pos` and is new.
  - The offset comes from revenues only, so it is the same for all three columns.
  - Only stored years with revenue > 0 can receive a value; a null entry has none.
  - Equity keeps `ok = pos`: an equity ≤ 0 has no book value. Operating income and cash may be
    zero or negative and use `ok = Number.isFinite`.
  - Stocks whose stored, USD-converted revenues use a different exchange rate from the
    scanner's find no offset and have none of the three. This is expected and is not fixed
    after the run. Study 14 found an offset for 804 of 815 stocks.
  - The report gives, for each column, the number of stocks and of stored fiscal years with a
    value, and the number of B0 stock-years whose F0 has one.
- **Per fiscal year Y:**
  - BVPS_Y = equity_Y ÷ shares_Y. It needs both values present and > 0.
  - ROE_Y = NI_Y ÷ the mean of equity_Y and equity_{Y−1}. Equity_Y alone is used when Y−1 has
    none, and none is computed without equity_Y or NI_Y.
- **Beta at May R:** the OLS slope, with an intercept, of the stock's monthly returns
  c(m) ÷ c(m−1) − 1 on SPY's, over the 60 months m = Jun R−5 … May R.
  - SPY: `data/harmonic/bars/AMEX_SPY__1M.json.gz`. Each month is `date.slice(0, 7)` and its
    close is the `close` field.
  - A beta needs at least 36 months with both returns; otherwise it is missing.
- **Peer margins:** `pages/peer-margins.json` as committed (asOf 2026-10-21), for the revenue
  DCF's target margin.
- **Medians:** every median of an even count is the mean of the two middle values.
- **Implementation:** `scripts/study16-run.js`, `scripts/study16-collect.js` and the engine
  edits they need (the sector lists exported, and `assetsByYear`'s `ok`) as they stand at this
  protocol's commit. Any change after the first run is post-hoc and is reported as such.

## 2. The base configuration B0 (the page's rules today, on annual data)

The page's live value uses quarterly figures and TradingView's quote fields. The backtest has
fiscal years only, so B0 is the page's rules on F0's figures. B0's stock-years are those with a
state at May R, c0 > 0 and a profile other than Pre-revenue. For each one:

- **Methods:**
  - `fairValuesAt(funds, closes, sector, 'R-05')` gives pe, peg, dcf, ev, ps and pen,
    unchanged, with three changes:
    - **dcf** = `dcf(st.fcfPS, clamp(st.revG ?? st.epsG, −0.05, 0.25), r, 0.025)`
      (engine/fairvalue.js), with r = clamp(0.045 + beta × 0.042, 0.07, 0.13), or 0.09
      without a beta. It has no value unless > 0.
      - On the page, this rate applies only to stocks with an analysts' forecast, and with
        the forecast's own growth path. Without one, the page already uses the engine's 9%
        (D8's B).
      - B0 is therefore the page's usual rate on the engine's growth path, not a rule the page
        applies as such. Forecast history does not exist.
    - **pe, pen and ev** have no value when that multiple at May R (`multiplesAt(st, c0)`) is
      above 100. This is the page's F16 rule.
    - **peg** has no value unless g = st.epsG ?? st.revG ≥ 0.10. This is the page's Lynch
      rule.
  - **pbj** = BVPS_F0 × min(4, (ROE_F0 − 0.025) ÷ (0.09 − 0.025)), when both inputs are
    present and the result is > 0. The cap binds exactly when ROE_F0 > 0.285.
  - **graham** = √(22.5 × EPS_F0 × BVPS_F0), when both are > 0 (it carries weight 0 in B0).
  - **pb** is not computed, as on the page.
- **Profile:** `profileOf` (sector lists). Pre-revenue stock-years are left out of the study.
- **Blend:**
  - It is `blend(values, w)` with `WEIGHTS[profile]` and Graham's weight set to 0. Missing
    methods are re-weighted.
  - The fair value V is the blend's `fair`. A stock-year with no V is not scored.
- **Page rules B0 leaves out** (they need quote fields or quarterly data):
  - the quote's share count replacing the last year's when they differ by more than 1.5×;
  - liveContext's share count of today and its EPS restatement;
  - allShares in the DCF;
  - the cash method, which is weighted only for Pre-revenue;
  - the revenue DCF, which is display only today.

## 3. Decisions and their options

Option A is B0 in every decision. Each challenger changes only its own decision, from B0. The
"Where it can differ" column is descriptive; the comparison set is defined in §4. "Valued
methods" are those with weight > 0 and value > 0.

| | Decision | Where it can differ | Options |
|---|---|---|---|
| D1 | P/B from ROE, for very profitable financials | Finance profile with ROE_F0 > 0.285, where the 4× cap binds | **A** cap 4×. **B** cap 8×. **C** no cap. **D** no pbj where ROE_F0 > 0.285, so P/E alone. **E** no pbj where ROE_F0 > 0.285, and the stock is profiled by `profileOf(st, c0, name)` with a name in neither HEAVY_SECTORS nor TECH_SECTORS (Growth, Mature or Unprofitable by its own figures) |
| D2 | How methods are combined | Stock-years with ≥ 2 valued methods | **A** weighted mean. **B** weighted median: in ascending value order, the first value whose cumulative weight is ≥ half the total − 1e-12 (at exactly half, the lower value). **C** weighted mean after dropping each valued method whose value is above 3× or below ⅓ of B's weighted median; with fewer than 3 valued methods, C = A. **D** weighted geometric mean, exp(Σ w ln v ÷ Σ w) |
| D3 | Which companies count as cyclical (Heavy) | Stock-years profiled Heavy, Growth or Mature whose sector is not Finance | **A** sector list. **B** Heavy when the stock's own earnings say so (the rule below), in any of these sectors. **C** Heavy only when the sector is in the list **and** the rule calls the stock cyclical, so C can only remove stocks from Heavy. Wherever B or C does not make a stock Heavy, `profileOf`'s next rules decide (Growth for a Tech sector or revG > 15%, else Mature). With fewer than 5 EPS values in the window, B and C keep A's answer |
| D4 | Loss-makers' fair value | Unprofitable-profile stock-years | **A** own-history P/S. **B** the revenue DCF (§3.1) where it gives a value, else P/S. **C** the arithmetic mean (P/S + revenue DCF) ÷ 2 when both exist, else whichever one exists |
| D5 | Methods on a multiple above 100 | Stock-years where pe, pen or ev has a value with its May R multiple > 100 | **A** dropped. **B** kept |
| D6 | Lynch's rule for PEG | Growth profile | **A** PEG only with g ≥ 10%. **B** PEG with any g > 0 (the engine's original value). **C** no PEG |
| D7 | Graham's number | Mature profile with a Graham value | **A** weight 0. **B** weight 0.15 (the Pine script's) |
| D8 | DCF discount rate | Stock-years with a DCF value and a beta | **A** CAPM (§2). **B** a flat 9%, which is the engine's own dcf value |
| D9 | Own-history P/B for Heavy | Heavy profile | **A** not computed. **B** computed (§3.2) at its 0.3 weight |

**D1's D and E** act on every Finance-profile stock-year with ROE_F0 > 0.285, including those
where pbj has no value under A. There D equals A, and E still re-profiles the stock.

**D3's rule:**
- The window is the calendar fiscal years F0−7 … F0, and at least 5 of them need a non-null
  EPS.
- The stock is cyclical when EPS ≤ 0 in any year of the window, or when at least two of the 7
  pairs (Y−1, Y) inside the window have both EPS > 0 and EPS_Y < 0.7 × EPS_{Y−1}.
- Stored fiscal years start in 2010 at the earliest, so no stock can be judged before May 2015.
- D3 never changes a stock whose sector is Finance, including one that D1's E re-profiled.

The thresholds (0.285, 8 and 5 years, 30%, 3×, 0.15) are fixed here and are not tuned.

**With two methods**, D2's B always takes the heavier one: Heavy takes EV, and Growth with
pe + dcf takes DCF. With equal weights it takes the lower one, so a Financial takes the lower
of P/E and pbj. This is part of the option as written.

### 3.1 The revenue DCF in the backtest

`rdcf(q, { shares: shares_F0, peers })` from engine/rdcf.js, unchanged. q is built from F0:
- **Revenue:** total_revenue_ttm = total_revenue_fy = rev_F0. total_revenue_fy_h =
  `funds.filter(f => f.year <= F0).reverse().map(f => f.rev)`, nulls kept, as the page's
  rdcfFor builds it.
- **Earnings:** net_income_fy_h is built the same way from net income. net_income_ttm = NI_F0,
  which rdcf uses when OI_F0 is missing. oper_income_ttm = OI_F0.
- **Balance sheet and cash flow:**
  - total_debt_fq = st.debt; a missing total debt counts as 0, as `stateAt` sets it.
  - When cash_F0 exists: cash_n_short_term_invest_fq = cash_F0 and net_debt_fq = st.debt −
    cash_F0.
  - Without cash_F0, both fields are left missing. net_debt_fq is not set to total debt,
    because rdcf would then read the cash as 0. rdcf takes net debt = total debt, the cash
    runway is unknown, and its failure probability is 17.5%.
  - free_cash_flow_ttm = FCF_F0. rdcf uses operating income for the burn when FCF is missing.
- **Market:** beta_5_year = beta. Without a beta, rdcf's own 13% applies. close = c0, and
  market_cap_basic = c0 × shares_F0.
- **Identity:** sector and industry as in §1.
- **Forecast and dates:** revenue_forecast_next_fy is missing, so year 1 comes from history
  (3-year CAGR, capped at 30%). This needs revenue > 0 in F0 and in the third stored year
  before it (F0−3 when no year is missing), so no revenue DCF exists before May 2014.
  - The fiscal-period dates are missing, so year 1 is a whole year discounted a whole year
    from May R.
- **When there is no value:**
  - without shares_F0 > 0;
  - for Finance and Biotechnology (rdcf's own rule);
  - with revenue under 1% of market value;
  - when the revenue DCF's `value` is 0 (its raw value ≤ 0). B then uses P/S, and C uses P/S
    alone. The report counts these cases.
  - Every V that enters an error or an IC is therefore > 0, and no floor is applied.

### 3.2 Own-history P/B

The engine's other own-history methods are computed from medians of the stock's monthly
multiples, and pb follows the same pattern:
- **Monthly book value:** each month m in the 60-month window ending May R takes BVPS of the
  fiscal year `stateAt(funds, m)` uses there.
- **Median multiple:** the median of c(m) ÷ that BVPS over the window's months with c(m) > 0,
  BVPS > 0 and c(m) ÷ BVPS ≤ 100. At least 12 months must pass all three tests, counted after
  the ≤ 100 filter as fairValuesAt counts its own multiples.
- **Value:** pb = BVPS_F0 × the median.

## 4. How a decision is made

- **Error:** for a stock-year with fair value V, e = |ln(V ÷ c1)|. This is how far the fair
  value was from the market-adjusted price a year later.
- **Comparison set U_d:** the B0 stock-years where every option of d gives a V > 0, c1 exists,
  and some option X has |V_X ÷ V_A − 1| > 0.005.
  - The set is shared by all of the decision's challengers, so a challenger is also scored on
    stock-years where only another challenger differs from A. There its error equals A's.
  - Stock-years where some options give a V and others don't are left out of U_d, and are only
    reported (§6 Coverage).
  - U_d is kept in row order: stocks in load order (data/fv's symbols.json, then data/fv8's),
    and each stock's years in order.
- **Yearly error:** M_X,y is the median of e over U_d's stock-years of year y under option X.
- **Counted years:** a year counts when U_d holds at least 10 stock-years in it. A decision is
  tested by years when at least 8 years count.
- **Test by years:**
  - For each challenger X: δ_y = M_A,y − M_X,y; positive δ means X is closer to the later
    price.
  - The p-value is the exact one-sided sign-flip over counted years (`signFlipGreater`).
  - Holm across the decision's challengers.
- **Ranking guard (by years only):**
  - IC_X,y is the Spearman correlation over U_d in year y of ln(V_X ÷ c0) with c1 ÷ c0 − 1.
  - A challenger whose mean IC over the counted years is below A's by more than 0.02 is not
    adopted, whatever its error.
- **Price-closeness control:** an option can lower the error just by sitting nearer today's
  price, without carrying any information. So each challenger X is also compared with A↓X,
  which is option A moved toward (or away from) c0 by as much as X is.
  - A↓X's value is c0 × (V_A ÷ c0)^k, where k = median |ln(V_X ÷ c0)| ÷ median |ln(V_A ÷ c0)|.
  - In a test by years, k is computed over U_d's stock-years of each counted year. In a test
    by stocks, it is computed once over all of U_d. k = 1 when the denominator is 0.
  - A↓X keeps A's ranking (the same IC) and takes X's distance from the price.
  - δ*: by years, δ*_y = M_A↓X,y − M_X,y and its mean over counted years. By stocks, the mean
    over stocks of each stock's mean of e_A↓X − e_X. (A test by stocks also prints a yearly
    δ* column with each year's own k, for description only.)
  - δ* > 0 means X's changes carry information beyond moving V toward the price. It is
    reported for every challenger.
- **Adoption:**
  - Eligible challengers have a mean δ > 0, a Holm-adjusted p < 0.05, a mean δ* > 0 and (by
    years) pass the ranking guard.
  - Among them, the one with the largest mean δ is adopted; on a tie, the earlier letter wins.
  - With none, A stays.
- **Fewer than 8 counted years** (expected for D1), the test is by stocks:
  - For each stock with stock-years in U_d (all of them, whatever their year) and each
    challenger, take the mean over those stock-years of e_A − e_X. Stocks with a difference
    of exactly 0 stay in.
  - **p-value:** the exact one-sided sign-flip over stocks (`signFlipGreater`) when there are at
    most 24 stocks.
    - Above 24, a Monte Carlo sign-flip with 200,000 draws: p = (1 + the number of draws
      whose mean is ≥ the observed mean − 1e-12) ÷ 200,001.
    - Each draw takes one rng() per stock, in the order the stocks first appear in U_d, and
      flips that stock's difference when rng() < 0.5.
    - The draws come from one `seededRng(16)` stream, used in the order D1 … D9 and, within a
      decision, challengers B … E. Only these Monte Carlo tests take numbers from it.
  - Holm across challengers.
  - The ranking guard is skipped, since there are too few stocks per year for an IC, and the
    report says so. The price-closeness control is kept.
  - Adoption is as above, with mean δ read as the mean of these per-stock differences.
  - Fewer than 8 stocks: not decidable, A stays, and the result is reported.

## 5. The combination

- **B\*** is B0 with every adopted option. It applies them in this order:
  1. profile (D1's E, then D3);
  2. method values (D1's B, C and D, D5, D6, D8, D9);
  3. weights (D7);
  4. the blend (D2);
  5. D4's replacement of the Unprofitable V.
- **Reported** over the stock-years with a c1 where both B0 and B\* give a V:
  - the pooled median e;
  - the yearly M, over years with at least 10 such stock-years;
  - the mean yearly IC;
  - the naive baseline V = c0 ("today's price is fair").
- **Rule:** if B\*'s pooled median e is higher than B0's, adopted options are removed one at a
  time until it is not.
  - Removal order: the smallest mean δ first; on a tie, the higher decision number.
  - Mean δ from a test by years and from a test by stocks are in different units and are
    compared as they are.
  - Every step is reported.
  - Only the options that remain are applied to the page.

## 6. Reported, not tested

- **Per decision and option:**
  - yearly M, δ, δ*, IC and set sizes;
  - the share of U_d's stock-years, pooled, with e < ln 1.25 (within 25% of the later price);
  - the median signed error ln(V ÷ c1), which shows whether the option is biased high or low;
  - the naive baseline's M over the same U_d.
- **Coverage:**
  - stock-years where options disagree on whether a V exists;
  - for D4, the stock-years where the revenue DCF's value is 0.
- **Horizon (reported only):**
  - U_d is rebuilt with R ≤ 2024, and c2 = c(May R+2) × S(May R) ÷ S(May R+2) takes the place
    of c1. e and M are computed against c2, over years with ≥ 10 stock-years.
  - For each challenger: the mean δ and the unadjusted exact sign-flip p by years.
  - For a decision tested by stocks: the per-stock mean δ and the number of stocks where X is
    better, with no p.
  - No Holm, guard or adoption.
- **Large caps:**
  - Each year, the 300 stock-years with the largest c0 × shares_F0 among all B0 stock-years of
    that year (shares_F0 > 0), whether or not they have a V or a c1.
  - Each decision's U_d is restricted to them and scored by pooled median e.
  - A decision whose adopted option is worse than A on large caps is flagged in the report and
    on the page note, and is still applied.
- **Named stocks** for D1: NYSE:V and NYSE:MA year by year, under every option.
- **The page today (descriptive, no later prices):**
  - How many of today's list stocks each applied option changes, and by how much.
  - It uses the measurement snapshot of 2026-10-22, the `snap` directory of the v24
    measurement, whose file hashes the report lists.
  - It is computed by a script that is committed before it is run. It is written after the
    main run, because it depends on what was adopted.

## 7. Known limits, stated in the report

- **Survivorship:** today's listed stocks only, so companies that died are missing. This
  flatters high fair values for loss-makers (D4) and for falling cyclicals (D3).
- **Price return without dividends,** for both the stocks and SPY: a high-yield stock's c1 is
  lower than its total return, by about the same for every option.
- **Data as of today:** TradingView's current, restated fundamentals; today's sectors and
  industries; today's peer margins in the revenue DCF (look-ahead).
- **No history of analysts' forecasts:** the page's DCF year 1 and the revenue DCF's year 1
  come from history here.
- **Annual figures only:** the page uses the last twelve months.
- **One test date a year,** at the end of May.
- **Year 1 of the revenue DCF** is a whole year discounted a whole year from May.
- **Total equity** includes preferred shares and minority interests, while TradingView's P/B
  and ROE may use common equity. At banks and insurers, preferreds inflate both the NI ÷ EPS
  share count and total equity, which matters for D1's BVPS. ROE here uses average equity over
  two fiscal years.
- **Buybacks** shrink book equity, which inflates ROE or removes BVPS altogether (negative
  equity). Without a cap, P/B from ROE comes to about 15.4 × EPS − 0.385 × BVPS, a fixed
  no-growth P/E, so D1's C is close to a P/E rule for these stocks.
- **D1's E** values high-ROE lenders and insurers partly by a DCF of free cash flow. For them,
  free cash flow moves with deposits and loans; the page does not use it for Financials.
- **US stocks only:** the page also values Tadawul stocks, where none of this was tested, and
  adopted options apply there too. Only D4 keeps P/S on Tadawul.
- **Same stocks every year:** a stock's error persists, so the years are not independent, and
  the yearly sign-flip is somewhat optimistic.
- **Closeness to the price:** the error rewards a fair value that just repeats the price. The
  price-closeness control, the ranking guard and the naive baseline are there for this.
  Options that use today's price directly (such as clamps around it) were left out.
- **Multiple tests:** Holm keeps each decision's false-adoption rate at or below 5%, but there
  is no correction across the nine decisions. If no decision had a real effect, at most 0.45
  false adoptions would be expected. The chance of at least one is at most 45%, and about 37%
  if the decisions were independent.
- **Power:**
  - A decision touching hundreds of stocks a year moves the yearly median almost every year
    when the effect is real. With 14 years, the smallest possible p is 1/16,384.
  - The sign-flip weighs each year's size as well as its sign. In a plain sign test, 12 or
    more good years out of 14 give p < 0.01.
  - D3 has at most 11 years (2015–2025) and D4 at most 12 (2014–2025).
  - D1 touches perhaps 10–20 financials. Its test by stocks can confirm only a large and
    consistent difference.
- **D1's D** gives no value where P/E is missing, so those financials drop out for all of
  D1's options.

## 8. What the page does either way

- **Adopted options** go into the live page's code, marked POST-HOC with this study.
  - D1: ROE is TradingView's return_on_equity; the threshold stays 0.285.
  - D3: the rule uses the fiscal-year EPS history the page has.
  - D4 B or C: the revenue DCF enters the Unprofitable profile's fair value. P/S stays where the
    page has no revenue DCF (Tadawul, Finance, Biotechnology).
  - D7: Graham is already computed on the page (from price_book_fq), so only its weight changes.
  - D8 B: liveDcf's analyst branch uses 9%.
  - D9: it needs book-value history on the page, so `total_equity_fy_h` is added to its batch
    columns.
- **Every decision** gets one line in the page's notes: the option kept or adopted, its error
  against the later price next to option A's, and the naive baseline's.
- **The change log** lists the stocks whose fair value moves by more than 10% (favourites
  first).
- **A decision not adopted** keeps A, and its note says it was tested and kept.
