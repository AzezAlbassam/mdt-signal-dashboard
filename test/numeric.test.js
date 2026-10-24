// Golden cases for "التحليل الرقمي" — the numeric-analysis rule @zero_en3kas published
// free and in full on 2023-12-24 (tweet 1738923744289030431) and 2023-12-25 (1739262068019122458).
//
// His words, verbatim:
//   "بنشتغل على آخر موجة قمتها ٤٦٠٦ وقاعها ٤١٠٣ وبتكون المعادلة كالتالي ( مجموع القاع * ٤٥ )
//    القاع ٤١٠٣  ٤+١+٠+٣ = ٨
//    ٨ *٤٥ = ٣٦٠
//    نضيف ٣٦٠ للقاع مرتين ونرسم الترندات"
//
//   "We work on the last wave, its peak 4606 and its low 4103, and the equation is
//    (digit sum of the low × 45). The low 4103: 4+1+0+3 = 8. 8 × 45 = 360.
//    We add 360 to the low twice and draw the trends."
//
// Every expected value below is HIS number, not ours. These tests are the contract:
// the implementation is correct only when it reproduces what he published.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { digitSum, numericStep, numericLevels, resolveScale } from '../engine/numeric.js'

describe('digitSum — مجموع القاع', () => {
  test('his own worked example: 4103 → 8', () => {
    assert.equal(digitSum(4103), 8)
  })

  test('sums the digits of the integer part only', () => {
    assert.equal(digitSum(4606), 16)
    assert.equal(digitSum(1), 1)
    assert.equal(digitSum(999), 27)
  })

  test('ignores the decimal part — he quotes index lows as whole numbers', () => {
    // He wrote the low as ٤١٠٣ for an actual SPX print of 4103.78.
    assert.equal(digitSum(4103.78), 8)
  })

  test('is not a repeated digital root — 4606 stays 16, it does not reduce to 7', () => {
    assert.notEqual(digitSum(4606), 7)
  })

  test('rejects negative and non-finite input rather than guessing', () => {
    assert.throws(() => digitSum(-10), /non-negative/i)
    assert.throws(() => digitSum(NaN), /finite/i)
    assert.throws(() => digitSum(Infinity), /finite/i)
  })
})

describe('numericStep — ( مجموع القاع * ٤٥ )', () => {
  test('his own worked example: low 4103 → step 360', () => {
    assert.equal(numericStep(4103), 360)
  })

  test('the multiplier is 45, a 360°/8 astrological division, not a fitted constant', () => {
    // He describes the family as "مشتقة من التحليل الفلكي" (derived from astrological analysis).
    // 45 is fixed; the only variable is the digit sum of the anchor low.
    assert.equal(numericStep(1000), digitSum(1000) * 45)
    assert.equal(numericStep(4103), digitSum(4103) * 45)
  })

  test('a digit sum of 8 is what makes his example land on exactly 360', () => {
    assert.equal(8 * 45, 360)
    assert.equal(numericStep(4103), 8 * 45)
  })
})

describe('numericLevels — نضيف ٣٦٠ للقاع مرتين', () => {
  test('his own worked example: low 4103, added twice → 4463 and 4823', () => {
    assert.deepEqual(numericLevels({ anchor: 4103, count: 2 }), [4463, 4823])
  })

  test('the anchor itself is not one of the returned levels', () => {
    const levels = numericLevels({ anchor: 4103, count: 2 })
    assert.ok(!levels.includes(4103))
  })

  test('count controls how many rungs the ladder has', () => {
    assert.deepEqual(numericLevels({ anchor: 4103, count: 1 }), [4463])
    assert.deepEqual(numericLevels({ anchor: 4103, count: 4 }), [4463, 4823, 5183, 5543])
  })

  test('direction "down" subtracts the step — the mirror case from a wave peak', () => {
    assert.deepEqual(
      numericLevels({ anchor: 4103, count: 2, direction: 'down' }),
      [3743, 3383],
    )
  })

  test('count must be a positive integer', () => {
    assert.throws(() => numericLevels({ anchor: 4103, count: 0 }), /positive/i)
    assert.throws(() => numericLevels({ anchor: 4103, count: 1.5 }), /integer/i)
  })
})

describe('resolveScale — واقسم على ١٠ او ١٠٠ حسب سعر السهم او العمله', () => {
  // Tweet 2023-12-25: "we applied the same equation to SPX, to stocks and to currencies —
  // and divide by 10 or 100 according to the price of the stock or the currency."
  //
  // He states the two divisors (10 and 100) but never states the cut-off price between them.
  // These tests pin the only reading consistent with his own examples:
  // a four-digit index (SPX 4103) takes the raw step, and progressively cheaper
  // instruments take the step scaled down by one or two orders of magnitude.

  test('a four-digit index price uses the unscaled step', () => {
    assert.equal(resolveScale(4103), 1)
  })

  test('a three-digit stock price divides the step by 10', () => {
    assert.equal(resolveScale(250), 10)
  })

  test('a two-digit or lower price divides the step by 100', () => {
    assert.equal(resolveScale(35), 100)
  })

  test('scaling composes with the ladder', () => {
    // TSLA at 250: digit sum 7 → 7 × 45 = 315 → ÷10 → 31.5 per rung.
    const levels = numericLevels({ anchor: 250, count: 2, autoScale: true })
    assert.deepEqual(levels, [281.5, 313])
  })
})
