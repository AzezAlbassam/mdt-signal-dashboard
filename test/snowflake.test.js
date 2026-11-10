import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { snowflake, swsGrowth, SNOW_AXES } from '../engine/snowflake.js'
import { ehsScore, ehsCuts, ehsLetter } from '../engine/ehs.js'

// TradingView rows of 2026-11-08 (scripts/fixture-from-transcript.js), not typed by hand.
const Q = JSON.parse(fs.readFileSync(new URL('./fixtures/snowflake-quotes.json', import.meta.url), 'utf8')).data
const bench = { pe: 25, eg: 0.1, rg: 0.06, yP25: 1.5, yP75: 4, savings: 0.045, industries: {
  'Telecommunications Equipment': { pe: 30, pb: 8, eg1: 0.1, roa: 8 },
  'Beverages: Non-Alcoholic': { pe: 24, pb: 9, eg1: 0.06, roa: 9 },
  'Major Banks': { pe: 13, pb: 1.8, eg1: 0.12, roa: 1.2 },
} }
const st = (s, id) => SNOW_AXES.flatMap((a) => s.axes[a].checks).find((c) => c.id === id).status

test('SWS growth: change over the mean of absolute values, across a loss', () => {
  assert.equal(swsGrowth(-2, 2), 2)
  assert.equal(swsGrowth(100, 110), 10 / 105)
  assert.equal(swsGrowth(0, 0), null)
})

test('snowflake on AAPL: value fails, health passes where data exists, dividend not notable', () => {
  const s = snowflake(Q['NASDAQ:AAPL'], bench, 300)
  assert.equal(st(s, 'V1'), 'fail') // 342.37 is not 20% under 300
  assert.equal(st(s, 'V3'), 'fail') // P/E 38.1 > 25
  assert.equal(st(s, 'P4'), 'pass') // ROE 142%
  assert.equal(st(s, 'H1'), 'pass') // 173.9B > 169.9B
  assert.equal(st(s, 'H5'), 'pass') // OCF 145B > 20% of 85.8B debt
  assert.equal(st(s, 'H6'), 'na') // no interest cover and no rate: SWS too says "insufficient data"
  assert.equal(st(s, 'D1'), 'fail') // 0.31% < 1.5%
  assert.equal(st(s, 'D3'), 'fail') // not notable, so fails by default
  for (const a of SNOW_AXES) assert.ok(s.axes[a].score <= s.axes[a].judged && s.axes[a].judged <= 6)
})

test('snowflake: banks get only the leverage check on health', () => {
  const s = snowflake(Q['NYSE:JPM'], bench, null)
  assert.equal(s.bank, true)
  assert.equal(s.axes.health.judged, 1)
  assert.equal(st(s, 'B1'), 'pass') // 13.7× ≤ 20×
  assert.equal(st(s, 'F3'), 'na') // bank revenue bases differ
  assert.equal(st(s, 'V1'), 'na') // no fair value given
})

test('snowflake: loss-maker uses cash runway and fails P/E checks', () => {
  const s = snowflake(Q['NASDAQ:RIVN'], bench, null)
  assert.equal(st(s, 'V3'), 'fail')
  assert.equal(st(s, 'H5'), 'pass') // 5.5B cash ÷ 4.19B burn = 1.31 years
  assert.equal(st(s, 'D5'), 'fail') // no dividend
})

test('snowflake: KO dividend history and REIT payout limit', () => {
  const ko = snowflake(Q['NYSE:KO'], bench, null)
  assert.equal(st(ko, 'D1'), 'pass')
  assert.equal(st(ko, 'D3'), 'pass') // 20 years paid, no cut
  assert.equal(st(ko, 'D4'), 'pass')
  assert.equal(st(ko, 'D5'), 'pass') // 61.9%
  const o = snowflake(Q['NYSE:O'], bench, null)
  assert.equal(o.reit, true)
  assert.equal(st(o, 'D5'), 'fail') // 224% > 100%
  assert.equal(st(o, 'H1'), 'fail') // no current assets: current ratio 0.52
})

