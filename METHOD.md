# The method of @zero_en3kas, reconstructed and measured

**ابو نايف #السوق_الأمريكي** — 23,201 followers, 7,735 posts, active since 2012.
Bio: *"مطور في التحليل الفني ومبتكر مدرسة الميزان الهندسي"* — developer in technical
analysis, innovator of the Geometric Balance school.

This document records what his publicly-taught strategies actually are, what can and
cannot be implemented from them, and how they score on real data.

---

## 1. What was read, and what was not

**Read:** 98 posts served by X's public embed endpoint (`syndication.twitter.com`),
spanning 2021-02 to 2025-10, plus 118 attached chart images, plus the profile record.
The teaching posts — where he states his rules in full — are in this set.

**Not read:** the other ~7,600 posts. Paginating his full timeline required rotating
guest tokens against X's internal GraphQL API, which is a circumvention of their access
controls, so it was not done. His Telegram channels, his paid course, and his Salla
store are also outside this.

**Not attempted:** his paid indicators. He sells "زيرو انعكاس" (Zero Reversal) and
"الميزان الهندسي" through a Salla store — 450 SAR for the bundle with the Telegram
channel — and on 2025-03-15 wrote *"المعادله من ابتكاري والبرمجة كذلك قمت بها بنفسي
لضمان عدم التسريب"*: the equation is my invention and I did the coding myself **to
guarantee it does not leak**. On 2025-03-27 he notes his course members voted 97%
against relaxing course conditions for the same reason. Reverse-engineering those to
avoid the price is a different act from implementing what he gave away, and it is not
what was done here.

**Explicitly licensed:** on 2025-07-09 he wrote *"جميع الاستراتيجيات بحسابي مسموح لأي
مبرمج ينزلها بمؤشر مجاني"* — every strategy on my account, any programmer may publish
as a free indicator. He has repeatedly asked others to port his free strategies (a
follower, @vf_e_, has published several). `pine/mizan-levels.pine` is built under that.

---

## 2. The strategies, as he states them

### 2.1 التحليل الرقمي — the numeric ladder *(fully specified, implemented)*

Posted 2023-12-24 and 2023-12-25 as a free two-part lesson. His words:

> بنشتغل على آخر موجة قمتها ٤٦٠٦ وقاعها ٤١٠٣ وبتكون المعادلة كالتالي ( مجموع القاع * ٤٥ )
> القاع ٤١٠٣ ٤+١+٠+٣ = ٨ — ٨ *٤٥ = ٣٦٠ — نضيف ٣٦٠ للقاع مرتين ونرسم الترندات

*We work on the last wave, peak 4606 and low 4103. The equation is (digit sum of the
low × 45). The low 4103: 4+1+0+3 = 8. 8 × 45 = 360. We add 360 to the low twice and
draw the trends.*

Part two adds: apply the same equation to stocks and currencies, dividing by 10 or 100
according to the instrument's price. He rates it 6–7/10 himself.

**His anchors are real.** SPX printed its low at **4103.78 on 2023-10-27** and its high
at **4607.07 on 2023-07-27**. He is reading genuine swing extremes, not inventing them.

Implemented in `engine/numeric.js`, golden-tested against his own arithmetic.

Two properties worth knowing, both tested in `test/geometry.test.js`:

- **A one-point disagreement about the low moves everything.** `digitSum(4103) = 8` →
  step 360. `digitSum(4104) = 9` → step 405. He quoted 4103 for a print of 4103.78; had
  he rounded up, every rung shifts by 45 points and more. The rule has no tolerance.
- **It depends on the decimal spelling, not the quantity.** The same market quoted with
  one more digit, or a stock either side of a split, produces a different ladder for no
  economic reason.

### 2.2 استراتيجية متوسط ٥٠ — the MA-at-peak level *(fully specified, implemented)*

Posted 2023-09-15, republished twice in 2025 after TradingView removed a follower's port:

> الشروط متوسط 50 خط عمودي على القمة وخط افقي مع تقاطع متوسط خمسين
> يفضل الاسعار تسوي قمم اعلى متوسط الخمسين

*Conditions: MA50, a vertical line on the peak, a horizontal line at the crossing with
the MA50. Preferably prices make peaks above the MA50.*

Drop a vertical at the swing peak, read the MA50's value there, carry it forward. This
is the cleanest thing he published — genuinely mechanical and genuinely scale-free.
Implemented in `engine/ma-anchor.js`.

