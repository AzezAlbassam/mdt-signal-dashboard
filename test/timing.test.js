// The yardsticks for "does buying in the zone beat buying any other time".

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  accumulate,
  accumulateNull,
  conditional,
  deepTroughs,
  episodes,
  forwardReturns,
  median,
  pooledRotation,
  rotationNull,
} from '../engine/timing.js'
import { seededRng } from '../engine/null-models.js'

describe('forwardReturns', () => {
  test('enters at the next open and exits h closes later', () => {
    const open = [1, 2, 4, 8]
    const close = [1, 3, 5, 9]
    const f = forwardReturns(open, close, 2)
    assert.equal(f[0], 5 / 2 - 1)
    assert.equal(f[1], 9 / 4 - 1)
  })

  test('weeks whose window runs past the data have no return', () => {
    const f = forwardReturns([1, 1, 1], [1, 1, 1], 2)
    assert.ok(Number.isNaN(f[1]) && Number.isNaN(f[2]))
  })
})

describe('conditional', () => {
  test('separates flagged weeks from all eligible weeks', () => {
    const fwd = [0.1, -0.1, 0.3, 0.5, Number.NaN]
    const mask = [true, false, true, false, true]
    const elig = [true, true, true, false, true]
    const c = conditional(mask, fwd, elig)
    assert.equal(c.nSignal, 2)
    assert.equal(c.nAll, 3)
    assert.equal(c.hitSignal, 1)
    assert.ok(Math.abs(c.medianSignal - 0.2) < 1e-12)
  })
})

describe('rotationNull', () => {
  test('a flag that sits exactly on the best weeks is significant', () => {
    const n = 400
    const fwd = Array.from({ length: n }, (_, i) => (i % 40 < 4 ? 0.5 : -0.01))
    const mask = fwd.map((x) => x > 0)
    const r = rotationNull(mask, fwd, new Array(n).fill(true))
    assert.ok(r.observed > 0)
    assert.ok(r.p < 0.2, `p = ${r.p}`)
  })

  test('is exact: a perfectly aligned flag with no ties gets the smallest possible p', () => {
    const n = 50
    const fwd = Array.from({ length: n }, (_, i) => (i === 7 ? 1 : i * 0.001))
    const mask = fwd.map((_, i) => i === 7)
    const r = rotationNull(mask, fwd, new Array(n).fill(true))
    assert.equal(r.p, 1 / n)
  })

  test('a flag unrelated to returns is not', () => {
    const rng = seededRng(3)
    const n = 1000
    const fwd = Array.from({ length: n }, () => rng() - 0.5)
    const mask = Array.from({ length: n }, (_, i) => Math.floor(i / 25) % 7 === 0)
    const r = rotationNull(mask, fwd, new Array(n).fill(true))
    assert.ok(r.p > 0.05, `p = ${r.p}`)
  })
})

describe('pooledRotation', () => {
  test('draws each asset independently, so identical assets do not move in lockstep', () => {
    const n = 300
    const mask = Array.from({ length: n }, (_, i) => Math.floor(i / 15) % 4 === 0)
    const fwd = mask.map((_, i) => Math.sin(i / 7) * 0.1)
    const one = rotationNull(mask, fwd, new Array(n).fill(true), { keepNulls: true })
    const single = pooledRotation([one], { draws: 4000, seed: 5 })
    const many = pooledRotation(new Array(8).fill(one), { draws: 4000, seed: 5 })
    // Averaging independent draws of the same null narrows it, so the pooled p moves away
    // from the single-asset p; lockstep draws would leave it unchanged.
    assert.notEqual(Math.round(single.p * 100), Math.round(many.p * 100))
  })

  test('pooling several weak but genuine edges gives more power than any one of them', () => {
    const tests = [1, 2, 3, 4, 5, 6].map((seed) => {
      const rng = seededRng(seed)
      const n = 600
      const mask = Array.from({ length: n }, (_, i) => Math.floor(i / 20) % 5 === 0)
      const fwd = mask.map((m) => (rng() - 0.5) * 0.4 + (m ? 0.04 : 0))
      return rotationNull(mask, fwd, new Array(n).fill(true), { keepNulls: true })
    })
    const pooled = pooledRotation(tests, { draws: 2000, seed: 3 })
    assert.equal(pooled.assets, 6)
    assert.ok(pooled.p <= Math.min(...tests.map((t) => t.p)) + 0.02, `pooled ${pooled.p}`)
  })
})

describe('accumulate', () => {
  test('with the flag always on, zone buying is DCA', () => {
    const px = [10, 8, 12, 9, 11]
    const r = accumulate(px, px, px.map(() => true))
    assert.ok(Math.abs(r.ratio - 1) < 1e-12)
    assert.equal(r.cashLeft, 0)
  })

  test('with the flag never on, the money is still cash at the end', () => {
    const px = [10, 8, 12, 9, 11]
    const r = accumulate(px, px, px.map(() => false))
    assert.equal(r.zone, r.paidIn)
    assert.equal(r.buys, 0)
  })

  test('buying only the dip beats DCA when the dip is the low', () => {
    const open = [10, 10, 5, 10, 10, 10]
    const close = [10, 10, 5, 10, 10, 10]
    const mask = [false, true, false, false, false, false]
    const r = accumulate(open, close, mask)
    assert.ok(r.ratio > 1, `ratio ${r.ratio}`)
  })

  test('the null distribution brackets 1 for a flag that is on half the time at random', () => {
    const rng = seededRng(5)
    const px = [100]
    for (let i = 1; i < 300; i += 1) px.push(px[i - 1] * (1 + (rng() - 0.5) * 0.1))
    const mask = px.map((_, i) => Math.floor(i / 10) % 2 === 0)
    const r = accumulateNull(px, px, mask)
    assert.ok(r.null05 < 1.05 && r.null95 > 0.95)
  })
})

describe('episodes', () => {
  test('bridges short gaps and splits long ones', () => {
    const m = [false, true, true, false, true, false, false, false, false, false, true]
    assert.deepEqual(episodes(m, { mergeGap: 2 }), [{ start: 1, end: 4 }, { start: 10, end: 10 }])
  })
})

describe('deepTroughs', () => {
  test('finds the low of each drawdown deeper than the threshold', () => {
    const c = [100, 90, 40, 60, 110, 50, 30, 45]
    const t = deepTroughs(c, { depth: 0.5 })
    assert.deepEqual(t[0], { peakIdx: 0, troughIdx: 2 })
    assert.equal(t[1].troughIdx, 6)
    assert.equal(t[1].unrecovered, true)
  })
})

describe('median', () => {
  test('even and odd lengths', () => {
    assert.equal(median([3, 1, 2]), 2)
    assert.equal(median([4, 1, 3, 2]), 2.5)
  })
})
