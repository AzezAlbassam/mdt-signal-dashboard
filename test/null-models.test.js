// Tests for the null models the backtest scores his rules against.
//
// The null model IS the experiment. A sloppy null manufactures a fake edge, and the
// first version of this backtest did exactly that: it displaced levels uniformly around
// the anchor's close, so half the random levels landed BELOW the anchor. A level below
// current price is touched on the very next bar, which puts it in a completely different
// regime from a level sitting 15% overhead. His rule then "beat chance" — because it was
// being compared against a different kind of level, not a differently-placed one.
//
// These tests pin the properties that make the comparison honest.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { displaceSameDirection, reLadder, seededRng } from '../engine/null-models.js'

describe('seededRng', () => {
  test('is deterministic for a given seed', () => {
    const a = seededRng(42)
    const b = seededRng(42)
    assert.deepEqual([a(), a(), a()], [b(), b(), b()])
  })

  test('different seeds give different streams', () => {
    assert.notEqual(seededRng(1)(), seededRng(2)())
  })

  test('stays in [0, 1)', () => {
    const r = seededRng(7)
    for (let i = 0; i < 1000; i += 1) {
      const v = r()
      assert.ok(v >= 0 && v < 1, `out of range: ${v}`)
    }
  })
})

describe('displaceSameDirection', () => {
  const anchor = { reference: 100, fromIndex: 3 }

  test('a level above the anchor stays above it', () => {
    const r = seededRng(1)
    for (let i = 0; i < 200; i += 1) {
      const out = displaceSameDirection({ price: 120, ...anchor }, r)
      assert.ok(out.price > 100, `expected above 100, got ${out.price}`)
    }
  })

  test('a level below the anchor stays below it', () => {
    const r = seededRng(1)
    for (let i = 0; i < 200; i += 1) {
      const out = displaceSameDirection({ price: 80, ...anchor }, r)
      assert.ok(out.price < 100, `expected below 100, got ${out.price}`)
    }
  })

  test('magnitude lands within (0, 2x) of the real offset, so the mean matches', () => {
    const r = seededRng(9)
    const offsets = []
    for (let i = 0; i < 5000; i += 1) {
      offsets.push(displaceSameDirection({ price: 120, ...anchor }, r).price - 100)
    }
    assert.ok(Math.min(...offsets) > 0)
    assert.ok(Math.max(...offsets) < 40)
    const mean = offsets.reduce((s, o) => s + o, 0) / offsets.length
    // Uniform on (0, 40) has mean 20 — the same as the real offset of 20.
    assert.ok(Math.abs(mean - 20) < 1, `mean offset ${mean} should be near 20`)
  })

  test('keeps the anchor bar so the level is still only scored forward of it', () => {
    const out = displaceSameDirection({ price: 120, ...anchor }, seededRng(1))
    assert.equal(out.fromIndex, 3)
  })
})

describe('reLadder — is 45 the special number?', () => {
  // His numeric rule is: step = digitSum(low) x 45. This null keeps every part of the
  // rule — same anchors, same digit sum, same ladder — and changes only the multiplier.
  // If 45 carries the information he claims, a random multiplier should score worse.

  test('rebuilds the ladder with the given multiplier', () => {
    const levels = reLadder({ anchorLow: 4103, fromIndex: 10, rungs: 2 }, 45)
    // digitSum(4103) = 8, 8 x 45 = 360
    assert.deepEqual(levels.map((l) => l.price), [4463, 4823])
  })

  test('a different multiplier moves every rung', () => {
    const levels = reLadder({ anchorLow: 4103, fromIndex: 10, rungs: 2 }, 50)
    // 8 x 50 = 400
    assert.deepEqual(levels.map((l) => l.price), [4503, 4903])
  })

  test('preserves the anchor bar on every rung', () => {
    const levels = reLadder({ anchorLow: 4103, fromIndex: 10, rungs: 3 }, 45)
    assert.deepEqual(levels.map((l) => l.fromIndex), [10, 10, 10])
  })

  test('rung count is respected', () => {
    assert.equal(reLadder({ anchorLow: 4103, fromIndex: 0, rungs: 5 }, 45).length, 5)
  })
})
