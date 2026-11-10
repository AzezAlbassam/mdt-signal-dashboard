# Simply Wall St snowflake → TradingView screener columns

_Copied from the 2026-11-08 research run. Section 0 says the checks came from memory: the published
model has since been read (progress/REDESIGN-PLAN.md §1.1 is the authority on the 30 checks); the
column probes below are real._

## 0. Where the check list comes from (read first)

The research step fetched nothing: the GitHub repository timed out and support.simplywall.st
did not resolve. So the 30 check definitions and thresholds below come from my own memory of
SWS's public Company-Analysis-Model and help pages (versions from about 2019 to 2024). All of
them are UNCONFIRMED. Where SWS changed a check over time, I give both versions. Treat every
threshold as a parameter to check against the source once it can be read.

Scoring as I remember it (UNCONFIRMED): each axis scores 0–6, one point per check passed. The
five axis scores make the snowflake's shape, and the total (0–30) sets its colour from red to
green.

The column data comes from 4 `get-symbol-data-batch` calls on AAPL, JPM, O, RIVN, KO, 2222 and
1120 (2026-11-08). A wrong column name does not fail the call. It comes back as `null` for every
symbol.

## 1. What the probe found

### Columns that work (values seen, so the names are real)

| Column | Example values | Note |
|---|---|---|
| `total_current_assets_fq`, `total_current_liabilities_fq`, `total_liabilities_fq`, `total_equity_fq` | AAPL CA 173.9B / CL 169.9B | O (REIT) CA = null: REITs file an unclassified balance sheet |
| `current_ratio_fq` | O 0.515, 1120 0.13 | Has a value for O even though O's CA is null |
| `cash_f_operating_activities_ttm` (and `_fy`) | AAPL 145.1B, RIVN −2.63B | `_fy_h` = null (no operating cash flow history) |
| `interst_cover_ttm`, `interst_cover_fy` (TradingView spells it "interst") | KO 10.8, O 2.31, 2222 28.3, RIVN −12.7 | null for AAPL (no interest expense reported) and for banks. `interest_coverage_*` = null |
| `ebitda_interst_cover_ttm` / `_fy` | KO 11.4, 2222 31.7 | |
| `ebit_ttm` | equals `oper_income_ttm` | null for banks; `ebit_fy` = null |
| `effective_interest_rate_on_debt_ttm` | KO 3.38%, AAPL null | Fallback for interest coverage |
| `total_assets_to_equity_fq` | JPM 13.67, 1120 8.99 | Bank leverage check |
| `return_on_equity` (already in COLS), `return_on_assets`, `return_on_capital_employed_fy`, `return_on_invested_capital` | AAPL 142 / 34.6 / 73.8 / 76.1 | The catalog names `return_on_equity_ttm`, `return_on_assets_ttm` and `return_on_invested_capital_ttm` = null |
| `sloan_ratio_fy` | AAPL 1.08, KO 4.22, JPM 10.6, RIVN −6.99 | Accruals, in % |
| `net_margin_ttm`, `net_margin_fy`, `free_cash_flow_margin_fy` | | |
| `net_income_cagr_5y`, `earnings_per_share_basic_cagr_5y`, `free_cash_flow_cagr_5y`, `total_revenue_cagr_5y` | AAPL NI 6.9%, KO 11.1%, 1120 17.2% | null for loss-makers. `earnings_per_share_diluted_cagr_5y`, `*_cagr_3y` and `total_revenue_FiveYCAGR` = null |
| `earnings_per_share_diluted_yoy_growth_ttm` / `_fy`, `net_income_yoy_growth_fy`, `total_revenue_yoy_growth_ttm` / `_fy` | AAPL EPS TTM +20.3% | The catalog's `*_YoYTTM` / `*_YoYAnnual` names = null |
| `earnings_per_share_forecast_next_fy` / `_next_fh`, `revenue_forecast_next_fy` / `_next_fh` | | Only the NEXT fiscal year. `earnings_per_share_forecast_fy2` = null |
| `price_target_average` (= `price_target_1y`), `price_target_high`, `price_target_low`, `price_target_median`, `price_target_1y_delta`, `recommendation_mark`, `recommendation_total` | AAPL 338 / 405 / 250, 49 analysts; 1120: 14 analysts | `price_target_high_1y` / `_low_1y` = null |
| `dividends_yield` (forward, already in COLS) | KO 2.21, O 5.50, 2222 5.17, 1120 4.89 | `dividends_yield_ttm` = null |
| `dividend_payout_ratio_ttm`, `dividend_payout_ratio_fy` | KO 61.9 / 67.1. **2222: ttm 0 but fy 92.6** | The ttm value is wrong for 2222, so fall back to fy |
| `cash_dividend_coverage_ratio_ttm` | KO 1.42, 2222 1.74 | Definition unclear: it matches neither FCF/dividends nor CFO/dividends. Do not use |
| `neg_total_cash_dividends_paid_ttm` / `_fy` | KO 11.23B ttm / 8.78B fy | The ttm figure can include 5 payments. `_fy_h` = null |
| `dps_common_stock_prim_issue_fy` | | `_ttm` is mostly null, `_YoYAnnual` = null |
| `continuous_dividend_payout` (years paid without a break), `continuous_dividend_growth` (years of consecutive increases) | KO 46 / 45, O 32 / 31, AAPL 15 / 14, 2222 7 / 0, 1120 23 / 0 | |
| `float_shares_percent_current`, `float_shares_outstanding_current`, `total_shares_outstanding` | **2222 float 2.48%** (the state holds the rest), RIVN 65.3% | `insider_ownership` = null |
| `Volatility.W`, `Volatility.M`, `beta_1_year`, `beta_5_year` | | For the risk flags |
| `net_revenue_after_provision_fy` | JPM 167.0B, 1120 43.4B | Banks only |

