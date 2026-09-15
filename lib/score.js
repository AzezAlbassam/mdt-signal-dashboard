/**
 * Scoring sessions against the bands that were published before them.
 *
 * Two separate questions live here and must never be added together.
 * Reproduction fidelity asks whether our arithmetic matches the chart.
 * Calibration asks whether the bands contain the market at the rate their own
 * maths implies. A band can be reproduced perfectly and be badly calibrated.
 *
 * Every function refuses to score a session that is not strictly after the
 * close the band hangs on, so a level can never be graded against the data
 * that produced it.
 */

const assertForward = (anchorDate, session) => {
  if (!session?.date) throw new TypeError('a session needs a date')
  if (!(session.date > anchorDate)) {
    throw new Error(
      `look-ahead: a band anchored on ${anchorDate} can only be scored against a later session, got ${session.date}`)
  }
}

/** Where the close landed, in half widths, signed. */
export function zScore ({ close, center, halfWidth }) {
  if (!(halfWidth > 0)) return null
  return (close - center) / halfWidth
}

/**
 * One session against one band.
 *
 *  untouched  price never reached the level
 *  tagged     price reached it and the close came back inside
 *  broken     the close finished beyond it
 *
 * Touching a level to the cent counts as reaching it, and also still counts as
 * contained: the edge belongs to the band.
 */
export function scoreBand (band, session) {
  assertForward(band.anchorDate, session)
  const { high, low, close } = session
  const side = (reached, beyond) => (beyond ? 'broken' : reached ? 'tagged' : 'untouched')
  return {
    session: session.date,
    anchorDate: band.anchorDate,
    upper: side(high >= band.upper, close > band.upper),
    lower: side(low <= band.lower, close < band.lower),
    contained: low >= band.lower && high <= band.upper,
    z: zScore({ close, center: band.center, halfWidth: band.halfWidth }),
    excursionHigh: zScore({ close: high, center: band.center, halfWidth: band.halfWidth }),
    excursionLow: zScore({ close: low, center: band.center, halfWidth: band.halfWidth }),
  }
}

/**
 * One session against a zone, which is an interval rather than a level.
 *
 *  untouched  price never entered
 *  entered    price traded into the zone and stopped inside it
 *  crossed    price traded all the way through the far edge
 *
 * closedBeyond is reported separately, because entering a zone and closing
 * through it are different events for anyone resting an order in it.
 */
export function scoreZone (zone, session) {
  assertForward(zone.anchorDate, session)
  const { high, low, close } = session
  const upper = zone.side === 'upper'
  const near = upper ? zone.low : zone.high
  const far = upper ? zone.high : zone.low
  const extreme = upper ? high : low
  const reached = upper ? extreme >= near : extreme <= near
  const through = upper ? extreme > far : extreme < far
  return {
    session: session.date,
    anchorDate: zone.anchorDate,
    side: zone.side,
    outcome: through ? 'crossed' : reached ? 'entered' : 'untouched',
    closedBeyond: upper ? close > far : close < far,
    width: Math.round((zone.high - zone.low) * 100) / 100,
  }
}

const Z95 = 1.959963984540054

/**
 * The Wilson score interval. Reported instead of the naive one because on the
 * sample sizes this page will have for months, the naive interval is wrong in
 * the direction that flatters the result.
 */
export function wilson (k, n, z = Z95) {
  if (!(n > 0)) return { point: null, low: 0, high: 1, n: 0, k: 0 }
  const p = k / n
  const d = 1 + (z * z) / n
  const center = (p + (z * z) / (2 * n)) / d
  const half = (z / d) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return { point: p, low: Math.max(0, center - half), high: Math.min(1, center + half), n, k }
}

/** Below this the interval is shown and the point estimate is not. */
export const MIN_REPORTABLE_N = 20

/**
 * Count a predicate over rows and decide whether the sample can carry a rate.
 * The interval is always returned; the point estimate is withheld until the
 * sample is large enough for it to mean anything.
 */
export function summarise (rows, predicate) {
  const n = rows.length
  const k = rows.reduce((acc, r) => acc + (predicate(r) ? 1 : 0), 0)
  const interval = wilson(k, n)
  const reportable = n >= MIN_REPORTABLE_N
  return { n, k, reportable, point: reportable ? interval.point : null, interval }
}

/** What a correctly calibrated one-standard-deviation band should produce. */
export const THEORETICAL = {
  containment: 0.6826894921370859,
  meanAbsZ: 0.7978845608028654,
  oneSidedTouch: 0.3173105078629141,
  oneSidedBreak: 0.15865525393145707,
}
