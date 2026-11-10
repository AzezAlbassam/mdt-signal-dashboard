// liveDcf year-1 growth = analysts' forecast for the fiscal year in progress ÷ the last reported fiscal year, applied to the
// last twelve months' free cash flow. Late in a fiscal year most of that growth is already inside the twelve months.
import fs from 'node:fs'
import { R } from './lib.mjs'
import { P } from './page.mjs'
const rows = { ...JSON.parse(fs.readFileSync(`${R}/test/fixtures/snowflake-quotes.json`)).data, ...JSON.parse(fs.readFileSync(`${R}/test/rdcf-quotes.json`)), 'NASDAQ:MU': JSON.parse(fs.readFileSync(`${R}/test/pages/mu-fixture.json`)).row }
const YR = 365.25 * 86400
for (const [s, q] of Object.entries(rows)) {
  const a = P.analysts(q).rev; if (a == null || !(q.total_revenue_ttm > 0)) continue
  const left = (q.fiscal_period_end_fy + YR - q.fiscal_period_end_fq) / YR // years from the last quarter to the end of the forecast year
  const already = q.total_revenue_ttm / q.total_revenue_fy - 1
  const rest = q.revenue_forecast_next_fy / q.total_revenue_ttm - 1
  const d = P.liveDcf(q, null)
  console.log(`${s.padEnd(14)} forecast yr ÷ last yr ${(100 * a).toFixed(1).padStart(7)}%   already in the 12 months ${(100 * already).toFixed(1).padStart(7)}%   left to the forecast ${(100 * rest).toFixed(1).padStart(7)}% over ${left.toFixed(2)} yr   page g1 ${d ? (100 * d.g1).toFixed(0) + '%' : '(no FCF)'}`)
}
// same company seen after Q1 and after Q3 of a year analysts expect +40% (acquisition closed in January): the FCF base moves, g1 does not
const base = { close: 100, market_cap_basic: 100e9, total_shares_outstanding: 1e9, currency: 'USD', description: '', sector: 'X', beta_5_year: 1, total_revenue_fy: 100, revenue_forecast_next_fy: 140 }
for (const [lab, fcf] of [['after Q1 (12-month FCF 1.10)', 1.1e9], ['after Q3 (12-month FCF 1.30)', 1.3e9], ['after Q4 (FCF 1.40, forecast now +8%)', 1.4e9]]) {
  const q = lab.includes('Q4') ? { ...base, total_revenue_fy: 140, revenue_forecast_next_fy: 151.2, free_cash_flow_ttm: fcf } : { ...base, free_cash_flow_ttm: fcf }
  const d = P.liveDcf(q, null); console.log(lab.padEnd(40), 'g1', d.g1.toFixed(2), 'DCF', d.value.toFixed(1))
}
