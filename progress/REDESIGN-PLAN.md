# Plan: a Simply Wall St–style snowflake, an Earnings Hub–style card, and a new look

**Status 2026-11-08: plan only, nothing built.** To be carried out in normal mode, phase by phase, each
phase committed and checked before the next. The user asked for:
1. Reverse-engineering two sites:
   - **Simply Wall St (SWS):** the same information plus its analysis method for every stock.
   - **Earnings Hub (EH):** a card per stock with forward P/E, market cap, earnings and guidance.
2. A livelier design in SWS's style (the user chose "like the same site"), since the current page
   "is not cheerful".

## 0. Sources

- **SWS method:** SWS's own published Company Analysis Model, `github.com/SimplyWallSt/company-analysis-model`,
  licensed CC BY-NC-SA 4.0 (non-commercial use, attribution, share-alike). The checks below are from
  MODEL.markdown. A read-only clone sits at /home/user/simplywallst/company-analysis-model (not in this
  repo). The page's notes credit the model and its licence; SWS's text is not copied.
- **EH score:** from EH's own "Learn more" page, read from the site's app code
  (`EarningsHubScoreLearnMore` chunk):
  - five metrics, each scored against "the 500 most popular stocks on Earnings Hub":
    revenue growth, EPS growth, P/E, forward P/E and P/S (TTM data);
  - per metric, the top 25% of peers score 3 points, the next 25% score 2, the next 1 and the bottom
    25% score 0, so the total runs 0–15;
  - the top and bottom 5% are dropped per metric, and negative P/E and forward P/E are excluded;
  - since a June 2026 update, all five metrics carry an equal 20% weight;
  - the site does not publish how the 0–15 total becomes a letter grade, nor how its "Rank #N"
    (likely user interest) is built.
- **EH card:** the user's screenshot (NBIS, 2026-11-08), plus the site rendered in this session's
  headless Chromium:
  - the stock details need a sign-in after a usage limit, so the screenshot is the source for them;
  - what it shows: price and after-hours price, Rank, an "Earnings Hub Score" letter, market cap,
    P/E, forward P/E, P/S, revenue TTM (+growth) and EPS TTM (+growth);
  - tabs Earnings / Info / Feed / Risk / Analysts / News / Short / Dividends;
  - a quarterly revenue/EPS chart of estimate against actual, and "Revenue beat estimates 3 times in
    6 quarters";
  - a "Q3 2026 Earnings in 4 Days" card with revenue and EPS estimates, and the last quarter's
    estimate against actual with beat %, "Positive Results / Positive Move";
  - a weekly earnings calendar (Mon–Fri, before open / after close, company tiles).
- **SWS look:** not seen yet. simplywall.st sits behind a Cloudflare check that refuses scripted
  browsers, so **the user sends 2–3 screenshots of an SWS stock page** (overview with the snowflake,
  valuation, financial health) before phase 5.
- **TradingView columns:** probed on AAPL, JPM, O, RIVN, KO, 2222 and 1120. The full mapping is in
  `progress/redesign-mapping.md`. Only TradingView data is used, as before.

## 1. What each stock will show

**Header card (EH style):**
- name, ticker, price and day change;
- the **EHS letter** with its five metric chips;
- market cap, P/E, forward P/E, P/S;
- revenue TTM (+YoY) and EPS TTM (+YoY);
- the next report date.

**Detail panel in tabs:**