He posts a 144-period variant on 5-minute option contract charts (2025-05-15), described
as "أداة مساعدة فقط" — a helper only.

### 2.3 الميزان الهندسي — the geometric school *(cannot be implemented)*

This is his flagship, the thing the paid indicator is built around. The rule is stated
plainly on a TASI chart of 2024-10-07, written across it in yellow:

> **51 % 2.125 = 24**

with two trendlines from the same origin labelled **51°** and **24°**. Measure the angle
of the rally leg; divide it by 2.125; draw a second line from the same origin at the
result. That second line is the support. The Bitcoin lesson of 2024-09-15 does the same
with legs labelled 43°, 54° and 60°, and the procedure is:

> من القمة نرسم الترند الهابط بنفس مقدار زاوية الترند الصاعد

*From the peak, draw the falling trend at the same angle as the rising trend.*

**This is not a function of the price data.** A chart angle is

```
θ = atan( Δprice × pixelsPerPrice  ÷  Δbars × pixelsPerBar )
```

— a property of the picture. Reconstructing his chart's pixel scale (≈7 px per bar,
≈0.314 px per index point, solved from the 51° he labelled) reproduces his figures: the
derived 24° line lands at ~11,697 forty bars out, and his posted blue line reads ~11,710
off the chart. **His own numbers are internally consistent.** The problem is only that
"his chart's scale" is his monitor, not a fact about TASI. Double the price axis — an
ordinary difference between two screens — and the same leg measures 68°, the derived
line 32°, and the support moves ~120 index points.

He knows this. It is exactly why the setup post (2024-09-15) is so insistent:

> ١/ ريست للشارت ٢/ اضغط على الإعدادات ٣/اضغط على المقاييس والخطوط ٤/ **قفل نسبة السعر**

*Reset the chart → settings → scales and lines → **lock price ratio***, and the TASI post
specifies *"الفريم اليومي بدون تصغير او تكبير للشارت"* — the daily frame with no zooming.
But locking the price ratio in TradingView freezes whatever is on screen at that moment;
it does not define a shared scale. Two people following his instructions at different
zoom levels get different angles from the same data, and therefore different levels.

**Consequence for the indicator:** Pine Script sees prices and bar indices, never pixels.
There is no faithful port. Any Pine version would have to invent a price-per-bar
convention and would then be drawing that invention. `pine/mizan-levels.pine` therefore
implements 2.1 and 2.2 and deliberately omits this, with the reason in the header.

---

## 3. Does any of it work?

Scored on **2,943 SPX daily sessions, 2015-01-02 to 2026-09-16** (`scripts/backtest.js`).

His claim is specific and falsifiable — *"زيرو انعكاس ومن أول لمسة"*, zero reversal from
the first touch — so it was made measurable as two quantities per touch: **penetration**
(how far past the level price went) and **excursion** (how far it then travelled back).

The only meaningful test is against a **matched null**: identical anchors, identical
scoring, identical thresholds, with only the level price randomised.

```
── zero reversal = penetration ≤ 0.5% and excursion ≥ 5% within 20 sessions
rule vs null                          lvls  touch   his    chance     z      p
MA50 at peak  vs same-side random     160   160    3.8%     3.1%    0.56   0.369
numeric ×45   vs same-side random     346   319    3.8%     4.1%   -0.30   0.615
numeric ×45   vs random multiplier    346   319    3.8%     4.3%   -0.40   0.631
```

**Neither rule beats chance at any of the four thresholds tested.** The sharpest test —
rebuilding his ladder with a random constant in place of 45, everything else held fixed —
scores the same or slightly better than 45 does. The multiplier carries no information.

### A false positive worth recording

The first version of this backtest displaced null levels uniformly *around* the anchor,
so half of them landed below it and were touched on the very next bar — a completely
different regime. Against that broken null the numeric rule "beat chance" at **p = 0.003**.
Fixing the null to keep levels on the same side made the effect vanish entirely. The null
model is the experiment; it is now tested in `test/null-models.test.js`.

---

## 4. His public record

He claims a great deal: *"دقة هذه الشارتات كانت ١٠٠٪١٠٠"* (these charts were 100%
accurate, 2024-09-08), *"نسبة نجاح التحليل الزمني 90%100"* (2025-02-25), *"لم يصل لربعه
أي محلل فني عربي أو أجنبي قبلي"* (no Arab or foreign technical analyst has reached a
quarter of my level, 2024-07-21).

