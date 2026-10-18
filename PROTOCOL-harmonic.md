# Study 12 — Harmonic patterns (XABCD): pre-registered protocol

**Written 2026-10-18, before any pattern has been detected on any symbol and before any price
series was downloaded for the universe in §2.** The universe snapshot in §2 was built before
this file and is frozen with it. Nothing here changes after results exist. A bug found later
is fixed, marked post-hoc, and shown with the numbers before and after.

> **بالعربي:** المطلوب مؤشر هارمونيك حقيقي لـ TradingView — نماذج XABCD كاملة بنسب فيبوناتشي
> الأصلية كما نشرها أصحابها، لا نسخة مبسّطة ولا نسب محرّفة — يعمل على كل الفريمات ويعطي
> الأهداف. ومعه اختبار صادق: هل النماذج فعلاً دقيقة؟ وأي فريم أدق؟ وأي نموذج أدق؟
>
> الطريقة ثابتة قبل أن نرى أي نتيجة: نكتب القواعد كاملة هنا، نجمّدها، ثم نشغّل الاختبار مرة
> واحدة على ٤٠ رمزاً (أكبر ٢٠ شركة + تنويع قطاعي + روكت لاب وبلوم إنرجي وهيمز + بيتكوين +
> مؤشرات) وعلى خمسة فريمات. والنتيجة — أياً كانت — تُكتب كما هي، حتى لو كانت "النماذج لا
> تعمل". هذا معنى ألا نحرّف.
>
> والاختبار الحاسم ليس "كم مرة نجح النموذج" — هذا رقم بلا معنى بدون مرجع يُقاس عليه. الاختبار
> هو: هل يتفوّق على **دخول عشوائي** بنفس الهدف ونفس الوقف؟ وهل **نسب فيبوناتشي نفسها** تتفوّق
> على نسب عشوائية مركّبة على نفس الهيكل؟ إن لم يتفوّق، فالنموذج لا يضيف شيئاً مهما بدا جميلاً
> على الشارت.

---

## 0. What prompted this, what the record already says, and what could not be checked

The user asked for a TradingView harmonic indicator — "harmonic, the real thing, the complete
fundamentals, nothing distorted" — working on every timeframe, printing targets, plus a table
naming the most accurate timeframe and the most accurate pattern, for investing, swing trading
and day trading alike.

### 0.1 Harmonic trading is public, unlike studies 6 and 11

This is not a closed vendor product. The ratio sets are published: H.M. Gartley, *Profits in
the Stock Market* (1935); Larry Pesavento, *Fibonacci Ratios with Pattern Recognition* (1997);
Bryce Gilmore, *Geometry of Markets*; Scott Carney, *The Harmonic Trader* (1999) and *Harmonic
Trading* vols. 1–3 (2010–2016), with the ratio pages on harmonictrader.com. §1.5 reproduces
those published definitions and invents none of them.

One correction to the brief, recorded because it matters to the words "original harmonic":
**the 1935 Gartley book contains no Fibonacci ratios.** harmonictrader.com says so itself —
Gartley worked in thirds, and the 0.618/0.786/0.886 apparatus is Pesavento-and-Carney, roughly
1988–2001. So "the original, undistorted harmonic" is not a single recoverable object. What
§1.5 freezes is the **modern Pesavento–Carney stratum**, which is what every harmonic
indicator on the market implements and what the user is asking for.

### 0.2 Provenance limit, stated before anything is built on it

**Outbound fetching is blocked in this environment.** Every direct page request — including
harmonictrader.com — fails at the egress proxy (`403` to `CONNECT`) or with `ENOTFOUND`, and
the failure is universal rather than per-host (`example.com` fails identically). The search
backend works; direct reads do not. So **no primary text was read directly, by anyone, at any
point in building this file.** §1.5 is assembled from search-layer extracts of
harmonictrader.com and secondary sources, plus the source code of five public TradingView
harmonic implementations that *were* readable through `raw.githubusercontent.com`.

It was then handed to a second researcher instructed to **refute** it, who widened the source
base and returned four substantive corrections, all of which are applied here: the Alternate
Bat's BC ceiling (3.618 is sourced after all), the Deep Crab's embedded AB=CD (1.272, and
emphatically never the 1.0 placeholder the first pass left), the Shark's point labelling, and
the claim that the Butterfly's 0.786 B point is unanimous. That reviewer hit the same wall and
could only widen the source base, not raise its tier. Where sources disagree the disagreement
is printed in §1.5.1, not smoothed. Anyone who wants these numbers verified against the
physical books should do that; this file is explicit that it has not been done here.

### 0.3 What the prior evidence actually is — the prior for this study

Searched deliberately before the hypotheses were written, so the prior is on the record:

- **There is no peer-reviewed study that backtests harmonic XABCD patterns as a trading rule
  with a stated sample, trade count and significance test.** Not one.
- The nearest peer-reviewed item (Bednarz 2013, *Folia Oeconomica Stetinensia* 13(1), Bat on
  WIG20 futures, "206.43% in 27 days") reports no trade count and reads like a single
  illustrated trade.
