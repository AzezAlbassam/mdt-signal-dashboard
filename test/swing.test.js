// Checks fixed in PROTOCOL-swing.md §9, written before the backtest was run.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import * as I from '../engine/indicators.js'
import { signals, toWeekly, tradeFrom, tradesFor, regimeReturns, TRACKS } from '../engine/swing.js'

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol

describe('known values', () => {
  test('SMA and the SMA-seeded EMA', () => {
    const x = [1, 2, 3, 4, 5, 6]
    assert.deepEqual(Array.from(I.sma(x, 3)).slice(2), [2, 3, 4, 5])
    const e = I.ema(x, 3)
    assert.ok(Number.isNaN(e[1]))
    assert.equal(e[2], 2) // seed = SMA of the first three
    assert.equal(e[3], 0.5 * 4 + 0.5 * 2) // alpha = 2 / (3 + 1)
  })

  test("Wilder's RMA and ATR", () => {
    const r = I.rma([2, 4, 6, 8], 2)
    assert.equal(r[1], 3)
    assert.equal(r[2], 0.5 * 6 + 0.5 * 3)
    const atr = I.atr([10, 12, 11], [9, 10, 9], [9.5, 11, 10], 2)
    // TR = 1, max(2, 2.5, 0.5) = 2.5, max(2, 0, 2) = 2
    assert.equal(atr[1], 1.75)
    assert.equal(atr[2], 0.5 * 2 + 0.5 * 1.75)
  })

  test('RSI is 100 on a rising series and 0 on a falling one', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i)
    const down = up.slice().reverse()
    assert.equal(I.rsi(up, 14)[29], 100)
    assert.equal(I.rsi(down, 14)[29], 0)
  })

  test('RSI on a hand-worked alternating series', () => {
    // changes +2, −1, +2, −1 … ; with n = 2 the seed is (2+0)/2 = 1 up and (0+1)/2 = 0.5 down
    const x = [10, 12, 11, 13, 12]
    const r = I.rsi(x, 2)
    assert.ok(near(r[2], 100 - 100 / (1 + 1 / 0.5)))
  })

  test('MACD line is EMA12 − EMA26 and the signal is its EMA9', () => {
    const x = Array.from({ length: 80 }, (_, i) => 50 + 10 * Math.sin(i / 5))
    const m = I.macd(x)
    const f = I.ema(x, 12)
    const s = I.ema(x, 26)
    assert.ok(near(m.macd[60], f[60] - s[60]))
    assert.ok(Number.isNaN(m.signal[25 + 7]))
    assert.ok(Number.isFinite(m.signal[25 + 8]))
  })
})

describe('no look-ahead (truncation on real data)', () => {
  const raw = JSON.parse(fs.readFileSync('data/swing/AMEX_SPY.json', 'utf8'))
  const cut = (s, n) => ({ ...s, ...Object.fromEntries(['date', 'open', 'high', 'low', 'close', 'volume'].map((f) => [f, s[f].slice(0, n)])) })

  for (const tf of ['daily', 'weekly']) {
    test(`${tf}: every event, state, ATR and rating is unchanged by later bars`, () => {
      const full = tf === 'weekly' ? toWeekly(raw) : raw
      const n = Math.floor(full.close.length * 0.6)
      const a = signals(full, tf)
      const b = signals(cut(full, n), tf)
      for (const k of Object.keys(b.events)) assert.deepEqual(a.events[k].slice(0, n), b.events[k], `event ${k}`)
      for (const k of Object.keys(b.states)) assert.deepEqual(a.states[k].slice(0, n), b.states[k], `state ${k}`)
      assert.deepEqual(Array.from(a.atr.slice(0, n)), Array.from(b.atr))
      assert.deepEqual(Array.from(a.rating.all.slice(0, n)), Array.from(b.rating.all))
    })
  }

  test('every indicator fires at least once on SPY daily (none is silently dead)', () => {
    const { events } = signals(raw, 'daily')
    for (const [k, e] of Object.entries(events)) assert.ok(e.some(Boolean), k)
  })
})

