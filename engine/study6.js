// Study 6 (PROTOCOL-study6.md): FLT (Four-Line Trend) and MOD (Multi-Oscillator
// Divergence) — open indicators built from the public description of TBO and TBT
// Divergence. They are not those products; their formulas are not public.
// Daily bars; returns in percent; random entries with the same exit are the baseline.

import * as I from './indicators.js'
import { tradesFor, COST } from './swing.js'

const ok = Number.isFinite
export const ENTRIES6 = ['OL', 'CU', 'BC', 'MOD', 'DB']
export const EXITS6 = ['X', 'H20']
export const EXITS6L = ['M3', 'M6', 'M12', 'XD'] // addendum 1: medium and long holds
export const WARMUP6 = 250
export const CAP6 = 250
export const SPLIT6 = { crypto: '2022-01-01', us: '2018-01-01' }

// §3: the four stored Bitstamp series, then the twenty Binance pairs.
export const CRYPTO6 = [
  ...['BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD'].map((p) => ({ symbol: `BITSTAMP:${p}`, file: `data/swing/BITSTAMP_${p}.json` })),
  ...['BNB', 'SOL', 'DOGE', 'ADA', 'TRX', 'LINK', 'AVAX', 'XLM', 'BCH', 'DOT', 'HBAR', 'UNI', 'ETC', 'ATOM', 'NEAR', 'FIL', 'AAVE', 'ALGO', 'VET', 'ICP']
    .map((c) => ({ symbol: `BINANCE:${c}USDT`, file: `data/crypto/bars/BINANCE_${c}USDT.json.gz` })),
]

const crossOver = (a, b) => Array.from(a, (_, i) => i > 0 && ok(a[i]) && ok(b[i]) && ok(a[i - 1]) && ok(b[i - 1]) && a[i] > b[i] && a[i - 1] <= b[i - 1])

/** FLT lines and signals (§1). */
export function flt(s) {
  const c = s.close
  const fast = I.ema(c, 20)
  const midFast = I.ema(c, 50)
  const midSlow = I.ema(c, 100)
  const slow = I.ema(c, 200)
  const prevHigh = I.lag(I.highest(s.high, 20), 1)
  const breakout = Array.from(c, (v, i) => ok(prevHigh[i]) && ok(slow[i]) && v > prevHigh[i] && v > Math.max(fast[i], midFast[i], midSlow[i], slow[i]))
  const cluster = new Array(c.length).fill(false)
  let last = -Infinity
  for (let i = 4; i < c.length; i += 1) {
    let k = 0
    for (let j = i - 4; j <= i; j += 1) if (breakout[j]) k += 1
    if (k >= 3 && i - last > 20) { cluster[i] = true; last = i }
  }
  return {
    fast, midFast, midSlow, slow, breakout,
    openLong: crossOver(fast, midFast),
    closeLong: crossOver(midFast, fast),
    crossUp: crossOver(fast, slow),
    crossDown: crossOver(slow, fast),
    cluster,
  }
}

/** Pivot lows with k bars each side, strict; pivot p is known at bar p + k. */
export function pivotLowsConfirmed(low, k = 5) {
  const at = new Int32Array(low.length).fill(-1) // at[c] = p when pivot p is confirmed at c
  for (let c = 2 * k; c < low.length; c += 1) {
    const p = c - k
    let piv = true
    for (let j = 1; j <= k && piv; j += 1) piv = low[p] < low[p - j] && low[p] < low[p + j]
    if (piv) at[c] = p
  }
  return at
}

/** MOD bullish signals (§1): 2 of 4 oscillators show regular bullish divergence. */
export function mod(s) {
  const osc = [
    I.rsi(s.close, 14),
    I.macd(s.close).macd,
    I.obv(s.close, s.volume),
    I.mfi(s.high, s.low, s.close, s.volume, 14),
  ]
  const at = pivotLowsConfirmed(s.low, 5)
  const bull = new Array(s.close.length).fill(false)
  const count = new Int8Array(s.close.length)
  let p1 = -1
  for (let c = 0; c < at.length; c += 1) {
    const p2 = at[c]
    if (p2 < 0) continue
    if (p1 >= 0 && p2 - p1 <= 60 && s.low[p2] < s.low[p1]) {
      let k = 0
      for (const o of osc) if (ok(o[p1]) && ok(o[p2]) && o[p2] > o[p1]) k += 1
      count[c] = k
      bull[c] = k >= 2
    }
    p1 = p2
  }
  return { bull, count }
}

