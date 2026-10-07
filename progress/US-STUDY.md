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
- [ ] Universe snapshot from the screener → `data/us/universe-snapshot.json`, `data/us/universe.json`
- [ ] Fetch daily bars for every symbol (batches; see counts below)
- [ ] Backtest: `node scripts/us-backtest.js`
- [ ] H1 confirmatory result
- [ ] Arabic page `us.html` + artifact
- [ ] Addendum 1 (PROTOCOL-addendum-1.md): watchlist group (46 tickers, separate report)
- [ ] Addendum 1: example win/loss charts per indicator (selection rule in §B)
- [ ] Addendum 1: Pine script(s) + checked TradingView links per indicator
- [ ] Study 3 Saudi: screener snapshot (market ksa), fetch, backtest, H1-SA, page

- [ ] Stage 1 (PROTOCOL-addendum-2.md): classify page-1 symbols via search-symbols → data/us/classify.jsonl, build universe, ingest, run
- [ ] Stage 2: when screener answers, full ≥$2B snapshot → fetch the rest → H1b + combined

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
