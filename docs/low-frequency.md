# One trade a month

A separate study from the same-session work, and a more trustworthy one.

`scripts/premium.mjs` runs every non-overlapping holding period in the decade,
sells a defined structure, and settles it on the terminal price the way a
European index option settles. `lib/premium.js` holds the maths and
`tests/premium.test.js` pins it. The output is `data/em/premium-spy.json`.

## Why this one can be priced and the intraday one could not

The same-session study had to guess the volatility a market maker would quote
at the moment a band was touched, and the guess turned out to be the entire
result. This study does not have that problem. VIX is a thirty-day implied
volatility on this exact index, published by the exchange that lists the
options. Pricing a twenty-one session option off it is close to reading a
quote rather than inventing one.

Two biases remain and they point in opposite directions. VIX is a variance
swap rate computed from the whole strip, so it sits above the at-the-money
implied volatility and hands the seller slightly more premium than they would
really get. And the strikes are priced flat, while a real index put one sigma
out trades well above the at-the-money volatility, which hands the seller less.
Both are measured in the sensitivity tables rather than argued about.

## What the market pays for

| Holding period | Implied at entry | Realised over the period | Ratio |
| --- | --- | --- | --- |
| 21 sessions, n=128 | 18.42 | 14.88 | 1.238 |
| 10 sessions, n=268 | 18.45 | 14.47 | 1.275 |

Implied exceeded what followed in 83 per cent of months. That gap is the whole
of what a premium seller is paid, and it needs no option price to measure. It
is also the whole of what they are risking, because the months it fails are the
months it fails badly.

The gap is widest when volatility is cheap, at 1.31 in the calmest third of
months against 1.20 in the most stressed. Selling into a panic pays a bigger
number for a bigger risk, not a better ratio.

## The structures

Every configuration is run at every possible start offset and averaged,
because a monthly grid has a phase and the answer moves with it. In the
unluckiest phase of the decade the worst month is six times worse than in the
luckiest, because one grid straddles a crash and another starts the day after.

| Hold | Strikes | Structure | Win rate | Mean per trade | Worst month | Worst in any phase |
| --- | --- | --- | --- | --- | --- | --- |
| 21 | 1.0σ | strangle | 89.2% | +2.01 | −46.98 | −91.26 |
| 21 | 1.5σ | strangle | 96.4% | +0.69 | −39.45 | −85.21 |
| 21 | 2.0σ | strangle | 99.0% | +0.02 | −32.23 | −78.44 |
| 21 | 1.0σ | condor, 0.25σ wings | 85.0% | +0.54 | −8.18 | −10.98 |
| 21 | 1.5σ | condor, 0.25σ wings | 90.3% | +0.21 | −6.00 | −8.98 |
| 10 | 1.0σ | strangle | 89.0% | +1.27 | −34.69 | −56.53 |

Read the last two columns first. The two-sigma strangle is what "a very high
win rate" literally asks for: it wins ninety-nine months in a hundred. After
costs it earns two hundredths of a point a month, it is profitable in only
thirteen of twenty-one phases, and its worst month takes back more than six
times everything it ever made.

## Which years carry it

Basis points of the index at entry, because a credit grows with the index and
this decade roughly tripled.

| Year | Strangle mean | Strangle worst | Condor mean | Condor worst |
| --- | --- | --- | --- | --- |
| 2016 | 66 | −107 | 15 | −165 |
| 2017 | 30 | −381 | 4 | −72 |
| 2018 | 34 | −515 | 6 | −206 |
| 2019 | 55 | −261 | 9 | −147 |
| 2020 | 1 | −2,737 | 26 | −338 |
| 2021 | 79 | −372 | 23 | −112 |
| 2022 | 57 | −576 | 9 | −147 |
| 2023 | 49 | −345 | 7 | −127 |
| 2024 | 55 | −259 | 13 | −105 |
| 2025 | 61 | −449 | 18 | −180 |
| 2026 | 55 | −286 | 10 | −173 |

The naked structure earned in every year but one and gave back more than a
quarter of the index in a single position in that one. The defined-risk
structure never had a losing year and made its best return in 2020, because
the credit was fat and the loss had a ceiling. Its ceiling is not a fixed
percentage: the wing is measured in sigma, so a position opened at a VIX of
seventy risks far more than one opened at fifteen.

## What this study cannot tell you

**The credit is a model output, not a quote.** The strikes and the premium come
from the same volatility, so the mean credit restates the variance premium
rather than confirming it. Only a real bid and ask would do that, and this
repository holds none.

**Twenty-one phases are not twenty-one samples.** Running every start offset
removes the luck of where the grid falls. It adds no evidence. The independent
sample is roughly one phase's worth of non-overlapping periods, about 127
months, so any interval read off the pooled trade count is about four and a
half times too narrow.

**The tail rests on a handful of months.** A decade holds very few crashes. The
next one need not resemble 2018, 2020 or 2022, and a short premium position is
a bet that it will not be worse.

**Holding to expiry assumes you are never forced out.** Every trade here is
carried to settlement. A real naked position is margined, and the margin grows
as it moves against you.
