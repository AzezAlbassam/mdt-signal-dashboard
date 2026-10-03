// Does buying inside a zone beat buying at any other time?
//
// "The indicator was at zero at every bottom" is a statement about a chart. The claim
// with content is narrower: weeks the indicator flags are followed by better returns than
// weeks it does not, by more than a randomly placed flag of the same size and shape would
// manage. Everything here serves that comparison.
//
// Conventions, fixed for every asset:
//   - a signal on week i is acted on at the OPEN of week i + 1, never at the close it was
//     computed from;
//   - the forward return over h weeks is close[i + h] / open[i + 1] − 1;
//   - a week whose forward window runs past the data has no forward return and is
//     excluded, so the most recent weeks never count as wins or losses.

/** Forward return for every week, NaN where the window does not fit. */
export function forwardReturns(open, close, h) {
  const n = close.length
  const out = new Array(n).fill(Number.NaN)
  for (let i = 0; i + h < n; i += 1) {
    const entry = open[i + 1]
    if (entry > 0) out[i] = close[i + h] / entry - 1
  }
  return out
}

export function mean(xs) {
  if (xs.length === 0) return Number.NaN
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

export function median(xs) {
  if (xs.length === 0) return Number.NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Forward returns on flagged weeks against all eligible weeks.
 * `eligible[i]` false removes a week from both sides (burn-in, missing data).
 */
export function conditional(mask, fwd, eligible) {
  const sig = []
  const all = []
  for (let i = 0; i < fwd.length; i += 1) {
    if (!eligible[i] || !Number.isFinite(fwd[i])) continue
    all.push(fwd[i])
    if (mask[i]) sig.push(fwd[i])
  }
  const logMean = (xs) => mean(xs.map((x) => Math.log1p(x)))
  return {
    nSignal: sig.length,
    nAll: all.length,
    medianSignal: median(sig),
    medianAll: median(all),
    meanSignal: mean(sig),
    meanAll: mean(all),
    hitSignal: sig.length ? sig.filter((x) => x > 0).length / sig.length : Number.NaN,
    hitAll: all.length ? all.filter((x) => x > 0).length / all.length : Number.NaN,
    worstSignal: sig.length ? Math.min(...sig) : Number.NaN,
    logEdge: logMean(sig) - logMean(all),
  }
}

/**
 * Rotation null: slide the flag pattern round the sample by a random offset and measure
 * the same edge. Rotation keeps how often the flag is on and how it clusters into runs —
 * only its alignment with prices is broken. The p-value is the share of rotations that
 * do at least as well as the real thing.
 */
export function rotationNull(mask, fwd, eligible, { draws = 2000, rng, keepNulls = false }) {
  const idx = []
  for (let i = 0; i < fwd.length; i += 1) {
    if (eligible[i] && Number.isFinite(fwd[i])) idx.push(i)
  }
  const n = idx.length
  const logs = idx.map((i) => Math.log1p(fwd[i]))
  const flags = idx.map((i) => Boolean(mask[i]))
  const k = flags.filter(Boolean).length
  if (k === 0 || k === n) return { observed: Number.NaN, p: Number.NaN, n, k }

  const allMean = mean(logs)
  const edgeAt = (shift) => {
    let s = 0
    for (let j = 0; j < n; j += 1) {
      if (flags[(j + shift) % n]) s += logs[j]
    }
    return s / k - allMean
  }

  const observed = edgeAt(0)
  const nulls = new Array(draws)
  let atLeast = 0
  for (let d = 0; d < draws; d += 1) {
    const shift = 1 + Math.floor(rng() * (n - 1))
    nulls[d] = edgeAt(shift)
    if (nulls[d] >= observed) atLeast += 1
  }
  const draw = keepNulls ? [...nulls] : undefined
  nulls.sort((a, b) => a - b)
  return {
    observed,
    p: (atLeast + 1) / (draws + 1),
    n,
    k,
    null05: nulls[Math.floor(0.05 * draws)],
    null50: nulls[Math.floor(0.5 * draws)],
    null95: nulls[Math.floor(0.95 * draws)],
    nulls: draw,
  }
}

/**
 * Pool several assets' rotation tests into one: the observed statistic is the average
 * edge across assets, and each null draw averages one independent rotation per asset.
 * More power than any single asset, at the price of treating assets as independent —
 * which stocks in one market are not quite, so read a pooled p as optimistic.
 */
export function pooledRotation(tests) {
  const usable = tests.filter((t) => Number.isFinite(t.observed) && t.nulls)
  if (usable.length === 0) return { observed: Number.NaN, p: Number.NaN, assets: 0 }
  const draws = Math.min(...usable.map((t) => t.nulls.length))
  const observed = mean(usable.map((t) => t.observed))
  let atLeast = 0
  for (let d = 0; d < draws; d += 1) {
    if (mean(usable.map((t) => t.nulls[d])) >= observed) atLeast += 1
  }
  return { observed, p: (atLeast + 1) / (draws + 1), assets: usable.length }
}

/**
 * Two ways to put the same money in, one unit every eligible week from `from` to the
 * last week that still has a next open:
 *   DCA   buys every week;
 *   ZONE  banks the unit as cash, and spends everything banked whenever the flag is on.
 * Cash earns nothing, and whatever is still banked at the end counts at face value.
 * Both are valued at the final close.
 */
export function accumulate(open, close, mask, { from = 0 } = {}) {
  const n = close.length
  let dcaUnits = 0
  let zoneUnits = 0
  let cash = 0
  let paidIn = 0
  let buys = 0
  for (let i = from; i < n - 1; i += 1) {
    const px = open[i + 1]
    if (!(px > 0)) continue
    paidIn += 1
    dcaUnits += 1 / px
    cash += 1
    if (mask[i]) {
      zoneUnits += cash / px
      cash = 0
      buys += 1
    }
  }
  const last = close[n - 1]
  const dca = dcaUnits * last
  const zone = zoneUnits * last + cash
  return { paidIn, dca, zone, ratio: zone / dca, cashLeft: cash, buys }
}

/** The same accumulation with the flag rotated, for a null distribution of the ratio. */
export function accumulateNull(open, close, mask, { from = 0, draws = 2000, rng }) {
  const span = close.length - 1 - from
  const flags = mask.slice(from, from + span)
  const observed = accumulate(open, close, mask, { from }).ratio
  const ratios = new Array(draws)
  let atLeast = 0
  for (let d = 0; d < draws; d += 1) {
    const shift = 1 + Math.floor(rng() * (span - 1))
    const rotated = new Array(close.length).fill(false)
    for (let j = 0; j < span; j += 1) rotated[from + j] = flags[(j + shift) % span]
    ratios[d] = accumulate(open, close, rotated, { from }).ratio
    if (ratios[d] >= observed) atLeast += 1
  }
  ratios.sort((a, b) => a - b)
  return {
    observed,
    p: (atLeast + 1) / (draws + 1),
    null05: ratios[Math.floor(0.05 * draws)],
    null50: ratios[Math.floor(0.5 * draws)],
    null95: ratios[Math.floor(0.95 * draws)],
  }
}

/** Runs of flagged weeks, with gaps of up to `mergeGap` unflagged weeks bridged. */
export function episodes(mask, { mergeGap = 4 } = {}) {
  const out = []
  let start = -1
  let lastOn = -1
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue
    if (start >= 0 && i - lastOn - 1 <= mergeGap) {
      lastOn = i
      continue
    }
    if (start >= 0) out.push({ start, end: lastOn })
    start = i
    lastOn = i
  }
  if (start >= 0) out.push({ start, end: lastOn })
  return out
}

/**
 * Deep drawdowns: each time price falls `depth` or more below its running high, the
 * lowest close before the high is regained (or the data ends). Returns the trough index.
 */
export function deepTroughs(close, { depth = 0.5 } = {}) {
  const out = []
  let peak = close[0]
  let peakIdx = 0
  let inDraw = false
  let troughIdx = -1
  for (let i = 1; i < close.length; i += 1) {
    if (close[i] >= peak) {
      if (inDraw) out.push({ peakIdx, troughIdx })
      inDraw = false
      peak = close[i]
      peakIdx = i
      continue
    }
    if (!inDraw && close[i] <= peak * (1 - depth)) {
      inDraw = true
      troughIdx = i
    }
    if (inDraw && close[i] < close[troughIdx]) troughIdx = i
  }
  if (inDraw) out.push({ peakIdx, troughIdx, unrecovered: true })
  return out
}