### History columns (`_fy_h`, newest first, 20 years)

- **Works:** `dps_common_stock_prim_issue_fy_h` (KO and JPM have 20 years, 2222 has 7, RIVN is
  all 0), `free_cash_flow_fy_h`, `total_debt_fy_h` and `total_assets_fy_h`, plus the ones
  already known to work (revenue, net income, diluted EPS, EBITDA, gross profit).
- **null:** `dividends_per_share_fy_h`, `neg_total_cash_dividends_paid_fy_h`,
  `cash_f_operating_activities_fy_h`, `ebit_fy_h`, `non_oper_interest_exp_fy_h`,
  `interest_expense_on_debt_fy_h`, `long_term_debt_fy_h`, `dividend_payout_ratio_fy_h`,
  `net_margin_fy_h`, `return_on_equity_fy_h`, `book_value_per_share_fy_h`,
  `debt_to_equity_fy_h`, `operating_cash_flow_per_share_fy_h`,
  `total_shares_outstanding_fy_h` and `diluted_shares_outstanding_fy_h`. This matches study
  16's finding of no equity, cash or operating income history.

### No column found (all null)

- Interest expense in currency: `interest_expense_fy`, `non_oper_interest_exp_*`,
  `interest_expense_on_debt_ttm`.
- One-off and unusual items: `unusual_expense_inc_fy`, `non_oper_income_*`,
  `pretax_income_fy`.
- Every bank line: `loans_net_*`, `loans_gross_fy`, `total_deposits_*`, `nonperf_loans_fy`,
  `nonperforming_loans_fq`, `loan_loss_allowances_*`, `loan_loss_provision_fy`,
  `provision_*_loan_losses_fy` and `net_interest_income_fy`.
- Non-current totals: `total_non_current_liabilities_fq` and `total_non_current_assets_fq`.
  Long-term liabilities can be derived instead, as `total_liabilities_fq − total_current_liabilities_fq`.
- Insider ownership and insider transactions.
- Analyst forecasts beyond next fiscal year, or a long-term growth rate.

