import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionVwap, hlc3 } from '../engine/vwap.js'

const bars = [
  { h: 11, l: 9, c: 10, v: 100 },
  { h: 13, l: 11, c: 12, v: 300 },
  { h: 12, l: 8, c: 10, v: 0 },
  { h: 9, l: 6, c: 9, v: 600 },
]

test('VWAP and sigma by hand', () => {
  const r = sessionVwap(bars)
  assert.equal(r[0].vwap, 10)
  assert.equal(r[0].sd, 0)
  assert.equal(r[1].vwap, (10 * 100 + 12 * 300) / 400)
  // sigma = sqrt(sum v (tp - vwap)^2 / sum v)
  const m = 11.5
  assert.ok(Math.abs(r[1].sd - Math.sqrt((100 * (10 - m) ** 2 + 300 * (12 - m) ** 2) / 400)) < 1e-12)
  assert.deepEqual(r[2], r[1], 'a zero-volume bar changes nothing')
  assert.ok(Math.abs(r[3].vwap - (1000 + 3600 + 8 * 600) / 1000) < 1e-12)
})

test('reads no later bar', () => {
  const a = sessionVwap(bars)
  const b = sessionVwap([...bars.slice(0, 2), { h: 99, l: 1, c: 50, v: 1e9 }, bars[3]])
  assert.deepEqual(b.slice(0, 2), a.slice(0, 2))
})

test('equal weights give the running mean; large prices stay exact', () => {
  const big = bars.map((b) => ({ ...b, h: b.h + 7800, l: b.l + 7800, c: b.c + 7800 }))
  const r = sessionVwap(big, { weight: () => 1 })
  const tps = big.map(hlc3)
  tps.forEach((_, i) => {
    const s = tps.slice(0, i + 1)
    const mean = s.reduce((x, y) => x + y) / s.length
    const sd = Math.sqrt(s.reduce((x, y) => x + (y - mean) ** 2, 0) / s.length)
    assert.ok(Math.abs(r[i].vwap - mean) < 1e-9)
    assert.ok(Math.abs(r[i].sd - sd) < 1e-9)
  })
  assert.equal(sessionVwap([{ h: 1, l: 1, c: 1, v: 0 }])[0], null)
})
