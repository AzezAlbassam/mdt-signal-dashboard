# Weekly Shariah refresh (versioned prompt)

The scheduled task "تحديث الشرعية الأسبوعي" (every Saturday 01:17 Riyadh, bound to the audit session) sends a pointer to
this file. Change the steps here, not in the scheduled task.
2026-11-21: created (owner: "ابدا في التحديث الاسبوعي"); funds added to step 4 the same day.
2026-11-22: step 4b reads the repo's saved daily bars first (scripts/shariah/bars-quarter-prices.js).

---

Weekly run: refresh the SEC data behind the Shariah section of the stock page and republish it. Nobody is watching:
do not ask questions; stop and report when a step fails. Never change a rule here (thresholds, leases out, the 30% rule,
the industry table): rules change only with the owner, tests first (progress/SHARIAH-PLAN.md part M).

1. D = today's date in Asia/Riyadh. In /home/user/mdt-signal-dashboard: B=claude/tradingview-analysis-indicator-oc7eqv;
   `git fetch -q origin $B && git merge -q --no-edit origin/$B`. The tree must be clean.
2. `echo ${SEC_USER_AGENT:+set}` must print "set". If not, stop: the SEC contact variable is missing from the
   environment settings, and the owner must add it back.
3. Copy data/shariah/sec-inputs.json to the scratchpad as sec-inputs.prev.json. Run `node scripts/shariah/sec-load.js`
   in the background (it takes up to an hour) and wait for it. It must end with "wrote N" and N ≥ 500. Otherwise
   restore the file with `git checkout data/shariah/sec-inputs.json`, stop and report.
4. Funds: fetch the latest holdings, then screen them (the fund loader fetches the held companies that are not on the
   dashboard; it takes up to an hour, run it in the background):
   `curl -s -o <scratchpad>/mf.json -H "User-Agent: $SEC_USER_AGENT" https://www.sec.gov/files/company_tickers_mf.json`
   `python3 -I scripts/shariah/nport.py <scratchpad>/mf.json $(python3 -I -c "import json;print(' '.join(f['sym'] for f in json.load(open('data/shariah/funds-list.json'))['funds'] if f.get('kind')!='none'))") > data/shariah/nport-latest.jsonl`
   `node scripts/shariah/fund-load.js`: it must exit 0 (it fails on holdings that do not add up, or too few funds).
   Keep its last lines (each fund's state) and compare them with the previous data/shariah/funds.json from git.
4b. Holdings near the 30% debt line (data/shariah/band-needed.json, written by the loader) get the quarter-average close
   that Al Rajhi's rule uses, in this order:
   (1) `node scripts/shariah/bars-quarter-prices.js > <scratchpad>/qp/part-bars.jsonl`: quarters the repo's saved daily
       bars (data/us/bars) already cover, no call needed.
   (2) Only for the band-needed tickers that (1) did not write: build TradingView symbols from
       https://www.sec.gov/files/company_tickers_exchange.json (Nasdaq → NASDAQ, NYSE → NYSE, NYSE American/Arca → AMEX;
       "-" → "."), split the list in two, and give each part to a background agent with the brief used on 2026-11-22
       (TradingView get-ohlcv: interval 1D, date_from = start, date_to = end, format columns; check the returned symbol;
       count and mean by a python one-liner from the pasted t[]/c[] arrays, never by hand; one JSON line per ticker with
       "source": "TradingView" appended to <scratchpad>/qp/part-tv-K.jsonl, or an error line; stop on a quota message).
       FMP's plan refuses most symbols, so it is not used. TradingView and FMP gave the identical DIS average (102.2937
       over 68 days) on 2026-11-22.
   (3) `node scripts/shariah/merge-quarter-prices.js <scratchpad>/qp/part-*.jsonl` (it rejects short, out-of-window or
       split-distorted averages), then `node scripts/shariah/fund-load.js --reuse`, which must exit 0.
5. `node scripts/shariah/diff-inputs.mjs <scratchpad>/sec-inputs.prev.json data/shariah/sec-inputs.json`: keep the
   result for the reply.
6. `node scripts/build-stocks-page.js && npm test`, then the browser check at both widths:
   `NODE_PATH=$(npm root -g) node test/pages/stocks-browser-check.cjs` and the same with PHONE=1. Every "CHECK" and
   "SHARIAH" line must say ok and LOGS must be []. Any failure: do not commit, do not publish; report it.
7. Commit data/shariah/sec-inputs.json, nport-latest.jsonl, funds.json, fund-companies.json, band-needed.json and quarter-prices.json as "Weekly SEC refresh D" with the session's trailers, then
   `git fetch -q origin $B && git merge -q --no-edit origin/$B && git push -q -u origin $B`.
8. Publish with the Artifact tool: file_path /home/user/mdt-signal-dashboard/pages/stocks.html,
   url https://claude.ai/artifact/TUkdHCEyfRfBorus6K5MDa, label "Weekly Shariah refresh D".
9. Reply in Saudi dialect, short: how many companies have a new quarter (name the well-known ones), which stocks now
   fail for sure and which no longer do, any newly stale or unreadable, funds that changed state, and the page link.
   If nothing changed, say so in one line.
