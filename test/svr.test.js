import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addMonths } from '../engine/fairvalue.js'
import { steady, svrHistory } from '../engine/svr.js'

const flat = (from, to, c) => {
  const m = new Map()
  for (let k = from; k <= to; k = addMonths(k, 1)) m.set(k, c)
  return m
}
const unix = (iso) => Date.parse(iso) / 1000

// Newest first, as TradingView's *_h columns: 8 quarters to June 2021; the fiscal year ends in
// December (the quarters to Dec 2020 sum to 40, the latest year's revenue).
const h = (over = {}) => ({
  fiscal_period_end_fq: unix('2021-06-30T00:00:00Z'),
  total_revenue_fq_h: [12, 11, 10, 10, 10, 10, 9, 9].map((x) => x * 1e7),
  net_income_fq_h: [20, 20, 20, 20, 20, 20, 20, 20],
  earnings_per_share_diluted_fq_h: [2, 2, 2, 2, 2, 2, 2, 2],
  total_revenue_fy_h: [40, 30, 20].map((x) => x * 1e7),
  net_income_fy_h: [80, 80, 80],
  earnings_per_share_diluted_fy_h: [8, 8, 8],
  ...over,
})

test('steady: a share count that jumps and comes back is dropped, steady dilution kept', () => {
  assert.deepEqual(steady([10, 2000, 10, 12, 14, 17]), [10, null, 10, 12, 14, 17])
  // MCHP, newest first: preferred dividends distort three quarters; 679 (1.26× off) is near two of its three neighbours.
  assert.deepEqual(steady([626, 679, 980, 1635, 216, 531, 538, 542]), [626, 679, null, null, null, 531, 538, 542])
})

test('steady: nothing older than a 2.5× jump (before a SPAC merger)', () => {
  // RKLB, newest first: 450M after the merger, 228M the merger quarter's average, 79M the legacy count.
  assert.deepEqual(steady([470, 465, 456, 450, 228, 79, 79, 79]), [470, 465, 456, 450, null, null, null, null])
})

test('SVR: at each quarter end, close × shares ÷ (that quarter × 4); fiscal years before the quarters', () => {
  const r = svrHistory(h(), flat('2017-01', '2021-10', 40))
  const at = (m) => r.points.find((p) => p.m === m)
  assert.equal(at('2021-06').v, (40 * 10) / 48e7) // newest quarter, 12 × 4
  assert.equal(at('2021-03').v, (40 * 10) / 44e7)
  assert.equal(at('2019-09').v, (40 * 10) / 36e7) // oldest quarter
  // Fiscal years end in December (Dec 2020); 2020 and 2019 fall inside the quarters, 2018 does not.
  assert.deepEqual(r.points.filter((p) => p.fy).map((p) => [p.m, p.v]), [['2018-12', (40 * 10) / 20e7]])
  assert.equal(r.points[0].m, '2018-12')
  assert.equal(r.avg4, ((40 * 10) / 48e7 + (40 * 10) / 44e7 + (40 * 10) / 40e7 + (40 * 10) / 40e7) / 4)
})

test('SVR: no point without a close or with a share count off its neighbours; no fiscal years when no four quarters match', () => {
  const r = svrHistory(h({ earnings_per_share_diluted_fq_h: [2, 2, 2, 0.01, 2, 2, 2, 2], total_revenue_fy_h: [55e7, 30e7, 20e7] }), flat('2020-01', '2021-10', 40))
  assert.equal(r.points.find((p) => p.m === '2020-09'), undefined) // EPS near zero
  assert.equal(r.points.find((p) => p.m === '2019-12'), undefined) // no close before 2020
  assert.equal(r.points.some((p) => p.fy), false) // 55 is no four-quarter sum
  assert.equal(svrHistory({ total_revenue_fq_h: [1] }, new Map()), null)
})

test('SVR: the red line averages the last four quarters by date, not the first four points', () => {
  // No close for the two newest quarter ends (Mar, Jun 2021): the average is of Dec and Sep 2020, not reaching back to 2020-06.
  const r = svrHistory(h(), flat('2017-01', '2021-02', 40))
  assert.equal(r.avg4, (40 * 10) / 40e7)
  // Revenue under 10 million a year: no point.
  assert.equal(svrHistory(h({ total_revenue_fq_h: [2e6, 2e6, 1e7, 1e7, 1e7, 1e7, 1e7, 1e7] }), flat('2017-01', '2021-10', 40)).points.some((p) => p.m === '2021-06'), false)
})
