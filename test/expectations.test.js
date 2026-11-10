import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expectationsAt } from '../engine/expectations.js'
import { addMonths, dcf } from '../engine/fairvalue.js'

// Revenue grows 30%, 30%, then 10% in the last known year (slowing); FCF/share = 1.
const funds = (lastGrowth = 0.1) => {
  const revs = [100, 130, 169, 169 * (1 + lastGrowth)]
  return revs.map((rev, i) => ({ year: 2012 + i, rev, eps: 1 + i * 0.1, ni: 10 + i, fcf: 10, ebitda: 20, debt: 0, shares: 10, gp: rev / 2 }))
}
const closesAt = (price) => {
  const m = new Map()
  let month = '2012-01'
  for (let i = 0; i < 80; i += 1) {
    m.set(month, price)
    month = addMonths(month, 1)
  }
  return m
}

test('RED: the price needs far more growth than delivered, and growth is slowing', () => {
  const price = dcf(1, 0.45, 0.09, 0.025) // implies 45% a year
  const e = expectationsAt(funds(0.1), closesAt(price), '2016-05')
  assert.ok(Math.abs(e.gStar - 0.45) < 1e-4)
  assert.ok(e.slowing)
  assert.equal(e.flag, 'red')
})

test('GREEN: the price implies decline while revenue still grows at its pace', () => {
  const price = dcf(1, -0.05, 0.09, 0.025)
  const e = expectationsAt(funds(0.35), closesAt(price), '2016-05')
  assert.equal(e.slowing, false)
  assert.equal(e.flag, 'green')
})

test('no flag without positive free cash flow, and no look-ahead', () => {
  const f = funds().map((x) => ({ ...x, fcf: -5 }))
  assert.equal(expectationsAt(f, closesAt(30), '2016-05'), null)
  const base = expectationsAt(funds(), closesAt(30), '2016-05')
  const later = [...funds(), { year: 2016, rev: 1, eps: -5, ni: -50, fcf: -9, ebitda: -1, debt: 99, shares: 10, gp: 0 }]
  const c = closesAt(30)
  c.set('2016-06', 999)
  assert.deepEqual(expectationsAt(later, c, '2016-05'), base)
})