- de Souza et al. (2021) tests **frequency of occurrence**, not profitability: 56 patterns
  detected, only the Butterfly family above a trivial baseline.
- The best-executed study in the neighbourhood is **negative**: Batchelor & Ramyar, *Magic
  numbers in the Dow* (Cass, 2006), DJIA 1914–2002, Fibonacci ratio clustering against a
  Politis–Romano stationary block bootstrap — "a few significant ratios appear, but no more
  than would be expected by chance given the large number of tests we conduct."
- Practitioner numbers are vendor content and contradict each other on **direction**, not just
  size: one source ranks the bullish Gartley worst of five patterns, another ranks it near
  best; one calls the bearish Crab the best pattern there is, another says avoid the Crab
  entirely. The widely repeated "70–85% accuracy" figures have no traceable source.
- Thomas Bulkowski's often-quoted **86–92% "turn rate at D"** is not a win rate. It counts
  whether price reacted at D at all, on an ex-post "perfect trades" population, with the move
  measured to the ultimate high or low rather than to a target. It must not be compared with
  anything in this study.
- **No study anywhere compares harmonic entries against a matched random entry, and none tests
  whether the Fibonacci ratios beat arbitrary ratios on the same swing structure.** The
  §4 N1 arm appears to be unprecedented in the public record.
- **No head-to-head test of harmonic accuracy across timeframes exists** — not peer-reviewed,
  not practitioner. The table the user asked for does not exist anywhere and has to be made.

**So the prior literature gives no basis for expecting a positive result here, and the one
rigorous nearby test is negative.** That is written down now so that whatever §5 returns
cannot be dressed up afterwards as either a surprise or a vindication.

### 0.4 What had been looked at before this file was written, and in what order

No bar of any symbol in §2. The only price data touched was the TradingView screener snapshot
that built §2 (market caps, sectors, 10-day average volume — no OHLC) and two `summary=true`
probes on `NASDAQ:AAPL` to establish feed depth (4h: 5,000 bars back to 2016-10; monthly: 551
bars). Neither probe returned a bar. `engine/harmonic.js` and its tests were written against
synthetic patterns only — bars constructed by hand from the ratios in §1.5.

**The exact order of events, since "pre-registered" is a claim about ordering and nothing
else.** §1–§9 were written, then `engine/harmonic.js` and its no-look-ahead tests, then the
bar download for the §2 universe began while the §1.5 cross-check was still running, then the
cross-check returned and its corrections were applied to §1.5, and only then was this file
committed. So the download overlapped the writing. What matters is that **no pattern had been
detected, no trade simulated and no statistic computed on any downloaded bar at any point
before this file was committed** — the first run of `scripts/harmonic-run.js` against real
data happens after the commit that freezes this document, and the git history shows it.

---

## 1. The model — frozen now, never tuned

All of §1 is frozen. If nothing passes in §5, **these numbers are not changed to make
something pass**; any later change is post-hoc and labelled so.

### 1.1 Pivots

Patterns are built on **confirmed alternating swing pivots**, never on a repainting ZigZag.
The detector is the one already in this repository, `createZigzag()` in
`engine/vortex-live.js`, stepped one bar at a time with a per-bar threshold:

```
thr(t) = K_PIVOT × ATR14(t) / close(t) ,   K_PIVOT = 1.5
```

A swing high is confirmed on the first bar whose low is `thr` below it; a swing low on the
first bar whose high is `thr` above it. The confirming bar's index is `confirmedAt`, and
**nothing about a pivot may be used before its `confirmedAt` bar**. The still-forming last
swing never appears.

Why this and not the alternatives. Live scanners use, variously: a one-sided rolling extreme
that revises in place (HeWhoMustNotBeNamed's Editors'-Pick script, four parallel ZigZags at
lengths 5/10/15/20); a symmetric Williams fractal `ta.pivothigh(n, n)` with n = 4 or 5
(Harmonic Pulse, QuaxisLabs); a multi-scale sweep over 18 pivot lengths at once (reees);
and ATR- or percent-based swings (XoRonX; LuxAlgo at 5% deviation, depth 10). The first
family **repaints by construction** — its newest pivot is shifted off and replaced whenever a
more extreme value arrives — and repainting ZigZag is the single most damaging criticism
levelled at harmonic backtests. A volatility-relative threshold is used instead of a fixed
percentage so that one constant serves a monthly KO chart and a 4-hour BTC chart.
`K_PIVOT = 1.5` is set here by reasoning — a swing worth naming has to retrace more than a
day's normal range — and not by trying values on the data. `K_PIVOT ∈ {1.0, 3.0}` is re-run and
reported under §6 as sensitivity only, never as a verdict.

A pattern's points must be **consecutive pivots** in that one stream: three for AB=CD, four for
the XABCD family, five for Three Drives. No skipping and no multi-scale sweep, so each pivot
run is examined once and once only. This is deliberately the strict reading — a multi-scale
sweep manufactures overlapping candidates and multiplies the comparison count — and its cost
is stated in §7: patterns whose B or C is a swing smaller than `K_PIVOT` are invisible here.

