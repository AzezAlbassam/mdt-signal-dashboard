// The geometry of "مدرسة الميزان الهندسي" — and why it cannot be ported to Pine.
//
// His geometric rules are stated in DEGREES: draw the rally line, read its angle, then
// derive a second line from it (same angle mirrored from the peak, or the angle divided
// by a constant). The TASI chart of 2024-10-07 states it outright: "51 % 2.125 = 24".
//
// An angle on a price chart is not a property of the price series. It is
//
//     θ = atan( Δprice × pixelsPerPrice  ÷  Δbars × pixelsPerBar )
//
// so it depends on the chart's pixel aspect ratio — zoom, window size, visible price
// range, monitor. The price data alone does not determine it. That is why his setup
// instructions are so insistent about locking the price ratio and never zooming: he is
// trying to pin the pixel scale down. But locking the ratio freezes whatever is on
// screen at that moment; it does not define a shared, universal scale.
//
// This module exists to make that concrete and testable, not to reproduce the rule.
// Pine Script has no access to pixel geometry — an indicator sees prices and bar
// indices — so there is no faithful port of an angle-based rule. Any Pine version has
// to invent a price-per-bar convention, and the levels it draws are then a consequence
// of that invented convention rather than of his method.

const toRadians = (deg) => (deg * Math.PI) / 180
const toDegrees = (rad) => (rad * 180) / Math.PI

/**
 * The angle a trendline appears at on screen, in degrees.
 *
 * `scale` is the chart's pixel geometry: how many pixels one bar occupies horizontally,
 * and how many pixels one unit of price occupies vertically. Only their ratio matters —
 * the same chart on a bigger monitor has the same angles.
 */
export function chartAngle({ fromBar, fromPrice, toBar, toPrice }, { pxPerBar, pxPerPrice }) {
  const runPx = (toBar - fromBar) * pxPerBar
  const risePx = (toPrice - fromPrice) * pxPerPrice
  return toDegrees(Math.atan2(risePx, runPx))
}

/**
 * Where a line drawn from the leg's origin at `angleDeg` sits, `barsForward` bars later.
 * The inverse of chartAngle, and equally scale-dependent — which is the point.
 */
export function angleToPrice({ fromBar, fromPrice }, angleDeg, { pxPerBar, pxPerPrice }, barsForward) {
  const runPx = barsForward * pxPerBar
  const risePx = runPx * Math.tan(toRadians(angleDeg))
  return fromPrice + risePx / pxPerPrice
}

/**
 * His TASI chart of 2024-10-07, reconstructed.
 *
 * The leg is the August-2024 low to the early-October peak, about 40 trading sessions.
 * `postedScale` is the pixel geometry solved backwards from the 51° he labelled — i.e.
 * the scale his own screen must have been at. Read off his chart, the price axis spans
 * 11,200–12,600 over roughly 410 px and the months are ~150 px apart at ~21.5 sessions
 * each, which gives ~0.29 px per index point and ~7 px per bar. Solving for exactly 51°
 * gives 0.314 — the two agree to within pixel-reading error, so the reconstruction is
 * sound and his own numbers are internally consistent.
 *
 * At this scale his derived 24° line sits at ~11,697 forty bars out; his posted blue
 * line reads ~11,710 off the chart. It checks out. The trouble is only that "this
 * scale" is his monitor, not a fact about TASI.
 */
export const TASI_OCT_2024 = Object.freeze({
  leg: Object.freeze({ fromBar: 0, fromPrice: 11300, toBar: 40, toPrice: 12400 }),
  postedScale: Object.freeze({ pxPerBar: 7.0, pxPerPrice: 0.31434 }),
  postedAngle: 51,
  divisor: 2.125,
  postedDerivedAngle: 24,
})
