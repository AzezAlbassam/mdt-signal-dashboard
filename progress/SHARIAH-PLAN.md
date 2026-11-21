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

- [x] D1 `engine/shariah.js`: pure functions `debtRatio`, `illicitShare`, `purificationPerShare`,
      `verdict(inputs) → {state, failed:[rule], numbers, period}`; no network, no dates from the clock.
- [x] D2 `test/shariah.test.js`: the document's example (1,000 / 100,000 × 2,000 = 20); thresholds exactly
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

## I. Phase 2 (chosen by the owner 2026-11-20; starts only after parts D–F are published)

For every stock flagged `يحتاج مراجعة` because its industry may carry illicit revenue the data does not
show (retail, hotels, airlines, restaurants, media, …): read its latest annual report (10-K or the Saudi
annual report), find any disclosed figure for the illicit activity (alcohol, tobacco, gambling, conventional
financing income, …), and save it in a reviewed table in the repo: {symbol, fiscal year, illicit revenue or
share of revenue, the exact sentence and page it came from, reviewer, date}. No disclosed figure → the stock
stays `يحتاج مراجعة`; an estimate is never entered as if disclosed. The table is re-read once a year, after
each company's annual report, and each row is checked by a second reader before the page uses it.

## J. The ETF list (owner's watchlist screenshots, 2026-11-20)

Owner's 26, all to be added to the ETF tab: SMH, SOXX, GLD, VOO, SLV, DRAM, XLK, XLE, IBIT, XLV, XLF, GDX,
USO, MAGS, QQQM, CIBR, SPMO, KWEB, TAN, URNM, REMX, NCLD, LYTE, SEMI, DTCR, CHAT.

He asked for any he missed; added by me, each confirmed to exist and have holdings in step 0.4 before it
is shown (drop silently-missing ones and tell him):
- Shariah-screened funds, as a reference and to compare our numbers with their published purification:
  SPUS, HLAL, SPTE, UMMA, SPRE.
- The remaining S&P sector funds: XLI, XLY, XLP, XLU, XLB, XLRE, XLC.
- Themes close to his holdings: IGV (software), ARKK, NLR and URA (nuclear, uranium), COPX (copper),
  LIT (lithium), XBI (biotech), BOTZ (robotics), SCHD (dividends), KSA (Saudi stocks).

Funds the look-through method does not fit; the tab lists them with the reason and no verdict from us:
- GLD, SLV (physical metal), IBIT (bitcoin), USO (oil futures): no company holdings. Their ruling is a
  different question (metal, crypto, futures) that this method does not answer.
- Any fund that gets its exposure through swaps or holds Treasury bills as collateral (check MAGS and the
  Roundhill funds in step 0.4): the holdings file is not the shares the investor owns. Shown as
  `ما ينحكم بهالطريقة` unless the file lists the actual shares.
- XLF is expected to fail on activity (banks, insurers); it is computed like the rest, not pre-judged.

Budget note for step 0.6: VOO (~500 holdings), QQQM and SPMO (~100 each) dominate the calls; holdings
overlap, so fundamentals are fetched once per unique symbol (batches of 50).


## K. Step 0 results (2026-11-21) — gate G0 NOT passed; owner decision needed

