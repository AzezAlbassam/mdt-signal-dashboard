import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageFns } from './lib/page-fns.js'

const P = pageFns(['beta5', 'analysts', 'revAhead', 'liveDcf', 'REIT', 'REIT_W', 'liveFairValues'])
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
  // v29 (audit 2.2): a quarter left weights the annualised rest (9.6%) by ¼ and the forecast year (14.8%) by ¾
  assert.ok(Math.abs(aapl - (0.25 * ((477.6 / 466.8) ** 4 - 1) + 0.75 * (477.6 / 416.2 - 1))) < 0.002, `AAPL ${aapl}`) // 92 days ≈ ¼
  // KO in the 2026-11-10 snapshot (Q2 2026, half a year left): the forecast year is 1.5% under the twelve
  // months, −2.9% annualised, against +3.0% for the year over FY2025; weighted by the half year left: 0.0%
  const ko = P.revAhead({ ...base, fiscal_period_end_fy: 1767139200, fiscal_period_end_fq: 1782777600, total_revenue_fy: 48.392e9, total_revenue_ttm: 50.569e9, revenue_forecast_next_fy: 49.826e9 })
  assert.ok(Math.abs(ko) < 0.002, `KO ${ko}`)
  const fresh = P.revAhead({ ...base, fiscal_period_end_fy: fyEnd, fiscal_period_end_fq: fyEnd + YR, total_revenue_ttm: 140 })
  assert.ok(Math.abs(fresh - 0.4) < 1e-9, 'forecast year not moved on yet: forecast ÷ last year')
})
test('without the twelve months it falls back to forecast year ÷ last year', () => {
  assert.ok(Math.abs(P.revAhead({ ...base, fiscal_period_end_fq: fyEnd }) - 0.4) < 1e-9)
})

// Audit 2.2 (v29, untested by design): the fade after year 1 starts at the 3-year revenue growth when that is lower.
test('DCF fades from min(year 1, 3-year revenue growth, 25%)', () => {
  const q = { ...base, fiscal_period_end_fq: fyEnd, total_revenue_ttm: 100, free_cash_flow_ttm: 5e9, revenue_forecast_next_fy: 134.2 }
  const plain = P.liveDcf(q, null)
  const xom = P.liveDcf(q, null, -0.03) // a rebound year after shrinking revenue
  assert.equal(plain.G, 0.25)
  assert.equal(xom.G, -0.03)
  assert.ok(xom.value < 0.6 * plain.value, `${xom.value} vs ${plain.value}`)
  assert.equal(P.liveDcf(q, null, -0.4).G, -0.05, 'the 3-year rate is held at −5%')
})

test('REITs: EV/EBITDA, P/S and 5-year P/E, no P/B from ROE; other financials keep that leg only up to 4× book', () => {
  const values = { pe: 50, peg: null, dcf: null, graham: null, ev: 60, ps: 55, pb: null, pbj: null, cash: null, pen: 58 }
  const fv = { profile: 'Financial', values }
  const q = { ...base, close: 59.5, price_book_fq: 1.4, return_on_equity: 3.45, earnings_per_share_diluted_ttm: 1 }
  const reit = P.liveFairValues(fv, { ...q, industry: 'Real Estate Investment Trusts' }, [])
  assert.equal(reit.reit, true)
  assert.equal(reit.values.pbj, null)
  assert.ok(Math.abs(reit.fair - (0.5 * 60 + 0.25 * 55 + 0.25 * 58)) < 1e-9, `REIT fair ${reit.fair}`)
  const bank = P.liveFairValues(fv, { ...q, industry: 'Major Banks', return_on_equity: 15 }, [])
  assert.ok(bank.values.pbj > 0, 'P/B 1.4: the leg stays')
  const visa = P.liveFairValues(fv, { ...q, industry: 'Finance/Rental/Leasing', return_on_equity: 50, price_book_fq: 15 }, [])
  assert.equal(visa.values.pbj, null, 'P/B 15: the leg is capped at 4× book and says nothing')
  assert.equal(visa.fair, 50, 'valued on its own P/E history')
})
