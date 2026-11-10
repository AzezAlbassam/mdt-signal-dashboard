import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lin, impliedGrowth, scoreAt } from '../engine/score.js'
import { addMonths, dcf } from '../engine/fairvalue.js'

const funds = () =>
  Array.from({ length: 12 }, (_, i) => {
    const eps = 1 + 0.15 * i
    return { year: 2010 + i, eps, rev: 100 * 1.12 ** i, fcf: 9 * 1.12 ** i, ebitda: 25 * 1.12 ** i, debt: 30, ni: eps * 10, shares: 10, gp: 50 * 1.12 ** i }
  })
const closes = () => {
  const m = new Map()
  let month = '2010-01'
  for (let i = 0; i < 200; i += 1) {
    m.set(month, 25 + 6 * Math.sin(i / 5) + i * 0.15)
    month = addMonths(month, 1)
  }
  return m
}

test('lin is clamped and can fall', () => {
  assert.equal(lin(5, 0, 10), 0.5)
  assert.equal(lin(-1, 0, 10), 0)
  assert.equal(lin(2.5, 4, 1), 0.5)
  assert.equal(lin(0.5, 4, 1), 1)
})

test('implied growth inverts the DCF', () => {
  const g = impliedGrowth(5, dcf(5, 0.12, 0.09, 0.025))
  assert.ok(Math.abs(g - 0.12) < 1e-6)
  assert.equal(impliedGrowth(5, 1), -0.2)
  assert.equal(impliedGrowth(-1, 100), null)
})

test('score is 0–10 with five parts of 0–2', () => {
  const s = scoreAt(funds(), closes(), 'Technology Services', '2017-05')
  assert.ok(s.total != null)
  for (const v of Object.values(s.parts)) assert.ok(v >= 0 && v <= 2)
  assert.ok(s.total >= 0 && s.total <= 10)
  assert.equal(s.fiscalYear, 2016)
})

test('no look-ahead: later years and later prices change nothing', () => {
  const month = '2017-05'
  const base = scoreAt(funds(), closes(), 'Technology Services', month)
  const f2 = funds().map((f) => (f.year > 2016 ? { ...f, eps: -9, rev: 1, fcf: -50, ebitda: -3, ni: -90, debt: 900 } : f))
  const c2 = new Map([...closes()].map(([k, v]) => [k, k > month ? v * 7 : v]))
  assert.deepEqual(scoreAt(f2, c2, 'Technology Services', month), base)
})

test('finance sector skips debt ÷ EBITDA', () => {
  const f = funds().map((x) => ({ ...x, ebitda: null, gp: null }))
  const s = scoreAt(f, closes(), 'Finance', '2017-05')
  assert.equal(s.detail.d1, null)
  assert.equal(s.parts.D, 2 * s.detail.d2)
})

test('live counts every fiscal year as reported', () => {
  const s = scoreAt(funds(), closes(), 'Technology Services', '2021-10')
  const live = scoreAt(funds(), closes(), 'Technology Services', '2021-10', true)
  assert.equal(s.fiscalYear, 2020)
  assert.equal(live.fiscalYear, 2021)
})

test('financials get no free-cash-flow measures', () => {
  const f = funds().map((x) => ({ ...x, ebitda: null, gp: null, fcf: x.ni * 5 }))
  const s = scoreAt(f, closes(), 'Finance', '2017-05')
  assert.equal(s.detail.gStar, null)
  assert.equal(s.detail.b2, null)
  assert.equal(s.parts.B, 2 * s.detail.b1)
  assert.equal(s.detail.checks, 3) // profit, revenue up, EPS up
  assert.ok(s.total != null)
})

test('live: history is built on the same fiscal-year offset as today (mid-year fiscal years)', () => {
  // FY labels run to 2021 at 2021-10 (one year past the May rule). The price is always 20 × the
  // EPS of the year that is out, so with a consistent history today's P/E equals every past one.
  const f = funds()
  const closes2 = new Map()
  for (let m = '2015-01'; m <= '2021-10'; m = addMonths(m, 1)) {
    const y = Number(m.slice(0, 4)) - (Number(m.slice(5)) >= 5 ? 1 : 2) + 1
    closes2.set(m, 20 * f.find((x) => x.year === Math.min(2021, y)).eps)
  }
  const s = scoreAt(f, closes2, 'Technology Services', '2021-10', true)
  assert.equal(s.detail.pct_pe, 0.5)
})
