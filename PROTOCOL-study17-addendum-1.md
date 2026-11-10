# Study 17 — addendum 1: data checks on the share counts (before any result)

**Written 2026-10-23, after the protocol (0022845) and before the data file has been built,
before any rule value, outcome or rank table has been computed.** While mapping tickers, a
look at three stored histories showed that the protocol's market value (December close ×
net income ÷ diluted EPS) can be badly wrong in two ways the protocol did not foresee:

1. **Price and EPS on different bases.** TradingView adjusted some old prices for a large
   special dividend or a reorganisation as if it were a split, while the fiscal-year EPS
   was not restated: Dr Pepper Snapple's December 2015 close is stored as 15.01 against a
   real ~93 (the $103.75 special dividend of 2018), with its real ~190M shares, so its value
   comes out at ~$3B instead of ~$18B.
2. **A ticker that changed hands.** The S&P list's "DD" before September 2017 is E. I. du
   Pont, but TradingView's NYSE:DD history and fiscal years belong to the later DowDuPont /
   DuPont (December 2015: 91.92 × 138M = $13B against a real ~$58B); "FOXA"/"FOX" before
   March 2019 is Twenty-First Century Fox, whose prices TradingView no longer serves.

Neither is visible in a test result, so the rules below are fixed now, while no result
exists. They change which numbers enter the file, never the hypotheses, the universe, the
outcome or the tests.

## Rules added to §1

- **Identity.** An S&P ticker at a date belongs to the company that held it then. When
  TradingView has no December close for that company at that date, or its history under the
  ticker belongs to a later company, the company is treated like one that no longer trades
  (§1 "Companies that no longer trade"). Known now: DD before 2019-06-03 (E. I. du Pont to
  2017-08-31; DowDuPont, S&P ticker DWDP, 2017-09-01 to 2019-06-02), DOW before 2019-04-02
  (Dow Chemical), FOXA/FOX before 2019-03-19 (Twenty-First Century Fox), SNDK before
  2016-05-12 (SanDisk), KDP before 2018-07-09 (Dr Pepper Snapple). Others found by S3 below
  are added the same way and listed in the report.
- **Screens.** Every company-year of an S&P member (and of every non-member that ranks in
  the top 250) is screened:
  - **S1 jump:** the share count changes by more than 25% from the previous or the next
    fiscal year;
  - **S2 basis:** December close ÷ diluted EPS below 4 with EPS > 0, or cap ÷ fiscal-year
    revenue below 0.1 or above 100;
  - **S3 identity:** a member with no December close, or whose stored history starts after
    a date at which it was a member;
  - **S4 today:** for companies still trading, today's close × the latest fiscal year's
    count is more than 15% away from TradingView's market value.
- **Resolution.** A flagged company-year is looked up (the 10-K/10-Q cover-page share count
  nearest the December close and the actual unadjusted December close, with sources). When
  the looked-up value differs from the stored one by more than 10%, the looked-up value is
  used and the override is saved with its source in `data/caps/overrides.json`. The report
  counts overrides by screen.
- **V4 cross-check.** After the overrides, the computed top 100 of December 2015 and of
  December 2021 is compared company by company with year-end market values found
  independently (cover-page shares × close, or a directly quoted year-end value), plus a
  search for any company those sources place in that year's top 100 that the file does not.
  The report gives the median absolute gap, every gap above 15% with its cause, and what was
  corrected.

Everything else in PROTOCOL-study17.md stands as written.
