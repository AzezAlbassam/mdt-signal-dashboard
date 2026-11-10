# Study 6 — addendum 1: medium and long holds

**Written 2026-10-08, after study 6's results (`reports/study6.txt`) and before any of the
holds below has been computed.** The user asked for the best FLT / MOD strategies for
medium- and long-term trades. Study 6 only tested a 20-bar hold and the Close Long exit
(≈ 50–100 bars). This addendum tests longer holds on the same signals.

> **بالعربي:** نفس الإشارات الخمس، لكن بالاحتفاظ 3 أو 6 أو 12 شهراً، أو حتى Cross Down.
> نفس العملات والأسهم ونفس المقارنة مع دخول عشوائي. الشروط مكتوبة قبل الحساب.

## 1. What changes

Everything in `PROTOCOL-study6.md` holds (indicators, entries, samples, costs, periods,
one trade at a time, warm-up 250 bars, entry at the next open), except the exits:

| id | exit | horizon |
|---|---|---|
| M3 | sell at the close of the first bar dated on or after signal date + 3 calendar months | medium |
| M6 | same, + 6 months | medium–long |
| M12 | same, + 12 months | long |
| XD | sell at the next open after the first FLT Cross Down (EMA 20 crosses below EMA 200) after the signal; at most 24 calendar months (then as M24) | long, trend-following |

Calendar months make crypto (7-day weeks) and stocks (5-day weeks) comparable.

5 entries (OL, CU, BC, MOD, DB) × 4 exits × 2 groups (crypto, US) = **40 tests.**

## 2. Verdict

Same as study 6 §4: edge over random entries with the same exit > 0, Holm-corrected
p < 0.05 across these 40 tests, and edge > 0 in both periods. Permutation test with
**4,000** draws (seed 20261017), so the smallest possible p (≈ 0.00025) can survive Holm
over 40 tests. Study 6's 20 tests keep their own verdicts; they are not re-corrected.

## 3. Known bias, stated now

A 12-month hold on assets that are large today is strongly flattered (study 5 §5). Random
entries carry the same bias; the edge over them is the measure, not the raw return or win
rate. Few long trades fit in crypto's short history: expect small samples there.
