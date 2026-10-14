import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectAt } from '../engine/projection.js'
import { addMonths } from '../engine/fairvalue.js'

// Flat company: revenue 100, net margin 10%, EPS 1, price 20 for years (P/E always 20).
const funds = (rev = 100) => Array.from({ length: 12 }, (_, i) => ({ year: 2010 + i, rev, ni: 10, eps: 1, shares: 10, fcf: 8, ebitda: 20, debt: 0, gp: 50 }))
const closes = () => {
  const m = new Map()
  for (let i = 0, mo = '2015-01'; i < 120; i += 1, mo = addMonths(mo, 1)) m.set(mo, 20)
  return m
}

test('base case: revenue fades from 0% to 4% growth, margin and P/E 20 held', () => {
  const p = projectAt(funds(), closes(), '2022-10')
  assert.equal(p.kind, 'earnings')
  assert.deepEqual(p.exitMult, [15, 20, 25])
  const rev5 = 100 * 1.01 * 1.02 * 1.03 * 1.04
  assert.ok(Math.abs(p.rows[4].base - (rev5 * 0.1 / 10) * 20) < 1e-9)
  assert.ok(p.rows[4].bear < p.rows[4].base && p.rows[4].base <= p.rows[4].bull)
})

test('pre-revenue: no price path, only the revenue needed', () => {
  const p = projectAt(funds(0), closes(), '2022-10')
  assert.equal(p.kind, 'pre')
  assert.ok(p.revNeeded > 0 && p.rows === undefined)
})
