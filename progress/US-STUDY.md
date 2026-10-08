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

## Counts
(updated as work proceeds)

## Log
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
