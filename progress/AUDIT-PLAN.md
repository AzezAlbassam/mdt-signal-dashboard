# Audit of 2026-11-10 and the remediation plan

Audit only: nothing in `engine/` or `pages/` was changed. This file is the work order for the session
that implements it. Work top to bottom; each item says what is wrong, where, the fix, and how to test.

Evidence (probe scripts that reproduce each finding, raw numbers, screenshots) is in
`progress/audit-2026-11-10/`: `engine/` (run `node <file>`), `page/` (headless page probes), `live/`
(14 stocks on TradingView data of 2026-11-10, `per-stock.txt` first), `ui/` (harness + `shots/`).
Paths inside the probes point at the audit session's scratch folder; change them to the repo.

## Rules for the implementer

- `npm test` (423 passing today) and the browser checks (`test/pages/stocks-browser-check.cjs`,
  `test/pages/mu-fair-check.cjs`) pass before and after every phase.
- Before Phase 1 and after each of Phases 1–3 run `test/pages/measure.cjs` and keep the per-stock diff
  (old fair value, new, reason), as was done for v24/v25. Put the diff table in the change log.
- Studies are pre-registered: never edit a `PROTOCOL-*.md` or a study script. Every page-side change is
  marked `POST-HOC (date)` in a comment with its example, as the existing ones are.
- A **bug** (the code does not do what the page says it does) is fixed directly. A **method choice**
  (which method, which weight, which company class) goes through a pre-registered study first, with
  Study 16's decision rule; where the data to test it does not exist, it is adopted "by reasoning" and
  the page says "untested" beside it. Phase 2 lists which is which.
- Turn each probe you use into a unit test or a browser-check case; do not leave a fix without one.
- One version per phase (v28, v29, …), each with a change-log entry in `pages/stocks.template.html`.
- TradingView is the only data source for the dashboard. Do not spend its daily quota on bulk refetches.

## What the audit found, in one paragraph

The arithmetic is right: for 14 stocks every TTM sum, 60-month median, method value, DCF and blend was
recomputed independently and matched within 1% (except the share-count item 1.4). Array order, fiscal
labels, split and bonus restatement, ADR units and the Tadawul previous-close market value are handled
correctly. Escaping is sound. The defects are (a) four places where the live path mixes bases or steps
with the calendar, (b) company classes sent to a method that does not fit them (REITs and capital-light
financials, cyclicals at peak, loss-makers that are normally profitable), (c) data-freshness and quota
behaviour, and (d) a list that is slow and long on the phone. Note what Study 16 already says about
measurement (`reports/study16.txt`): the fair value's median error against the price a year later
(0.30 on the widest set, 5,546 stock-years; 39% of values land within 25%) is about twice that of "the
price stays where it is" (0.16), and the rank correlation
of upside with next-year return is about zero. The page must keep saying that plainly; the fair value is
a description of what the methods imply, not a forecast.

---

## Phase 1 — bugs that change numbers (fix directly)

### 1.1 After a split the saved fundamentals stay unadjusted  [high, reproduced]
`pages/stocks.app.js:225-235` (fundsDue), `:287-319` (pxDue, loadPx). Prices are refetched split-adjusted
(52-week rule) but fiscal years and quarters only when a newer period appears, so until the next report
history multiples are off by the split ratio. 10-for-1: fair $1.05 at a $10 price, and the one correct
method (DCF) is trimmed as the outlier. 2-for-1: $30.75 at $50, not flagged weak.
**Fix:** when `loadPx` rebases (the line-309 branch or the 52-week rule), set `rebase: true` on the
cache doc; `fundsDue` is true while it is set; `loadFunds` clears it.
**Test:** `page/split.cjs`, `page/split2.cjs` → a case in stocks-browser-check: one fundamentals call,
fair ÷ price unchanged.

