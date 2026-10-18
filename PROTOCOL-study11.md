# Study 11 — HCP, a forward-projected model line: pre-registered protocol

**Written 2026-10-17, before any HCP value has been computed for any symbol, before
`engine/hcp.js` exists, and before any price series was downloaded for the universe in §2.**
Nothing here changes after results exist. A bug found later is fixed, marked post-hoc, and
shown with the numbers before and after.

> **بالعربي:** المستخدم أرسل صورة لتغريدة فيها خط أزرق على شارت QQQ، مكتوب تحتها أن
> "النموذج طويل المدى ما زال يتتبع السعر بدقة". الخط يمتد ٣٩ شمعة بعد آخر شمعة، أي أنه
> **إسقاط للمستقبل** وليس متوسطاً متحركاً. صاحب التغريدة لم ينشر طريقة حسابه أبداً.
> لذلك نبني نموذجاً مفتوحاً **باسم مختلف** (HCP)، ولا ندّعي أبداً أنه نفس نموذجه، ثم
> نختبره قبل أن نصدّقه: هل الإسقاط فعلاً أقرب للسعر الحقيقي من "لا تغيير"؟ وهل ترتيب
> الأسهم حسب الإسقاط يتنبأ بالعائد فعلاً؟ الجواب — أياً كان — يُكتب كما هو.

---

## 0. What prompted this, and what cannot be done

The user asked for "the same indicator" as a chart posted by `@BeardoTrader` on 2026-10-16,
applied to six indices and to every symbol in two of their watchlists.

**The vendor's method is not public.** No disclosure, no TradingView script under that handle,
no third-party reconstruction. A mirrored copy of an earlier post reads "Long term $QQQ model
*subscribers* and I have been tracking th…", which suggests a paid channel. As in study 6
(`PROTOCOL-study6.md` §0), the response is an **open look-alike under a different name**, and
**no claim is made, now or later, that HCP matches or approximates the vendor's product.**

### What was measured from the screenshot before this protocol was written

Disclosed because it is the only prior look at any data here, and because study 9's protocol
set the precedent of naming exactly what had already been seen.

The blue line was recovered from the image by pixel extraction and aligned to real
`NASDAQ:QQQ` daily bars (mean |log| error 0.15% against 108 matched bars, so the alignment is
established, not assumed). From that:

- last candle 2026-10-16; the line runs **39 trading bars past it**, to about 2026-12-10;
- over the 112 visible bars it sat a mean **1.77%** from the close (worst ±5.8%);
- its day-to-day moves are **not** price's (change correlation +0.04 at lag 0), so it is not a
  moving average; it is not a displaced copy of price (an FLD) and not stepped weekly data;
- on the same window a 20-day moving average also averaged 1.77%, and a 10-day average 1.50%;
- fitting trend + K sinusoids to the line reaches R² 0.88 at K=4 (QQQ itself: 0.70), which is
  more cyclical than price but short of the ~1.00 a pure harmonic composite would give. A
  151-bar window cannot resolve periods beyond ~75 bars, so **the family is undetermined.**

The only price data looked at for this was `NASDAQ:QQQ` daily open/high/low/close from
2026-04-20 to 2026-10-16, and moving averages of its closes. No other symbol, no other field,
and no HCP value has been computed on anything.

---

## 1. HCP — the model, fixed now and never tuned

All of §1 is frozen. If nothing passes in §4, **these numbers are not changed to make
something pass**; any later change is post-hoc and labelled so.

Let `y(t) = ln(close(t))` on daily bars, `t` counted in trading bars. At an evaluation bar `T`:

1. **Window.** `W = 1000` trading bars ending at `T` inclusive. A symbol with fewer than `W`
   bars at or before `T` is not evaluated at `T`.
2. **Trend.** Ordinary least squares of `y` on `t` over the window → `a + b·t`.
   Residual `r(t) = y(t) − (a + b·t)`. A linear fit is used deliberately: subtracting a
   centred moving average manufactures a cycle at the averaging length.
