# Addendum 2 to study 2 — run in two stages while the screener is rate-limited

**Written 2026-10-07 ~01:00 UTC, before any study 2 result exists.** `PROTOCOL-us.md` and
addendum 1 are unchanged; this only fixes how the universe is assembled while TradingView's
screener endpoint returns HTTP 429. Every number in the study still comes from TradingView
(chart bars via `get_ohlcv`, metadata via `search-symbols`); no other data source is used,
at the user's request.

## Why

The screener is used only to **list** which symbols exist. Indicators are computed from the
same daily bars a TradingView chart shows. One screener page was taken before the limit
hit: the 600 largest US-market "stock" rows, down to $45.08B market cap
(`data/us/screener-page1.json`). The rest of the ≥ $2B list needs the screener again.

## Stage 1 — now

Universe = that page, filtered mechanically:

1. Prefix `NYSE:`, `NASDAQ:` or `AMEX:` and ticker `^[A-Z.]+$` (PROTOCOL-us §2 rules 1–2).
2. Instrument type from TradingView `search-symbols` must be `stock`. Type `dr` (depositary
   receipt = foreign ADR) is excluded — this stands in for rule 3 (country = US).
   Foreign companies listed directly as ordinary shares are not caught by this and stay in;
   they are counted and named in the report.
3. Non-common issues are excluded when the TradingView description contains any of:
   `Notes`, `Debentures`, `Preferred`, `Depositary Shares`, `%`.
4. One class per issuer (rule 5): symbols with the same TradingView `logoid` are one
   issuer; the one with the larger `average_volume_10d_calc` is kept.
5. Market cap ≥ $2B holds for all of them by construction.
6. Symbols whose history the connector returns inline instead of as a file (short listings,
   under roughly 700 bars) cannot be stored without hand-copying numbers, which is not
   done. They are listed as "not stored". Symbols with fewer than 300 stored bars are listed
   as "too new".

Plus the 20 ETFs of PROTOCOL-us §2. `AMEX:UFO` is not a valid symbol; the fund trades as
`NASDAQ:UFO`, which is used (same rule as study 1's exchange-prefix clause).

**H1 runs on stage 1**: Keltner breakout, Track A, Period II, stage 1 symbols not used in
study 1. H2 and H3 are reported for stage 1.

## Stage 2 — when the screener answers again

The full PROTOCOL-us §2 rule is applied to a complete screener snapshot. Every resulting
symbol **not** in stage 1 forms the stage 2 sample, and stage 2 is reported on its own:

- **H1b:** the same Keltner test on the stage 2 sample. These stocks will not have been
  seen by any result, so it is a second, independent confirmation.
- Stage 1's Robust rules are checked on stage 2 the same way (does each keep a positive
  edge?). Nothing is re-ranked or re-selected on stage 2.
- Finally, stages 1 and 2 are reported combined as the full ≥ $2B study.

If the screener never answers, stage 1 is the study 2 result and the report says so.