| Tab | Contents |
|---|---|
| نظرة عامة | Snowflake, rewards and risks, the fair-value gauge (price against the page's fair value), the score |
| القيمة | Value checks, P/E against market / industry / peers, the fair-value methods |
| النمو المتوقع | Future checks: forecast earnings and revenue growth against the market |
| الأداء السابق | Past checks: earnings history, ROE, ROA |
| الصحة المالية | Health checks: assets against liabilities, debt history, coverage, cash runway |
| التوزيعات | Dividend checks: yield against the market, 10-year history, payout |
| الأرباح | The EH earnings view: quarterly bars, beats, next report card, last quarter against estimates |
| More | The current blocks: 5-year forecast, revenue DCF, buybacks, news, ideas |

**Rows and cards in the lists:** a small snowflake and the EHS letter beside the fair value.

### 1.1 The 30 checks, as SWS publishes them, and how we get each from TradingView

A check is **pass**, **fail** or **no data**. "No data" is never counted as a fail, and each axis
shows "x of y checks available". Key: ✅ = as published; ≈ = approximation (its tooltip says what
differs); ✗ = not possible with TradingView data. "Bench" = a market or industry aggregate built by
a script (§3, phase 3).

**Value**

| # | SWS check | Ours |
|---|---|---|
| V1 | Price at least 20% below fair value | ≈ the page's own fair value (SWS: 2-stage FCFE DCF; excess returns for banks; AFFO for REITs) |
| V2 | Price at least 40% below fair value | ≈ same |
| V3 | 0 < P/E < market P/E | ✅ bench |
| V4 | 0 < P/E < industry P/E | ✅ SECTOR_PE (US); a Tadawul sector bench is new |
| V5 | 0 < PEG < 1 | ≈ next-FY forecast growth; not TradingView's PEG column, which uses trailing growth |
| V6 | 0 < P/B < industry P/B | ✅ bench (needs `total_equity_fq`) |

**Future** (SWS uses 1–3-year analyst growth; TradingView has next FY only, so all are ≈)

| # | SWS check | Ours |
|---|---|---|
| F1 | Earnings growth > savings rate + inflation, or turning profitable within the forecast | Rate constant per market |
| F2 | Earnings growth > market | Bench |
| F3 | Revenue growth > market | Bench; banks: no data (the revenue bases differ) |
| F4 | Earnings growth > 20% a year | |
| F5 | Revenue growth > 20% a year | |
| F6 | ROE in 3 years > 20% | Next-FY EPS ÷ book per share (close ÷ P/B) |

**Past**

| # | SWS check | Ours |
|---|---|---|
| P1 | EPS growth last year > industry | ✅ bench |
| P2 | EPS now > EPS 5 years ago | ✅ saved fiscal-year EPS |
| P3 | Last year's EPS growth > 5-year average growth | ✅ |
| P4 | ROE > 20% | ✅ `return_on_equity` |
| P5 | ROCE higher than 3 years ago | ≈ EBITDA ÷ total assets now against 3 years ago (no ROCE history) |
| P6 | ROA > industry | ✅ `return_on_assets` + bench |

**Health, ordinary companies**

| # | SWS check | Ours |
|---|---|---|
| H1 | Current assets > current liabilities | ✅; REITs fall back to `current_ratio_fq` |
| H2 | Current assets > long-term liabilities (total − current) | ✅ |
| H3 | Debt to equity not up over 5 years | ≈ debt ÷ assets (no equity history) |
| H4 | Net debt to equity < 40% | ✅ |
| H5 | Operating cash flow > 20% of debt | ✅ `cash_f_operating_activities_ttm` |
| H6 | EBIT > 5× interest | ✅ `interst_cover_ttm` (TradingView's spelling) |

- **Loss-makers:** H5 and H6 become cash runway > 1 year at today's burn, and at the burn's own
  trend (✅).
- **Banks:** only leverage, assets ÷ equity ≤ 20×, is possible. The other five bank checks need
  loans, deposits and bad-loan data, which TradingView does not have (✗). The axis is shown as
  "1 of 6 available", not as a 1/6 score.

**Dividend**

| # | SWS check | Ours |
|---|---|---|
| D1 | Yield > the market's 25th percentile of payers | ✅ bench |
| D2 | Yield > the 75th percentile | ✅ bench |
| D3 | Paid for ≥ 10 years with no yearly drop above 10% | ✅ `dps_common_stock_prim_issue_fy_h` |
| D4 | DPS higher than 10 years ago | ✅ same |
| D5 | Payout < 90% (REITs 100%) | ✅ ttm, falling back to fy when ttm is 0 (2222) |
| D6 | Payout in 3 years < 90% | ≈ next FY |

**Snowflake drawing (as SWS describes it):**
- each axis is 0–6, one point per passed check;
- the larger the total, the larger the shape;
- the more checks pass, the greener the colour, and the fewer, the redder;
- the total sets the colour on a red → orange → yellow → green scale.

### 1.2 EHS: the EH score, rebuilt

- **Metrics:** revenue growth TTM, EPS growth TTM, and P/E, forward P/E and P/S, where lower ranks
  better.
- **Benchmark:** a fixed set per market, built offline into `pages/bench.json`:
  - US: the S&P 500 (EH uses its own 500 most popular stocks, which we cannot see);
  - Tadawul: the TASI constituents (the user's choice).
- **Scoring:**
  - trim the top and bottom 5% per metric, drop negative P/E and forward P/E;
  - 3/2/1/0 points by quartile, total 0–15;
  - a negative or missing ratio scores 0 and is labelled.
- **Letter (ours, since EH does not publish its rule):** the quartile of the total within the
  benchmark, A to D, so it is graded on a curve as EH describes. "Rank" is left out.

### 1.3 The earnings tab (EH)

- **Quarterly revenue and EPS bars:** from the saved quarters (`q/` docs, up to 16 quarters).
- **Estimates and surprises:** phase 1 probes which history TradingView serves
  (`*_forecast_fq`, `*_surprise*`, `earnings_release_next_date` / time). If only the latest
  surprise exists, the beat count is built forward from a log kept in the db.
- **Next report card:** date, before or after market, revenue and EPS estimates.
- **Last quarter:** estimate against actual, with the beat %.
- **The price move after reports:** from daily bars around each report date. This is optional; it
  costs one ohlcv call per stock opened.

### 1.4 Earnings calendar tab (EH)

- The user's US and Saudi stocks reporting this week, by day and before open / after close.
- It uses the quotes already loaded, with no extra calls.
- Company tiles show the ticker initials, because external logos are probably blocked by the page's
  sandbox.

## 2. Design direction: SWS-like, our own

- **Look:**
  - dark navy by default, with the light theme kept;
  - rounded cards (about 16 px) and bigger, bolder numbers;
  - check rows with green ✓ and red ✗ marks and grey "no data";
  - the snowflake in a red → green gradient;
  - a horizontal fair-value bar ("undervalued / overvalued by X%");
  - EH's coloured letter badge;
  - the weekly calendar grid for earnings.
- **Arabic and RTL first:** IBM Plex Sans Arabic stays. The layout is tested at 1280, 768 and
  390 px, in light and dark.
- **Not their brand:** no SWS or EH name, logo or copied text. The Arabic wording is ours. The notes
  credit the SWS model (CC BY-NC-SA 4.0) and the EH score idea.
- **From the user's SWS screenshots (AAPL, 2026-11-08):**
  - **Colours:** near-black charcoal background (not navy), slightly lighter cards, gold/amber accent
    for buttons, links and the active nav item; green for good, red for bad.
  - **Type:** serif headings (company name, section titles), sans for the body, big bold numbers
    (e.g. "37.6x P/E Ratio").
  - **Layout:** a hero header with the price, the fair value, a small price-vs-fair-value line chart
    and a "Fairly Valued" label; a left sidebar (right side in RTL) holding a mini snowflake and
    numbered sections (overview, 1 valuation, 2 future growth, 3 past, 4 health, 5 dividend…).
  - **Snowflake:** a gold/orange filled blob on dark concentric rings, with the axis names written
    around the circle.
  - **Overview:** Rewards (green stars) and Risk analysis.
  - **Valuation:** red ✗ circles with a red bold lead-in ("Below Future Cash Flow Value: …"); PE / PS
    / PB tabs; a donut of market cap against earnings and revenue.
  - **Other blocks:** competitors as mini snowflakes; shareholder returns 7D / 1Y against industry
    and market; a low-to-high volatility gauge; earnings and revenue as a waterfall (revenue → cost →
    gross profit → other expenses → earnings).
- **From the second batch of screenshots** (10 in all):
  - **Check rows have three marks:** a green ✓ circle (pass), a red ✗ circle (fail) and a red ⚠
    triangle (insufficient data), each followed by a coloured bold lead-in and one sentence with the
    number, e.g. "Debt Level: AAPL's net debt to equity ratio (20.9%) is considered satisfactory."
  - **Chart conventions:**
    - a "Past | Forecast" split, with the forecast years shaded gold;
    - a hover box (date, then the values in their series colours);
    - legend chips that toggle series;
    - Data and ⋯ buttons under each chart.
  - **Analyst price targets:** the price in blue, the average 1-year target in purple with a band,
    agreement "Good" when the targets spread less than 15% from the average, and the check "target
    lower than price". TradingView has the target average, high and low, so the band can be drawn.
  - **EPS growth:** the actual line, then the analysts' forecast as a teal cone. We have next-FY
    only, so the cone covers one year.
  - **Future ROE:** a red → yellow → green half-circle gauge, company against industry.
  - **Revenue and expenses:** a flow (Sankey) from revenue to gross profit and cost of sales, then
    earnings and expenses. We have no segment or expense split, so ours is revenue → gross profit /
    cost → net income / other.
  - **Debt to equity history:** debt (red area) against equity (blue area). With no equity history,
    ours is debt and total-assets history with today's equity, labelled as such.
  - **Dividend stability:** yield (blue area), payments (teal bars), annual amount (purple steps) and
    the forecast zone. We have DPS history, the current yield and the next-FY payout.
- **Tadawul benchmark:** the TASI constituents (user, 2026-11-08); the US uses the S&P 500.

## 3. Phases

| # | Phase | Output | Checks |
|---|---|---|---|
| 0 | User | SWS screenshots (10 received, done); benchmark OK'd: S&P 500 and TASI | — |
| 1 | Data probe, 1–2 batch calls | Confirm the ~20 new quote columns, `dps_*_fy_h`, and the earnings estimate and surprise columns; update `redesign-mapping.md` | — |
| 2 | Engine | `engine/snowflake.js` (30 checks → `{axis, id, status, value, threshold, note}`) and `engine/ehs.js`, both inlined by `build-stocks-page.js` | Unit tests on the 7 probe stocks' real rows |
| 3 | Benchmarks | `scripts/build-bench.js` → `pages/bench.json`: market and industry P/E, P/B, ROA, EPS growth, forecast growth, yield P25/P75, EHS quartile cut points, for US and Tadawul (2–4 `run_screener` calls), inlined like `sector-pe.json` | Spot-check against known values |
| 4 | Data layer | Add the columns to `COLS`, which costs no extra calls; add a DPS history series; every new value may be missing | Mocks updated; FETCH, DUE and WIPE checks |
| 5 | UI | New theme tokens; header card; tabbed detail panel; snowflake SVG; check lists; earnings tab; calendar tab; mini snowflake and letter in the lists | Harness selectors kept, or updated in the same commit; new SNOWFLAKE CHECK |
| 6 | Verify | npm test, the browser checks, MU check, `measure.cjs` before and after, screenshots at 3 widths × 2 themes, one independent review | Everything green |
| 7 | Publish | v26 to the same artifact URL, progress notes, reply | — |

- Phase 5 may ship in two publishes: v26 brings the theme, header card, snowflake and EHS; v27 brings
  the list view, the calendar and polish.
- **Optional, only if the user asks:** a pre-registered study (the next free number; 17 is taken) on whether the snowflake total or
  EHS sorts the next year's returns. Only checks with history can be backtested: value, past, part
  of health, and dividends.

## Progress

- **2026-11-08, phase 1 (data) done:**
  - **Last quarter:** TradingView gives the EPS estimate and actual (`earnings_per_share_forecast_fq`,
    `earnings_per_share_fq`) and the surprise % for EPS and revenue (`eps_surprise_percent_fq`,
    `revenue_surprise_percent_fq`, `revenue_forecast_fq`).
  - **Next quarter:** the date (`earnings_release_next_date`), the time
    (`earnings_release_next_time`: 1 = after the close, −1 = before the open, 0 = not given) and the
    estimates (`*_forecast_next_fq`).
  - **No estimate or surprise history:** neither `_fq_h` nor get-forecasts nor get-earnings-calendar
    has it. So the "beat N of M quarters" line is built forward: the page saves each quarter's
    estimate and actual to the db as it sees them.
  - **Dividend history:** `dps_common_stock_prim_issue_fy_h` works (AAPL 20 years, 2222 7 years).
  - **Fixture:** a full row for the 7 probe stocks in test/fixtures/snowflake-quotes.json, saved by
    scripts/fixture-from-transcript.js.
  - **MU check:** its clock is pinned to the fixture's day.
- **2026-11-08, phase 2 (engine) done:**
  - engine/snowflake.js holds the 30 checks: pass, fail or na, the value, and an "approx" flag.
    Growth is measured as SWS measures it (change ÷ the mean of the absolute values).
  - engine/ehs.js holds the score, the cut points and the letter.
  - Both are inlined in the page build. test/snowflake.test.js runs 7 tests on the real rows.

- **2026-11-08, phase 3 (benchmarks) done:**
  - **Inputs:** scripts/build-bench.js turns data/bench/2026-11-08-{sp500,ksa}.json into
    pages/bench.json.
    - The S&P 500 came in two run_screener calls (the size limit), 499 companies once share
      classes count once.
    - The TASI set is the Tadawul main market, 271 companies: the screener has no TASI index, so
      Nomu (codes starting with 9) is dropped.
  - **Method:** medians as in SWS's industry_averages.markdown; a first build with weighted
    aggregates gave the US 33% forecast EPS growth, against the median's 11.8%.
  - **Fallbacks:** industries need ≥ 5 members, else the engine uses the sector.
  - **US industry benchmarks** come from the S&P 500 itself, which saves calls.
  - **Results:**

    | | US | Saudi |
    |---|---|---|
    | P/E | 23.2 | 16.1 |
    | P/B | 3.64 | 1.52 |
    | Next-FY EPS growth | 11.8% | 4.2% |
    | Next-FY revenue growth | 7.6% | 7.4% |
    | Yield P25 / P75 | 0.97% / 2.90% | 2.97% / 6.38% |
    | EHS total cut points | 5 / 7 / 10 | 3 / 5 / 8 |

## 4. Honesty on the page

- The snowflake and EHS are descriptive summaries, "not tested on our data", like study 14's
  reported-only ranks.
- Each approximate check says how it differs from SWS.
- Banks show a partial Health axis.

## 5. Known issues to handle first

- **`test/pages/mu-fair-check.cjs` fails since 2026-11-01** ($1478.63 against 1650.71). The
  harness runs on the real clock while its fixture is from 2026-10-23, so it needs a fixed clock.
  `measure.cjs` counts this check in its safety score.
- **The page is a table restyled as cards.** The harnesses rely on `#rows tr.row`, `tr.detail`,
  `td:nth-child(3)` (fair value), `data-label`s, `.fair-list`, `.part h3` and more; the full list is
  in the 2026-11-08 inventory.
- **The db belongs to the artifact URL:** always republish to
  https://claude.ai/artifact/TUkdHCEyfRfBorus6K5MDa.
- **Engine exports become one script scope**, so names must be unique, and a new engine file must be
  added to `build-stocks-page.js`.
- **The network now allows** simplywall.st, support.simplywall.st, earningshub.com and the Savvy
  Trader API, image and static hosts (added 2026-11-08, for research only; the page still uses
  TradingView only).
