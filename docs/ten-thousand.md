# What $10,000 actually does

The study reports percentages of the money at risk. An account is not a
percentage. It has a size, it buys **whole contracts**, and a contract whose
maximum loss exceeds the risk budget cannot be bought in a smaller size. That
indivisibility is the first thing a percentage hides, and at $10,000 it is the
entire answer.

Strategy throughout: the 1.25σ call spread with 0.5σ wings, 30 days, held to
expiry, one a month, sized so the maximum loss is 5 per cent of the account.
Measured on SPY, which is the same level as XSP and one tenth of SPX.

## 1. At $10,000 the trade is not buyable

Every month a trade came up in 2026:

| entry | VIX | sell | buy | credit | one contract risks | 5% budget | contracts |
|---|---|---|---|---|---|---|---|
| 2026-01-02 | 14.5 | 719.9 | 734.5 | $106 | $1,372 (14%) | $500 | **0** |
| 2026-02-03 | 18.0 | 734.0 | 751.8 | $129 | $1,660 (17%) | $500 | **0** |
| 2026-03-05 | 23.8 | 741.2 | 765.2 | $177 | $2,229 (22%) | $500 | **0** |
| 2026-04-06 | 24.2 | 715.0 | 737.5 | $165 | $2,089 (21%) | $500 | **0** |
| 2026-05-05 | 17.4 | 768.8 | 786.9 | $131 | $1,683 (17%) | $500 | **0** |
| 2026-06-04 | 15.4 | 800.9 | 818.4 | $127 | $1,636 (16%) | $500 | **0** |
| 2026-07-07 | 16.1 | 790.2 | 807.2 | $123 | $1,587 (16%) | $500 | **0** |
| 2026-08-05 | 15.8 | 812.7 | 829.8 | $124 | $1,602 (16%) | $500 | **0** |

One contract risks **$1,732** on average against a **$500** budget. To buy a
single contract under the 5 per cent rule you need about **$34,645**.

**Following the rule exactly: 0 trades, 8 skipped, final equity $10,000.**

## 2. Breaking the rule: one contract anyway

Peak position 21.8 per cent of the account, against a 5 per cent rule.

| entry | exit | VIX | risk | P&L | equity |
|---|---|---|---|---|---|
| 2026-01-02 | 2026-02-03 | 14.5 | $1,372 | +$96 | $10,096 |
| 2026-02-03 | 2026-03-05 | 18.0 | $1,660 | +$119 | $10,215 |
| 2026-03-05 | 2026-04-06 | 23.8 | $2,229 | +$167 | $10,381 |
| 2026-04-06 | 2026-05-05 | 24.2 | $2,089 | **−$717** | $9,664 |
| 2026-05-05 | 2026-06-04 | 17.4 | $1,683 | +$121 | $9,785 |
| 2026-06-04 | 2026-07-07 | 15.4 | $1,636 | +$117 | $9,901 |
| 2026-07-07 | 2026-08-05 | 16.1 | $1,587 | +$113 | $10,014 |
| 2026-08-05 | 2026-09-03 | 15.8 | $1,602 | +$114 | $10,128 |

**$10,128. Up 1.3 per cent in eight and a half months**, seven wins and one
loss, at more than four times the intended risk.

Holding the index over exactly the same window: **$11,137, up 11.4 per cent.**

## 3. One window is an anecdote

All 2,521 eight-month windows of the decade, $10,000 forcing one contract:

| worst | 5th | 25th | **median** | 75th | 95th | best |
|---|---|---|---|---|---|---|
| −10.0% | −1.9% | +1.8% | **+4.9%** | +7.0% | +9.0% | +11.1% |

Profitable in 89 per cent of windows. **2026's +1.3 per cent was a below-median
window, not a typical one.** The windows overlap heavily, so treat the shape as
indicative and the count as one decade, not 2,521 samples.

## 4. Nothing shrinks the contract without killing the edge

Return on risk over the decade, by wing width and cost per leg:

| wing | width | credit | contract | $0.05 | $0.10 | $0.20 | $0.30 |
|---|---|---|---|---|---|---|---|
| 0.5σ | 10.6 pts | $78 | $997 | +5.3% | +4.3% | +2.2% | +0.3% |
| 0.375σ | 8.0 pts | $64 | $744 | +5.4% | +4.0% | +1.3% | −1.2% |
| 0.25σ | 5.3 pts | $47 | $495 | +5.1% | +3.1% | **−0.9%** | −4.5% |
| 0.125σ | 2.7 pts | $26 | $250 | +3.3% | **−0.7%** | −7.8% | −13.9% |

And by shortening the expiry, which shrinks sigma and the contract with it:

| hold | days | wing | 2026 contract | decade | at $0.20/leg | trades fitting $10k |
|---|---|---|---|---|---|---|
| 21 | 31 | 0.5σ | $1,732 | +5.3% | +2.2% | 0 |
| 10 | 15 | 0.5σ | $1,230 | +4.6% | +0.3% | 0 |
| 5 | 7 | 0.375σ | $646 | +3.0% | −4.7% | 2 |
| 3 | 4 | 0.375σ | **$499** | +1.3% | **−8.2%** | 33 |

The one configuration that fits a $500 budget returns 1.3 per cent at an
unrealistic $0.05 a leg and **−8.2 per cent** at a realistic one. **There is no
version of this trade that fits $10,000 and still has an edge.**

## 5. And with enough capital, what is it worth?

`+5.3% of the money at risk` is not an account return. At the 5 per cent rule
the money at risk *is* 5 per cent of the account. Run over the decade at every
start offset, at $1,000,000 so whole-contract rounding stops distorting it:

| risk per trade | CAGR worst / median / best | drawdown median / worst |
|---|---|---|
| 5% | 1.9% / **2.9%** / 3.8% | 4.4% / 5.7% |
| 10% | 3.7% / **5.8%** / 7.8% | 8.9% / 11.4% |
| 20% | 7.1% / **11.8%** / 16.1% | 17.8% / 22.2% |
| 30% | 10.2% / **17.8%** / 25.1% | 26.7% / 32.6% |

Holding the index: **13.3 per cent a year, 34.1 per cent drawdown.**

So this is not a way to beat the index. At 20 per cent risk a trade it roughly
matches the index with half the drawdown; at the prescribed 5 per cent it
returns less than cash. That is the real trade-off, and it is not what the
headline percentage suggests.

## Reproducing

```
node --test 'tests/*.test.js'
node scripts/ten-thousand.mjs
```
