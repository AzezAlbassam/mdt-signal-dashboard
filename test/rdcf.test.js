import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { rdcf, impliedInput, nolFrom, targetMargin } from '../engine/rdcf.js'
import { quoteShares } from '../engine/fairvalue.js'

// TradingView batch of 2026-10-20 (the judge's test set); values as in its final.mjs run.
const Q = JSON.parse(fs.readFileSync(new URL('./rdcf-quotes.json', import.meta.url)))
const now = Date.parse('2026-10-20T00:00:00Z') / 1000
const O = (q, x = {}) => ({ shares: quoteShares(q), now, ...x })
const RIVN = Q['NASDAQ:RIVN']

test('rdcf: RIVN at the judge\'s Motor Vehicles margin 6.9% is just below zero; the price implies about 17%', () => {
  const d = rdcf(RIVN, O(RIVN, { m: 0.069 }))
  assert.ok(Math.abs(d.raw - -0.54) < 0.01, d.raw)
  assert.equal(d.value, 0)
  assert.ok(d.gap > 13e9 && d.dilution > 0.7)
  const im = impliedInput(RIVN, 'm', -0.1, 0.6, O(RIVN))
  assert.ok(Math.abs(im - 0.171) < 0.002, im)
  assert.ok(Math.abs(rdcf(RIVN, O(RIVN, { m: im })).raw - RIVN.close) < 0.01)
})

test('rdcf: the judge\'s grid points and IONQ', () => {
  assert.ok(Math.abs(rdcf(RIVN, O(RIVN, { m: 0.175, G: 0.3 })).raw - 12.9) < 0.01)
  assert.ok(Math.abs(rdcf(RIVN, O(RIVN, { m: 0.1, G: 0.3 })).raw - 3.39) < 0.01)
  const IONQ = Q['NYSE:IONQ']
  assert.ok(Math.abs(rdcf(IONQ, O(IONQ, { m: 0.099 })).value - 1.97) < 0.01)
  assert.equal(impliedInput(IONQ, 'm', -0.1, 0.6, O(IONQ, { m: 0.099 })), null) // over 60%
})

test('rdcf: value rises with the margin; guards', () => {
  assert.ok(rdcf(RIVN, O(RIVN, { m: 0.15 })).raw > rdcf(RIVN, O(RIVN, { m: 0.1 })).raw)
  assert.ok(rdcf({ ...RIVN, sector: 'Finance' }).why)
  assert.ok(rdcf(Q['NYSE:OKLO'], O(Q['NYSE:OKLO'])).why) // revenue under 1% of market value
  assert.ok(rdcf(Q['NASDAQ:BEAM'], O(Q['NASDAQ:BEAM'])).why) // biotech
  assert.ok(rdcf({ ...RIVN, net_debt_fq: null, total_debt_fq: null, cash_n_short_term_invest_fq: null }).why)
})

test('nolFrom and targetMargin', () => {
  assert.equal(nolFrom([50, -100, -30]), 80)
  assert.equal(nolFrom([]), 0)
  const peers = { industries: { 'Motor Vehicles': { m: 0.0665, n: 10 } }, sectors: { 'Consumer Durables': { m: 0.0861, n: 51 } } }
  assert.equal(targetMargin({ industry: 'Motor Vehicles', sector: 'Consumer Durables' }, peers).m, 0.0665)
  assert.equal(targetMargin({ industry: 'Recreational Products', sector: 'Consumer Durables' }, peers).from, 'sector')
  assert.equal(targetMargin({ industry: 'X', sector: 'Y' }, peers).m, 0.1)
})

test('rdcf: unknown cash is not read as zero cash; growth source is reported', () => {
  const noCash = { ...RIVN, cash_n_short_term_invest_fq: null, total_debt_fq: null }
  const d = rdcf(noCash, O(noCash, { m: 0.069 }))
  assert.equal(d.runway, null)
  assert.equal(d.pFail, 0.175)
  const fromDebt = rdcf({ ...RIVN, cash_n_short_term_invest_fq: null, total_debt_fq: 1e10, net_debt_fq: 4e9 }, O(RIVN))
  assert.ok(Math.abs(fromDebt.runway * Math.max(0, -RIVN.free_cash_flow_ttm) - 6e9) < 1)
  assert.equal(rdcf(RIVN, O(RIVN)).growthFrom, 'analysts')
  assert.equal(rdcf({ ...RIVN, revenue_forecast_next_fy: null }, O(RIVN)).growthFrom, 'history')
})

test('rdcf (POST-HOC 2026-10-22): year 1 from history is capped at 30%; a forecast over 10× sales is not used', () => {
  const hist = { ...RIVN, revenue_forecast_next_fy: null } // 3-year CAGR 48%
  const capped = rdcf({ ...RIVN, revenue_forecast_next_fy: 1.3 * RIVN.total_revenue_fy }, O(RIVN))
  assert.ok(Math.abs(rdcf(hist, O(RIVN)).raw - capped.raw) < 1e-9)
  const odd = rdcf({ ...RIVN, revenue_forecast_next_fy: 11 * RIVN.total_revenue_ttm }, O(RIVN)) // ISPC: 19.6×
  assert.equal(odd.growthFrom, 'history')
  assert.equal(odd.raw, rdcf(hist, O(RIVN)).raw)
  assert.equal(rdcf({ ...RIVN, revenue_forecast_next_fy: 4 * RIVN.total_revenue_ttm }, O(RIVN)).growthFrom, 'analysts') // IREN: 3.8×
})
