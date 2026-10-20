// Study 14 (PROTOCOL-study14.md): cross-sectional ranks from the research literature. Each value
// reads only data dated at or before its month (closes and highs) or fiscal years known then.
import { addMonths } from './fairvalue.js'

const pos = (x) => Number.isFinite(x) && x > 0

/** Percentiles (average rank − 0.5) ÷ n, ties sharing their average rank; higher value → higher. */
export function percentiles(xs) {
  const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0])
  const out = new Array(xs.length)
  for (let i = 0; i < idx.length;) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1
    const rank = (i + j) / 2 + 1
    for (let k = i; k <= j; k += 1) out[idx[k][1]] = (rank - 0.5) / xs.length
    i = j + 1
  }
  return out
}

/**
 * Sector-relative percentiles for rows { key, sector, x }: within each sector with at least `min`
 * rows; rows of smaller sectors get null. Returns Map(key → percentile).
 */
export function sectorPercentiles(rows, min = 5) {
  const out = new Map()
  const by = new Map()
  for (const r of rows) if (Number.isFinite(r.x) && r.sector) (by.get(r.sector) ?? by.set(r.sector, []).get(r.sector)).push(r)
  for (const g of by.values()) {
    if (g.length < min) continue
    percentiles(g.map((r) => r.x)).forEach((p, i) => out.set(g[i].key, p))
  }
  return out
}

/** Nearness to the 52-week high: close at m ÷ the highest monthly high of the 12 months to m (all present). */
export function nearHigh(closes, highs, m) {
  const c = closes.get(m)
  let hi = -Infinity
  for (let k = 0; k < 12; k += 1) {
    const h = highs.get(addMonths(m, -k))
    if (!pos(h)) return null
    hi = Math.max(hi, h)
  }
  return pos(c) ? c / hi : null
}

/** 12-1 momentum at May R (m = 'R-05'): close of April R ÷ close of May R−1 − 1. */
export function momentum(closes, m) {
  const a = closes.get(addMonths(m, -12))
  const b = closes.get(addMonths(m, -1))
  return pos(a) && pos(b) ? b / a - 1 : null
}

/**
 * Residual momentum, market form: OLS of the stock's monthly returns on `market` (Map month →
 * return) over the 36 months to m (all present); the sum of the residuals of months m−11 … m−1 ÷
 * their sample standard deviation.
 */
export function residualMomentum(closes, market, m) {
  const r = []
  for (let k = 35; k >= 0; k -= 1) {
    const s = addMonths(m, -k)
    const a = closes.get(addMonths(s, -1))
    const b = closes.get(s)
    const x = market.get(s)
    if (!pos(a) || !pos(b) || !Number.isFinite(x)) return null
    r.push({ s, y: b / a - 1, x })
  }
  const mx = r.reduce((a, p) => a + p.x, 0) / r.length
  const my = r.reduce((a, p) => a + p.y, 0) / r.length
  const sxx = r.reduce((a, p) => a + (p.x - mx) ** 2, 0)
  const beta = sxx > 0 ? r.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx : 0
  const alpha = my - beta * mx
  const e = r.slice(24, 35).map((p) => p.y - alpha - beta * p.x) // months m−11 … m−1
  const me = e.reduce((a, b) => a + b, 0) / e.length
  const sd = Math.sqrt(e.reduce((a, b) => a + (b - me) ** 2, 0) / (e.length - 1))
  return sd > 0 ? e.reduce((a, b) => a + b, 0) / sd : null
}

/**
 * Total assets per stored fiscal year from TradingView's unlabelled newest-first arrays
 * (PROTOCOL-study14.md §1): index i matches year Y when both revenues are > 0 and within 0.1%;
 * the offset o is the most common Y + i over one-to-one matches (none on a tie); year Y takes
 * assets[o − Y] when that index matches Y and the assets are > 0.
 */
export function assetsByYear(funds, assets, revenue) {
  const out = new Map()
  if (!Array.isArray(assets) || !Array.isArray(revenue)) return out
  const years = funds.filter((f) => pos(f.rev))
  const match = (i, f) => pos(revenue[i]) && Math.abs(revenue[i] / f.rev - 1) <= 0.001
  const count = new Map()
  for (const f of years) {
    const is = revenue.map((_, i) => i).filter((i) => match(i, f))
    if (is.length !== 1 || years.filter((g) => match(is[0], g)).length !== 1) continue
    count.set(f.year + is[0], (count.get(f.year + is[0]) ?? 0) + 1)
  }
  const best = [...count].sort((a, b) => b[1] - a[1])
  if (!best.length || (best.length > 1 && best[1][1] === best[0][1])) return out
  const o = best[0][0]
  for (const f of years) {
    const i = o - f.year
    if (i >= 0 && i < revenue.length && match(i, f) && pos(assets[i])) out.set(f.year, assets[i])
  }
  return out
}
