# Shariah screen and purification (Al Rajhi method) — plan

Written 2026-11-20, before any verdict or purification figure has been computed. The owner asked for:
every stock on the dashboard marked permissible or not with its purification amount, a separate section
for ETFs (holdings, weights, look-through purification), figures that update as soon as new quarterly
statements arrive, and a plan with no room for error and an independent reviewer. Implementation starts
when the owner says so (he wants it run on Opus 5.5). Resume from the first unchecked step.

This tool applies a published method mechanically. It is not a fatwa; the page must say so.

## A. The rules, as written by Al Rajhi Capital's Shariah group

Sources (read in full on 2026-11-20):
- AR: https://alrajhi-capital.sa/-/media/Feature/AlRajhiCapital/PDFs/Shariah-groups/Shariah-Regulations/AR/6-The-Mechanism-for-Calculating-The-Prohibited-Income-AR.pdf
- EN: https://alrajhi-capital.sa/-/media/Feature/AlRajhiCapital/PDFs/Shariah-groups/English/Mechanism-for-disposing-of-the-illicit-element.pdf

- R1 (activity). The rules below are for "type three": companies whose objectives and activities are
  permissible but with some illicit dealings (interest-bearing lending or borrowing). The definitions of
  types one and two are in another Al Rajhi document, NOT yet read (step 0.1).
- R2 (debt). Interest-bearing borrowing, long or short term, must not exceed 30% of total market value,
  "unless it is below book value"; market value is its average for each quarter of the year.
- R3 (illicit revenue). Revenue from an illicit element must not exceed 5% of the company's total revenue,
  whatever its source (interest-bearing investment, an illicit activity, owning something illicit, other).
  Undisclosed revenue is estimated on the cautious side.
- R4 (change). If a company stops meeting the rules, sell as soon as possible, within 90 days of knowing.
- R5 (statements). Use the nearest issued statements: annual, quarterly or monthly, audited or not.
- R6 (purification). Owed by whoever owns the shares when the final statements (quarterly or annual) are
  issued, dividends or not, investing or trading; not owed by someone who sold before they were issued.
  Amount = total illicit revenue ÷ number of the company's shares × shares owned. The whole illicit revenue
  is disposed of, whether the company made a profit or not; if not known exactly, estimate so as to be
  acquitted. Document's example: 1,000 ÷ 100,000 = 0.01 per share; × 2,000 shares = 20.
- R7. The amount goes to charity; it may not be counted as zakat, tax or alms.

Nothing in these two documents covers ETFs. The ETF section (part E) is our extension of R6 by look-through,
and the fund verdict rule is the owner's own; both are labelled as such on the page.

## B. Definitions (each one is confirmed or corrected in step 0 before any code)

| Item | Definition | Cautious choice when ambiguous |
|---|---|---|
| Activity verdict | From Al Rajhi's type definitions (step 0.1) mapped to TradingView sector/industry; a reviewed table in the repo | An industry not in the table = "يحتاج مراجعة", never "حلال" |
| Interest-bearing debt | Total debt of the latest quarter (`total_debt_fq`) | Includes leases and any debt we cannot prove is Islamic (overstates, never understates) |
| Market value | Average of daily close × shares outstanding over the statement's quarter | — |
| R2 denominator | Average market value; if it is below book value, book value | Ambiguity A1: "book value" of equity or of assets. Compute both; the verdict uses equity (stricter) |
| Illicit revenue | Interest and investment income of the period (exact TradingView/statement field found in step 0.2) + revenue of illicit segments when disclosed | Segment revenue is usually not in the data: an industry known to have such segments gets "يحتاج مراجعة" |
| Total revenue | Total revenue of the same period (`total_revenue_fq`, and TTM) | — |
| Purification per share | Illicit revenue of the latest issued quarter ÷ shares outstanding | Shown per quarter, per share, and as % of price; never annualised silently |
| Who owes it | Holder on the date the statements were issued | The page shows the statement period and the next report date |

Verdict states (exactly four, no others): `حلال (نقي)` type one if the document defines it and data shows no
illicit element; `مختلط جائز` passes R1–R3, purification shown; `غير جائز` fails any of R1–R3, with the
failing rule named; `ما ينحكم` any input missing. A missing input never produces a pass.

## C. Step 0 — data and document gate (no code before this passes)

- [ ] 0.1 Read every document in Al Rajhi Capital's Shariah regulations folder (types one/two/three, funds,
      ETFs if any, their published lists of compliant companies for Saudi and US markets). Quote the rules
      into part A. If Al Rajhi publishes a compliant list, it becomes the authority for those stocks and our
      computation is shown beside it, not instead of it.
- [ ] 0.2 TradingView fields: `get-screener-columns search=interest` (and `non_oper`, `invest`) to find the
      interest-income field, its `_fq`, `_ttm`, `_fq_h` forms; confirm `total_debt_fq`, `total_equity_fq`,
      `total_assets_fq`, `total_shares_outstanding`, `fiscal_period_end_fq`, `earnings_release_date`,
      `earnings_release_next_date`, `sector`, `industry`. Record coverage on the dashboard's lists: share of
      US and Tadawul stocks with every field present.
- [ ] 0.3 Second source for the same numbers (FMP `statements` income statement and balance sheet): for 10
      stocks, interest income, total debt, revenue and shares agree with TradingView within 1%, or the
      difference is explained (field definition) and written here.
