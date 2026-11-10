# Study 18 — who gets valued how (audit of 2026-11-10, Phase 2) — pre-registered

**Written 2026-11-10, before any value below has been computed.** The audit of 2026-11-10
(`progress/AUDIT-PLAN.md`, Phase 2.1) found four places where the page's valuation method is wrong
for a whole group of companies, each with named examples, and asked for them to be tested the way
Study 16 tested its nine choices: a change that looks right can still fail once closeness to the price
is controlled for (Study 16's D6). This protocol copies Study 16's data, outcome, error, tests and
adoption rules (`PROTOCOL-study16.md` §1, §4, §5) and changes only the decisions and the base.

The runner `scripts/study18-run.js` was smoke-tested before this commit on the first 5 stocks of the
universe (`SMOKE=5`), which prints only the counts of stocks, stock-years and report lines and writes no
report, to check that it runs; it was run on nothing else. No value, error, IC or p-value of any option
was looked at.

## 1. Data and dates

As Study 16 §1, unchanged: the same 815-stock universe (`data/fv` + `data/fv8`, deduplicated the same
way), test dates the end of May 2012–2025, the outcome c1 (the price a year later with SPY's move over
the year taken out), fundamentals through `parseFundamentals` and `stateAt`, the balance-sheet columns
already saved in `<dir>/raw/bal/` (Study 16's collection; nothing is fetched for this study), beta at
May R, today's sector and industry from `sectors.json`. **No new TradingView calls.**

## 2. The base configuration B0 (the page's valuation rules today, on annual data)

Study 16's B0 (§2 there) with the changes the page has made since, as far as annual data can carry them:

- **Study 16's D2 C** (adopted 2026-10-23): with 3 or more valued methods, a method above 3× or below
  ⅓ of their weighted median (ascending order, first value whose cumulative weight reaches half the
  total − 1e-12) is dropped before the weighted mean.
- **P/B from ROE (pbj), v29 (2026-11-10, by reasoning):** no pbj for an industry "Real Estate Investment
  Trusts"; for any other stock, pbj only when 0 < c0 ÷ BVPS_F0 ≤ 4.
- **Not carried into B0:** v29's REIT weights (EV/EBITDA 0.5, P/S 0.25, 5-year-average P/E 0.25). They
  went live by reasoning, marked provisional until this study reports; they are E1's option C below. In
  B0 a REIT has the Finance profile (P/E 0.5 and pbj 0.5, pbj absent as above, so P/E alone).
- v28–v29's other changes act on quarterly figures, quote fields or analysts' forecasts (share counts
  today, DCF growth from the twelve months, the fade start from the 3-year revenue growth, which equals
  year 1 here because year 1 is that growth) and have no annual counterpart.

The DCF, the F16 cap of 100 on pe/pen/ev, Lynch's ≥ 10% rule for peg, Graham's weight 0 and the
pre-revenue exclusion are as in Study 16's B0.

## 3. Decisions and their options

Option A is B0 in every decision. Each challenger changes only its own decision, from B0, and only on
the stock-years its group names; elsewhere every option equals A.

| | Decision | Group | Options |
|---|---|---|---|
| E1 | Capital-light financials | Industry "Real Estate Investment Trusts", "Finance/Rental/Leasing", "Investment Banks/Brokers", "Insurance Brokers/Services" or "Investment Managers", profile Financial | **A** B0. **B** Mature weights (P/E 0.3, DCF 0.3, EV/EBITDA 0.25, Graham 0 as in B0), pbj not used. **C** EV/EBITDA 0.5, P/S 0.25, 5-year-average P/E 0.25 |
| E2 | Cyclical at a peak | Profile Mature, Growth or Heavy, and EPS_F0 > 2 × the mean EPS of F0−4 … F0 (all five present, mean > 0), or NI < 0 in any of F0−4 … F0−1 (at least 4 of them present) | **A** B0. **B** the 5-year-average P/E (pen) at weight 0.3 (unchanged where the profile already weights it), and PEG on EPS growth only (no revenue fallback: g = st.epsG; no PEG when it has no value). **C** B, and the DCF on normal free cash flow: fcf0 = (mean of FCF ÷ revenue over F0−4 … F0, years with both present, at least 3) × rev_F0 ÷ shares_F0, the same growth and rate as B0's DCF |
| E3 | A loss-maker that used to be profitable | Profile Unprofitable growth, and NI > 0 in at least 3 of F0−4 … F0 (at least 4 of the five present) | **A** B0 (own-history P/S). **B** the equal-weight mean of pen and EV/EBITDA, whichever of the two have a value (both multiples ≤ 100 at May R, as B0's cap); no value when neither has one |
| E4 | A method far from the others | Stock-years where Study 16's D2 C drops a method under A, or where B's or C's value differs from A's by more than 0.5% | **A** dropped (D2 C). **B** clamped: a value above 3 × med counts as 3 × med, below med ÷ 3 as med ÷ 3, then the weighted mean. **C** tapered: its weight is multiplied by 3 × med ÷ x above the band and by x ÷ (med ÷ 3) below it, then the weighted mean. B and C use the weighted median with a midpoint at an exact tie: when the cumulative weight equals half the total (within 1e-12) at a value, med is the mean of that value and the next one |

- E2's "mean EPS" uses the stored fiscal-year EPS of F0−4 … F0 (the same years `st.epsNorm` uses when
  all five exist). With fewer than five, the stock-year is not in E2's group.
- E3's profile under B is irrelevant: only pen and ev count, at equal weight. pen needs epsNorm > 0.
- E1 options B and C use the blend and the D2 C trim of B0 on their own weights.
- The thresholds (2×, 3 of 5, 0.3, 0.5/0.25/0.25, 3×) are fixed here and are not tuned.

## 4. How a decision is made

Exactly Study 16 §4: error e = |ln(V ÷ c1)|; the comparison set U_d (every option gives V > 0, c1
exists, some option differs from A by more than 0.5%); yearly median errors over years with ≥ 10
stock-years; a test by years (exact one-sided sign-flip, Holm within the decision, the ranking guard of
0.02 on the mean yearly IC) when at least 8 years count, else by stocks (exact sign-flip up to 24
stocks, else Monte Carlo with 200,000 draws from `seededRng(18)`, used in the order E1 … E4 and B … C;
no ranking guard; not decidable under 8 stocks); the price-closeness control δ* against A moved as
close to the price as X; adoption needs mean δ > 0, Holm p < 0.05, mean δ* > 0 and (by years) the
guard; among eligible challengers the largest mean δ, the earlier letter on a tie; otherwise A.

## 5. The combination

Study 16 §5: B\* is B0 with every adopted option, applied in the order E4 (how methods are combined),
then E1, E2, E3 (each acts on its own group and its own weights); options removed one at a time,
smallest mean δ first (ties: the higher decision number), while B\*'s pooled median error is above B0's.

## 6. Reported, not tested

As Study 16 §6: per option the yearly M, δ, δ*, IC, set sizes, the share within 25% of the later price,
the median signed error and the naive baseline; the stock-years where options disagree on whether a
value exists; the 24-month horizon; large caps (top 300 by c0 × shares_F0 each year). Named stocks:
E1 NYSE:O, NYSE:V, NYSE:MA, NYSE:BX; E2 NASDAQ:MU, NYSE:XOM; E3 NASDAQ:INTC, NYSE:AAL; E4 NASDAQ:MU.
Each group's size per year is printed.

## 7. Known limits

Study 16 §7, all of them (survivorship, price returns without dividends, today's restated data,
sectors and peer margins, no forecast history, annual figures, one date a year, total vs common equity,
buybacks, US stocks only, the same stocks every year, closeness to the price, Holm within a decision
only). Also:

- E1's group is small (about 80 stocks) and mixes REITs with lenders and managers; a result for the
  group may not hold for each part. It is not split after the run.
- E2's peak rule uses fiscal-year EPS; the page sees the last twelve months.
- With four decisions and no correction across them, at most 0.2 false adoptions are expected if none
  had a real effect.

## 8. What the page does either way

- **E1:** the adopted option replaces v29's provisional REIT weights for the whole group. If A stays,
  REITs return to the Finance profile (P/E, no pbj, as 2.2 of the plan keeps), and the note says so.
- **E2:** the adopted option applies when the page's last-twelve-months EPS (or a loss year among the
  last 5 fiscal years) meets the rule, with the page's own normal-FCF figures for C.
- **E3:** on the page, for Unprofitable-growth stocks profitable in 3 of their last 5 fiscal years.
- **E4:** replaces the D2 C trim in `blendTrimmed` (the studies keep `blend`).
- Every decision gets a line in the page's notes and the change log, with the option's error against
  the later price next to A's. A decision not adopted keeps A and says it was tested.
