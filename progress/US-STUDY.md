# US study — progress log (read this first when resuming)

Branch: `claude/tradingview-analysis-indicator-oc7eqv`. Protocol: `PROTOCOL-us.md`.

## How to resume
1. `git checkout claude/tradingview-analysis-indicator-oc7eqv && git pull`
2. Read the checklist below; do the first unchecked step.
3. Fetching: `node scripts/us-plan.js` prints the symbols still missing. Fetch them with the
   TradingView connector (`get_ohlcv`, interval `1D`, count 5000, format `columns`), then
   `US_RAW=<dir of saved responses> node scripts/us-ingest.js`, commit, push.
4. Commit and push after every step. Update this file in the same commit.

## Checklist
- [x] Study 1 finished (`reports/swing-*.txt`, `swing.html`)
- [x] Protocol for study 2 committed before any download
- [x] Universe snapshot from the screener → `data/us/universe-snapshot.json`, `data/us/universe.json`
- [x] Fetch daily bars for every symbol (batches; see counts below)
- [x] Backtest: `node scripts/us-backtest.js`
- [x] H1 confirmatory result
- [x] Arabic page `us.html` + artifact (https://claude.ai/artifact/UzDMABZnvYqSz6sQnpDAnX)
- [x] Addendum 1 (PROTOCOL-addendum-1.md): watchlist group (46 tickers, separate report)
- [x] Addendum 1: example win/loss charts per indicator (selection rule in §B)
- [ ] Addendum 1: Pine script(s) + checked TradingView links per indicator
- [ ] Study 3 Saudi: screener snapshot (market ksa), fetch, backtest, H1-SA, page

- [x] Stage 1 (PROTOCOL-addendum-2.md / addendum 3): classify page-1 symbols via search-symbols → data/us/classify.jsonl, build universe, ingest, run
- [ ] Stage 2: when screener answers, full ≥$2B snapshot → fetch the rest → H1b + combined

- [x] Study 4 protocol (PROTOCOL-study4.md) committed before any computation
- [x] Study 4: indicators (engine/indicators2.js) + no-look-ahead tests
- [x] Study 4: search on even-position US symbols → reports/study4-shortlist.json (commit before confirm)
- [x] Study 4: confirm on odd-position US + study-1 crypto/Saudi

- [x] Study 5 protocol (PROTOCOL-study5.md): long-swing entries, 624 strategies
- [ ] Study 5: engine + tests, search, freeze shortlist, confirm, page
- (Saudi study 3 dropped — user not interested)

- [x] Study 6 protocol (PROTOCOL-study6.md): open look-alikes of TBO / TBT Divergence (FLT, MOD), 20 tests
- [x] Study 6: fetch crypto daily (20 BINANCE pairs), engine + tests + Pine, run (reports/study6.txt)
- [x] Study 6: post-hoc robustness (report only), Arabic page study6.html + artifact (https://claude.ai/artifact/SBdKqaVBRjZD6pxYpNwPJi)
- [ ] Study 6: Pine vs engine agreement — needs a TradingView chart-data export (scripts/study6-verify.js)

- [x] Study 7 protocol (PROTOCOL-study7.md) + addendum 1 (silver), before any data
- [x] Study 7: fetch (subagents; scripts/study7-collect.js reads the transcripts), search → pick V3, check
- [x] Study 7: H1 not confirmed (mean IC −0.032), H2 not confirmed (V3 vs V0 +0.026, p 0.17); gold/silver descriptive reports
- [x] Study 8 (PROTOCOL-study8.md): below green line AND above 10-month average, fresh S&P 500 stocks → H1, H2 not confirmed (reports/study8.txt)

- [x] Study 9 (PROTOCOL-study9.md): 0–10 score → H1 confirmed (mean IC +0.027, perm p 0.0046, Holm 0.0092; t-test across years p 0.17), H2 not confirmed (top−bottom −0.6%/yr, positive 10/14 years). reports/study9.txt
- [x] Study 9: private stock page https://claude.ai/artifact/TUkdHCEyfRfBorus6K5MDa — pages/stocks.template.html + scripts/build-stocks-page.js (inlines engine/score.js); lists in db lists/us, lists/sa; history cache in db cache/<SYM>, refreshed every 14 days

- [x] Study 10 (PROTOCOL-study10.md): RED/GREEN expectation flags → H1, H2 not confirmed (d1 −0.1%, d2 +0.1%; Holm p 0.95). reports/study10.txt

- [x] Study 11 protocol (PROTOCOL-study11.md) + universe snapshot (data/study11/universe.json, 207 symbols) committed before any HCP value and before any download
- [x] Study 11: probe (data/study11/probe.json) — of the 146 not already on disk, 94 clear the 1250-bar floor, 52 do not and were never downloaded
- [x] Study 11: fetch the 94 → data/study11/bars/ (61 more reused from data/us/bars/, which end 2026-10-06)
      FETCH TRICK, reuse it: a get_ohlcv result big enough to overflow the tool-result limit is
      spilled to <session>/tool-results/mcp-*-get-ohlcv-*.txt instead of entering the agent's
      context. So ask for count=5000 — the bigger the page, the CHEAPER it is — and read the files
      with `node scripts/study11-collect.js <session>/tool-results <session>/subagents`.
      Agents that report such a call as "failed" are wrong: the bars are on disk.
- [x] Study 11: engine/hcp.js + no-look-ahead tests (8 tests, full suite 350 pass)
- [x] Study 11: run → H1 and H2 both NOT CONFIRMED. HCP's mean gap over 40 bars is 38.0% vs 9.1% for a
      no-change line (worse in 89% of 10,309 projections, median -15.9%); cross-sectional rank
      correlation -0.015 (p 0.91). Both halves agree. reports/study11.txt
- [x] Study 11: pine/hcp.pine written, §7 "not confirmed" header filled in from the run. NOT compiled on
      TradingView yet — the user runs it; study 6's Pine had a compile error found that way (shape.star).
- [x] Study 11: forward-log/hcp-2026-10-17.json — 153 projections frozen (85 up / 68 down).
      SCORE THESE AROUND 2026-12-11 (40 trading bars on): the file carries its own scoring recipe.
- [x] Study 11: scripts/study11-verify.js — prints what the Pine table should read for a symbol/date,
      so Pine-vs-engine agreement can be checked without a CSV export (polylines do not export)
- [ ] Study 11: user runs pine/hcp.pine on TradingView — first compile is still unverified
- [ ] Study 11: score the frozen projections once 40 bars have passed (~2026-12-11)

- [x] Study 12 (PROTOCOL-harmonic.md): harmonic XABCD, 11 patterns at their published ratios,
      40 symbols x {1h,4h,1D,1W,1M} = 187 usable cells, 19,886 trades, non-repainting pivots.
      H1 (vs matched random entry) +0.082R p 0.0046 Holm 0.0276, both halves + — CONFIRMED,
      but only after post-hoc fix #2 (see the log), and the effect is 0.08R before costs.
      H2 (vs the same structures with every ratio scaled by a random factor) -0.000R p 0.51 —
      NOT CONFIRMED, and this is the sharpest test: the ratios themselves carry nothing.
      H4 per timeframe (4h/1D/1W/1M): all NOT CONFIRMED, best Holm 0.13.
      Family 2 search->confirm: of 43 cells only Three Drives 4h qualified on the search half
      (68.8% hit); on the never-looked-at half it hit 57.6% and lost money (-0.045R, p 0.063).
      NOT CONFIRMED. reports/harmonic.txt
- [x] Study 12: pine/harmonic.pine written, §8 header filled in from the run. NOT compiled on
      TradingView yet — the user runs it; study 6's Pine had a compile error found that way.
- [x] Study 12: forward-log/harmonic-2026-10-18.json — 126 patterns live at the cutoff, frozen
      with their PRZs, stops and targets before any of them can be known.
- [x] Study 12: per-pattern toggles + an in-chart backtest in pine/harmonic.pine (win%, 95%
      Wilson CI and avg R per pattern for whatever symbol/timeframe is open). Verified by
      re-implementing the Pine loop in JS and diffing it against the engine across all 187
      cells / 19,886 trades: zero differences.
- [x] Study 12: reports/harmonic-symbols.json + scripts/harmonic-symbols.js — post-hoc
      per-symbol table with split halves. Best: LIN 40.8%/+0.42R, KO 38.7%/+0.34R,
      V 35.5%/+0.29R, all stable across both halves; worst HIMS/TSLA/ENB. But the RANKING
      barely persists (Spearman 0.287 across 39 symbols), so it is a hint, not a rule.
- [x] Study 12: chart legibility pass after the user sent screenshots — the zone box now runs
      from the confirmation bar to its expiry instead of from point C to forever, carries a
      BUY/SELL label with the zone and a live status (waiting / triggered / void / expired)
      under the same three tests the backtest applies, every target line is named at its right
      end, and a key names every mark. Arabic by default with an English switch. Drawing only;
      the backtest block is untouched, so the engine agreement above still holds.
- [x] Study 12: reports/harmonic-holding.json + scripts/harmonic-holding.js — post-hoc,
      descriptive: how long a trade lasts per timeframe, in calendar days. The 60-bar horizon
      is ~3 months on 1D, ~1.2 years on 1W, 5 years on 1M. Answers "which timeframe for a
      three-month position" with the study's own numbers rather than a guess.
- [x] Study 12: scripts/harmonic-pending.js + harmonic-watch.html — post-hoc monthly screen.
      325 monthly series (327 US dailies from data/us/bars resampled, plus the study's own 40),
      207 setups registered and not yet reached. Complete months only for the scan; the days of
      the unclosed month are replayed daily on top, which caught 3 already reached and 4 void.
      A first version dropped a COMPLETE month from the study's own monthly files (their partial
      month was already removed by the collector); fixed to drop a trailing month only when it
      shares a month with the last daily bar. Top 10 unchanged by the fix.
- [ ] Study 12: user runs pine/harmonic.pine on TradingView — first compile unverified

- [x] Study 13 protocol (PROTOCOL-study13.md): own-history buy/sell zones for profitable companies, 8 candidates,
  committed with engine/zones.js + scripts/study13-run.js before the first run (draft reviewed independently; the
  review counted coverage only)
- [x] Study 13: run → reports/study13.txt — ALL EIGHT NOT CONFIRMED (Holm 1.0 for each). Mean D (buy − sell
  zone, 12 months): Z1 P/E +1.8%, Z2 P/S +0.8%, Z3 EV/EBITDA +2.5%, Z4 P/FCF −0.4%, Z5 combined +4.1% (p 0.23),
  Z6 PEG +1.4%, Z7 price stretch −3.5%, Z8 P/E vs sector +1.1%; hit rates 48–54%. Descriptive, post-hoc: the
  means come from May 2020 (the COVID rebound); without 2020 every candidate is between −6.6% and +0.2%.
- [x] Study 13: independent clean-room re-implementation (protocol text + named helpers only, never saw
  engine/zones.js or the run script): all 96 yearly D values, every p-value and mean IC identical.
- [ ] Study 13: page per §5 (none confirmed → at most a descriptive P/E history, labelled) — ask the user first
- [x] Study 14 protocol (PROTOCOL-study14.md, 0bc6e66): four ranks from the literature tested (52-week high,
  gross profit ÷ assets, net share issuance, profitable value), four reported; reviewed independently before commit.
  Total assets fetched after the commit (17 batch calls, scripts/study14-collect.js; offset found for 804 of 815).
- [x] Study 14 run (reports/study14.txt): H_T3 NET SHARE ISSUANCE CONFIRMED — mean D +6.0% a year, 12 of 14 years
  positive, p 0.0110, Holm 0.0439; halves +3.5% / +8.5%; without 2009/2020 +6.5%; large caps only +1.9%; the sell
  side (diluters) carries more of it (56% below the median vs buy side 52% above). T1 52-week high +1.5% (p 0.40),
  T2 GP/A +2.6% (p 0.29), T4 profitable value +1.6% (p 0.39): not confirmed. Reported: momentum −0.7%, residual
  momentum −1.3%, value composite +4.8%, value + momentum −2.4%.
- [x] Study 14: clean-room re-implementation (protocol text + named helpers only): all 147 yearly D values, every p
  and Holm p identical (T3 p 0.010986 = 180/16384, Holm 0.043945).
- [x] Study 14: page line per §7 for T3 (confirmed): detail block "شراء الشركة لأسهمها" with the change between the last two fiscal years, the sector rank among loaded stocks of the same market (≥5) and the test result incl. the large-cap +1.9%; the unconfirmed ones are not shown
- [x] Study 13 POST-HOC on the user's favourites (scripts/study13-favorites.js → reports/study13-favorites-posthoc.txt;
  75 favourites saved in data/favorites/2026-10-20.json, 57 with enough history, ADRs ASML/TSM/NVO/SE/ARM added,
  GOOGL read through GOOG). Descriptive only (358 stock-years, picked today, so selection bias): buy − sell
  P/S +9.5%, P/FCF +8.8%, combined +2.1%, EV/EBITDA −3.1%, P/E −6.9%, P/E vs sector −8.7%, PEG −14.7%,
  price stretch −3.3%. Plus where each favourite sits now per rule.

## Counts
(updated as work proceeds)

## Log
- 2026-10-18 — user asked for a real harmonic indicator for TradingView ("the complete
  fundamentals, nothing distorted"), working on every timeframe, with targets, plus a table
  of the most accurate timeframe and the most accurate pattern. Study 12 pre-registered.
  Ratio table built from search-layer extracts (outbound fetching is blocked in this
  container — harmonictrader.com and every other host fail at the proxy), then handed to a
  second researcher told to refute it; four substantive corrections applied, incl. a 1.0
  placeholder in the Deep Crab's AB=CD that would have coded as an equality test.
  Prior evidence recorded BEFORE the hypotheses: no peer-reviewed harmonic backtest with a
  sample and a significance test exists; the best nearby study (Batchelor & Ramyar on
  Fibonacci ratios in the Dow, 1914-2002, block bootstrap) is negative; no timeframe
  comparison exists anywhere. Two bugs found by a detection-COUNT check before any statistic
  (direction keyed off the first pivot instead of the last, which silently inverted AB=CD and
  Three Drives; the 5-0's "B beyond X" copied the Shark's sense). POST-HOC after the first
  run: a bar gapping clean through a PRZ filled at the open BELOW the far edge, collapsing
  risk to a rounding error — 370 of 21,278 trades had a stop under 0.1% from entry and one
  printed R=3003, moving pooled mean R from 0.03 to 0.22. Fixed (a fill outside the zone is
  not an entry); before/after in reports/harmonic-prefix/. Verdict unchanged either way.
  The median trade in this study is exactly -1R, usually stopped on its entry bar.
- 2026-10-18 — user asked whether patterns can be switched off individually (they already
  could) and for an in-chart backtest per pattern on the open symbol. Added, and verified by
  porting the Pine loop to JS and diffing against the engine on all 187 cells — zero
  differences. That diff is also what found POST-HOC FIX #2: only 5-0 disagreed, because its
  completion (50% of an overshooting BC) often lands beyond A, inverting the AD leg so the
  "first target" sits on the wrong side of the entry; the exit loop scored those as instant
  wins at negative R. 314 of 552 5-0 trades, 207 of them "wins", -152R total; no other
  pattern produced one. Dropping them MOVED H1 from not confirmed (+0.060R, Holm 0.1125) to
  CONFIRMED (+0.082R, p 0.0046, Holm 0.0276). H2 unchanged at zero. Before/after in
  reports/harmonic-prefix/.
- 2026-10-07 — protocol written.
- 2026-10-07 — engine/study.js + scripts/us-*.js written. `node scripts/us-backtest.js --study1`
  reproduces study 1's tables line for line (edges, win rates, p-values), so study 2 runs on
  verified code. Screener was rate-limited (HTTP 429); universe snapshot still to do.
- 2026-10-07 00:25Z — fetch started (screener still 429): 20 ETFs + 309 largest clean
  listings from the first screener page (≥ ~$45B; saved in scratchpad, re-pull for the
  snapshot). Collect with `node scripts/us-collect.js <rawDir>` (only files after
  2026-10-07T00:15Z), then `US_RAW=<rawDir> node scripts/us-ingest.js` once universe.json exists.
- 2026-10-07 00:25Z — user asked for: their 46-ticker watchlist, example charts, indicator links, Saudi study. Addendum 1 written before any study 2 result.
- 2026-10-07 00:35Z — watchlist extras fetched. Inline-only (not storable without hand-copying,
  which is not done): NASDAQ:ZENA (505 bars), NYSE:VOYG (332), NYSE:FIG (298), NYSE:HAWK (105)
  → report as "too new / not stored". Row-format responses are now collected too (LUNR, ARM
  re-fetched that way; volume checksums match the API summary). 195 raw files collected.
- 2026-10-07 00:45Z — first 329 fetched. UFO lives on NASDAQ (AMEX:UFO invalid) → NASDAQ:UFO used.
  Short histories returned inline (unstorable, need ≥ ~700 bars to be saved even in row format):
  GOOGM GOOGN SPCX SNDK ALAB STRD STRC STRF STRK CRWV HONA VYLR MDLN, plus GEV (634, inline).
  BAM re-fetched in row format and saved.
- 2026-10-07 01:00Z — screener still 429; user wants TradingView only. Addendum 2: two stages.
- 2026-10-07 01:25Z — stage 1 run (312 symbols). H1 NOT CONFIRMED (Keltner edge −0.011R, p 0.90). Robust A: trix, ema_20_50, stoch, ao. Robust B: rsi2. C: none. Next: Arabic page us.html, example charts, then Saudi study 3.
- 2026-10-07 — POST-HOC at user's request: BRK.A removed (duplicate of BRK.B). Before-tables in
  reports/pre-dedupe/. Edges barely move; four Robust A rules and RSI2 (B) unchanged. Labels at
  the threshold flipped from permutation noise: rsi_50 A Possible→No, mfi B Possible→No,
  tsmom B Possible→Robust (Holm p 0.0875→0.0375; treat as borderline). H1 still NOT CONFIRMED.
- 2026-10-07 — user: wants many more indicators, trader-style strategies, ≥60% win rate. Study 4 pre-registered: 912 strategies, search/confirm split by stock.
- 2026-10-07 — study 4 search: 24 of 912 passed win/edge/trades, 21 also p<0.001; shortlist of 10 frozen (weekly RSI2/down3/double7/pullback5 with E2, daily RSI2 & VixFix E2). Confirmation not yet run.
- 2026-10-07 — study 4 confirmation: all 10 shortlisted CONFIRMED on 155 unseen US + 10 crypto/Saudi (win 62–74%, Holm p 0.005). Edge comes from US stocks; crypto/Saudi edges small/negative. Random entries with E2 already win ~61–63% (weekly) — state this. Next: current signals, Pine for weekly RSI2+E2, page.
- 2026-10-07 — pine/pullback-reversion.pine added (study 4 confirmed strategies). Weekly RSI2+E2: hold ~4 weeks, avg win +4.8%, avg loss −6.5%, worst −41%. Next: Arabic page with all of this + current signals; Saudi study.
- 2026-10-07 — us.html built by scripts/study4-page.js (charts, signals, watchlist, Pine code inline) and published. Remaining: Saudi study 3; stage 2 when screener answers; links per indicator (not added — unverified URLs are not published).
- 2026-10-07 — user: Saudi not needed; wants long swings (months–1y). Study 5 pre-registered.
- 2026-10-07 — study 5 search: 89 passed win/edge/trades, 13 also p<0.001; shortlist of 10 frozen (weekly RSI14>30 H52 75.5%, WaveTrend H52, CRSI H52, ...). Confirmation not yet run.
- 2026-10-07 — study 5 confirmation: CONFIRMED weekly RSI14 crosses above 30 held 52w (75.9% vs random 65.3%, edge +12.1%, Holm 0.005; period I edge only +2.6%) and held 26w (65.5%, edge +3.4%, Holm 0.03). Others not confirmed.
- 2026-10-08 — user asked for @MooninPapa's TBO and TBT Divergence rebuilt 100% and backtested. Both are closed-source paid scripts; youtube/tradingview/thebettertraders are blocked here; user has no subscription. Agreed: open look-alikes with different names (FLT, MOD), no match claim. Study 6 pre-registered.
- 2026-10-08 — study 6 run: 2 of 20 beat random entries. Crypto BC H20 (breakout cluster, hold 20 days): n 251, win 58.6% vs 50.6%, edge +14.0%, both periods +, Holm 0.01. US MOD X (divergence, exit Close Long): n 6091, win 51.9% vs 44.5%, edge +1.75%, Holm 0.01. Everything else fails, incl. Open Long and Cross Up everywhere.
- 2026-10-08 — user ran the Pine: compile error `shape.star` (not a Pine shape) → shape.flag. Display-only changes at the user's request: colour inputs matched to their chart (gold/grey candles on #303030), strength-shaded clouds (EMA 50–100 + 20–50 ribbon), breakdown cluster BD. Signal logic unchanged. reports/study6-tbo-dates.txt: FLT vs TBO dates the vendor published (Kitco) — same moves, FLT a few days slower; not tuned.
- 2026-10-08 — study 6 addendum 1 (3/6/12-month and Cross Down holds): 0 of 40 beat random entries. US: every FLT/MOD entry ≈ random or slightly worse at 3–12 months. Crypto: big means from a few 2020–21 trades, medians mostly negative, nothing significant after Holm.
- 2026-10-08 — Pine: optional L52 mark (study 5's confirmed weekly RSI(14) back above 30, hold 52 weeks) via request.security on the entry week. Guide images reports/study6-guide-marks.png and study6-guide-strategies.png (Arabic). Page gets the medium/long section.
- 2026-10-08 — user asked for 5 US stocks for an end-of-October entry. Screen: L52 (study 5) at/near trigger, ≥ ~$45B; 6 candidates rated (ticker-analyst pipeline, one agent each). Top 5: AON 6.5, CRH 6.5, MCD 6.4, O 6.3, PEP 6.2 (all Monitor); NKE 5.0 Avoid. reports/picks-2026-10-L52.md — check Oct 2027.
- 2026-10-08 — user wants a ~3-month swing (end Oct → early 2027), not an investment. Addendum 2 (weekly MOD regular/hidden, F0/F1, H8/H13): 0 of 8. Closest MODW H13 F1 edge +1.50%, Holm 0.062, period I negative. Per protocol §3, no stock list given as a recommendation. Pointed the user to study 4's confirmed weekly RSI(2) pullback (max 13 weeks) instead.
- 2026-10-12 — study 7 done: reports/study7*.txt; pine/metal-log-regression.pine (gold + silver).
- 2026-10-12 — study 8 done: trend filter did not help; fair-value.pine unchanged apart from its header.
- 2026-10-12 — study 9 done; next: the stock page.
- 2026-10-13 — stock page v3: fair value column, watchlist filter; db seeded with all 703 US watchlist stocks (lists/us), 28 watchlist groups (meta/watchlists) and 756 saved histories (cache/<SYM>, fetchedAt 2026-10-12, refreshed by the page after 14 days).
- 2026-10-13 — stock page v7: expectation flags (study 10, information only), analysts' next year, earnings date, news, VIC ideas (22 seeded, collection `ideas`). Routine trig_01PaBTq8Mq1TbaNLVpdhQCWG adds new VIC ideas on the 1st and 15th (07:47 Riyadh). Reddit is not reachable from the search tool.
- 2026-10-14 — stock page audit (user said "something is wrong"). Found and fixed: (1) live page used the backtests'
  "FY usable from May of Y+1" rule, so 34 stocks with mid-year fiscal years (MU, MSFT, COST, LRCX…) showed last year's
  numbers (MU fair value ≈ 10% of price) → engine `live` flag, page counts every reported year; (2) financials:
  FCF-based measures (implied growth, cash conversion, two direction checks, expectation flags) dropped, and analysts'
  revenue not compared for banks (gross vs net revenue gave −30…−45%); (3) own-history months with any multiple above 100 skipped (P/S, P/E, EV/EBITDA)
  (ramping-revenue stocks had fair values 20–90× price); (4) page uses the quote's share count when NI÷EPS is >1.5×
  off (MCHP preferred dividends). POST-HOC re-runs: reports/study{7,9,10}-posthoc-fixes.txt — conclusions unchanged
  (study 9 H1 still CONFIRMED, p 0.0040 / Holm 0.0080; study 7 IC −0.017, study 10 flags still not confirmed).
- 2026-10-14 — 5-year price scenarios (engine/projection.js, untested, shown as scenarios). Saudi main market (271)
  added: lists/sa now 271 (main market, Nomu not included); 216 histories seeded with scripts/seed-cache.js
  from data/sa-all (1140 and 6060 hit rate limits, the page fetches them itself). Page published as v9.
- 2026-10-14 — addendum 3 (monthly MOD on 611 watchlist stocks, H3/H6): 0 of 2. H3 close: edge +4.6%, both periods +, p 0.038, Holm 0.0755. List of last-12-month signals shown as chart readings, not recommendations.
- 2026-10-18 — POST-HOC (reports/study11-posthoc-damping.txt, scripts/study11-posthoc-damping.js):
  asked whether a repaired HCP deserves a study 12. Anchoring the projection to the last close and
  damping it toward that anchor gives a MONOTONE curve — no-change 9.81%, damping 0.9 9.89%, 0.75
  10.21%, 0.5 11.32%, 0.25 12.95%, 0 (anchored only) 14.90%. Every bit of model left in makes it
  worse, and the curve's best point is full damping, which IS the no-change line. So the repaired
  family has no best case above doing nothing. STUDY 12 IS NOT PROPOSED — if a future session is
  tempted by "but what if we anchor/damp it", this is the answer. Sampled, no null, no p-value.
- 2026-10-18 — what the frozen projections look like, and why the result makes sense. Across the 153
  symbols HCP's implied 8-week move has a MEDIAN ABSOLUTE SIZE of 44.4%; 101 of 153 imply more than
  +/-25%; the extremes run from AXTI -97% to OTC:BCHG +977%. For the six indices the user named the
  median is 5.8% (IWM -7.0, DOW +2.4, SPY +2.8, QQQ +4.6, US500 +7.3, NAS100 +10.7) — sane-looking.
  That is the whole story of study 11 in one line: extrapolating 3 harmonics is only ever plausible
  on a low-volatility index, which is exactly where such charts get posted. On anything volatile the
  fit leaves a large residual and the continuation runs away. Not a new test, just a description of
  forward-log/hcp-2026-10-17.json; no claim attached.
- 2026-10-17 — user sent a screenshot of @BeardoTrader's "Long term $QQQ model" (blue line, 2026-10-16)
  and asked for the same indicator on US500/NAS100/DOW/SPY/QQQ/IWM and both watchlists. Measured the
  line out of the image (pixel extraction, aligned to real QQQ bars to 0.15%): it is a FORWARD
  PROJECTION, 39 bars past the last candle; mean 1.77% from the close over the visible 112 bars; not
  an MA (change corr +0.04), not an FLD, not stepped M2 data; a 20-day MA matched it and a 10-day MA
  beat it. Vendor method undisclosed (no TradingView script; "subscribers" implies a paid channel), so
  family is undetermined — open look-alike under a different name (HCP), no match claim, as in study 6.
  User chose: Pine script + pre-registered test, TradingView only (no live page). Study 11 pre-registered.
  Scratchpad working files (this session only): .../scratchpad/{align,aligned,chart}.json, scout-*.md.
- 2026-10-14 — pine/metal-log-regression.pine restyled at the user's request to the ETH look (upper/regression/lower, one fill, lines carried forward, price-scale values; outer bands optional) and opened to stocks/coins (Auto: start at first bar; log time for crypto). Default fit now "All data" (hindsight, stated in the header and table). Fit maths unchanged. Preview: reports/logreg-preview.png (mock). Stock band untested — offered a pre-registered test.
- 2026-10-18 — stock page v12: tabs "أكبر 25 شركة" (29 candidates, top 25 by live market value, grouped by
  sector, Magnificent 7 marked) and "القطاعات" (sector + industry P/E history 2011–2026 from 818 stored US
  stocks, scripts/sector-pe.js → pages/sector-pe.json, descriptive only: bottom/top 10% zones, untested).
  Flags reworded plainly; P/E on phone cards. Independent review found 6 defects, all fixed: live history now
  uses the same fiscal-year offset as today (liveShift; MSFT looked cheaper than 93% of its months, really 72%),
  revenue labels show revG not gReal, empty fiscal years dropped (FUBO), banks lose P/FCF in part A, PEG with
  null P/E, × on the big tab. POST-HOC reports regenerated: study 9 H1 still CONFIRMED (p 0.0039 / Holm
  0.0078), study 7 and 10 still not confirmed. Known limit: fair value uses the last full fiscal year, which
  lags TTM for fast growers (GOOGL FY EPS 10.8 vs TTM 19.9).
- 2026-10-18 — user: AVGO shown "price above performance" was wrong. Cause: the live page read the last full
  fiscal year (Nov 2025) while revenue had since grown ~39%. Live page now uses the last twelve months built
  from TradingView's 16 quarters (ttmFromQuarters / liveContext, POST-HOC, untested; backtests unchanged).
  AVGO: flag red → neutral, implied growth 36.4% → 26.3%, score 8.39 → 9.29, fair value 185 → 266 (price
  328.75, still −19%: growth capped at 25%). 665 quarterly histories in data/fq, seeded to the page's `q`
  collection. Fetching them exhausted TradingView's daily tool-call quota (shared with the page, resets
  00:00 UTC); the page now refreshes at most 40 stale symbols per visit and stops with a notice on a quota
  error. ~309 symbols still lack quarters (fill in from the page over later visits).
- 2026-10-19 — PEG column (P/E ÷ analysts' EPS growth; 3-year past EPS growth marked "تاريخي" when no
  forecast). SVR (Nanalyze's simple valuation ratio = market value ÷ (latest quarter revenue × 4)) added as a
  column and a per-stock history chart (engine/svr.js, POST-HOC, descriptive, untested as a signal). Method
  pinned by reproducing Nanalyze's "Rocket Lab's SVR" chart from TradingView data: quarter-end close × that
  quarter's share count ÷ (that quarter × 4) fits within 0.9 on average (prior-quarter or report-day
  conventions miss by 4.6–9.4); their red line = the last four quarters' mean (54.75 vs ~55 on the chart),
  green ≈ their ceiling, 3 × catalog average (8.3 in Oct 2026); the US list's mean SVR is 9.0, so the page
  draws 3 × the list mean. Data: TradingView screener columns total_revenue_fq_h / net_income_fq_h /
  earnings_per_share_diluted_fq_h (32 quarters) and *_fy_h (20 years), fetched per stock when opened (page db
  collection `h`); fiscal-year points (plain P/S) before the quarters. FMP quarterly statements are denied on
  the user's plan. Share counts = net income ÷ EPS, dropped when off their neighbours (MCHP preferred
  dividends, RKLB SPAC year). Page price fetch raised 72 → 240 monthly bars (all engine windows ≤ 60 months).
- 2026-10-20 — page: SVR shown only for companies losing money over the last 12 months (EPS TTM ≤ 0), at the
  user's request; filter "SVR تحت السقف" (loss-makers under 3 × the list's mean SVR; the means are saved in
  meta/svr so other tabs have them); favourites (star on every row, tab "المفضلة", saved in meta/favorites).