### Industry and market benchmarks

TradingView has no column for these. They have to be built as aggregates over a universe with
`run_screener`, or at build time from the page's stored universe, like `scripts/sector-pe.js`
and `scripts/build-peer-margins.js` already do. The universes are: the US market, the Tadawul
market, the industry within each market, and peers (same industry, closest market value).
Tadawul industries are small, so fall back to the sector, then to the whole market, below about
8 members. That is the same MIN_INDUSTRY idea `sector-pe.js` uses.

## 2. Per-check mapping

Legend: ✅ feasible · ≈ feasible as an approximation (says what differs) · ✗ not possible with
TradingView data.
- "page has" = a value the page already fetches: COLS, H_COLS, or its own fair value / DCF.
- "bench" = a benchmark built as in §1.
- "new" = a column to add (listed in §4).
- Every ratio check returns "no data" (not fail) when an input is null. SWS shows
  "insufficient data" in that case too.

### VALUE (current SWS version, then the legacy checks)

| # | Check (threshold UNCONFIRMED) | US | Tadawul | Columns | Formula | Fallback / reason |
|---|---|---|---|---|---|---|
| V1 | Below fair value: price < SWS DCF value | ≈ | ≈ | page has: `close` + the page's own fair value (DCF / blend) | `close < fair` | SWS's DCF is a 2-stage FCFE model with 10 years of analyst or extrapolated cash flow and a CAPM discount rate. Banks use excess returns, REITs use AFFO. The inputs are not on TradingView, so the page's own fair value stands in. Different number, same test |
| V2 | Significantly below fair value: ≥ 20% under | ≈ | ≈ | same | `close ≤ 0.8 × fair` | as V1 |
| V3 | P/E vs peers: P/E < peer average | ≈ | ≈ | page has `price_earnings_ttm`, `industry`, `market_cap_basic`; bench peers | `pe < mean(pe of the 4 industry peers closest in market value)` | Peers are built with run_screener. Loss-makers use P/S (`price_sales_current`), banks use P/B (`price_book_fq`). Tadawul: sector peers when the industry has fewer than 5 |
| V4 | P/E vs industry: P/E < industry average | ✅ | ≈ | page has `price_earnings_ttm` + SECTOR_PE (industry P/E = Σ market value ÷ Σ net income of profitable members) | `pe < industryPE` | SECTOR_PE is US only today. Tadawul needs the same aggregate per sector |
| V5 | P/E vs "fair P/E ratio" | ✗ | ✗ | — | — | The fair ratio is SWS's own regression (growth, margins, risk, size, industry). It cannot be reproduced. Fallback: legacy V5L (P/E vs market) or the page's Lynch P/E = growth rule |
| V6 | Analyst price target: consensus ≥ 20% above the price, and analysts agree | ✅ | ✅ (when covered) | new: `price_target_high`, `price_target_low`, `recommendation_total`; page has `price_target_1y` | `price_target_1y / close − 1 ≥ 0.20` and `(high − low) / price_target_1y < k` (k UNCONFIRMED; SWS uses a standard deviation, which TradingView does not give, so the range stands in) and `recommendation_total ≥ 2` | Small Tadawul stocks have no coverage, so "no data" |
| V5L | Legacy: P/E < market P/E | ✅ | ✅ | `price_earnings_ttm`; bench market P/E (US, Tadawul) | `pe < marketPE` | |
| V6L | Legacy: PEG between 0 and 1 (forecast growth) | ≈ | ≈ | page has `price_earnings_ttm`, `earnings_per_share_fy`, `earnings_per_share_forecast_next_fy` | `g = epsF/eps − 1` (eps > 0); `PEG = pe / (100·g)`; pass if 0 < PEG < 1 | SWS uses 1–3 year growth; TradingView gives 1 year. **Do not use `price_earnings_growth_ttm`**: it divides by TRAILING TTM EPS growth (AAPL 38.15 / 20.3 = 1.86 = the column), not forecast growth |
| V3L | Legacy: P/B < industry P/B | ✅ | ≈ | page has `price_book_fq`; bench industry P/B (Σ market value ÷ Σ equity, which needs `total_equity_fq`) | `pb < industryPB` | |