### 1.2 The DCF's first-year growth is counted twice  [high, confirmed]
`pages/stocks.app.js:392-409` (liveDcf), `:904-908` (analysts), `:451` (projectAt gets the same rate).
`g1 = revenue_forecast_next_fy ÷ total_revenue_fy − 1` is applied to **trailing-twelve-month** free cash
flow, which already contains the part of that growth reported since the fiscal year closed. KO: forecast
+4.2%, TTM already +6.3% above the year, the page still adds +4%. TSM: 41.1% used, 10.3% left. Synthetic
+40% year: DCF 54.8 after Q1, 64.8 after Q3, 29.7 after Q4.
**Fix:** growth from the TTM base: `revenue_forecast_next_fy ÷ total_revenue_ttm − 1`, annualised over
the time from `fiscal_period_end_fq` to the forecast year's end (floor the span at one quarter), same
clamp. Pass the same rate to `projectAt`. Keep the caption honest about what the rate is.
**Test:** `engine/p_g1.mjs`: the Q3 → Q4 step moves the value by under ~15%.

### 1.3 Fair values step every May with no new data  [high, confirmed]
`engine/fairvalue.js:46-49, 113-114` (liveShift). The shift is a whole fiscal year decided by the "May"
rule, so in Feb–Apr a history month reads a fiscal year that had not ended yet, and everything jumps in
May. Same data and prices, 385 stocks: April vs May fair value differs by more than 10% for 129, more
than 20% for 47 (AXON 125.5 vs 226.4).
**Fix (live mode only; the studies keep their rule):** fiscal year Y is usable from its own end month
plus 3 months, using the saved `fiscal_period_end_fy` (walk back 12 months per earlier year).
**Test:** `engine/p_shift.mjs` as a unit test (advance the clock one month, nothing reported → values
within 1%); the MSFT case of the 2026-10-18 fix still holds.

### 1.4 Share counts  [medium, confirmed]
(a) Today's per-share values use the weighted diluted count unless it is more than 10% off
(`engine/fairvalue.js:126-131`), while the DCF beside them uses the quote's count. RIVN: 1.321B vs 1.456B
outstanding, fair 14.71 instead of 13.71 (upside +5% instead of −2%). **Fix:** `sharesNow` always for
the current month; restate EPS only on dilution, as now.
(b) History months take net income ÷ summed quarterly EPS; a near-zero EPS gives absurd counts (CVNA
Q3 2024: 10,000M shares, P/S 37 that month against 2.4–3.5 around it; MCHP, RKT, TKO). 60 of 439 stocks
have at least one. **Fix:** clean the series with the first pass of `steady()` in `engine/svr.js`
(|EPS| ≥ 0.005 guard) and take the nearest good neighbour.
**Test:** `engine/p_shares2.mjs`, `engine/p_one.mjs NYSE_CVNA`: no history count more than 1.5× from
its neighbours; RIVN's P/S equals market value ÷ revenue.

