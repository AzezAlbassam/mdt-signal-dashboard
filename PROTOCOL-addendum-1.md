# Addendum 1 to study 2, and study 3 (Saudi market) — pre-registered

**Written 2026-10-07 00:25 UTC, before any study 2 result exists** (the price fetch had just
started; no indicator has been computed on any study 2 series). `PROTOCOL-us.md` is not
edited. This file adds three things the user asked for and fixes how each is handled so
none of them can touch the confirmatory test.

---

## A. The user's watchlist — a separate, labelled group

The user supplied 46 tickers from their TradingView lists ("Under Radar Swings", "To be
searched gems"):

MSTR AAPL AMZN META DELL MU INTC ARM PLTR AMD NVDA MSFT GOOGL ORCL HPE AMAT CRWD PANW TSLA
MDB QCOM IBM COST AVGO MRVL TXN ZENA FIG GLW APH COHR LITE AAOI AXTI VIAV CIEN NOK SPCX VOYG
HAWK LUNR RDW SPIR RKLB ASTS PL

Rules:
1. Tickers already in the study 2 universe stay there unchanged.
2. Tickers **not** produced by the universe rule (foreign ADRs such as NOK and ARM, small
   caps, recent listings) are fetched and analysed **only** in a separate group `watchlist`.
   They are **excluded from H1, H2 and H3**. A list someone picked by hand is exactly the
   kind of sample the mechanical rule exists to avoid, so it cannot vote on the main result.
3. Output for the watchlist (`reports/us-watchlist.txt`): per ticker, its history length,
   and for each Track A/B rule its trade count, win rate and edge, **with the sample size
   shown next to every number**. Per-stock results of a few dozen trades are noise, and the
   report says so.
4. Tickers with fewer than 300 daily bars (recent IPOs) are reported as "too new to test".

## B. Example trades for each indicator — chosen by a rule, not by eye

For every Track A rule, the page shows one winning and one losing trade as a chart.
Selection rule, fixed now: walk the list NVDA, AAPL, MSFT, AMZN, META, GOOGL, TSLA, SPY in
that order; on the first one that has both, show the **most recent completed winning
trade** and the **most recent completed losing trade** in Period II. They illustrate how
the rule looks on a chart. They are not evidence and are not chosen to look good.

## C. Study 3 — the Saudi market (TASI + Tadawul stocks)

Same rules as study 1 and study 2, word for word (`PROTOCOL-swing.md` §5–7), only the
universe differs.

**Universe:** TADAWUL:TASI, plus every Tadawul **main-market** common stock in the
TradingView screener (`market: ksa`, `symbol_types: ["stock"]`) on the snapshot date:
four-digit codes, excluding codes 9000–9999 (Nomu parallel market). No market-cap floor.
Symbols with fewer than 300 daily bars are reported as too new. Data cutoff: last completed
Tadawul session on or before 2026-10-06.

**H1-SA (confirmatory, one test):** Track A `keltner_break`, Period II, on Saudi stocks
**not** used in study 1 (study 1 used TASI, 1120, 2010, 7010, 1180, 2222). Edge > 0 and
one-sided permutation p < 0.05 → confirmed; anything else → not confirmed.

**H2-SA:** the full ranking, all three tracks, exploratory, Holm within track, study 1's
labels. Output `reports/sa-*.txt` and an Arabic page.

## D. Indicator links

For each rule the page gives TradingView's built-in indicator name (as typed in the
Indicators search) and a Pine script in `pine/` that reproduces the tested rule with its
exact stop, target and time exit, so the user can add it to a chart. Links are only given
where they have been checked to resolve.
