# Study 17 — addendum 2: the top 100, not the top 200 (before any result)

**Written 2026-10-23, after addendum 1 and before any rule value, outcome or rank table has been
computed or looked at.** No study result exists; the data file is still being assembled.

## Why

The protocol asked for the 200 largest US companies, which means sourcing December values by
hand for every delisted company that might have ranked 101–200 (about 60 more companies, ~250
company-years, each found twice) and resolving about 180 more screened company-years in that
band. The tools available here make that infeasible to the protocol's own standard:

- web search allows 200 searches per working turn, shared by every research agent; the first
  attempt ran out and most agents came back without numbers;
- TradingView's tool calls have a daily quota (shared with the stock page), which ran out
  after ~90 fetches;
- the SEC's site, Wikipedia and every market-data site other than TradingView are blocked from
  this container.

A 101–200 band filled in only partly would be worse than leaving it out: the missing companies
would be exactly the ones that were later acquired or failed. The user asked about "the largest
50 or 100", so the study narrows to the top 100, where every company can be sourced properly.

## Changes

- **U(Y)** = the **100** largest US companies at the December close of Y (was 200). A year counts
  for a rule when at least **80** companies of U(Y) have both the rule value and g1 (was 100).
- **Delisted companies** are researched when they could have ranked in the top 100: a December
  value of at least 75% of the survivor-only prototype's 100th value that year (2015 $30B, 2016 $36B,
  2017 $42B, 2018 $38B, 2019 $50B, 2020 $58B, 2021 $70B, 2022 $58B, 2023 $70B, 2024 $77B, 2025 $88B),
  plus addendum 1's identity cases of that size (E. I. du Pont, Dow Chemical, DowDuPont, Twenty-First
  Century Fox) and non-members of that size (VMware, LinkedIn, Sprint, Altaba). The rest of addendum
  1's identity cases (SanDisk, Dr Pepper Snapple, Spectra Energy) were below that size and are
  left out like any other company below the band.
- **Addendum 1 screens** are resolved for company-years that could rank in the top 120 under
  either the stored count or an alternative count (the median of the stored counts of up to two
  fiscal years on each side), and for every S2, S3 and S4 row. The others are listed in the
  report as "screened, could not reach the top 120 under either count, not looked up".
- **Base-rate buckets:** 1–10, 11–20, 21–50, 51–100, then "below 100" and "no longer trading".
  Multi-baggers and the "obvious in hindsight" table are taken from U(Y) = the top 100.
- **Power:** with ~95 companies a year the standard error of one year's IC is about 0.10;
  "not confirmed" stays the expected outcome for a modest real edge.

Everything else in PROTOCOL-study17.md and addendum 1 stands.
