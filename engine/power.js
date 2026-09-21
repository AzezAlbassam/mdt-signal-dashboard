// How many forward trades it takes to tell an edge from luck.
//
// The point of this module is not statistics for its own sake. It is the only honest
// answer to "is he better than us" — you cannot tell from charts, and you cannot tell
// from a good month. You can only tell from a run of calls made in advance, and this
// says how long that run has to be.

/**
 * Inverse standard normal CDF — Acklam's rational approximation, accurate to ~1e-9,
 * refined once with a Halley step.
 */
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) {
    throw new RangeError(`probability must be strictly between 0 and 1, got ${p}`)
  }

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
             1.383577518672690e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
             6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
             -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
             3.754408661907416]

  const plow = 0.02425
  const phigh = 1 - plow
  let x

  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p))
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else if (p <= phigh) {
    const q = p - 0.5
    const r = q * q
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
         ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }

  // One Halley refinement against the true CDF.
  const e = 0.5 * erfc(-x / Math.SQRT2) - p
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2)
  return x - u / (1 + (x * u) / 2)
}

/** Complementary error function — Numerical Recipes' erfcc, ~1.2e-7 relative. */
function erfc(x) {
  const z = Math.abs(x)
  const t = 2 / (2 + z)
  const ty = 4 * t - 2
  const cof = [-1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
               -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
               4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6,
               1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8,
               6.529054439e-9, 5.059343495e-9, -9.91364156e-10]
  let d = 0
  let dd = 0
  for (let j = cof.length - 1; j > 0; j -= 1) {
    const tmp = d
    d = ty * d - dd + cof[j]
    dd = tmp
  }
  const ans = t * Math.exp(-z * z + 0.5 * (cof[0] + ty * d) - dd)
  return x >= 0 ? ans : 2 - ans
}

/** The win rate a stop/target pair has to clear just to break even. */
export function breakEvenRate(stopPct, targetPct) {
  return stopPct / (stopPct + targetPct)
}

/**
 * Trades needed to show a true rate of `p1` beats a break-even of `p0`.
 * One-sided test at `alpha`, with `power` chance of detecting the edge if it is real.
 *
 * The shape of this is the whole lesson: it scales with 1/(p1-p0)², so halving the
 * claimed edge quadruples the evidence required.
 */
export function sampleSizeFor(p0, p1, { alpha = 0.05, power = 0.80 } = {}) {
  if (!(p1 > p0)) {
    throw new RangeError(`p1 (${p1}) must be greater than the break-even p0 (${p0})`)
  }

  const zAlpha = normalQuantile(1 - alpha)
  const zBeta = normalQuantile(power)
  const numerator = zAlpha * Math.sqrt(p0 * (1 - p0)) + zBeta * Math.sqrt(p1 * (1 - p1))

  return Math.ceil((numerator / (p1 - p0)) ** 2)
}
