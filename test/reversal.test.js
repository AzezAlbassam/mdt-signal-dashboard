// Tests for the evaluator that measures his central claim: "زيرو انعكاس" — zero reversal.
//
// His usage, from 2023-10-07: "وسنحصل في كل شارت على صفقتين بزيرو انعكاس ومن أول لمسة"
// — "we get two trades on each chart with zero reversal and from the first touch."
//
// So the claim is specific and falsifiable: price reaches the level and turns there,
// with essentially no penetration past it. That gives two measurable quantities per touch:
//
//   penetration — how far past the level price went before turning
//   excursion   — how far it then travelled back away from the level
//
// A "zero reversal" is a touch with small penetration and a large excursion.
//
// The point of this module is NOT to confirm his method. It is to make the claim
// measurable so his levels can be scored against a null model of random levels.
// Without that comparison a hit rate means nothing — any level in a trending market
// gets touched and followed by movement.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { firstTouch, classifyTouch, scoreLevels } from '../engine/reversal.js'

// Helper: build bars from [low, high] pairs; close defaults to the midpoint.
const series = (...ranges) =>
  ranges.map(([low, high]) => ({ low, high, close: (low + high) / 2 }))

describe('firstTouch', () => {
  test('resistance: the first bar whose high reaches the level', () => {
    const bars = series([90, 95], [94, 99], [98, 105], [100, 103])
    assert.equal(firstTouch(bars, 100, { from: 'below' }), 2)
  })

  test('support: the first bar whose low reaches the level', () => {
    const bars = series([110, 115], [105, 112], [95, 106], [97, 100])
    assert.equal(firstTouch(bars, 100, { from: 'above' }), 2)
  })

  test('returns null when the level is never reached', () => {
    const bars = series([90, 95], [91, 96], [92, 97])
    assert.equal(firstTouch(bars, 100, { from: 'below' }), null)
  })

  test('respects a start index so levels are only tested forward of their anchor', () => {
    // A level derived from a peak at bar 2 must not be scored against bars 0-2.
    const bars = series([98, 105], [90, 95], [91, 96], [99, 104])
    assert.equal(firstTouch(bars, 100, { from: 'below', startIndex: 1 }), 3)
  })

  test('an exact touch counts', () => {
    const bars = series([90, 95], [96, 100])
    assert.equal(firstTouch(bars, 100, { from: 'below' }), 1)
  })
})

describe('classifyTouch', () => {
  test('resistance: measures penetration above and excursion below', () => {
    //                touch ───┐
    const bars = series([95, 100], [99, 101], [90, 96], [85, 91])
    const result = classifyTouch(bars, 0, 100, { from: 'below', horizon: 3 })
    // highest high after the touch is 101 → penetration 1%
    assert.equal(result.penetrationPct, 1)
    // lowest low after the touch is 85 → excursion 15%
    assert.equal(result.excursionPct, 15)
  })

  test('support: measures penetration below and excursion above', () => {
    const bars = series([100, 105], [99, 104], [104, 110], [108, 115])
    const result = classifyTouch(bars, 0, 100, { from: 'above', horizon: 3 })
    assert.equal(result.penetrationPct, 1)
    assert.equal(result.excursionPct, 15)
  })

  test('a clean turn at the level is a zero reversal', () => {
    const bars = series([95, 100], [94, 99], [88, 95], [84, 90])
    const result = classifyTouch(bars, 0, 100, {
      from: 'below',
      horizon: 3,
      maxPenetrationPct: 0.5,
      minExcursionPct: 5,
    })
    assert.equal(result.penetrationPct, 0)
    assert.equal(result.isZeroReversal, true)
  })

  test('slicing straight through the level is not a reversal', () => {
    const bars = series([95, 100], [100, 108], [107, 115], [112, 120])
    const result = classifyTouch(bars, 0, 100, {
      from: 'below',
      horizon: 3,
      maxPenetrationPct: 0.5,
      minExcursionPct: 5,
    })
    assert.ok(result.penetrationPct > 0.5)
    assert.equal(result.isZeroReversal, false)
  })

  test('turning at the level but going nowhere is not a reversal either', () => {
    const bars = series([98, 100], [98, 100], [98, 99], [98, 100])
    const result = classifyTouch(bars, 0, 100, {
      from: 'below',
      horizon: 3,
      maxPenetrationPct: 0.5,
      minExcursionPct: 5,
    })
    assert.equal(result.penetrationPct, 0)
    assert.ok(result.excursionPct < 5)
    assert.equal(result.isZeroReversal, false)
  })

  test('the horizon bounds how far forward it looks', () => {
    const bars = series([95, 100], [97, 99], [96, 98], [50, 60])
    const near = classifyTouch(bars, 0, 100, { from: 'below', horizon: 2 })
    const far = classifyTouch(bars, 0, 100, { from: 'below', horizon: 3 })
    assert.ok(far.excursionPct > near.excursionPct)
  })
})

describe('scoreLevels', () => {
  const bars = series(
    [95, 100], [94, 99], [88, 95], [84, 90], [86, 92],
    [95, 100], [94, 99], [88, 95], [84, 90], [86, 92],
  )

  test('reports touched, reversed and the rate among touched levels', () => {
    const result = scoreLevels(bars, [{ price: 100, fromIndex: 0 }], {
      from: 'below',
      horizon: 4,
      maxPenetrationPct: 0.5,
      minExcursionPct: 5,
    })
    assert.equal(result.levels, 1)
    assert.equal(result.touched, 1)
    assert.equal(result.reversed, 1)
    assert.equal(result.rate, 1)
  })

  test('untouched levels are excluded from the rate, not counted as failures', () => {
    // A level price never reaches says nothing either way about the method.
    const result = scoreLevels(
      bars,
      [{ price: 100, fromIndex: 0 }, { price: 500, fromIndex: 0 }],
      { from: 'below', horizon: 4, maxPenetrationPct: 0.5, minExcursionPct: 5 },
    )
    assert.equal(result.levels, 2)
    assert.equal(result.touched, 1)
    assert.equal(result.rate, 1)
  })

  test('rate is null when nothing was touched, never 0', () => {
    const result = scoreLevels(bars, [{ price: 9999, fromIndex: 0 }], {
      from: 'below',
      horizon: 4,
    })
    assert.equal(result.touched, 0)
    assert.equal(result.rate, null)
  })
})