- [ ] 0.4 ETF holdings source, tested on SMH, SOXX, XLE, XLK, SPY, QQQ: full list with weights and an
      as-of date. Try in order: a TradingView tool if one exists; FMP; the issuers' own files (VanEck,
      iShares, State Street, Invesco; hosts need allowing); SEC N-PORT (quarterly, official). Weights must
      sum to 100% ± 0.5%. Record which source works for which fund and how stale it can be.
- [ ] 0.5 How fast TradingView shows a new quarter: for 5 companies that reported in the last 10 days,
      compare `fiscal_period_end_fq` with the report date. Write the measured lag on the page's note.
- [ ] 0.6 Quota: count the calls a full refresh needs (batch of 50 symbols) and keep the daily total under
      the plan's limit; the free limit ran out on 2026-11-20 after about a day's normal use.

Gate G0: 0.1–0.6 written into this file with the evidence. Any field that does not exist → the affected
rule shows `ما ينحكم` for every stock and the owner is told before going on.

## D. Stocks

- [ ] D1 `engine/shariah.js`: pure functions `debtRatio`, `illicitShare`, `purificationPerShare`,
      `verdict(inputs) → {state, failed:[rule], numbers, period}`; no network, no dates from the clock.
- [ ] D2 `test/shariah.test.js`: the document's example (1,000 / 100,000 × 2,000 = 20); thresholds exactly
      at 30% and 5% (equal passes: "must not exceed"); market value below book value; each missing input →
      `ما ينحكم`; negative or zero revenue; a loss-making company still owes purification.
- [ ] D3 Page: a chip on each row (four states), and a panel block "الشرعية والتطهير (طريقة الراجحي)" with
      the three tests, their numbers and thresholds, the statement period used, purification per share for
      that quarter, a box "كم سهم عندك؟" → amount, who owes it (R6), and the disclaimer. Arabic, phone first.
- [ ] D4 Updating: computed on every load from the live fields, so a new quarter shows as soon as
      TradingView has it. `sh/<sym>` in the db keeps {period, state, numbers, seenAt}; when the period or
      the state changes the row shows "تحديث جديد" and the change is logged (R4's 90 days start at seenAt).

## E. ETFs (our extension; labelled on the page)

- [ ] E1 `etf/<sym>` in the db: {as_of, source, holdings:[{sym, weight}]}; refreshed weekly by the routine
      and on demand; the page shows the as-of date and refuses holdings older than 100 days.
- [ ] E2 New tab "الصناديق": the owner adds a fund; the page loads its holdings, runs D1 on each holding
      with the same live fields, and shows the table (holding, weight, state, illicit share, purification).
- [ ] E3 Fund numbers: weight of `غير جائز` holdings, weight of `ما ينحكم` holdings, look-through illicit
      revenue = Σ wᵢ × illicitᵢ ÷ revenueᵢ, purification per quarter as % of the amount invested
      = Σ wᵢ × illicit revenueᵢ ÷ market valueᵢ (R6 applied to the shares held through the fund).
- [ ] E4 Fund verdict, the owner's rule (2026-11-20: "if the total is below 5% it is permissible"):
      pass when the weight of `غير جائز` holdings is below 5%; `ما ينحكم` when unknown-weight holdings are
      5% or more; the look-through illicit revenue is shown beside it. Ambiguity A5 below must be confirmed.
- [ ] E5 Not computed in v1, said on the page: the fund's own interest on cash and securities-lending
      income (from the fund's annual report).

## F. Review gates (a step is done only when its gate passes; failures are fixed, never waived)

- G1 Method review: an independent reviewer agent gets ONLY the two Al Rajhi PDFs and `engine/shariah.js`
  (not this plan, not my reasoning) and must restate each rule from the PDFs and say where the code differs.
- G2 Unit tests D2 green; `npm test` green.
- G3 Hand check: 10 US and 5 Saudi stocks computed by a second script straight from the second source
  (0.3), compared with the page's numbers: debt ratio, illicit share, purification per share within 1%.
- G4 Agreement with authorities: every stock on Al Rajhi's published lists (0.1) compared with our state;
  for 30 US stocks also one outside screener if reachable. Every disagreement listed with its cause; an
  unexplained disagreement blocks release.
- G5 ETF: SMH computed by hand in an independent script from the raw holdings file; weights sum; fund
  numbers equal the page's to 0.01%.
- G6 Adversarial code review of the diff, and the browser check at 390 px (new assertions for the chip, the
  panel block, the ETF tab; no page errors).
- G7 Owner sign-off on A1–A6 before the first publish; the page ships with the chosen answers written in
  its notes and change log.

## G. Ambiguities for the owner (cautious default in brackets)

- A1 "Book value" in R2: of equity or of total assets? [equity: stricter]
- A2 Leases counted as interest-bearing debt? [yes]
- A3 Islamic financing (murabaha, sukuk) cannot be told apart in the data, mostly for Saudi companies.
  [count all debt; where Al Rajhi's own list says compliant, show its verdict as the authority]
- A4 Revenue of illicit segments is rarely in the data. [flag the industry `يحتاج مراجعة`]
- A5 The fund rule: is "the total below 5%" the weight of non-compliant holdings (as written in E4), or the
  look-through illicit revenue? Both are shown; the verdict needs one.
- A6 Should a fund with `ما ينحكم` holdings above 5% be shown as not judged (E4) or judged on the rest?

## H. Order and budget

Step 0 (one sitting, about 40 TradingView calls) → owner answers A1–A6 → D1–D2 → G1–G2 → D3–D4 → G3–G4 →
E1–E5 → G5–G7 → publish. Protocol rule of this repo applies: this plan is committed before any result;
changes after results are marked POST-HOC with the reason.