### FUTURE GROWTH (all analyst forecasts; SWS uses 1–3 years, TradingView has next FY only)

| # | Check | US | Tadawul | Columns | Formula | Fallback / reason |
|---|---|---|---|---|---|---|
| F1 | Forecast earnings growth > savings rate | ≈ | ≈ | page has `earnings_per_share_forecast_next_fy`, `earnings_per_share_fy` | `gE = epsF/eps − 1 > savingsRate` | 1-year growth instead of SWS's 1–3 year rate. The savings rate is a per-market constant (UNCONFIRMED; SWS shows its own value, so use the 10-year government yield, about 4% US and about 5% KSA, until confirmed). eps ≤ 0: undefined, so pass only if `epsF > 0` (forecast to become profitable). That loss-maker rule is UNCONFIRMED. Per-year forecasts may be available from the separate `mcp-tv-get-forecasts` tool (not probed; one extra call per stock) |
| F2 | Earnings growth > market's forecast growth | ≈ | ≈ | same + bench `marketGE = Σ(epsF·shares) / Σ(eps·shares) − 1` over profitable stocks | `gE > marketGE` | |
| F3 | High-growth earnings: > 20% a year | ≈ | ≈ | same | `gE > 0.20` | 1-year growth is noisier than SWS's multi-year rate: 2222 shows +36% from an oil rebound |
| F4 | Revenue growth > market's revenue growth | ≈ (✗ banks) | ≈ (✗ banks) | page has `revenue_forecast_next_fy`, `total_revenue_fy`; bench | `gR = revF/rev − 1 > marketGR` | **Banks: the bases differ.** JPM forecast 208B vs total_revenue_fy 279B. 1120: 43.45B vs 71.8B, though its `net_revenue_after_provision_fy` of 43.4B matches. Use "no data" for the Finance sector |
| F5 | High-growth revenue: > 20% a year | ≈ | ≈ | same | `gR > 0.20` | as F4 |
| F6 | Future ROE in 3 years > 20% | ≈ | ≈ | page has `earnings_per_share_forecast_next_fy`, `close`, `price_book_fq` | `epsF / (close / price_book_fq) > 0.20` | 1-year forward EPS over today's book value instead of SWS's 3-year forecast. No column needed: book value per share = close ÷ P/B |

### PAST PERFORMANCE (current version, then legacy)

| # | Check | US | Tadawul | Columns | Formula | Fallback / reason |
|---|---|---|---|---|---|---|
| P1 | High-quality earnings (no large one-off items) | ≈ | ≈ | new: `sloan_ratio_fy` (or page has `net_income_ttm` + new `cash_f_operating_activities_ttm`) | pass if `abs(sloan) < 10` (%) | TradingView has no one-off or unusual items line (all probes null), so SWS's own test is ✗. An accruals proxy stands in. Banks: the Sloan ratio means little (JPM 10.6), so report "no data" for Finance |
| P2 | Profit margin higher than a year ago | ✅ | ✅ | page has H_COLS `net_income_fq_h`, `total_revenue_fq_h` | `Σ NI[0..3] / Σ Rev[0..3] > Σ NI[4..7] / Σ Rev[4..7]` | Fallback: the `_fy_h` index 0 vs 1 |
| P3 | Earnings trend: 5-year growth > 0 | ✅ | ✅ | page has `net_income_fy_h` (alt: new `net_income_cagr_5y`) | `(NI[0]/NI[5])^(1/5) − 1 > 0`, both > 0 | Loss in either year: SWS reports "unprofitable", so fail. The column is null for RIVN anyway |
| P4 | Accelerating: last year's growth > 5-year average | ✅ | ✅ | page has `net_income_fq_h` (TTM vs TTM a year ago) + P3 | `Σ NI[0..3] / Σ NI[4..7] − 1 > P3 rate` | Needs a positive base. Alt column: `net_income_yoy_growth_fy` (annual) |
| P5 | Earnings growth vs industry | ≈ | ≈ | P4 + bench industry TTM NI growth (Σ NI now ÷ Σ NI a year ago, members profitable both times) | `g1 > industryG1` | Bench only. Tadawul by sector |
| P6 | High ROE: > 20% | ✅ | ✅ | page has `return_on_equity` | `roe > 20` | ROE does not suit REITs (O 3.5) or banks; SWS applies it anyway |
| P5L | Legacy: ROA > industry ROA | ✅ | ≈ | new `return_on_assets`; bench | `roa > industryROA` | |
| P6L | Legacy: ROCE higher than 3 years ago | ✗ (≈ proxy) | ✗ (≈) | `return_on_capital_employed_fy` (today only) | — | No EBIT, equity or current-liabilities history. Proxy: `ebitda_fy_h[0] / total_assets_fy_h[0] > ebitda_fy_h[3] / total_assets_fy_h[3]` |

