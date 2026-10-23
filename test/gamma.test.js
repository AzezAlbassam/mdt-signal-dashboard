import test from 'node:test'
import assert from 'node:assert/strict'
import { bsPrice, bsGamma, impliedVol, exposures, YEAR_MIN } from '../engine/gamma.js'

test('Black-Scholes reference value and put-call parity at r = 0', () => {
  assert.ok(Math.abs(bsPrice(true, 100, 100, 1, 0.2) - 7.965567) < 1e-5)
  for (const K of [90, 100, 110]) {
    assert.ok(Math.abs(bsPrice(true, 100, K, 0.1, 0.3) - bsPrice(false, 100, K, 0.1, 0.3) - (100 - K)) < 1e-9)
  }
})

test('gamma is the second derivative of the price', () => {
  const S = 7800, K = 7810, T = 90 / YEAR_MIN, v = 0.15, h = 0.05
  const fd = (bsPrice(true, S + h, K, T, v) - 2 * bsPrice(true, S, K, T, v) + bsPrice(true, S - h, K, T, v)) / (h * h)
  assert.ok(Math.abs(fd - bsGamma(S, K, T, v)) / bsGamma(S, K, T, v) < 1e-4)
})

test('implied volatility round-trips and refuses impossible prices', () => {
  const T = 120 / YEAR_MIN
  for (const [call, K, v] of [[true, 7800, 0.12], [false, 7790, 0.2], [true, 7850, 0.35]]) {
    const p = bsPrice(call, 7801, K, T, v)
    if (p < 0.01) continue
    assert.ok(Math.abs(impliedVol(call, p, 7801, K, T) - v) < 1e-6)
  }
  assert.equal(impliedVol(true, 10.005, 7810, 7800, T), null, 'below intrinsic + 0.01')
  assert.equal(impliedVol(false, 0, 7810, 7800, T), null)
})

test('exposure: calls positive, puts negative, volume cumulative, IV carried forward', () => {
  const close = 16 * 3600
  const spot = [{ t: close - 3600, c: 7800 }, { t: close - 3540, c: 7800 }, { t: close - 3480, c: 7800 }]
  const T0 = (3600 - 60) / 60 / YEAR_MIN
  const pc = bsPrice(true, 7800, 7805, T0, 0.15)
  const pp = bsPrice(false, 7800, 7795, T0, 0.15)
  const chain = [
    { strike: 7805, call: true, bars: [{ t: spot[0].t, c: pc, v: 10 }, { t: spot[2].t, c: 0.001, v: 5 }] },
    { strike: 7795, call: false, bars: [{ t: spot[0].t, c: pp, v: 20 }] },
  ]
  const r = exposures(spot, chain, close)
  assert.deepEqual(r.strikes, [7795, 7805])
  const g = (K, i) => bsGamma(7800, K, Math.max(1, (close - spot[i].t - 60) / 60) / YEAR_MIN, 0.15)
  const unit = 100 * 7800 * 7800 * 0.01
  assert.ok(Math.abs(r.E[0][1] - unit * g(7805, 0) * 10) / r.E[0][1] < 1e-6)
  assert.ok(Math.abs(r.E[0][0] + unit * g(7795, 0) * 20) / -r.E[0][0] < 1e-6)
  assert.ok(r.E[0][0] < 0 && r.E[0][1] > 0)
  // bar 2: an unusable price (no IV) still adds its volume; the last IV is kept
  assert.ok(Math.abs(r.E[2][1] - unit * g(7805, 2) * 15) / r.E[2][1] < 1e-6)
})
