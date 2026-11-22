// The pass-level rules in snapshot.js main(): what an empty answer from the source means.
// fetch and the timers are faked; everything else (files, index, history) is real.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const realTimeout = setTimeout
globalThis.setTimeout = (f, _ms, ...a) => realTimeout(f, 0, ...a)

const { main, plan, quoteWindow, marketOpen, staleAfter, missDay } = await import('./snapshot.js')

const TICKERS = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ', 'KKK', 'LLL']
// An expiry about 13 months out, whatever day the tests run.
const EXP = new Date(Date.now() + 400 * 86400000).toISOString().slice(2, 10).replace(/-/g, '')
let down = new Set()
let busy = new Set()
let noDelta = new Set()
let noQuotes = new Set()
let stamps = {}
globalThis.fetch = async (url) => {
  const t = decodeURIComponent(url.split('/').pop().replace('.json', ''))
  if (down.has(t)) return { ok: false, status: 404 }
  if (busy.has(t)) return { ok: false, status: 503 }
  const delta = noDelta.has(t) ? null : 0.5
  const quotes = (o) => (noQuotes.has(t) ? o : { ...o, bid: 1, ask: 1.1 })
  const options = Array.from({ length: noQuotes.has(t) ? 25 : 1 }, (_, i) =>
    quotes({ option: `${t}${EXP}C${String(10000 + i * 1000).padStart(8, '0')}`, bid_size: 10, open_interest: 500, volume: 20, delta, last_trade_time: '2026-11-19T15:00:00' }))
  return { ok: true, json: async () => ({ timestamp: stamps[t], data: { current_price: 10, options } }) }
}

let dir
const prevUpdatedAt = '2026-11-19T21:06:00.000Z'
beforeEach(() => {
  down = new Set(); busy = new Set(); noDelta = new Set(); noQuotes = new Set(); stamps = {}
  dir = mkdtempSync(join(tmpdir(), 'snap-'))
  const tickers = Object.fromEntries(TICKERS.map((t) => [t, { price: 10, tier: 'B', misses: 2 }])) // legacy per-pass count
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ updatedAt: prevUpdatedAt, tickers }))
  writeFileSync(join(dir, 'watchlist.json'), JSON.stringify(TICKERS))
  for (const t of TICKERS) writeFileSync(join(dir, `${t}.json`), '{"keep":true}')
  process.exitCode = 0
})

const pass = async () => {
  process.argv = ['node', 'snapshot.test', dir, '--only', [...TICKERS, 'NEWX'].join(',')]
  await main()
  return JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
}

test('the source going dark erases nothing and fails the run', async () => {
  down = new Set(TICKERS)
  const idx = await pass()
  for (const t of TICKERS) {
    assert.equal(idx.tickers[t].price, 10, t)
    assert.equal(idx.tickers[t].noOptions, undefined, t)
    assert.ok(existsSync(join(dir, `${t}.json`)), `${t} snapshot kept`)
  }
  assert.equal(idx.updatedAt, prevUpdatedAt, 'last good time is kept')
  assert.equal(idx.attemptedAt, undefined, 'a partial run (--only) leaves the schedule clock alone')
  assert.equal(process.exitCode, 1)
  process.exitCode = 0
})

test('if even SPY comes back empty, nothing is fetched and a new ticker stays pending', async () => {
  down = new Set(['SPY'])
  let calls = 0
  const f = globalThis.fetch
  globalThis.fetch = (url) => { calls += 1; return f(url) }
  writeFileSync(join(dir, 'watchlist.json'), JSON.stringify([...TICKERS, 'NEWX']))
  process.argv = ['node', 'snapshot.test', dir]
  await main()
  globalThis.fetch = f
  const idx = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
  assert.equal(calls, 2, 'SPY asked twice (404 is believed on the second asking), nothing else')
  assert.equal(idx.tickers.AAA.price, 10)
  assert.equal(idx.tickers.AAA.error, 'source unavailable this pass')
  assert.equal(idx.tickers.NEWX.pending, true)
  assert.equal(idx.tickers.NEWX.noOptions, undefined)
  assert.equal(idx.updatedAt, prevUpdatedAt)
  assert.ok(idx.attemptedAt > prevUpdatedAt, 'the failed attempt paces the next one')
  assert.equal(process.exitCode, 1)
  process.exitCode = 0
})

test('a chain that comes back without a field is a failed fetch, not a ticker with no capacity', async () => {
  noDelta = new Set(['AAA'])
  noQuotes = new Set(['CCC'])
  const idx = await pass()
  assert.match(idx.tickers.AAA.error, /without deltas/)
  assert.match(idx.tickers.CCC.error, /without quotes/)
  assert.equal(idx.tickers.AAA.tier, 'B', 'last good figures kept')
  assert.equal(readFileSync(join(dir, 'AAA.json'), 'utf8'), '{"keep":true}', 'last good snapshot kept')
  assert.equal(idx.tickers.BBB.error, undefined)
  process.exitCode = 0
})

