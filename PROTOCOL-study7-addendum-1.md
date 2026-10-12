# Study 7, addendum 1 — the same regression band for silver — pre-registered

**Written 2026-10-12, before any silver data is fetched and before any study 7 result
exists** (the gold and stock data are still being fetched; nothing has been computed).
`PROTOCOL-study7.md` is not edited. The user asked for a silver band next to the gold one.

## What changes for silver

- Same indicator, same fit, same defaults (`pine/gold-log-regression.pine` becomes
  `pine/metal-log-regression.pine` and works for both). Only the default start date
  depends on the symbol:
  - gold: **1971-08**, as in §B1;
  - silver: **1968-07**. Until 1967 the US Treasury sold silver at $1.29 an ounce, which
    capped the price; silver certificates stopped being redeemable in silver on
    1968-06-24. From July 1968 the price was set by the market.
- The start date is still an input, and the "Auto" preset picks it from the ticker
  (SILVER or XAG → silver, anything else → gold's date).

## Check — descriptive only, as §B2

From TVC:SILVER monthly closes, with the past-only fit (at least 20 years of data before a
month counts, so from 1988-07): every episode below the −1 SD band with its forward 12, 36
and 60-month returns; the average over all months; the same table for the all-data fit
labelled as hindsight. Output `reports/study7-silver.txt`.

Expected caveat, written down before seeing the numbers: silver peaked in January 1980 and
has spent most of the 46 years since well below that peak, so its long-run trend is weak
and its residual spread wide. A wide band is honest about that; it is not a defect to be
tuned away.
