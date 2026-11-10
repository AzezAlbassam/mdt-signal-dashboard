import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageFns } from './lib/page-fns.js'

const P = pageFns(['beta5', 'analysts', 'revAhead', 'liveDcf'])
const YR = 365.25 * 86400
const fyEnd = Date.UTC(2025, 11, 31) / 1000
const base = { close: 100, market_cap_basic: 100e9, total_shares_outstanding: 1e9, currency: 'USD', description: '', sector: 'X', beta_5_year: 1,
  fiscal_period_end_fy: fyEnd, total_revenue_fy: 100, revenue_forecast_next_fy: 140 }

// Audit 1.2: a company growing a steady 40% a year (quarterly revenue × 1.4^¼ each quarter), seen after its
// Q1, Q3 and Q4 reports. The twelve months' revenue and free cash flow grow with the reported quarters; the
// growth the DCF starts from stays 40% and the value moves only with the twelve months' cash flow.
test('DCF year-1 growth is what is still ahead of the twelve months, a year\'s worth', () => {
  const qr = (k) => 25 * 1.4 ** (k / 4) // quarter k's revenue; quarters 1–4 are fiscal 2025
  const ttm = (k) => qr(k) + qr(k - 1) + qr(k - 2) + qr(k - 3)
  const after = (k, o = {}) => P.liveDcf({ ...base, total_revenue_fy: ttm(4), revenue_forecast_next_fy: ttm(8), fiscal_period_end_fy: fyEnd,
    fiscal_period_end_fq: fyEnd + (k - 4) * YR / 4, total_revenue_ttm: ttm(k), free_cash_flow_ttm: 1e8 * ttm(k), ...o }, null)
  const q1 = after(5); const q3 = after(7)
  const q4 = after(8, { fiscal_period_end_fy: fyEnd + YR, total_revenue_fy: ttm(8), revenue_forecast_next_fy: ttm(12) })
  for (const d of [q1, q3, q4]) assert.ok(Math.abs(d.g1 - 0.4) < 0.002, `g1 ${d.g1}`)
  assert.ok(Math.abs(q4.value / q3.value - ttm(8) / ttm(7)) < 0.002, `Q3 ${q3.value.toFixed(1)} → Q4 ${q4.value.toFixed(1)}: only the cash flow's own growth`)
  assert.ok(q3.value > q1.value)
})

test('AAPL after Q3, and right after a fiscal year closes', () => {
  const d = (y, m) => Date.UTC(y, m, 30) / 1000
  const aapl = P.revAhead({ ...base, fiscal_period_end_fy: d(2025, 8), fiscal_period_end_fq: d(2026, 5), total_revenue_fy: 416.2, total_revenue_ttm: 466.8, revenue_forecast_next_fy: 477.6 })
  assert.ok(Math.abs(aapl - ((477.6 / 466.8) ** 4 - 1)) < 0.002, `AAPL ${aapl}`) // 9.6%, not 2.3% nor 14.8%
  const fresh = P.revAhead({ ...base, fiscal_period_end_fy: fyEnd, fiscal_period_end_fq: fyEnd + YR, total_revenue_ttm: 140 })
  assert.ok(Math.abs(fresh - 0.4) < 1e-9, 'forecast year not moved on yet: forecast ÷ last year')
})
test('without the twelve months it falls back to forecast year ÷ last year', () => {
  assert.ok(Math.abs(P.revAhead({ ...base, fiscal_period_end_fq: fyEnd }) - 0.4) < 1e-9)
})
