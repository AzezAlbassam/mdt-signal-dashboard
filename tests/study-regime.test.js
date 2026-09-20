import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  simulateSetup, solveKByRegime, regimeAdjustedSeries, calibrateSeries, outOfSample, THEORY,
} from '../lib/study.js'

const long = JSON.parse(readFileSync(new URL('./fixtures/market-long.json', import.meta.url))).sessions
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)
const SESSION_DAYS = 6.5 / 24

test('a same-session leg is priced on the fraction of the session assumed to remain', () => {
  const full = simulateSetup(long, { setup: 'lowerTagLong', dte: 0, entryFraction: 1 })
  const half = simulateSetup(long, { setup: 'lowerTagLong', dte: 0 })
  const late = simulateSetup(long, { setup: 'lowerTagLong', dte: 0, entryFraction: 0.25 })
  assert.equal(full.length, half.length)
  near(full[0].daysToExpiryAtEntry, SESSION_DAYS, 1e-12, 'a whole session at entry')
  near(half[0].daysToExpiryAtEntry, SESSION_DAYS / 2, 1e-12, 'the default is half')
  near(late[0].daysToExpiryAtEntry, SESSION_DAYS / 4, 1e-12, 'a quarter')
  assert.ok(full[0].premiumIn > half[0].premiumIn && half[0].premiumIn > late[0].premiumIn,
    'more time left costs more, so the whole-session case is the conservative one for a buyer')
  assert.equal(full[0].entryFraction, 1)
})

test('the multiplier is solved per VIX regime and rises with the regime', () => {
  const r = solveKByRegime(long)
  assert.ok(r.cuts.low < r.cuts.high)
  for (const g of ['low', 'mid', 'high']) assert.ok(r.k[g] > 0.4 && r.k[g] < 1.6, `${g} ${r.k[g]}`)
  assert.ok(r.k.low < r.k.mid && r.k.mid < r.k.high,
    'calm markets realise less than implied, stressed ones more')
  assert.equal(r.n.low + r.n.mid + r.n.high, long.length - 1)
})

test('a regime-adjusted series lands on the normal mean |z| inside every regime it was fitted on', () => {
  const r = solveKByRegime(long)
  const series = regimeAdjustedSeries(long, r)
  assert.equal(series.length, long.length - 1)
  for (const g of ['low', 'mid', 'high']) {
    const rows = series.filter((b) => b.regime === g)
    near(calibrateSeries(rows).meanAbsZ, THEORY.meanAbsZ, 5e-3, `${g} in sample`)
  }
})

test('out-of-sample evaluation fits on the past only and reports both bands on the future', () => {
  const o = outOfSample(long, { split: '2022-01-01', fixedK: 0.92 })
  assert.ok(o.fit.to < '2022-01-01' && o.test.from >= '2022-01-01', 'no test session enters the fit')
  assert.ok(o.fit.n > 1000 && o.test.n > 900)
  for (const side of ['fixed', 'regime']) {
    for (const f of ['meanAbsZ', 'contained', 'closeBreakUpper', 'closeBreakLower']) assert.ok(Number.isFinite(o[side][f]), `${side}.${f}`)
  }
  assert.equal(o.fixed.k, 0.92)
  assert.ok(o.regime.k.low < o.regime.k.high)
  // The verdict is a measurement, recorded, not assumed.
  assert.equal(typeof o.regime.improves, 'boolean')
  near(o.regime.improves ? 1 : 0, Math.abs(o.regime.meanAbsZ - THEORY.meanAbsZ) < Math.abs(o.fixed.meanAbsZ - THEORY.meanAbsZ) ? 1 : 0, 0, 'improves means closer to the normal value')
})

test('a same-session leg can exclude sessions that gapped through the band at the open', () => {
  const all = simulateSetup(long, { setup: 'lowerTagLong', dte: 0, entryFraction: 1 })
  const fillable = simulateSetup(long, { setup: 'lowerTagLong', dte: 0, entryFraction: 1, excludeGapThrough: true })
  assert.ok(fillable.length < all.length, 'some touches happened at the open with no fill at the band')
  for (const t of fillable) assert.ok(t.openS > t.entryLevel, `${t.entryDate} opened at ${t.openS}, above the band ${t.entryLevel}`)
  const gapped = all.filter((t) => t.openS <= t.entryLevel)
  assert.equal(all.length - fillable.length, gapped.length)
  assert.ok(gapped.length > 30, `${gapped.length} gap-throughs in a decade`)
})