### 1.2 The patterns

Bullish form is given; the bearish form is its exact mirror. In the bullish form **X, B and D
are lows and A, C are highs**, so the entry at D is a buy. The engine works in `v = s · price`
with `s = ±1`, which makes the bearish case the bullish case and removes any chance of the two
being coded differently. Ratios are measured on price distances, `XA = |A − X|` and so on.

**D is never a pivot.** It is what the PRZ predicts. A pattern is registered on the bar that
confirms **C** — the last pivot it needs — and from then on nothing about it changes.

### 1.3 A naming correction, then tolerance

These are routinely called "the Fibonacci ratios", including by the people who sell them, and
that is wrong in a way worth fixing before anything is frozen. The canonical harmonic set is
**0.382, 0.5, 0.618, 0.707, 0.786, 0.886, 1.13, 1.272, 1.414, 1.618, 2.0, 2.24, 2.618, 3.14,
3.618**. Of these, 0.5 and 2.0 come from halving and doubling, 0.707 and 1.414 from √2, 2.24
from √5, and 3.14 is π. Only part of the set is Fibonacci-derived. This document therefore
says **"the harmonic ratio set"**, and H2 in §5 tests that set as published — not a numerical
mysticism about one sequence.

#### Tolerance, and the convention it is measured in

A published point ratio `r` becomes `[r × (1 − TOL), r × (1 + TOL)]` with **TOL = 0.05**, i.e.
**5% relative** (0.786 → 0.7467…0.8253). Published ranges are used as they stand, with no
tolerance added. TOL is one global constant and is never tuned per pattern.

The convention has to be stated because implementations do not agree on it, and the spread is
a factor of twelve:

| implementation | input | convention | band at 0.786 |
|---|---|---|---|
| LuxAlgo (doc example) | XA precision 0.01 | additive | 0.776 – 0.796 |
| a published listing | ±3% | relative | 0.762 – 0.810 |
| **this study** | **TOL 0.05** | **relative** | **0.747 – 0.825** |
| Harmonic Scanner (OeaGmeDz) | 5% | relative | 0.747 – 0.825 |
| QuaxisLabs V2.2 | `fib_tolerance` 0.05 | additive | 0.736 – 0.836 |
| HeWhoMustNotBeNamed ×2 | `errorPercent` 10 | relative | 0.707 – 0.865 |
| Harmonic Pulse | `ratioTol` 0.10 | additive | 0.686 – 0.886 |
| reees | `pctErr` 15 | relative | 0.668 – 0.904 |

This study sits at the tight end: 5% relative is looser than the two tightest conventions
found (±0.01 additive, ±3% relative) and tighter than everything else, including the two
most widely used scripts. It is also strict in a second way that matters more than the
tolerance: **every ratio must hold simultaneously.** Harmonic Pulse requires only 3 of 4
ratios to match, and HeWhoMustNotBeNamed accepts the BC projection **or** the XA ratio rather
than both for six of its patterns — roughly doubling detections against a strict reading.

### 1.4 Structural validity

A candidate must satisfy all of, or it is not a pattern:

1. the points are consecutive alternating confirmed pivots;
2. every ratio window in §1.5 holds at once;
3. the pattern's own breach rules in §1.5 hold;
4. the **PRZ is non-empty** (§1.6). Projections that never meet are not a harmonic pattern —
   convergence is what the method means. This is the same `zone_low <= zone_high` test that
   QuaxisLabs V2.2 uses in Pine.

### 1.5 The frozen ratio table

`XA`, `AB`, `BC` are leg lengths. "from A" means the level is measured off A, which is how
XA retracements and extensions are always quoted. Point ratios carry §1.3's ±5%; ranges do not.

| pattern | pivots | B: AB/XA | C | D from the XA leg | D from the BC leg | breach rules |
|---|---|---|---|---|---|---|
| **Gartley** | X A B C | 0.618 | BC/AB 0.382–0.886 | **0.786 from A** | 1.13–1.618 from C | B above X, C below A |
| **Bat** | X A B C | 0.382–0.50 | BC/AB 0.382–0.886 | **0.886 from A** | 1.618–2.618 from C | B above X, C below A |
| **Alternate Bat** | X A B C | ≤ 0.382 | BC/AB 0.382–0.886 | **1.13 from A** (beyond X) | 2.0–3.618 from C | B above X, C below A |
| **Butterfly** | X A B C | 0.786 | BC/AB 0.382–0.886 | **1.27 from A** (beyond X) | 1.618–2.24 from C | B above X, C below A |
| **Crab** | X A B C | 0.382–0.618 | BC/AB 0.382–0.886 | **1.618 from A** (beyond X) | 2.618–3.618 from C | B above X, C below A |
| **Deep Crab** | X A B C | 0.886 | BC/AB 0.382–0.886 | **1.618 from A** (beyond X) | 2.24–3.618 from C | B above X, C below A |
| **Cypher** | X A B C | 0.382–0.618 | **C at 1.272–1.414 of XA, measured from X** (C breaks past A) | — | **D at 0.786 of XC, from C** | B above X, C above A |
| **Shark** | O X A B | AB/XA **1.13–1.618** (B breaks past X) | — | **0.886–1.13 of OX, from X** | 1.618–2.24 of AB, from B | B beyond X |
| **5-0** | X A B C | AB/XA **1.13–1.618** (B breaks past X) | BC/AB 1.618–2.24 | — | **0.5 of BC from C**, converging with a reciprocal **AB=CD at 1:1 from C** | B beyond X |
| **AB=CD** | A B C | — | BC/AB 0.382–0.886 | — | **CD = AB (1:1) from C**, converging with 1.13–2.618 of BC | C below A |
| **Three Drives** | 5 pivots | retrace 0.618–0.786, drive 1.27–1.618, retrace 0.618–0.786 | — | — | **drive 3 at 1.27–1.618 of the last retracement** | — |

