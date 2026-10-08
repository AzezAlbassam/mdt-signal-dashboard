// How many forward trades it takes to tell an edge from luck.
//
// This is the calculation that settles the "who is better" question, and it cuts both
// ways. A claim as large as his needs almost no evidence to establish — which is exactly
// why the absence of that evidence is informative. A realistic edge needs hundreds of
// trades, which is why nobody can tell you in a month whether they have one.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { normalQuantile, sampleSizeFor, breakEvenRate } from '../engine/power.js'

describe('normalQuantile', () => {
  test('matches the standard critical values', () => {
    assert.ok(Math.abs(normalQuantile(0.95) - 1.644854) < 1e-5)
    assert.ok(Math.abs(normalQuantile(0.975) - 1.959964) < 1e-5)
    assert.ok(Math.abs(normalQuantile(0.80) - 0.841621) < 1e-5)
  })

  test('is zero at the median and antisymmetric', () => {
    assert.ok(Math.abs(normalQuantile(0.5)) < 1e-9)
    assert.ok(Math.abs(normalQuantile(0.9) + normalQuantile(0.1)) < 1e-6)
  })

  test('rejects probabilities outside (0, 1)', () => {
    assert.throws(() => normalQuantile(0), /between/i)
    assert.throws(() => normalQuantile(1), /between/i)
  })
})

describe('breakEvenRate', () => {
  test('is stop / (stop + target)', () => {
    assert.equal(breakEvenRate(2, 3), 0.4)
    assert.equal(breakEvenRate(2, 2), 0.5)
    assert.equal(breakEvenRate(3, 2), 0.6)
  })

  test('a bigger target lowers the bar', () => {
    assert.ok(breakEvenRate(2, 10) < breakEvenRate(2, 3))
  })
})

describe('sampleSizeFor — trades needed at 5% one-sided, 80% power', () => {
  // Against a 40% break-even (his own 2% stop / 3% target).

  test('a 90% claim is settled by five trades', () => {
    assert.equal(sampleSizeFor(0.40, 0.90), 5)
  })

  test('a strong 60% edge needs 38', () => {
    assert.equal(sampleSizeFor(0.40, 0.60), 38)
  })

  test('a realistic 50% edge needs 151', () => {
    assert.equal(sampleSizeFor(0.40, 0.50), 151)
  })

  test('a small 45% edge needs 600', () => {
    assert.equal(sampleSizeFor(0.40, 0.45), 600)
  })

  test('the smaller the claimed edge, the more evidence it takes — steeply', () => {
    const big = sampleSizeFor(0.40, 0.60)
    const small = sampleSizeFor(0.40, 0.45)
    assert.ok(small > big * 10, `${small} vs ${big}`)
  })

  test('an edge that does not clear break-even is not a testable claim', () => {
    assert.throws(() => sampleSizeFor(0.40, 0.40), /greater/i)
    assert.throws(() => sampleSizeFor(0.40, 0.35), /greater/i)
  })
})

describe('the asymmetry that matters', () => {
  test('his public record has fewer forward calls than his claim would need', () => {
    // 98 public posts, 2021-2025, contained 2 unambiguous forward-dated calls.
    // Establishing 90% against a 40% break-even takes 5.
    const needed = sampleSizeFor(0.40, 0.90)
    const published = 2
    assert.ok(published < needed, `${published} published vs ${needed} needed`)
  })

  test('and his own $2 SPX setup needs far more, because its bar is far higher', () => {
    // -99% loss against a +10% win: break-even is about 91%.
    const be = breakEvenRate(99, 10)
    assert.ok(be > 0.9, `${be}`)
    // Showing 95% against that bar takes hundreds of trades, not a good month.
    assert.ok(sampleSizeFor(be, 0.95) > 100)
  })
})

describe('the forward-test page quotes these numbers — keep them in sync', () => {
  // forward.html prints a reference table of sample sizes. It cannot import this module
  // (it is a standalone static page), so this test is what stops the two drifting apart.
  // If you change the engine, this fails and the page must be updated to match.
  const PAGE_TABLE = [
    { claim: 0.999, shown: 2 },
    { claim: 0.90, shown: 5 },
    { claim: 0.60, shown: 38 },
    { claim: 0.50, shown: 151 },
    { claim: 0.45, shown: 600 },
    { claim: 0.42, shown: 3729 },
  ]

  for (const { claim, shown } of PAGE_TABLE) {
    test(`a ${(claim * 100).toFixed(1)}% claim needs ${shown} trades`, () => {
      assert.equal(sampleSizeFor(0.40, claim), shown)
    })
  }

  test('the page and the engine agree on the break-even it is measured against', () => {
    assert.equal(breakEvenRate(2, 3), 0.40)
  })
})
