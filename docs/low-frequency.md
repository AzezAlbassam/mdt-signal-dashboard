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
| 21 | 1.0σ | condor, 0.5σ wings | 86.9% | +1.12 | −14.9 | −19.45 |
| 21 | 1.0σ | condor, 0.25σ wings | 85.0% | +0.54 | −8.18 | −10.98 |
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

## Choosing the wing

The wing is not chosen by what looks safest. It is chosen by what survives four
legs of commission.

| Wing | Win rate | Mean per trade | At 0.20 a leg |
| --- | --- | --- | --- |
| 0.25σ | 85.0% | +0.54 | −0.06 |
| 0.50σ | 86.9% | +1.12 | +0.52 |
| 0.75σ | 87.9% | +1.53 | +0.93 |
| 1.00σ | 88.3% | +1.79 | +1.19 |

A quarter-sigma wing looks like the cheap, tight, sensible choice and it is the
wrong one: it leaves so little credit that four legs of cost put it under water
at twenty cents a leg. Half a sigma collects more than twice as much, wins
slightly more often, and is still clearly positive at costs three times higher.
Going wider keeps raising the money but lowers the return on what you post, so
half a sigma is where the two curves cross.

This was a correction. The first pass picked the quarter-sigma wing on the
strength of its smaller absolute worst case and had to be shown the cost table.

## Could you still be there at expiry?

Every figure above assumes the position was carried to settlement. A naked
short index position is margined, the requirement grows as it moves against
you, and a broker closes you out when the equity runs out. `marginPath` tracks
the requirement and the equity on every session a trade is open.

| Structure | Mean margin | Return on margin | Closed out | Worst window |
| --- | --- | --- | --- | --- |
| 1.0σ strangle | 46.30 | +4.13% a month | 18 of 2,668 | closed out 9 March 2020, settled loss 242% of margin |
| 2.0σ strangle | 44.21 | −0.13% a month | 11 of 2,668 | closed out 12 March 2020, settled loss 213% of margin |
| 1.0σ condor, 0.5σ wings | 8.56 | +12.24% a month | none | survived, worst loss is the posted amount |

On the worst window of the decade an account funded at the initial requirement
is closed out on 9 March 2020, fourteen sessions before the expiry the study
books, with the requirement at 3.37 times what was posted. The −91.26 in the
grid is a loss the trader was never present to receive; they were closed out
earlier and lower, and the settled figure is 242 per cent of the margin, which
is the account plus a debt to the broker.

That window is the one detail worth memorising. Its entry VIX was 17.1, below
the decade's mean of 18.4. The tape was calm. No filter in this study, including
the one that waits for VIX above 25, would have stayed out of it.

It is not only the crash. The median month peaks at 1.25 times the collateral
it took to open, so an ordinary winning month already asks for more than you
posted.

Stated as return on the capital actually at risk, the grid reads very
differently from the win rates. The structure that wins ninety-nine months in a
hundred earns a negative return on its margin. The defined-risk structure earns
the most, is never closed out because its entire worst case is posted on day
one, and loses that whole posted amount in 8.6 per cent of months, which is
about once a year. Its longest run of consecutive losing months in the decade
was two.

## The trade, stated exactly

SPX iron condor, four legs, one expiry, about 30 calendar days out.

At entry compute `move = S0 × (VIX/100) × √(days to expiry / 365)`, then:

- sell the call at `S0 + 1.00 × move`
- sell the put at `S0 − 1.00 × move`
- buy the call at `S0 + 1.50 × move`
- buy the put at `S0 − 1.50 × move`

Hold to expiry. No adjustment, no stop, no profit target, because hold to
expiry is the only rule this study measures and anything else would be a
number nobody has.

`trade-sheet.html` in the repository root does this arithmetic for you: type
the index level and VIX and it prints the four strikes, the credit, the most
you can lose, the same figure on the tenth-size index, and the fill floor, for
all three structures.

Size the contract count so the maximum loss, which is the wing width less the
net credit and is known exactly at entry, is five per cent of account equity.
Do not size on margin, notional or credit.

| Risk per month | Compounded return | Worst drawdown |
| --- | --- | --- |
| 3% of equity | 4.5% a year | 9.3% |
| 5% of equity | 7.5% a year | 15.3% |
| 6% of equity | 9.0% a year | 18.2% |

A volatility filter was tested from VIX 10 to 25. It raises the money per trade
and lowers the compounded return, because it leaves you in cash two thirds of
the time. Skip it.

### The check that decides whether to trade it at all

Every premium here is a model output priced off the same VIX that sets the
strikes. Not one real quote appears in this repository. Before risking
anything, price the exact structure for three months and record the net credit
you could actually be filled at, as a share of the wing width.

The floor is different for each structure, because a wider short strike
collects less against the same wing. Quoting one number for all of them, as an
earlier draft did, is wrong.

| Structure | Model credit | Break-even | Do not trade below |
| --- | --- | --- | --- |
| 1.0σ shorts, monthly | 21.5% of the wing | 11.0% | 14% |
| 1.0σ shorts, fortnightly | 21.6% | 12.5% | 16% |
| 1.25σ shorts, monthly | 13.7% | 6.3% | 8% |

If your fills come in under the floor, the entire edge is inside the bid and
ask, and you would be paying to carry the risk.

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

**The defined-risk figures are a model's credit.** The wing caps the loss for
certain, but the 11.3 per cent a month is priced at VIX. Pricing the legs five
per cent cheaper, which is roughly what VIX overstating the at-the-money quote
would mean, takes it down by about a quarter. Only a real bid and ask settles it.

**The sample is back-loaded.** Four fifths of the decade's profit comes from
2021 onward, and the first five years, which contain the only genuine stress
test, contribute a fifth.