Labelling note: Carney writes the **Shark** as 0-X-A-B-C and the **5-0** as 0-X-A-B-C-D, both
with a numeral zero. Third-party platforms commonly relabel the Shark as X-A-B-C-D, which
shifts every one of its ratios by one letter; that, not the zero, is what corrupts a table. The
table uses the pivots that exist when the pattern registers, so the Shark's completion point is
his C and the 5-0's is his D. Carney's leading `0` in the 5-0 is explicitly unconstrained and
is therefore not required here.

**The AB=CD confluence is NOT a filter in the main run.** Carney names an embedded AB=CD for
the Gartley (1:1), Bat (1.27), Alternate Bat (1.618), Butterfly (1.27) and Crab (1.27 or
1.618), and for the Gartley calls it "most critical" — but the sources that give a number for
the extension patterns say they "usually" use theirs, and taking "usually" as a hard filter has
a consequence that is easy to miss: **a Bat with B at 0.382 of XA cannot satisfy a 1.27 AB=CD
and an 0.886 XA at any C whatever**, so half the Bat's own published B window would silently
vanish. Filtering some patterns harder than others would also bias the one comparison this
study exists to make. So the PRZ is the overlap of the projections every pattern has, and
the strict "+AB=CD" reading is re-run and reported in §6.

#### 1.5.1 Where the sources disagree, and what was chosen

Printed because a frozen protocol that hides its judgement calls is not frozen.

