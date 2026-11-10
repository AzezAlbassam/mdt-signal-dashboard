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

/**
 * Block-height anchors: genesis, block 1, the four halvings, and the height on 1 January
 * of every year from 2010 to 2026 (quarterly in 2010–11, when block production was
 * erratic) — read off Coin Metrics' daily supply (SplyCur, inverted through the issuance
 * schedule). Linear between anchors, the pace of the last year after the last one.
 * Against Coin Metrics' supply from July 2010: median error 0.02%, 99th percentile 0.8%.
 */
const utc = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000
export const HEIGHT_ANCHORS = [
  [utc(2009, 1, 3, 18, 15, 5), 0],
  [utc(2009, 1, 9, 2, 54, 25), 1],
  [utc(2010, 1, 1), 32626],
  [utc(2010, 4, 1), 48470],
  [utc(2010, 7, 1), 63777],
  [utc(2010, 10, 1), 83156],
  [utc(2011, 1, 1), 100593],
  [utc(2011, 4, 1), 116217],
  [utc(2011, 7, 1), 134297],
  [utc(2011, 10, 1), 147711],
  [utc(2012, 1, 1), 160192],
  [utc(2012, 11, 28, 15, 24, 38), 210000],
  [utc(2013, 1, 1), 214724],
  [utc(2014, 1, 1), 278200],
  [utc(2015, 1, 1), 337025],
  [utc(2016, 1, 1), 391315],
  [utc(2016, 7, 9, 16, 46, 13), 420000],
  [utc(2017, 1, 1), 446181],
  [utc(2018, 1, 1), 502108],
  [utc(2019, 1, 1), 556598],
  [utc(2020, 1, 1), 610855],
  [utc(2020, 5, 11, 19, 23, 43), 630000],
  [utc(2021, 1, 1), 664036],
  [utc(2022, 1, 1), 716743],
  [utc(2023, 1, 1), 769913],
  [utc(2024, 1, 1), 823911],
  [utc(2024, 4, 20, 0, 9, 27), 840000],
  [utc(2025, 1, 1), 877333],
  [utc(2026, 1, 1), 930423],
]

/** Estimated block height at a unix time (seconds). */
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
  return hl + (t - tl) * ((hl - hp) / (tl - tp))
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
 * How much of the cost basis at each bar is still the arbitrary first price: the product
 * of (1 − τ) so far. The cost basis means something only once this is small — on a stock
 * with thin early volume it can take decades — so eligibility is gated on it.
 */
export function startWeight(volumes, shares, { scale = 1 } = {}) {
  const sharesAt = typeof shares === 'number' ? () => shares : (i) => shares[i]
  const out = new Array(volumes.length)
  let w = 1
  for (let i = 0; i < volumes.length; i += 1) {
    if (i > 0) {
      const s = sharesAt(i)
      const tau = s > 0 ? Math.min(1, Math.max(0, (scale * volumes[i]) / s)) : 0
      w *= 1 - tau
    }
    out[i] = w
  }
  return out
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
 * actually have seen, and what the widely published charts reproduce. `std: 'full'`
 * divides every point by one σ computed from all the data, which uses the future; it is
 * here to show how much the numbers above zero depend on that choice.
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
 * Where xs[i] sits among the finite values of xs[0..i], as a fraction in [0, 1] — the share
 * of that history at or below it. Point-in-time: never sees later values. NaN until
 * `minHistory` finite values exist, so a series masked to NaN before it is meaningful
 * starts ranking only after enough meaningful history.
 */
export function expandingPercentRank(xs, { minHistory = 52 } = {}) {
  const out = new Array(xs.length).fill(Number.NaN)
  const seenVals = []
  for (let i = 0; i < xs.length; i += 1) {
    if (!Number.isFinite(xs[i])) continue
    seenVals.push(xs[i])
    if (seenVals.length < minHistory) continue
    let atOrBelow = 0
    for (const v of seenVals) if (v <= xs[i]) atOrBelow += 1
    out[i] = atOrBelow / seenVals.length
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
