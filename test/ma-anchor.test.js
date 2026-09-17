// Golden cases for the "استراتيجية متوسط ٥٠" rule — the one @zero_en3kas published free on
// 2023-09-15 (tweet 1702787826176192551) and re-published twice in 2025 after TradingView
// removed the community port of it.
//
// His words, verbatim:
//   "الشروط متوسط 50 خط عمودي على القمة وخط افقي مع تقاطع متوسط خمسين
//    يفضل الاسعار تسوي قمم اعلى متوسط الخمسين"
//
//   "The conditions: MA50, a vertical line on the peak, and a horizontal line at the
//    crossing with the 50 moving average. Preferably prices make higher highs above the 50."
//
// Read literally this is fully mechanical and — unlike his mirrored-trend-angle rule —
// scale-free: drop a vertical at the swing peak, read where it cuts the MA50, and that
// MA50 value becomes a horizontal level carried forward. This is the cleanest rule he
// published, and the only one of the free set with no chart-zoom dependency.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { sma, findSwingHighs, maAnchorLevel, maAnchorLevels } from '../engine/ma-anchor.js'

// A deliberately hand-computable series: close = bar index, so SMA(n) at bar i is
// the mean of i-n+1 .. i, which is i - (n-1)/2.
const ramp = (n) => Array.from({ length: n }, (_, i) => ({ high: i, low: i, close: i }))

describe('sma', () => {
  test('is undefined until the window is full', () => {
    const values = sma(ramp(10).map((b) => b.close), 5)
    assert.equal(values[0], undefined)
    assert.equal(values[3], undefined)
    assert.notEqual(values[4], undefined)
  })

  test('averages the trailing window inclusive of the current bar', () => {
    const values = sma(ramp(10).map((b) => b.close), 5)
    // bars 0..4 → mean 2
    assert.equal(values[4], 2)
    // bars 5..9 → mean 7
    assert.equal(values[9], 7)
  })

  test('period must be a positive integer', () => {
    assert.throws(() => sma([1, 2, 3], 0), /positive/i)
    assert.throws(() => sma([1, 2, 3], 2.5), /integer/i)
  })
})

describe('findSwingHighs — القمة', () => {
  // A swing high needs a strictly higher high than `lookback` bars on each side.
  // He picks the peak by eye; this is the mechanical stand-in, and the lookback is
  // OUR parameter, not his — he never states one. See METHOD.md.
  const highs = (...hs) => hs.map((h) => ({ high: h, low: h - 1, close: h }))

  test('finds a clean isolated peak', () => {
    const bars = highs(1, 2, 5, 2, 1)
    assert.deepEqual(findSwingHighs(bars, 2), [2])
  })

  test('ignores peaks too close to the series edges to confirm', () => {
    const bars = highs(5, 4, 3, 4, 5)
    assert.deepEqual(findSwingHighs(bars, 2), [])
  })

  test('finds multiple peaks', () => {
    //                 0  1  2  3  4  5  6  7  8
    const bars = highs(1, 1, 4, 1, 1, 1, 6, 1, 1)
    assert.deepEqual(findSwingHighs(bars, 2), [2, 6])
  })

  test('a flat top is not a swing high — it must be strictly higher', () => {
    const bars = highs(1, 2, 5, 5, 2, 1)
    assert.deepEqual(findSwingHighs(bars, 2), [])
  })
})

describe('maAnchorLevel — خط عمودي على القمة وخط افقي مع تقاطع متوسط خمسين', () => {
  test('the level is the MA50 value at the bar of the peak', () => {
    const bars = ramp(60)
    // SMA50 at bar 55 is the mean of bars 6..55 = 30.5
    const level = maAnchorLevel(bars, 55, 50)
    assert.equal(level, 30.5)
  })

  test('returns null when the MA is not yet defined at the peak', () => {
    const bars = ramp(60)
    assert.equal(maAnchorLevel(bars, 10, 50), null)
  })

  test('the level does not depend on chart zoom, scale or aspect ratio', () => {
    // The point of this test is the contrast with his mirrored-trend-angle rule,
    // which changes meaning when the chart is rescaled. Multiply every price by 10
    // and the level scales exactly with it — a genuine property of the data.
    const bars = ramp(60)
    const scaled = bars.map((b) => ({ high: b.high * 10, low: b.low * 10, close: b.close * 10 }))
    assert.equal(maAnchorLevel(scaled, 55, 50), maAnchorLevel(bars, 55, 50) * 10)
  })

  test('peak index must be inside the series', () => {
    const bars = ramp(60)
    assert.throws(() => maAnchorLevel(bars, 60, 50), /range/i)
    assert.throws(() => maAnchorLevel(bars, -1, 50), /range/i)
  })
})

describe('maAnchorLevels — the full set carried forward', () => {
  test('one level per confirmed swing high, in bar order', () => {
    const bars = ramp(200).map((b, i) => ({ ...b, high: b.high + (i === 120 || i === 160 ? 50 : 0) }))
    const levels = maAnchorLevels(bars, { period: 50, lookback: 5 })
    assert.deepEqual(levels.map((l) => l.barIndex), [120, 160])
    for (const level of levels) {
      assert.equal(level.price, maAnchorLevel(bars, level.barIndex, 50))
    }
  })

  test('skips peaks that land before the MA is defined', () => {
    const bars = ramp(200).map((b, i) => ({ ...b, high: b.high + (i === 20 || i === 160 ? 50 : 0) }))
    const levels = maAnchorLevels(bars, { period: 50, lookback: 5 })
    assert.deepEqual(levels.map((l) => l.barIndex), [160])
  })

  test('his preferred context flag: peak high sits above the MA50', () => {
    // "يفضل الاسعار تسوي قمم اعلى متوسط الخمسين" — preferably prices make peaks above the MA50.
    const bars = ramp(200).map((b, i) => ({ ...b, high: b.high + (i === 160 ? 50 : 0) }))
    const [level] = maAnchorLevels(bars, { period: 50, lookback: 5 })
    assert.equal(level.peakAboveMa, true)
  })
})