describe('trade simulator', () => {
  const bars = (rows) => ({
    open: rows.map((r) => r[0]), high: rows.map((r) => r[1]), low: rows.map((r) => r[2]), close: rows.map((r) => r[3]),
  })
  const opts = { stopAtr: 2, targetAtr: 3, horizon: 3 }

  test('a bar spanning stop and target is a loss', () => {
    const s = bars([[100, 100, 100, 100], [100, 104, 96, 100], [100, 100, 100, 100], [100, 100, 100, 100]])
    const t = tradeFrom(s, 0, 1, opts) // stop 98, target 103
    assert.equal(t.reason, 'stop')
    assert.equal(t.exit, 98)
  })

  test('a gap through the stop fills at the open, not the stop', () => {
    const s = bars([[100, 100, 100, 100], [100, 101, 99, 99], [95, 96, 94, 95], [95, 95, 95, 95]])
    const t = tradeFrom(s, 0, 1, opts)
    assert.equal(t.reason, 'stop-gap')
    assert.equal(t.exit, 95)
  })

  test('time exit at the horizon close, cost charged on both sides, R in stop units', () => {
    const s = bars([[100, 100, 100, 100], [100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 99, 101]])
    const t = tradeFrom(s, 0, 1, opts)
    assert.equal(t.reason, 'time')
    assert.equal(t.exitIndex, 3)
    assert.ok(near(t.r, (101 * 0.999 - 100 * 1.001) / 2))
  })

  test('null when the data ends before the horizon', () => {
    const s = bars([[100, 100, 100, 100], [100, 100, 100, 100]])
    assert.equal(tradeFrom(s, 0, 1, opts), null)
  })

  test('signals during an open trade are ignored', () => {
    const outcomes = [{ exitIndex: 3, r: 1 }, { exitIndex: 4, r: 2 }, null, { exitIndex: 6, r: 3 }]
    const t = tradesFor([true, true, false, true], outcomes, 0)
    assert.deepEqual(t.map((x) => x.r), [1, 3])
  })

  test('track settings match the protocol', () => {
    assert.deepEqual(
      [TRACKS.A.stopAtr, TRACKS.A.targetAtr, TRACKS.A.horizon, TRACKS.B.stopAtr, TRACKS.B.targetAtr, TRACKS.B.horizon],
      [2, 3, 10, 2, 4, 13],
    )
  })
})

describe('regimes and weeks', () => {
  test('in at the next open, out at the open after the state turns off', () => {
    const s = { open: [10, 10, 11, 12, 13], close: [10, 10, 12, 13, 13] }
    const { rule, hold, trades } = regimeReturns(s, [false, true, true, false, false], 1, 5)
    assert.equal(rule[0], 0) // state at bar 0 is off → flat over bar 1
    assert.ok(near(rule[1], 12 / (11 * 1.001) - 1)) // bought bar 2's open
    assert.ok(near(rule[2], 13 / 12 - 1))
    assert.ok(near(rule[3], (13 * 0.999) / 13 - 1)) // sold bar 4's open
    assert.equal(hold.length, 4)
    assert.equal(trades.length, 1)
    assert.ok(near(trades[0], (13 * 0.999) / (11 * 1.001) - 1))
  })

  test('Tadawul weeks start on Saturday, others on Monday; the forming week is dropped', () => {
    const days = ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-04', '2026-10-05']
    const mk = (group) => ({ group, date: days, open: days.map(() => 1), high: days.map(() => 2), low: days.map(() => 0.5), close: days.map((_, i) => i), volume: days.map(() => 1) })
    const sa = toWeekly(mk('saudi'), '2026-10-05')
    assert.deepEqual(sa.date, ['2026-09-27']) // Sun 27 – Thu 1 Oct; Sun 4 + Mon 5 still forming
    assert.equal(sa.close[0], 4)
    const us = toWeekly(mk('us'), '2026-10-05')
    assert.deepEqual(us.date, ['2026-09-27', '2026-09-28']) // Sun 27 alone ends the prior Monday week
  })
})
