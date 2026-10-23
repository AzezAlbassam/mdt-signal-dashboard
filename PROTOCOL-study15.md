# Study 15 — "Flow VWAP x Gamma" (@t38p_flow): open look-alike and match test, pre-registered

**Written 2026-10-23, before any VWAP, band or gamma value has been computed for any session,
before `engine/vwap.js` / `engine/gamma.js` exist, and before the chart's line, bands or bubbles
have been measured.** Nothing here changes after results exist. A bug found later is fixed,
marked post-hoc, and shown with the numbers before and after.

> **بالعربي:** المستخدم أرسل تغريدتين لحساب ‎@t38p_flow‏: شارت SPX عليه خط "Flow VWAP"
> وفقاعات "Gamma" وثلاث صفقات رابحة لـ"البوت"، ثم تغريدة "هذه معادلة Flow VWAP" وفيها معادلة
> فيزياء كمّية (مؤثرات، ħ، دوال بيسل) لا علاقة لها بالأسعار. السؤال: هل يمزح؟ وهل نستطيع
> بناء نفس المؤشر والتأكد هل يطابق مستوياته في ذلك اليوم؟ نبني نسخة مفتوحة **باسم مختلف**،
> ونحدد قبل أي حساب كيف نقيس الشارت من الصورة، وما هي المرشحات، وما الذي يُعتبر "مطابقة".
> جزء الغاما لا يمكن اختباره ليوم ١٢ أكتوبر لأن عقود ذلك اليوم انتهت ولم تعد تُخدَم؛ لذلك
> نجمّد طريقة حسابه الآن ونقارنها لاحقاً بأي شارت جديد له، والنتيجة تُكتب كما هي.

---

## 0. What prompted this, and what can and cannot be done

The user sent two posts by `@t38p_flow` (display name Tirth):

1. 2026-10-12, "Flow VWAP x Gamma too easy for the bot." — a chart titled `SPXW 7801.75 −9.34
   (−0.12%)`, `RTH`, with a yellow line, a shaded zone with dotted edges, rows of yellow and purple
   bubbles at strike prices, three closed trades (+$110, +$60, +$70; "Today · 3 closed · +$240").
   The chart carries a `skylit.ai` watermark and an account id.
2. 2026-10-23, "A lot of people been asking how Flow VWAP works. Here is the formula:" with an
   image of a two-line quantum-mechanics operator identity (B̂₁B̂₀|ψ(k)⟩, p̂_ρ, ħ, M, J₀, J₁).

**The vendor's method is not public.** As in studies 6 and 11, the response is an **open
look-alike under a different name — `OFV` (open flow VWAP) and `OGL` (open gamma levels)** — and
no claim is made that they are the vendor's product beyond what §3–§4 measure.

### Facts established before this protocol (data looked at so far)

- **Date.** `−9.34` from `7801.75` puts the reference close at **7811.09**. `SP:SPX` 1-minute
  bars on 2026-10-09 close the 15:59 ET bar at exactly **7811.09** (TradingView's daily close,
  7811.54, includes post-16:00 prints). The chart is the 2026-10-12 session and its price feed
  agrees with `SP:SPX` to the cent. The only `SP:SPX` values looked at: the 10-09 15:57–16:09
  bars, the 10-12 first/last bar, and the 10-12 bars whose close or low is within 0.3 of 7801.75
  (12:59, 13:34–13:37, 14:07–14:08, 14:43–14:48, 15:33) — to locate the screenshot time.
- **Data on disk** (`data/study15/`): `SP:SPX` and `AMEX:SPY` 1-minute bars for 2026-10-08, 09,
  12, 13 and `SP:SPX` for 2026-10-19 to 22. `SP:SPX` carries a volume series (aggregate
  constituent shares). `CME_MINI:ES1!` 1-minute history starts 2026-10-18, so futures volume is
  not available for 10-12.