| item | the disagreement | chosen here |
|---|---|---|
| Gartley B | harmonictrader/LuxAlgo: exactly 0.618. Several education sites: anything up to a 0.786 cap. | **0.618 ± 5%** (the primary reading) |
| Gartley D from BC | 1.13–1.618 (LuxAlgo) vs 1.27–1.618 (Pesavento-derived) vs the discrete set 1.13/1.27/1.41/1.618 | **1.13–1.618**, the widest Carney-consistent reading |
| Bat B | 0.382–0.50 preferred, strictly under 0.618 (harmonictrader) vs "up to 0.618" (secondary) | **0.382–0.50** |
| Bat D from BC | "minimum 1.618, no stated maximum" vs 1.618–2.618 | **1.618–2.618** |
| Alt Bat D from BC | harmonictrader and TradingView state **minimum 2.0** with no maximum; LuxAlgo's Bat page gives the Alt Bat window as **2.0–3.618**, and a TradingView Alt Bat note gives CD = 3.618 of BC | **2.0–3.618**, both ends sourced. (An earlier pass had read this as "2.0 exactly", which would have coded as an equality test and rejected essentially every real Alternate Bat.) |
| Butterfly D from XA | 1.27 exclusively (harmonictrader) vs a 1.27–1.618 window (many secondary) | **1.27 ± 5%**, which also keeps Butterfly and Crab cleanly separated |
| Crab D from BC | 2.618/3.14/3.618 (harmonictrader's discrete set) vs 2.24–3.618 (secondary) | **2.618–3.618** |
| Deep Crab B | 0.886 (harmonictrader) vs "0.886 minimum, often deeper" | **0.886 ± 5%** |
| Cypher C | 1.272–1.414 of XA (most) vs 1.13–1.41 (one) | **1.272–1.414** |
| Cypher D | the 0.786 XC point (standard) vs a 0.768–0.886 band (one TradingView script) | **0.786 ± 5% of XC** |
| Shark BC leg | 1.618–2.24 of AB (harmonictrader, LuxAlgo, others) vs 1.13–1.618 (one unattributed) | **1.618–2.24** |
| Butterfly B | 0.786 "mandatory" (Carney, cTrader) vs 0.786 as a naming convention rather than a gate (The Right Trader) vs a **0.786–0.886 window** (Mobee), which would overlap the Deep Crab's defining B | **0.786 ± 5%**, the Carney reading. Not unanimous, contrary to the first pass. |
| Butterfly cap | "stop beyond 1.618 XA" (common) vs a structural cap of **2.618 XA** (cTrader) | neither is a filter here: the PRZ is 1.27 XA ± 5%, so D cannot reach either level. 1.618 XA is in any case the Crab's completion, so a move there has become a Crab rather than a failed Butterfly. |
| Deep Crab AB=CD | no source gives a figure in the first pass; the review found **1.272 as the minimum**, with one source explicit that a 1.618 AB=CD is *not* required | **1.272 ± 5%**, used only in the §6 confluence variant. A 1.0 placeholder was removed — it is the one value no source proposes and it would have coded as a 1:1 equality test. |
| Cypher D | 0.786 of **XC** (most) vs a 0.768–0.886 band (one script) vs 0.786 of **XA** (a live minority) | **0.786 ± 5% of XC**. The XA variant is a different geometry wearing the same name; it is excluded and named here so the exclusion is not silent. |
| Three Drives | 1.27 or 1.618 (Pesavento) vs "1.13, 1.27, 1.618" (one) | **1.27–1.618**; Pesavento's time symmetry is **not** implemented — no source gives a tolerance for it. A sustained fourth push beyond the completion voids the pattern; here the "price breaks beyond the last pivot" rule of §1.6 already removes it. |
| Shark labelling | the first pass claimed Carney writes the Shark as **O**-X-A-B-C (letter) against the 5-0's **0** (numeral) | **both are the numeral 0.** The distinction was not in any source. The real hazard it obscured is genuine and is stated in §1.5: third-party platforms relabel the Shark as X-A-B-C-D, which shifts every ratio by one letter. |
| **Anti-patterns** | Anti-Crab's D is given as 0.618 of XA by one compilation and 1.13 by another; Anti-Butterfly as 0.786 vs 0.886; no source gives B, C or BC windows for any of them; none has a primary source | **excluded entirely**, and the reason is the disagreement, not convenience |

#### 1.5.2 What is excluded, and why — enumerated so the exclusion is not a free parameter

The eleven in §1.5 are not every pattern a harmonic library ships. Listing the rest now stops
"we didn't test that one" from becoming a choice made after seeing results.

| excluded | reason |
|---|---|
| **Anti-Gartley, Anti-Bat, Anti-Butterfly, Anti-Crab, Anti-Cypher, Anti-Shark** | No primary source. The compilations that do give numbers contradict each other outright — Anti-Crab's D is 0.618 of XA in one and 1.13 in another; Anti-Butterfly's is 0.786 in one and 0.886 in another — and none gives B, C or BC windows at all. There is no object here to test. |
| **Black Swan, White Swan** | Carney, *Volume Three*. The one library that documents them says plainly that **no canonical specification exists** and the windows vary by source. |
| **Navarro 200** | **Time-dependent**: implementations draw a time box rather than a price level. This study is price-ratio only, so it cannot represent the pattern faithfully. |
| **Nen-Star** | Structurally close to the Cypher (C beyond A, D outside XA). Excluded, and the consequence is stated rather than hidden: a Nen-Star in the data will be scored as a Cypher or as nothing. |
| **Leonardo, 121 / A-121, Alt Shark, Deep Bat** | Variants in some scanner sets with no primary specification. |
| **Perfect Gartley, Perfect Bat, "max" variants** | Tightened-ratio versions of patterns already in §1.5 (the Perfect Bat is XA 0.50, AB 0.50–0.618, BC 2.0). They would be a separate arm, not a different pattern, and adding them would widen the comparison family for no new question. |

### 1.6 The PRZ, entry, stop and targets — and the seven things no source fixes

**PRZ.** At the bar that confirms **C**, every projection in §1.5 is computable and none of them
needs D:

`PRZ = [max of the window lows, min of the window highs]`, in v-space. Empty overlap → not a
pattern. `PRZ_near` is the edge price reaches first, `PRZ_far` the other. This matches the
shipped implementations that compute a zone from X/A/B/C alone (QuaxisLabs' `zone_low`/
`zone_high`; reees's `prz_bN/prz_bF/prz_xN/prz_xF`). It does **not** match LuxAlgo's PRZ, which
is anchored on D and so cannot be known in advance at all.

The primary sources underdetermine execution on **seven** axes. Each is fixed here by fiat, and
the silence is recorded:

| # | axis | what the sources say | fixed here |
|---|---|---|---|
| 1 | PRZ width limit | no Carney number; education sites offer 0.5%, 1.5%, 3% of price, mutually inconsistent | **none** — any non-empty overlap qualifies; the width is reported, not filtered |
| 2 | per-leg tolerance | ±0.01 to ±15%, additive or relative (§1.3) | **5% relative** |
| 3 | entry trigger | Carney prefers "at least one price bar opposite the trend" inside the zone, but nowhere forbids a limit; shipped backtesters default to a limit at the nearest confluent PRZ level | **limit at `PRZ_near`**, filled on first touch; the confirmation variant is §6 |
| 4 | stop reference | T-bar extreme (Carney's only stated principle) vs beyond X vs beyond D vs a 0.5–1 ATR buffer | **`PRZ_far` ∓ 0.25 × ATR14 of the last closed bar before entry** — defined for every pattern including those where D is already beyond X; "beyond X" is §6 |
| 5 | target leg | Carney's own wording ties 0.382/0.618 to a Type-I reaction but never names the leg; sources split between the **AD** leg and the **CD** leg | **AD leg**; the CD leg is §6 |
| 6 | C→D time limit | no source at all; the only anchor anywhere is a TradingView tool's "0.5 pattern lengths" default | **`index(C) − index(X)` bars after C's confirmation, floored at 10** — one pattern length; 0.5 is §6 |
| 7 | Type-II reversals | needs "a full retest of the original PRZ", with no operational definition | **not implemented**, and no claim is made about it |

**Entry.** A limit at `PRZ_near`, filled the first time a bar's range reaches it; a bar that
gaps straight through fills at its open. `PRZ_near` is the worse of the two edges for the
trader, deliberately. Scanning starts on the bar **after** C's confirmation bar.

The pattern expires **unfilled** if the window in row 6 passes, and is **invalidated** if price
breaks beyond C first, which destroys the structure. Both are counted and reported; neither is
a trade.

**Targets**, Carney's standard set, on the `AD` leg (A to the entry price): **T1** 38.2%,
**T2** 61.8%, **T3** the C point, **T4** the A point. A target counts as reached when a bar's
range touches it.

**Exit, and the only accuracy number that counts.** A trade ends at the first of: stop, **T1**,
or `H = 60` bars after entry (marked to that bar's close). The headline hit rate is **T1 before
stop**. T2–T4 are recorded as how far price got, but they do not define the metric, because a
distant enough target always produces a flattering win rate on the few trades that reach it —
the trap `METHOD.md` §6.2 recorded, a 68.4% win rate that lost money with 76% timeouts.

**Intrabar order is unknown**, so when one bar's range covers both the stop and the target,
**the stop is taken**. Timeouts are reported separately and prominently.

**R** = `(exit − entry) / (entry − stop)`, mirrored for shorts; expectancy is the mean R. No
commission or slippage is modelled and fills are assumed exact. This flatters every number
below, the real and the null alike — which is why the comparison, not the level, is the result.

### 1.7 No look-ahead — checked before any result exists

`engine/harmonic.js` must satisfy, and `test/harmonic.test.js` checks:

- **truncation invariance** — scanning `bars[0..T]` gives the same patterns, PRZs, entries,
  stops, targets and closed-trade outcomes as scanning the full series, for everything with
  `confirmedAt ≤ T`;
- **mutation invariance** — changing any bar after `T` changes nothing at or before `T`;
- **no pattern before its last pivot is confirmed**, and **no entry on or before the
  confirmation bar**;
- **golden patterns** — a textbook Gartley built from the published ratios and planted in real
  bars is rediscovered by the scanner, its PRZ brackets the 0.786 completion, it is entered
  inside the zone and the stop sits beyond the far edge; a B point 6% off 0.618 is **not**
  detected while one 4% off is; the bearish mirror is found exactly as often as the bullish.

These passed before this protocol was committed (370 tests across the repository).

---

## 2. Universe — a snapshot, committed before any download

`data/harmonic/universe.json`, built by `scripts/harmonic-universe.js` from one TradingView
screener snapshot taken 2026-10-18 (market america, type stock, market cap ≥ $50B, by market
cap, top 300 of 534 matches). The rules are mechanical:

1. **Primary US common listings only** — NASDAQ or NYSE; tickers containing `/` and
   descriptions matching *depositary* / *preferred* / *mandatory convertible* dropped. This
   removes the preferred rows that carry their issuer's entire market cap.
2. **One listing per issuer** — every share class of one issuer reports the same
   `market_cap_basic` to the dollar, so the rounded cap is the issuer key; the class with the
   highest 10-day average volume is kept (GOOGL over GOOG, BRK.B over BRK.A).
3. **Group A, `top20`** — the twenty largest after 1 and 2.
4. **Group B, `sector`** — the largest listing in every sector group A does not cover, so the
   test is not mega-cap technology only. Eleven sectors are added this way.
5. **Group C, `named`** — `NASDAQ:RKLB`, `NYSE:BE`, `NYSE:HIMS`.
6. **Group D, `crypto`** — `BINANCE:BTCUSDT` (deepest intraday) and `BITSTAMP:BTCUSD` (deepest
   daily/weekly/monthly). Two feeds of one asset, declared as two rows, never spliced.
7. **Group E, `index`** — `AMEX:SPY`, `NASDAQ:QQQ`, `AMEX:IWM`, `AMEX:DIA`.

**40 symbols.** Whatever that file holds is the universe. Nothing is added or removed by hand
afterwards, and no symbol is ever dropped for having bad-looking results.

**Timeframes.** `4h`, `1D`, `1W`, `1M` are the four the user named and are the pre-registered
set. `1h` is fetched and reported beside them but sits **outside the §5 family**, because the
intraday feed is shallow and the user named four.

**Minimum history.** A `(symbol, timeframe)` cell enters §5 only with **≥ 200 bars** at the
cutoff. Cells below it are listed and excluded; they are not a result. Short listings (RKLB,
HIMS, BE, SPCX) will fail this on the slower timeframes — expected, and stated rather than
patched.

200 is set for a structural reason, before any pattern has been counted: a 1.5-ATR zigzag
confirms a pivot every several bars, so 200 bars is roughly the point below which a series
cannot produce a five-pivot structure at all. It is deliberately not 300: the monthly feed
holds 267 bars for GOOGL and 334 for NVDA, so a 300-bar floor would delete most of the monthly
row — the row the user explicitly asked about — for a reason that has nothing to do with
whether monthly patterns work.

**Data.** One page per `(symbol, timeframe)` from the TradingView connector, `format=columns`,
`count=5000`, ending at the last completed bar on or before **2026-10-17**; a monthly bar
inside the cutoff's own month is dropped as partial. Only OHLCV is used. Prices are
split-adjusted only, per the connector's notice.

---

## 3. What is computed per symbol and timeframe

Detection runs forward once, as a live scanner would: step the ATR and the zigzag; on each
confirmed pivot test every pattern against the last 3, 4 or 5 confirmed pivots; a valid pattern
fixes its PRZ, entry, stop and targets at that bar and never revises them; from the next bar it
fills, expires or is invalidated; a filled pattern is followed to stop, T1 or `H` bars.

**De-duplication for pooled statistics.** Several patterns can complete in the same place. For
every pooled number (H1, H2, H4) only **one trade per (symbol, timeframe, entry bar,
direction)** is kept — the one whose PRZ was touched first, ties broken by pattern name
alphabetically. Per-pattern tables keep every trade and say so.

**Overlapping trades** in one symbol may run concurrently. The correlation that creates is
handled by clustering the permutation at the symbol level (§5), not by thinning the sample.

---

## 4. The two null models

A hit rate without a benchmark is not evidence — `METHOD.md` is a record of effects that died
once the null was matched properly, twice including a p = 0.003. Two nulls, each matched to the
real rule in every respect but one.

**N1 — the random-ratio null. Is the harmonic ratio set special?**
The sharpest test available and the direct generalisation of `METHOD.md` §3's "random
multiplier in place of 45". For each of **M = 20 draws** (seeded `mulberry32`, **seed 12**),
every window `[min, max]` in §1.5 becomes `[min·f, max·f]`, with `f` drawn **log-uniformly from
`[0.70, 1/0.70]`** independently for each window. Everything else is held fixed: the same
pivots of the same bars, the same structural rules, the same PRZ overlap requirement, the same
entry, stop, targets and horizon. If the published numbers carry information, the real windows
must beat the sham ones. If they do not, the swing geometry is doing the work and the ratios
are decoration.

The multiplier is the right shape of null and a uniform redraw over the ratios' whole span is
not, for a reason worth recording: a bullish B point lies between X and A, so `AB/XA < 1` by
construction, and a sham B window centred anywhere above 1 can never match. A uniform redraw
would therefore produce sham families that are simply empty, and the comparison would quietly
reduce to whichever draws happened to land in a feasible region. Scaling preserves each
window's feasibility and its relative width, and changes only the numbers themselves — which
is exactly the claim under test. `f` ranges to ±43%, which is far enough that no sham ratio
coincides with the Fibonacci value it replaces. As far as §0.3 could establish, nobody has run
this test on harmonic patterns before.

**N2 — the matched random-entry null. Does the location matter?**
For every real trade, one sham trade in the same symbol and timeframe, the same direction, the
same stop distance and the same target distances *as fractions of the entry price*, the same
`H` and the same intrabar tie-break — entered at the close of a **uniformly random bar** of
that symbol's history (seed 12, one draw per real trade). This asks whether the PRZ is a
place, or whether the payoff geometry plus the market's drift is the whole story.

**Reported, not a hypothesis:** the same patterns traded in the **opposite direction**.
`METHOD.md` §6.2 found a win rate that mirrored exactly when direction flipped; this re-runs
that check so the same trap is visible if it is present.

---

## 5. Hypotheses — the test family is fixed here

### Family 1 — six tests, Holm-corrected together, on all 40 symbols

- **H1 — the method beats random entry.** Pooled over all patterns and the four primary
  timeframes, mean R of real trades exceeds mean R of their N2 matches.
- **H2 — the published ratios beat arbitrary ratios.** Pooled the same way, mean R of real trades exceeds
  mean R of the N1 sham families.
- **H4a–H4d — which timeframe.** The H1 comparison computed separately within `4h`, `1D`, `1W`
  and `1M`. These four are what answers "which timeframe is the most accurate" with a test
  instead of a ranking of noise.

*p-values:* permutation, 10,000 draws, **seed 12**, one-sided, **clustered by symbol** — each
draw flips the real/sham label for all trades of a randomly chosen subset of symbols, so one
symbol's lucky run cannot carry the result.

### Family 2 — search, then confirm on symbols never looked at

The user wants to know **which pattern is the one worth waiting for**. Picking the best of ~44
(pattern × timeframe) cells and quoting its win rate is how studies lie; this repository has
done the split-sample version twice (studies 4 and 5) and does it again.

- **Search half:** symbols at **even index** in `data/harmonic/universe.json`.
- **Confirm half:** symbols at **odd index**. Not looked at during the search.

On the search half every `(pattern × timeframe)` cell is ranked. The shortlist is frozen to
`reports/harmonic-shortlist.json`, **committed before the confirmation runs**, as the cells with

- **n ≥ 30** trades, **and**
- **T1-before-stop hit rate ≥ 50%**, **and**
- **mean R > 0**,

ranked by mean R, **top 8**. Fewer qualifiers means a shorter shortlist. **If none qualify,
that is the answer to "which pattern is the wow one", and no cell is promoted.**

- **H3 — confirmation.** Each shortlisted cell is re-tested on the confirm half against its N2
  matches. Holm across the shortlist.

### The verdict rule, for every hypothesis

**Confirmed** if, and only if: the effect is positive, **and** its Holm-adjusted p < 0.05,
**and** it is positive in **both halves of the period** (trades split at the median entry date
within the cell, each half computed independently). All three, or it is reported as **not
confirmed** — including a positive effect at p ≥ 0.05. A near miss is a miss.

---

## 6. Reported only — never a verdict, never Holm-corrected

- The full `(pattern × timeframe)` table on all 40 symbols: n, fill rate, T1 hit rate with its
  Wilson interval, mean R with its bootstrap interval, **timeout share**, median bars to
  outcome, and how far up T1–T4 price reached.
- The same table per symbol group (`top20`, `sector`, `named`, `crypto`, `index`) — where RKLB,
  BE, HIMS and BTC are answered individually.
- `1h` everywhere, outside the family.
- `K_PIVOT ∈ {1.0, 3.0}` instead of 1.5.
- **+AB=CD**: the PRZ with each pattern's AB=CD confluence required (§1.5).
- The *beyond X* stop instead of the PRZ-far stop.
- T2, T3 and T4 as the exit instead of T1; and the targets measured on the **CD** leg instead
  of AD.
- The entry window at **0.5** pattern lengths instead of 1.0.
- The confirmation entry: wait for one bar inside the PRZ that closes against the prior trend.
- The direction-flipped run of §4.
- Patterns unfilled or still open at the cutoff, frozen into
  `forward-log/harmonic-2026-10-18.json` with their PRZs, stops and targets, written before any
  of them can be known, so they can be scored for real later.

---

## 7. Known biases and limits, stated now

- **Survivorship.** The universe is today's largest companies, so their history is a winners'
  history. Both nulls run on exactly the same bars, which is why the comparison and not the raw
  hit rate is the result.
- **One pivot scale.** Consecutive pivots from a single `K_PIVOT` stream mean patterns built on
  smaller swings are invisible, and the big multi-scale scanners would find more than this
  does. The trade is deliberate: a multi-scale sweep is also a multiple-comparison machine.
- **Non-repainting costs entries.** A pattern is only known once C is confirmed, which is
  structurally late. One shipped implementation records exactly this: when it waited for D to
  confirm, "price had often already reached TP1 and turned back". Entering at the PRZ rather
  than after D is what keeps that cost bounded, and it is still a cost.
- **Feed depth.** One 5,000-bar page per cell: about 10 years of 4-hour stock bars, roughly 2
  years of 4-hour crypto, and the full daily/weekly/monthly history. Monthly cells will be
  small — AAPL has 551 monthly bars, newer listings far fewer — so the monthly row may be
  unable to separate anything. That is an outcome, not a failure.
- **Intraday bars are session bars.** Stock 4h and 1h cover the regular session only, so
  overnight gaps sit inside the pattern. Crypto trades continuously.
- **Fills are assumed.** A limit at `PRZ_near` is assumed to fill on a touch, stops and targets
  at their level. Real fills are worse, for the real and the sham trades alike.
- **The ratio table was not verified against the physical books** (§0.2).
- **Nothing here is a reconstruction of anyone's paid scanner.** It implements the published
  ratio sets named in §0.1 and nothing else.

---

## 8. What ships either way

`pine/harmonic.pine`, drawing the full XABCD skeleton, the PRZ, the entry, the stop and the
four targets on **any symbol and any timeframe**, is published regardless of the result,
because a chart tool is what was asked for. Its header text is pre-committed here:

- **If a cell is confirmed:** the header states which pattern and which timeframe survived
  confirmation on unseen symbols, its hit rate, its expectancy, its adjusted p-value and the
  sample behind it.
- **If nothing is confirmed:** the header states plainly that the patterns were tested on 40
  symbols across five timeframes and did **not** beat (whichever of: a random entry with the
  same geometry / the same structure with arbitrary ratios), and that the drawing must not be
  read as a forecast.
- **Either way** the header carries the §5 verdict verbatim, the number of trades behind it and
  the timeout share. A hit rate is never published without them.

---

## 9. Output

- `reports/harmonic.txt` — H1, H2, H3, H4, both halves, Holm, and every §6 table.
- `reports/harmonic.json` — machine-readable.
- `reports/harmonic-shortlist.json` — frozen between search and confirm.
- `pine/harmonic.pine` — the indicator.
- `forward-log/harmonic-2026-10-18.json` — patterns live at the cutoff, frozen.
- `progress/US-STUDY.md` updated in the same commits.
