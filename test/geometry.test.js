// The central technical finding about "مدرسة الميزان الهندسي" — the Geometric Balance school.
//
// On 2024-10-07 he posted a TASI daily chart with two trendlines from the same origin,
// labelled 51° and 24°, and the formula written across it in yellow:
//
//     51 % 2.125 = 24
//
// So the rule is: measure the angle of the rally line, divide it by 2.125, and draw a
// second line from the same origin at the resulting angle. That second line is the level.
// He does the same on Bitcoin (2024-09-15) with lines labelled 43°, 54° and 60°, and the
// procedure he gives is "من القمة نرسم الترند الهابط بنفس مقدار زاوية الترند الصاعد" —
// from the peak, draw the falling trend at the same angle as the rising trend.
//
// The problem is that an angle on a price chart is not a property of the price data.
// It is atan(Δprice × pixelsPerPrice ÷ Δbars × pixelsPerBar) — a property of the PICTURE.
// Change the zoom, the window size, the visible price range or the screen, and the angle
// changes. He knows this, which is why the setup post (2024-09-15) insists on
// "تثبيت الشارت" — reset the chart, open settings, scales and lines, LOCK PRICE RATIO —
// and why the TASI post specifies "الفريم اليومي بدون تصغير او تكبير للشارت", the daily
// frame with no zooming in or out.
//
// But locking the price ratio in TradingView freezes whatever scale is on screen at that
// moment. It does not define a universal one. Two people following his instructions on
// different monitors, or at different zoom levels before locking, get different angles
// from the same data — and therefore different levels.
//
// These tests demonstrate that, and contrast it with his numeric and MA rules, which are
// functions of the data and survive rescaling. This is why the geometric core cannot be
// ported faithfully to a Pine indicator: Pine sees prices and bar indices, never pixels.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { chartAngle, angleToPrice, TASI_OCT_2024 } from '../engine/geometry.js'
import { numericStep, digitSum } from '../engine/numeric.js'
import { maAnchorLevel } from '../engine/ma-anchor.js'

describe('chartAngle', () => {
  const leg = { fromBar: 0, fromPrice: 100, toBar: 10, toPrice: 200 }

  test('a 1:1 pixel rise over run is 45 degrees', () => {
    const angle = chartAngle(leg, { pxPerBar: 1, pxPerPrice: 0.1 })
    assert.equal(Math.round(angle), 45)
  })

  test('the SAME price move gives a DIFFERENT angle at a different zoom', () => {
    const zoomedOut = chartAngle(leg, { pxPerBar: 1, pxPerPrice: 0.1 })
    const zoomedIn = chartAngle(leg, { pxPerBar: 1, pxPerPrice: 0.3 })
    assert.notEqual(Math.round(zoomedOut), Math.round(zoomedIn))
    assert.ok(zoomedIn > zoomedOut)
  })

  test('widening the bars alone also changes the angle', () => {
    const narrow = chartAngle(leg, { pxPerBar: 1, pxPerPrice: 0.1 })
    const wide = chartAngle(leg, { pxPerBar: 4, pxPerPrice: 0.1 })
    assert.ok(wide < narrow)
  })

  test('only the pixel aspect ratio matters, not the absolute size', () => {
    // Doubling both axes is the same picture on a bigger screen.
    const small = chartAngle(leg, { pxPerBar: 1, pxPerPrice: 0.1 })
    const large = chartAngle(leg, { pxPerBar: 2, pxPerPrice: 0.2 })
    assert.ok(Math.abs(small - large) < 1e-9)
  })
})

describe('his TASI chart of 2024-10-07, reconstructed', () => {
  // The rally leg he drew, read off the posted chart.
  const { leg, postedScale, postedAngle, divisor, postedDerivedAngle } = TASI_OCT_2024

  test('his stated arithmetic is correct: 51 / 2.125 = 24', () => {
    assert.equal(postedAngle / divisor, postedDerivedAngle)
  })

  test('at the scale of his posted chart, the rally leg really does measure ~51 degrees', () => {
    // This is the check that his numbers are internally consistent — they are.
    const angle = chartAngle(leg, postedScale)
    assert.ok(Math.abs(angle - postedAngle) < 1.5, `got ${angle.toFixed(1)}, expected ~51`)
  })

  test('the same leg on a differently zoomed chart is NOT 51 degrees', () => {
    // A taller price axis — the kind of difference between two people's screens.
    const taller = chartAngle(leg, {
      pxPerBar: postedScale.pxPerBar,
      pxPerPrice: postedScale.pxPerPrice * 2,
    })
    assert.ok(Math.abs(taller - postedAngle) > 10, `got ${taller.toFixed(1)}, posted 51`)
  })

  test('and the level his rule derives moves with the zoom — this is the finding', () => {
    // Same data, same rule, same origin, two reasonable chart scales → two different
    // support levels 40 bars out. The rule does not have one answer.
    const tallScale = { ...postedScale, pxPerPrice: postedScale.pxPerPrice * 2 }

    const atPosted = angleToPrice(leg, postedAngle / divisor, postedScale, 40)
    const atTall = angleToPrice(leg, chartAngle(leg, tallScale) / divisor, tallScale, 40)

    assert.notEqual(Math.round(atPosted), Math.round(atTall))
    // Not a rounding quibble — the two answers are ~120 index points apart on TASI.
    assert.ok(Math.abs(atPosted - atTall) > 100, `${atPosted.toFixed(0)} vs ${atTall.toFixed(0)}`)
  })
})

describe('by contrast, his numeric and MA rules are scale-free', () => {
  test('the numeric step is a pure function of the anchor — no chart scale can reach it', () => {
    assert.equal(numericStep(11310), numericStep(11310))
    assert.equal(numericStep(4103), 360)
  })

  test('but it is violently sensitive to how you round the anchor', () => {
    // Not a chart-scale problem — a different one, and worth stating plainly.
    // He quoted the SPX low as ٤١٠٣ for an actual print of 4103.78. Had he rounded
    // up instead, the digit sum goes 8 → 9 and every level on the ladder moves 45+ points.
    assert.equal(numericStep(4103), 360)
    assert.equal(numericStep(4104), 405)
    // A one-point disagreement about where the low is = a 45-point shift in rung 1,
    // 90 in rung 2, and so on. The rule has no tolerance to read the wave differently.
    assert.equal(numericStep(4104) - numericStep(4103), 45)
  })

  test('and to the units the market is quoted in', () => {
    // Digit sum is a property of the decimal spelling, not the quantity. The same
    // market quoted with one more digit, or a stock before and after a split, gets a
    // different ladder for no economic reason.
    assert.notEqual(digitSum(4103) * 45, digitSum(41030) * 45 / 10)
  })

  test('the MA50 anchor level scales exactly with the prices, as a real quantity should', () => {
    const bars = Array.from({ length: 60 }, (_, i) => ({ high: i, low: i, close: i }))
    const scaled = bars.map((b) => ({ high: b.high * 7, low: b.low * 7, close: b.close * 7 }))
    assert.equal(maAnchorLevel(scaled, 55, 50), maAnchorLevel(bars, 55, 50) * 7)
  })
})
