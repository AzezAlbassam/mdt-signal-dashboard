// The pass-level rules in snapshot.js main(): what an empty answer from the source means.
// fetch and the timers are faked; everything else (files, index, history) is real.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const realTimeout = setTimeout
globalThis.setTimeout = (f, _ms, ...a) => realTimeout(f, 0, ...a)

const { main } = await import('./snapshot.js')

const TICKERS = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ', 'KKK', 'LLL']
let down = new Set()
globalThis.fetch = async (url) => {
  const t = decodeURIComponent(url.split('/').pop().replace('.json', ''))
  if (down.has(t)) return { ok: false, status: 404 }
  return {
    ok: true,
    json: async () => ({ data: { current_price: 10, options: [{ option: `${t}270115C00010000`, bid: 1, ask: 1.1, bid_size: 10, open_interest: 500, volume: 20, delta: 0.5, last_trade_time: '2026-11-19T15:00:00' }] } }),
  }
}

let dir
const prevUpdatedAt = '2026-11-19T21:06:00.000Z'
beforeEach(() => {
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
  assert.notEqual(idx.attemptedAt, prevUpdatedAt)
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
  assert.equal(process.exitCode, 1)
  process.exitCode = 0
})

test('during a partial outage a never-seen ticker is not called option-less', async () => {
  down = new Set([...TICKERS.slice(0, 6), 'NEWX'])
  writeFileSync(join(dir, 'watchlist.json'), JSON.stringify([...TICKERS, 'NEWX']))
  const idx = await pass()
  assert.equal(idx.tickers.NEWX.pending, true)
  assert.equal(idx.tickers.NEWX.noOptions, undefined)
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
