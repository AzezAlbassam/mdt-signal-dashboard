// The pass-level rules in snapshot.js main(): what an empty answer from the source means.
// fetch (a fake MarketData), the timers and the pass's clock are faked; everything else
// (files, index, history) is real.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const realTimeout = setTimeout
let waits = [] // every wait asked for, in ms; each one is over at once
globalThis.setTimeout = (f, ms, ...a) => { waits.push(ms); return realTimeout(f, 0, ...a) }
// Every request's time-out is noted and fires after 20 ms instead (on a timer that, unlike
// AbortSignal.timeout's, keeps the test alive while a request hangs).
let timeouts = []
AbortSignal.timeout = (ms) => {
  timeouts.push(ms)
  const c = new AbortController()
  realTimeout(() => c.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), 20)
  return c.signal
}
// The pass's time budget reads Date.now; a slow source moves it on (minutesPerAnswer).
const realNow = Date.now
let skew = 0
Date.now = () => realNow() + skew

const { main, plan, quoteWindow, marketOpen, staleAfter, missDay, fromMarketData, credits, rolledSession } = await import('./snapshot.js')
const { nyDate } = await import('./engine.js')

const TICKERS = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ', 'KKK', 'LLL']
// An expiry about 13 months out, whatever day the tests run.
const EXP = new Date(Date.now() + 400 * 86400000).toISOString().slice(2, 10).replace(/-/g, '')
let down = new Set()
let busy = new Set()
let noDelta = new Set()
let noQuotes = new Set()
let noOI = new Set()
let stamps = {}
let refuse = 0 // HTTP status for every request (401: a bad key), 0 to answer normally
let creditsLeft = null // credits the fake source reports after each answer
let ipBlocked = new Set() // tickers whose next request meets the one-address block
let sizes = {} // symbols in a ticker's chain (1 unless told); a dated chain costs 1 credit per 1,000
let chains = {} // a ticker's whole answer, when the test writes it
let hang = new Set() // tickers whose requests never answer
let minutesPerAnswer = 0
let calls = []
let urls = []
const answer = (status, body, left = creditsLeft) => ({
  ok: status < 300, status, headers: new Headers(left == null ? {} : { 'x-api-ratelimit-remaining': String(left) }), json: async () => body,
})
globalThis.fetch = async (url, opts) => {
  const t = decodeURIComponent(url.split('/chain/')[1].split('/')[0])
  calls.push(t)
  urls.push(url)
  assert.ok(opts?.signal instanceof AbortSignal, 'every request can time out')
  if (hang.has(t)) return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(opts.signal.reason)))
  skew += minutesPerAnswer * 60000
  if (refuse) return answer(refuse, { s: 'error', errmsg: 'Invalid token header. No credentials provided.' }, 0)
  if (ipBlocked.delete(t)) return answer(403, { s: 'error', errmsg: 'Access denied. Only one device is permitted.', authorizedIP: '1.1.1.1', blockedIP: '2.2.2.2' })
  assert.match(url, /[?&]date=\d{4}-\d{2}-\d{2}&/, 'chains are asked for by session date')
  if (down.has(t)) return answer(404, { s: 'no_data' })
  if (creditsLeft != null && creditsLeft <= 0) return answer(429, { s: 'error', errmsg: 'You have used all of your daily credits.' }, 0)
  if (busy.has(t)) return answer(503, null)
  // Call contracts (one unless sized; 25 with no quotes at all), stamped 15:00 New York on 19 Nov unless told otherwise.
  const n = chains[t]?.optionSymbol.length ?? (noQuotes.has(t) || noOI.has(t) ? 25 : sizes[t] ?? 1)
  if (creditsLeft != null) creditsLeft -= Math.max(1, Math.ceil(n / 1000))
  if (chains[t]) return answer(200, chains[t])
  const col = (v) => Array(n).fill(v)
  const body = {
    s: 'ok',
    optionSymbol: Array.from({ length: n }, (_, i) => `${t}${EXP}C${String(10000 + i * 1000).padStart(8, '0')}`),
    bidSize: col(10), volume: col(20), ...(noOI.has(t) ? {} : { openInterest: col(500) }),
    delta: col(noDelta.has(t) ? null : 0.5), underlyingPrice: col(noDelta.has(t) ? null : 10),
    updated: col(Date.parse(stamps[t] ?? '2026-11-19T20:00:00Z') / 1000),
    ...(noQuotes.has(t) ? {} : { bid: col(1), ask: col(1.1) }),
  }
  return answer(200, body)
}

