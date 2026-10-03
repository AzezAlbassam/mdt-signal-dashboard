// MVRV and its Z-score — for Bitcoin as published, and for stocks by analogy.
//
// MVRV = market value / realized value. Market value is what every unit is worth at
// today's price. Realized value is what every unit is worth at the price it LAST CHANGED
// HANDS — on Bitcoin that is read straight off the blockchain (each coin carries the
// price of the day it last moved), so realized value is the network's aggregate cost
// basis. MVRV < 1 means the average holder is under water.
//
// The Z-score rescales the gap:   Z = (market value − realized value) / σ(market value)
//
// Z < 0 is exactly MVRV < 1, whatever σ is — σ is positive, so it never moves the zero
// line. σ only decides how big the numbers ABOVE zero look (the "Z > 7 is a top" zone).
//
// Stocks have no blockchain, so nobody can see the price each share last traded at. The
// standard substitute in finance (Grinblatt & Han 2005) assumes every share is equally
// likely to change hands: if a fraction τ of all shares trades this week at price p, the
// holders' average cost basis moves a fraction τ of the way toward p. That is the only
// non-Bitcoin piece here, and the one to be suspicious of.

/** Block-height anchors: genesis, block 1, the first difficulty retarget, block 100,000 and the four halvings. */
const HEIGHT_ANCHORS = [
  [Date.UTC(2009, 0, 3, 18, 15, 5) / 1000, 0],
  [Date.UTC(2009, 0, 9, 2, 54, 25) / 1000, 1],
  [Date.UTC(2009, 11, 30) / 1000, 32256],
  [Date.UTC(2010, 11, 29, 11, 57, 43) / 1000, 100000],
  [Date.UTC(2012, 10, 28, 15, 24, 38) / 1000, 210000],
  [Date.UTC(2016, 6, 9, 16, 46, 13) / 1000, 420000],
  [Date.UTC(2020, 4, 11, 19, 23, 43) / 1000, 630000],
  [Date.UTC(2024, 3, 20, 0, 9, 27) / 1000, 840000],
]

/**
 * Estimated block height at a unix time (seconds): linear between known anchors, and
 * extrapolated at the 2020→2024 pace after the last one. Off by a few thousand blocks
 * at most, which is a few hundredths of a percent of supply.
 */
export function btcBlockHeightAt(t) {
  const a = HEIGHT_ANCHORS
  if (t <= a[0][0]) return 0
  for (let i = 1; i < a.length; i += 1) {
    if (t <= a[i][0]) {
      const [t0, h0] = a[i - 1]
      const [t1, h1] = a[i]
      return h0 + ((t - t0) / (t1 - t0)) * (h1 - h0)
    }
  }
  const [tp, hp] = a[a.length - 2]
  const [tl, hl] = a[a.length - 1]
  const perSecond = (hl - hp) / (tl - tp)
  return hl + (t - tl) * perSecond
}

/** Coins issued up to a block height: 50 BTC a block, halved every 210,000 blocks. */
export function btcSupplyAtHeight(height) {
  let supply = 0
  let reward = 50
  let remaining = Math.max(0, height)
  while (remaining > 0 && reward > 1e-8) {
    const blocks = Math.min(remaining, 210000)
    supply += blocks * reward
    remaining -= blocks
    reward /= 2
  }
  return supply
}

export function btcSupplyAt(t) {
  return btcSupplyAtHeight(btcBlockHeightAt(t))
}

/**
 * Holders' average cost basis from turnover — the stock stand-in for realized price.
 *
 *   τ_t  = min(1, scale × volume_t / shares_t)
 *   RP_t = (1 − τ_t) × RP_{t−1} + τ_t × price_t
 *
 * Starts at the first price. `scale` multiplies turnover: 1 is the textbook model; below 1
 * says much of the volume is the same few shares churning while long-term holders sit,
 * which lengthens the memory the way Bitcoin's dormant coins do.
 *
 * Uses only bars up to t, so it never sees the future.
 */
