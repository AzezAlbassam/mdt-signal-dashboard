# Study 17 — addendum 3: price basis (before any result)

**Written 2026-10-23, after addenda 1 and 2 and before any rule value, outcome or rank table has
been computed or looked at.**

## What was found

TradingView describes its bars as "split-adjusted only". They are not: old prices are also
scaled down for spin-offs and large special distributions. Comparing its December closes with
the actual closes (split-adjusted, not spin-adjusted):

| Company | TradingView ÷ actual, Dec 2015 and Dec 2019 | Event after those dates |
|---|---|---|
| 3M | 0.836, 0.836 | Solventum spin-off, 2024 |
| AT&T | 0.755, 0.755 | Warner Bros. Discovery spin-merger, 2022 |
| Danaher | 0.672, 0.886 | Fortive 2016, Veralto 2023 |
| GE | 0.598, 0.622 (after the 1-for-8 reverse split) | GE HealthCare 2023, GE Vernova 2024 |
| Pfizer | 0.948, 0.948 | Upjohn/Viatris, 2020 |
| Merck | 0.954, 0.954 | Organon, 2021 |
| IBM | 0.955, 0.955 | Kyndryl, 2021 |
| Johnson & Johnson, Abbott | 1.000, 1.000 | (Kenvue was an exchange offer; regular dividends are not adjusted) |

(The actual closes are from memory for this check; the measured ones below are sourced.)

Because EPS is restated for splits but not for spin-offs, the protocol's market value (adjusted
close × net income ÷ EPS) equals the true value times the cumulative spin adjustment factor
S(Y) after December Y: AT&T before 2022 comes out 24.5% low, GE before 2023 about 40% low. That
moves companies across rank buckets in the early years, so it must be fixed before any result.

## Rule added to §1

- **Identification.** For every company that ranks in the top 120 at any December close in the
  current build (208 still trading), list each spin-off, split-off, special dividend or other
  distribution from 2015 to today, with its date, from knowledge checked against search
  (events of 2025–2026 searched explicitly).
- **Measurement.** For each listed company, the actual December closes (split-adjusted only)
  for the years before its last event, from a cited yearly price table; S(Y) = TradingView's
  December close ÷ that close. Where |S(Y) − 1| > 2%, cap(Y) is divided by S(Y) (equivalently,
  the actual close is used with the split-adjusted share count) and the factor is saved with
  its source in `data/caps/basis.json`. Overrides from addendum 1 that already use an actual
  close are not touched.
- **Residual check.** Addendum 1's V4 cross-check (top 100 of 2015 and 2021 against
  independently found year-end values) is run after this and catches what the list missed;
  every gap above 15% is explained in the report.
- Returns shown on the page keep TradingView's adjusted prices (closer to what a holder of the
  parent plus the spun-off shares earned); ranks and market values use the measured basis.

Everything else in PROTOCOL-study17.md and addenda 1–2 stands.