### 1.5 Quotes are never saved; one bad answer blanks rows  [high, reproduced]
`pages/stocks.app.js:172-183, 248, 425, 502-508, 539`.
- On a day the quota is spent a cold start shows 700 grey skeletons although fundamentals and prices are
  saved, and the notice claims saved data stays visible. **Fix:** save the last quotes per 50-symbol
  chunk (at most every few hours), render from them with their date when the fetch fails, and turn
  skeletons into "—" on failure. Carry the payload's error text into the thrown error so the quota
  message matches (`success: false` is the batch tool's 429 path).
- A partial batch leaves its symbols in neither `data` nor `missing`: rows stay skeletons and the status
  says "updated". **Fix:** any requested symbol in neither list goes to `lost` (as loadFunds does, :257).
- `compute` runs inside the batch's try: one malformed doc fails 50 stocks. **Fix:** try/catch per symbol.
- An empty first fundamentals answer sets `missing: true` until the next fiscal period, and the refresh
  button cannot retry it; all-null quarterly arrays overwrite good saved quarters. **Fix:** treat an
  answer with no revenue, EPS or net income as null; expire `missing` after 3 days; the button bypasses
  `fundsAt` for stocks without `fin`.
**Test:** `page/probes2.cjs quota|partial|missing`, `page/probes.cjs poison|clobber`.

### 1.6 A thin or weak estimate looks like a normal one  [medium, reproduced]
`pages/stocks.app.js:672-680`. A stock without monthly prices shows a fair value built on 35% of its
weights, not dim (81.38 vs 94.00). Sorting by "cheapest" puts weak estimates first (+11,656%).
**Fix:** `weakFair` also returns a reason when coverage < 0.6 or there are fewer than 12 monthly closes;
retry an empty price answer after 1 day; the upside sort puts weak estimates last (or a "hide weak"
toggle, on by default).

### 1.7 Earnings card compares different bases  [medium, reproduced on real rows]
`pages/stocks.app.js:1373, 1474-1486`. Revenue: banks and Saudi names show gross interest income against
analysts' net revenue (JPM "expected 51.2B, actual 76.8B, difference −2.1%"). EPS bars are GAAP, the
estimate marks adjusted (RIVN −0.63 vs −0.48). **Fix:** when actual ÷ estimate − 1 differs from the
reported surprise % by more than 2 points, show actual = estimate × (1 + surprise) and drop the chart's
estimate bar and mark for that metric. **Test:** JPM, 1120, RIVN rows.

### 1.8 Snowflake  [medium/low, confirmed]
`engine/snowflake.js`, `pages/stocks.app.js:455-457, 1321, 1349`.
- The total depends on whether the stock was ever opened (KO 13 → 17, O 9 → 13): D3/D4 are "fail" and
  P5/H3 "na" without the `h/` doc. **Fix:** fetch `dps_common_stock_prim_issue_fy_h` and
  `total_assets_fy_h` in `loadFunds` and save them beside `fin`; D3/D4 are `na` when the history is
  absent; spread `hist` after `h` so fresher fiscal years win.
- H5/H6 switch to cash runway on FCF < 0; the model says loss-makers. **Fix:** EPS ≤ 0 and a negative
  3-year net income sum.
- P3 is "fail" instead of `na` when EPS five years ago was a loss; V3–V5 are "fail" with no EPS column.
- D5's text reads `c.limit`, which no check carries (a REIT at 95% shows "limit 90%" with a pass).
- One panel shows two P/Es and two PEGs (Aramco 14.2 in the row, 11.6 in the snowflake tile; TradingView's
  EPS there is on a pre-bonus count). **Fix:** pass `peNow` into the tile, V3/V4 and the earnings grade;
  show the column's PEG in V5 or rename V5's.
- A pre-revenue stock's cash floor is passed as "fair value" to V1/V2. Pass null.
**Test:** `engine/p_snow.mjs`, `page/snow.cjs`: totals equal before and after first open.

### 1.9 Quota hygiene  [medium, reproduced counts]
`page/calls.cjs` counts: warm start 15 calls, all tabs 22, first visit of a month +75 (one price call per
favourite, uncapped), unreadable cache 100 on every load.
- Guidance is refetched on every open while the newest summary is older than the last report (2 calls per
  open, no time gate; `:1439-1456`). **Fix:** save `checkedAt` (and the no-document result) in `g/`.
- Skip background fetches when `cacheOk` is false; cap favourites' price calls per visit; keep `bgAt` in
  localStorage (try/catch); reuse quotes for 15–30 minutes instead of 5.
- Nothing refreshes without a tab switch; the status shows a time without a date. **Fix:** refresh on
  `visibilitychange` when older than `BG_MS`; print the date when it is not today.

### 1.10 Small ones (all reproduced unless noted)
- `:910` `Number(null)` is 0: "توقع المحللين لسنة 1 المالية". Require `!= null`.
- `:1466` vs `:1005`: the card counts days in UTC, the chip in the viewer's day ("بكرة" vs "بعد 2 يومين").
- `:1358` the 30-checks `<details>` has no `data-k` and closes on every redraw.
- `:1509-1511, 1548` "الكاش من الأرباح: سالب" when free cash flow was never reported → "—".
- `:1398` quarter labels miss the newest bars: `(rows.length - 1 - i) % 4 === 0`.
- `engine/score.js:60` with under 8 quarters, part E compares against two fiscal years back → `known[-1]`.
- `:1060, 1088, 1562` news and idea links: allow `^https?:` only.
- `:146-147, 971` `save()` and `listSvr` fall back to a full `set()` on any error: only after a `get()`
  shows the doc missing. `:560-574` list edits: `acquire` on the list doc.
- `:1474` green border when both surprises are missing; EHS gives 0 points (red) for a missing metric.
- `:37` the big-25 pool is 29 fixed names from 18 Oct: rebuild it from the screener monthly.
- `:1146` `big()` prints "0 مليون" under 0.5 million. `:1015` `dateOf` range check.
- Template vs code: tpl:361 (revenue "falls" needs −2%), tpl:363/380 (PEG uses forward P/E when there is
  a forecast), the "تاريخي" tooltip, change-log items 30 and 39, the line-539 notice.
- Benchmarks and sector P/E are frozen at build time and shown as "today": print their as-of date.
- No version stamp on saved docs (parsed guidance, `missing`, quarter labels): add `v` per collection.

---

## Phase 2 — method (who gets valued how)

Already tested, do not reopen without new data: Study 16 D6 (Lynch's rule: removing it lowered the raw
error in 12 of 14 years but failed the price-closeness control, so it stays) and D3 (cyclical by own
earnings: not adopted). The audit confirms what D6's signed error showed (the rule cannot give a P/E
above 25; AAPL is valued at 13.5× by it, fair 208 vs 245 without). **Do this much, display only:** in
the method list show the P/E the rule implies ("= مكرر 13.5") so the reader sees why it is low.