### FINANCIAL HEALTH: non-financial companies

| # | Check | US | Tadawul | Columns | Formula | Fallback / reason |
|---|---|---|---|---|---|---|
| H1 | Short-term assets > short-term liabilities | ✅ | ✅ | new `total_current_assets_fq`, `total_current_liabilities_fq` | `CA > CL` | CA null (REITs such as O): new `current_ratio_fq > 1` |
| H2 | Short-term assets > long-term liabilities | ✅ | ✅ | new `total_liabilities_fq` + H1 | `CA > TL − CL` | CA null: "no data". Probe: KO fails (33.3B vs 44.2B), AAPL, RIVN and 2222 pass |
| H3 | Net debt to equity < 40% | ✅ | ✅ | page has `net_debt_fq`; new `total_equity_fq` | `net_debt / equity < 0.40` (net cash passes) | AAPL 26%, KO 63%, O 77%, 2222 6% |
| H4 | Debt to equity lower than 5 years ago | ≈ | ≈ | H_COLS + new `total_debt_fy_h`, `total_assets_fy_h` | proxy: `debt[0]/assets[0] < debt[5]/assets[5]` | Equity history is null, so the exact D/E trend is ✗. Debt to assets stands in (AAPL 21% vs 39%, so it passes). No debt 5 years ago and none now: pass |
| H5 | Operating cash flow > 20% of debt | ✅ | ✅ | new `cash_f_operating_activities_ttm`; page has `total_debt_fq` | `CFO / debt > 0.20` (no debt: pass) | AAPL 169%, KO 39%, O 12% (fail), 2222 140% |
| H6 | EBIT > 5× interest | ✅ | ✅ | new `interst_cover_ttm` | `cover > 5` | null (AAPL): `oper_income_ttm / (effective_interest_rate_on_debt_ttm/100 × total_debt_fq)`. If that is null too: "no data" (SWS shows "earns more interest than it pays" for AAPL; UNCONFIRMED) |
| H5u | Unprofitable: cash runway > 1 year at current FCF | ✅ | ✅ | page has `cash_n_short_term_invest_fq`, `free_cash_flow_ttm` | `cash / −FCF > 1` when FCF < 0 | RIVN 1.31 years. The page already has a runway tile |
| H6u | Unprofitable: runway > 1 year if FCF keeps its historical trend | ✅ | ✅ | new `free_cash_flow_fy_h` | grow −FCF at its 3–5 year rate, cumulate until cash runs out | |

### FINANCIAL HEALTH: banks (sector Finance, bank industries; SWS swaps the checks)