/** All five entry events (§2), each a boolean per bar. */
export function events6(s) {
  const f = flt(s)
  const m = mod(s)
  const db = new Array(s.close.length).fill(false)
  let lastMod = -Infinity
  let used = true
  for (let i = 0; i < s.close.length; i += 1) {
    if (f.breakout[i] && !used && i - lastMod >= 1 && i - lastMod <= 20) { db[i] = true; used = true }
    if (m.bull[i]) { lastMod = i; used = false }
  }
  return { flt: f, mod: m, events: { OL: f.openLong, CU: f.crossUp, BC: f.cluster, MOD: m.bull, DB: db } }
}

const done = (s, i, exitIndex, exit, reason) => {
  const entry = s.open[i + 1]
  const ret = (exit * (1 - COST)) / (entry * (1 + COST)) - 1
  return { i, exitIndex, reason, ret, r: ret, bars: exitIndex - i, excess: NaN }
}

/** Exit for a signal on bar i's close, bought at bar i+1's open (§2). null = not finished. */
export function exit6(s, i, kind, closeLong) {
  const n = s.close.length
  if (i + 1 >= n) return null
  if (kind === 'H20') return i + 20 < n ? done(s, i, i + 20, s.close[i + 20], 'time') : null
  const cap = i + CAP6
  for (let j = i + 1; j <= Math.min(cap, n - 1); j += 1) {
    if (closeLong[j]) return j + 1 < n ? done(s, i, j + 1, s.open[j + 1], 'close-long') : null
  }
  return cap < n ? done(s, i, cap, s.close[cap], 'cap') : null
}

/** ISO date + m calendar months; a day past the month's end is clamped to its last day. */
export function addMonths(date, m) {
  const [y, mo, d] = date.split('-').map(Number)
  const last = new Date(Date.UTC(y, mo - 1 + m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, mo - 1 + m, Math.min(d, last))).toISOString().slice(0, 10)
}

/** Addendum 1 exits: M3/M6/M12 calendar holds, XD = until FLT Cross Down (≤ 24 months). */
export function exitLong(s, i, kind, crossDown) {
  const n = s.close.length
  if (i + 1 >= n) return null
  const months = kind === 'XD' ? 24 : Number(kind.slice(1))
  const target = addMonths(s.date[i], months)
  for (let j = i + 1; j < n; j += 1) {
    if (s.date[j] >= target) return done(s, i, j, s.close[j], kind === 'XD' ? 'cap' : 'time')
    if (kind === 'XD' && crossDown[j]) return j + 1 < n ? done(s, i, j + 1, s.open[j + 1], 'cross-down') : null
  }
  return null
}

/** Per-symbol trades and random-entry populations, keyed for scripts/study5-common.js `pool`. */
export function summarize6(meta, s, split, { keep = false, exits = EXITS6 } = {}) {
  const x = events6(s)
  const per = (i) => (s.date[i] < split ? 'I' : 'II')
  const pack = (ts) => ({ ret: Float64Array.from(ts, (t) => t.ret), bars: Uint16Array.from(ts, (t) => t.bars), excess: Float64Array.from(ts, (t) => t.excess) })
  const base = {}
  const trades = {}
  const lists = {}
  const exitFor = (i, ex) => (EXITS6.includes(ex) ? exit6(s, i, ex, x.flt.closeLong) : exitLong(s, i, ex, x.flt.crossDown))
  for (const ex of exits) {
    const oc = s.close.map((_, i) => (i >= WARMUP6 ? exitFor(i, ex) : null))
    const b = { I: [], II: [] }
    oc.forEach((o, i) => o && b[per(i)].push(o))
    base[`${ex}|F0`] = Object.fromEntries(['I', 'II'].map((p) => [p, { ret: Float64Array.from(b[p], (o) => o.ret), wins: b[p].filter((o) => o.ret > 0).length }]))
    for (const id of ENTRIES6) {
      const ts = tradesFor(x.events[id], oc, WARMUP6)
      const key = `daily|${id}|${ex}|F0`
      trades[key] = { I: pack(ts.filter((t) => per(t.i) === 'I')), II: pack(ts.filter((t) => per(t.i) === 'II')) }
      if (keep) lists[key] = ts.map((t) => ({ signal: s.date[t.i], exit: s.date[t.exitIndex], ret: t.ret, reason: t.reason }))
    }
  }
  const lastBar = s.close.length - 1
  const current = Object.fromEntries(ENTRIES6.map((id) => {
    let k = lastBar
    while (k >= 0 && !x.events[id][k]) k -= 1
    return [id, k >= 0 ? s.date[k] : null]
  }))
  return { ...meta, base, trades, current, ...(keep ? { lists } : {}) }
}
