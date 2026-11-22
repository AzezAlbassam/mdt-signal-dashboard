// The pass-level rules in snapshot.js main(): what an empty answer from the source means.
// fetch (a fake MarketData) and the timers are faked; everything else (files, index, history)
// is real.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const realTimeout = setTimeout
globalThis.setTimeout = (f, _ms, ...a) => realTimeout(f, 0, ...a)

const { main, plan, quoteWindow, marketOpen, staleAfter, missDay, fromMarketData, credits, rolledSession } = await import('./snapshot.js')

const TICKERS = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ', 'KKK', 'LLL']
// An expiry about 13 months out, whatever day the tests run.
const EXP = new Date(Date.now() + 400 * 86400000).toISOString().slice(2, 10).replace(/-/g, '')
let down = new Set()
let busy = new Set()
let noDelta = new Set()
let noQuotes = new Set()
let stamps = {}
let refuse = 0 // HTTP status for every request (401: a bad key), 0 to answer normally
let creditsLeft = null // credits the fake source reports after each answer
let ipBlocked = new Set() // tickers whose first request meets the one-address block
let calls = []
const answer = (status, body, left = creditsLeft) => ({
  ok: status < 300, status, headers: new Headers(left == null ? {} : { 'x-api-ratelimit-remaining': String(left) }), json: async () => body,
})
globalThis.fetch = async (url) => {
  const t = decodeURIComponent(url.split('/chain/')[1].split('/')[0])
  calls.push(t)
  if (refuse) return answer(refuse, { s: 'error', errmsg: 'Invalid token header. No credentials provided.' }, 0)
  if (ipBlocked.delete(t)) return answer(403, { s: 'error', errmsg: 'Access denied. Only one device is permitted.', authorizedIP: '1.1.1.1', blockedIP: '2.2.2.2' })
  assert.match(url, /[?&]date=\d{4}-\d{2}-\d{2}&/, 'chains are asked for by session date')
  if (down.has(t)) return answer(404, { s: 'no_data' })
  if (busy.has(t)) return answer(503, null)
  if (creditsLeft != null) creditsLeft -= 1
  // One call contract (25 with no quotes at all), stamped 15:00 New York on 19 Nov unless told otherwise.
  const n = noQuotes.has(t) ? 25 : 1
  const col = (v) => Array(n).fill(v)
  const body = {
    s: 'ok',
    optionSymbol: Array.from({ length: n }, (_, i) => `${t}${EXP}C${String(10000 + i * 1000).padStart(8, '0')}`),
    bidSize: col(10), openInterest: col(500), volume: col(20),
    delta: col(noDelta.has(t) ? null : 0.5), underlyingPrice: col(noDelta.has(t) ? null : 10),
    updated: col(Date.parse(stamps[t] ?? '2026-11-19T20:00:00Z') / 1000),
    ...(noQuotes.has(t) ? {} : { bid: col(1), ask: col(1.1) }),
  }
  return answer(200, body)
}

let dir
const prevUpdatedAt = '2026-11-19T21:06:00.000Z'
beforeEach(() => {
  down = new Set(); busy = new Set(); noDelta = new Set(); noQuotes = new Set(); stamps = {}; refuse = 0; creditsLeft = null; ipBlocked = new Set(); calls = []; credits.remaining = null
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
  assert.equal(calls, 1, 'SPY asked once, nothing else')
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
  assert.match(idx.tickers.CCC.error, /without bid prices/)
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
  assert.equal(idx.staleAfter, '2026-11-23T19:00:00.000Z', 'Saturday data is due by Monday 14:00 New York')
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
  assert.deepEqual(plan(at('2026-11-23T15:10:00Z'), friClose), { action: 'wait', seconds: 480 })
  // A job that starts in the window's first minutes waits for chains stamped inside it.
  assert.deepEqual(plan(at('2026-11-23T15:15:00Z'), friClose), { action: 'wait', seconds: 180 })
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
  // When the page calls the data late: 14:00 New York on the next trading day, after its pass.
  assert.equal(staleAfter(at('2026-11-23T14:50:00Z')), '2026-11-24T19:00:00.000Z')
  assert.equal(staleAfter(at('2026-11-23T20:20:00Z')), '2026-11-24T19:00:00.000Z')
  assert.equal(staleAfter(friClose), '2026-11-23T19:00:00.000Z')
  assert.equal(staleAfter(at('2026-11-25T14:50:00Z')), '2026-11-27T19:00:00.000Z', 'Thanksgiving skipped; the half day counts')
})

