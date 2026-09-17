// "استراتيجية متوسط ٥٠" — the MA50 anchor rule, as @zero_en3kas published it on 2023-09-15.
//
//   "متوسط 50 خط عمودي على القمة وخط افقي مع تقاطع متوسط خمسين"
//   MA50; a vertical line on the peak; a horizontal line at the crossing with the MA50.
//
// Drop a vertical at the swing peak, read where it cuts the MA50, carry that value
// forward as a horizontal level. That is the whole rule.
//
// This is the only one of his free strategies that is genuinely scale-free — it reads a
// number off the data rather than an angle off the picture, so it survives a change of
// chart zoom. His mirrored-trend-angle rule does not; see METHOD.md.
//
// The one thing he leaves to the eye is which peak counts. `lookback` is our mechanical
// stand-in for his judgement, not a parameter he specifies.

/** Simple moving average, aligned to the input: result[i] is the mean of the window ending at i. */
export function sma(values, period) {
  if (!Number.isInteger(period)) {
    throw new TypeError(`period must be an integer, got ${period}`)
  }
  if (period < 1) {
    throw new RangeError(`period must be positive, got ${period}`)
  }

  const out = new Array(values.length).fill(undefined)
  let running = 0
  for (let i = 0; i < values.length; i += 1) {
    running += values[i]
    if (i >= period) running -= values[i - period]
    if (i >= period - 1) out[i] = running / period
  }
  return out
}

/**
 * Bars whose high is strictly greater than every high within `lookback` bars either side.
 * Strict on both sides, so a flat double top is not a peak — it has no single vertical to drop.
 */
export function findSwingHighs(bars, lookback = 5) {
  if (!Number.isInteger(lookback) || lookback < 1) {
    throw new RangeError(`lookback must be a positive integer, got ${lookback}`)
  }

  const peaks = []
  for (let i = lookback; i < bars.length - lookback; i += 1) {
    let isPeak = true
    for (let j = i - lookback; j <= i + lookback; j += 1) {
      if (j !== i && bars[j].high >= bars[i].high) {
        isPeak = false
        break
      }
    }
    if (isPeak) peaks.push(i)
  }
  return peaks
}

/**
 * The level itself: the moving average's value at the bar of the peak.
 * Returns null when the average is not yet defined there.
 */
export function maAnchorLevel(bars, peakIndex, period = 50) {
  if (!Number.isInteger(peakIndex) || peakIndex < 0 || peakIndex >= bars.length) {
    throw new RangeError(`peakIndex ${peakIndex} out of range for ${bars.length} bars`)
  }
  const averages = sma(bars.map((b) => b.close), period)
  return averages[peakIndex] ?? null
}

/**
 * Every level the rule produces over a series, one per confirmed swing high.
 *
 * `peakAboveMa` records his preferred context — "يفضل الاسعار تسوي قمم اعلى متوسط الخمسين",
 * prices preferably making peaks above the MA50. He states it as a preference, not a
 * filter, so it is reported rather than applied.
 */
export function maAnchorLevels(bars, { period = 50, lookback = 5 } = {}) {
  const averages = sma(bars.map((b) => b.close), period)

  return findSwingHighs(bars, lookback)
    .filter((barIndex) => averages[barIndex] !== undefined)
    .map((barIndex) => ({
      barIndex,
      price: averages[barIndex],
      peakHigh: bars[barIndex].high,
      peakAboveMa: bars[barIndex].high > averages[barIndex],
    }))
}