let dir
const prevUpdatedAt = '2026-11-19T21:06:00.000Z'
beforeEach(() => {
  down = new Set(); busy = new Set(); noDelta = new Set(); noQuotes = new Set(); noOI = new Set(); stamps = {}; refuse = 0; creditsLeft = null; ipBlocked = new Set(); calls = []; credits.remaining = null
  sizes = {}; chains = {}; hang = new Set(); minutesPerAnswer = 0; skew = 0; urls = []; waits = []; timeouts = []
  dir = mkdtempSync(join(tmpdir(), 'snap-'))
  const tickers = Object.fromEntries(TICKERS.map((t) => [t, { price: 10, tier: 'B', misses: 2 }])) // legacy per-pass count
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ updatedAt: prevUpdatedAt, tickers }))
  writeFileSync(join(dir, 'watchlist.json'), JSON.stringify(TICKERS))
  for (const t of TICKERS) writeFileSync(join(dir, `${t}.json`), '{"keep":true}')
  process.exitCode = 0
})

const readIndex = () => JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
const writeIndex = (idx) => writeFileSync(join(dir, 'index.json'), JSON.stringify(idx))
// Every pass ends on exactly one of these, whatever happened: the task that runs it reads it.
const SUMMARY = /^(\d+ of \d+ tickers fetched: |OUTAGE: |INCOMPLETE: |nothing to refresh: )/
let lines = []
const summary = () => lines.find((l) => SUMMARY.test(l))
const runMain = async (...args) => {
  process.argv = ['node', 'snapshot.test', dir, ...args]
  lines = []
  const log = console.log
  console.log = (...a) => { lines.push(a.join(' ')) }
  try {
    await main()
  } finally {
    console.log = log
  }
  assert.equal(lines.filter((l) => SUMMARY.test(l)).length, 1, `one summary line:\n${lines.join('\n')}`)
  return readIndex()
}
const pass = () => runMain('--only', [...TICKERS, 'NEWX'].join(','))
// A pass over the whole list, as the daily task runs it (no --only), with the repo's seed list
// removed but for `keep`, so the list is the test's own.
const SEED = JSON.parse(readFileSync(new URL('./watchlist.json', import.meta.url), 'utf8'))
const fullPass = (keep = []) => {
  writeFileSync(join(dir, 'removed.json'), JSON.stringify(SEED.filter((t) => !keep.includes(t))))
  return runMain()
}
const stalestFirst = (idx) => TICKERS.forEach((t, i) => { idx.tickers[t].fetchedAt = `2026-11-${String(10 + i).padStart(2, '0')}T21:00:00.000Z` })

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
  writeFileSync(join(dir, 'watchlist.json'), JSON.stringify([...TICKERS, 'NEWX']))
  const idx = await runMain()
  assert.deepEqual(calls, ['SPY'], 'SPY asked once, nothing else')
  assert.match(summary(), /^OUTAGE: no chain for SPY/)
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
  noOI = new Set(['DDD'])
  const idx = await pass()
  assert.match(idx.tickers.AAA.error, /without deltas/)
  assert.match(idx.tickers.CCC.error, /without bid prices/)
  assert.match(idx.tickers.DDD.error, /without open interest/)
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
  const idx = await runMain('--only', [...TICKERS, 'NEWX', 'NEWY'].join(','))
  assert.deepEqual(idx.tickers.NEWX, { noOptions: true, checked: rolledSession(new Date()) }, 'with the session it was asked for')
  assert.equal(idx.tickers.NEWY.pending, true)
  assert.equal(idx.tickers.NEWY.misses, 1, 'a second empty answer the same day does not count')
  process.exitCode = 0
})

test('--only does not fetch a ticker that is not on the list', async () => {
  const idx = await runMain('--only', 'AAA,ZZZZ')
  assert.equal(existsSync(join(dir, 'ZZZZ.json')), false)
  assert.equal(idx.tickers.ZZZZ, undefined)
  calls = []
  await runMain('--only', 'ZZZZ')
  assert.deepEqual(calls, [])
  assert.equal(summary(), 'nothing to refresh: none of the --only tickers is on the list')
  process.exitCode = 0
})

