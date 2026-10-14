// Study 9 (PROTOCOL-study9.md §1): a 0–10 score in five parts of 0–2 — price, quality,
// growth, safety, direction — where each part covers a blind spot of another.
// Pure functions; the stock page uses this same file, so the page's score is the tested one.
// At month "YYYY-MM" only fiscal years public by then (May of Y+1, as in study 7) and
// closes up to that month are read.

import { lastUsableFiscalYear, addMonths, dcf, stateAt, multiplesAt, PS_MAX } from './fairvalue.js'

/** 0 at a, 1 at b, straight in between, clamped (falls when a > b). */
export const lin = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)))

const pos = (x) => Number.isFinite(x) && x > 0
const num = (x) => Number.isFinite(x)

const MULTS = ['pe', 'ps', 'ev', 'pfcf']

function multiplesNow(funds, closes, month, fy) {
  const c = closes.get(month)
  const st = stateAt(funds, month, fy)
  if (!pos(c) || !st) return null
  const m = multiplesAt(st, c)
  return { pe: m.pe, ps: m.ps, ev: m.ev, pfcf: pos(st.fcfPS) ? c / st.fcfPS : null }
}

/** g* such that the study 7 DCF of today's FCF per share equals the price, in [−20%, 60%]. */
export function impliedGrowth(fcfPS, price, r = 0.09, gT = 0.025) {
  if (!pos(fcfPS) || !pos(price)) return null
  let lo = -0.2
  let hi = 0.6
  if (dcf(fcfPS, lo, r, gT) >= price) return lo
  if (dcf(fcfPS, hi, r, gT) <= price) return hi
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2
    if (dcf(fcfPS, mid, r, gT) > price) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

/**
 * The score at `month` for a stock with annual fundamentals `funds` (parseFundamentals),
 * monthly closes `closes` (Map "YYYY-MM" → close) and TradingView sector `sector`.
 * Returns { total, parts: {A..E}, detail } or { total: null, reason }.
 * `live`: every fiscal year in `funds` counts as reported (see stateAt); the page uses it.
 *
 * POST-HOC fixes (2026-10-14, after reports/study9.txt; reports/study9-posthoc-fixes.txt):
 * financials get no free-cash-flow measures (a bank's cash flow moves with deposits and
 * loans, so implied growth, cash conversion and the two FCF checks said nothing), and P/S
 * months above PS_MAX are left out of the price history.
 */
export function scoreAt(funds, closes, sector, month, live = false) {
  const close = closes.get(month)
  const fy = lastUsableFiscalYear(month)
  const useFy = live ? Infinity : fy
  const known = funds.filter((f) => f.year <= useFy)
  if (!pos(close) || known.length === 0) return { total: null, reason: 'no data' }
  const f0 = known[known.length - 1]
  if (f0.year < fy - 1) return { total: null, reason: 'stale fundamentals' }
  const f1 = known.length > 1 ? known[known.length - 2] : null
  const st = stateAt(funds, month, useFy)
  const fin = sector === 'Finance'
  const mcap = pos(f0.shares) ? close * f0.shares : null
  if (!num(f0.rev) || f0.rev <= 0 || (mcap != null && f0.rev < 0.01 * mcap)) return { total: null, reason: 'pre-revenue' }

  const detail = {}

  // A. Price
  const now = multiplesNow(funds, closes, month, useFy)
  const window = []
  for (let k = 59; k >= 0; k -= 1) {
    const mk = addMonths(month, -k)
    if (closes.has(mk)) window.push(multiplesNow(funds, closes, mk))
  }
  const shares = []
  for (const key of MULTS) {
    const v = now?.[key]
    if (!pos(v)) continue
    const hist = window.map((w) => w?.[key]).filter((x) => pos(x) && !(key === 'ps' && x > PS_MAX))
    if (hist.length < 12) continue
    const below = hist.filter((x) => x < v).length + 0.5 * hist.filter((x) => x === v).length
    shares.push(below / hist.length)
    detail[`pct_${key}`] = below / hist.length
  }
  const a1 = shares.length ? 1 - shares.reduce((a, b) => a + b, 0) / shares.length : null
  const gStar = fin ? null : impliedGrowth(st.fcfPS, close)
  const gReal = st.revG ?? st.epsG ?? 0
  const a2 = gStar == null ? null : lin(gStar - gReal, 0.2, 0)
  Object.assign(detail, { a1, a2, gStar, gReal })
  const A = a1 != null && a2 != null ? a1 + a2 : a1 != null ? 2 * a1 : a2 != null ? 2 * a2 : null

  // B. Quality
  let b1 = null
  if (num(f0.ebitda)) b1 = lin(f0.ebitda / f0.rev, 0, 0.3)
  else if (num(f0.ni)) b1 = lin(f0.ni / f0.rev, 0, 0.2)
  const last3 = known.slice(-3).filter((f) => num(f.ni) && num(f.fcf))
  let b2 = null
  if (last3.length && !fin) {
    const sNi = last3.reduce((a, f) => a + f.ni, 0)
    const sFcf = last3.reduce((a, f) => a + f.fcf, 0)
    b2 = sNi > 0 ? lin(sFcf / sNi, 0, 0.8) : sFcf > 0 ? 0.5 : 0
  }
  Object.assign(detail, { b1, b2 })
  const B = fin ? (b1 != null ? 2 * b1 : null) : b1 != null && b2 != null ? b1 + b2 : null

  // C. Growth
  const c1 = st.revG == null ? null : lin(st.revG, 0, 0.2)
  let c2 = null
  if (st.epsG != null) c2 = lin(st.epsG, 0, 0.2)
  else {
    const eps = known.map((f) => f.eps).filter(num)
    if (eps.length >= 2) c2 = eps[eps.length - 1] > eps[Math.max(0, eps.length - 4)] ? 0.5 : 0
  }
  Object.assign(detail, { c1, c2, revG: st.revG, epsG: st.epsG })
  const C = c1 != null && c2 != null ? c1 + c2 : c1 != null ? 2 * c1 : c2 != null ? 2 * c2 : null

  // D. Safety
  const ni5 = known.slice(-5).map((f) => f.ni).filter(num)
  const losses = ni5.filter((x) => x < 0).length
  const d2 = ni5.length ? Math.max(0, 1 - losses / 3) : null
  let d1 = null
  if (!fin) {
    const debt = f0.debt ?? 0
    d1 = debt === 0 ? 1 : pos(f0.ebitda) ? lin(debt / f0.ebitda, 4, 1) : 0
  }
  Object.assign(detail, { d1, d2, losses })
  const D = d2 == null ? null : fin ? 2 * d2 : d1 + d2

  // E. Direction (partial Piotroski)
  const checks = []
  if (num(f0.ni)) checks.push(f0.ni > 0)
  if (num(f0.fcf) && !fin) checks.push(f0.fcf > 0)
  if (num(f0.fcf) && num(f0.ni) && !fin) checks.push(f0.fcf > f0.ni)
  if (f1) {
    if (num(f0.rev) && num(f1.rev)) checks.push(f0.rev > f1.rev)
    if (num(f0.eps) && num(f1.eps)) checks.push(f0.eps > f1.eps)
    if (num(f0.ebitda) && num(f1.ebitda) && pos(f1.rev)) checks.push(f0.ebitda / f0.rev > f1.ebitda / f1.rev)
    if (num(f0.gp) && num(f1.gp) && pos(f1.rev)) checks.push(f0.gp / f0.rev > f1.gp / f1.rev)
    if (!fin) {
      if (num(f0.ebitda) && num(f1.ebitda)) {
        if (pos(f0.ebitda) && pos(f1.ebitda) && num(f0.debt) && num(f1.debt)) checks.push(f0.debt / f0.ebitda < f1.debt / f1.ebitda)
      } else if (num(f0.debt) && num(f1.debt)) checks.push(f0.debt < f1.debt)
    }
  }
  const passed = checks.filter(Boolean).length
  Object.assign(detail, { checks: checks.length, passed })
  const E = checks.length >= (fin ? 3 : 5) ? (2 * passed) / checks.length : null

  const parts = { A, B, C, D, E }
  if (Object.values(parts).some((x) => x == null)) return { total: null, reason: 'part missing', parts, detail }
  return { total: A + B + C + D + E, parts, detail, fiscalYear: f0.year }
}
