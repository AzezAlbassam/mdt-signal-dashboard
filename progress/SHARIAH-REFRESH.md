# Weekly Shariah refresh (versioned prompt)

The scheduled task "تحديث الشرعية الأسبوعي" (every Saturday 01:17 Riyadh, bound to the audit session) sends a pointer to
this file. Change the steps here, not in the scheduled task.
2026-11-21: created (owner: "ابدا في التحديث الاسبوعي"). Funds join step 4 once the fund loader exists.

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
4. Funds: when scripts/shariah/fund-load exists, run it as its header says (its own checks must pass).
5. `node scripts/shariah/diff-inputs.mjs <scratchpad>/sec-inputs.prev.json data/shariah/sec-inputs.json`: keep the
   result for the reply.
6. `node scripts/build-stocks-page.js && npm test`, then the browser check at both widths:
   `NODE_PATH=$(npm root -g) node test/pages/stocks-browser-check.cjs` and the same with PHONE=1. Every "CHECK" and
   "SHARIAH" line must say ok and LOGS must be []. Any failure: do not commit, do not publish; report it.
7. Commit data/shariah/sec-inputs.json (and the funds data) as "Weekly SEC refresh D" with the session's trailers, then
   `git fetch -q origin $B && git merge -q --no-edit origin/$B && git push -q -u origin $B`.
8. Publish with the Artifact tool: file_path /home/user/mdt-signal-dashboard/pages/stocks.html,
   url https://claude.ai/artifact/TUkdHCEyfRfBorus6K5MDa, label "Weekly Shariah refresh D".
9. Reply in Saudi dialect, short: how many companies have a new quarter (name the well-known ones), which stocks now
   fail for sure and which no longer do, any newly stale or unreadable, funds that changed state, and the page link.
   If nothing changed, say so in one line.