test('one ticker failing again on a run with little left to do is recorded, and does not fail the run', async () => {
  const day = rolledSession(new Date())
  const idx0 = readIndex()
  for (const t of TICKERS) { idx0.tickers[t].session = day; stamps[t] = `${day}T20:00:00Z` }
  idx0.tickers.AAA.error = 'chain came back without deltas'
  writeIndex(idx0)
  noDelta = new Set(['AAA'])
  const idx = await fullPass()
  assert.deepEqual(calls, ['SPY', 'AAA', 'AAA'], 'the check, then AAA and its retry')
  assert.match(idx.tickers.AAA.error, /without deltas/)
  assert.match(summary(), /^1 of 1 tickers fetched: .* 1 failed/)
  assert.equal(process.exitCode, 0)
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
  const idx = await runMain('--remove', 'AAA', '--add', 'NEWX')
  busy = new Set()
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
  const idx0 = readIndex()
  stalestFirst(idx0)
  writeIndex(idx0)
  creditsLeft = 8 // the source reports 7, 6, ... after each answer; a 1-credit chain needs 2 left
  const idx = await pass()
  const fresh = TICKERS.filter((t) => idx.tickers[t].fetchedAt !== idx0.tickers[t].fetchedAt)
  assert.equal(fresh.length, 7, `${fresh.length} refreshed`)
  assert.equal(creditsLeft, 1, "one credit is left for the next run's check")
  assert.deepEqual(fresh, TICKERS.slice(0, fresh.length), 'the stalest first')
  for (const t of TICKERS.slice(fresh.length)) {
    assert.equal(idx.tickers[t].error, undefined, `${t} waits, it did not fail`)
    assert.equal(readFileSync(join(dir, `${t}.json`), 'utf8'), '{"keep":true}')
  }
  assert.equal(process.exitCode, 0)
})

test("with the day's credits gone, or only enough left for the check, nothing is flagged or written", async () => {
  const before = readFileSync(join(dir, 'index.json'), 'utf8')
  for (const left of [0, 1]) { // 0: the check is refused (429); 1: the check takes the last one
    creditsLeft = left
    calls = []
    await runMain()
    assert.deepEqual(calls, ['SPY'], `${left} left`)
    assert.equal(summary(), "nothing to refresh: MarketData's daily credits are used up (they reset at 9:30 New York)")
    assert.equal(readFileSync(join(dir, 'index.json'), 'utf8'), before, 'index.json is not written')
    assert.equal(process.exitCode, 0)
  }
})