Almost all of the supporting evidence is **charts marked up after the move**. A level
drawn on a reversal that has already printed demonstrates nothing — which he himself
argues, sharply, on 2024-01-28: *"مالم تثبت لنا بحساباتك العامة وعلى الشارت انك محلل كفو"*,
credibility is zero unless you prove it on your public accounts.

Taking him at his own standard, the 98 public posts contain **two unambiguous
forward-dated calls**:

| Date | Call | Outcome |
|---|---|---|
| 2025-02-25 | *"سباكس مبدئياً 5960 / 5930 — موجه صاعده طيبه اشتر الثلاثاء"* — buy SPX Tuesday at 5960/5930, good rising wave | **Wrong.** SPX closed 5955 that day, then fell to 5521 by 2025-03-13 — **−7.4%**, the start of the Feb–Apr 2025 correction. Called a good rising wave within days of a major top. |
| 2025-10-11 | *"الاثنين القادم … شمعة خضراء تسركم"* — next Monday, a green candle that will please you | **Right.** Monday 2025-10-13 closed **+1.56%**. |

One hit, one bad miss. That is a coin flip, not 90–100%.

---

## 5. What this repository already knew

`spx.html` in this repo backtests "the $2 SPX trade" over 655 sessions. That strategy is
his, posted 2024-09-06:

> في سباكس افضل السترايكات خارج التداول سعرها بين ٣ إلى ٤ … ١٠٠٠ دولار تقسمها على ٤ عقود
> في سترايك سعره ٢.٥

*In SPX the best out-of-the-money strikes are priced 3 to 4 … split $1,000 across 4
contracts at a strike priced 2.5.*

Measured result, already in this repo: **98.1% win rate, −0.12% per trade — negative**,
because the 1.9% of losses cost −99% each. The fix that made it positive (later entry,
larger target) was mechanical, and came from measurement rather than from geometry.

---

## 6. Three follow-up questions, measured

`scripts/answers.js`. Same 2,943 SPX daily sessions. Every rate carries a Wilson interval
and every expectancy a bootstrap interval, because the interesting-looking rows are the
small ones.

**Data limit, stated first:** this data plan serves `^GSPC` daily only. Intraday bars are
gated, and so is every other symbol tried (`^NDX`, `QQQ`). That bounds two of the three
answers, and where it does, it is said rather than papered over.

### 6.1 Which timeframe?

Numeric ladder, short the first touch, 2% stop / 3% target. Break-even is 40%.

| timeframe | bars | trades | win rate | 95% CI | expectancy | 95% CI |
|---|---|---|---|---|---|---|
| daily | 2,943 | 319 | 27.9% | [23%, 34%] | −0.53% | [−0.76, −0.29] |
| weekly | 612 | 152 | 34.2% | [27%, 42%] | −0.30% | [−0.66, +0.08] |
| monthly | 141 | 32 | 50.0% | [34%, 66%] | +0.50% | [−0.44, +1.28] |

Monthly looks best and means least. Its win interval spans the 40% break-even in both
directions and its expectancy interval spans zero; 16 wins against 16 losses at a 3:2
payoff is what a coin flip pays. Only the daily row's interval is clear of break-even,
and it is clear on the **wrong side**. Higher timeframes here buy a smaller sample, not
a better rule — and the 5-minute and 1-hour charts he actually posts on could not be
tested at all.

### 6.2 The win rate

It is not one number. On the identical levels it runs from **15% to 68%** purely by
moving the exits — and the two facts that matter are underneath it.

**First: every win rate has a bar to clear**, namely `stop / (stop + target)`.

| rule | stop/target | trades | win rate | needs | edge | expectancy |
|---|---|---|---|---|---|---|
| numeric ×45 (short) | 2/2 | 319 | 43.6% | 50.0% | −6.4pp | −0.24% |
| numeric ×45 (short) | 2/3 | 319 | 27.9% | 40.0% | −12.1pp | −0.53% |
| numeric ×45 (short) | 5/5 | 319 | **68.4%** | 50.0% | +18.4pp | **−0.58%** |
| MA50 at peak (long) | 2/3 | 139 | 36.3% | 40.0% | −3.7pp | −0.06% |
| MA50 at peak (long) | 5/5 | 139 | 44.6% | 50.0% | −5.4pp | +0.20% |

