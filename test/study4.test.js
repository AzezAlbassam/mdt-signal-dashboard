// Study 4 checks (PROTOCOL-study4.md), written before the search was run.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { toWeekly } from '../engine/swing.js'
import { events4, exitE2, exitE3 } from '../engine/study4.js'

const raw = JSON.parse(fs.readFileSync('data/swing/AMEX_SPY.json', 'utf8'))
const cut = (s, n) => ({ ...s, ...Object.fromEntries(['date', 'open', 'high', 'low', 'close', 'volume'].map((f) => [f, s[f].slice(0, n)])) })

describe('76 entry events', () => {
  test('there are exactly 76', () => {
    assert.equal(Object.keys(events4(raw, 'daily').events).length, 76)
  })

  for (const tf of ['daily', 'weekly']) {
    test(`${tf}: no event or filter changes when later bars are added`, () => {
      const full = tf === 'weekly' ? toWeekly(raw) : raw
      for (const frac of [0.5, 0.8]) {
        const n = Math.floor(full.close.length * frac)
        const a = events4(full, tf)
        const b = events4(cut(full, n), tf)
        for (const k of Object.keys(b.events)) assert.deepEqual(a.events[k].slice(0, n), b.events[k], `${k} @${frac}`)
        for (const k of Object.keys(b.filters)) assert.deepEqual(a.filters[k].slice(0, n), b.filters[k], `filter ${k}`)
      }
    })
  }

  test('every event fires on SPY daily (none is silently dead)', () => {
    const dead = Object.entries(events4(raw, 'daily').events).filter(([, e]) => !e.some(Boolean)).map(([k]) => k)
    assert.deepEqual(dead, [])
  })
})

describe('exits E2 and E3', () => {
  const bars = (rows) => ({ open: rows.map((r) => r[0]), high: rows.map((r) => r[1]), low: rows.map((r) => r[2]), close: rows.map((r) => r[3]) })

  test('E2 leaves at the next open after the first close above SMA 5', () => {
    const s = bars([[100, 100, 100, 100], [100, 101, 99, 100], [100, 103, 99, 102], [101, 101, 101, 101], [101, 101, 101, 101]])
    const sma5 = [NaN, 101, 101, 101, 101]
    const t = exitE2(s, 0, 1, sma5, 3)
    assert.equal(t.reason, 'revert')
    assert.equal(t.exitIndex, 3)
    assert.ok(Math.abs(t.r - (101 * 0.999 - 100 * 1.001) / 3) < 1e-12)
  })

  test('E2 disaster stop at 3×ATR', () => {
    const s = bars([[100, 100, 100, 100], [100, 100, 96, 98], [98, 98, 96, 97], [97, 97, 97, 97]])
    const t = exitE2(s, 0, 1, [NaN, 200, 200, 200], 3)
    assert.equal(t.reason, 'stop')
    assert.equal(t.exitIndex, 1)
    assert.ok(t.r < -1)
  })

  test('E3 trails the highest high and never lowers the stop', () => {
    // entry 100, ATR22 = 1 → initial stop 97; high 110 lifts it to 107; low 106 exits at 107
    const s = bars([[100, 100, 100, 100], [100, 110, 99, 109], [109, 109, 108, 108], [108, 108, 106, 107], [107, 107, 107, 107]])
    const t = exitE3(s, 0, [1, 1, 1, 1, 1], 4)
    assert.equal(t.reason, 'stop')
    assert.equal(t.exitIndex, 3)
    assert.ok(t.ret > 0)
  })
})