3. **Frequencies.** Trial periods `P` on a 200-point logarithmic grid from **20** bars to
   `W/3 = 333` bars. The upper bound keeps at least three full cycles inside the window; the
   lower bound keeps the model from chasing noise. For each `P`, the Goertzel power of `r` at
   `ω = 2π/P`. Take the highest-power `P`, refit (step 4), and repeat on the new residual.
4. **K = 3 harmonics.** After the three periods `P₁,P₂,P₃` are chosen, all coefficients are
   refit together by one least-squares solve of `y` on
   `[1, t, cos(2πt/P₁), sin(2πt/P₁), …, cos(2πt/P₃), sin(2πt/P₃)]` over the window.
   Goertzel is only a frequency finder; the amplitudes and phases come from this solve.
5. **Projection.** `HCP(T+h) = exp(` the fitted expression evaluated at `t = T+h` `)` for
   `h = 1 … H`. The fitted line is **not** re-anchored to `close(T)`; the fit's own level is
   kept, which is what the posted chart shows. (An anchored variant is reported in §5.)
6. **Horizon.** `H = 40` trading bars for every test in §4 — the posted chart's 39, rounded.

**No look-ahead:** the fit at `T` uses bars `≤ T` only. This is checked by the test described
in §6 before any result is produced.

---

## 2. Universe — a snapshot, committed before any download

`data/study11/universe.json`, taken 2026-10-17: every symbol in the user's TradingView
watchlists **"Under Radar Swings"** (203) and **"استثمار"** (16), plus `AMEX:IWM` from the six
indices they named, de-duplicated → **207 symbols**. Headers (`###…`) dropped. The six named
indices map to long-history symbols: `CAPITALCOM:US500→SP:SPX`, `BLACKBULL:NAS100→NASDAQ:NDX`,
`IG:DOW→DJ:DJI`; `AMEX:SPY`, `NASDAQ:QQQ`, `AMEX:IWM` are already their own.

Whatever that snapshot holds is the universe. Nothing is added or removed by hand afterwards.

**Minimum history:** a symbol enters the §4 tests only with **≥ 1250 daily bars** at the
cutoff — the 1000-bar window plus at least 250 bars to evaluate over. Symbols below it are
listed in the report and excluded; they are not a result. If **fewer than 60** symbols
qualify, H1 and H2 are still run and reported with the reduced n stated, and no parameter in
§1 or §2 is changed to recover symbols.

**Data:** daily bars from the TradingView connector, one page per symbol, ending at the last
completed session on or before **2026-10-16**. Some US symbols already have bars on disk from
studies 2–10 (`data/us/bars/`); those files are reused as they are. Only daily
open/high/low/close/volume is used; no fundamental field is read by this study.

**Master calendar:** the date array of `AMEX:SPY`.

---

## 3. Evaluation design

Evaluation dates are the master calendar's last completed session and every **40th** trading
day before it, as far back as each symbol's history allows. Spacing equals `H`, so the
realized windows of one symbol **never overlap** — overlapping windows would inflate
significance.

At each evaluation date `T`, a symbol takes part if it has `≥ W` bars at or before `T`, a bar
within 5 calendar days of `T`, and a bar `H` trading days after `T`.

For each participating `(symbol, T)`:

- `m(h) = ln HCP(T+h) − ln close(T)` for `h = 1…H` — the projection as a shape relative to the
  symbol's own last close.
- `gapModel = mean over h of |ln close(T+h) − ln HCP(T+h)|`
- `gapFlat  = mean over h of |ln close(T+h) − ln close(T)|` — the no-model line.
- `d = gapFlat − gapModel`. Positive means HCP tracked the realized path more closely than
  assuming no change.
- `projRet = ln HCP(T+H) − ln close(T)`, `realRet = ln close(T+H) − ln close(T)`.

---

## 4. Hypotheses — the test family is exactly two

**H1 — tracking.** The mean of `d` over all `(symbol, T)` pairs is above zero.
*p-value:* within each evaluation date, shuffle the projection shapes `m(·)` across symbols,
recompute `gapModel` against each symbol's own realized path, 10,000 draws, **seed 11**,
one-sided. This asks whether a symbol's own projection tracked it better than another
symbol's projection would have.