The 5/5 row is the trap in miniature: a **68.4% win rate that loses money**. Of its 319
trades, **243 timed out** — the headline rate describes 24% of the positions actually
opened, and the rest sat for 20 sessions and were marked to the close. This is the same
arithmetic the `spx.html` study on this site already found in his $2 SPX trade.

**Second: flip the direction and the win rate flips exactly.** On the same levels,
122 wins / 158 losses short is 158 wins / 122 losses long — a perfect mirror, and the
expectancies sum to exactly zero. Over this sample no bar was ever wide enough to trigger
both exits, so the whole result is decided by which way you face relative to the market's
drift.

To be precise about what that does and does not prove: it shows a win rate quoted without
its direction and payoff is not information. It does **not** by itself show his levels are
uninformative — any entry price would mirror this way. The evidence for no edge is the
null-model comparison, below and in §3.

**The MA50 rows were the only ones not clearly negative, so they got a second null.**

| MA50 test | stop/target | his expectancy | vs displaced level | vs random anchor bar |
|---|---|---|---|---|
| MA50 at peak | 2/5 | +0.14% | −0.31%, p = 0.011 | +0.15%, **p = 0.498** |
| MA50 at peak | 5/5 | +0.20% | −0.21%, p = 0.022 | +0.49%, **p = 0.780** |

Against a randomly displaced level it looks significant. Against levels the same distance
below a **random bar instead of a swing peak**, it vanishes completely. So the apparent
edge is "buying a dip of about this depth in a rising market", not "the MA50 at the peak".
The peak contributes nothing. This is the second time in this study a positive result died
to a harder null — the first was the p = 0.003 in §3.

### 6.3 Stocks or NDX?

Not directly answerable: `^NDX` and `QQQ` are gated on this plan. What *can* be measured
is the property that decides it. His ladder is built from the **digit sum of the price**,
so re-quoting the same market rewrites every level. Indices do not split. Stocks do.

Identical SPX series in every row, only the quote units differ:

| same market, re-quoted | sample low | digit sum | raw win% | with his ÷10 rule |
|---|---|---|---|---|
| index, unchanged | 1988.12 | 26 | 27.9% (319) | 27.9% (319), exp −0.53% |
| after a 2:1 split | 994.06 | 22 | 28.1% (294) | 27.8% (294), exp −0.54% |
| after a 4:1 split | 497.03 | 20 | 31.5% (204) | 18.3% (260), exp −0.90% |
| after a 10:1 split | 198.81 | 18 | 40.6% (74) | 25.1% (326), exp −0.61% |

His ÷10/÷100 rule does most of its job — it keeps the ladder on the same scale as the
price, so the trade count survives. What it cannot fix is the digit sum itself: **Σ moves
26 → 22 → 20 → 18 for a market that never changed.** Every expectancy stays negative.

So the answer is **index rather than stocks**, for a structural reason rather than a
performance one: on an index that never splits, this instability never fires. On a stock
it fires on the split date, and every level moves for no economic reason. NVDA's 10:1 in
2024 and TSLA's 3:1 in 2022 would each have rewritten the whole ladder overnight.

## 7. Summary

| | |
|---|---|
| Can his free strategies be implemented? | **Two of them, yes** — the numeric ladder and the MA-at-peak level. Both are in `engine/`, golden-tested against his own published numbers. |
| Can the geometric school be implemented? | **No.** It is defined in on-screen degrees, which are not a property of the price data. Not a limitation of Pine or of effort. |
| Can results be made to match his exactly? | **For his arithmetic, yes** — 4103 → 8 → 360 → 4463/4823 reproduces exactly. **For his charts, no** — the wave, the peak and the chart scale are all chosen by eye. |
| Do the implementable rules have an edge? | **No.** Indistinguishable from randomly placed levels across 2,943 sessions and four thresholds. 45 is not special, and the MA50 result dies against a random-anchor null. |
| Best timeframe? | The data cannot separate daily, weekly and monthly — monthly only looks better because it has 32 trades. Intraday was not testable. |
| Win rate? | Anywhere from 15% to 68% depending only on the exits. Every setting sits below its own break-even, and the 68% case loses money. |
| Stocks or index? | Index. His ladder reads the digit sum of the price, so a stock split rewrites every level overnight. |
| Should you buy the paid indicator? | Not a question this can answer — it was not examined. But its public evidence is retrospective markup, and the two forward calls in the free record are 1-for-2. |

Research and analysis only. Not financial advice.
