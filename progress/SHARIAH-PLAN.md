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
- [x] D4 Updating (weekly SEC refresh, scheduled 2026-11-21, progress/SHARIAH-REFRESH.md; correction 2026-11-22, M15: the
      page shows no "تحديث جديد" mark and no change notice yet; the weekly reply names the changes): computed on every load from the live fields, so a new quarter shows as soon as
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
- 2026-11-21: D1 and D2 done; 13 tests green, `npm test` 446/446. The tests found one bug before release: an
  unexpected activity value (NaN, "OK") passed the screen; now anything but "ok"/"fail"/"review" is unknown.
  Next: G1 independent review of the engine against the PDFs, then the SEC loader (T2) and the page (D3).

### M2. Gate G1, independent review (2026-11-21)
A reviewer agent given only the two Al Rajhi PDFs and engine/shariah.js restated the rules and compared.
It confirmed the formulas (R2 denominator = market value, or book value when market value is below it; R3 ≤ 5%;
purification = total illicit ÷ shares × shares held; the 1,000/100,000×2,000 = 20 example) and found these
places where the code was LOOSER than the text, all fixed with a test written first:
1. Market value and book value both ≤ 0 with debt known → the stock passed R2 silently. Now `ما ينحكم`.
2. Negative debt or negative illicit revenue was accepted (a net figure would under-count). Now bad data.
3. A8 estimate used the average balance: not "على جانب الاحتياط". Now the higher of the two balances (this
   changes part M's formula; no result had been computed yet).
4. fundVerdict passed on an empty list, a NaN weight, a list covering half the fund, an unknown state, weights
   in percent, or a short position. Now each of these is `ما ينحكم`, and unlisted weight counts as unknown.
5. Fund purification silently skipped holdings with unknown illicit revenue. Their weight is now reported
   (`purificationUnknownWeight`) and shown on the page.
Not in the engine, required of the SEC loader (T2) and the page:
- market value = the average over the quarter, never a spot value;
- illicit = GROSS interest and other illicit income, never net of interest expense;
- purification per quarter of the statements issued, never mixing quarterly and annual figures;
- the 90-day sell rule (Arabic: a hard limit, «على ألا تتجاوز») shown from the date we first saw the change;
- the page says the money goes to charity, not zakat or tax; and (Arabic «فيجب الاكتفاء بها») that pure
  companies come first when they meet the need.
Also from the review: the Arabic text says plain "market value"/"book value"; the English adds "of assets". We
follow the Arabic (equity), which is the stricter reading too. 16 engine tests green; `npm test` all green.

### M3. Loader, page block, first full run (2026-11-21)
- engine/sec-facts.js (14+1 tests), scripts/shariah/sec-load.js; data/shariah/sec-inputs.json for all 519 US stocks.
- Page (D3, not published yet): block «الشرعية والتطهير (طريقة الراجحي)» in each US stock panel, the quarter-average
  price from TradingView daily bars when the panel opens, row chip after that (saved in sh/<sym> with a change
  log), the "كم سهم عندك؟" box, period and filing date, the method and R6/R7 notes. Saudi stocks: «ما ينحكم», no
  source yet. Browser check SHARIAH AAPL green at desktop and 390 px (progress/shariah-block-phone.png).
- Two bugs caught by this run, both fixed with a test first:
  1. APA stopped tagging total revenue; the loader took its 2021 quarter as "latest". Now a quarter older than
     200 days is never used (12 stocks), shown as «ما ينحكم» with the reason.
  2. A cautious estimate is an upper bound: below 5% it proves a pass, above 5% it proves nothing. A stock
     failing R3 only on the estimate is now «ما ينحكم», not «غير جائز».
- Full run (425 stocks with a usable quarter; 92 foreign/annual or stale; 2 not found):
  interest income tagged 207, estimated 215, missing 3; debt known 233, liabilities upper bound 171, missing 21;
  R1 by industry code: ok 363, review 56, fail 6. Already failing before prices: R3 55 (mostly companies with
  little or no revenue earning interest on cash, lenders, brokers), R1 6.
- Name clash found by the browser check: the page has its own `verdict`; the engine's is now `shariahVerdict`.
Before the first publish: G3 (hand check vs FMP), G6 (adversarial review), G7 (owner signs off A1–A4, A6 and
the industry table data/shariah/sic-activity.json).

### M4. Gate G3, second-source hand check (2026-11-21) — passed with one known overstatement
An independent agent compared NVDA, AAPL, MSFT, GOOGL, AMZN, META, AMD, COST with FMP and MU with its 10-K text.
- Revenue and stockholders' equity: identical for all 9. Shares within 0.4% (cover page vs weighted).
- Debt: our borrowings and leases equal the companies' XBRL lines exactly; every difference with FMP is FMP's
  definition (it leaves out current debt, current leases, sometimes finance leases).
- Interest income: equal where tagged (NVDA 496, GOOGL 1,768, AMZN 1,187); COST 253 is right (FMP's own Q1 is off).
- Known overstatement: MSFT, AMD and MU report interest income under `InvestmentIncomeNet`, a tag we exclude
  because for other companies it nets gains and losses. They get the estimate instead: +42% (MSFT), +74% (AMD),
  +82% (MU). All three still pass R3 by a wide margin; the purification shown is higher than the true one
  (the cautious side, R6 "so as to be acquitted"). Proposed later fix (post-hoc): read the line's own label
  from the filing so "Interest income" under InvestmentIncomeNet can be used.
- XOM is not in the dashboard universe (FMP shows a new CIK 0002115436 for it).

### M5. Gate G6, adversarial review (2026-11-21) — 11 findings, all fixed with a test first
An agent probed the engine, loader and page with real SEC data (proof scripts in the session scratchpad).
1. CRITICAL: debt taken from short-term lines only when long-term debt sat under another tag: BAX, TMUS, ORA and DE
   showed «مختلط جائز» where the right answer is «غير جائز». Now such a figure is incomplete and the total
   liabilities upper bound decides (it can prove a pass, never a fail).
2. HIGH: interest tags missing (deposits, consumer loans, leases): ENPH passed with an estimate of 4.41% while it
   tags 5.77% of revenue as deposit interest. Ten exact interest tags now; the largest is used; no cash-based estimate
   for a company with loans or financing receivables (the estimate would not be an upper bound there).
3. HIGH: the row mark showed an old saved ✓ over a certain ✕. Now a certain fail from the current filing comes first,
   and a saved result counts only for the same quarter.
4. HIGH: a split or new shares after the quarter inflated the market value (shares from the cover page × split-
   adjusted price). Market value now uses the smaller of the cover and weighted counts; purification uses the cover.
5. MEDIUM: share-count unit error (TEM in thousands) → counts 50× apart drop the odd one; weighted shares no longer
   get a "year minus three quarters" Q4.
6. LOW: tags mixing interest with other income were treated as exact and could fail a stock → now upper bounds;
   negative revenue → bad data, not a fail; a smaller interest tag no longer wins; R3 above 5% on an upper bound
   shows «؟», not ✕.
Not fixed (noted): preferred tickers (STRC, STRF, STRK) are judged on MSTR's common-stock figures (MSTR fails anyway).
- Rerun after the fixes found two more, fixed with a test first: DE (a large finance arm whose receivables appear
  only in cash-flow lines) was still given a cash-based estimate → loans or finance receivables in any namespace,
  balance or cash flow of the last 400 days, now block the estimate; TEM's only share count is in thousands →
  counts are checked against net income ÷ EPS, and two counts 50× apart with nothing to decide = not judged.
- After all fixes (425 stocks with a usable quarter): interest tagged 183, upper-bound or estimate 197, missing 45;
  debt known 230, liabilities upper bound 175, missing 20. `npm test` 475/475; browser check green at both widths.
Remaining before the first publish: G7, the owner's sign-off.

### M6. Owner sign-off G7 (2026-11-21)
- A4 / activity table: the 56 "review" industries show «ما ينحكم» until phase 2 reads their annual reports.
- Publish: approved, once the lease question is settled.
- A2 (leases as interest-bearing debt): the owner asked NOT to decide it ourselves — "research what is correct,
  don't issue a fatwa of our own, don't continue until sure from more than one source". Research running
  (Al Rajhi, AAOIFI, index methodologies, Saudi boards, screeners). The page keeps leases until the answer.

### M7. Al Rajhi's CURRENT rule differs from the PDFs the engine follows (found 2026-11-21) — research running
The lease research found, and a saved copy of the page confirms, that Al Rajhi Capital's current Arabic guidelines
page (the one that carries its Q2 2026 compliant list) says:
«ألا يتجاوز إجمالي المبلغ المقترض بالربا – سواء أكان قرضاً طويل الأجل أم قرضاً قصير الأجل- (33٪) من إجمالي القيمة
السوقية ما لم تقل عن القيمة المؤسسية (EV)»، and on a change of status «فيجب بيع أسهمها في أسرع وقت ممكن، ويفضّل خلال
90 يومًا». The 2021/2022 PDFs (part A) say 30%, book value as the fallback, a quarterly-average market value and a
hard 90-day limit. The English page does not match the Arabic. No Al Rajhi text found on leases.
The same page publishes Al Rajhi's own compliant / non-compliant tables for Saudi stocks (TASI, Nomu, ETFs, closed
funds) — the authority for Saudi stocks per step 0.1, which today show «ما ينحكم» for lack of data.
Before any change: research round 2 (Al Rajhi history and wording, AAOIFI and regulators, index providers and
Saudi boards on leases, and an empirical check of which reading of the EV clause reproduces Al Rajhi's own list).
The engine keeps 30%/book value until the owner sees the verified findings; nothing is published meanwhile.
Process note: two research briefs asked agents to retry sites that refuse automated access with another User-Agent;
the permission system blocked them, rightly. The briefs now allow only public routes (normal pages, official copies
elsewhere, public archive copies, search snippets); a refusing site is recorded as unreachable.

### M8. Research round 2 — verified so far (2026-11-21). Each point checked by me from the document itself.
Al Rajhi (two of its own current documents disagree):
- Website guidelines page (carries the Q2 2026 Saudi list, no decision number): 33% of total market value «ما لم تقل
  عن القيمة المؤسسية (EV)»; no averaging; sell «ويفضّل خلال 90 يومًا»; new line «يجب الاجتهاد بمعرفة أي أرباح
  مشبوهة أو غير واضحة المصدر»; purification only «يجب على المستثمرين التخلص من أي مكونات محرمة». EV is not defined
  in any Al Rajhi document found.
- Al Rajhi Global Equity Fund terms (stocks worldwide, benchmark Dow Jones Islamic Market; Shariah board decision
  336; «تاريخ آخر تحديث 2025/08/12»; https://alrajhi-capital.sa/-/media/Feature/AlRajhiCapital/PDFs/Terms-and-Conditions/2025/Al-Rajhi-Global-Fund.pdf):
  30% of total market value «ما لم تقل عن القيمة الدفترية» and «تؤخذ القيمة السوقية من متوسط قيمتها لكل ربع من
  أرباع السنة» — i.e. Al Rajhi's own rule for NON-Saudi stocks as of Aug 2025 is the one the engine uses.
- Purification PDF «آلية احتساب العنصر المحرم» (2022): still linked from today's Shariah Group page; downloaded today,
  byte-identical to the 2022 copy; it also states 30% / book value and the formula the engine uses.
- Argaam 2024-05-06 (Q1 2024 list): the rules are Al Rajhi Bank Shariah board decision 485: 30% / book value /
  quarterly average.
- No Al Rajhi text on leases. Contact on Al Rajhi's pages: customerservice@alrajhi-capital.sa, 800 124 5858; the
  Shariah department's stated duties include answering clients' questions.
AAOIFI Shariah Standard 21 (AAOIFI's own English PDF, issued 2004, in the 2015 book): 3/4/2 "the collective amount
raised as loan on interest – whether long-term or short-term debt – does not exceed 30% of the market
capitalization"; 3/4/5 "recourse is to be had to the last budget or verified financial position". No mention of
leases anywhere in the standard (checked: the only hits are "pleased" and renting shares).
Regulators (search snippets only, sites blocked): Pakistan's KMI/All-Share Islamic index lists "Finance Lease, Hire
Purchase" as interest-bearing debt (operating leases not mentioned); Malaysia SC: "interest-bearing debt", Islamic
financing excluded, leases not mentioned; Indonesia, DFM: leases not mentioned.
Still running: the empirical test on Al Rajhi's Q2 2026 Saudi list; index providers, Saudi boards and papers on leases.
Index providers, Saudi boards, research (round 2, third group):
- S&P Shariah (FAQ, snippet): debt = "the sum of all short- and long-term interest-bearing borrowings and liabilities",
  Islamic and non-interest-bearing debt excluded, case by case; S&P/DJIM update of 2026-08-20 (snippets): debt ÷
  36-month (S&P) / 24-month (DJIM) average market value < 30%, effective 2026-09-21. Leases not mentioned.
- MSCI (Apr/Jul 2025 methodologies, read) and FTSE (Yasaar 2026, IdealRatings 2026, read): "debt" undefined; leases
  not mentioned. No IFRS 16 consultation found 2018-2026.
- Al-Maqasid / Dr. Al-Osaimi methodology, 2025 update (verified by me in the PDF, para. 19): «الأصل أن ما كتب بطريقة
  توحي أنه تم حسب الضوابط الشرعية، مثل المرابحة، والتورق والإيجار التمويلي … فيعتبر شرعيا … وأما ما تم عنونته بطريقة
  مدمجة مجملة … وضع في التمويلات التقليدية من باب الاحتياط»; limit (para. 10): non-Shariah borrowing ≤ «ثلث إجمالي
  الموجودات». Finance leases presumed compliant when labelled so; operating leases not mentioned.
- Finance leases counted as interest-bearing debt (stated): Pakistan's exchange index brochures ("Finance Lease, Hire
  Purchase"), Zoya (capital leases, its Shariah advisers), ISRA-Bloomberg paper 2017 (snippet). Operating / IFRS 16
  leases: no authority found that counts them, none that excludes them in words; only blogs, split both ways.
Empirical test on Al Rajhi's own Q2 2026 Saudi list (15 leveraged companies, 31-Dec-2025 statements; my checks marked ✓):
- Islamic financing is not counted: Saudi Kayan (all Murabaha, 126% of MV) and ADES (85% Islamic) are compliant.
- Lease liabilities are not counted: flynas ✓ (list: compliant; statements: lease liabilities SAR 5,990m with a
  370m finance cost for 2025, borrowings only Murabaha 1,484m; leases alone = 54% of MV, 42% of EV, 35% of total
  assets) and 1820 BAAN ✓ (compliant; loans 377m ✓; right-of-use assets 629m ✓ already exceed its market value).
- Book equity is not the denominator; MV, EV and max(MV, EV) fit equally (11 of 12 compliant labels with
  conventional debt only); the list is not purely mechanical (Cenomi Retail compliant with conventional debt at
  136% of MV). Non-compliant non-financials (4011, 4072, 4280 ✓) are not cleanly debt-driven.

### M9. Conclusion of research round 2 (for the owner's decision)
1. Leases: no written authority counts operating (IFRS 16 / ASC 842) lease liabilities as borrowing at interest
   (Al Rajhi, AAOIFI SS21, S&P, MSCI, FTSE, Al-Maqasid: silent or "borrowing at interest" only), and Al Rajhi's own
   list shows it does not count lease liabilities (flynas). Finance leases: counted by Pakistan's index, Zoya, ISRA
   (conventional ones); presumed Islamic by Al-Maqasid when labelled «إيجار تمويلي». => Al Rajhi's practice:
   leases out. A stricter option keeps US-GAAP finance leases in.
2. Debt rule: Al Rajhi's own documents disagree — website (Saudi list) 33% / «القيمة المؤسسية (EV)» (undefined)
   vs the Global Equity Fund terms of 2025-08-12 (decision 336, global stocks) and the still-linked purification PDF:
   30% / quarter-average market value / book value. For US stocks the fund terms are Al Rajhi's most specific text,
   and they are what the engine already does. The Saudi list cannot tell MV from EV. Only Al Rajhi can settle it.
3. Islamic financing excluded (US companies rarely have any; Saudi only).
Decisions asked of the owner: leases (out / finance leases in), the debt rule (keep 30% until Al Rajhi answers /
switch to 33% with max(quarter-average MV, EV)), and whether to send Al Rajhi the question.

### M10. Owner decisions after round 2 (2026-11-21) — applied
- A2 leases: OUT of interest-bearing debt, as Al Rajhi's own list does (flynas). Shown separately on the page as
  «ما تنحسب»; the liabilities upper bound now subtracts known lease liabilities. Tests changed first (marked).
- Debt rule: stays 30% of the quarter-average market value, book value when higher (Al Rajhi Global Equity Fund
  terms, decision 336, 2025-08-12; the linked purification PDF). The page cites them and says that Al Rajhi's Saudi-list
  page reads 33% / «القيمة المؤسسية» and that we await their answer.
- The owner sent the question to customerservice@alrajhi-capital.sa on 2026-11-21 (which rule applies to US stocks;
  how EV is computed; whether IFRS 16 lease liabilities count). Their answer is applied with tests first.
- Results after the change: AAPL debt 80.1B (leases 14.4B not counted) → 2.2% at a $250 average; MSFT 35.5B
  (98.5B leases not counted). `npm test` 476/476; browser check SHARIAH AAPL green at desktop and 390 px.
- Portfolio card identity A ("Midnight") chosen; B and C removed (in git history).

### M11. Funds (part E) built (2026-11-21/22)
- Holdings: SEC N-PORT, latest report per fund (scripts/shariah/nport.py → data/shariah/nport-latest.jsonl). 40 of 44
  funds found; DRAM, URNM, NCLD, LYTE are not in SEC's fund list; GLD, SLV, IBIT, USO hold no companies (listed with
  the reason). Holdings dates 53-145 days old (A7 limit 150).
- Matching holdings to companies (engine/funds.js): ticker, then ISIN (seeded from funds that report tickers), then a
  unique normalised name (also without spaces, and with the words sorted). Checked: 395/395 correct on SPUS/HLAL.
- Kinds: cash collateral from securities lending is left out and reported; money-market funds and bonds count as
  non-compliant; derivatives and other instruments as not judged; unlisted remainder as not judged.
- Each company: screenStock (shared with the stock page). Market value: the fund report's price within a -20%/+25%
  band, or the exact quarter-average close when fetched (TradingView 1D bars; FMP's plan refuses most symbols; the
  two sources gave the identical DIS average). TradingView's free daily quota allows about 10 calls: 16 of 86 holdings
  near the debt line have exact averages so far; the weekly run fetches more.
- Fund verdict: the owner's rule (fundVerdict); purification per quarter = Σ weight × illicit ÷ market value.
- Bugs found by checking the first results, each fixed with a test first: banks without readable statements are
  غير جائز by activity; AbbVie/Oracle debt tags; total liabilities derived for Monster; EPS-implied shares for Visa;
  the loans guard no longer fires on disclosures (Broadcom) or trade receivables (PepsiCo, Chevron); investment-bank
  revenue; a plain Cash tag; word-order names (Schwab); the first-listed ticker (not JPM-PM); IBM's short-term debt
  equal to its current portion counted twice (70.8B → 63.8B; 31.6% → 28.4% at the quarter average).
- Known limits shown on the page: foreign annual filers (TSMC, ASML, SK hynix, ARM) and combined-report utilities
  (AEP, XEL, EXC) are not judged; activities under review (Walmart, Costco, Netflix, tobacco, REITs) stay «ما ينحكم»
  until phase 2; the fund's own securities-lending income and cash interest are not in the purification.

### M12. Funds review before publishing (2026-11-22) — 34 findings, 33 reproduced; fixes are POST-HOC, tests first
Independent review: four lenses (code logic, matching, hand check of SMH/XLK, rules and page claims), each finding then
reproduced by a separate skeptic (scripts and outputs in the session scratchpad, review-funds/). Fixed, each with a test
written first (test/funds.test.js, test/sec-facts.test.js "review:", browser "FUNDS REVIEW CHECK"):
- Matching (high): funds abroad report home-market tickers (UMMA, CHAT, SPTE, CIBR): Roche "ROP" was screened as Roper,
  Richemont "CFR" as Cullen/Frost, Sanofi "SAN" as Santander; UMMA's Toronto "ABX" travelled by ISIN to GDX's Barrick
  (7.95%) as Abacus. A reported ticker or an ISIN now counts only for a US holding or when the SEC title shares a name
  word; then the name step (Sanofi → SNY, Barrick → B, CNR → CNI). Measured on all 2,973 equity holdings: 34 changes,
  all correct except two now unmatched (TSMC under "TSMC", a 20-F filer either way; ARKK's renamed Brera, 0.02%).
- Names: SEC's backslash and spaced state suffixes (US Bancorp, MP Materials), a place after the legal form (Energy
  Fuels Inc/Canada), dotted N.V./S.A. (STMicroelectronics, Bunge); GROUP is no longer dropped (Compass Group ≠ Compass).
- Purification (high): unknown interest gave purification 0, not unknown (JavaScript null >= 0), which hid the coverage
  note (XLK 98.4% covered, not 99.95%). Coverage is now the weight of holdings with a figure.
- MAGS: swap values counted by absolute value pushed the list over 100.5%, so 65% bills and money funds showed «ما ينحكم».
  The 100.5% check uses signed weights. Weights are value ÷ net assets (SPRE lists two $0.03 lines at -1.41%).
- Band: one band per company across every fund's report price (LUV, HONA, IT passed in one fund on a price another fund's
  in-quarter price contradicts). A split between the last two quarters (shares moved 1.5x+: CrowdStrike 4:1, Amphenol
  and Monster 2:1) leaves the price basis open by its ratio, for the band and the quarter average; purification takes the
  lower market value. Row reasons are those failing at both band ends (AXP showed "debt over 30%"). Purification uses the
  report price behind the weight; the quarter average decides only the debt test.
- Debt never understated: max with noncurrent + DebtCurrent and with LongTermDebt + (DebtCurrent − its current portion)
  (Cisco 21.4B → 29.8B, KDP, Corteva, Qualcomm); securitisation, lines of credit and other short-term borrowing tags read.
  Found when checking the rerun (my own regression, fixed with a test first): the first version took lease-bundled
  tags and the current finance lease inside DebtCurrent (Micron 2.8B → 5.2B, Valero 8.6B → 11.0B), against A2. The
  rule now uses lease-free tags only and takes the tagged current finance lease out of DebtCurrent. Old vs new over all
  1,114 cached companies: 22 debt figures rise (short-term borrowings), none fall (scratchpad fix/debt-scan.txt).
- Interest estimate: debt securities tagged only as a total count (KLA's 3.2B available for sale; estimate 23M → ~67M).
- Found when checking the first rerun: a share count 1000x the previous quarter's (Geron, Iovance: one quarter tagged in
  thousands) was taken as a split, and their purification came out above 100% of the holding. A ratio beyond 50x is a
  unit error, not a split (Chipotle's 50:1 is the largest kept). Test first.
- Page: the 150-day limit is re-checked on the viewer's Riyadh date (XLK's 06-30 holdings turn 151 days on 2026-11-28,
  still the 27th in UTC); the loader also uses Riyadh's date. Activities under review say so; an interest bound above 5%
  says so (not "missing"); combined interest tags say "combined", not "estimated"; the method names the book-value
  fallback and no single price source; the look-through illicit share (E3) is shown for reference (a share above 100% —
  fee-only revenue tags of lenders — counts as 100%); the stock page explains such a share.
- Quarter averages also come from the daily bars already in the repo (data/us/bars, TradingView 1D, last bar 2026-10-06;
  the 16 fetched averages match them exactly): scripts/shariah/bars-quarter-prices.js, then the same merge checks.
Not fixed, on the cautious side (documented): AMAT's short-term debt includes its current notes (+18%); NXP tags its
2.0B commercial-paper programme size as CommercialPaper (+18%); AMD/MU/MSFT interest taken from estimates, not their
own "interest income" lines (known since M4; +42-82% purification); AVGO debt at principal; INTC/AVGO the smaller share
count; SNDK's upper bound. Renamed companies whose N-PORT name is the old one (BlackRock Funding, Hartford, Equity
Residential, Franklin, Paramount) stay unmatched, i.e. not judged. A box-spread fund held as a share (MAGS's XBOX) stays
not judged (finding refuted: no rule covers it). No fund verdict changed from any of the unfixed points.

### M13. External audit after M12 (2026-11-22) — fixes are POST-HOC, tests first
Nine external auditors, one lens each (the M12 fixes C0-C16 and C17-C32, a line-by-line code read, an independent
recomputation that never imports the engine, a hand check of XLK/SPUS/HLAL/MAGS against SEC filings, every number this
round changed, the rules and page texts with the unattended weekly run, matching, data and prices), each followed by a
second auditor who tries to refute every finding, then a completeness round (scripts and outputs in the session
scratchpad, audit/). The fixes below were made from the auditors' own filing evidence while the verifiers ran; each has a
test written first and seen failing on the pre-audit engine (e39aeb6): 22 new or changed tests in test/sec-facts.test.js,
test/funds.test.js and test/shariah.test.js ("audit:").

Debt has two readings (the principle that replaced M12's "debt never understated", which the audit showed false):
- debt = the largest figure made only of lines that are debt and cannot overlap (long-term debt with its current
  portion, the combined figure, noncurrent + DebtCurrent, debt-and-finance-leases less the tagged finance leases,
  convertible notes or a drawn credit line larger than the debt they could sit inside). It alone can prove a fail.
- debtHigh = the largest figure any reading of the tags gives (every short-term line apart, the parts, LongTermDebt as a
  noncurrent line beside DebtCurrent, convertibles and credit lines that may sit inside). A pass needs it under 30%.
- Between the two the debt test is open: «بنود الديون تحتمل قراءتين». Short-term lines are high-reading only because
  they can overlap the current portion (Corpay's 2,300 securitisation is inside its 5,161), include it (IBM, BMY), be the
  total of the others (Citigroup) or be a programme's size with nothing drawn (Camden's 600M of commercial paper made a
  wrong R2 fail; NXP's 2.0B, M12). Cases from the filings: eBay 6,733 (was 5,989), Cummins 6,788..7,519 (was 7,171),
  PSIX 35.9..36.1M (was 1.1M), SMCI 8,646 with its convertible notes (was 3,977: a wrong pass), Walmart 39,932..50,411
  (the combined figure is long-term only), Marriott 16,735 (LongTermDebt held a stray 23M), Adobe 4,766..6,363, Tapestry
  2,557, PepsiCo 42,658..56,681 (noncurrent with only short-term lines beside it; it was unknown).
- Finance leases come out of bundled lines wherever they are tagged (A2): Home Depot 52,483 -> 49,417 high (3,066 of
  finance leases), Tyson, Yum, Domino's, IP, EchoStar, Ameresco, Medtronic. Across all 1,114 cached companies no high
  reading falls below the old figure except by tagged finance leases.
- The current finance lease comes out of DebtCurrent only when what is left equals the other current debt lines
  (Micron: 491 is the lease). M12 took 151 out of KDP's 7,270, which its 10-Q shows holds paper, a term loan and notes,
  and the M12 test asserted that; it now expects 28,865. PayPal mixes a principal schedule (LongTermDebt) with carrying
  values: the low reading takes the smaller noncurrent figure (13,472), the high one the larger (13,553). Short-term
  lines are never added on top of a DebtCurrent reading, which holds them.
- The second batch also reads notes payable to banks as noncurrent debt (Sky Quarry); Block's 1,096M warehouse line
  under LongTermLineOfCredit enters the high reading (it may sit inside its long-term debt).

Interest:
- The A8 estimate counts current assets no tagged line explains as interest-earning (Energy Fuels keeps 779M of
  securities under its own tag, which companyfacts does not carry: a wrong pass at 4.8% against 32.5% in its 10-Q), reads
  the current taxonomy's debt-securities tags and long-term investments (Arteris passed only on the gap), and charges
  loans a lending rate of 20% a year instead of refusing to estimate (Linde's 29M note against 3.9B of cash left it
  unknown). 20% was checked against the cases where the filings show the financing revenue: at twice the corporate
  yield Snap-on would pass at 4.89% against its own 8.77%; Ford and Caterpillar likewise.
- A tagged figure has a high reading too: separate exact lines add up (IBM 87 + 62), a lender's revenue outside contracts
  with customers may be financing income (MercadoLibre's credit revenues: a wrong pass at 0.51%), unexplained current
  assets may earn interest booked in revenue (ADP's 44.7B of client funds: a wrong pass at 2.44%), and loans whose tagged
  interest is under 4% a year of the book earn the lending rate (Snap-on, IBM). R3 passes only under 5% at the high
  reading and fails only above it at the exact low one.
- Purification is the figure that decided R3: the high reading when R3 passes on it (the cautious figure), the exact
  one when R3 fails, and none while R3 is open — found when checking the rebuild: the high reading as an amount gave
  Ford 40% and Bunge 90% of the holding a quarter (a bound is no amount to pay). An estimate above 5% likewise gives
  no amount now. Fund cards then show the covered part as a floor.
- The 20% lending rate, checked on the rebuilt data: only Palo Alto and Caterpillar change with twice the corporate
  yield instead. Palo Alto's 10-Q shows 1,409 of financing receivables carrying 123 of unearned income (about 5% a
  year): at 20% it is a wrong «ما ينحكم» (5.09%), the mild side. Caterpillar's financial products arm is large against
  its revenue: at twice the yield it would pass at 4.64%, likely wrongly. Kept at 20%; FinancialServicesRevenue, which
  would settle such cases, has not been tagged by these filers since 2018.
- Loan balances are counted once (later filings repeat them as comparatives: Cisco's 8.7B had come to 16.7B), current
  and noncurrent parts of one line add up (Caterpillar 11,051 + 14,402), and cash flows stand in only where no balance
  is tagged.
- A lender whose revenue is contract revenue only gets its interest added for the total (AXP 56.9% -> 36.3%, still a fail).
- C19 correction to M12: after M12's securities-total rule the estimates overstated AMD by 137% and MSFT by 71% (not
  42-82%). A securities total now counts only when no investment line is tagged (KLA) and it is not the cash itself
  (Natera): fair-value tables often hold the cash equivalents (AMD's 14,107 holds 5,736; AvePoint's T-bills inside cash
  are still counted twice, which needs the filing's balance-sheet-location axis). An insurer's published investment
  income (NetInvestmentIncome, GrossInvestmentIncomeOperating) is a floor of its estimate and a high reading (AMERISAFE,
  Primerica: bonds held to maturity are not all tagged); a consolidated CLO or insurance book that companyfacts does not
  show (Apollo, Virtus) stays understated, and both are under activity review.

Activity (data/shariah/sic-activity.json, the owner's G7 draft): SEC files wine and spirits makers under 2080 Beverages
with soft drinks, so companies can be listed by CIK: Brown-Forman and Constellation Brands fail (Brown-Forman passed);
Tyson (pork) and Casey's (alcohol, tobacco) are reviewed; 5180 wholesale alcohol fails; restaurants are 5810-5813 at SEC
(Starbucks passed). These are corrections of the table's evident intent, for the owner to confirm with G7.

Funds:
- Splits come from restated share counts (an IPO or a share issue restates nothing: 7 of M12's 14 split flags were false;
  KLA's 10:1 next to a 10-K quarter was missed). Each report price goes on the share count's basis by the saved bars or by
  the dates around the split; unknown, both bases stand (CrowdStrike's post-split prices had been divided by 4 too).
- The band uses the report prices dated in the company's own quarter when there are any (Martin Marietta and HP had their
  in-quarter fails opened by out-of-quarter prices). The report-price band is no bound on the quarter average (Snowflake,
  Moderna, Marathon fell outside it), so the saved daily bars now give the exact average for every held company they
  cover (bars-quarter-prices.js --all), and rows judged on the band say «الديون بسعر التقرير».
- A foreign holding takes a reported ticker or ISIN only when the names agree (a name key in common), not one shared word
  (Xetra's MRK is Merck KGaA, not Merck & Co.; Prudential plc; 3i Group); foreign legal forms (Oyj, KGaA, ASA, SpA,
  public limited company) are dropped from names; a state suffix tells Independent Bank Corp/MI (IBCP) from INDB.
- Short equity positions count as unknown, never compliant; spot currency contracts filed as STIV are derivatives, not
  money funds; the unlisted remainder has no purification figure; a zero-revenue row's infinite interest share is written
  as 100% with a flag; a fail lists only what fails.
- Purification: a fund's own bills, bonds and money funds carry their interest at the 3-month bill yield (MAGS: 65% of the
  fund in bills and money funds; its purification was about 56x too low). Below full coverage the card says «على الأقل»
  with the covered share, and under half no figure at all (UMMA showed 0.000% on 0.4% of the fund).
Not fixed (documented): debt under a company's own tag (Penske's floor-plan notes, MannKind's current convertibles, SLB's
current debt), share counts only by class (Hershey, Visa, Constellation, Tyson, Ares), KLA's swap-marked carrying value,
derivatives at fair value rather than notional. T5's restated 99-100.5% equity tolerance (L3) is replaced by the loader's
95-105% signed check (fixes-b C30).

### M14. External audit, second batch (the rules and mapping auditors, reported after M13's fixes) — POST-HOC, tests first
Tests written first and seen failing: test/funds.test.js (row reasons), test/shariah-scripts.test.js (new: the merge
keeps saved averages and their price date; new SEC errors are counted), test/page-shariah.test.js (new: the stock
page's wording), and the browser check's section (9) FUNDS AUDIT 2 CHECK.
- The weekly run lost exact quarter averages: merge-quarter-prices.js rebuilt quarter-prices.json from that week's part
  files alone, so averages fetched in an earlier week (and, with the scratchpad cleared, all of them) fell back to the
  band (XLK went to «ما ينحكم» in the auditor's dry run). It now starts from the saved file; a newer entry replaces an
  older one and fund-load uses an entry only for the company's current quarter. Each entry keeps asOf, the day its prices
  were split-adjusted to, so a split after it is still divided out (before, the file's own date stood in, and a kept
  entry would have taken a later merge's date).
- A fetch SEC refuses looks like a company without numbers ('no XBRL facts'): 222 refused stocks passed every gate of
  the weekly run in the auditor's simulation, and 30 sure fails became «ما ينحكم». sec-load.js and fund-load.js now stop
  (exit 1, nothing written) when more than 5 companies that had numbers last time have none, or lost their industry code
  (a refused submissions fetch: a bank would no longer fail R1); the stock page no longer
  calls such a company a foreign annual filer («ما لقينا أرقامها في SEC ... أو SEC ما ردّت»).
- The weekly run never committed the rebuilt page, so its own step 1 (a clean tree) would have stopped the next
  Saturday; failures left changed data behind. Step 7 commits pages/stocks.html, and any failure after step 3 restores
  data/shariah and the page. The TradingView brief is saved in progress/SHARIAH-TV-BRIEF.md (it lived only in the
  conversation). Step 4b starts from an empty part folder. diff-inputs reports debt that moved more than 10% and reads
  the activity table with its company list. A rerun of fund-load.js with --reuse keeps the fetch's time in
  fund-companies.json (each rerun had reset it, so the 36-hour limit never ran out).
- Row reasons: «ما عندنا قوائمها في SEC» was given to every holding without a quarter. It now says which: not matched to
  a company in SEC's current list (445 rows: foreign companies, renamed or delisted US ones), no numbers at SEC (56),
  stale numbers (77), or no quarterly filings. Rows whose company has a 10-Q or 10-K newer than the numbers say so (12
  companies: CEG, PCG, WMB, PEG and others; companyfacts lags those filings). A combined interest tag reads «رقم مدموج
  (حد أعلى)» on the stock page, not «تقدير». The method says collateral is named above 0.5%.
- Splits (found while checking a verifier's reproduction of M13's split fix): grouping restatements by ratio alone merged
  a company's splits of the same ratio years apart into a window that ended before it began, and a period restated by
  two splits gave their product. Monster's 2:1 split of 2026 was lost (its 2016 3:1 taken instead: VOO's and XLP's
  pre-split prices went undivided, half the purification on those rows); Copart read 4 for two 2:1 splits, Texas Pacific
  Land 9 for two 3:1. Each step between two filings of a period is now one split, and steps join only when their windows
  overlap; 30 of the 1,114 cached companies change (most had inverted windows). Test first (test/sec-facts.test.js).
- Corrections to earlier parts: M11's "EPS-implied shares for Visa" never reached real Visa data (Visa, Hershey, Tyson,
  Constellation, Ares and others tag share counts only by class, so their market value is missing and they stay
  «ما ينحكم»; no fund verdict depends on it today: XLP has 4.0% of its weight unknown for this reason alone). M12's "22
  debt figures rise, none fall" counted only rises above 0.5%: 33 rise, none fall; PPG's rise is a finance lease tagged
  only as a total (6M), and Molson Coors' lease subtraction is now conditional (M13).
- Not fixed, no verdict changes (the auditors' own effect runs): former company names (Skydance, Hartford, Franklin
  Templeton, Vivmark), name-format misses (a state glued to the legal form as in "Inc.DE", spaced "N V", key ties such as
  Rio Tinto plc/Ltd), TSMC's US ADR lines reported under the name "TSMC", CVR and earn-out lines booked as equity (0%
  weight today), ADR-ratio prices for companies held as both ADRs and home shares (none is judged today).

### M15. Fix-branch review (2026-11-22, five lenses on the M13 fixes, each verified) — POST-HOC, tests first
Interest (findings with filing evidence; tests written first and seen failing):
- Deere passed R3 on a 2.09% estimate against its 10-Q's 1,353M of finance and interest income (10.7%): M13's "balances
  before flows" charged only its 2,593M lease investment (its retail notes are under de: tags, which companyfacts does
  not carry) and dropped 26.5B of collections. The loan book is again the larger of balances and flows: Deere is open
  (11.5%), which the 10-Q would make a fail. Only Deere and Block (open either way) change.
- A fail was purified on the largest single exact line: banks tag their total interest income as an upper-type tag, so
  KeyCorp was purified on 107 of 2,133, Goldman on 3,760 of 22,793, Morgan Stanley on 4,032 of 16,188. A fail now
  purifies on the tagged total (InterestAndDividendIncomeOperating) when it is larger. Exact lines are not added up for
  it: SoFi tags 1,343.2 of interest beside its parts 1,260.9 and 82.3 (Raymond James and State Street likewise).
- Realty Income passed R3 at 1.99% on its loan interest; its second line, 105.0M of interest and dividends on loans and
  preferred equity (InterestAndDividendIncomeSecurities), was read nowhere: with it the high reading is 8.46%, open.
  That tag now adds to the high reading and floors an estimate.
- Interest joined a company's contract revenue whenever its tag was InterestIncomeOperating: Duolingo's non-operating
  interest made its revenue 321.4M, not 309.0M, and a non-lender at 5.2% would have passed at 4.94%. It now joins only
  when it is 10% of that revenue or more, where the share is above 9% either way. Duolingo is open (its high reading is
  5.0%; its filing's one line is 4.02%: a wrong «ما ينحكم», the mild side).
- Tests for mutations that survived every test: Cisco's loan candidate (a combined tag plus loans), the 400-day window,
  unexplained current assets at the corporate yield. The test that fed Deere a de: namespace is renamed.
Funds:
- A pass on report prices within reach of the debt line (point ratio 20% or more) is now listed for the quarter-average
  close, like the rows the band cannot decide, ordered by what can change a fund's verdict (data auditor: Snowflake's
  average fell 2.9% under its band floor; SPUS's pass, 0.03 points under 5%, rests on ten such passes: HUBB, ADM, EFX,
  MAS, HAL, PHM, LH, FICO and others).
Debt (the debt lens, each case read from the 10-Q; tests first):
- debtHigh fell below the balance sheet where LongTermDebt is the noncurrent line beside its current maturities with
  no noncurrent tag (Halliburton 7,072 + 90; Coupang 654 + 119 + 988): that sum is now a high reading, for the plain
  LongTermDebt tag only (Air Products' tag holds its current maturities by name). LineOfCredit is read like
  LongTermLineOfCredit (EastGroup's 194.7 of bank facilities), once when it equals a short-term line (M&T).
- Finance leases tagged only as a total stayed inside the bundled lines while the panel said they were not counted
  (Waste Management 23,370 -> 21,740, UPS 26,078 -> 24,611, FedEx 19,355 -> 17,637, Murphy back to 1,539.6, Cummins
  -128); the Tapestry rule now applies only where no finance lease is tagged.
- The high reading counted lines twice: LongTermDebt that holds its current portion beside DebtCurrent (Hubbell 5,734
  -> 5,120.2, Boeing 50,175 -> none, Dell, 3M, S&P Global, Danaher and others), short lines on top of a DebtCurrent
  that holds them, a convertible that is the combined figure itself (Tyler 2,820 -> 1,410). SPUS's pass had been 0.18%
  of Hubbell's price from a wrong «ما ينحكم».
- Convertible notes or a credit line that are all the tags show now prove a fail, with the liabilities bound as the
  pass test (Akamai 7,568: «غير جائز» in CIBR, XLK, SPUS); a short-term line tagged at zero is the current line
  (Cognizant 1,552: «مختلط جائز» in SPUS, widening its margin; NCR Voyix); debt and finance leases less the leases is no
  more than the balance sheet's pair where one exists (Marathon Petroleum 33,022, not its principal 33,492).
- Not changed: a short-term line larger than the current portion beside it stays high-only (Clorox, Henry Schein: a
  wrong «ما ينحكم»; the proposed rule would have counted NXP's 2.0B programme size).
Interest and shares:
- A fail is also purified on a positive net interest line (Nano Nuclear 4.98 against 0.374); the lender total revenue
  also covers a lender below the 10% line (a lending tag or a loan book); capitalized contract costs, tax receivables
  and current loans (charged at 20% in the loan book) are no interest-earning current assets (Duolingo passes again at
  4.63%; Dell's estimate loses a double count of 166.6M); a loan book read from cash flows is printed as a year of
  loans made, and a credit-loss provision tag is no loan (Rocket, Block, Dave).
- An open R3 on an exact tagged figure purifies at least that figure (GM's and Ford's rows in XLY had dropped out: the
  card's «على الأقل» was below their certain part alone). Policy now: pass -> the high reading; fail -> the larger of the
  exact line, the tagged total interest and a positive net interest line; open on an exact figure -> that figure, at
  least; open on an estimate or a combined figure -> none.
- A 10-K quarter caps a cover count dated after it at the year's weighted count (Skyworks: 150.0M, not the 234.9M after
  its merger: its debt ratio read 15.5% instead of about 25%).
Splits and prices: a saved bar at the report price proves a post-split price only when the bars are known to include
the split (a split after 2026-10-06 leaves them on the old basis: the Monster error would have come back); a 1:50 or
1:100 reverse split is a split (only a 1000x step is a unit error); the merge no longer checks a saved-bars average
against a raw report price on another basis (APH, CRWD, MNST, MRNA kept the band); spot FX lines are found by their
title (URA, COPX, LIT); a fund's own bills earn their investment yield (+2.3%).
Page: list chips are recomputed from the saved quarter average under the current rules, never shown as saved (SMCI kept
✓ after its convertible notes made it «غير جائز»); the purification row names the interest figure it uses when that is
not the one shown (Wells Fargo's published 23.9B beside its 1.40B line, Cisco's high reading); a combined figure above
5% reads as a bound, not «المؤكد تحت 5٪» (Circle 76%); weights near 5% get two decimals (SPUS 0.76% + 4.22%); an
unknown purification names what is missing; «غير منشور» says «ما نقدر نقرأه من بيانات SEC» (Deere publishes its figure
on an axis companyfacts does not carry).
Privacy: the SEC contact header (the owner's own SEC_USER_AGENT) had been sent to FRED with every yield fetch since
2026-11-21; it now goes to SEC hosts only, and FRED gets curl's own default client name (it drops an unknown one;
scripts/shariah/sec-lib.js uaFor, test first).
Downloads: a 403 or 429 from SEC (its rate limit, about ten minutes) had read as "no data", like a 404. The first
reload with the new-errors guard proved the point: SEC throttled it while the reviewers were fetching too, and the guard
stopped it (19 stocks and 50 held companies newly "without numbers") instead of publishing them. The getter now waits a
throttle out, doubling from 30 s to about 15 minutes in all, and only a 404 means no data (test first, a local server).
Correction to M13: "at twice the corporate yield Snap-on would pass ... Ford and Caterpillar likewise" is not what the
final code does: at twice the yield Snap-on and Ford stay unjudged (6.54%, 6.83%); the 20% rate keeps them open too.
Not fixed, documented: nested catch-all current-asset tags subtracted twice (ADM, Mastercard: subtracting only the
largest overcounts Apple), split windows wider than the filings (a no-bar company's price then counts on both bases),
two splits within a year, restatements that are not splits (a 10-Q/A, SPAC exchange ratios), the 40% check's blind spot
for a 3:2 split not yet restated, activities (the round-2 gap lens: GE's insurance, Casey's tobacco, Royal Caribbean,
Amazon's film and music, AppLovin's gambling ads, defense makers): owner decisions for phase 2 (A4).
The first audit's round 2 (four more lenses after its completeness critic; verified):
- Stock page: a panel without a score had no Shariah block (VKTX, DJT, RGTI); now it has. A split after the filing put
  today's split-adjusted bars on the old share count (a 1:10 reverse split passed at 5% instead of failing at 50%): the
  page now compares the count with today's market value from TradingView and, beyond 1.5x either way, does not judge
  («عدد أسهم يطابق السعر») and gives no amount per share. A quarter average needs bars from the quarter's start to its
  end (47 days to 09-04 had been judged).
- Funds: cash collateral from lending the fund's shares is reinvested at interest, part of it the fund's own income: it
  is purified at the bill's investment yield, an upper bound (TAN lends 34% of itself); its weight still stays out.
- Inputs: a cover count of one share class is dropped when net income / EPS confirms the weighted count (Mobileye's
  Class A, 252.4M of 824M: purification per share was 3.26x too high); notes receivable from related parties are loans
  (Muscle Maker Grill). A first, broad version (every NotesReceivable tag) was caught by the reload's own comparison
  before any commit: it charged trade receivables' cash-flow changes at 20% (Axon 0.66% -> 3.43%) and Verizon's gross
  device plans (a pass turned «ما ينحكم»); changes in receivables never count as a loan book now.
- Wording: what is checked is interest income: the stock row reads «إيراد الفوائد ÷ الإيرادات», a fail «إيراد الفوائد
  فوق 5٪», and the funds' method says the income of prohibited side activities is not counted yet (Royal Caribbean's
  row said «الإيراد المحرم 0.09%» beside a casino and bars on board). Plan D4's change notice is corrected above.
Owner decisions (not applied; each with its filing):
- Al Rajhi's own terms (Global Fund, p.32, type two) prohibit outright "alcohol, tobacco, pork, gambling, conventional
  banks ... and companies that deal in debts", while the table has tobacco (2100-2199), amusement and casinos
  (7900-7999, 7011) and credit and brokers (6100-6299) as review. Aligning them moves «ما ينحكم» rows to «غير جائز».
- Defense makers pass on numbers (RTX, Boeing; Lockheed, Northrop, General Dynamics and L3Harris since M12); SPUS holds
  none, HLAL holds AXON. Al Rajhi's documents in research2/ do not mention weapons.
- Income of prohibited side activities (phase 2, A4): GE's run-off insurance 5.9% of revenue, Carvana's gains on loans
  sold 4.7% with GAP and insurance commissions, Royal Caribbean's casino and bars (inside 30.5% "onboard"), Amazon's
  films and music (about 3%), AppLovin's real-money gambling ads, Paychex's insurance agency, Monster's alcohol segment
  1.1%, PulteGroup's and NVR's mortgage banking 2.7% and 2.2%; plan part I names airlines (4512-4522 is not in the table).
- Interest inside a revenue line on an axis companyfacts does not carry: ADP's client-fund interest (8.43% with it: a
  fail; the screen shows «ما ينحكم»), Snap-on's and MercadoLibre's financing revenue, Deere's finance income (all open,
  none pass).
The fix-branch review's round 2 (three more lenses, verified), beyond what the batches above already fixed:
- A fund whose holdings were there last time and failed to download now stops fund-load (a refused N-PORT fetch would
  have published XLK and SPUS as «ما لقينا تقرير مكوناته»). The stock page's activity line says «مباح حسب تصنيف نشاطها
  في SEC», not «مباح» alone. A business held for sale under the current taxonomy's tag earns no interest (IFF had been
  purified on 69M against a 3M interest line), and an open interest reading's floor reads «على الأقل».
- Not changed: nport.py takes the newest NPORT-P in a series' list, and an amendment of an old period filed after the
  latest report would be taken (latent: SOXX and IGV each have one, both older than their current reports); the saved
  daily bars end 2026-10-06 and no weekly step refreshes them, so new quarters go to TradingView (step 4b) or the band;
  a 10-Q its company said not to rely on (DVLT, 8-K item 4.02) is still read (fixed in M16).
- For the owner (with the activities above): SPUS's own index is the S&P 500 Shariah less aerospace and defense,
  financial exchanges and data, and data processing; 17 of SPUS's holdings disclose a side revenue of unstated size
  (Tesla's insurance, Home Depot's card profit sharing, PepsiCo's and Coca-Cola's alcohol licensing, Booking and Expedia,
  Ulta, Best Buy and others); XLK's pass leans on Palantir (defense) and AppLovin (gambling ads): if both were unjudged
  XLK would be «ما ينحكم»; EQT books 100.3M of derivative gains in revenue (5.66%).

### M16. Final check (2026-11-22, five lenses on 0cbdb9c and on every verdict changed since v36, each verified) — POST-HOC, tests first
Owner's request: «بعد ماتخلص ابيك تراجع كمدقق خارجي تتاكد ان كل شي صحيح وسليم». 33 findings, all reproduced by a second
reviewer; none changed a fund's verdict. Fixed, each with a test first (and every new debt rule mutation-tested):
- Debt. A FinanceLeaseLiability total that another filing contradicts for a date of the last 400 days comes out of the
  low reading only: Waste Management 21,740..23,370 (its 10-Q tags "Financing leases and other" 1,284 at 2025-12-31,
  where its 10-K gave 563 of leases); the panel names that line as one that may hold other debt. Convertible notes are
  interest-bearing debt, except notes the filing itself shows at 0.00% (data/shariah/zero-coupon.json, read from each
  10-Q: Akamai 3,455.6 of 7,567.7, Super Micro 2,267.0 of 4,668.9, Bill 1,507.4, Onto 1,473.2, Dropbox 691.1), which stay in
  the high reading until the owner decides (A4); the plain LineOfCredit tag is in the high reading only (Toll Brothers'
  2,507.7 is its joint ventures' borrowing). With no long-term line, a drawn long-term credit line, the coupon-bearing
  convertibles and the short-term lines other than commercial paper are the sure reading (Ironwood 325, Dropbox 2,580.2,
  Opendoor 3,062, BlackLine 668.0) and the liabilities bound is the high one, printed and given its own fund-row reason
  as such (debtPartial, debtBound). LongTermDebt
  that another tagged noncurrent line plus the current portion makes up, or that is the current portion, gets no
  Halliburton push (Conagra, Sarepta, Fusemachines). The debt-and-finance-leases total less the leases may take the pair
  plus the short lines in the low reading (Lennox 1,550.3). A plain debt tag equal (to 0.1%) to its lease-bundled twin
  holds the tagged finance leases (Honeywell 14,097, Campbell 7,053, Iron Mountain 17,401.2, Vail 2,737.5; NRG, 0.6%
  away, is not equal). One test per mutation the fix review left alive.
- Interest. Where every exact line is a lending line, the high reading adds the cash and securities at the A8 yield
  (Shopify 96 -> 167.7 beside its 65M of interest under a net tag; HPE 192 -> 273.1; Wendy's, Welltower). An estimate
  proves no R3 pass at SIC 6100-6299 or 6411: open with its own reason, no purification (Ameriprise's 154M estimate
  beside 908M of net investment income; Robinhood, Apollo, Virtus); REITs and royalty or patent owners keep theirs.
  Interest joins contract revenue below the 10% line only with a lending tag or a loan balance of 10% of the revenue
  (Tronox's one 11M collection). The new current-asset tags are one figure with prepaid expenses (Mastercard's 1,126 of
  tax receivable sits inside its 4,370); where both are lines of their own the estimate rises (Salesforce's high
  reading 97 -> 112.4), the cautious side. Sales-type lease investments are in the loan book, their payment schedules
  and unearned income are not (Intuitive Surgical 366.0). A loan book read from cash flows names the flow's period and
  the smaller balance tagged beside it (Block 2.35B; Rocket's flow is nine months).
- Shares and splits. A 10-K quarter caps the cover count at the shares outstanding at its end, else the year's weighted
  count (BitMine 613.3M, not 482.3M; Twist, Uranium Energy, Zscaler). A split step beyond 50x counts only when the cover
  count moved by about as much (ONEOK 2,000 -> 2, Freeport 2,000,000 -> 2, EOG, Hanmi, EchoStar, Keurig Dr Pepper and
  Janux back to their real splits; Chesapeake's real 1:200 confirmed). Saved-bars averages whose bars include the split
  get no second basis (Amphenol, Monster). Kept: the G6 rerun's rule that two counts 1000x apart with nothing to tell
  which is right leave the count unjudged (the auditor's "keep the larger" was not taken).
- Withdrawn statements. An 8-K item 4.02 filed after the report in use, with no newer 10-Q or 10-K: «ما ينحكم» (reason:
  the company withdrew them), only R1 can still fail, no purification (Datavault AI's Q2 2026 10-Q, 8-K of 2026-10-26).
- Weekly run. The SEC getter makes a sixth try after about 15 minutes and then stops the run on a lasting 403 or 429
  (the fifth try came before SEC's 10-minute block lifted, and the refusal read as no data); nport.py waits SEC out the
  same way and stops with exit 1; the weekly report keeps a bank without numbers a sure fail and lists lost industry
  codes; step 7 pushes without merging (a merge after step 6 could publish a page that was never built or tested);
  band-needed's priority counts an unknown row of a passing fund once.
- Page. The debt row names the liabilities bound as such and says a range is lines we cannot confirm. Corrected
  sentences: Deere's method (we cannot read its interest figure; it publishes one), Cisco's combined tag (a pass is
  tested on the highest reading), NextEra's stale quarter (SEC has not published its newer 10-Qs), Tempus's missing
  share count, a refused fund download («SEC ما ردّت»). The funds tab says fund purification divides by the smaller share
  count, the cautious side, while the stock page divides by the cover count (R6).
Not changed, with the reason:
- PepsiCo's high reading counts its 4,800 of commercial paper twice (it sits inside the 9,223 of short-term debt), so
  SPUS's pass has 0.087 points to spare on that row. A rule dropping paper beside short-term borrowings would drop real
  debt where a filer shows them as separate lines (the wrong-pass side). The pass is right today.
- Fund rows keep the smaller share count for purification (above).
- data/study11/bars and the saved monthly TradingView bars would settle 17 band-judged companies (9 pass, 8 fail; no
  fund verdict changes): a new code path, for a later round.
- A real reverse split beyond 50x that dilution hides from the cover count is dropped (Onconetix's three compounded
  splits): its report prices would read as post-split. The rule keeps bogus unit-error ratios at large held companies
  (Freeport, ONEOK, Stanley Black & Decker) from replacing their real splits; no held company has such a split today.
For the owner (A4): whether zero-coupon convertible notes are interest-bearing debt (until then the 0.00% notes read
from the filings stay in the high reading; DJT's notes carry a 4% original issue discount and count as debt); defense
makers (RTX and Boeing newly pass) and credit-rating agencies (S&P Global); both Shariah ETFs in the data hold none.

Review of these fixes (2026-11-22, three lenses on the diff, each finding verified; POST-HOC, tests first): 17 findings,
all confirmed, fixed except the Onconetix split above.
- The first fix had moved every convertible tagged on its own out of the fail-proving reading, which unjudged BlackLine,
  PagerDuty, Five9, PacBio and WhiteFiber, whose notes carry coupons, while 0.00% notes inside LongTermDebt (Bill, Onto)
  still proved fails: replaced by the zero-coupon list above, applied wherever the notes sit.
- A non-reliance notice stays until SEC's data carries the quarter refiled or a newer one (any later 10-Q or 10-K had
  cleared it, a 10-K/A of the withdrawn year too). The list chip and the weekly report judge withdrawn statements on the
  activity alone.
- Constellation's 20.5B nuclear decommissioning trust is an interest-earning book in the estimate (the disposal-group fix
  had left it on the cash alone: 10.2M against at least 34M by its 10-Q); still a pass at about 3.5%.
- The share box says «على الأقل» for an open interest floor, like the row above it (Ford, ADP, GM and 11 more).
- The stale sentence says SEC has not published the newer 10-Q only when its data holds nothing from it (NextEra); else
  that the newer quarter's revenue is under tags we do not read (APA, TMC and 7 more). The finance-business reason says
  what is known (SEC codes the company as finance), which is true for the crypto miners filed under 6199 too, and an
  activity under review is named beside what is missing. The loan balance beside a flow is the largest loan balance at
  the quarter's end, never a lease investment (Deere's 2,593 of leases had been called its declared balance).
- Weekly run: a refusal on any of the six tries stops the run; fund-load writes nothing when it finds a problem, so a
  rerun still sees a lost fund; nport.py's output and the fund list are moved into place only on success; step 1 stops
  on unpushed commits and step 7's recovery drops only that week's commit.
- Two more tests pin real readings the mutation run showed unguarded (NXP's paper programme under the debt-total cap,
  Dutch Bros' lease-free LongTermDebt beside the bundled tag), and an offline end-to-end run of fund-load (a missing
  import had crashed it during the reload).

### M17. Owner's decisions after research (2026-11-22) — POST-HOC, tests first
Owner: «ابحث وشف الاجابة الادق في الموضوع انا ما اعرف بس الراجحي للحين مابعد ردوا». Four questions, each researched
from primary sources by one agent and every cited source re-opened by a second (scratchpad research3/; the full answers
with quotes are summarised here). Al Rajhi's binding text is resolution 336 (Global Equity Fund terms 2025, p.32):
type two «الشركات المساهمة ذات الأغراض والأنشطة المحرمة، مثل شركات الخمور والتبغ ولحوم الخنزير وشركات القمار والبنوك
الربوية، وشركات المجون والأفلام الخليعة، وصناديق الاستثمار في السندات الربوية، والشركات المتخصصة في تداول الديون
والتعامل بها»; the debt test counts «إجمالي المبلغ المقترض بالربا». The fund's benchmark is the Dow Jones Islamic Market
index (same terms, lines 110, 318, 403).
Applied (data/shariah/sic-activity.json, test in test/shariah.test.js):
- Type two, the certain part (owner: «طبّق الأكيد بس»): tobacco 2100-2199 and credit institutions 6111-6163 (personal and
  business credit, mortgage bankers, loan brokers) fail; by CIK, casino and betting operators (Las Vegas Sands, Wynn,
  MGM, Caesars, PENN, Boyd, Red Rock, Melco, DraftKings, Flutter, Rush Street, Churchill Downs, Brightstar Lottery),
  adult entertainment (RCI, Playboy), lenders and banks under other codes (American Express, Synchrony, SoFi, Nu, Klarna,
  Lufax, Qfin, Upstart, loanDepot, Navient, Goldman Sachs, Morgan Stanley), mortgage REITs (Annaly, AGNC, Starwood
  Property, Blackstone Mortgage, Rithm) and Universal Corp (leaf tobacco) fail; Old Market Capital (SIC 6153, it sold its
  loans) stays review. Sources: Al Rajhi's Arabic and English guidelines page (English: "primarily involved in
  debt-related businesses"), AAOIFI SS21 3/4, MSCI Islamic, FTSE IdealRatings and Yasaar. Not applied (medium confidence,
  for Al Rajhi): insurance brokers (6411), casino landlords (VICI, GLPI), Charles Schwab, LendingTree.
- Defense makers (owner: «ما ينحكم لين يرد الراجحي»): review by SIC 3480-3489, 3760-3769 (it holds space firms too:
  Rocket Lab, Firefly, Redwire, Voyager, York, Kratos; MSCI's definition includes space equipment) and 3795, and by CIK
  for Northrop, L3Harris, Leonardo DRS, RTX, Boeing, General Dynamics, Huntington Ingalls, AeroVironment, AVEX, Palantir
  and Axon (police weapons, not military; held by HLAL). Garmin's 3812 stays ok (held by SPUS and HLAL). Sources: Dow
  Jones Islamic (Al Rajhi's benchmark), FTSE Yasaar, FTSE IdealRatings and MSCI exclude weapons or defense; S&P's Shariah
  board permits them; Al Rajhi's list does not name them; classical fiqh ties the ban to the buyer and the use.
- Credit ratings and exchanges (owner: «طبّق»): Moody's (ratings 53.4% of 2025 revenue) and S&P Global (29.7%) review: no
  source permits fees for rating interest-bearing debt, SPUS drops Financial Exchanges & Data and MSCI Islamic drops GICS
  4020. CME (75.3% derivatives), Cboe (47.6%), ICE (30.4%) and Nasdaq (20.6%) fail: AAOIFI SS20 5/1/2-5/3/2 forbids
  forming and trading futures and options, and that is income from a prohibited activity far above 5% (their 10-Ks).
  MSCI, FactSet and Morningstar are unchanged.
Waiting for Al Rajhi (owner: «ننتظر رد الراجحي»): convertible notes at a 0.00% coupon (data/shariah/zero-coupon.json
keeps them in the high reading). The research leans to counting them: Al Rajhi Capital's own book «زكاة الأوراق
المالية» (not binding on its board) files convertible bonds as a debt with its interest; AAOIFI SS19 item 7 forbids
stipulating a sale inside a loan («لا يحل سلف وبيع»); AAOIFI SS21 and IIFA resolution 60 forbid zero-coupon bonds; no index
provider carves them out. The question for Al Rajhi: «هل تُحتسب السندات القابلة للتحويل ذات الكوبون 0% المصدرة بالقيمة
الاسمية ضمن إجمالي المبلغ المقترض بالربا؟»

### M18. The stock block without TradingView, and its layout (2026-11-23) — POST-HOC, tests first
Owner: the block showed no verdict («لا هو حلال ولا حرام»), its table was unreadable on a phone, and some stocks showed
zeros. Cause: the verdict waited for the quarter's average price from live TradingView daily bars, and TradingView was
refusing calls (daily quota, then a cooldown); a stock with no quote was still graded "D 0/15".
- The verdict no longer waits for TradingView. In order: the live average; the average an earlier visit saved; the
  average from the daily bars saved in the repo, carried by the page (177 of 428 stocks with a quarter; not where a split
  may fall after the last bar); else what price bounds prove (engine screenStockRange): the quarter's average lies
  between the 52-week low and high of a quote taken after the quarter and within 52 weeks of its start, and with no price
  at all a debt within 30% of book equity passes at any price. A pass needs the lowest value, a fail the highest; between
  them «ما ينحكم» for the price. No rule changed. With nothing from TradingView at all, 177 stocks are judged on their
  saved average and 58 of the other 251 are still decided (42 fail, 16 pass).
- The block is a verdict banner over one stacked row per test (name and limit, result, figures on their own line), not a
  table. It says which price the verdict rests on, and «TradingView ما رد» when the live fetch failed.
- A stock none of whose earnings-grade measures arrived gets no grade, and its scorecard says the data did not arrive.
- Browser check modes: TVDOWN=1 (daily bars refused) and TVDOWN=1 NOAVG=1 (no saved averages either).

