import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  dailyBandSeries, calibrate, solveK, parkinsonVol, openAnchoredSeries,
  vixTerciles, wilsonRate, THEORY,
} from '../lib/study.js'

const long = JSON.parse(readFileSync(new URL('./fixtures/market-long.json', import.meta.url))).sessions
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

/** A synthetic series where every session's range is exactly the prior band. */
const synthetic = (n, k = 0.92, vix = 20) => {
  const out = [{ date: '2020-01-01', open: 100, high: 100, low: 100, close: 100, vix }]
  for (let i = 1; i <= n; i++) {
    const prev = out[i - 1]
    const h = prev.close * (k * vix / 100) * Math.sqrt(1 / 365)
    out.push({ date: `2020-01-${String(i + 1).padStart(2, '0')}`, open: prev.close, high: prev.close + h, low: prev.close - h, close: prev.close, vix })
  }
  return out
}

test('a daily band series anchors every band on the session before', () => {
  const s = dailyBandSeries(long, { k: 0.92 })
  assert.equal(s.length, long.length - 1)
  for (let i = 0; i < s.length; i++) {
    assert.equal(s[i].anchorDate, long[i].date)
    assert.equal(s[i].session.date, long[i + 1].date)
    assert.ok(s[i].upper > s[i].center && s[i].lower < s[i].center)
  }
})

test('calibration on a series built to sit exactly on its band is exact', () => {
  const c = calibrate(synthetic(50))
  assert.equal(c.n, 50)
  near(c.contained, 1, 1e-12, 'every range touches both edges and is contained')
  near(c.upperReached, 1, 1e-12, 'touching to the cent counts')
  near(c.lowerReached, 1, 1e-12, 'both sides')
  near(c.closeBreakUpper, 0, 1e-12, 'never breaks on the close')
  near(c.meanAbsZ, 0, 1e-12, 'closes sit on the centre')
})

test('calibration on the decade reports every field with the right sample size', () => {
  const c = calibrate(long)
  assert.equal(c.n, long.length - 1)
  for (const f of ['contained', 'upperReached', 'lowerReached', 'closeBreakUpper', 'closeBreakLower', 'meanAbsZ', 'meanZ']) {
    assert.ok(Number.isFinite(c[f]), f)
  }
  assert.ok(c.contained > 0.3 && c.contained < 0.7, `contained ${c.contained}`)
  assert.ok(c.meanAbsZ > 0.5 && c.meanAbsZ < 1.1, `mean |z| ${c.meanAbsZ}`)
})

test('the multiplier that calibrates the band is solved, not guessed', () => {
  const k = solveK(long, { target: 'meanAbsZ' })
  assert.ok(k > 0.5 && k < 1.5, `k ${k}`)
  near(calibrate(long, { k }).meanAbsZ, THEORY.meanAbsZ, 1e-3, 'mean |z| lands on the normal value')
  const k2 = solveK(long, { target: 'closeBreak' })
  assert.ok(k2 > 0.5 && k2 < 1.5, `k2 ${k2}`)
  const c2 = calibrate(long, { k: k2 })
  near((c2.closeBreakUpper + c2.closeBreakLower) / 2, THEORY.oneSidedBreak, 2e-3, 'one-sided break rate lands on 15.9%')
})

test('Parkinson volatility recovers a known constant range', () => {
  // Every session has high/low = e^x, so sigma = x * sqrt(252 / (4 ln 2)).
  const x = 0.01
  const s = Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, open: 100, high: 100 * Math.exp(x / 2), low: 100 * Math.exp(-x / 2), close: 100 }))
  near(parkinsonVol(s, 20), x * Math.sqrt(252 / (4 * Math.LN2)), 1e-12, 'constant range')
  assert.equal(parkinsonVol(s.slice(0, 5), 20), null, 'too short a window is null, not a guess')
})

test('an open-anchored band is centred on the open and still honours the prior vol', () => {
  const s = openAnchoredSeries(long, { k: 0.92 })
  assert.equal(s.length, long.length - 1)
  for (let i = 0; i < 20; i++) {
    assert.equal(s[i].center, long[i + 1].open)
    near(s[i].halfWidth, long[i + 1].open * 0.92 * long[i].vix / 100 * Math.sqrt(1 / 365), 1e-9, 'width from the prior VIX on the open')
  }
})

test('VIX terciles split the decade into three equal regimes', () => {
  const t = vixTerciles(long)
  assert.ok(t.low < t.high)
  const buckets = { low: 0, mid: 0, high: 0 }
  for (const s of long) buckets[s.vix <= t.low ? 'low' : s.vix <= t.high ? 'mid' : 'high']++
  const n = long.length
  for (const b of Object.values(buckets)) assert.ok(Math.abs(b / n - 1 / 3) < 0.02, JSON.stringify(buckets))
})

test('rates carry their sample size and a Wilson interval, never a bare percentage', () => {
  const r = wilsonRate(14, 20)
  assert.equal(r.n, 20)
  near(r.point, 0.7, 1e-12, 'point')
  near(r.low, 0.4810, 1e-3, 'lower')
  near(r.high, 0.8545, 1e-3, 'upper')
  assert.equal(r.reportable, true)
  assert.equal(wilsonRate(3, 5).reportable, false)
})