| # | Check | US | Tadawul | Columns | Formula | Fallback / reason |
|---|---|---|---|---|---|---|
| B1 | Assets to equity ≤ 20× | ✅ | ✅ | new `total_assets_to_equity_fq` | `≤ 20` | JPM 13.7, 1120 9.0 |
| B2 | Allowance for bad loans ≥ 100% of bad loans | ✗ | ✗ | — | — | No loan-loss allowance or non-performing-loan column (all probes null) |
| B3 | Bad loans ≤ 2% of loans | ✗ | ✗ | — | — | No NPL or loans column |
| B4 | Low-risk funding: deposits ≥ 50% of liabilities | ✗ | ✗ | — | — | No deposits column |
| B5 | Loans to assets ≤ 110% (UNCONFIRMED) | ✗ | ✗ | — | — | No loans column |
| B6 | Loans to deposits ≤ 125% (UNCONFIRMED) | ✗ | ✗ | — | — | No loans or deposits column |

- Banks therefore score at most 1 out of 6 on Health from this data.
- Option: show the axis as "partial (1 of 6 checks available)" instead of 1/6. Otherwise every
  bank looks unhealthy.
- An untested option: the separate `mcp-tv-get-financials` tool may carry the bank lines. It was
  not probed here.

### DIVIDEND

| # | Check | US | Tadawul | Columns | Formula | Fallback / reason |
|---|---|---|---|---|---|---|
| D1 | Notable: yield > bottom 25% of the market's payers | ✅ | ✅ | page has `dividends_yield`; bench P25 of `dividends_yield > 0` per market | `y > P25` | Bench via run_screener (US, TADAWUL) |
| D2 | High: yield > top 25% of payers | ✅ | ✅ | same, P75 | `y > P75` | |
| D3 | Stable: paid every year for 10 years, no big cut | ✅ | ✅ | new `dps_common_stock_prim_issue_fy_h` (alt: new `continuous_dividend_payout ≥ 10` for the "every year" part) | all of `dps[0..9] > 0` and no year with `dps[i]/dps[i+1] − 1 < −x` (x UNCONFIRMED, about 10%) | 2222: 7 years, so it fails. 1120: cut 1.81 → 1.67, so it fails. Tadawul DPS is adjusted for bonus shares (fractional values), which is fine |
| D4 | Growing: DPS higher than 10 years ago | ✅ | ✅ | same | `dps[0] > dps[10]` | `continuous_dividend_growth` is consecutive years, a stricter idea, so do not use it for this check |
| D5 | Earnings coverage: payout < 90% (now and in 3 years) | ✅ / ≈ | ✅ / ≈ | new `dividend_payout_ratio_ttm`, `dividend_payout_ratio_fy`; page has `earnings_per_share_forecast_next_fy`, `close`, `dividends_yield` | now: `payout < 90` (use the ttm value, but the fy value when ttm is 0 or null and the yield > 0, as for 2222). Future: `(y/100·close) / epsF < 0.90` | Future payout uses next FY instead of 3 years. O: 224%, so it fails (REIT earnings; SWS fails it too, as I remember) |
| D6 | Cash-flow coverage: cash payout < 90% | ✅ | ✅ | new `neg_total_cash_dividends_paid_fy`; page has `free_cash_flow_ttm` (or new `free_cash_flow_fy_h[0]`) | `divPaid_fy / FCF_fy < 0.90` | Use FY over FY: the ttm dividends paid can hold 5 payments (KO ttm 11.2B vs fy 8.8B). Banks: FCF = CFO, so "no data". Probe: KO 79%, O 76%, AAPL 12%, 2222 about 102% (fail) |

### Risk and reward flags (outside the snowflake, but on the same SWS page)

