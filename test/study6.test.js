// Study 6 checks (PROTOCOL-study6.md), written before any study 6 result was computed.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import zlib from 'node:zlib'

import * as I from '../engine/indicators.js'
import { events6, exit6, pivotLowsConfirmed, ENTRIES6 } from '../engine/study6.js'

const loadGz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
const spy = loadGz('data/us/bars/AMEX_SPY.json.gz')
const btc = JSON.parse(fs.readFileSync('data/swing/BITSTAMP_BTCUSD.json', 'utf8'))
const sol = loadGz('data/crypto/bars/BINANCE_SOLUSDT.json.gz')
const cut = (s, n) => ({ ...s, ...Object.fromEntries(['date', 'open', 'high', 'low', 'close', 'volume'].map((f) => [f, s[f].slice(0, n)])) })

describe('study 6 events', () => {
  for (const [name, s] of [['SPY', spy], ['BTC', btc], ['SOL', sol]]) {
    test(`${name}: all five entries fire and nothing looks ahead`, () => {
      const a = events6(s)
      for (const id of ENTRIES6) assert.ok(a.events[id].some(Boolean), `${id} never fires`)
      for (const frac of [0.5, 0.8, 0.97]) {
        const n = Math.floor(s.close.length * frac)
        const b = events6(cut(s, n))
        for (const id of ENTRIES6) assert.deepEqual(a.events[id].slice(0, n), b.events[id], `${id} at ${frac}`)
        assert.deepEqual(a.flt.closeLong.slice(0, n), b.flt.closeLong, `closeLong at ${frac}`)
      }
    })
  }

  test('breakout cluster = 3 of the last 5 breakout bars, none in the 20 bars before', () => {
    const { flt } = events6(btc)
    let last = -Infinity
    for (let i = 0; i < flt.cluster.length; i += 1) {
      const k = i >= 4 ? flt.breakout.slice(i - 4, i + 1).filter(Boolean).length : 0
      const expect = k >= 3 && i - last > 20
      assert.equal(flt.cluster[i], expect, `bar ${i}`)
      if (expect) last = i
    }
  })

  test('every MOD signal: confirmed pivot, lower low, at least 2 of 4 oscillators higher', () => {
    const s = btc
    const { mod } = events6(s)
    const at = pivotLowsConfirmed(s.low, 5)
    const osc = [I.rsi(s.close, 14), I.macd(s.close).macd, I.obv(s.close, s.volume), I.mfi(s.high, s.low, s.close, s.volume, 14)]
    let n = 0
    for (let c = 0; c < s.close.length; c += 1) {
      if (!mod.bull[c]) continue
      n += 1
      const p2 = at[c]
      assert.ok(p2 === c - 5)
      let p1 = -1
      for (let k = c - 1; k >= 0; k -= 1) if (at[k] >= 0) { p1 = at[k]; break }
      assert.ok(p1 >= 0 && p2 - p1 <= 60 && s.low[p2] < s.low[p1])
      assert.ok(osc.filter((o) => o[p2] > o[p1]).length >= 2)
    }
    assert.ok(n > 10, `only ${n} MOD signals on BTC`)
  })

  test('DB = the first breakout 1..20 bars after a MOD signal', () => {
    const { events, flt, mod } = events6(btc)
    for (let i = 0; i < events.DB.length; i += 1) {
      if (!events.DB[i]) continue
      assert.ok(flt.breakout[i])
      let m = -1
      for (let k = i - 1; k >= Math.max(0, i - 20); k -= 1) if (mod.bull[k]) { m = k; break }
      assert.ok(m >= 0, `no MOD before DB at ${i}`)
      for (let k = m + 1; k < i; k += 1) assert.ok(!flt.breakout[k], `earlier breakout at ${k}`)
    }
  })
})

describe('pivots', () => {
  test('strict 5-bar pivot low, known only 5 bars later', () => {
    const low = [9, 8, 7, 6, 5, 4, 5, 6, 7, 8, 9, 9, 9]
    const at = pivotLowsConfirmed(low, 5)
    assert.deepEqual([...at].map((p, c) => [c, p]).filter(([, p]) => p >= 0), [[10, 5]])
    const tie = [9, 8, 7, 6, 5, 4, 4, 6, 7, 8, 9, 9, 9]
    assert.ok([...pivotLowsConfirmed(tie, 5)].every((p) => p < 0), 'a tie is not a pivot')
  })
})

describe('study 6 exits', () => {
  const s = { date: 'abcdefghij'.split(''), open: [10, 10, 11, 12, 13, 14, 15, 16, 17, 18], close: [10, 11, 12, 13, 9, 15, 16, 17, 18, 19] }
  const none = new Array(10).fill(false)
  test('X sells at the next open after Close Long', () => {
    const cl = none.slice(); cl[4] = true
    const t = exit6(s, 0, 'X', cl)
    assert.equal(t.exitIndex, 5)
    assert.equal(t.reason, 'close-long')
    assert.ok(Math.abs(t.ret - ((14 * 0.999) / (10 * 1.001) - 1)) < 1e-12)
  })
  test('X ignores a Close Long on the signal bar itself', () => {
    const cl = none.slice(); cl[0] = true; cl[2] = true
    assert.equal(exit6(s, 0, 'X', cl).exitIndex, 3)
  })
  test('X: Close Long on the last bar → not finished', () => {
    const cl = none.slice(); cl[9] = true
    assert.equal(exit6(s, 0, 'X', cl), null)
  })
  test('H20 sells at the close of bar i+20, null past the data', () => {
    const long = { open: Array.from({ length: 30 }, (_, i) => 10 + i), close: Array.from({ length: 30 }, (_, i) => 10.5 + i) }
    const t = exit6(long, 2, 'H20', [])
    assert.equal(t.exitIndex, 22)
    assert.ok(Math.abs(t.ret - ((32.5 * 0.999) / (13 * 1.001) - 1)) < 1e-12)
    assert.equal(exit6(long, 9, 'H20', []).exitIndex, 29)
    assert.equal(exit6(long, 10, 'H20', []), null)
  })
})