test('MarketData chains: delta from the price when the Greeks are missing, closing quotes marked', () => {
  const at16 = Date.parse('2026-11-20T21:00:00Z') / 1000 // 16:00 New York: the close
  const raw = fromMarketData({
    s: 'ok', optionSymbol: ['ABC271217C00100000', 'ABC271217P00100000'], bid: [13, 9], ask: [13.4, 9.4], bidSize: [5, 7],
    openInterest: [900, 800], volume: [30, 20], delta: [null, null], underlyingPrice: [100, 100], updated: [at16, at16],
  })
  assert.equal(raw.eod, true)
  assert.equal(raw.timestamp, '2026-11-20 21:00:00')
  assert.equal(raw.data.current_price, 100)
  const [c, p] = raw.data.options
  assert.ok(c.delta > 0.5 && c.delta < 0.75, `call delta ${c.delta}`)
  assert.ok(p.delta < -0.25 && p.delta > -0.5, `put delta ${p.delta}`)
  assert.equal(c.last_trade_time, '2026-11-20')
  assert.equal(c.bid_size, 5)
  assert.equal(fromMarketData({ s: 'no_data' }).data.options.length, 0)
  const intraday = fromMarketData({ s: 'ok', optionSymbol: ['ABC271217C00100000'], bid: [1], ask: [1.1], delta: [0.4], underlyingPrice: [90], updated: [Date.parse('2026-11-20T18:00:00Z') / 1000] })
  assert.equal(intraday.eod, false)
  assert.equal(intraday.data.options[0].delta, 0.4, "the source's own delta is kept")
})

test('a refused account is an outage: nothing is erased, little is asked, the run fails', async () => {
  refuse = 401
  const idx = await pass()
  for (const t of TICKERS) {
    assert.equal(idx.tickers[t].price, 10, t)
    assert.equal(idx.tickers[t].error, 'source unavailable this pass', t)
    assert.ok(existsSync(join(dir, `${t}.json`)))
  }
  assert.ok(calls.length <= 4, `${calls.length} requests after the first refusal`)
  assert.equal(idx.updatedAt, prevUpdatedAt)
  assert.equal(process.exitCode, 1)
  process.exitCode = 0
})

test("a pass the day's credits cannot finish refreshes the stalest tickers and leaves the rest as they are", async () => {
  const idx0 = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
  TICKERS.forEach((t, i) => { idx0.tickers[t].fetchedAt = `2026-11-${String(10 + i).padStart(2, '0')}T21:00:00.000Z` })
  writeFileSync(join(dir, 'index.json'), JSON.stringify(idx0))
  creditsLeft = 20 // the source reports 19, 18, ... after each answer; the pass stops under 15
  const idx = await pass()
  const fresh = TICKERS.filter((t) => idx.tickers[t].fetchedAt !== idx0.tickers[t].fetchedAt)
  assert.ok(fresh.length >= 5 && fresh.length <= 8, `${fresh.length} refreshed`)
  assert.deepEqual(fresh, TICKERS.slice(0, fresh.length), 'the stalest first')
  for (const t of TICKERS.slice(fresh.length)) {
    assert.equal(idx.tickers[t].error, undefined, `${t} waits, it did not fail`)
    assert.equal(readFileSync(join(dir, `${t}.json`), 'utf8'), '{"keep":true}')
  }
  assert.equal(process.exitCode, 0)
})

test('the one-address block is waited out, not taken for a refused account', async () => {
  ipBlocked = new Set(['AAA'])
  const idx = await pass()
  assert.equal(idx.tickers.AAA.error, undefined)
  assert.notEqual(idx.tickers.AAA.fetchedAt, undefined)
  assert.equal(calls.filter((t) => t === 'AAA').length, 2)
  assert.equal(process.exitCode, 0)
})

test('the free plans read the session that rolled in at 9:30 New York on the next trading day', () => {
  const at = (iso) => rolledSession(new Date(iso))
  assert.equal(at('2026-11-22T12:00:00Z'), '2026-11-19', 'Sunday: Friday has not rolled in yet')
  assert.equal(at('2026-11-23T13:00:00Z'), '2026-11-19', 'Monday before 9:30')
  assert.equal(at('2026-11-23T14:50:00Z'), '2026-11-20', 'Monday after 9:30: Friday')
  assert.equal(at('2026-11-26T15:00:00Z'), '2026-11-24', 'Thanksgiving: Wednesday rolls in on Friday')
  assert.equal(at('2026-11-27T14:50:00Z'), '2026-11-25')
})