**H2 — direction.** The mean across evaluation dates of the Spearman rank correlation, taken
across symbols at that date, between `projRet` and `realRet`, is above zero.
*p-value:* within each evaluation date, shuffle `projRet` across symbols, 10,000 draws,
**seed 11**, one-sided. Ranking across symbols at one date removes the market's drift, so a
model that only says "stocks go up" scores zero here.

**Holm correction over the two.**

**Confirmed** if, and only if: the effect is positive, **and** its Holm-adjusted p < 0.05,
**and** the effect is positive in both halves of the evaluation period (dates split at the
median date, each half computed independently). All three, or it is reported as **not
confirmed** — including a positive effect with p ≥ 0.05. A near miss is a miss.

---

## 5. Reported only — never a verdict, never Holm-corrected

Anything here is outside the §4 family and no claim is made from it:

- `H = 20` and `H = 60` repeats of both statistics.
- The **anchored** variant (`HCP` shifted so the projection starts at `close(T)`).
- `gapModel` against two more benchmarks: a 10-day and a 20-day moving average of the close at
  `T`, each held flat over the horizon. The screenshot measurement in §0 found the vendor's
  line tied the 20-day and lost to the 10-day, so these are the benchmarks that matter.
- Breakdowns by group (index, ETF, US stock, non-US stock, crypto, FX/commodity, yield, OTC)
  and the distribution of evaluation dates per symbol.
- Each symbol's current HCP projection as of the cutoff.

---

## 6. Known biases and limits, stated now

- **Survivorship.** These are the symbols the user holds in a watchlist *today*. Both H1 and
  H2 compare a symbol against other symbols carrying the same bias, which is why the
  comparison, not the raw level, is the measure.
- **Short feed.** The connector caps a page at 5,000 daily bars, so even the indices start
  2006-11-30 here. Pre-2006 behaviour is outside this study.
- **In-window fitting is the point, not a flaw.** HCP is refit at every evaluation date, so
  there is no single "the HCP". The fit is always in-sample on its own 1000-bar window; what
  is tested is only the part after `T`, which the fit never saw.
- **No look-ahead test, run before results.** `engine/hcp.js` must satisfy: truncating a
  symbol's bars at `T` and recomputing gives bit-identical values at `T` to the full series,
  and mutating any bar after `T` changes nothing at or before `T`. If this fails, nothing is
  reported until it passes.
- **Crypto trades every day**, so its 1000 bars span less calendar time than a stock's. Stated,
  not corrected.
- **This study says nothing about the vendor's actual product**, which remains undisclosed.

---

## 7. What ships either way

A Pine script, `pine/hcp.pine`, that draws HCP and its forward projection on any symbol —
indices, ETFs, US and non-US stocks, crypto — is published regardless of the result, because
the user asked for a chart tool. Its header text is pre-committed here:

- **If H1 and H2 are both confirmed:** the header states the effect sizes, the adjusted
  p-values, the horizon they hold at, and that the line was tested on 207 symbols.
- **If either is not confirmed:** the header states plainly that HCP is a drawing of a fitted
  curve extended forward, that it was tested on 207 symbols and did **not** beat
  (whichever of: a no-change line / a random reordering of projections), and that it must not
  be read as a forecast. Same tone as `engine/projection.js`'s header.
- Either way the header says the vendor's model is undisclosed and HCP is not a copy of it.

The projections standing at the cutoff are frozen into `forward-log/hcp-2026-10-17.json`
before any of them can be known, so that in 40 trading days they can be scored for real
against what happened. That is the only honest test of a forward line, and it is the one the
posted chart cannot offer.

---

## 8. Output

- `reports/study11.txt` — H1, H2, both halves, Holm, the §5 tables.
- `reports/study11.json` — machine-readable, for anything later.
- `pine/hcp.pine` — the chart script.
- `forward-log/hcp-2026-10-17.json` — frozen current projections.
- `progress/US-STUDY.md` updated in the same commits.
