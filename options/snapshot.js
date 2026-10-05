// Pull delayed option chains from Cboe for every ticker on the watchlist, fold today's
// volume into a rolling 20-session history, and write one compact snapshot per ticker.
//
//   node options/snapshot.js <dataDir> [--add MSTR,HOOD] [--remove XYZ]
//
// <dataDir> holds watchlist.json, history/<T>.json and receives <T>.json + index.json.
// Runs in GitHub Actions; the page reads the snapshots as static files.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { parseOccSymbol, daysToExpiry, mergeSession, averageVolume } from './engine.js'

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
    if (res.status === 403 || res.status === 404) throw new Error(`HTTP ${res.status} (no chain for ${ticker}?)`)
    await new Promise((r) => setTimeout(r, 2000 * attempt))
  }
  throw new Error('Cboe did not answer after 3 attempts')
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

export async function snapshotTicker(ticker, dataDir, now) {
  const raw = await fetchChain(ticker)
  const d = raw.data ?? raw
  const today = now.toISOString().slice(0, 10)
  const roots = new Set([ticker, `${ticker}W`])

  const rows = []
  let session = ''
  let totalVolume = 0
  for (const o of d.options ?? []) {
    const p = parseOccSymbol(o.option)
    if (!p || !roots.has(p.root)) continue // adjusted roots carry non-standard deliverables
    if (daysToExpiry(p.expiry, today) < 1) continue
    const volume = num(o.volume) ?? 0
    const oi = num(o.open_interest) ?? 0
    const bid = num(o.bid) ?? 0
    const ask = num(o.ask) ?? 0
    totalVolume += volume
    if (o.last_trade_time && o.last_trade_time.slice(0, 10) > session) session = o.last_trade_time.slice(0, 10)
    if (oi === 0 && volume === 0 && bid === 0) continue
    rows.push({
      sym: o.option, expiry: p.expiry, type: p.type, strike: p.strike,
      bid, ask, bidSize: num(o.bid_size) ?? 0, askSize: num(o.ask_size) ?? 0,
      last: num(o.last_trade_price), volume, oi, iv: num(o.iv), delta: num(o.delta),
    })
  }
  if (rows.length === 0) throw new Error('chain came back empty')

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
  const prev = await readJson(join(dataDir, `${ticker}.json`), null)
  const prevQuotes = new Map()
  if (prev?.rows) {
    const ci = Object.fromEntries(prev.cols.map((c, i) => [c, i]))
    for (const r of prev.rows) prevQuotes.set(r[ci.sym], { bid: r[ci.bid], ask: r[ci.ask], bidSize: r[ci.bidSize], askSize: r[ci.askSize] })
  }
  const quotesFrom = open ? now.toISOString() : prev?.quotesFrom ?? now.toISOString()
  const quotesIntraday = open || Boolean(prev?.quotesIntraday)

  const expiries = [...new Set(rows.map((r) => r.expiry))].sort()
  const expIndex = new Map(expiries.map((e, i) => [e, i]))
  const cols = ['sym', 'exp', 'type', 'strike', 'bid', 'ask', 'bidSize', 'askSize', 'last', 'volume', 'oi', 'iv', 'delta', 'adv', 'sessions']
  const out = rows.map((r) => {
    const q = !open && prevQuotes.has(r.sym) ? prevQuotes.get(r.sym) : r
    const { adv, sessions } = averageVolume(history?.vol?.[r.sym])
    return [
      r.sym, expIndex.get(r.expiry), r.type, r.strike, q.bid, q.ask, q.bidSize, q.askSize,
      r.last, r.volume, r.oi, r.iv == null ? null : Math.round(r.iv * 10000) / 10000,
      r.delta == null ? null : Math.round(r.delta * 1000) / 1000, Math.round(adv * 10) / 10, sessions,
    ]
  })

  const snap = {
    ticker,
    price: num(d.current_price) ?? num(d.close),
    cboeTimestamp: raw.timestamp ?? null,
    fetchedAt: now.toISOString(),
    quotesFrom,
    quotesIntraday,
    session,
    historySessions: history?.dates?.length ?? 0,
    historyDates: history?.dates ?? [],
    expiries,
    cols,
    rows: out,
  }
  await writeFile(join(dataDir, `${ticker}.json`), JSON.stringify(snap))
  return { ticker, price: snap.price, contracts: out.length, session, historySessions: snap.historySessions, fetchedAt: snap.fetchedAt }
}

async function main() {
  const [dataDir, ...rest] = process.argv.slice(2)
  if (!dataDir) throw new Error('usage: node options/snapshot.js <dataDir> [--add T,..] [--remove T,..]')
  const arg = (name) => {
    const i = rest.indexOf(name)
    return i >= 0 ? rest[i + 1] : ''
  }
  await mkdir(join(dataDir, 'history'), { recursive: true })

  const seed = await readJson(new URL('./watchlist.json', import.meta.url), [])
  let watchlist = await readJson(join(dataDir, 'watchlist.json'), seed)
  const add = cleanTickers(arg('--add'))
  const remove = new Set(cleanTickers(arg('--remove')))
  watchlist = [...new Set([...watchlist, ...add])].filter((t) => !remove.has(t))
  await writeFile(join(dataDir, 'watchlist.json'), JSON.stringify(watchlist, null, 2))

  const only = cleanTickers(arg('--only'))
  const targets = only.length ? only : watchlist
  const prevIndex = await readJson(join(dataDir, 'index.json'), { tickers: {} })
  const index = { updatedAt: new Date().toISOString(), marketOpen: marketOpen(), tickers: {} }
  for (const t of watchlist) if (prevIndex.tickers?.[t]) index.tickers[t] = prevIndex.tickers[t]

  let failures = 0
  for (const t of targets) {
    try {
      const s = await snapshotTicker(t, dataDir, new Date())
      index.tickers[t] = { ...s, error: null }
      console.log(`${t}: ${s.contracts} contracts, $${s.price}, session ${s.session}, history ${s.historySessions}`)
    } catch (e) {
      failures += 1
      index.tickers[t] = { ...(index.tickers[t] ?? { ticker: t }), error: String(e.message ?? e) }
      console.log(`${t}: FAILED — ${e.message ?? e}`)
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  await writeFile(join(dataDir, 'index.json'), JSON.stringify(index, null, 2))
  if (failures === targets.length && targets.length > 0) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