test('snowflake: Aramco payout falls back to the fiscal year when ttm reads 0', () => {
  const s = snowflake(Q['TADAWUL:2222'], { ...bench, yP25: 2, yP75: 5 }, null)
  const d5 = SNOW_AXES.flatMap((a) => s.axes[a].checks).find((c) => c.id === 'D5')
  assert.equal(d5.value, Q['TADAWUL:2222'].dividend_payout_ratio_fy)
  assert.equal(d5.status, 'fail') // 92.6% ≥ 90%
  assert.equal(st(s, 'D3'), 'fail') // 7 years of dividends only
})

test('EHS: quartile points, negatives score 0, letter on the curve', () => {
  const rows = Object.values(Q)
  const cuts = ehsCuts(rows)
  for (const k of ['revG', 'epsG', 'ps']) assert.ok(cuts[k][0] <= cuts[k][1] && cuts[k][1] <= cuts[k][2])
  const r = ehsScore(Q['NASDAQ:RIVN'], cuts)
  assert.equal(r.parts.pe.points, 0) // no P/E for a loss-maker
  assert.ok(r.total >= 0 && r.total <= 15)
  assert.ok(['A', 'B', 'C', 'D'].includes(ehsLetter(r.total, cuts)))
  const fixed = { revG: [5, 10, 20], epsG: [5, 10, 20], pe: [15, 20, 30], fpe: [15, 20, 30], ps: [2, 4, 8] }
  const top = ehsScore({ total_revenue_yoy_growth_ttm: 25, earnings_per_share_diluted_yoy_growth_ttm: 25, price_earnings_ttm: 10, non_gaap_price_to_earnings_per_share_forecast_next_fy: 10, price_sales_current: 1 }, fixed)
  assert.equal(top.total, 15)
})

// Audit 1.8 (POST-HOC 2026-11-10): missing columns are no data, not "fail"; the runway checks are for loss-makers.
test('snowflake: missing histories are no data; a profitable company with negative FCF is judged on debt cover', async () => {
  const { snowflake } = await import('../engine/snowflake.js')
  const b = { pe: 20, eg: 0.1, rg: 0.06, yP25: 1, yP75: 3, savings: 0.045, industries: {}, sectors: {} }
  const base = { close: 100, earnings_per_share_diluted_ttm: 4, price_earnings_ttm: 25, dividends_yield: 3.5, dividend_payout_ratio_ttm: 60, total_debt_fq: 1e9,
    cash_f_operating_activities_ttm: 5e8, interst_cover_ttm: 8, free_cash_flow_ttm: -2e9, cash_n_short_term_invest_fq: 1e9, net_income_fy_h: [3e9, 3e9, 3e9] }
  const ck = (q, id) => Object.values(snowflake(q, b).axes).flatMap((a) => a.checks).find((c) => c.id === id).status
  assert.equal(ck(base, 'D3'), 'na') // notable payer, no dividend history column
  assert.equal(ck(base, 'D4'), 'na')
  assert.equal(ck({ ...base, dps_common_stock_prim_issue_fy_h: Array(11).fill(1) }, 'D3'), 'pass')
  assert.equal(ck(base, 'H5'), 'pass') // debt cover 0.5 > 0.2, not a 0.5-year runway
  assert.equal(ck(base, 'H6'), 'pass') // interest cover 8
  assert.equal(ck({ ...base, earnings_per_share_diluted_ttm: -1, net_income_fy_h: [-1e9, -1e9, -1e9] }, 'H5'), 'fail') // a loss-maker: runway 0.5 years
  const noEps = { ...base }; delete noEps.earnings_per_share_diluted_ttm
  assert.equal(ck(noEps, 'V3'), 'na')
  assert.equal(ck({ ...base, earnings_per_share_diluted_fy_h: [4, 3, 2, 1, 0.5, -1], earnings_per_share_diluted_yoy_growth_ttm: 20 }, 'P3'), 'na') // a loss five years ago
})