### 2.1 Pre-register Study 18 (same error metric, sign-flip by years, Holm, price-closeness control)
Write `PROTOCOL-study18.md` and commit it with its scripts before any result. Decisions to register:

| # | Decision | A (today) | Options | Audit evidence |
|---|---|---|---|---|
| E1 | REITs and capital-light financials (industry: REITs, Finance/Rental/Leasing, Investment Banks/Brokers, Insurance Brokers, Investment Managers, exchanges/data) | Finance profile (P/E only in the backtest; P/E + justified P/B live) | **B** Mature weights; **C** EV/EBITDA + P/S + 5-year-average P/E | O: 42.48 at a 59.50 price, the P/B-from-ROE leg is 6.08; V 59% and MA 52% of price with a neutral P/E; 34 of 85 S&P financials have that leg under half the price (`engine/p_fin.mjs`) |
| E2 | Cyclical at peak: TTM EPS > 2× the 5-year average, or a loss year in the last 5 | sector profile | **B** add the 5-year-average P/E at the Heavy weight and drop Lynch's revenue fallback; **C** B + DCF on average FCF margin × revenue | MU: every weighted method capitalises peak EPS 74 (earlier years 0.7–11.5): 1475–1705 at a 733 price; the 5-year-average method gives 547 with no weight (`engine/p_peak.mjs`) |
| E3 | Loss-maker that was profitable in ≥ 3 of the last 5 fiscal years | Unprofitable growth: 100% own-history P/S | **B** its sector's profile on the 5-year-average and EV methods | 35 of 178 (AAL, INTC, CSIQ): P/S value a median 1.24× price against 0.99× for real growth loss-makers (`engine/p_prof.mjs`) |
| E4 | Outlying method | dropped beyond 3× / ⅓ of the weighted median (Study 16 D2 C) | **B** clamped to the bound; **C** weight tapered; both with a midpoint median at an exact weight tie | MU: P/S 2.7% inside the bound → 1475, outside → 1705 (`engine/p_tie.mjs`) |

Adopt only what passes the registered rule; report the rest as "tested, not adopted".

### 2.2 Live-only, cannot be backtested (no history of forecasts, equity or cash): adopt by reasoning, label "untested"
- **Justified P/B never for REITs** even if E1 keeps the Finance profile otherwise: ROE after
  depreciation is not a REIT's return (O: ROE 3.45% → 0.15× book). Keep the debt check for REITs in the
  score (O gets safety 2/2 at debt 6.1× EBITDA because Finance skips it).
- **DCF fade start:** years 2–10 fade from `min(g1, clamp(3-year revenue growth), 25%)`, not from one
  forecast year (XOM: one rebound year +34.2% carried for a decade, DCF 715.84 at a 164.73 price; TSM
  359 → 278; MSFT 273 → 245). Hide the DCF row for Heavy/cyclical, where it has no weight.
