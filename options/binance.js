// Binance European options, read live from the viewer's browser.
//
// Binance refuses requests from US servers (HTTP 451), GitHub's included, so nothing can
// be prefetched on a schedule the way the Cboe chains are. The page asks Binance directly
// and runs the same sizing engine on the answer.
//
// Mapping onto the engine's contract shape:
//   volume / adv  ← 24-hour volume in coins (crypto trades round the clock; one rolling
//                   day is the closest thing to a session), sessions pinned so no prior
//   oi            ← open interest in coins
//   bidSize       ← top-of-book bid quantity, fetched only where it can change the answer
//   lot           ← the symbol's step size (0.01 BTC), multiplier ← its unit (1 coin)

import { contractMetrics, DEFAULTS } from './engine.js'

const BASE = 'https://eapi.binance.com/eapi/v1'

/** 'BTC-270326-120000-C' → { asset, expiry, strike, type } */
export function parseBinanceSymbol(sym) {
  const m = /^([A-Z0-9]+)-(\d{2})(\d{2})(\d{2})-([\d.]+)-([CP])$/.exec(sym)
  if (!m) return null
  return { asset: m[1], expiry: `20${m[2]}-${m[3]}-${m[4]}`, strike: Number(m[5]), type: m[6] }
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

/**
 * Open-interest thresholds for the grades, in coins. Equity grades ask for 2,000 / 500 /
 * 100 contracts; for coins the same idea is a notional pool: $20M / $5M / $1M.
 */
export const gradeOiFor = (indexPrice) => [20e6, 5e6, 1e6].map((usd) => usd / indexPrice)

/** Join Binance's four public feeds into engine contracts for one coin. */
export function buildContracts({ symbols, tickers, marks, openInterest, asset, today }) {
  const tick = new Map(tickers.map((t) => [t.symbol, t]))
  const mark = new Map(marks.map((m) => [m.symbol, m]))
  const oi = new Map(openInterest.map((o) => [o.symbol, num(o.sumOpenInterest) ?? 0]))
  const out = []
  for (const s of symbols) {
    const p = parseBinanceSymbol(s.symbol)
    if (!p || p.asset !== asset) continue
    if (Date.parse(`${p.expiry}T00:00:00Z`) <= Date.parse(`${today}T00:00:00Z`)) continue
    const t = tick.get(s.symbol) ?? {}
    const lotFilter = (s.filters ?? []).find((f) => f.filterType === 'LOT_SIZE')
    const priceFilter = (s.filters ?? []).find((f) => f.filterType === 'PRICE_FILTER')
    const volume = num(t.volume) ?? 0
    out.push({
      sym: s.symbol, expiry: p.expiry, type: p.type, strike: p.strike,
      bid: num(t.bidPrice) ?? 0, ask: num(t.askPrice) ?? 0, bidSize: 0, depthKnown: false,
      volume, adv: volume, sessions: DEFAULTS.minSessions,
      oi: oi.get(s.symbol) ?? 0, delta: num(mark.get(s.symbol)?.delta),
      lot: num(lotFilter?.stepSize) ?? num(s.minQty) ?? 0.01,
      multiplier: num(s.unit) ?? 1,
      tick: num(priceFilter?.tickSize) ?? 0.01,
    })
  }
  return out
}

/**
 * Whether the top-of-book bid could change this contract's size. The bid path is
 * min(bid size, 24h volume), so it is worthless with no volume, and irrelevant when the
 * open-interest cap already binds below the volume path.
 */
export function needsDepth(c, opts = {}) {
  if (c.depthKnown || !(c.bid > 0) || !(c.adv > 0)) return false
  const m = contractMetrics({ ...c, bidSize: 0 }, opts)
  if (m.binding === 'spread') return false
  return m.capByOi > m.capByAdv
}

// --- network --------------------------------------------------------------------------

async function get(path) {
  let res
  try {
    res = await fetch(`${BASE}${path}`)
  } catch (e) {
    throw Object.assign(new Error('blocked'), { kind: 'network' })
  }
  if (res.status === 451) throw Object.assign(new Error('restricted'), { kind: 'region' })
  if (res.status === 429 || res.status === 418) throw Object.assign(new Error('rate'), { kind: 'rate' })
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { kind: 'http' })
  return res.json()
}

const cache = new Map()
export const clearCache = () => cache.clear()
async function cached(key, ms, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ms) return hit.value
  const value = await fn()
  cache.set(key, { at: Date.now(), value })
  return value
}

export const exchangeInfo = () => cached('info', 30 * 60e3, () => get('/exchangeInfo'))

/** Coins with listed options, e.g. ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE']. */
export async function listAssets() {
  const info = await exchangeInfo()
  return [...new Set((info.optionContracts ?? []).map((c) => c.baseAsset))]
}

/** Everything for one coin except depth. Cached for a minute: prices move. */
export function loadAsset(asset) {
  return cached(`asset:${asset}`, 60e3, async () => {
    const info = await exchangeInfo()
    const underlying = (info.optionContracts ?? []).find((c) => c.baseAsset === asset)?.underlying ?? `${asset}USDT`
    const symbols = (info.optionSymbols ?? []).filter((s) => s.underlying === underlying)
    const [tickers, marks, index] = await Promise.all([
      cached('tickers', 30e3, () => get('/ticker')),
      cached('marks', 30e3, () => get('/mark')),
      get(`/index?underlying=${underlying}`),
    ])
    const expiries = [...new Set(symbols.map((s) => parseBinanceSymbol(s.symbol)?.expiry).filter(Boolean))]
    const openInterest = (await Promise.all(expiries.map((e) =>
      get(`/openInterest?underlyingAsset=${asset}&expiration=${e.slice(2, 4)}${e.slice(5, 7)}${e.slice(8, 10)}`).catch(() => []),
    ))).flat()
    const today = new Date().toISOString().slice(0, 10)
    const price = num(index.indexPrice)
    return {
      t: asset, live: true, price, fetchedAt: new Date().toISOString(),
      gradeOi: gradeOiFor(price),
      contracts: buildContracts({ symbols, tickers, marks, openInterest, asset, today }),
    }
  })
}

/**
 * Fetch top-of-book bids for every contract whose size could depend on it. Two requests
 * at a time, so a coin's whole chain stays well inside Binance's public rate limits.
 */
export async function fillDepth(contracts, opts = {}, onProgress = () => {}) {
  const todo = contracts.filter((c) => needsDepth(c, opts))
  let done = 0
  const worker = async () => {
    while (todo.length) {
      const c = todo.shift()
      const d = await get(`/depth?symbol=${encodeURIComponent(c.sym)}&limit=10`)
      c.bidSize = num(d.bids?.[0]?.[1]) ?? 0
      c.depthKnown = true
      done += 1
      onProgress(done, done + todo.length)
    }
  }
  await Promise.all([worker(), worker()])
}
