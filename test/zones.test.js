import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addMonths } from '../engine/fairvalue.js'
import { monthlyMultiples, ownPercentile, zoneOf, pegZone } from '../engine/zones.js'

const funds = () => Array.from({ length: 6 }, (_, i) => ({ year: 2010 + i, eps: 1 + i, rev: 100, fcf: 10, ebitda: 20, debt: 5, ni: 10 * (1 + i), shares: 10 }))
const closes = (from, n, f) => {
  const m = new Map()
  for (let i = 0, k = from; i < n; i += 1, k = addMonths(k, 1)) m.set(k, f(i))
  return m
}

test('monthly multiples read the fiscal year known that month, never a later one', () => {
  const s = monthlyMultiples(funds(), closes('2011-01', 30, () => 20), 'Technology')
  // April 2012: fiscal 2010 (EPS 1) is the latest known; May 2012: fiscal 2011 (EPS 2).
  assert.equal(s.get('2012-04').pe, 20)
  assert.equal(s.get('2012-05').pe, 10)
  assert.equal(s.get('2011-04').pe, undefined) // nothing known before May 2011
  assert.equal(s.get('2012-05').ev, (20 * 10 + 5) / 20) // 10 shares, debt 5, EBITDA 20
  assert.equal(s.get('2012-05').pfcf, 20 / (10 / 10))
  assert.equal(s.get('2012-05').ps, 20 / (100 / 10))
  assert.equal(monthlyMultiples(funds(), closes('2011-01', 30, () => 20), 'Finance').get('2012-05').pfcf, undefined)
})

test('price stretch needs all 48 closes up to the month', () => {
  const s = monthlyMultiples([], closes('2000-01', 60, (i) => (i < 47 ? 10 : 20)), null)
  assert.equal(s.get(addMonths('2000-01', 46)).stretch, undefined) // 47 closes only
  assert.equal(s.get(addMonths('2000-01', 47)).stretch, 20 / ((47 * 10 + 20) / 48))
})

test('own-history percentile: months before d only, ties half, at least 36 of them', () => {
  const series = new Map()
  for (let i = 0; i < 40; i += 1) series.set(addMonths('2010-01', i), { pe: i % 10 }) // 0..9 repeating
  const d = addMonths('2010-01', 39) // value 9, and a later month that must not count
  series.set(addMonths('2010-01', 40), { pe: 100 })
  // 39 earlier months (0–9 three times, then 0–8): 36 below 9, 3 equal to it.
  assert.equal(ownPercentile(series, 'pe', d), (36 + 0.5 * 3) / 39)
  assert.equal(ownPercentile(series, 'pe', addMonths('2010-01', 35)), null) // only 35 earlier months
  assert.equal(ownPercentile(series, 'ps', d), null)
})

test('zones: bottom and top fifths; PEG below 1 and above 2', () => {
  assert.deepEqual([0.2, 0.21, 0.79, 0.8, null].map(zoneOf), ['buy', null, null, 'sell', null])
  assert.deepEqual([0.9, 1, 2, 2.1, null].map(pegZone), ['buy', null, null, 'sell', null])
})
