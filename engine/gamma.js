// OGL — open gamma levels, PROTOCOL-study15.md §4, which fixes every rule here.
//
// Black-Scholes with r = q = 0, implied volatility by bisection, and the per-strike exposure
// E = 100·S²·0.01·(Γ_call·volume_call − Γ_put·volume_put): dollars of delta change per 1%
// move, calls positive, puts negative. Volume, not open interest (not served; a day old for
// 0DTE). An open look-alike of a vendor's bubbles, not a copy of them.
import { erfc } from './power.js'

const ncdf = (x) => 0.5 * erfc(-x / Math.SQRT2)
const npdf = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)
export const YEAR_MIN = 365 * 1440

const d1 = (S, K, T, vol) => (Math.log(S / K) + vol * vol * T / 2) / (vol * Math.sqrt(T))

export function bsPrice(call, S, K, T, vol) {
  const a = d1(S, K, T, vol), b = a - vol * Math.sqrt(T)
  return call ? S * ncdf(a) - K * ncdf(b) : K * ncdf(-b) - S * ncdf(-a)
}

export const bsGamma = (S, K, T, vol) => npdf(d1(S, K, T, vol)) / (S * vol * Math.sqrt(T))

/** IV in [1%, 300%], or null when the price is below intrinsic + 0.01 or outside that range. */
export function impliedVol(call, price, S, K, T) {
  const intrinsic = Math.max(0, call ? S - K : K - S)
  if (!(price >= intrinsic + 0.01)) return null
  let lo = 0.01, hi = 3
  if (price < bsPrice(call, S, K, T, lo) || price > bsPrice(call, S, K, T, hi)) return null
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2
    if (bsPrice(call, S, K, T, mid) < price) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Exposure per strike through the session.
 * @param spot   [{ t, c }] the underlying's 1-minute bars (t = bar start, unix s)
 * @param chain  [{ strike, call, bars: [{ t, c, v }] }] same-day contracts, 1-minute bars
 * @param closeT unix s of the 16:00 expiry
 * @returns { strikes, times, E } with E[i][j] = exposure of strikes[j] after spot bar i
 */
export function exposures(spot, chain, closeT) {
  const strikes = [...new Set(chain.map((c) => c.strike))].sort((a, b) => a - b)
  const col = new Map(strikes.map((k, j) => [k, j]))
  const state = chain.map((c) => ({ ...c, at: new Map(c.bars.map((b) => [b.t, b])), iv: null, cv: 0 }))
  const E = []
  for (const s of spot) {
    const T = Math.max(1, (closeT - (s.t + 60)) / 60) / YEAR_MIN
    const row = new Array(strikes.length).fill(0)
    for (const c of state) {
      const b = c.at.get(s.t)
      if (b && b.v > 0) {
        c.cv += b.v
        const iv = impliedVol(c.call, b.c, s.c, c.strike, T)
        if (iv !== null) c.iv = iv // carried forward between trades
      }
      if (c.iv === null || c.cv === 0) continue
      const g = bsGamma(s.c, c.strike, T, c.iv)
      row[col.get(c.strike)] += (c.call ? 1 : -1) * 100 * s.c * s.c * 0.01 * g * c.cv
    }
    E.push(row)
  }
  return { strikes, times: spot.map((s) => s.t), E }
}