- **Discount rate per market:** constants per currency in `bench` (risk-free and equity premium), with a
  cited source for the Saudi ones; today a riyal stock is discounted at the US 10-year + US premium. Each
  point is about 13–17% of DCF value. Do not ship a number from memory.
- **One discount rate on the panel:** "the price assumes growth" uses a fixed 9% (`engine/score.js:26`)
  beside a CAPM-rate DCF. Use the same rate, or say which is which.
- **Quarter dating (optional):** date each quarter by the stock's own lag
  (`earnings_release_date − fiscal_period_end_fq`) instead of "three months apart"; moves fair by ±3%.
- **Show the DCF's terminal share** (56–72% below r = 9%) and its sensitivity (value at r ± 1 point) in
  the DCF line: it tells the reader how soft the number is.
- **Stock-based pay:** FCF is not adjusted for it. Check whether TradingView has the column
  (`get-screener-columns search "stock"`); if so show FCF after SBC beside the DCF for software names.

---

## Phase 3 — the list on a phone (speed, length, clarity)

Measured (700 rows, `ui/perf.cjs`): 2.4 stocks per screen at 390px (cards 354px, page 264,659px);
DOM 32,351 elements; at 4× CPU throttle sort 3.3 s, one filter character 1.25 s, star tap 5.8 s.

1. **Compact card, virtualised list:** two-line card; hide empty cells ("SVR —"); `content-visibility:
   auto` + `contain-intrinsic-size` on rows (or render 50 and load more); debounce the filter; patch one
   row on star instead of 2–3 full rebuilds; mini snowflakes drawn lazily.
2. **Panel:** it is rebuilt 4 times in the 2.5 s after opening (news, history, log, guidance): patch
   sub-blocks; `scrollIntoView` the tapped row (opening a second card throws it 4,502px away where there
   is no scroll anchoring: check on the owner's iPhone); a sticky close bar; numbers first, prose behind
   "كيف ينحسب؟" (panels are 4,100–5,800px collapsed).
3. **Earnings charts** have a fixed 720 viewBox: 4.8px axis text at 390. Draw at container width like
   `lineChart`, with a label gutter.
4. **Explanations that live only in `title`** never show on a phone (221 "weak estimate" reasons, 282
   chips, 700 grades): tap popover or a caption; extend the key (grade, mini snowflake, grey values).
5. **Feedback:** fixed bottom toast for undo / added / un-starred, scroll to the new row; 44px tap
   targets (star and × are 33px).
6. **Boot:** fetch quotes in parallel with the saved histories (first price at 4.4 s today, 3.1 s of it
   waiting on reads); load `h/` on open; one combined notice outside claude.ai.
7. **Consistency:** one vocabulary across the three ratings (/10, /30 with "/6" per axis, the grade); one
   word for revenue; one date format; currency on the panel header, target and 52-week range; no cents on
   five-year scenarios; `lang="ar"`, `aria-sort`, `aria-live` on the status; grade letters fail contrast
   (2.6–3.5:1); sticky table header on desktop; fixed grid areas at 820px.
8. Move "how the score works", study results and the change log to their own tab, linked from the header.

## Phase 4 — additions (all from data already fetched or one TradingView tool)

| # | Addition | Why it helps | Data | Size |
|---|---|---|---|---|
| 1 | **Cycle warning** on any stock where margins or EPS are far above their own 5–10-year median, with the value at median margins | the MU case: tells the reader the "cheap" multiple sits on peak profit | saved fiscal years | S (after E2) |
| 2 | **Forward track record:** log each stock's fair value monthly; show "قلنا X قبل سنة، السعر صار Y" and the list's hit rate | the only honest proof the number means anything; grows by itself | db | M |
| 3 | Earnings in the next 14 days (strip or tab), expected EPS/revenue, last surprise | what to read before a report; also feeds the tweets | fetched columns + earnings calendar | S |
| 4 | Analyst target bar (low–mean–high vs price, analyst count) | columns fetched on every batch and never shown | fetched | S |
| 5 | 52-week position bar and a "furthest from high" sort | fetched, unused | fetched | S |
| 6 | Research presets (score ≥ 7, upside 10–60%, not weak; reports soon) | one tap to a shortlist | computed | S |
| 7 | Changed since last visit (▲▼ on score, fair value, grade) | shows what moved | db | M |
| 8 | Research status and note per stock | turns the list into a queue | db | S |
| 9 | Dividend view for the Saudi and dividend lists (yield, payout, next ex-date) | | fetched + dividends calendar | M |
| 10 | Alert at fair value and add to a TradingView watchlist from the panel | | alerts / watchlist tools | M |
| 11 | Compare 2–4 stocks (overlaid snowflakes, score parts, multiples) | | state | M |
| 12 | Leftovers of the redesign: price-target band, EPS forecast cone, debt and dividend history charts | | fetched | M |

---

## Phase 5 — the tweets system

State today: page https://claude.ai/artifact/HxfJc8duiX3H6fcVbp6HNY (db: `tweets/<date>`, `meta/style`,
`meta/ideas`; charts, photos, video); routine `trig_01BUHWf4UEnjD5avt2MUrV6k` every two days, bound to
the audit session. Clip tools were only in a scratch folder and are now in `scripts/clips/`.

