// Pull delayed option chains from Cboe for every ticker on the watchlist, fold today's
// volume into a rolling 20-session history, and write one compact snapshot per ticker.
//
//   node options/snapshot.js <dataDir> [--add MSTR,HOOD] [--remove XYZ] [--only MSTR]
//
// <dataDir> holds watchlist.json, removed.json, history/<T>.json and receives <T>.json + index.json.
// Runs in GitHub Actions; the page reads the snapshots as static files.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { chainRows, mergeSession, averageVolume, tickerSummary } from './engine.js'

const INDEXES = new Set(['SPX', 'NDX', 'RUT', 'VIX', 'XSP', 'DJX', 'OEX', 'XEO'])
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(p, 'utf8'))
  } catch {
    return fallback
  }
}

const cleanTickers = (s) =>
  (s ?? '').split(/[,\s]+/).map((t) => t.trim().toUpperCase().replace(/^\$/, '')).filter((t) => /^[A-Z.]{1,6}$/.test(t))

/** US regular session, 9:30–16:00 New York time, Monday–Friday. */
export function marketOpen(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  )
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false
  const mins = Number(p.hour) * 60 + Number(p.minute)
  return mins >= 570 && mins < 960
}

async function fetchChain(ticker) {
  const sym = INDEXES.has(ticker) ? `_${ticker}` : ticker
  const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(sym)}.json`
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (res.ok) return res.json()
    if (res.status === 403 || res.status === 404) throw Object.assign(new Error('no listed options'), { noOptions: true })
    await new Promise((r) => setTimeout(r, 2000 * attempt))
  }
  throw new Error('Cboe did not answer after 3 attempts')
}

export async function snapshotTicker(ticker, dataDir, now) {
  const raw = await fetchChain(ticker)
  const today = now.toISOString().slice(0, 10)
  const { rows, session, totalVolume, price } = chainRows(raw, ticker, today)
  if (rows.length === 0) throw Object.assign(new Error('no listed options'), { noOptions: true })

  // History: one figure per contract per session, the day's final volume.
  const histPath = join(dataDir, 'history', `${ticker}.json`)
  let history = await readJson(histPath, null)
  if (session && totalVolume > 0) {
    history = mergeSession(history, session, Object.fromEntries(rows.map((r) => [r.sym, r.volume])))
    await writeFile(histPath, JSON.stringify(history))
  }

  // Outside market hours the delayed feed can show pulled or stale quotes; keep the
  // last intraday quotes for any contract that already has them.
  const open = marketOpen(now)
  // While the session is still trading its volume is partial: average completed sessions only.
  const inProgress = open && history?.dates?.at(-1) === session ? 1 : 0
  const completedSessions = (history?.dates?.length ?? 0) - inProgress
  const prev = await readJson(join(dataDir, `${ticker}.json`), null)
  const prevQuotes = new Map()
  if (prev?.rows) {
    const ci = Object.fromEntries(prev.cols.map((c, i) => [c, i]))
    for (const r of prev.rows) prevQuotes.set(r[ci.sym], { bid: r[ci.bid], ask: r[ci.ask], bidSize: r[ci.bidSize] })
  }
  const quotesFrom = open ? now.toISOString() : prev?.quotesFrom ?? now.toISOString()
  const quotesIntraday = open || Boolean(prev?.quotesIntraday)

  const expiries = [...new Set(rows.map((r) => r.expiry))].sort()
  const expIndex = new Map(expiries.map((e, i) => [e, i]))
  const cols = ['sym', 'exp', 'type', 'strike', 'bid', 'ask', 'bidSize', 'volume', 'oi', 'delta', 'adv', 'sessions']
  const contracts = rows.map((r) => {
    const q = !open && prevQuotes.has(r.sym) ? prevQuotes.get(r.sym) : r
    const { adv, sessions } = averageVolume(history?.vol?.[r.sym]?.slice(0, completedSessions))
    return { ...r, bid: q.bid, ask: q.ask, bidSize: q.bidSize, adv: Math.round(adv * 10) / 10, sessions }
  })
  const out = contracts.map((c) => [
    c.sym, expIndex.get(c.expiry), c.type, c.strike, c.bid, c.ask, c.bidSize, c.volume, c.oi,
    c.delta == null ? null : Math.round(c.delta * 1000) / 1000, c.adv, c.sessions,
  ])
  const summary = tickerSummary(contracts, today)

  const snap = {
    ticker,
    price,
    cboeTimestamp: raw.timestamp ?? null,
    fetchedAt: now.toISOString(),
    quotesFrom,
    quotesIntraday,
    session,
    historySessions: completedSessions,
    sessionInProgress: Boolean(inProgress),
    historyDates: history?.dates ?? [],
    expiries,
    cols,
    rows: out,
  }
  await writeFile(join(dataDir, `${ticker}.json`), JSON.stringify(snap))
  return {
    price: snap.price, contracts: out.length, session, historySessions: snap.historySessions, fetchedAt: snap.fetchedAt,
    tier: summary.tier, medianSpread: summary.medianSpread == null ? null : Math.round(summary.medianSpread * 1000) / 1000,
    capacity: summary.capacity, oi: summary.oi,
  }
}

async function main() {
  const [dataDir, ...rest] = process.argv.slice(2)
  if (!dataDir) throw new Error('usage: node options/snapshot.js <dataDir> [--add T,..] [--remove T,..]')
  const arg = (name) => {
    const i = rest.indexOf(name)
    return i >= 0 ? rest[i + 1] : ''
  }
  await mkdir(join(dataDir, 'history'), { recursive: true })

  // Watchlist = the seed in the repo ∪ what was added since − what was removed since.
  const seed = await readJson(new URL('./watchlist.json', import.meta.url), [])
  const stored = await readJson(join(dataDir, 'watchlist.json'), [])
  const removed = new Set(await readJson(join(dataDir, 'removed.json'), []))
  const add = cleanTickers(arg('--add'))
  for (const t of add) removed.delete(t)
  for (const t of cleanTickers(arg('--remove'))) removed.add(t)
  const watchlist = [...new Set([...seed, ...stored, ...add])].filter((t) => !removed.has(t))
  await writeFile(join(dataDir, 'watchlist.json'), JSON.stringify(watchlist))
  await writeFile(join(dataDir, 'removed.json'), JSON.stringify([...removed]))

  const only = cleanTickers(arg('--only'))
  const targets = only.length ? only.filter((t) => !removed.has(t)) : watchlist
  const prevIndex = await readJson(join(dataDir, 'index.json'), { tickers: {} })
  const index = { updatedAt: new Date().toISOString(), marketOpen: marketOpen(), tickers: {} }
  for (const t of watchlist) if (prevIndex.tickers?.[t]) index.tickers[t] = prevIndex.tickers[t]

  // A small pool: fast enough for ~750 tickers, gentle enough on Cboe.
  let failures = 0
  let noOptions = 0
  const queue = [...targets]
  const worker = async () => {
    while (queue.length) {
      const t = queue.shift()
      try {
        index.tickers[t] = await snapshotTicker(t, dataDir, new Date())
      } catch (e) {
        if (e.noOptions) {
          noOptions += 1
          index.tickers[t] = { noOptions: true }
        } else {
          failures += 1
          index.tickers[t] = { ...(index.tickers[t] ?? {}), error: String(e.message ?? e) }
          console.log(`${t}: FAILED — ${e.message ?? e}`)
        }
      }
      await new Promise((r) => setTimeout(r, 150))
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  console.log(`${targets.length} tickers: ${targets.length - failures - noOptions} with options, ${noOptions} without, ${failures} failed`)
  await writeFile(join(dataDir, 'index.json'), JSON.stringify(index, null, 2))
  if (failures > targets.length / 2) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
