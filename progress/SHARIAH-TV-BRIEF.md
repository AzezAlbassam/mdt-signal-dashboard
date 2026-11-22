# Brief for the TradingView quarter-average agents (weekly Shariah refresh, step 4b(2))

The brief given to the two background agents on 2026-11-22, kept here so an unattended run can repeat it exactly
(external audit 2026-11-22). Replace <scratchpad> with the session's scratchpad directory and K with 1 or 2. Each
line now also carries "asOf", the day the split-adjusted bars were fetched: fund-load.js divides an average by a share
split that came after that day (merge-quarter-prices.js keeps averages from week to week).

---

Data task: for each US stock in a list, compute the average daily closing price over a given date window, from TradingView. Accuracy matters: the averages decide a Shariah debt-ratio screen.

Input: <scratchpad>/qp/need-tv-K.json — a JSON array of {"t": ticker, "symbol": "EXCHANGE:TICKER", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD"} (the company's latest fiscal quarter).

Load the TradingView bars tool once with ToolSearch (query "select:mcp__Trading_view_MCP__mcp-tv-get-ohlcv"). For each item:
1. Call it with symbol = the item's symbol, interval "1D", date_from = start, date_to = end, format "columns", count 120.
2. Check that the response's "symbol" is the one you asked for and success is true. The bars come as arrays t[] (unix seconds, UTC) and c[] (closes).
3. Compute with a script, never by hand. Paste the t and c arrays exactly as returned:
   python3 -I -c 'import json,sys,datetime as D; t,s,e,sym=sys.argv[1:5]; ts=json.loads(sys.argv[5]); cs=json.loads(sys.argv[6]); r=[(D.datetime.fromtimestamp(x,D.timezone.utc).strftime("%Y-%m-%d"),c) for x,c in zip(ts,cs)]; r=[(d,c) for d,c in r if s<=d<=e]; p=[c for _,c in r]; print(json.dumps({"t":t,"start":s,"end":e,"n":len(p),"avg":sum(p)/len(p),"first":r[0][0],"last":r[-1][0],"min":min(p),"max":max(p),"source":"TradingView","symbol":sym,"asOf":D.datetime.now(D.timezone.utc).strftime("%Y-%m-%d")}))' T START END SYMBOL '[t array]' '[c array]' >> <scratchpad>/qp/part-tv-K.jsonl
4. If a call fails (symbol not found, a quota or limit message, no bars), append {"t": ..., "start": ..., "end": ..., "error": "<short reason>", "source": "TradingView"} instead. If the failure is a daily quota or rate limit, do not keep calling: write the same kind of error line for every remaining item with the reason "quota" and stop.
Never invent, estimate or take a price from anywhere else. Do not edit any other file. Do not change the environment.

At the end reply with how many items succeeded, which failed and why, and the line count of part-tv-K.jsonl.
