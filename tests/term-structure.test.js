/**
 * Reading the volatility for the horizon actually being drawn, instead of a
 * thirty-day number scaled by a constant.
 *
 * The indicator's weakest input has always been the plain family: the front
 * expiry's own volatility, which the screenshots could not settle and which a
 * chart cannot fetch. The exchange publishes the answer for free. VIX9D, VIX,
 * VIX3M and VIX6M are four points on the same curve, and a daily band wants
 * the nine-day point, not the thirty-day one.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { vixCurve, sigmaFromCurve, VIX_TENORS } from '../lib/bands.js'

const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

test('the published tenors are the ones the exchange actually computes', () => {
  assert.deepEqual(VIX_TENORS, { vix9d: 9, vix: 30, vix3m: 93, vix6m: 186 })
})

test('a curve is built from whichever of the four are available, in order, as decimals', () => {
  const c = vixCurve({ vix9d: 12.5, vix: 15, vix3m: 18, vix6m: 19.5 })
  assert.deepEqual(c.map((p) => p.days), [9, 30, 93, 186])
  near(c[0].iv, 0.125, 1e-12, 'per cent becomes a decimal')
  near(c[3].iv, 0.195, 1e-12)

  const partial = vixCurve({ vix: 15, vix3m: 18 })
  assert.deepEqual(partial.map((p) => p.days), [30, 93])
  assert.deepEqual(vixCurve({ vix9d: null, vix: 15 }).map((p) => p.days), [30],
    'a missing quote is dropped rather than guessed')
  assert.deepEqual(vixCurve({}), [])
})

test('a volatility is interpolated in total variance, because variance is what adds over time', () => {
  const curve = [{ days: 9, iv: 0.10 }, { days: 30, iv: 0.20 }]
  const mid = sigmaFromCurve(curve, 19.5)
  const v9 = 0.10 * 0.10 * 9
  const v30 = 0.20 * 0.20 * 30
  near(mid, Math.sqrt(((v9 + v30) / 2) / 19.5), 1e-12, 'halfway in days is halfway in variance')
  assert.ok(mid > 0.10 && mid < 0.20)
  // Interpolating the volatilities directly would give 0.15, which is wrong.
  assert.ok(Math.abs(mid - 0.15) > 0.01, `variance interpolation is not the same as straight-line: ${mid}`)
})

test('outside the published range it clamps rather than inventing a number', () => {
  const curve = [{ days: 9, iv: 0.10 }, { days: 30, iv: 0.20 }]
  assert.equal(sigmaFromCurve(curve, 1), 0.10, 'a one-day horizon reads the shortest tenor published')
  assert.equal(sigmaFromCurve(curve, 9), 0.10)
  assert.equal(sigmaFromCurve(curve, 400), 0.20)
  assert.equal(sigmaFromCurve([{ days: 30, iv: 0.17 }], 5), 0.17, 'one point is a flat curve')
  assert.throws(() => sigmaFromCurve([], 5), /empty/)
})

test('a steep front is exactly the case a flat thirty-day number gets wrong', () => {
  // A calm tape: the nine-day sits well under the thirty-day.
  const calm = vixCurve({ vix9d: 10.2, vix: 15.4, vix3m: 18.1 })
  const oneDay = sigmaFromCurve(calm, 1)
  near(oneDay, 0.102, 1e-12, 'a daily band should read the nine-day point')
  assert.ok(oneDay < 0.154 * 0.75, 'which is a third narrower than the thirty-day number the indicator uses now')

  // A shock: the front inverts above the thirty-day and the band must widen.
  const shocked = vixCurve({ vix9d: 38.0, vix: 29.5, vix3m: 25.2 })
  assert.ok(sigmaFromCurve(shocked, 1) > sigmaFromCurve(shocked, 30),
    'an inverted curve makes the daily band wider than the monthly one, which is the whole point')
})

test('a weekly horizon reads between the published points and a monthly reads near the thirty-day', () => {
  const c = vixCurve({ vix9d: 12, vix: 16, vix3m: 20 })
  const weekly = sigmaFromCurve(c, 7)
  const monthly = sigmaFromCurve(c, 30)
  assert.equal(weekly, 0.12, 'seven days is inside the nine-day point, so it clamps there')
  near(monthly, 0.16, 1e-12)
  const twoWeek = sigmaFromCurve(c, 14)
  assert.ok(twoWeek > 0.12 && twoWeek < 0.16, `a fortnight sits between: ${twoWeek}`)
})