What the owner's reactions have taught (already partly in `meta/style`; make all of it explicit there):
opinion-led posts on names and themes people are talking about beat neutral statistics; one long post
rather than a thread unless he asks; very colloquial Saudi; ratio names in English (P/E ratio, SP500);
emojis; a short clip with his handle and the "bounce" beat; real photos and source charts over
home-made ones; text delivered so that line breaks survive copying.

1. **Feedback on the page** (S): 👍 / 👎 per tweet with reason chips (الفكرة، السهم، الطول، الأسلوب،
   الصورة) and a note, saved on the doc; a "اكتب بدالها" button. The routine reads the last 10
   reactions before choosing. This replaces asking him in chat.
2. **Idea inbox on the page** (S): a text box and a screenshot upload (the `assets` capability is on)
   writing to an `inbox` collection; the routine takes inbox items first. Today he must come to a chat.
3. **Routine that does not depend on one chat session** (owner action): the tool cannot attach
   connectors to a fresh-session routine in this organisation. Create it from the claude.ai Routines
   page with the TradingView connector attached and notifications on; its prompt is one line that reads
   `progress/TWEETS-ROUTINE.md` (move the current prompt there so it is versioned). Then delete the
   session-bound routine.
4. **Clips as a tool** (M): `scripts/clips/` takes a JSON spec (scenes: race of rebased lines,
   scoreboard, bars; title, tickers, handle, beat style) and returns an mp4. No intro or outro cards;
   English tickers in legends; period labels carry the period's return.
5. **Preview that matches X** (S): mark the first 280 characters (what shows before "Show more"); a
   switch between one long post and a thread; copy always as plain text with line breaks.
6. **What worked** (S/M): after posting, the owner pastes the post's link; views and likes after 48 h are
   typed in, or read with the X API (item 7B). A monthly summary by family feeds `meta/style`.
7. **Ideas from accounts he follows.** X cannot be read from the cloud session (blocked, and timelines
   need a login). Options:
   - **A. Read the publishers' own feeds (recommended first, no cost):** most chart accounts publish the
     same charts on a site or newsletter with RSS (Visual Capitalist, App Economy Insights, Charlie
     Bilello's weekly, the FRED blog, Apollo's Daily Spark, FactSet Earnings Insight, and the like).
     Verify each feed returns 200, add the hosts to the environment's allowed list, and let the routine
     read titles from the last 3 days as idea candidates. The chart is then rebuilt from our own data.
   - **B. X API (paid, automatic):** pay-per-use; third-party guides put a post read near $0.005
     (official rate card not confirmed). A private X List of ~20 accounts read every two days is about
     3,000 reads a month. Needs a developer account; the token is saved as an environment secret for
     `api.x.com` (never in the repo or chat). Also gives his own posts' metrics for item 6.
   - **C. Claude in Chrome on his computer:** can read his X list in his own logged-in browser, but only
     in a session he starts, not in the scheduled routine.
   - **D. Keep forwarding screenshots** (works today; the inbox makes it one tap).
   Candidate accounts (verify each handle before use): @charliebilello, @KobeissiLetter, @LizAnnSonders,
   @EconomyApp, @VisualCap, @bespokeinvest, @Barchart, @RyanDetrick, @Schuldensuehner, @TheEconomist,
   @WSJmarkets, @markets, and the Arabic ones he already sent (@stock_arabic, @InvestSky, @FaisalThinks,
   @RuwadAlstithmar, @AbdulQShare).
   Rule: take the idea, never the image or the wording; every number is refetched from TradingView or
   FRED and fact-checked as today.