test('tickers known to have no options are asked last', async () => {
  const idx0 = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
  TICKERS.forEach((t) => { idx0.tickers[t].fetchedAt = '2026-11-19T21:00:00.000Z' })
  idx0.tickers.AAA = { noOptions: true }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(idx0))
  down = new Set(['AAA'])
  await pass()
  assert.equal(calls.at(-1), 'AAA', calls.join(' '))
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

test('a ticker that already has the newest session is not asked again; with none left, the run asks and writes nothing', async () => {
  const day = rolledSession(new Date())
  const idx0 = readIndex()
  stalestFirst(idx0)
  for (const t of TICKERS) { idx0.tickers[t].session = day; stamps[t] = `${day}T20:00:00Z` }
  idx0.tickers.CCC.error = 'chain came back without deltas' // failed last time: asked again
  idx0.tickers.DDD.pending = true // never had a chain
  idx0.tickers.EEE.session = '2000-01-03' // an older session
  idx0.tickers.NOOPA = { noOptions: true, checked: day } // asked for this session already
  idx0.tickers.NOOPB = { noOptions: true } // not yet
  writeIndex(idx0)
  writeFileSync(join(dir, 'watchlist.json'), JSON.stringify([...TICKERS, 'NOOPA', 'NOOPB']))
  down = new Set(['NOOPA', 'NOOPB'])
  const idx = await fullPass()
  assert.deepEqual(calls, ['SPY', 'CCC', 'DDD', 'EEE', 'NOOPB'], 'the source check, then only what lacks the session')
  assert.match(summary(), /^4 of 4 tickers fetched: 3 with options, 1 with none returned/)
  assert.deepEqual(idx.tickers.NOOPB, { noOptions: true, checked: day })
  assert.deepEqual(idx.tickers.NOOPA, { noOptions: true, checked: day })

  // The day's second run: nothing to ask, not even the source check, and nothing written.
  calls = []
  writeIndex(idx) // compact: main() always writes it indented
  const before = readFileSync(join(dir, 'index.json'), 'utf8')
  await fullPass()
  assert.deepEqual(calls, [])
  assert.equal(summary(), `nothing to refresh: every ticker already has session ${day}`)
  assert.equal(readFileSync(join(dir, 'index.json'), 'utf8'), before, 'index.json is not written')
  assert.equal(process.exitCode, 0)

  // A removal is still written (its snapshot is gone), with the clocks as they were.
  const shorter = await runMain('--remove', 'BBB')
  assert.deepEqual(calls, [])
  assert.match(summary(), /^nothing to refresh: /)
  assert.equal(shorter.tickers.BBB, undefined)
  assert.equal(shorter.updatedAt, idx.updatedAt)

  // --only always asks.
  await runMain('--only', 'AAA,NOOPA')
  assert.deepEqual(calls, ['AAA', 'NOOPA'])
})

test("credits: a chain is asked for only if its price (1 per 1,000 symbols, from its last size) leaves 1 for the next run's check; a dear one is skipped for cheaper ones", async () => {
  const idx0 = readIndex()
  stalestFirst(idx0)
  idx0.tickers.AAA.chainSize = 4500 // 5 credits
  idx0.tickers.BBB.contracts = 1300 // size not known yet: ceil(1300 / 600) + 1 = 4
  writeIndex(idx0)
  sizes = { AAA: 4500, BBB: 1300 } // BBB's chain really costs 2
  creditsLeft = 6
  const idx = await fullPass()
  // 6, the check leaves 5: AAA would leave 0, skipped; BBB leaves 3, CCC 2, DDD 1; under 2 nothing more goes.
  assert.deepEqual(calls, ['SPY', 'BBB', 'CCC', 'DDD'])
  assert.equal(creditsLeft, 1)
  assert.equal(idx.tickers.BBB.chainSize, 1300, 'the size it came back with prices it next time')
  assert.equal(idx.tickers.CCC.chainSize, 1)
  for (const t of ['AAA', ...TICKERS.slice(4)]) {
    assert.equal(idx.tickers[t].error, undefined, `${t} waits, it did not fail`)
    assert.equal(readFileSync(join(dir, `${t}.json`), 'utf8'), '{"keep":true}')
  }
  assert.ok(lines.includes('9 tickers wait for the next pass (1 credits left)'), lines.join('\n'))
  assert.match(summary(), /^3 of 12 tickers fetched: /)
  // The free plan's rotation: a pass the credits stop is a normal pass.
  assert.ok(idx.updatedAt > prevUpdatedAt)
  assert.equal(process.exitCode, 0)
})

test('one 1-credit request answers for the source first; SPY then takes its turn in the queue', async () => {
  const idx0 = readIndex()
  stalestFirst(idx0)
  idx0.tickers.SPY = { price: 700, tier: 'A', chainSize: 9000, fetchedAt: '2026-11-14T22:00:00.000Z' } // between EEE and FFF
  writeIndex(idx0)
  creditsLeft = 100
  await fullPass(['SPY'])
  assert.equal(calls[0], 'SPY')
  assert.match(urls[0], /\?date=\d{4}-\d{2}-\d{2}&side=call$/, "one expiration's calls (MarketData's default: the next monthly)")
  assert.deepEqual(calls.slice(1), [...TICKERS.slice(0, 5), 'SPY', ...TICKERS.slice(5)], 'stalest first, SPY among them')
  assert.match(urls[6], /&expiration=all&/, 'then its whole chain')
  assert.equal(creditsLeft, 100 - 1 - 13, 'the check cost 1 credit')
  assert.equal(process.exitCode, 0)
})

test('the time budget counts from the start of the run, the source check included', async () => {
  minutesPerAnswer = 41 // the check alone runs past the 40 minutes
  await fullPass()
  assert.deepEqual(calls, ['SPY'], 'nothing more is asked')
  assert.match(summary(), /^INCOMPLETE: /)
  process.exitCode = 0
})

test('a pass the time budget stops before half its tickers keeps the last full update time and fails the run', async () => {
  const idx0 = readIndex()
  idx0.staleAfter = '2026-11-20T19:00:00.000Z'
  writeIndex(idx0)
  minutesPerAnswer = 7 // the check ends at 7 minutes, then 14, 21, 28, 35, 42: five tickers asked
  const idx = await fullPass()
  assert.equal(calls.length, 6)
  assert.match(summary(), /^INCOMPLETE: the time budget ran out, with 7 of 12 tickers not asked/)
  assert.equal(idx.updatedAt, prevUpdatedAt, 'the page is not told the list is fresh')
  assert.equal(idx.staleAfter, '2026-11-20T19:00:00.000Z', 'and calls it late on time')
  assert.ok(idx.attemptedAt > prevUpdatedAt)
  assert.equal(process.exitCode, 1)
  process.exitCode = 0
})

test('a request that hangs is given up after 60 s and counts as a failed attempt; the pass goes on', async () => {
  hang = new Set(['BBB'])
  const idx = await pass()
  assert.ok(timeouts.length >= 12 && timeouts.every((ms) => ms === 60000), `time-outs ${timeouts}`)
  assert.equal(calls.filter((t) => t === 'BBB').length, 6, 'three attempts, three more on the retry')
  assert.equal(idx.tickers.BBB.error, 'MarketData did not answer (no answer in 60 s)')
  assert.equal(idx.tickers.BBB.tier, 'B', 'its last figures are kept')
  assert.notEqual(idx.tickers.CCC.fetchedAt, undefined, 'the rest were fetched')
  assert.equal(process.exitCode, 0)
})

test('the one-address block is waited out once a pass; a second one stops the pass, which then did not do its job', async () => {
  ipBlocked = new Set(['AAA', 'CCC'])
  const idx = await fullPass()
  assert.deepEqual(calls, ['SPY', 'AAA', 'AAA', 'BBB', 'CCC'])
  assert.equal(waits.filter((ms) => ms === 330000).length, 1, 'one five-minute wait')
  assert.notEqual(idx.tickers.BBB.fetchedAt, undefined)
  for (const t of TICKERS.slice(2)) {
    assert.equal(idx.tickers[t].error, undefined, `${t} waits, it did not fail`)
    assert.equal(readFileSync(join(dir, `${t}.json`), 'utf8'), '{"keep":true}')
  }
  assert.ok(lines.some((l) => l.startsWith('10 tickers wait for the next pass (MarketData blocked the account again')), lines.join('\n'))
  assert.match(summary(), /^INCOMPLETE: MarketData blocked the account again: the address changed twice this pass, with 10 of 12 tickers not asked/)
  assert.equal(idx.updatedAt, prevUpdatedAt, 'the page is not told the list is fresh')
  assert.equal(process.exitCode, 1)
  process.exitCode = 0
})

test('after a pass the source answered, a ticker it did not reach is no longer flagged unavailable: it only waits its turn', async () => {
  const idx0 = readIndex()
  stalestFirst(idx0)
  for (const t of TICKERS) idx0.tickers[t].error = 'source unavailable this pass' // the last pass was an outage
  idx0.tickers.LLL.error = 'chain came back without deltas' // a real failure keeps its flag
  writeIndex(idx0)
  creditsLeft = 4 // the check, AAA and BBB leave 1: the rest wait
  const idx = await fullPass()
  assert.deepEqual(calls, ['SPY', 'AAA', 'BBB'])
  for (const t of TICKERS.slice(2, 11)) {
    assert.equal(idx.tickers[t].error, undefined, t)
    assert.equal(idx.tickers[t].tier, 'B', `${t} keeps its last figures`)
  }
  assert.equal(idx.tickers.LLL.error, 'chain came back without deltas')
  assert.equal(Object.values(idx.tickers).filter((e) => e.error && !e.pending).length, 1, 'no "last update failed" banner on the page')
})

// An index chain like HGX's on 19 Nov (308 options): no underlyingPrice on any row, quotes $5
// wide, strikes every 5. Priced at 615 under Black–Scholes (25% vol, 4%), so put-call parity
// holds to the cent. The expiry 5 days out is priced at 600 and quoted tighter: a reading from
// it would be wrong. At 610–620, 29 days out, both sides are $1 wide and the 620 call is $3
// stale: only the median of the three tightest pairs ignores it.
const erf = (x) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return x < 0 ? -y : y
}
const ncdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2))
const bsPrice = (S, K, T, type, v = 0.25) => {
  const d1 = (Math.log(S / K) + (0.04 + (v * v) / 2) * T) / (v * Math.sqrt(T))
  const d2 = d1 - v * Math.sqrt(T)
  return type === 'C' ? S * ncdf(d1) - K * Math.exp(-0.04 * T) * ncdf(d2) : K * Math.exp(-0.04 * T) * ncdf(-d2) - S * ncdf(-d1)
}
function indexChain(root, day) {
  const updated = Date.parse(`${day}T21:00:00Z`) / 1000
  const j = { s: 'ok', optionSymbol: [], bid: [], ask: [], bidSize: [], openInterest: [], volume: [], delta: [], underlyingPrice: [], updated: [] }
  for (const [days, S, half] of [[5, 600, 0.05], [29, 615, 2.5], [57, 615, 2.5]]) {
    const expiry = new Date((updated + days * 86400) * 1000).toISOString().slice(0, 10)
    for (let K = 560; K <= 670; K += 5) {
      for (const type of ['C', 'P']) {
        const tight = days === 29 && K >= 610 && K <= 620
        const mid = bsPrice(S, K, days / 365, type) + (tight && K === 620 && type === 'C' ? 3 : 0)
        const h = tight ? 0.5 : half
        j.optionSymbol.push(`${root}${expiry.slice(2).replace(/-/g, '')}${type}${String(K * 1000).padStart(8, '0')}`)
        j.bid.push(Math.max(0, Math.round((mid - h) * 100) / 100))
        j.ask.push(Math.round((mid + h) * 100) / 100)
        for (const [k, v] of [['bidSize', 10], ['openInterest', 500], ['volume', 20], ['delta', null], ['underlyingPrice', null], ['updated', updated]]) j[k].push(v)
      }
    }
  }
  return j
}

