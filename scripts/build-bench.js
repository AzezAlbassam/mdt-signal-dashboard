// Market and industry benchmarks for the snowflake and the Earnings Hub score (progress/REDESIGN-PLAN.md
// §1.1–1.2), from screener snapshots of the S&P 500 (US) and the TASI members (Tadawul main market:
// every Tadawul stock except Nomu, whose codes start with 9).
//   node scripts/build-bench.js [data/bench/<date>-sp500.json] [data/bench/<date>-ksa.json] → pages/bench.json
// As SWS's industry_averages.markdown: medians, not weighted averages, so large caps do not skew them.
// P/E, ROA and past EPS growth: median over profitable members; P/B: median; forecast EPS and revenue
// growth (next FY, SWS's growth formula): median over profitable members with an estimate (revenue
// leaves out Finance, whose revenue bases differ); dividend-yield quartiles over payers below 12%.
// One row per company (share classes with the same net income and revenue count once). Industries
// need ≥ 5 members, else the page falls back to the sector, as SWS falls back to a wider region.
import fs from 'node:fs'
import { ehsCuts } from '../engine/ehs.js'
import { swsGrowth } from '../engine/snowflake.js'

const [spF = 'data/bench/2026-11-08-sp500.json', saF = 'data/bench/2026-11-08-ksa.json'] = process.argv.slice(2)
const fin = Number.isFinite
const pos = (x) => fin(x) && x > 0
const median = (a) => { const s = a.filter(fin).sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
const q = (s, p) => { const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo) }
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null)

const prof = (rows) => rows.filter((r) => pos(r.net_income_ttm))
function group(rows) {
  return {
    n: rows.length,
    pe: r4(median(prof(rows).map((r) => r.price_earnings_ttm).filter(pos))),
    pb: r4(median(rows.map((r) => r.price_book_fq).filter(pos))),
    eg1: r4(median(prof(rows).map((r) => r.earnings_per_share_diluted_yoy_growth_ttm / 100))),
    roa: r4(median(prof(rows).map((r) => r.return_on_assets))),
  }
}

function market(all, savings) {
  const seen = new Set()
  const rows = all.filter((r) => { const k = `${r.net_income_ttm}|${r.total_revenue_fy}`; return seen.has(k) ? false : (seen.add(k), true) })
  const y = rows.map((r) => r.dividends_yield).filter((v) => pos(v) && v < 12).sort((a, b) => a - b)
  const by = (key) => {
    const g = {}
    for (const r of rows) if (r[key]) (g[r[key]] ??= []).push(r)
    return Object.fromEntries(Object.entries(g).filter(([, rs]) => rs.length >= 5).sort().map(([k, rs]) => [k, group(rs)]))
  }
  return {
    n: rows.length,
    ...group(rows),
    eg: r4(median(prof(rows).map((r) => swsGrowth(r.earnings_per_share_fy, r.earnings_per_share_forecast_next_fy)))),
    rg: r4(median(prof(rows).filter((r) => r.sector !== 'Finance').map((r) => swsGrowth(r.total_revenue_fy, r.revenue_forecast_next_fy)))),
    yP25: r4(q(y, 0.25)),
    yP75: r4(q(y, 0.75)),
    savings, // ponytail: a fixed low-risk rate per market (10-year yield), not SWS's savings + CPI series
    volMedian: r4(median(rows.map((r) => r['Volatility.W']))),
    industries: by('industry'),
    sectors: by('sector'),
    ehs: ehsCuts(rows),
  }
}

const sp = JSON.parse(fs.readFileSync(spF, 'utf8'))
const sa = JSON.parse(fs.readFileSync(saF, 'utf8'))
const tasi = sa.rows.filter((r) => !/^TADAWUL:9/.test(r.symbol))
const out = { asOf: sp.asOf, us: market(sp.rows, 0.045), sa: market(tasi, 0.05) }
fs.writeFileSync('pages/bench.json', JSON.stringify(out))
for (const m of ['us', 'sa']) console.log(`${m}: ${out[m].n} stocks, P/E ${out[m].pe}, P/B ${out[m].pb}, EPS growth next FY ${out[m].eg}, revenue ${out[m].rg}, yield P25/P75 ${out[m].yP25}/${out[m].yP75}, ${Object.keys(out[m].industries).length} industries, ${Object.keys(out[m].sectors).length} sectors, EHS total cuts ${JSON.stringify(out[m].ehs.total)}`)
