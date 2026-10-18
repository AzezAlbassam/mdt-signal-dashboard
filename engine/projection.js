// Five-year price scenarios for the stock page. NOT a study: nothing here was backtested, the
// page shows it as scenarios built from stated assumptions, not as a forecast that works.
//
// price(t) = earnings per share(t) × P/E(t), three ways (bear / base / bull):
//   revenue grows from a starting rate (analysts' next year when given, else the 3-year CAGR)
//   that fades to a long-run rate by year 5, ±10 points between scenarios; net margin is the
//   lowest / average / highest of the last 3 fiscal years; the P/E walks from today's (price ÷
//   that scenario's earnings now) to the stock's own 5-year median P/E × 0.75 / 1 / 1.25.
// Unprofitable companies use sales per share × P/S the same way. Pre-revenue companies (or
// loss-makers above 20× sales) get no price path, only the revenue they would need in 5 years.
// Shares are held at today's count (buybacks and dilution are not modelled).
import { stateAt, addMonths, PARAMS, MULT_MAX, liveShift, lastUsableFiscalYear } from './fairvalue.js'

export const YEARS = 5
const NAMES = ['bear', 'base', 'bull']
const SPREAD = 0.1 // bear / bull start this far below / above the base growth
const FADE = [0.02, 0.04, 0.06] // growth reached in year 5
const MULT = [0.75, 1, 1.25] // exit multiple × own median
const PE = { lo: 8, hi: 35, dflt: 18 }
const PS = { lo: 0.5, hi: 8, dflt: 2 }
const PRE_PS = 20 // a loss-maker above this P/S has no sales path worth drawing
// Pre-revenue: what a mature company is worth per unit of revenue (P/E 20 × 15% net margin).
const MATURE_PS = 20 * 0.15

const pos = (x) => Number.isFinite(x) && x > 0
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  const n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

/**
 * Scenarios at `month` (the page passes the current month, `closes` holding today's price).
 * `revGrowthNext`: analysts' next-year revenue growth when comparable; `revNow`: revenue of
 * the last 12 months (fresher than the last fiscal year). Both optional.
 */
export function projectAt(funds, closes, month, { revGrowthNext = null, revNow = null } = {}) {
  const price = closes.get(month)
  const st = stateAt(funds, month, Infinity)
  if (!pos(price) || !st || !pos(st.shares)) return null
  const mcap = price * st.shares
  const rev0 = pos(revNow) ? revNow : st.rev
  const recent = funds.filter((f) => f.year <= st.fiscalYear && pos(f.rev) && Number.isFinite(f.ni)).slice(-3)
  const margins = recent.map((f) => f.ni / f.rev)
  const avg = margins.reduce((a, b) => a + b, 0) / (margins.length || 1)
  const earnings = margins.length > 0 && avg > 0
  if (!pos(rev0) || rev0 < 0.01 * mcap || (!earnings && mcap / rev0 > PRE_PS)) {
    return { kind: 'pre', price, rev: rev0, revNeeded: (mcap * (1 + PARAMS.discount) ** YEARS) / MATURE_PS }
  }

  // Own multiple over the last 60 months, each month with the numbers public then.
  const hist = []
  const shift = liveShift(funds, month)
  for (let k = 0; k < 60; k += 1) {
    const mk = addMonths(month, -k)
    const c = closes.get(mk)
    const s = pos(c) && stateAt(funds, mk, lastUsableFiscalYear(mk) + shift)
    if (!s) continue
    const x = earnings ? (pos(s.eps) ? c / s.eps : null) : pos(s.revPS) ? c / s.revPS : null
    if (pos(x) && x <= MULT_MAX) hist.push(x)
  }
  const lim = earnings ? PE : PS
  const own = hist.length >= 12 ? median(hist) : null
  const normal = own == null ? lim.dflt : clamp(own, lim.lo, lim.hi)
  const g0 = clamp(revGrowthNext ?? st.revG ?? 0, -0.15, 0.4)
  const margin = earnings ? [Math.min(...margins), avg, Math.max(...margins)] : null

  const rows = Array.from({ length: YEARS }, (_, i) => ({ t: i + 1 }))
  const exitMult = []
  const basis = []
  const growth = []
  NAMES.forEach((name, i) => {
    // A scenario whose margin is not positive is priced on sales, at P/S 1 by year 5.
    const onEarnings = earnings && margin[i] > 0
    const perShare = (rev) => (onEarnings ? rev * margin[i] : rev) / st.shares
    const exit = onEarnings || !earnings ? normal * MULT[i] : 1
    const start = clamp(price / perShare(rev0), 0.1, 100)
    exitMult.push(exit)
    basis.push(onEarnings ? 'pe' : 'ps')
    let rev = rev0
    const g1 = g0 + (i - 1) * SPREAD
    growth.push([g1, FADE[i]])
    for (let t = 1; t <= YEARS; t += 1) {
      rev *= 1 + g1 + ((FADE[i] - g1) * (t - 1)) / (YEARS - 1)
      rows[t - 1][name] = perShare(rev) * (start + ((exit - start) * t) / YEARS)
    }
  })
  const last = rows[YEARS - 1]
  return {
    kind: earnings ? 'earnings' : 'sales', price, g0, growthFrom: revGrowthNext != null ? 'analysts' : 'history', margin, normal, own, exitMult, basis, growth, rows,
    yearly: NAMES.map((k) => (last[k] / price) ** (1 / YEARS) - 1),
    today: NAMES.map((k) => last[k] / (1 + PARAMS.discount) ** YEARS),
  }
}
