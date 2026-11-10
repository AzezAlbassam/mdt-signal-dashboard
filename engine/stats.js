// Intervals, so small samples are reported as small samples.

/**
 * Wilson score interval for a proportion — well behaved at small n and near 0 and 1,
 * where the textbook normal interval runs outside [0, 1] and understates the width.
 */
export function wilsonInterval(successes, trials, z = 1.96) {
  if (trials === 0) return null

  const p = successes / trials
  const z2 = z * z
  const denom = 1 + z2 / trials
  const centre = (p + z2 / (2 * trials)) / denom
  const spread = (z / denom) * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))

  return [Math.max(0, centre - spread), Math.min(1, centre + spread)]
}

/**
 * Percentile bootstrap for the mean of a sample — here, expectancy per trade.
 * Trade returns are bimodal (a fixed win or a fixed loss), so a t-interval's normality
 * assumption is a poor fit; resampling makes no such assumption.
 */
export function bootstrapMean(values, { draws = 2000, rng, alpha = 0.05 } = {}) {
  if (values.length === 0) return null

  const n = values.length
  const means = new Array(draws)

  for (let d = 0; d < draws; d += 1) {
    let sum = 0
    for (let i = 0; i < n; i += 1) {
      sum += values[Math.floor(rng() * n)]
    }
    means[d] = sum / n
  }

  means.sort((a, b) => a - b)
  const lo = means[Math.floor((alpha / 2) * draws)]
  const hi = means[Math.min(draws - 1, Math.floor((1 - alpha / 2) * draws))]
  return [lo, hi]
}
