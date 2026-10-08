# Study 5 — long swings: entries for 3-, 6- and 12-month holds

**Written 2026-10-07, before any study 5 strategy has been computed.** The user's main
interest is long swings (months to a year). Study 2's track C asked whether an in/out rule
beats holding forever; this study asks the trader's question instead: **when an indicator
says buy and you hold for months, do you do better than buying at a random time?**

> **بالعربي:** هل الدخول عند إشارة المؤشر والاحتفاظ 3 أو 6 أو 12 شهراً أفضل من الدخول في وقت
> عشوائي على نفس السهم ونفس المدة؟ بحث على نصف الأسهم، تأكيد على النصف الآخر، كما في دراسة 4.

---

## 1. Samples

Exactly study 4's split (`PROTOCOL-study4.md` §1): search = even positions of the sorted
stage-1 US universe; confirmation = odd positions plus study 1's crypto and Saudi symbols.
The confirmation set is loaded only by `scripts/study5-confirm.js`, after the shortlist is
committed.

## 2. Strategy space (weekly bars only)

**Entries:** study 4's 76 events on weekly bars, plus two long-horizon signals:

| id | signal |
|---|---|
| hi52 | close is a new 52-week closing high, the first in 13 weeks |
| rs_spy | the stock's 52-week return minus SPY's 52-week return crosses above 0 |

**Exits** (no stop; a long-hold investor's exits):

| id | exit |
|---|---|
| H13 | sell at the close of the 13th week (≈ 3 months) |
| H26 | sell at the close of the 26th week (≈ 6 months) |
| H52 | sell at the close of the 52nd week (≈ 12 months) |
| T | sell at the next open after a weekly close below SMA 40; at most 104 weeks |

**Filters:** F0 none; F1 entry only when close > SMA 40.

78 × 4 × 2 = **624 strategies.** Entry at the next week's open; 0.10% per side; one trade
at a time per symbol and strategy.

## 3. Metrics

Returns are in percent (there is no stop to define R). For each strategy: trades, **win
rate** (net return > 0), mean and median return, **edge** = mean return − mean return of
random entries with the same exit and filter on the same symbols and periods (weighted by
trade count), and — reported only — the average excess over SPY across the same holding
windows. Permutation test as in study 4 (2,000 draws).

## 4. Shortlist (search set) and confirmation

Shortlisted if, on the search set: win rate ≥ 60% overall and ≥ 55% in each period; edge
> 0 in both periods; ≥ 200 trades; permutation p < 0.001. Up to 10, highest edge first,
committed to `reports/study5-shortlist.json` before confirmation runs.

**Confirmed** on the confirmation set if win rate ≥ 60% and edge > 0 with Holm-corrected
p < 0.05.

## 5. Known bias, stated now

Every stock here is a large company **today**. Over a 12-month hold that flatters anything
that buys these stocks — strongly. Buying at a random time on the same stocks carries the
same bias, which is why the edge over random entries, not the raw return or the win rate,
is the measure. Momentum-type signals (hi52, rs_spy) are the most exposed: today's giants
were yesterday's momentum winners. The report says so next to every such result.