- 2026-10-21 — page audit (4 agents + synthesis; numbers vs stockanalysis/finviz/Yahoo, definitions vs Zacks, CFA,
  Damodaran). Fixed: forward PEG (Zacks F1: forward P/E ÷ FY-over-FY adjusted EPS growth; LLY 2.65 → 0.90), analysts'
  growth FY over FY (false amber chips on 2222, GEV, TE, MBLY, UNH), P/S and FCF yield from market value, P/E falls
  back to market value ÷ TTM net income when TradingView's is >10% off (2222), share count 10% band with EPS restated
  (engine liveContext, POST-HOC; RIVN 13.9 → 12.2), repeated TradingView quarter labels renumbered (engine
  ttmFromQuarters, POST-HOC), DCF with analysts' year-1 growth and a CAPM rate (page only), Graham weight 0, Lynch rule
  only at ≥10% EPS growth, banks without P/S and projection, ROIC/Piotroski on fiscal years, ADRs in search, weak-
  estimate flag, wording. RIVN "$13 DCF": not found; $13 = lowest analyst target / Mizuho / Simply Wall St analysts' FV.
  Then: quoteShares (engine) — TSM's market value is on the Taipei price (14% under the ADR), so the
  10% band had switched it to the wrong count; NI ÷ EPS and total_shares_outstanding agreeing now
  win. PEG over >50% one-year growth flagged (GOOGL +90% from stake gains, 0.18).
- 2026-10-21 — audit UX batch (display only): currency and day change on price, "الفرق عن العادلة",
  SVR ×, earnings chip ≤14 days, industry/sector P/E tile (SECTOR_PE, US only), cash-runway tile for
  cash burners, ctx tiles as <details> (tap on phone), wording (D11 subset), Mag7 badge text, phone tabs
  in one scrolling row, changelog in <details>, projection warns that new shares are not counted for
  cash burners. Not done: call-budget rewrite (Q9), revenue DCF for loss-makers (Q3), heavy profile (Q6).
- 2026-10-21 — BUG: lists/us had gone from 703 stocks to 2 (TEM, LLY). Cause: boot() subscribed to the
  saved lists only after loading every cache doc, and add/remove/star saved the page's local copy, so a
  stock added during that load saved a one-stock list over the saved one (reproduced in the harness:
  lists/sa ['1120'] became ['1212']). Fix: lists and favourites subscribed first; edits wait for the
  first snapshot; every edit reads the saved list and changes one symbol, serialized; undo after delete
  and un-star; regression "WIPE CHECK" in test/pages/stocks-browser-check.cjs. lists/us restored from the
  703-stock watchlist union (the seed of 2026-10-13).
