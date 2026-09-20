/**
 * The one enhancement that survived a walk-forward test: a band multiplier
 * that depends on the volatility regime rather than a single constant.
 *
 * The published charts use one number near 0.92, and reproducing them is the
 * point of this repository, so the calibrated multiplier is an option and
 * never the default. These tests pin both halves of that: the maths, and the
 * fact that it really does calibrate better over the decade.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { REGIME_FIT, regimeMultiplier, calibratedHalfWidth, halfWidth } from '../lib/implied-move.js'
import { dailyBandSeries, regimeError, vixTerciles, THEORY } from '../lib/study.js'

const long = JSON.parse(readFileSync(new URL('./fixtures/market-long.json', import.meta.url))).sessions

test('the published fit says what it was fitted on and how', () => {
  assert.equal(REGIME_FIT.window, 500, 'the rolling window that scored best')
  assert.ok(REGIME_FIT.fittedTo <= '2026-09-14' && REGIME_FIT.fittedTo >= '2026-01-01')
  assert.ok(REGIME_FIT.cuts.low < REGIME_FIT.cuts.high)
  assert.ok(REGIME_FIT.k.low < REGIME_FIT.k.mid && REGIME_FIT.k.mid < REGIME_FIT.k.high,
    'a calm market realises less than it implies and a stressed one more')
  assert.equal(REGIME_FIT.baseMultiple, 0.92, 'the constant the charts themselves use')
  assert.ok(REGIME_FIT.k.low < REGIME_FIT.baseMultiple && REGIME_FIT.k.high > REGIME_FIT.baseMultiple,
    'so the fixed constant is too wide in calm markets and too narrow in stressed ones')
})

test('a volatility level picks its multiplier, and a cut belongs to the regime below it', () => {
  const fit = { cuts: { low: 16, high: 19 }, k: { low: 0.7, mid: 0.85, high: 1 } }
  assert.equal(regimeMultiplier(10, fit), 0.7)
  assert.equal(regimeMultiplier(16, fit), 0.7)
  assert.equal(regimeMultiplier(16.01, fit), 0.85)
  assert.equal(regimeMultiplier(19, fit), 0.85)
  assert.equal(regimeMultiplier(19.01, fit), 1)
  assert.equal(regimeMultiplier(80, fit), 1)
})

test('a half width is rescaled by the ratio of the regime multiplier to the one already in it', () => {
  const fit = { cuts: { low: 16, high: 19 }, k: { low: 0.7, mid: 0.92, high: 1.15 }, baseMultiple: 0.92 }
  const h = 5.7
  assert.equal(calibratedHalfWidth({ halfWidth: h, vix: 18, fit }), h,
    'a regime whose multiplier is already the base leaves the band alone')
  assert.equal(calibratedHalfWidth({ halfWidth: h, vix: 12, fit }), 4.34, '5.70 at 0.7/0.92')
  // 1.15/0.92 is exactly 1.25 and 5.70 x 1.25 is exactly 7.125, which rounds up
  // to 7.13. Binary arithmetic lands a hair below it, so the library rounds the
  // way every other band in it rounds rather than the way the float reads.
  assert.equal(calibratedHalfWidth({ halfWidth: h, vix: 25, fit }), 7.13)
  assert.equal(calibratedHalfWidth({ halfWidth: h, vix: 25, fit, round: false }), h * (1.15 / 0.92))
  assert.throws(() => calibratedHalfWidth({ halfWidth: h, vix: 18, fit: { ...fit, baseMultiple: 0 } }), /baseMultiple/)
})

test('the calibrated band is nowhere near the published one, which is why it is an option and not the default', () => {
  const h = halfWidth({ close: 765, iv: 0.12, days: 1 })
  const calm = calibratedHalfWidth({ halfWidth: h, vix: 12, fit: REGIME_FIT })
  assert.ok(calm < h * 0.85, `a calm-market band is more than 15 per cent narrower: ${calm} against ${h}`)
  const stressed = calibratedHalfWidth({ halfWidth: h, vix: 30, fit: REGIME_FIT })
  assert.ok(stressed > h * 1.04, `and a stressed one wider: ${stressed} against ${h}`)
})

test('over the decade the regime multiplier calibrates every regime better than the constant does', () => {
  const cuts = vixTerciles(long)
  const fixed = dailyBandSeries(long, { k: 0.92 })
  const calibrated = fixed.map((b) => {
    const hw = calibratedHalfWidth({ halfWidth: b.halfWidth, vix: b.anchorVix, fit: REGIME_FIT, round: false })
    return { ...b, halfWidth: hw, upper: b.center + hw, lower: b.center - hw }
  })
  const before = regimeError(fixed, cuts)
  const after = regimeError(calibrated, cuts)
  // This is the frozen published fit applied to a decade it was not fitted on,
  // and scored against that decade's own cuts rather than its fit's, so it is
  // the pessimistic case. It still halves the error. The rolling refit that
  // justified the change does far better, and tests/study-corrections.test.js
  // pins that separately.
  assert.ok(after.weighted < before.weighted * 0.55,
    `weighted calibration error should roughly halve: ${before.weighted} → ${after.weighted}`)
  for (const g of ['low', 'high']) {
    assert.ok(after.byRegime[g].error < before.byRegime[g].error,
      `${g}: ${before.byRegime[g].error} → ${after.byRegime[g].error}`)
  }
  assert.ok(Math.abs(after.byRegime.low.meanAbsZ - THEORY.meanAbsZ) < 0.09,
    'the calm tercile stops being a band nobody ever reaches')
})
