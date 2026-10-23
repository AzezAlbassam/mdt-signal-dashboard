# Study 17 — addendum 4: filling the price basis (before any result)

**Written 2026-10-23, after addenda 1–3 and before any rule value, outcome or rank table has
been computed or looked at.** The only new numbers seen since addendum 3 are the spin-off list,
the measured closes, and addendum 1's V4 cross-check (independent year-end values for the top
100 of 2015 and 2021) against the current, not yet basis-corrected build.

## What was found

- **The basis changes only when shares are distributed.** Cash special and variable dividends
  leave TradingView's December closes at the actual closes: S = 1.000 for every measured year of
  Costco (2015–22), EOG, Ford, Newmont, LyondellBasell, ConocoPhillips 2022, CME 2022 and
  Progressive 2022. Exchange offers do too: 3M's S stays at 0.836 on both sides of its 2022
  Neogen exchange offer. So S(Y) is a step function. It is constant between two consecutive share
  distributions (spin-offs, spin-mergers); a span of years between two distributions is a
  *segment* below.
- **The measurement is incomplete.** Some segments that matter have no cited close: Honeywell
  2015, 2016–17 and 2025, GE 2023, AT&T 2015–21, MetLife 2015–16, Danaher 2015, FedEx 2015–25,
  Becton Dickinson 2015–21, and Occidental 2015–19, before its 2020 warrant distribution.
- **Later reverse splits count as splits.** Honeywell did a 1-for-2 reverse split on the day of
  its June 2026 Aerospace spin-off. On a split-adjusted basis, its old actual closes are twice
  the prices that printed at the time. V4 confirms this: the current build has Honeywell at 0.48
  (2015) and 0.50 (2021) of its independent year-end value.
- **One measurement contradicts its segment.** Comcast December 2025 measured 1.000, against
  0.937 in each of 2021–2024, in the same segment before the January 2026 Versant spin-off. Its
  source evidently already carries the spin-off adjustment.
- **The share count is pre-registered as net income ÷ diluted EPS, and V4 shows what that does.**
  It is an average diluted count, and preferred dividends inflate it. Banks and REITs come out
  6–25% above the independent year-end values in 2015: Public Storage +25%, Goldman Sachs +19%,
  Bank of America +17%. Most other companies are within 5%.

## Rules added to addendum 3

1. **Segments.** Each measured year gives S(Y) = TradingView's December close ÷ the actual
   close. The actual close is the printed close divided by the cumulative split ratio of every
   later split and reverse split. Within a segment, S is the median of its measured years, and it
   applies to every year of the segment. A measured year more than 2% from that median is
   rejected and listed. Correction still needs |S − 1| > 2% (addendum 3).
2. **Second pass.** The unmeasured segments listed above get one more search pass, capped at 36
   searches. It accepts only as-traded or split-only closes, each with the source's exact words;
   adjusted series are rejected.
3. **Leftovers.** A segment still unmeasured after the second pass takes the S of the nearest
   measured segment of the same company, with a later segment preferred. An earlier
   distribution can only lower S further, so a later segment gives a partial correction. If the
   company has no measured segment and the segment covers 2015 or 2021, S is our value ÷ the V4
   value. Otherwise S stays 1. Every leftover is listed with its source rule. Companies never
   near the top 100 in an unmeasured segment are left at 1 and listed: Air Products 2015, Dell
   2016–20 and Trane/old Ingersoll-Rand 2015–19.
4. **V4 after the basis.** The V4 check is rerun on the corrected build. Renamed tickers are
   matched to the company: BRK → BRK.A, FB → META, PCLN → BKNG, ANTM → ELV, UTX → RTX,
   DD 2015 → DD-old, FOXA 2015 → FOXA-old. The report gives the median absolute gap and lists
   every gap above 15% with its cause, plus each company V4 places in the top 100 that we
   rank below it.
5. **No change to the share definition.** Net income ÷ diluted EPS stays as pre-registered. The
   V4 gaps it causes are listed under rule 4 and reported as a limit of the data. No result is
   adjusted for them.

Everything else in PROTOCOL-study17.md and addenda 1–3 stands.
