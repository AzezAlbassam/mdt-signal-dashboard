# Addendum 3 — stage 1 filters without per-symbol lookups

**Written 2026-10-07 ~01:10 UTC, before any study 2 result exists.** The user stopped the
per-symbol `search-symbols` lookups that addendum 2 §2–4 relied on and asked to start the
test with the stocks already downloaded. Addendum 2's stage 1 filters 2–4 are replaced by
the following rules. They use only the committed screener page and the downloaded
TradingView bars, so they are mechanical and reproducible:

1. **Listing:** prefix `NYSE:`, `NASDAQ:` or `AMEX:`, ticker `^[A-Z.]+$` (unchanged).
2. **Alternate issues:** rows that share an *identical* screener market cap with another row
   are alternate issues of one issuer (notes, preferreds, tracking classes); **all** of
   them are dropped.
3. **Fixed-income screen:** a symbol whose annualised daily-return volatility over its last
   504 stored sessions is **below 8%** behaves like a note or preferred, not a common
   stock, and is dropped. (Common large caps sit well above 12%.)
4. **One class per issuer:** two symbols whose daily returns over their last 500 common
   sessions correlate at **≥ 0.98** are treated as share classes of one company; the one
   with the larger 10-day average volume is kept.
5. **Foreign issuers:** with no country field available, foreign ADRs and cross-listings
   stay in, under `PROTOCOL-us.md` §2 rule 3's own fallback ("ADRs are kept and this is
   reported"). The report lists the stage 1 symbols that are not US companies so readers
   can see how many there are.
6. **History:** fewer than 300 stored daily bars → "too new"; history the connector
   returns inline (short listings) → "not stored". Both are listed.

Everything else in `PROTOCOL-us.md` and addenda 1–2 stands, including H1 on stage 1 and
stage 2 as an independent replication if the screener becomes available.