test('quotes are dated by the chain, not by the clock of the pass', async () => {
  stamps = { BBB: '2026-11-21 15:00:00' } // a Saturday: not from any session's quote window
  await pass()
  const snap = JSON.parse(readFileSync(join(dir, 'BBB.json'), 'utf8'))
  assert.equal(snap.quotesFrom, '2026-11-21T15:00:00.000Z')
  assert.equal(snap.quotesIntraday, false)
  process.exitCode = 0
})

test('a new ticker is called option-less only after empty answers on three trading days', async () => {
  down = new Set(['NEWX', 'NEWY'])
  const idx0 = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
  idx0.tickers.NEWX = { pending: true, misses: 2, lastMiss: '2000-01-03' }
  idx0.tickers.NEWY = { pending: true, misses: 1, lastMiss: missDay(new Date()) }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(idx0))
  writeFileSync(join(dir, 'watchlist.json'), JSON.stringify([...TICKERS, 'NEWX', 'NEWY']))
  process.argv = ['node', 'snapshot.test', dir, '--only', [...TICKERS, 'NEWX', 'NEWY'].join(',')]
  await main()
  const idx = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
  assert.deepEqual(idx.tickers.NEWX, { noOptions: true })
  assert.equal(idx.tickers.NEWY.pending, true)
  assert.equal(idx.tickers.NEWY.misses, 1, 'a second empty answer the same day does not count')
  process.exitCode = 0
})

test('--only does not fetch a ticker that is not on the list', async () => {
  process.argv = ['node', 'snapshot.test', dir, '--only', 'AAA,ZZZZ']
  await main()
  assert.equal(existsSync(join(dir, 'ZZZZ.json')), false)
  const idx = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
  assert.equal(idx.tickers.ZZZZ, undefined)
  process.exitCode = 0
})

