// Confidence intervals, so a result from 32 trades is not reported as if it were a result.
//
// The monthly row of the timeframe test shows a 50% win rate and a positive expectancy on
// 32 trades. Without an interval that reads like a finding. With one it reads like noise.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { bootstrapMean, wilsonInterval } from '../engine/stats.js'
import { seededRng } from '../engine/null-models.js'

describe('wilsonInterval — for win rates', () => {
  test('a 50% rate on 32 trades is wide enough to contain 40%', () => {
    // This is the monthly result. The interval decides whether it means anything.
    const [lo, hi] = wilsonInterval(16, 32)
    assert.ok(lo < 0.4, `lower bound ${lo} should sit below the 40% break-even`)
    assert.ok(hi > 0.6, `upper bound ${hi}`)
  })

  test('the same rate on 3200 trades is tight enough to exclude 40%', () => {
    const [lo] = wilsonInterval(1600, 3200)
    assert.ok(lo > 0.4, `lower bound ${lo} should clear 40% at this sample size`)
  })

  test('brackets the observed rate', () => {
    const [lo, hi] = wilsonInterval(75, 269)
    const rate = 75 / 269
    assert.ok(lo < rate && rate < hi)
  })

  test('stays inside [0, 1] at the extremes', () => {
    const [lo0, hi0] = wilsonInterval(0, 10)
    assert.ok(lo0 >= 0 && hi0 <= 1)
    const [lo1, hi1] = wilsonInterval(10, 10)
    assert.ok(lo1 >= 0 && hi1 <= 1)
  })

  test('zero trials is null rather than a divide by zero', () => {
    assert.equal(wilsonInterval(0, 0), null)
  })
})

describe('bootstrapMean — for expectancy', () => {
  test('brackets the sample mean', () => {
    const xs = [3, -2, 3, -2, 3, -2, 3, 3, -2, 3]
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    const [lo, hi] = bootstrapMean(xs, { draws: 2000, rng: seededRng(1) })
    assert.ok(lo < mean && mean < hi, `${lo} .. ${hi} should contain ${mean}`)
  })

  test('a small noisy sample gives an interval that straddles zero', () => {
    const xs = [3, -2, 3, -2, 3, -2, 3, -2, 3, -2, 3, -2, 3, -2, 3, -2]
    const [lo, hi] = bootstrapMean(xs, { draws: 2000, rng: seededRng(2) })
    assert.ok(lo < 0 && hi > 0, `${lo} .. ${hi} should straddle zero`)
  })

  test('a large consistent sample gives an interval clear of zero', () => {
    const xs = Array.from({ length: 4000 }, (_, i) => (i % 10 === 0 ? -2 : 0.5))
    const [lo] = bootstrapMean(xs, { draws: 1000, rng: seededRng(3) })
    assert.ok(lo > 0, `lower bound ${lo} should clear zero`)
  })

  test('is deterministic for a given seed', () => {
    const xs = [1, -1, 2, -2, 3]
    const a = bootstrapMean(xs, { draws: 500, rng: seededRng(9) })
    const b = bootstrapMean(xs, { draws: 500, rng: seededRng(9) })
    assert.deepEqual(a, b)
  })

  test('an empty sample is null', () => {
    assert.equal(bootstrapMean([], { draws: 100, rng: seededRng(1) }), null)
  })
})
