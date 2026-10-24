// Resampling daily bars up to weekly and monthly, so the timeframe question can be
// answered on data rather than opinion.
//
// Intraday is not available on this data plan, so the ladder can only be tested at daily
// and above. That limit is stated in the results rather than papered over.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { resample } from '../engine/resample.js'

const bar = (date, open, high, low, close) => ({ date, open, high, low, close })

describe('resample to weekly', () => {
  // 2024-01-01 is a Monday. 2024-01-08 is the next Monday.
  const daily = [
    bar('2024-01-01', 10, 12, 9, 11),
    bar('2024-01-02', 11, 15, 10, 14),
    bar('2024-01-03', 14, 16, 8, 9),
    bar('2024-01-04', 9, 11, 7, 10),
    bar('2024-01-05', 10, 13, 9, 12),
    bar('2024-01-08', 12, 20, 11, 19),
    bar('2024-01-09', 19, 21, 18, 20),
  ]

  test('groups by calendar week', () => {
    assert.equal(resample(daily, 'weekly').length, 2)
  })

  test('open is the first open, close is the last close', () => {
    const [w1, w2] = resample(daily, 'weekly')
    assert.equal(w1.open, 10)
    assert.equal(w1.close, 12)
    assert.equal(w2.open, 12)
    assert.equal(w2.close, 20)
  })

  test('high is the max and low is the min across the week', () => {
    const [w1, w2] = resample(daily, 'weekly')
    assert.equal(w1.high, 16)
    assert.equal(w1.low, 7)
    assert.equal(w2.high, 21)
    assert.equal(w2.low, 11)
  })

  test('the bar is dated to the first session of the week', () => {
    const [w1] = resample(daily, 'weekly')
    assert.equal(w1.date, '2024-01-01')
  })

  test('a week split across a month boundary stays one week', () => {
    const across = [
      bar('2024-01-31', 5, 6, 4, 5),   // Wednesday
      bar('2024-02-01', 5, 8, 5, 7),   // Thursday, same week
    ]
    assert.equal(resample(across, 'weekly').length, 1)
  })
})

describe('resample to monthly', () => {
  const daily = [
    bar('2024-01-05', 10, 12, 9, 11),
    bar('2024-01-31', 11, 18, 10, 17),
    bar('2024-02-01', 17, 19, 6, 8),
    bar('2024-03-15', 8, 9, 7, 9),
  ]

  test('groups by calendar month', () => {
    const out = resample(daily, 'monthly')
    assert.equal(out.length, 3)
    assert.deepEqual(out.map((b) => b.date), ['2024-01-05', '2024-02-01', '2024-03-15'])
  })

  test('aggregates OHLC correctly', () => {
    const [jan, feb] = resample(daily, 'monthly')
    assert.deepEqual([jan.open, jan.high, jan.low, jan.close], [10, 18, 9, 17])
    assert.deepEqual([feb.open, feb.high, feb.low, feb.close], [17, 19, 6, 8])
  })
})

describe('resample integrity', () => {
  const daily = [
    bar('2024-01-01', 10, 12, 9, 11),
    bar('2024-01-02', 11, 15, 10, 14),
    bar('2024-01-08', 12, 20, 11, 19),
  ]

  test('daily passes through unchanged', () => {
    assert.deepEqual(resample(daily, 'daily'), daily)
  })

  test('every resampled bar satisfies low <= open,close <= high', () => {
    for (const tf of ['weekly', 'monthly']) {
      for (const b of resample(daily, tf)) {
        assert.ok(b.low <= b.open && b.open <= b.high, `${tf} open`)
        assert.ok(b.low <= b.close && b.close <= b.high, `${tf} close`)
      }
    }
  })

  test('no bar is dropped — the total range is preserved', () => {
    const weekly = resample(daily, 'weekly')
    assert.equal(Math.max(...weekly.map((b) => b.high)), Math.max(...daily.map((b) => b.high)))
    assert.equal(Math.min(...weekly.map((b) => b.low)), Math.min(...daily.map((b) => b.low)))
  })

  test('rejects an unknown timeframe rather than silently passing bars through', () => {
    assert.throws(() => resample(daily, '4hour'), /unsupported|unknown/i)
  })
})