test('--resummarize recomputes ADV from the history and redates a stale chain, without fetching', async () => {
  let calls = 0
  const f = globalThis.fetch
  globalThis.fetch = (url) => { calls += 1; return f(url) }
  const d = mkdtempSync(join(tmpdir(), 'resum-'))
  mkdirSync(join(d, 'history'))
  const sym = `ZZZ${EXP}C00010000`
  const expiry = `20${EXP.slice(0, 2)}-${EXP.slice(2, 4)}-${EXP.slice(4, 6)}`
  const cols = ['sym', 'exp', 'type', 'strike', 'bid', 'ask', 'bidSize', 'volume', 'oi', 'delta', 'adv', 'sessions']
  writeFileSync(join(d, 'ZZZ.json'), JSON.stringify({
    ticker: 'ZZZ', price: 10, cboeTimestamp: '2026-11-21 11:00:00', fetchedAt: '2026-11-21T20:00:00.000Z', quotesFrom: '2026-11-21T19:30:00.000Z', quotesIntraday: true,
    session: '2026-11-20', historySessions: 5, expiries: [expiry], cols, rows: [[sym, 0, 'C', 10, 1, 1.02, 50, 6, 5000, 0.5, 999, 4]],
  }))
  writeFileSync(join(d, 'history', 'ZZZ.json'), JSON.stringify({ dates: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'], vol: { [sym]: [5, 3, 40000, 4, 6] } }))
  writeFileSync(join(d, 'index.json'), JSON.stringify({ updatedAt: '2026-11-21T20:00:00.000Z', tickers: { ZZZ: { price: 10, tier: 'D', caps: {} }, GONE: { noOptions: true } } }))
  process.argv = ['node', 'snapshot.test', d, '--resummarize']
  await main()
  globalThis.fetch = f
  assert.equal(calls, 0)
  const snap = JSON.parse(readFileSync(join(d, 'ZZZ.json'), 'utf8'))
  assert.deepEqual(snap.rows[0].slice(10), [4.5, 5], 'the block day is left out of the average: (5+3+4+6)/4')
  assert.equal(snap.historySessions, 5)
  assert.equal(snap.quotesFrom, '2026-11-21T11:00:00.000Z')
  assert.equal(snap.quotesIntraday, false)
  const idx = JSON.parse(readFileSync(join(d, 'index.json'), 'utf8'))
  assert.equal(idx.tickers.ZZZ.historySessions, 5)
  assert.ok(idx.tickers.ZZZ.caps.C.length === 5)
  assert.deepEqual(idx.tickers.GONE, { noOptions: true })
  assert.equal(idx.staleAfter, '2026-11-23T16:45:00.000Z', 'Saturday data is due by Monday 11:45 New York')
})

test('during a partial outage a never-seen ticker is not called option-less', async () => {
  down = new Set([...TICKERS.slice(0, 6), 'NEWX'])
  writeFileSync(join(dir, 'watchlist.json'), JSON.stringify([...TICKERS, 'NEWX']))
  const idx = await pass()
  assert.equal(idx.tickers.NEWX.pending, true)
  assert.equal(idx.tickers.NEWX.noOptions, undefined)
  process.exitCode = 0
})

test('a removed ticker leaves no snapshot behind, and a new one that fails stays pending', async () => {
  down = new Set(); busy = new Set(['NEWX'])
  process.argv = ['node', 'snapshot.test', dir, '--remove', 'AAA', '--add', 'NEWX']
  await main()
  busy = new Set()
  const idx = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
  assert.equal(existsSync(join(dir, 'AAA.json')), false)
  assert.equal(idx.tickers.AAA, undefined)
  assert.equal(idx.tickers.NEWX.pending, true)
  assert.match(idx.tickers.NEWX.error, /503/)
  process.exitCode = 0
})

test('one ticker losing its chain counts once per day, and old per-pass counts restart', async () => {
  down = new Set(['AAA'])
  let idx = await pass()
  assert.equal(idx.tickers.AAA.misses, 1, 'legacy count of 2 starts over at 1')
  assert.equal(idx.tickers.AAA.price, 10)
  assert.ok(existsSync(join(dir, 'AAA.json')))
  idx = await pass()
  idx = await pass()
  assert.equal(idx.tickers.AAA.misses, 1, 'more passes the same day do not add up')
  assert.equal(idx.tickers.BBB.misses, undefined, 'a ticker that answered carries no count')
  assert.equal(process.exitCode, 0)
})

test('the schedule follows the exchange calendar and the 15-minute feed lag', () => {
  const at = (iso) => new Date(iso)
  const friClose = at('2026-11-20T21:40:00Z') // Fri 16:40 New York, after that day's close pass
  // Thanksgiving: nothing trades, the Wednesday close is captured, so stop.
  assert.deepEqual(plan(at('2026-11-26T15:30:00Z'), at('2026-11-25T21:40:00Z')), { action: 'stop' })
  assert.equal(quoteWindow(at('2026-11-26T15:30:00Z')), false)
  assert.equal(marketOpen(at('2026-11-26T15:30:00Z')), false)
  // Monday 10:10: the feed still shows the opening scramble; wait for 10:15.
  assert.deepEqual(plan(at('2026-11-23T15:10:00Z'), friClose), { action: 'wait', seconds: 450 })
  assert.deepEqual(plan(at('2026-11-23T15:20:00Z'), friClose), { action: 'run' })
  // The feed shows SPY options trading until 16:15 market time, so 16:20 New York is still open.
  assert.equal(marketOpen(at('2026-11-23T21:20:00Z')), true)
  assert.equal(marketOpen(at('2026-11-23T21:31:00Z')), false)
  // Day after Thanksgiving closes at 13:00: no quotes after 13:05, close pass at 13:35.
  assert.equal(quoteWindow(at('2026-11-27T18:10:00Z')), false)
  assert.deepEqual(plan(at('2026-11-27T18:10:00Z'), at('2026-11-27T17:20:00Z')), { action: 'wait', seconds: 1530 })
  assert.deepEqual(plan(at('2026-11-27T18:40:00Z'), at('2026-11-27T17:20:00Z')), { action: 'run' })
  // A failed close pass is retried within the hour instead of being taken as captured.
  const failedClose = at('2026-11-23T21:40:00Z'), lastGood = at('2026-11-23T20:20:00Z')
  assert.equal(plan(at('2026-11-23T21:45:00Z'), failedClose, lastGood).action, 'wait')
  assert.deepEqual(plan(at('2026-11-23T22:41:00Z'), failedClose, lastGood), { action: 'run' })
  // A pass on a weekend or holiday counts a missing chain against the last trading day.
  assert.equal(missDay(at('2026-11-22T15:00:00Z')), '2026-11-20')
  assert.equal(missDay(at('2026-11-26T15:00:00Z')), '2026-11-25')
  assert.equal(missDay(at('2026-11-24T02:40:00Z')), '2026-11-23')
  // When the page calls the data late: the next pass plus 90 minutes, across weekends and holidays.
  assert.equal(staleAfter(at('2026-11-23T16:20:00Z')), '2026-11-23T18:50:00.000Z')
  assert.equal(staleAfter(at('2026-11-23T20:20:00Z')), '2026-11-23T23:05:00.000Z')
  assert.equal(staleAfter(friClose), '2026-11-23T16:45:00.000Z')
  assert.equal(staleAfter(at('2026-11-25T21:40:00Z')), '2026-11-27T16:45:00.000Z')
})
