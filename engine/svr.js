// Nanalyze's simple valuation ratio (SVR): market value ÷ annualized revenue run rate, the latest
// quarter's revenue × 4. Descriptive only (POST-HOC, 2026-10-19): no study here has tested it as a
// buy or sell signal.
import { addMonths, monthKey } from './fairvalue.js'

const pos = (x) => Number.isFinite(x) && x > 0
const near = (a, b, x = 1.5) => pos(a) && pos(b) && a > b / x && a < b * x
// TradingView rounds EPS to 4 decimals, more than 1% off under half a cent (NVDA 2009: -0.0012 →
// 25.0B shares, ~22B real); such a count is left out.
const sharesOf = (ni, eps) => (ni && Math.abs(eps) >= 0.005 && Math.sign(ni) === Math.sign(eps) ? ni / eps : null)

/**
 * Share counts derived as net income ÷ EPS, newest first, cleaned in two passes (a dropped count
 * leaves a gap, not a wrong number). 1) A count is kept when it is within 1.5× of at least half of
 * its neighbours (up to two either side): real dilution moves smoothly (IREN 53M → 380M over 16
 * quarters), a distorted count jumps and comes back (MCHP's preferred dividends: 531M, 216M,
 * 1635M, 980M; Al Rajhi's EPS not adjusted for a bonus issue: 6.0B, 9.6B). 2) Everything older
 * than a jump of 2.5× between kept counts is dropped: before a SPAC merger the count is the
 * legacy holders' (RKLB 79M, then 450M), which at the shell's $10 price gives SVRs 6× too low.
 */
export const steady = (counts) => {
  const kept = counts.map((c, i) => {
    const nb = [...counts.slice(Math.max(0, i - 2), i), ...counts.slice(i + 1, i + 3)].filter(pos)
    return !nb.length || nb.filter((x) => near(c, x)).length >= Math.ceil(nb.length / 2) ? c : null
  })
  let prev = null
  let cut = false
  return kept.map((c) => {
    if (cut || c == null) return null
    if (prev != null && !near(c, prev, 2.5)) cut = true
    else prev = c
    return cut ? null : c
  })
}

/**
 * SVR history the way Nanalyze draws it (their Rocket Lab chart reproduced within 0.9 on
 * average): at each quarter end, the market value then (that month's close × the quarter's share
 * count) ÷ (that quarter's revenue × 4). That revenue came out weeks after the quarter end, so
 * this is a valuation history, not what an investor saw that day. Before the quarters, one point
 * per fiscal year end, `fy: true`: market value ÷ that year's revenue (plain price-to-sales; a
 * grower's year trails its run rate, so it reads higher). A month whose share count fails
 * `steady`, with no close, or with revenue under 10 million a year (Nanalyze leaves those out)
 * gets no point.
 * `h`: TradingView's *_h columns, newest first (32 quarters and 20 years at most), and
 * fiscal_period_end_fq, the newest quarter's end (unix seconds); quarter i ends 3·i months before
 * it. The fiscal year ends with the quarter whose four-quarter sum is the last year's revenue.
 * Returns { points: [{ m, v, fy? }] oldest first, avg4: the mean of the last four quarters
 * (Nanalyze's red line; null with fewer than two of them), quarters: how many there are } or null
 * without quarters.
 */
export function svrHistory(h, closes) {
  const rq = h?.total_revenue_fq_h ?? []
  if (!Number.isFinite(h?.fiscal_period_end_fq) || !rq.length) return null
  const end = monthKey(h.fiscal_period_end_fq)
  const value = (m, shares, rev) => (pos(closes.get(m)) && pos(shares) && rev >= 1e7 ? (closes.get(m) * shares) / rev : null)
  const points = []
  const qs = steady(rq.map((_, i) => sharesOf(h.net_income_fq_h?.[i], h.earnings_per_share_diluted_fq_h?.[i])))
  rq.forEach((rev, i) => {
    const m = addMonths(end, -3 * i)
    const v = value(m, qs[i], 4 * rev)
    if (v != null) points.push({ m, v })
  })
  const last4 = points.filter((p) => p.m > addMonths(end, -12))
  const avg4 = last4.length >= 2 ? last4.reduce((a, p) => a + p.v, 0) / last4.length : null
  const ry = h.total_revenue_fy_h ?? []
  const miss = (k) => (rq.length >= k + 4 && pos(ry[0]) ? Math.abs(rq.slice(k, k + 4).reduce((a, x) => a + x, 0) / ry[0] - 1) : Infinity)
  const k = [0, 1, 2, 3].reduce((b, j) => (miss(j) < miss(b) ? j : b), 0)
  if (miss(k) < 0.02) {
    const first = addMonths(end, -3 * (rq.length - 1))
    const ys = steady(ry.map((_, j) => sharesOf(h.net_income_fy_h?.[j], h.earnings_per_share_diluted_fy_h?.[j])))
    ry.forEach((rev, j) => {
      const m = addMonths(end, -3 * k - 12 * j)
      const v = m < first ? value(m, ys[j], rev) : null
      if (v != null) points.push({ m, v, fy: true })
    })
  }
  return { points: points.sort((a, b) => (a.m < b.m ? -1 : 1)), avg4, quarters: rq.length }
}
