# Study 15 — addendum 1: the forward check on the vendor's next chart (pre-registered)

**Written 2026-10-23, after the 2026-10-12 result (`reports/study15.txt`, fa39b17) and before any
other chart by @t38p_flow has been seen, and before the 2026-10-23 session has traded.**
`PROTOCOL-study15.md` is unchanged and still governs everything not restated here.

> **بالعربي:** نتيجة شارت ١٢ أكتوبر: الخط الأصفر ليس VWAP عادياً، بل يطابق متوسطاً بأوزان
> متساوية من افتتاح ٩:٣٠. ويوم ٢٢ أكتوبر رأينا أن حجم عقود أوبشن نفس اليوم موزّع على الجلسة
> بالتساوي تقريباً، فلو كان "Flow VWAP" هو السعر مرجّحاً بتدفق الأوبشن لبدا مثل خط الأوزان
> المتساوية. هذه أفكار جاءت **بعد** رؤية النتيجة، فلا تُعتبر مثبتة. نثبّتها هنا قبل أي شارت
> جديد، ونختبرها على أول شارت قادم له بنفس طريقة القياس ونفس حدود المطابقة.

---

## 1. What the 10-12 result left open

- The line matched the **equal-weight** mean of hlc3 from 09:30 (V0), not a volume-weighted one.
- **Post-hoc** (labelled so in the report): the zone fits roughly ±1σ / ±2σ around V0; and on
  2026-10-22 same-day option volume is spread over the session almost evenly, so a price weighted
  by options flow sits close to V0 (median 0.66 point). Both were chosen after seeing the result,
  on one chart and one day. This addendum turns them into tests on a chart not yet seen.

## 2. Which chart

The **first** chart by @t38p_flow that the user brings after this addendum is committed, of an
SPX session `D` whose 0DTE `SPXW` chain TradingView still serves when the chart arrives (the same
session, or the next one). If a chart of an older session arrives, it is measured and described
(line vs V0 and V1 can still be checked: they need only `SP:SPX` bars) but H6 and §4 are skipped.

## 3. Hypotheses (same labels as the protocol: MATCH / CLOSE / NO MATCH, same thresholds)

Measured with `PROTOCOL-study15.md` §1 unchanged; anything specific to the new image (its label
values, axis column, last-price line rows, bar size) is read off it and committed with the
measurement, before any candidate is computed for it.

- **H4 — replication.** V0 (equal-weight hlc3 from 09:30, 1-minute `SP:SPX`) is MATCH on the new
  chart. Confirmed if MATCH; V1 is reported beside it.
- **H5 — the zone.** Its four edges are V0 ± 1σ / ± 2σ with σ the equal-weight deviation of hlc3
  around V0. Confirmed if all four edges are MATCH; best-fit k reported.
- **H6 — "flow" means options flow.** F1 = `SP:SPX` hlc3 weighted by the number of 0DTE `SPXW`
  contracts traded in that minute, calls and puts, every strike of §4's range (50 points beyond
  the session low and high), regular session. Confirmed if F1 is MATCH **and** its median |d| is
  smaller than V0's by at least 0.05 point. Reported beside it, not tested: F2, the same weighted
  by premium (contracts × price × 100).
- **OGL** — §4 of the protocol, unchanged: top-1, top-3 overlap, colour agreement. A check on one
  session, reported as such.

## 4. Data for 2026-10-23

The 2026-10-23 0DTE chain (§4 range, 1-minute) and `SP:SPX` 1-minute bars are fetched after that
session closes and committed before any chart of that session is looked at, so a chart of
2026-10-23 can be checked even if it arrives after the chain stops being served. The OGL levels at
10:30, 12:00, 14:00 and 15:30 ET and F1/F2/V0/V1 at every 3 minutes are written to
`forward-log/study15-2026-10-23.json` in the same commit.