| Flag | Columns | Rule (UNCONFIRMED) |
|---|---|---|
| High debt | H3 | ND/E > 40% |
| Interest not well covered | H6 | cover < 5× (3× in older versions) |
| Dividend not covered | D5, D6 | payout > 90% / cash payout > 90% |
| Unstable dividend | D3 | |
| Less than 1 year of cash runway | H5u | |
| Earnings forecast to decline | F1 | `epsF < eps` |
| Profit margins lower than last year | P2 | |
| Shareholders diluted in the past year | page has `net_income_fq_h`, `earnings_per_share_diluted_fq_h` | shares = NI ÷ EPS (as study 16 does), TTM vs a year earlier, > a few % |
| Share price volatile | new `Volatility.W` + market median | weekly volatility above the market's (SWS compares it with market and industry) |
| Large one-off items | ✗ | no column |
| Significant insider selling | ✗ | no insider transactions in TradingView data |
| Unprofitable / revenue < $1m / small market cap | page has `net_income_ttm`, `total_revenue_ttm`, `market_cap_basic` | |
| Ownership (state / insiders) | new `float_shares_percent_current` | closely held = 100 − float (2222: 97.5% held, mostly the state) |

## 3. Summary of feasibility

- **Feasible as SWS defines it (15):** V4, V6, P2, P3, P4, P6, H1, H2, H3, H5, H6, D1–D4, plus
  the unprofitable runway pair. D5 and D6 work with the noted fallbacks.
- **Approximations (about 10):** V1, V2 (the page's own fair value); V3, P5 (benchmarks to
  build); F1–F6 (1-year forecasts instead of 1–3 years; banks have no revenue forecast base); P1
  (Sloan instead of one-off items); H4 (debt to assets instead of D/E).
- **Not possible with TradingView data:** V5 (SWS's own fair P/E model); bank health B2–B6 (no
  loans, deposits or NPL lines); one-off items; insider transactions; forecasts beyond next FY
  (unless `mcp-tv-get-forecasts` covers it, untested); ROCE history.
- **Tadawul:** the same as the US, except:
  - Benchmarks need Tadawul aggregates, and the industries are too small, so use sectors.
  - Small caps have no analyst coverage, so the Future checks and V6 show "no data".
  - `dividend_payout_ratio_ttm` can be 0 when it should not be (2222), so use the fy fallback.
  - Saudi banks: only B1 works.

## 4. New columns for the page

These are not in `COLS` today.

**Quote batch (`COLS`), 20 columns:**
```
total_current_assets_fq, total_current_liabilities_fq, total_liabilities_fq, total_equity_fq,
current_ratio_fq, cash_f_operating_activities_ttm, interst_cover_ttm,
effective_interest_rate_on_debt_ttm, total_assets_to_equity_fq, return_on_assets,
sloan_ratio_fy, dividend_payout_ratio_ttm, dividend_payout_ratio_fy,
neg_total_cash_dividends_paid_fy, price_target_high, price_target_low, recommendation_total, float_shares_percent_current,
Volatility.W, net_income_cagr_5y
```

- `net_income_cagr_5y` is optional: P3 can be computed from `net_income_fy_h` instead.
- `return_on_assets` is only for the legacy P5L check.
- `Volatility.W` is only for the risk flag.
- Left out on purpose: `continuous_dividend_payout` / `continuous_dividend_growth`. D3 and D4
  use the DPS history instead.

**History batch (`H_COLS`, fetched per stock), 4 columns:**
```
dps_common_stock_prim_issue_fy_h, free_cash_flow_fy_h, total_debt_fy_h, total_assets_fy_h
```

**Not needed as columns:**
- Book value per share = `close / price_book_fq`.
- Last year's and 5-year earnings growth come from the existing `net_income_fq_h` /
  `net_income_fy_h`.
- Future ROE, forecast growth and PEG come from columns the page already has.

**Not columns (benchmarks to build per market, US and TADAWUL):**
- Market P/E, industry P/E (SECTOR_PE exists for the US) and industry P/B.
- Peers' P/E.
- Market forecast EPS and revenue growth.
- Industry last-year earnings growth and industry ROA.
- Dividend-yield P25 and P75 among payers.
- Median weekly volatility.
- The savings rate per market (a constant).
