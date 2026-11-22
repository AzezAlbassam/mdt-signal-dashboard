# Weekly Shariah refresh (versioned prompt)

The scheduled task "تحديث الشرعية الأسبوعي" (every Saturday 01:17 Riyadh, bound to the audit session) sends a pointer to
this file. Change the steps here, not in the scheduled task.
2026-11-21: created (owner: "ابدا في التحديث الاسبوعي"); funds added to step 4 the same day.
2026-11-22: step 4b reads the repo's saved daily bars first (scripts/shariah/bars-quarter-prices.js).
2026-11-22 (external audit, M13): the bars give the exact quarter average for every held company they cover (--all),
not only the near-line ones; the report-price band is an approximation and is no longer the default where bars exist.
2026-11-22 (external audit, rules lens): averages are kept from week to week (merge-quarter-prices.js); the loaders stop
on companies SEC newly gives no numbers for; any failure restores the data and the page; step 7 commits the page; the
TradingView brief is in progress/SHARIAH-TV-BRIEF.md; step 5 reports debt moves.

---

Weekly run: refresh the SEC data behind the Shariah section of the stock page and republish it. Nobody is watching:
do not ask questions; stop and report when a step fails. After step 3 has started, a failure at any step first restores
what the run changed: `git checkout -- data/shariah pages/stocks.html`, then stop and report. Never change a rule here (thresholds, leases out, the 30% rule,
the industry table): rules change only with the owner, tests first (progress/SHARIAH-PLAN.md part M).

1. D = today's date in Asia/Riyadh. In /home/user/mdt-signal-dashboard: B=claude/tradingview-analysis-indicator-oc7eqv;
   `git fetch -q origin $B && git merge -q --no-edit origin/$B`. The tree must be clean.
2. `echo ${SEC_USER_AGENT:+set}` must print "set". If not, stop: the SEC contact variable is missing from the
   environment settings, and the owner must add it back.
3. Copy data/shariah/sec-inputs.json to the scratchpad as sec-inputs.prev.json. Run `node scripts/shariah/sec-load.js`
   in the background (it takes up to an hour) and wait for it. It must exit 0 and end with "wrote N", N ≥ 500. It stops
   with exit 1 and leaves the file alone when more than 5 stocks that had SEC numbers last week have none now, or lost
   their industry code (a fetch SEC refused looks like that): report its list.
4. Funds: fetch the latest holdings, then screen them (the fund loader fetches the held companies that are not on the
   dashboard; it takes up to an hour, run it in the background):
   `curl -s -o <scratchpad>/mf.json -H "User-Agent: $SEC_USER_AGENT" https://www.sec.gov/files/company_tickers_mf.json`
   `python3 -I scripts/shariah/nport.py <scratchpad>/mf.json $(python3 -I -c "import json;print(' '.join(f['sym'] for f in json.load(open('data/shariah/funds-list.json'))['funds'] if f.get('kind')!='none'))") > data/shariah/nport-latest.jsonl`
   `node scripts/shariah/fund-load.js`: it must exit 0 (it fails on holdings that do not add up, too few funds, or more
   than 5 held companies newly without SEC numbers).
   Keep its last lines (each fund's state) and compare them with the previous data/shariah/funds.json from git.
4b. Holdings the report-price band could not decide, or passed near the 30% debt line (data/shariah/band-needed.json,
   written by the loader, most important first), get the quarter-average close that Al Rajhi's rule uses, in this order, starting from an empty `<scratchpad>/qp` (`rm -rf <scratchpad>/qp && mkdir -p
   <scratchpad>/qp`: last week's averages are already kept in quarter-prices.json):
   (1) `node scripts/shariah/bars-quarter-prices.js --all > <scratchpad>/qp/part-bars.jsonl`: every held company whose
       quarter the repo's saved daily bars (data/us/bars) already cover, near the line or not, no call needed.
   (2) Only for the band-needed tickers that (1) did not write: build TradingView symbols from
       https://www.sec.gov/files/company_tickers_exchange.json (Nasdaq → NASDAQ, NYSE → NYSE, NYSE American/Arca → AMEX;
       "-" → "."), keep band-needed's order and deal its entries alternately into <scratchpad>/qp/need-tv-1.json and
       need-tv-2.json (so both start with the most important), and give each to a
       background agent with the brief in progress/SHARIAH-TV-BRIEF.md (its <scratchpad> and K filled in).
       FMP's plan refuses most symbols, so it is not used. TradingView and FMP gave the identical DIS average (102.2937
       over 68 days) on 2026-11-22.
   (3) `node scripts/shariah/merge-quarter-prices.js <scratchpad>/qp/part-*.jsonl` (it keeps the saved averages, adds the
       new ones and rejects short, out-of-window or split-distorted ones), then `node scripts/shariah/fund-load.js --reuse`,
       which must exit 0.
5. `node scripts/shariah/diff-inputs.mjs <scratchpad>/sec-inputs.prev.json data/shariah/sec-inputs.json`: keep the
   result for the reply (new quarters, sure fails, stale or unreadable companies, debt that moved more than 10%).
6. `node scripts/build-stocks-page.js && npm test`, then the browser check at both widths:
   `NODE_PATH=$(npm root -g) node test/pages/stocks-browser-check.cjs` and the same with PHONE=1. Every "CHECK" and
   "SHARIAH" line must say ok and LOGS must be []. Any failure: do not commit, do not publish; report it.
7. Commit data/shariah/sec-inputs.json, nport-latest.jsonl, funds.json, fund-companies.json, band-needed.json,
   quarter-prices.json and pages/stocks.html (the page carries the data's dates, so it always changes, and next week's
   step 1 needs a clean tree) as "Weekly SEC refresh D" with the session's trailers, then
   `git fetch -q origin $B && git merge -q --no-edit origin/$B && git push -q -u origin $B`.
8. Publish with the Artifact tool: file_path /home/user/mdt-signal-dashboard/pages/stocks.html,
   url https://claude.ai/artifact/TUkdHCEyfRfBorus6K5MDa, label "Weekly Shariah refresh D".
9. Reply in Saudi dialect, short: how many companies have a new quarter (name the well-known ones), which stocks now
   fail for sure and which no longer do, any newly stale or unreadable, big debt moves of well-known companies, funds
   that changed state, and the page link.
   If nothing changed, say so in one line.
