import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decCloses, sharesFor, capAt, rules, rankByCap, bucketOf, transitions } from '../engine/caps.js'

const t = (iso) => Date.parse(iso) / 1000

test('December closes: only December bars, keyed by year', () => {
  const bars = { t: [t('2015-11-02T14:30:00Z'), t('2015-12-01T14:30:00Z'), t('2016-01-04T14:30:00Z'), t('2016-12-01T14:30:00Z')], c: [9, 10, 11, 0] }
  assert.deepEqual(decCloses(bars), { 2015: 10 }) // a zero close is not a close
})

test('shares: the labelled year, else the nearest, the earlier on a tie (flagged)', () => {
  const funds = [{ year: 2014, shares: 100 }, { year: 2016, shares: 120 }, { year: 2017, shares: null }]
  assert.deepEqual(sharesFor(funds, 2016), { shares: 120, year: 2016, flagged: false })
  assert.deepEqual(sharesFor(funds, 2015), { shares: 100, year: 2014, flagged: true })
  assert.deepEqual(sharesFor(funds, 2018), { shares: 120, year: 2016, flagged: true })
  assert.equal(sharesFor([{ year: 2015, shares: null }], 2015), null)
})

test('cap = December close × shares of that fiscal year', () => {
  const r = capAt({ 2020: 50 }, [{ year: 2020, shares: 4 }], 2020)
  assert.equal(r.cap, 200)
  assert.equal(capAt({ 2020: 50 }, [{ year: 2020, shares: 4 }], 2021), null)
})

test('rules read FY Y−1 and Y−3 revenue, never FY Y', () => {
  const funds = [{ year: 2016, rev: 100 }, { year: 2017, rev: 1 }, { year: 2018, rev: 400 }, { year: 2019, rev: 1e9 }]
  const r = rules({ 2018: 50, 2019: 100 }, funds, 2019, 'Electronic Technology')
  assert.equal(r.G, 0.5 * Math.log(400 / 100)) // FY2019's 1e9 is not used at December 2019
  assert.equal(r.V, 400 / 100)
  assert.equal(r.M, Math.log(2))
  assert.equal(r.S, -Math.log(100))
  assert.equal(rules({ 2019: 100 }, funds, 2019, 'Finance').V, null)
  assert.equal(rules({ 2019: 100 }, funds, 2019, 'Finance').M, null)
})

test('ranks largest first; buckets', () => {
  const r = rankByCap([{ key: 'a', cap: 5 }, { key: 'b', cap: 9 }, { key: 'c', cap: null }])
  assert.deepEqual([...r], [['b', 1], ['a', 2]])
  assert.equal(bucketOf(10), '1–10')
  assert.equal(bucketOf(11), '11–20')
  assert.equal(bucketOf(101), 'below 100')
})

test('transitions count dead companies as no longer trading, others as below 100', () => {
  const ranks = { 2015: new Map([['a', 1], ['b', 2], ['c', 15]]), 2016: new Map([['c', 3]]) }
  const out = transitions(ranks, new Map([['a', 2015]]), 1)
  assert.deepEqual(out, { '1–10': { 'no longer trading': 1, 'below 100': 1 }, '11–20': { '1–10': 1 } })
})
