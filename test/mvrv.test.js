// MVRV, its Z-score, and the stock stand-in for realized price.
//
// The properties that matter for honesty are tested directly: nothing here may look
// ahead, and the zero line must not depend on the σ that scales everything else.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  btcBlockHeightAt,
  btcSupplyAt,
  btcSupplyAtHeight,
  costBasisFixedMemory,
  costBasisFromTurnover,
  expandingPercentRank,
  expandingStd,
  fullStd,
  mvrvRatio,
  mvrvZ,
  sma,
} from '../engine/mvrv.js'

const at = (iso) => Date.parse(`${iso}T00:00:00Z`) / 1000
const close = (a, b, tol) => Math.abs(a - b) <= tol

describe('Bitcoin supply from the issuance schedule', () => {
  test('each halving era adds exactly 210,000 × reward', () => {
    assert.equal(btcSupplyAtHeight(210000), 10_500_000)
    assert.equal(btcSupplyAtHeight(420000), 15_750_000)
    assert.equal(btcSupplyAtHeight(630000), 18_375_000)
    assert.equal(btcSupplyAtHeight(840000), 19_687_500)
  })

  test('never reaches 21 million', () => {
    assert.ok(btcSupplyAtHeight(1e9) < 21_000_000)
    assert.ok(btcSupplyAtHeight(1e9) > 20_999_999)
  })

  test('height is exact on the halving dates and monotone between them', () => {
    assert.ok(close(btcBlockHeightAt(Date.UTC(2016, 6, 9, 16, 46, 13) / 1000), 420000, 1e-6))
    let prev = -1
    for (let y = 2009; y <= 2030; y += 1) {
      const h = btcBlockHeightAt(at(`${y}-06-01`))
      assert.ok(h > prev, `height fell in ${y}`)
      prev = h
    }
  })

  test('matches circulating supply as commonly quoted', () => {
    // ~19.6M at the start of 2024, ~19.98M by late 2025 (tolerances generous: the
    // anchors are linear between known blocks).
    assert.ok(close(btcSupplyAt(at('2024-01-01')), 19_580_000, 40_000))
    assert.ok(close(btcSupplyAt(at('2017-01-01')), 16_080_000, 60_000))
  })
})

describe('costBasisFromTurnover — the stock realized price', () => {
  test('full turnover every week means cost basis equals the price', () => {
    const prices = [10, 20, 30]
    const rp = costBasisFromTurnover(prices, [100, 100, 100], 100)
    assert.deepEqual(rp, prices)
  })

  test('no turnover means cost basis never moves', () => {
    const rp = costBasisFromTurnover([10, 20, 30], [0, 0, 0], 100)
    assert.deepEqual(rp, [10, 10, 10])
  })

  test('a quarter of shares trading moves cost basis a quarter of the way', () => {
    const rp = costBasisFromTurnover([10, 20], [0, 25], 100)
    assert.equal(rp[1], 12.5)
  })

  test('turnover above 100% is capped rather than overshooting', () => {
    const rp = costBasisFromTurnover([10, 20], [0, 500], 100)
    assert.equal(rp[1], 20)
  })

  test('scale < 1 lengthens the memory', () => {
    const prices = [10, 20, 20, 20, 20]
    const vols = [0, 10, 10, 10, 10]
    const fast = costBasisFromTurnover(prices, vols, 100, { scale: 1 })
    const slow = costBasisFromTurnover(prices, vols, 100, { scale: 0.25 })
    assert.ok(slow[4] < fast[4])
    assert.ok(slow[4] > 10)
  })

  test('appending future bars never changes past values', () => {
    const prices = [10, 11, 9, 12, 15, 8]
    const vols = [5, 7, 3, 9, 2, 6]
    const short = costBasisFromTurnover(prices.slice(0, 4), vols.slice(0, 4), 50)
    const long = costBasisFromTurnover(prices, vols, 50)
    assert.deepEqual(long.slice(0, 4), short)
  })
})

describe('costBasisFixedMemory', () => {
  test('after one half-life, a step in price is half absorbed', () => {
    const prices = [10, ...new Array(52).fill(20)]
    const rp = costBasisFixedMemory(prices, 52)
    assert.ok(close(rp[52], 15, 1e-9), `got ${rp[52]}`)
  })
})

describe('expandingStd', () => {
  test('agrees with the full-sample σ at the last point', () => {
    const xs = [3, 1, 4, 1, 5, 9, 2, 6]
    const e = expandingStd(xs)
    assert.ok(close(e.at(-1), fullStd(xs), 1e-12))
  })

  test('is NaN until two points exist', () => {
    assert.ok(Number.isNaN(expandingStd([5])[0]))
  })

  test('uses no future data', () => {
    const xs = [1, 2, 3, 100]
    assert.ok(close(expandingStd(xs)[2], 1, 1e-12))
  })
})

describe('mvrvZ', () => {
  const mv = [10, 12, 9, 15, 20, 7]
  const rv = [10, 11, 10, 12, 14, 9]

  test('Z < 0 exactly when MVRV < 1, for either σ', () => {
    const ratio = mvrvRatio(mv, rv)
    for (const std of ['expanding', 'full']) {
      const z = mvrvZ(mv, rv, { std })
      for (let i = 1; i < mv.length; i += 1) {
        assert.equal(z[i] < 0, ratio[i] < 1, `${std} at ${i}`)
      }
    }
  })

  test('the full-sample version uses the future; the expanding one does not', () => {
    const extended = [...mv, 1000]
    const extendedRv = [...rv, 10]
    const zExp = mvrvZ(mv, rv)
    const zExpLonger = mvrvZ(extended, extendedRv)
    assert.deepEqual(zExpLonger.slice(0, mv.length), zExp)

    const zFull = mvrvZ(mv, rv, { std: 'full' })
    const zFullLonger = mvrvZ(extended, extendedRv, { std: 'full' })
    assert.notDeepEqual(zFullLonger.slice(0, mv.length), zFull)
  })
})

describe('expandingPercentRank', () => {
  test('the lowest value so far ranks at 1/n', () => {
    const r = expandingPercentRank([5, 4, 3, 2, 1], { minHistory: 1 })
    assert.deepEqual(r, [1, 0.5, 1 / 3, 0.25, 0.2])
  })

  test('waits for minHistory', () => {
    const r = expandingPercentRank([1, 2, 3], { minHistory: 3 })
    assert.ok(Number.isNaN(r[1]))
    assert.equal(r[2], 1)
  })
})

describe('sma', () => {
  test('averages the trailing window', () => {
    assert.deepEqual(sma([1, 2, 3, 4], 2).slice(1), [1.5, 2.5, 3.5])
    assert.ok(Number.isNaN(sma([1, 2, 3, 4], 2)[0]))
  })
})
