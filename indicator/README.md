# The chart indicator

`spy-expected-move.pine` draws the daily, weekly and month-to-date expected-move
bands on a price chart. It is Pine Script v6, so it runs on TradingView.

## Loading it

1. Open a SPY chart.
2. Pine Editor, then Open, then New indicator.
3. Replace everything in the editor with the contents of `spy-expected-move.pine`.
4. Save, then Add to chart.

## What it reproduces exactly

The anchors. The daily band hangs on the previous session's close, the weekly on
the previous Friday's, the monthly on the previous month end. Those were checked
to the cent against fifteen published charts and every one matched a real close.

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

## TrendSpider

TrendSpider does not run Pine. Its own scripting language can reach the option
data it sells, which would let the plain family be computed on the chart rather
than typed in. That port has not been written.