0.1 Al Rajhi documents (all of https://alrajhi-capital.sa/ar/about-us/shariah-group read for this question):
- Brokerage (local/international, AR doc 5): international stocks and fund units follow the same Shariah
  board rules; the company must stop trading securities that break them. No separate US method.
- Index funds (AR doc 1, صناديق المؤشرات, rule 5): «يجب على الشركة أن تلتزم في إدارتها لصناديق المؤشرات
  بالضوابط الشرعية الصادرة من الهيئة الشرعية بشأن الاستثمار والمتاجرة في الأسهم» and rule 6: the manager
  removes the illicit element. I.e. for Al Rajhi's own index fund EVERY stock must pass the stock rules;
  there is no "below 5% of the fund" allowance. The owner's E4 rule is therefore his own, not Al Rajhi's;
  the page must say so (A5 now also asks whether to keep it).
- The English "Stock brokerage" page says it is "permissible" to trade shares of companies with prohibited
  activities (wine, usury banks, ...): a translation error against every other Al Rajhi text; we follow the
  Arabic. No compliant-company list for US stocks was found on the site.

0.2 TradingView: every fundamental column (total_debt_fq, total_revenue_fq, market_cap_basic,
total_shares_outstanding, any interest-income name) now returns "cannot be offered within TradingView" to
this session (prices still work). financial-history and forecasts tools are gone from the toolset.
=> TradingView cannot be the data source. (Check separately whether the stocks page itself still gets
fundamentals; it uses the same server.)

0.3 FMP (the plan's second source): standard quarterly statements work for US stocks, but
`interestIncome` is 0 where the company reports it inside "other income" (AAPL two quarters, NVDA latest
quarter, while NVDA's previous quarter shows 496M). A 0 is indistinguishable from "not reported", so it
would silently pass companies; unusable for R3 without another source. As-reported statements and Saudi
symbols (2222.SR) are refused: they need a higher FMP plan. No ETF-holdings tool in this FMP plan.

Consequence: no computation may start. Options put to the owner:
1. SEC EDGAR (official, free, US only): XBRL company facts give interest income where tagged, debt, shares;
   N-PORT filings give every US ETF's full holdings with weights (quarterly, up to ~3 months old). Needs the
   hosts data.sec.gov and www.sec.gov allowed, and SEC requires a contact e-mail in each request header
   (owner must approve which address).
2. Paid data (TradingView plan with fundamentals, or FMP plan with as-reported statements, Saudi coverage
   and ETF holdings).
Saudi stocks: no source today in either option 1 or the current FMP plan.

### K2. Owner decisions and TradingView root cause (2026-11-21, later)

- A5 decided by the owner: the fund rule is proportional (his rule, not Al Rajhi's, labelled so on the
  page): a fund passes when the weight of non-compliant holdings is below 5%, and the purification covers
  the illicit part of every holding (look-through, E3). Example he gave: 3% non-compliant, 97% compliant → passes.
- TradingView root cause: the connector's own tool description now reads "Fundamentals, analyst estimates,
  earnings, dividends, sector/industry and ETF data columns are not available: such columns are dropped".
  It changed between 2026-11-14 (fundamentals still served) and 2026-11-18. It is a change in TradingView's
  MCP, not the owner's subscription. The free daily call limit is also small (it ran out today after about
  10 calls); TradingView's paid "AI Add-on" raises it to 500 calls a day, but nothing says it brings the
  fundamentals back. Filings (10-Q/10-K PDFs via get-documents) are still listed, but NVDA's Q3 10-Q filed
  2026-11-17 was not listed four days later.
- Proposed root fix: SEC EDGAR as the data source for US fundamentals (XBRL company facts) and US ETF holdings
  (N-PORT), TradingView only for prices. Waiting for the owner: allow data.sec.gov, www.sec.gov and
  efts.sec.gov, and the contact e-mail SEC requires in each request.
- The stocks page depends on the same TradingView fundamentals; check it and plan its move to SEC data too.

## L. SEC first look (2026-11-21) and the test catalogue (written before any code)

First look (data.sec.gov works without the contact header; www.sec.gov refuses requests without a
declared contact, so the ticker→CIK map and N-PORT files need SEC_USER_AGENT, which the owner adds himself):
- NVDA companyfacts: InvestmentIncomeInterest 496M for the quarter to 2026-07-26 (filed 2026-08-26), debt
  (LongTermDebt 33.37B, DebtCurrent 1.0B), Revenues 96.22B, shares 24.10B. NVDA's Q3 10-Q (earnings
  release 2026-11-17) was NOT in SEC data on 2026-11-21: SEC holds the 10-Q, which comes days after the
  press release. Freshness = the 10-Q filing date, not the earnings date.
- AAPL: no interest-income tag after FY2023 (InvestmentIncomeInterestAndDividend last 2023-09-30). Such
  companies get `ما ينحكم` from XBRL unless a later step reads the note in the 10-K/10-Q text.
- Coverage on the dashboard's lists must be measured in step 0 before the plan goes further.

Test catalogue (each is a named test; a failure blocks the next step):
T1 rules engine (unit, no network): Al Rajhi's own example 1,000/100,000×2,000=20; debt 29.99% / 30% /
  30.01%; illicit 4.99% / 5% / 5.01%; market value below book value; each input missing → `ما ينحكم`; zero
  revenue; negative income still owes purification; a zero interest figure that SEC did not report is
  "missing", never 0.
T2 SEC parsing (fixtures saved from real responses): quarter = 80–100-day period only; YTD and annual
  values never taken as a quarter; Q4 derived as FY − (Q1+Q2+Q3) only when all four exist; amended filings
  (10-Q/A) replace the original; restated values use the latest filing; units USD only; fiscal years that do
  not end in December (NVDA January, AAPL September).
T3 cross-source agreement: for 30 stocks, SEC revenue and debt vs FMP within 1% (FMP's interest figure is
  not used as truth, only compared); every difference listed with its cause.
T4 freshness: for every stock the page shows the filing date used; a test fails when a 10-Q newer than
  the one used exists in SEC's submissions list.
T5 ETF holdings: weights sum to 100% ± 0.5%; every holding mapped to a ticker or listed as unmapped;
  unmapped weight shown; a fund with unmapped weight ≥ 5% is `ما ينحكم`; as-of date shown, refused when
  older than 150 days.
T6 fund maths: look-through purification = Σ wᵢ × illicitᵢ ÷ market valueᵢ, checked against a hand
  computation in a separate script for SMH and one Shariah fund (SPUS/HLAL), and against that fund's
  published purification figure when it publishes one.
T7 page (browser, 390 px): four verdict states render; numbers on the page equal the engine's; no page
  errors; Arabic text and LTR numbers do not overlap.
T8 independent review: a reviewer agent given only the Al Rajhi PDFs and the code restates the rules and
  lists every difference; the owner sees the list.

### L2. Coverage measured (2026-11-21, all 519 US stocks on the dashboard)
Run: `python3 -I scripts/shariah/sec-coverage.py us.txt out.jsonl` (ticker→CIK through efts.sec.gov, facts through
data.sec.gov; neither needed the contact header). Raw output: data/shariah/sec-coverage-2026-11-21.jsonl.
- 515 found; 3 tickers not found (BRK.B, MOG.A: dot tickers need the "-" form; ROKU: lookup miss), 1 with no facts (BTQ).
- 434 file US-GAAP 10-Q/10-K. 81 are foreign or IFRS filers (20-F/40-F: one full report a year, interest income under
  ifrs-full tags not read yet); these update once a year from SEC, not quarterly.
- Of the 434, a value with a quarter ending on/after 2026-06-30: revenue 403 (93%), shares 345 (79%), debt 306 (71%),
  interest income 221 (51%). All four together: 125 (29%).
- Interest income is the gap: AAPL, AVGO, COST, ABNB, CMCSA and others report it only inside "other income, net" and
  tag it with a dimension (or only in the note text), which companyfacts leaves out. Reading it needs the filing's own
  XBRL instance or the note, from www.sec.gov/Archives (needs the contact header).
- Missing debt is not always "no debt": a debt-free company has no debt tag. Telling the two apart needs the balance
  sheet in the filing (same need).
Added to the test catalogue (written before the engine):
- T2b debt = the sum of current and non-current debt lines on the SAME balance-sheet date, never LongTermDebt plus
  LongTermDebtCurrent twice; a single stale tag (e.g. CTM's 2025 ConvertibleNotesPayable = 0) never counts as today.
- T2c tickers with a class letter (BRK.B → BRK-B) map to their CIK.
- T2d "no interest-income tag" → read the filing's XBRL instance with dimensions; still nothing → `ما ينحكم`, never 0.

### L3. With the contact header (2026-11-21, owner set SEC_USER_AGENT)
- www.sec.gov now answers (ticker map, filings, archives).
- N-PORT (`scripts/shariah/nport.py`, output data/shariah/nport-2026-11-21.jsonl): SMH, SOXX, XLE, XLK, QQQ, SPUS, HLAL
  read; SPY is a unit trust and is not in SEC's fund list. Holdings as of: SMH 2026-09-30; SOXX, XLE, XLK, QQQ
  2026-06-30 (144 days old today); SPUS, HLAL 2026-08-31. Only the quarter-end report is public, about 60 days late,
  so holdings are 2 to 5 months old. Section E's 100-day limit would refuse 4 of the 7 today → decision A7 for the owner.
- Weights: total of pctVal 99.7–101.2%; equity-only 99.7–99.9%. SOXX's 101.17% includes non-equity lines (cash/
  collateral). T5 is restated as: equity weights 99–100.5% and the rest listed by asset type (a POST-HOC change to
  the test's tolerance, made after seeing data).
- Mapping holdings to tickers: SPUS and HLAL carry tickers; the others carry only ISIN/CUSIP (no ticker). A mapping
  ISIN → ticker is needed (to build and test: every mapped name checked against SEC's company name).
- SMH holds foreign 20-F filers (TSM, ASML): their figures update once a year from SEC.
- Apple: the latest 10-K (FY ending 2026-09-26) shows only "Other income/(expense), net" 1,174M; no interest-income
  figure in the statements, the notes or the XBRL. No source reports Apple's interest income → decision A8 for the
  owner: `ما ينحكم`, or a labelled estimate (interest-bearing cash and securities × a published yield).

## M. Owner decisions A7, A8 (2026-11-21) and the engine contract (fixed before the engine is written)

- A7 (owner): fund holdings up to 150 days old are accepted, the as-of date shown beside every fund. This
  changes E1's 100 days (owner decision after seeing N-PORT's lag).
- A8 (owner): when a company does not disclose its interest income, use a cautious estimate labelled «تقدير».
  This is Al Rajhi's own R3 ("undisclosed revenue is estimated on the cautious side"). Method, fixed now:
  estimate = average of (cash and equivalents + current and non-current marketable securities) at the start
  and end of the quarter × the quarter's average ICE BofA US Corporate Index effective yield (FRED
  BAMLC0A0CMEY) × days ÷ 365. A tagged interest figure always wins over the estimate.
- A1–A4, A6 keep their cautious defaults until the owner says otherwise (G7).

Engine contract (`engine/shariah.js`, pure, tested by test/shariah.test.js written first):
- `verdict({activity, debt, marketValue, bookEquity, illicit, illicitEstimated, revenue, shares})`
  activity: "ok" | "fail" | "review" | null. Returns {state, failed, missing, numbers}.
- R2: debt ÷ (marketValue, or bookEquity when marketValue is below it) ≤ 30% passes.
- R3: illicit ÷ revenue ≤ 5% passes; revenue ≤ 0 with illicit > 0 fails; with illicit = 0 passes.
- A known failure gives `غير جائز` even when another input is missing (failing is already certain).
- Otherwise any missing input (null/undefined/NaN), or activity "review", gives `ما ينحكم`.
- `حلال (نقي)`: activity ok, debt 0, illicit 0 and not estimated. Else passing = `مختلط جائز`.
- `purificationPerShare(illicit, shares)`; loss-making companies still owe it; shares ≤ 0 → null.
- `estimateInterest({cashStart, cashEnd, yieldPct, days})` per A8.
- `fundVerdict(holdings[{weight, state, illicit, marketValue}])` per A5: non-compliant weight < 5% passes;
  non-compliant + `ما ينحكم` weight ≥ 5% → `ما ينحكم` (clarified while writing the engine, before any
  fund result: unknown holdings could be non-compliant); purification % of amount = Σ w × illicit ÷ marketValue, unknown
  holdings excluded and their weight reported.
- 2026-11-21: D1 and D2 done; 14 tests green, `npm test` 446/446. The tests found one bug before release: an
  unexpected activity value (NaN, "OK") passed the screen; now anything but "ok"/"fail"/"review" is unknown.
  Next: G1 independent review of the engine against the PDFs, then the SEC loader (T2) and the page (D3).