8. **Use the dashboard as the idea source** (S): the audit's cycle warning, the earnings-in-14-days
   list and the biggest fair-value changes are ready-made, original posts with a link back to his work.
9. **Housekeeping:** two drafts he did not like sit on 2026-11-12 and 2026-11-14 (written by another
   session); the routine will not write over them. Delete them once he confirms.
10. **A caution to raise with him (not legal advice):** posts that tell readers what to buy, or that
    they will regret not buying, can count as investment recommendations; the Saudi Capital Market
    Authority regulates those. He should check what applies to him. The posts already say "رأي شخصي"
    and "مو توصية"; keep opinions framed as his view and the reasoning, not a call to act.

---

## Decisions (made 2026-11-10; the owner delegated them: "أنت اللي تقرر")

**Order of work.** Each step is one version and one session-sized piece:

1. **v28 — Phase 1, all of it**, plus the logging half of addition 2 (save each stock's fair value,
   price and date once a month in the db). The track record needs time to exist, so it starts now; its
   display comes in step 4.
   **Done 2026-11-10 (v28, published).** All of 1.1–1.10 except: the big-25 pool rebuild (needs
   `mcp-tv-run-screener` in the page's connector grant; left for a session that adds it) and the `acquire`
   lease on list edits (edits are already serialised and refuse short reads; only two tabs editing the
   same list at once could still race). Fair-value log in `fvlog/<bucket>` (nothing shown yet). Per-stock
   diff: `reports/v28-today.txt` (682 stocks changed on the same snapshot; the change log carries the 614
   fair-value moves). Test changes: the MU check expects 1627.23 (1.3), the browser check's failed-batch
   scenario clears `stocks.bgAt` first (1.5). **Open for step 2:** 1.2 annualises what is left of the
   forecast year over as little as a quarter, which multiplies a small mismatch between the forecast and
   the twelve months by up to 4: KO (saved data, half a year left) −2.9% against +3.0% for the year, DCF
   77.39 → 58.26 (live after its Q3: −7.6%); NVO −20% (clamped), FSLR −13%. Weigh this with the DCF
   fade-start change below (e.g. blend toward forecast ÷ last year by the time left). → done in v29.
2. **v29 — the two "by reasoning" fixes of 2.2 that remove plainly wrong numbers, labelled untested:**
   - REITs (industry "Real Estate Investment Trusts"): no P/B-from-ROE leg; weights EV/EBITDA 0.5,
     P/S 0.25, 5-year-average P/E 0.25 (Study 18's option C, provisional until it reports); the score's
     debt check applies to them.
   - Other financials: the P/B-from-ROE leg only when 0 < P/B ≤ 4 (above that the leg's own cap of 4×
     book binds and it measures nothing: V, MA). Without it they are valued on own-history P/E alone,
     which is exactly the configuration the studies tested.
   - DCF fade start `min(g1, clamp(3-year revenue growth), 25%)`; no DCF row for Heavy/cyclical.
   - The Lynch line shows the P/E it implies. One discount rate on the panel.
   - Not now: the Saudi discount rate (needs a cited source first; raise it with the numbers when found).
   **Done 2026-11-10 (v29, published), all labelled untested:** REIT weights and debt check (`scoreAt`
   `opts.debt`), P/B-from-ROE only at P/B ≤ 4 (every stock), DCF fade start from the 3-year revenue growth
   and no DCF row for Heavy, Lynch row shows its P/E, "السعر يفترض نمو" says it uses a fixed 9%, and the
   1.2 rate blended by the time left (KO 0.0% instead of −2.9%). Per-stock diff `reports/v29-today.txt`
   (233 changed; the change log carries the 225 fair-value moves). **Seen, for Study 18 (E4):** a lower
   DCF moves the weighted median and can flip which method the ⅓/3× rule drops (WDC 331 → 98, its 3-year
   revenue growth negative from the SanDisk spin-off; MPWR 650 → 261).
3. **Tweets page, small items (5.1, 5.2, 5.5)** in `pages/tweets.html`: feedback buttons, idea inbox,
   280-character mark and post/thread switch. Independent of the dashboard; do it right after step 2.
   **Done 2026-11-10 (tweets page version 7, published):** 👍/👎, reason chips, note and "اكتب بدالها" saved as
   `feedback` on the tweet; idea inbox (text + screenshot through `assets`) in `inbox/`; X's weighted count
   with the "Show more" cut marked (CSS-only, never copied) and a post/thread switch saved as `format`
   (a thread without "---" lines is split into parts of at most 280). The routine's prompt now has a step 0
   for all of it and is versioned in `progress/TWEETS-ROUTINE.md`. Check: `test/pages/tweets-check.cjs`.
4. **v30 — Phase 3 items 1–5** (the phone list and panel), then **additions 1, 2 (display), 3, 4, 5** as
   v31. The cycle warning (addition 1) is descriptive, so it does not wait for Study 18.
   **v30 done 2026-11-10 (published):** Phase 3 items 1–5. At 390 px, CPU ×4 (`ui/perf.cjs`, reports
   `v30-perf-before.txt` / `-after.txt`): sort by upside 5.9 s → 0.18 s, by score 3.7 → 0.35, star 7.4 → 0.08,
   back to the US tab 3.2 → 0.25, DOM 38,256 → 9,390, panel rebuilds after opening 4 → 1; fast scrolling p50
   31 → 41 ms, max 79 → 82 (rows are added while scrolling). Values unchanged on the snapshot (0 of 1,049).
   Not done from Phase 3: 6 (boot), 7 (consistency), 8 (own tab); `content-visibility` was tried and left out
   (sorting faster, scrolling slower). The probe falls back to the first drawn row for LCID/MSFT (not drawn
   until scrolled to); `measure.cjs` sets `stocks.rows = all` and treats a deliberate "…" with a title as fine.
5. **Study 18** (E1–E4): protocol and scripts committed before any result, run on the saved data
   (`data/fv`, `data/fv8`; no new TradingView calls beyond one batch for industries), then apply what
   passes as v32 and say what did not.
6. Then Phase 3 items 6–8, additions 6–12, tweets items 4 and 6.

**Why Study 18 is run rather than skipped:** Study 16 showed that a change which looks obviously right
(dropping Lynch's rule) can fail once closeness to the price is controlled for. E1–E4 move hundreds of
fair values; they get the same test. Only changes that fix a category error (step 2) go in untested, and
they say so on the page.

**Tweets.**
- Ideas from accounts: option 7A (publishers' feeds) plus 7D (the inbox). No paid X API now; revisit
  after a month if automatic reading or post metrics are wanted.
- Done on 2026-11-10: the two disliked drafts (2026-11-12, 2026-11-14) were moved to the collection
  `tweets_archive` (reversible); `meta/style` has a new `owner_preferences` list; the routine's prompt now
  asks for one long opinion-led post, English ratio names, the original news source, and reads `inbox`
  and feedback fields (which step 3 creates).
- Still the owner's to do, when convenient: create the routine from the claude.ai Routines page with
  the TradingView connector (5.3). Until then the session-bound routine keeps running.

## Kick-off prompt for the implementing session

> Read `CLAUDE.md` and `progress/AUDIT-PLAN.md`. Do step 1 of "Order of work" (v28: Phase 1 and the
> monthly fair-value log). For each item: reproduce it with its probe in `progress/audit-2026-11-10/`,
> fix it marked POST-HOC with the example, add a test, and keep `npm test` and the browser checks green.
> Run `test/pages/measure.cjs` before and after and put the per-stock diff in the change log. Publish
> the dashboard to its existing artifact (https://claude.ai/artifact/TUkdHCEyfRfBorus6K5MDa), commit,
> push, then report what changed and what you could not do. Stop after step 1 and wait.
