// Study 5 checks (PROTOCOL-study5.md), written before the search was run.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import zlib from 'node:zlib'

import { toWeekly } from '../engine/swing.js'
import { events5, exit5 } from '../engine/study5.js'

const load = (s) => JSON.parse(zlib.gunzipSync(fs.readFileSync(`data/us/bars/${s}.json.gz`)).toString('utf8'))
const spy = toWeekly({ ...load('AMEX_SPY'), group: 'us' }, '2026-10-06')
const aapl = toWeekly({ ...load('NASDAQ_AAPL'), group: 'us' }, '2026-10-06')
const cut = (s, n) => ({ ...s, ...Object.fromEntries(['date', 'open', 'high', 'low', 'close', 'volume'].map((f) => [f, s[f].slice(0, n)])) })

describe('study 5 events', () => {
  test('78 events, hi52 and rs_spy fire, nothing looks ahead', () => {
    const a = events5(aapl, spy)
    assert.equal(Object.keys(a.events).length, 78)
    assert.ok(a.events.hi52.some(Boolean) && a.events.rs_spy.some(Boolean))
    const n = Math.floor(aapl.close.length * 0.6)
    const b = events5(cut(aapl, n), cut(spy, spy.date.findIndex((d) => d > aapl.date[n - 1])))
    for (const k of ['hi52', 'rs_spy']) assert.deepEqual(a.events[k].slice(0, n), b.events[k], k)
  })
})

describe('study 5 exits', () => {
  const s = { date: ['a', 'b', 'c', 'd', 'e', 'f'], open: [10, 10, 11, 12, 13, 14], close: [10, 11, 12, 13, 9, 15] }
  const flat = new Float64Array(6).fill(NaN)
  test('fixed hold: buy next open, sell at the close of the n-th bar, cost both sides', () => {
    const t = exit5(s, 0, 'H3', flat, flat)
    assert.equal(t.exitIndex, 3)
    assert.ok(Math.abs(t.ret - ((13 * 0.999) / (10 * 1.001) - 1)) < 1e-12)
  })
  test('null when the hold runs past the data', () => {
    assert.equal(exit5(s, 3, 'H13', flat, flat), null)
  })
  test('trend exit sells at the next open after a close below SMA 40', () => {
    const sma = new Float64Array([NaN, 10, 11, 12, 12, 12])
    const t = exit5(s, 0, 'T', sma, flat)
    assert.equal(t.exitIndex, 5) // close 9 < 12 at bar 4 → sell at bar 5's open
    assert.ok(Math.abs(t.ret - ((14 * 0.999) / (10 * 1.001) - 1)) < 1e-12)
  })
})
