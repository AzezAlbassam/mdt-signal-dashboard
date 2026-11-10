# Study 15 — addendum 2: the late-anchored VWAP joins the forward check (pre-registered)

**Written 2026-10-23, after addendum 1 and after an independent review of the 10-12 result, before
any other chart by @t38p_flow has been seen and before the 2026-10-23 session has traded.**
`PROTOCOL-study15.md` and addendum 1 are unchanged; this adds hypotheses, it removes none.

> **بالعربي:** المراجعة المستقلة وجدت تفسيراً أقوى من "الأوزان المتساوية": VWAP عادي تماماً
> (بحجم SPX) مع نطاقات انحراف معياري عادية ±١ و±٢، لكنه يبدأ من ٩:٣٥ بدل ٩:٣٠ — أي بدون
> صفقات مزاد الافتتاح في الدقائق الأولى. هذا طابق الخط والحواف الأربع معاً على شارت ١٢ أكتوبر.
> لكنه جاء من بحث على نفس الشارت، فلا يُعتبر مثبتاً؛ نضيفه هنا كفرضية تُختبر على الشارت القادم.

## 1. Why

`reports/study15.txt` P3 (post-hoc, from the independent skeptic review, reproduced by the run
script): the 09:30 minute of `SP:SPX` carries the constituents' opening-auction volume (68.5M,
9.8× the 09:31–09:59 median). A standard session VWAP of hlc3 with `SP:SPX` volume, **anchored
at 09:33–09:35** instead of 09:30, is MATCH on the line and on **all four** band edges with its own
volume-weighted σ (09:35: line median 0.05; best-fit k +2.01, +0.99, −1.01, −2.03). The
equal-weight line V0 matches the line but never more than one edge. The anchor was found by a
31-anchor search on this one chart, so nothing is confirmed by it.

## 2. Added hypotheses (the chart of addendum 1 §2; same measurement, labels and thresholds)

- **H7 — the late-anchored VWAP.** A07 = session VWAP of 1-minute hlc3 weighted by `SP:SPX`
  volume, **anchored at 09:35 ET** (the 09:30–09:34 minutes are left out), with bands A07 ± 1σ / ± 2σ,
  σ its own volume-weighted deviation (`PROTOCOL-study15.md` §2 rule). Confirmed if the line **and
  all four edges** are MATCH.
- **H8 — late anchor beats equal weights.** A07's line median |d| is smaller than V0's.
- Reported beside them, not tested: the same at 09:33 (the first 3-minute bar left out) and an
  anchor scan 09:30–09:40, as in P3.

Addendum 1's H4–H6 stay as written. If both H4 and H7 are confirmed, the bands decide between them
(H5 vs H7's edges); both are reported either way.

## 3. Frozen with the 10-23 data

`scripts/study15-forward.js` also writes A07 and A03 (09:33) with their σ at every 3 minutes.
