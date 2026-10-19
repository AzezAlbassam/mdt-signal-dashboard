// Nanalyze's simple valuation ratio (SVR): market value ÷ annualized revenue run rate, the latest
// quarter's revenue × 4. Descriptive only (POST-HOC, 2026-10-19): no study here has tested it as a
// buy or sell signal.
import { addMonths, monthKey } from './fairvalue.js'

const pos = (x) => Number.isFinite(x) && x > 0
const near = (a, b) => pos(a) && pos(b) && a > b / 1.5 && a < b * 1.5
// The lower middle value: with two neighbours, one of them a spike, it is still the good one.
const median = (a) => a.filter(pos).sort((x, y) => x - y)[(a.filter(pos).length - 1) >> 1] ?? null
const sharesOf = (ni, eps) => (ni && eps && Math.sign(ni) === Math.sign(eps) ? ni / eps : null)

// Share counts derived as net income ÷ EPS are kept when within 1.5× of the median of up to two
// neighbours either side: real dilution moves smoothly (IREN 53M → 380M over 16 quarters), a
// distorted one jumps and comes back (MCHP's preferred dividends: 531M, 216M, 1635M, 980M; the
// year of an IPO or SPAC merger averages in the old count: RKLB 2021 207M, 2022 470M). A real
// jump of 1.5× in one quarter (IREN 73M → 112M) also gets dropped: a gap, not a wrong number.
export const steady = (counts) => counts.map((c, i) => {
  const ref = median([...counts.slice(Math.max(0, i - 2), i), ...counts.slice(i + 1, i + 3)])
  return ref == null || near(c, ref) ? c : null
})

/**
 * SVR history the way Nanalyze draws it (their Rocket Lab chart reproduced within 0.9 on
 * average): at each quarter end, the market value then (that month's close × the quarter's share
 * count) ÷ (that quarter's revenue × 4). That revenue came out weeks after the quarter end, so
 * this is a valuation history, not what an investor saw that day. Before the quarters, one point
 * per fiscal year end, `fy: true`: market value ÷ that year's revenue (plain price-to-sales; a
 * grower's year trails its run rate, so it reads higher). A month whose share count fails
 * `steady` or has no close gets no point.
 * `h`: TradingView's *_h columns, newest first (32 quarters and 20 years at most), and
 * fiscal_period_end_fq, the newest quarter's end (unix seconds); quarter i ends 3·i months before
 * it. The fiscal year ends with the quarter whose four-quarter sum is the last year's revenue.
 * Returns { points: [{ m, v, fy? }] oldest first, avg4: the last four quarters' mean (Nanalyze's
 * red line) } or null without quarters.
 */
export function svrHistory(h, closes) {
  const rq = h?.total_revenue_fq_h ?? []
  if (!Number.isFinite(h?.fiscal_period_end_fq) || !rq.length) return null
  const end = monthKey(h.fiscal_period_end_fq)
  const value = (m, shares, rev) => (pos(closes.get(m)) && pos(shares) && pos(rev) ? (closes.get(m) * shares) / rev : null)
  const points = []
  const qs = steady(rq.map((_, i) => sharesOf(h.net_income_fq_h?.[i], h.earnings_per_share_diluted_fq_h?.[i])))
  rq.forEach((rev, i) => {
    const m = addMonths(end, -3 * i)
    const v = value(m, qs[i], 4 * rev)
    if (v != null) points.push({ m, v })
  })
  const avg4 = points.length >= 4 ? points.slice(0, 4).reduce((a, p) => a + p.v, 0) / 4 : null
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
  return { points: points.sort((a, b) => (a.m < b.m ? -1 : 1)), avg4 }
}