test('an index chain that comes without its price (HGX) is priced from put-call parity, and its deltas read from that', () => {
  const raw = fromMarketData(indexChain('HGX', '2026-11-19'))
  assert.ok(Math.abs(raw.data.current_price - 615) < 0.05, `estimated ${raw.data.current_price}`)
  assert.equal(raw.priceEstimated, true)
  assert.equal(raw.chainSize, 138)
  const month = raw.data.options.filter((o) => o.option.startsWith('HGX261218') && o.bid > 0)
  assert.ok(month.length > 30 && month.every((o) => o.delta != null), 'every quoted option a month out has a delta')
  const atm = raw.data.options.find((o) => o.option === 'HGX261218C00615000')
  assert.ok(atm.delta > 0.45 && atm.delta < 0.6, `at-the-money call delta ${atm.delta}`)
  const priced = indexChain('HGX', '2026-11-19')
  priced.underlyingPrice.fill(612)
  const given = fromMarketData(priced)
  assert.equal(given.data.current_price, 612, "the source's own price wins")
  assert.equal(given.priceEstimated, undefined)
})

test('an estimated price is marked on the snapshot and the list, and the ticker is graded instead of left pending', async () => {
  chains.XHGX = indexChain('XHGX', nyDate(new Date()))
  chains.XHGX.openInterest.fill(0) // as the real HGX chain: no open interest or volume reported
  chains.XHGX.volume.fill(0)
  writeFileSync(join(dir, 'watchlist.json'), JSON.stringify([...TICKERS, 'XHGX']))
  const idx0 = readIndex()
  idx0.tickers.XHGX = { pending: true, error: 'chain came back without deltas' }
  writeIndex(idx0)
  const idx = await runMain('--only', 'XHGX')
  const e = idx.tickers.XHGX
  assert.equal(e.priceEstimated, true)
  assert.ok(Math.abs(e.price - 615) < 0.05, `price ${e.price}`)
  assert.equal(e.pending, undefined)
  assert.equal(e.error, undefined)
  assert.ok(['A', 'B', 'C', 'D'].includes(e.tier))
  assert.equal(e.chainSize, 138)
  assert.equal(JSON.parse(readFileSync(join(dir, 'XHGX.json'), 'utf8')).priceEstimated, true)
})

test("the delta method is given each option's bid, ask and root with its price", () => {
  let seen = null
  const at16 = Date.parse('2026-11-20T21:00:00Z') / 1000
  fromMarketData(
    { s: 'ok', optionSymbol: ['ABC271217C00100000', 'ABCW271217P00100000'], bid: [13, 0], ask: [13.5, 9.4], delta: [null, null], underlyingPrice: [100, 100], updated: [at16, at16] },
    (items) => { seen = items; return items.map(() => null) },
  )
  assert.deepEqual(seen.map(({ root, bid, ask, mid }) => ({ root, bid, ask, mid })), [{ root: 'ABC', bid: 13, ask: 13.5, mid: 13.25 }, { root: 'ABCW', bid: 0, ask: 9.4, mid: null }])
})
