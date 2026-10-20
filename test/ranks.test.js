import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addMonths } from '../engine/fairvalue.js'
import { percentiles, sectorPercentiles, nearHigh, momentum, residualMomentum, assetsByYear } from '../engine/ranks.js'

const series = (from, xs) => new Map(xs.map((x, i) => [addMonths(from, i), x]))

test('percentiles: (average rank − 0.5) ÷ n, ties share', () => {
  assert.deepEqual(percentiles([10, 30, 20, 20]), [0.125, 0.875, 0.5, 0.5])
})

test('sector percentiles need at least 5 in the sector', () => {
  const rows = [...[1, 2, 3, 4, 5].map((x) => ({ key: `a${x}`, sector: 'A', x })), ...[1, 2].map((x) => ({ key: `b${x}`, sector: 'B', x }))]
  const p = sectorPercentiles(rows)
  assert.equal(p.get('a1'), 0.1)
  assert.equal(p.get('a5'), 0.9)
  assert.equal(p.has('b1'), false)
})

test('52-week high: 12 monthly highs to the month, all present; later months ignored', () => {
  const highs = series('2020-06', [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 100])
  const closes = series('2020-06', Array(13).fill(8))
  assert.equal(nearHigh(closes, highs, '2021-05'), 8 / 16) // June 2021's 100 is after May 2021
  assert.equal(nearHigh(closes, highs, '2021-04'), null) // May 2020 missing
})

test('12-1 momentum: April R over May R−1, May R skipped', () => {
  const c = series('2020-05', [10, ...Array(10).fill(12), 15, 1000])
  assert.equal(momentum(c, '2021-05'), 15 / 10 - 1)
})

test('residual momentum: a steady rise beyond the market ranks high, a steady fall low', () => {
  const mkt = new Map()
  const up = new Map()
  const down = new Map()
  let u = 100
  let d = 100
  for (let i = 0; i < 37; i += 1) {
    const m = addMonths('2018-04', i)
    const r = 0.02 * Math.sin(i)
    const extra = i > 25 ? 0.01 + 0.001 * (i % 3) : 0
    if (i > 0) { mkt.set(m, r); u *= 1 + r + extra; d *= 1 + r - extra }
    up.set(m, u)
    down.set(m, d)
  }
  const end = addMonths('2018-04', 36)
  assert.ok(residualMomentum(up, mkt, end) > 3)
  assert.ok(residualMomentum(down, mkt, end) < -3)
  assert.equal(residualMomentum(up, mkt, addMonths(end, 1)), null) // a month without a close
})

test('total assets: a fiscal year takes the unique index whose revenue matches within 0.1%', () => {
  const funds = [{ year: 2023, rev: 100 }, { year: 2024, rev: 110 }, { year: 2025, rev: 120 }]
  const m = assetsByYear(funds, [900, 800, 700], [120.05, 110, 100.5])
  assert.equal(m.get(2025), 900)
  assert.equal(m.get(2024), 800)
  assert.equal(m.has(2023), false) // 100.5 is 0.5% off
  assert.equal(assetsByYear([{ year: 2025, rev: 100 }], [1, 2], [100, 100]).size, 0) // two matches
})
