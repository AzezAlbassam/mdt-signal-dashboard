// The validator is only worth something if it fails on bad data. Each test breaks one
// thing in an otherwise clean snapshot and expects exactly that to be reported.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { auditSnapshot, main } from './validate.js'
import { tickerSummary } from './engine.js'

const cols = ['sym', 'exp', 'type', 'strike', 'bid', 'ask', 'bidSize', 'volume', 'oi', 'delta', 'adv', 'sessions']
const rows = () => [
  ['ABC270617C00100000', 0, 'C', 100, 9.9, 10, 50, 120, 5000, 0.5, 300, 5],
  ['ABC270617C00120000', 0, 'C', 120, 4.8, 5, 80, 60, 3000, 0.3, 150, 5],
  ['ABC270617P00090000', 0, 'P', 90, 5.9, 6.1, 40, 30, 2000, -0.35, 80, 5],
  ['ABC261218C00100000', 1, 'C', 100, 6, 6.6, 20, 10, 800, 0.55, 40, 5],
]
const snap = (r = rows()) => ({ price: 101, fetchedAt: '2026-10-07T15:00:00Z', historySessions: 5, expiries: ['2027-06-17', '2026-12-18'], cols, rows: r })
const entryFor = (s) => {
  const ci = Object.fromEntries(s.cols.map((c, i) => [c, i]))
  const cs = s.rows.map((r) => ({ expiry: s.expiries[r[ci.exp]], type: r[ci.type], strike: r[ci.strike], bid: r[ci.bid], ask: r[ci.ask], bidSize: r[ci.bidSize], oi: r[ci.oi], delta: r[ci.delta], adv: r[ci.adv], sessions: r[ci.sessions] }))
  return { caps: tickerSummary(cs, '2026-10-07').caps }
}

test('a clean snapshot passes', () => {
  const s = snap()
  assert.deepEqual(auditSnapshot(s, entryFor(s)).errors, [])
})

test('bid above ask is caught', () => {
  const s = snap(); const e = entryFor(s)
  s.rows[0][4] = 10.5
  assert.ok(auditSnapshot(s, e).errors.some((m) => m.includes('bid 10.5 > ask 10')))
})

test('a published capacity that does not follow from the data is caught', () => {
  const s = snap(); const e = entryFor(s)
  e.caps.C[2] += 1
  assert.ok(auditSnapshot(s, e).errors.some((m) => m.startsWith('C 180–365 days')))
})

test('a call with negative delta is caught', () => {
  const s = snap(); s.rows[1][9] = -0.3
  assert.ok(auditSnapshot(s, entryFor(s)).errors.some((m) => m.includes('delta -0.3 for a C')))
})

test('fields that disagree with the symbol are caught', () => {
  const s = snap(); s.rows[0][3] = 105
  assert.ok(auditSnapshot(s, entryFor(s)).errors.some((m) => m.includes('fields do not match symbol')))
})

test('an expired contract is caught', () => {
  const s = snap(); s.expiries[1] = '2026-10-07'; s.rows[3][0] = 'ABC261007C00100000'
  assert.ok(auditSnapshot(s, entryFor(s)).errors.some((m) => m.includes('expired')))
})

test('a missing underlying price is caught', () => {
  const s = snap(); s.price = null
  assert.ok(auditSnapshot(s, entryFor(s)).errors.some((m) => m.includes('underlying price')))
})

// History behind the rows above: each contract's ADV is its sessions without the busiest day.
const historyFor = (r = rows()) => ({ dates: ['a', 'b', 'c', 'd', 'e'], vol: Object.fromEntries(r.map((x) => [x[0], [x[10], x[10], x[10], x[10], x[10] * 30]])) })

test('ADV is re-derived from the history, and a block day does not count', () => {
  const s = snap()
  assert.deepEqual(auditSnapshot(s, entryFor(s), historyFor()).errors, [])
  const h = historyFor()
  h.vol['ABC270617C00100000'] = [100, 100, 100, 100, 100]
  assert.ok(auditSnapshot(s, entryFor(s), h).errors.some((m) => m.includes('ABC270617C00100000: ADV 300 over 5 sessions, history says 100 over 5')))
})

test('a snapshot left behind for a ticker that is not on the list is caught', async () => {
  const d = mkdtempSync(join(tmpdir(), 'val-'))
  mkdirSync(join(d, 'history'))
  const s = snap()
  writeFileSync(join(d, 'ABC.json'), JSON.stringify(s))
  writeFileSync(join(d, 'history', 'ABC.json'), JSON.stringify(historyFor()))
  writeFileSync(join(d, 'OLD.json'), JSON.stringify(s))
  writeFileSync(join(d, 'GONE.json'), JSON.stringify(s))
  writeFileSync(join(d, 'index.json'), JSON.stringify({ tickers: { ABC: entryFor(s), GONE: { noOptions: true } } }))
  writeFileSync(join(d, 'watchlist.json'), '[]')
  writeFileSync(join(d, 'vault.json'), '{"salt":""}') // the vault's salt and check: not a snapshot
  process.argv = ['node', 'validate.js', d, '--write']
  await main()
  const v = JSON.parse(readFileSync(join(d, 'validation.json'), 'utf8'))
  assert.deepEqual(Object.keys(v.failed).sort(), ['GONE', 'OLD'])
  assert.equal(v.tickers, 1)
  assert.equal(v.ok, false)
  process.exitCode = 0
})
