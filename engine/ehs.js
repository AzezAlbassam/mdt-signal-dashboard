// The Earnings Hub Score (EHS), rebuilt from EH's own explanation (earningshub.com, "Learn more"):
// five TTM metrics, each worth 3/2/1/0 points by quartile against a benchmark set (EH: its 500 most
// popular stocks; ours: S&P 500 / TASI), after dropping the top and bottom 5% and any negative P/E or
// forward P/E. Total 0–15. EH does not publish how the total becomes a letter; ours grades on the
// same curve: the quartile of the total within the benchmark (A = top 25%).

export const EHS_METRICS = [
  { key: 'revG', col: 'total_revenue_yoy_growth_ttm', higher: true },
  { key: 'epsG', col: 'earnings_per_share_diluted_yoy_growth_ttm', higher: true },
  { key: 'pe', col: 'price_earnings_ttm', higher: false, positive: true },
  { key: 'fpe', col: 'non_gaap_price_to_earnings_per_share_forecast_next_fy', higher: false, positive: true },
  { key: 'ps', col: 'price_sales_current', higher: false, positive: true },
]

const quantile = (s, p) => { // s sorted ascending; linear interpolation
  const i = (s.length - 1) * p
  const lo = Math.floor(i)
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)
}

/** Points per metric and the total for one row, given each metric's [p25, p50, p75] cut points. */
export function ehsScore(q, cuts) {
  const parts = {}
  for (const m of EHS_METRICS) {
    const v = q?.[m.col]
    const c = cuts?.[m.key]
    if (!Number.isFinite(v) || (m.positive && !(v > 0)) || !c) { parts[m.key] = { value: Number.isFinite(v) ? v : null, points: 0 }; continue }
    const points = m.higher ? (v >= c[2] ? 3 : v >= c[1] ? 2 : v >= c[0] ? 1 : 0) : (v <= c[0] ? 3 : v <= c[1] ? 2 : v <= c[2] ? 1 : 0)
    parts[m.key] = { value: v, points }
  }
  return { parts, total: Object.values(parts).reduce((a, p) => a + p.points, 0) }
}

/** Cut points from a benchmark's rows: per metric, trim 5% each side (negatives dropped for P/E and forward P/E); then the totals' quartiles for the letter. */
export function ehsCuts(rows) {
  const cuts = {}
  for (const m of EHS_METRICS) {
    const s = rows.map((r) => r[m.col]).filter((v) => Number.isFinite(v) && (!m.positive || v > 0)).sort((a, b) => a - b)
    const k = Math.floor(s.length * 0.05)
    const t = s.slice(k, s.length - k)
    if (t.length >= 4) cuts[m.key] = [quantile(t, 0.25), quantile(t, 0.5), quantile(t, 0.75)]
  }
  const totals = rows.map((r) => ehsScore(r, cuts).total).sort((a, b) => a - b)
  cuts.total = totals.length ? [quantile(totals, 0.25), quantile(totals, 0.5), quantile(totals, 0.75)] : null
  return cuts
}

export const ehsLetter = (total, cuts) => (!cuts?.total ? null : total >= cuts.total[2] ? 'A' : total >= cuts.total[1] ? 'B' : total >= cuts.total[0] ? 'C' : 'D')
