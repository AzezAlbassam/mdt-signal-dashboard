// DCF year-1 growth: the page's (forecast fiscal year ÷ last reported fiscal year) against the growth
// still ahead of the last twelve months (forecast fiscal year ÷ TTM revenue), and the effect on the blend.
import fs from 'node:fs'
const D = new URL('./', import.meta.url).pathname
const quotes = JSON.parse(fs.readFileSync(D + 'data/quotes.json', 'utf8')).data
const page = JSON.parse(fs.readFileSync(D + 'out/page.json', 'utf8'))
const dcf = (fcf0, g1raw, r, fadeFrom) => { const g1 = Math.min(0.6, Math.max(-0.2, g1raw)); const G = fadeFrom ?? Math.min(g1, 0.25); let cf = fcf0 * (1 + g1), pv = cf / (1 + r); for (let t = 2; t <= 10; t += 1) { cf *= 1 + G + ((0.025 - G) * (t - 2)) / 8; pv += cf / (1 + r) ** t } return pv + (cf * 1.025) / (r - 0.025) / (1 + r) ** 10 }
const W = { 'Mature / profitable': { pe: 0.3, dcf: 0.3, ev: 0.25 }, 'Growth / tech': { pe: 0.2, peg: 0.3, dcf: 0.3, ps: 0.2 }, 'Heavy / cyclical': { ev: 0.4, pen: 0.3 }, Financial: { pe: 0.5, pbj: 0.5 }, 'Unprofitable growth': { ps: 1 } }
const blend = (v, prof, wts) => { let used = Object.keys(W[prof]).filter((m) => v[m] > 0 && wts[m] > 0).map((m) => [m, v[m], W[prof][m]]); if (used.length >= 3) { const s = [...used].sort((a, b) => a[1] - b[1]); const half = s.reduce((a, x) => a + x[2], 0) / 2; let c = 0; const wm = s.find((x) => (c += x[2]) >= half - 1e-12)[1]; used = used.filter((x) => x[1] <= 3 * wm && x[1] >= wm / 3) } return used.length ? used.reduce((a, x) => a + x[1] * x[2], 0) / used.reduce((a, x) => a + x[2], 0) : null }
const out = {}
console.log('symbol        qtrs of forecast FY reported | g1 page | F÷TTM−1 | 3y rev CAGR | DCF page → F÷TTM → fade from min(g1, 3y CAGR, 25%) | weight | fair page → F÷TTM → fade3y')
for (const [sym, p] of Object.entries(page)) {
  const q = quotes[sym]
  if (!p.dcf || p.dcf.g1 == null) continue
  const e = new Date(q.fiscal_period_end_fq * 1000), y = new Date(q.fiscal_period_end_fy * 1000)
  const done = Math.round(((e.getUTCFullYear() - y.getUTCFullYear()) * 12 + e.getUTCMonth() - y.getUTCMonth()) / 3)
  const gF = q.revenue_forecast_next_fy / q.total_revenue_fy - 1, gT = q.revenue_forecast_next_fy / q.total_revenue_ttm - 1
  const a = dcf(p.dcf.fcf0, gF, p.dcf.r), b = dcf(p.dcf.fcf0, gT, p.dcf.r)
  const g3 = Math.max(-0.05, Math.min(0.25, p.st.revG ?? 0)), c = dcf(p.dcf.fcf0, gF, p.dcf.r, Math.min(Math.min(0.6, Math.max(-0.2, gF)), g3, 0.25))
  const w = p.weights.dcf ?? 0
  const fb = w ? blend({ ...p.values, dcf: b }, p.profile, p.weights) : p.fair, fc = w ? blend({ ...p.values, dcf: c }, p.profile, p.weights) : p.fair
  out[sym] = { quartersOfForecastYearReported: done, g1Page: p.dcf.g1, forecastOverTtm: gT, rev3y: p.st.revG, dcfPage: a, dcfForecastOverTtm: b, dcfFadeFrom3y: c, weight: w, fairPage: p.fair, fairForecastOverTtm: fb, fairFadeFrom3y: fc }
  console.log(`${sym.padEnd(13)} ${done} | ${(100 * gF).toFixed(1)}%${gF > 0.6 ? ' (cap 60)' : ''} | ${(100 * gT).toFixed(1)}% | ${(100 * (p.st.revG ?? NaN)).toFixed(1)}% | ${a.toFixed(2)} (page ${p.dcf.value.toFixed(2)}) → ${b.toFixed(2)} → ${c.toFixed(2)} | ${w} | ${p.fair?.toFixed(2) ?? '—'} → ${fb?.toFixed(2) ?? '—'} → ${fc?.toFixed(2) ?? '—'}  (price ${q.close})`)
}
fs.writeFileSync(D + 'out/dcf-alt.json', JSON.stringify(out, null, 1))
// Trim cliff: MU's P/S value against the ⅓-of-median line
const mu = page['NASDAQ:MU']
console.log(`\nMU trim line: weighted median ${mu.med.toFixed(2)}, ⅓ = ${(mu.med / 3).toFixed(2)}, P/S value ${mu.values.ps.toFixed(2)} (${(100 * (mu.values.ps / (mu.med / 3) - 1)).toFixed(1)}% above the line); fair with P/S ${mu.fair.toFixed(2)}, without ${((0.2 * mu.values.pe + 0.3 * mu.values.peg + 0.3 * mu.values.dcf) / 0.8).toFixed(2)}`)
const ap = page['NASDAQ:AAPL']
console.log(`AAPL without the Lynch method: ${((0.2 * ap.values.pe + 0.3 * ap.values.dcf + 0.2 * ap.values.ps) / 0.7).toFixed(2)}; O with P/E only ${page['NYSE:O'].values.pe.toFixed(2)}; O price÷FCF ${(59.5 / (quotes['NYSE:O'].free_cash_flow_ttm / quotes['NYSE:O'].total_shares_outstanding)).toFixed(1)}`)
