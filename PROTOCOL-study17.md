# Study 17 — who climbs the top of the US market, and can anyone tell in advance — pre-registered

**Written 2026-10-23, before any predictor below has been computed and before the data for
the companies that no longer trade has been collected.** The user asked: the five to ten
largest US companies keep changing (a newcomer enters, #7 becomes #2, with 5–7× returns):
what are the odds, and what "algorithm" predicts the next climbers? This study measures the
odds over 2015–2026 without survivorship bias, then tests the four rules people most often
reach for. Nothing here changes after results exist; a bug found later is fixed, marked
post-hoc, and shown with numbers before and after.

**Already known before this protocol (stated so nobody reads hindsight into it):**
- A survivor-only prototype (December close × net income ÷ diluted EPS of the same fiscal
  year, files already on disk) printed the top 25 of 2015 and 2025 and the 100th-largest
  value of each year (2015 $41B … 2025 $117B). It was used only to set the flag threshold
  for which dead companies to research. No predictor or outcome correlation was computed.
- Who reached the top 10 by 2025 is public knowledge (Nvidia, Broadcom, Tesla, Eli Lilly…).
  The tests below are about rules applied to every company, not about naming those.
- Studies 9 and 14 tested return predictors on today's 815 listed stocks: net share issuance
  confirmed (+1.9% a year among large caps); 12-1 momentum (−0.7%), the 52-week high and
  gross profitability not confirmed. A change in market value = price return + net issuance,
  so this study's outcome overlaps theirs; what is new is the universe (the largest
  companies at each date, dead ones included) and the two growth rules (G, M) people use for
  "the next giant".

## 1. Data

- **Membership.** A company is a *US company* at a date when it is an S&P 500 member that
  day (fja05680/sp500 on GitHub, "S&P 500 Historical Components & Changes (Updated).csv",
  daily lists since 1996, last row 2026-08-18; saved as `data/caps/sp500-history.csv`), so
  S&P's own domicile rule decides (Accenture, Medtronic, Allergan count), **or** when it is
  not a member but TradingView gives its country as United States and its primary listing is
  NYSE, NASDAQ or NYSE American (Tesla before December 2020, VMware, SpaceX). Foreign
  companies listed in the US (TSMC, ASML, Shopify, Novo Nordisk) are out. For 2026, members
  are those of the last row.
- **One company, one row.** Share classes with identical fiscal net income series
  (GOOG/GOOGL, BRK.A/BRK.B, FOX/FOXA, NWS/NWSA) are one company, valued with the price and the
  EPS of the same class (each class's own price × its own net income ÷ EPS gives the same
  total), the alphabetically first ticker. A company that changed ticker
  (FB → META, ANTM → ELV, UTX → RTX after 2020-04-03) is one company. Mergers create no
  continuity: the acquired company ends, the acquirer continues (DowDuPont's three
  successors start at their own listing dates).
- **Market value at a December close.** cap(Y) = December-Y monthly close (TradingView,
  split-adjusted, no dividend adjustment) × shares(Y), shares(Y) = net income ÷ diluted EPS of
  the fiscal year labelled Y (`parseFundamentals`), a weighted-average diluted count. When the
  year's count is missing or the signs disagree, the nearest labelled year with a count is
  used (the earlier one on a tie) and the row is flagged. Error of this convention: a
  company buying back 4% a year is overstated by up to ~2–4% at a December close; checked in
  V1 (§5).
- **2026 point.** TradingView's `market_cap_basic` from the screener snapshot of 2026-10-23
  (`data/caps/screener-2026-10-23.json`, all US-listed stocks ≥ $20B), for the descriptive
  tables only (no test uses 2026).
- **Companies that no longer trade.** TradingView keeps monthly bars for some delisted
  symbols (Activision does, Celgene does not) and no fundamentals for any of them. For every
  company that was a member at some December close 2015–2025, no longer trades, and could
  have been among the 200 largest — a December value of at least 75% of the survivor-only
  prototype's 200th value that year: 2015 $15B, 2016 $17B, 2017 $20B, 2018 $18B, 2019 $24B,
  2020 $29B, 2021 $36B, 2022 $30B, 2023 $35B, 2024 $39B, 2025 $42B, judged first from the
  researchers' estimates and generous by design — the
  December close comes from TradingView when served, else a cited web source, and shares
  from the 10-K/10-Q cover page nearest the date. Two independent researchers derive each
  value; a disagreement above 10% is resolved with sources and noted. These values are
  saved with their sources in `data/caps/dead.json` and are the only hand-copied numbers in
  the study. Companies whose researched value is below the year's 200th cap simply never
  enter the universe that year.
- **Fiscal-year revenue** (for G and V): the same fiscal-year files. Dead companies have none,
  so they are missing from G and V (counted in the report).
- **Sector:** TradingView's sector; Finance is excluded from V only.
- **Implementation:** `engine/caps.js` (committed with this protocol) and
  `scripts/study17-run.js`, committed before the first run; any change after the first run
  is post-hoc.