export function costBasisFromTurnover(prices, volumes, shares, { scale = 1 } = {}) {
  const n = prices.length
  if (volumes.length !== n) throw new RangeError('prices and volumes differ in length')
  const sharesAt = typeof shares === 'number' ? () => shares : (i) => shares[i]

  const rp = new Array(n)
  for (let i = 0; i < n; i += 1) {
    if (i === 0) {
      rp[i] = prices[0]
      continue
    }
    const s = sharesAt(i)
    const tau = s > 0 ? Math.min(1, Math.max(0, (scale * volumes[i]) / s)) : 0
    rp[i] = (1 - tau) * rp[i - 1] + tau * prices[i]
  }
  return rp
}

/**
 * Cost basis with a fixed memory instead of observed turnover: the same update with a
 * constant τ chosen so that a price's weight halves every `halfLife` bars. Bitcoin's
 * on-chain realized price tracks this shape with a half-life of roughly a year
 * (scripts/mvrv-backtest.js measures it), so this is "a stock with Bitcoin's memory".
 */
export function costBasisFixedMemory(prices, halfLife) {
  const tau = 1 - 0.5 ** (1 / halfLife)
  return costBasisFromTurnover(prices, prices.map(() => tau), 1)
}

/**
 * Standard deviation of xs[0..i] at every i (Welford), so value i uses no data after i.
 * Sample (n − 1) definition; NaN until two points exist.
 */
export function expandingStd(xs) {
  const out = new Array(xs.length)
  let n = 0
  let mean = 0
  let m2 = 0
  for (let i = 0; i < xs.length; i += 1) {
    n += 1
    const d = xs[i] - mean
    mean += d / n
    m2 += d * (xs[i] - mean)
    out[i] = n >= 2 ? Math.sqrt(m2 / (n - 1)) : Number.NaN
  }
  return out
}

/** One standard deviation over the whole array — what a chart drawn today uses for every past point. */
export function fullStd(xs) {
  const n = xs.length
  if (n < 2) return Number.NaN
  const mean = xs.reduce((s, x) => s + x, 0) / n
  const ss = xs.reduce((s, x) => s + (x - mean) ** 2, 0)
  return Math.sqrt(ss / (n - 1))
}

/**
 * Z = (market value − realized value) / σ(market value).
 *
 * `std: 'expanding'` divides each point by the σ known at the time — what you would
 * actually have seen. `std: 'full'` divides every point by one σ computed from all the
 * data, which is how a chart published today is drawn, and which uses the future.
 */
export function mvrvZ(marketValue, realizedValue, { std = 'expanding' } = {}) {
  if (marketValue.length !== realizedValue.length) {
    throw new RangeError('market and realized value differ in length')
  }
  const sigma = std === 'full'
    ? new Array(marketValue.length).fill(fullStd(marketValue))
    : expandingStd(marketValue)
  return marketValue.map((mv, i) => (mv - realizedValue[i]) / sigma[i])
}

/** MVRV ratio, the unscaled form: below 1 means the average holder is at a loss. */
export function mvrvRatio(marketValue, realizedValue) {
  return marketValue.map((mv, i) => mv / realizedValue[i])
}

/**
 * Where xs[i] sits among xs[0..i], as a fraction in [0, 1] — the share of the history up
 * to and including i that is at or below it. Point-in-time: never sees later values.
 * NaN until `minHistory` points exist.
 */
export function expandingPercentRank(xs, { minHistory = 52 } = {}) {
  const out = new Array(xs.length).fill(Number.NaN)
  for (let i = 0; i < xs.length; i += 1) {
    if (i + 1 < minHistory || !Number.isFinite(xs[i])) continue
    let atOrBelow = 0
    let seen = 0
    for (let j = 0; j <= i; j += 1) {
      if (!Number.isFinite(xs[j])) continue
      seen += 1
      if (xs[j] <= xs[i]) atOrBelow += 1
    }
    out[i] = atOrBelow / seen
  }
  return out
}

/** Simple moving average; NaN until `length` values exist. */
export function sma(xs, length) {
  const out = new Array(xs.length).fill(Number.NaN)
  let sum = 0
  for (let i = 0; i < xs.length; i += 1) {
    sum += xs[i]
    if (i >= length) sum -= xs[i - length]
    if (i >= length - 1) out[i] = sum / length
  }
  return out
}
