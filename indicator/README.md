# The chart indicators

Two scripts, one per instrument. Both draw the daily, weekly and month-to-date
expected-move bands. Pine Script v6, so they run on TradingView.

| File | Chart |
| --- | --- |
| `spy-expected-move.pine` | SPY |
| `spx-expected-move.pine` | SPX |

They are separate rather than one parameterised script because the index differs
in ways that are not settings: its monthly contract settles on an opening print,
it lists two option roots, it never pays a dividend, and it is quoted in points.

## Loading one

1. Open the matching chart.
2. Pine Editor, then Open, then New indicator.
3. Replace everything in the editor with the contents of `spy-expected-move.pine`.
4. Save, then Add to chart.

## What it reproduces exactly

The anchors. The daily band hangs on the previous session's close, the weekly on
the previous Friday's, the monthly on the previous month end. Those were checked
to the cent against fifteen published charts and every one matched a real close.

The model itself was checked across both instruments on the same dates. On
28 August 2026 the index daily band implied 9.44 per cent and the fund's implied
9.56, a gap of 1.2 per cent. Over August the index monthly band implied 15.13 per
cent against the fund's 15.07, a gap of 0.4 per cent. Two different tools, two
different instruments, one model.

The iVol family, to within the volatility feed. Across those charts the implied
volatility held between 0.88 and 0.96 of the VIX close for the daily band, so the
default of 0.92 lands close. Set it to Manual and type a figure if you have a
better one.

## What it cannot do here, and why

The plain family prices the actual expiry. Its implied volatility ran from 0.59
of VIX on a quiet Monday to 1.04 into an inflation print, because a front expiry
is crushed over a weekend and rich into an event. No chart platform exposes an
option chain to a script, so no script can compute it.

Two ways round it:

- **Exact.** Read the at-the-money straddle of the next session's expiry and of
  the Friday expiry off any broker's option chain, and type both into the inputs.
  That is the number the plain band plots. Takes about twenty seconds an evening.
- **Approximate.** Leave the source on *Scaled from iVol*. The default 0.798 is
  the ratio of a straddle to a one-standard-deviation move. It is right on
  average and wrong on the days that matter most, because the real ratio moved
  between 0.63 and 1.09 across the published charts. Good enough to see the
  structure, not good enough to rest an order on.

The `em.html` page in this repository computes the plain family properly, because
its pipeline fetches a real chain, and prints both straddles each evening. Typing
those two numbers in gives you the exact bands on the chart.

## What differs on the index

**Settlement.** The monthly contract settles on a special opening quotation taken
from the third Friday's opening prints, not from its close. In that week the
weekly band is measuring to an opening auction. The script flags the week; it
does not adjust the maths, because the adjustment depends on how you want the
band read.

**Two roots.** The index lists a weekly root that expires Monday through Friday
and settles on the close, and a monthly root that expires on the third Friday and
settles on the open. On that one date both carry the same expiry at different
prices. In the fixture used by the test suite the gap is nearly ten index points,
about a quarter of a daily band. The chain reader in `lib/` prefers the weekly
root and the test suite asserts it; a reader matching on date alone takes the
wrong one silently.

**No dividend.** The index never drops on an ex-dividend date. The fund does,
quarterly on the third Friday of March, June, September and December, which
mechanically shifts any band centred on the prior close. The index band is the
cleaner of the two.

**Points, not dollars.** Everything is roughly ten times the fund, and the
straddle inputs are in points.

## TrendSpider

TrendSpider does not run Pine. Its own scripting language can reach the option
data it sells, which would let the plain family be computed on the chart rather
than typed in. That port has not been written.