- **Options.** TradingView serves `OPRA:SPXW<yymmdd><C|P><strike>.0` for live contracts and for
  the contract that expired the previous session only: `SPXW261022…` is served, `261021`,
  `261016`, `261013` and `261012` answer "invalid symbol". **The 0DTE contracts of 2026-10-12
  cannot be retrieved, so the gamma bubbles of that chart cannot be reconstructed.** The
  2026-10-22 0DTE chain (strikes 7590–7750, calls and puts, 1-minute) was downloaded on
  2026-10-23 before this protocol was committed, because it disappears from the feed within a
  day; no gamma or IV value was computed from it before the commit.
- **The image** was looked at by eye and its watermark read; nothing was measured from it.
  Visible structure: one solid yellow line; a shaded zone with four dotted edges (two above the
  line, two below; brighter fill between the inner two); bubble rows near 7820, 7815, 7810,
  7805 (yellow) and 7800 (purple); price axis labels 7796–7826 every 2 points; no time labels.

---

## 1. Measurement of the chart (fixed now)

Source: `data/study15/chart-2026-10-12.png` (the user's zoomed screenshot, 2360×1640, unchanged).
Script: `scripts/study15-measure.py` → `data/study15/chart-measure.json`.

1. **Price axis.** The vertical centre of each axis label 7796…7826 (bounding rows of its text
   pixels in the axis column); least-squares line `y = a + b·price`. Its residual is reported; if
   any label is off the line by more than 3 px the measurement stops.
2. **Candles.** Candle pixels are the white and the blue candle colours. Each candle is a run of
   candle-coloured columns; its high and low are the top-most and bottom-most candle pixel in
   its centre column, its body the thick part. Candles whose column is touched by a trade
   triangle, a "+$" label, a red circle, the current-price label, or a dot marker are kept for
   the time axis but flagged; the last (still forming) candle is never used for alignment.
3. **Time axis.** Candles are equally spaced. For bar size `m ∈ {1, 2, 3, 5, 10, 15}` minutes
   (bars anchored at 09:30 ET, built from `SP:SPX` 1-minute bars) and every start bar `s`,
   compute the mean absolute error of the unflagged candles' highs and lows against the bars
   `s, s+1, …`. The pair with the smallest error is the alignment; the runner-up is reported.
   **Gate: if the best error exceeds 0.35 points, the study stops here** ("chart cannot be
   aligned") and no line is compared.
4. **Yellow line.** In each pixel column, runs of line-yellow pixels at most 10 px tall are line
   candidates (bubbles are taller, the fills are darker); the run nearest the previous column's
   line is taken. Columns where the line is hidden (under a candle, a bubble or a label) have no
   value. The line value of candle `i` is the median line y over the columns within ±2 px of the
   candle's centre, converted to price.
5. **Band edges.** The four dotted edges (top to bottom: E1 outer upper, E2 inner upper, E3 inner
   lower, E4 outer lower) are measured as the centres of their dots; each dot is assigned to the
   nearest candle by x. An edge's value at a candle is the median of its dots within ±½ candle
   spacing.
6. **Bubble rows and trades (descriptive).** The y-centre of each bubble row (→ strike) and its
   colour; for each row the bubble height at the left edge, at the screenshot time and the
   largest. Each trade triangle's tip (→ price) and candle (→ time).

The JSON records every number above plus the flagged columns, so a reader can redo the comparison.

---

## 2. Candidates (fixed now; the list is not extended after results)

All on the aligned session, recomputed from 09:30 ET, using `SP:SPX` 1-minute bars unless noted.
`tp = (high + low + close) / 3`. Each candidate's value at chart candle `i` is its value after
the last 1-minute bar inside that candle.

| id | line | weights |
|----|------|---------|
| V1 | session VWAP of `tp` (TradingView's built-in default) — **primary** | `SP:SPX` volume |
| V2 | session VWAP of `close` | `SP:SPX` volume |
| V3 | session VWAP of `tp` | `AMEX:SPY` volume of the same minute |
| V4 | session VWAP of `tp` built on the chart's own bar size (resampled bars) | `SP:SPX` volume |
| V0 | **control**: session average of `tp`, equal weights (no volume at all) | none |

"Flow" probably means options-flow weighting. Options flow for 10-12 is not retrievable (§0), so
an options-weighted line is **not** a candidate; if V1–V4 all fail, that is one possible reason
and is said so.

Bands: `σ = sqrt(Σ v·(tp − VWAP)² / Σ v)` (volume-weighted deviation of `tp` around the VWAP,
TradingView's "Standard Deviation" band mode), on the H1-best candidate `V*` (smallest median
|d| among V1–V4). Candidate edges: E1 = V* + 2σ, E2 = V* + 1σ, E3 = V* − 1σ, E4 = V* − 2σ.

---

## 3. Hypotheses and verdicts

For a candidate and a measured series, `d_i = measured_i − candidate_i` over every candle with a
measured value, except the last (still forming) candle, whose value depends on the second the
screenshot was taken. Labels:

- **MATCH**: median |d| ≤ 0.25 point **and** 90th percentile |d| ≤ 0.60 point;
- **CLOSE**: median |d| ≤ 0.75 point (and not MATCH);
- **NO MATCH**: otherwise.

(0.25 point is about 12 px on this image; the line is ~5 px thick.)

- **H1 — the yellow line is a standard session VWAP.** Confirmed if **V1 is MATCH and V0 is not
  MATCH** (if the equal-weight line matches as well, the volume weighting is not identified and
  H1 is reported as not confirmed). V2–V4 are reported beside it, not tested.
- **H2 — the shaded zone is VWAP ± 1σ / ± 2σ.** Confirmed if **all four edges are MATCH**.
  Reported beside it, descriptive only: per-edge label, and per edge the multiple `k` of σ
  that fits it best (least squares), which shows whether the zone is symmetric.
- **H3 — the gamma bubbles of 10-12.** **Not testable** (§0). Stated now, so it cannot be
  quietly dropped later. The bubble rows are measured and described only.
- **Trades (descriptive).** Price and time of each triangle, the `SP:SPX` bar there, and whether
  each short entry is within 1 point of a bubble-row strike. Three trades are not evidence of
  an edge and no claim is made from them.

---

## 4. OGL — the open gamma levels, frozen now for forward checks

Because 10-12 cannot be tested, OGL is fixed here and compared later, against any chart of the
vendor's for a session whose 0DTE chain is still retrievable when the chart arrives.

- **Inputs.** That session's 0DTE `OPRA:SPXW` contracts, calls and puts, every 5-point strike
  from 50 points below the session low to 50 points above the session high, 1-minute bars
  (close, volume); `SP:SPX` 1-minute close.
- **Per contract and minute** with a traded bar: implied volatility by Black-Scholes inversion of
  the bar close with spot = `SP:SPX` close of that minute, `r = q = 0`, time to expiry = minutes
  from the bar's end to 16:00 ET ÷ (365 × 1440), floored at 1 minute; IV is carried forward
  between trades; a price below intrinsic + 0.01 or an IV outside 1%–300% gives no IV.
- **Exposure of strike K at minute t:** `E_K(t) = 100 · S_t² · 0.01 · [Γ_C · CV_C − Γ_P · CV_P]`,
  with Γ at the current spot, time and the contract's last IV, and `CV` the cumulative session
  volume through t. Calls positive, puts negative (the usual dealer-position convention).
  Volume, not open interest, because open interest is not served and is a day old for 0DTE.
- **Levels at t:** strikes ranked by |E_K(t)|; colour yellow if `E > 0`, purple if `E < 0`.
- **Comparison with a vendor chart** (measured as in §1.6 at its screenshot time): (a) is his
  biggest bubble our top-1 strike; (b) overlap of his three biggest with our top-3; (c) colour
  agreement on every strike he shows. One session is a check, not a test; reported as such.
  With ~6–7 strikes on screen, chance alone gets (a) right about one time in six or seven.
- **2026-10-22** (downloaded, §0): no vendor chart exists for it here; OGL is computed and shown
  as an example only.

---

## 5. Output

- `reports/study15.txt` — alignment, H1, H2, the bubble and trade descriptions, OGL for 10-22.
- `engine/vwap.js`, `engine/gamma.js` with tests; `pine/` script only after the run, its header
  stating the verdicts.
- Progress logged in `progress/US-STUDY.md`.