## 2. Universe and outcome

- **U(Y):** the 200 largest US companies by cap(Y) at the December close of year Y.
- **Outcome (tests):** g1 = ln(cap(Y+1) ÷ cap(Y)), one year, for Y = 2015 … 2024 (ten
  non-overlapping years). A company that stops trading before December Y+1 has no g1 and is
  left out of that year's correlation (number and names reported per year, so the reader
  sees what leaving out acquisitions does). g1 uses cap(Y+1) whether or not the company is
  still a US company at Y+1 (membership only decides U(Y)).
- **Ranks** for the descriptive part are taken over all US companies with a cap at that
  date (not only U(Y)).

## 3. The four rules tested

All values use only what was known at the December close of Y.

| | Rule (higher = predicted to climb) | Value at December Y | Years Y |
|---|---|---|---|
| M | Momentum of market value ("climbers keep climbing") | ln(cap(Y) ÷ cap(Y−1)), both present | 2016–2024 (9) |
| G | Revenue growth ("fast growers become giants") | ½·ln(rev(FY Y−1) ÷ rev(FY Y−3)), both > 0 | 2015–2024 (10) |
| S | Smaller within the top 200 ("the top dog slows") | −ln cap(Y) | 2015–2024 (10) |
| V | Sales yield ("the cheap catch up") | rev(FY Y−1) ÷ cap(Y), rev > 0; not Finance | 2015–2024 (10) |

FY Y−1 (not Y) because a fiscal year labelled Y is reported after the December close.

## 4. Hypotheses

For each rule and year, **IC** = Spearman correlation between the rule's value and g1 over the
companies of U(Y) having both. A year counts when at least 100 companies have both.

- **H_k (k = M, G, S, V):** the mean IC over the counted years is above zero. p-value: exact
  one-sided sign-flip over years (`signFlipGreater`); Holm over the four. Confirmed when mean
  IC > 0 and the adjusted p < 0.05.
- **Power, stated before the run:** with 9–10 yearly values the smallest one-sided p is
  1/512 or 1/1024, so after Holm a rule must be positive in nearly every year to confirm. A
  real but modest edge (IC ≈ +0.05 with a yearly spread of 0.15) gives t ≈ 1.0: "not
  confirmed" is the expected outcome even if such an edge exists.

## 5. Reported, not tested

Data checks:
- **V1:** for companies trading today, today's close × the latest fiscal year's count vs
  TradingView's `market_cap_basic` (median absolute % gap; every gap above 15% listed).
- **V2:** each year's computed top 10 against year-end top-10 lists found by search (each
  difference explained or listed as unexplained).
- **V3:** for every dead company, the two researchers' values and the resolution.

Base rates (the user's question about odds), over the December closes 2015–2025 (the 2026
point is ten months past December 2025, so it appears only in the top-10 lists and the
entrants table):
- transition shares: from rank bucket 1–10, 11–20, 21–50, 51–100, 101–200 at Y, the share
  found in the top 10 / 11–20 / 21–50 / 51–100 / 101–200 / below 200 / no longer trading at
  Y+1, Y+3, Y+5 and Y+10 (pooled over every start year that has the horizon);
- the top 10 of each year and how many of year Y's top 10 are still there at Y+5 and Y+10;
- every company that entered the top 10 (and the top 20) at some date: its rank 1, 3 and 5
  years earlier;
- multi-baggers: companies of U(Y) with cap(Y+5) ÷ cap(Y) ≥ 3 and ≥ 5 (Y = 2015 … 2020),
  listed, and their rank at Y;
- the largest company each year: its g1 against the median g1 of ranks 2–100; the top 10's
  median g1 against ranks 11–100;
- for the companies that tripled within 5 years, their M, G, S and V percentiles at the start
  against everybody else's (the "it was obvious in hindsight" table: how many others looked
  the same and did not climb);
- the four ICs on the 3-year outcome ln(cap(Y+3) ÷ cap(Y)), Y = 2015 … 2022 (overlapping, no
  p-value) and per year;
- every base rate again with the dead companies removed (what survivorship would have done).

Known limits, stated in the report: price-only data (dividends ignored, which matters for
"returns" shown on the page, not for ranks); weighted-average share counts; TradingView's
current restated fundamentals; hand-researched values for dead companies; S&P membership
as the US filter means a non-member's country is today's TradingView country; ten years is
one market regime (falling then near-zero rates, then the AI boom).

## 6. What the page does either way

- The dashboard (ranks 2015–2026, rank changes, market-value multiples, price returns) is
  descriptive and shown regardless, with the data limits above.
- A confirmed rule may be shown per company with the test's numbers. An unconfirmed rule is
  shown only as "tested, did not beat chance", never as a prediction.
- The second page (technologies people may be overlooking) is research, not a test; it is
  labelled as such, and every claim on it carries a source.
