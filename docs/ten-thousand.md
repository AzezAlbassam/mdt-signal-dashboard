# What $10,000 actually does

An earlier version of this page got four things wrong and they are corrected
below. The corrections are kept visible rather than quietly edited out.

Strategy under test: a defined-risk credit spread at the expected-move band,
30 days, held to expiry, one a month, sized so the maximum loss is 5 per cent
of the account. Measured on SPY, which is the same level as XSP and one tenth
of SPX. Sample 2016-01-04 to 2026-09-14.

---

## 1. The recommended trade does not fit $10,000

The 1.25σ **call** spread with 0.5σ wings costs $1,372 to $2,229 a contract
through 2026, against a $500 budget. Contracts are indivisible, so the answer
is zero, every month.

| entry | VIX | one contract risks | share of a $10,000 account | contracts |
|---|---|---|---|---|
| 2026-01-02 | 14.5 | $1,372 | 14% | **0** |
| 2026-02-03 | 18.0 | $1,660 | 17% | **0** |
| 2026-03-05 | 23.8 | $2,229 | 22% | **0** |
| 2026-04-06 | 24.2 | $2,089 | 21% | **0** |
| 2026-05 – 08 | 15–17 | ~$1,600 | 16% | **0** |

**The account that can take every month is $44,577**, not the $34,645 quoted
earlier — that was the *mean* of the eight monthly requirements used as if it
were a threshold. At $34,645 the rule skips March and April, which are the two
high-VIX months, the ones most worth selling.

## 2. But a different spread does fit, and this is the correction that matters

The earlier claim — *"there is no version of this trade that fits $10,000 and
still has an edge"* — is **false**. It tested only the call side, and only two
levers. A **0.75σ put spread with a 5-point wing** (5 points being XSP's actual
listed strike interval above $200) fits the 5 per cent rule in every month of
2026 and never exceeds it:

| | put 0.75σ, 5-pt wing | call 1.25σ, 0.5σ wing |
|---|---|---|
| Contract risk, 2026 | **~$400** | $1,372–$2,229 |
| Fits a $500 budget | **every month** | never |
| 2026, median of 21 calendars | **+6.6%** | not tradeable |
| Calendars that lost money | **0 of 21** | — |

## 3. My 2026 number was one calendar out of twenty-one

Every other study in this repo runs all 21 start offsets and averages, and says
why. The account script did not. Forcing one call-spread contract through 2026:

| worst | median | mean | best | losing calendars |
|---|---|---|---|---|
| **−3.6%** | **+4.7%** | +4.5% | **+9.5%** | 5 of 21 |

**The +1.3% reported earlier was the `start = 0` calendar** — near the bottom of
the range. And the claim *"2026 was a below-median window"* is therefore wrong:
measured properly, 2026's +4.7 per cent sits level with the decade's +4.9 per
cent. **2026 was a dead-average eight months.**

## 4. "You end with exactly $10,000" is false

The whole model runs at a zero interest rate. It isn't zero. $10,000 in bills
over that window ends at about **$10,283**, and the forward rate of ~4 per cent
a year is **above this strategy's own decade median CAGR at the 5 per cent rule
(2.85 per cent)**. The null action is not nothing; it is the benchmark, and at
the prescribed sizing the strategy loses to it.

## 5. The wing lever was cherry-picked

The earlier page quoted only the 0.125σ wing, the one that dies. The break-even
total cost per leg, by bisection over the decade:

| wing | 2026 contract | break-even cost/leg | at $0.10 | at $0.20 |
|---|---|---|---|---|
| 0.5σ | $1,732 | **$31.52** | +4.3% | +2.2% |
| 0.375σ | $1,291 | $25.21 | +4.0% | +1.3% |
| 0.25σ | $856 | $17.73 | +3.1% | −0.9% |
| 0.125σ | $429 | $9.14 | −0.7% | −7.8% |

Against the $5.00 a leg the model assumes. **The edge is not fragile to fills.
It is simply small**, and the 0.25σ wing keeps 72 per cent of it while halving
the contract — a usable lever the earlier page never mentioned.

## 6. The pricing stress the call spread does not survive

`lib/premium.js` justified flat-volatility pricing as cautious. That is true for
a structure selling **both** sides. For a one-sided structure the sign flips: an
out-of-the-money index call trades *below* at-the-money vol and VIX sits *above*
it, so pricing a short call at flat VIX **overstates** the credit twice over.
For a short put it understates it.

Decade return on risk, all 21 phases, stress applied evenly:

| structure | flat | ×0.92 | skew .10 | both | both + $0.20/leg | full losses |
|---|---|---|---|---|---|---|
| put 0.75σ, 5-pt | +9.1% | +6.5% | +12.3% | **+9.5%** | **+2.1%** | 7.2% |
| put 1σ, 5-pt | +5.2% | +2.9% | +8.0% | +5.5% | −1.1% | 4.5% |
| call 1.25σ, 5-pt | +4.7% | +2.9% | +2.5% | +1.0% | −4.9% | 1.2% |
| **call 1.25σ, 0.5σ** | +5.3% | +3.6% | +3.2% | **+1.9%** | **−1.0%** | 0.4% |

Under honest pricing *and* a heavy fill, **the call spread this study
recommended turns negative**. Only the 0.75σ put spread survives, and thinly.
Skew helps a put seller and hurts a call seller, and the earlier write-up chose
the call on win rate without testing that.

The put's cost is at the other end: it loses its full maximum in **7.2 per cent**
of months against the call's 0.4 per cent. At a 5 per cent rule that is −5 per
cent of the account roughly twice a year. It is survivable, and it does not feel
like a 96 per cent win rate.

## 7. What still holds

- **Buy-and-hold beats all of it at this size.** 2026: index +11.4% against the
  best option configuration's +6.6% median. Decade: 13.3% a year with a 34%
  drawdown, against roughly 3–12% depending on the risk rule, with 5–22%.
  You are paying return to buy a smaller drawdown.
- **Lower frequency is strictly worse.** Quarterly, semiannual and annual
  versions are all negative — the edge is a per-period premium collected twelve
  times a year.
- **The window distribution is ~15 independent observations**, not 2,521. The
  "worst −10.0%" is an empirical minimum over 15 effective draws, not a bound.
  The structural worst case is a single forced contract losing its full maximum.
- **SPY cannot be substituted.** It is American-style and physically settled;
  early assignment on a $10,000 account means being short ~$75,000 of stock and
  a forced buy-in. XSP and SPX are European and cash-settled.

## Reproducing

```
node --test 'tests/*.test.js'
node scripts/ten-thousand.mjs
```
