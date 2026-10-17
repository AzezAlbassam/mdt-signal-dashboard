// Study 5 (PROTOCOL-study5.md): weekly entries held for 13 / 26 / 52 weeks or until a weekly
// close below SMA 40. Returns in percent; random entries with the same exit are the baseline.

import * as I from './indicators.js'
import { tradesFor, COST } from './swing.js'
import { events4 } from './study4.js'

const ok = Number.isFinite
export const EXITS5 = ['H13', 'H26', 'H52', 'T']
export const FILTERS5 = ['F0', 'F1']
export const WARMUP5 = 80

/** SPY close as of each of this series' dates (last SPY bar on or before the date). */
export function asOf(dates, ref) {
  const out = new Float64Array(dates.length).fill(NaN)
  let j = -1
  for (let i = 0; i < dates.length; i += 1) {
    while (j + 1 < ref.date.length && ref.date[j + 1] <= dates[i]) j += 1
    if (j >= 0) out[i] = ref.close[j]
  }
  return out
}

export function events5(s, spy) {
  const x = events4(s, 'weekly')
  const c = s.close
  // hi52: a new 52-week closing high, the first in 13 weeks
  const hh = I.lag(I.highest(c, 52), 1)
  const isHigh = Array.from(c, (v, i) => ok(hh[i]) && v > hh[i])
  x.events.hi52 = isHigh.map((h, i) => h && !isHigh.slice(Math.max(0, i - 13), i).some(Boolean))
  // rs_spy: stock 52-week return − SPY 52-week return crosses above 0
  const sp = asOf(s.date, spy)
  const rel = Float64Array.from(c, (v, i) => (i >= 52 && ok(sp[i]) && ok(sp[i - 52]) ? v / c[i - 52] - sp[i] / sp[i - 52] : NaN))
  x.events.rs_spy = Array.from(rel, (v, i) => i > 0 && ok(v) && ok(rel[i - 1]) && v > 0 && rel[i - 1] <= 0)
  x.sma40 = I.sma(c, 40)
  x.spyAsOf = sp
  return x
}

const done = (s, i, exitIndex, exit, reason, spy) => {
  const entry = s.open[i + 1]
  const ret = (exit * (1 - COST)) / (entry * (1 + COST)) - 1
  // SPY over (about) the same window: as-of closes at the signal week and the exit week.
  const spyRet = ok(spy[i]) && ok(spy[exitIndex]) ? spy[exitIndex] / spy[i] - 1 : NaN
  return { i, exitIndex, reason, ret, r: ret, bars: exitIndex - i, excess: ret - spyRet }
}

export function exit5(s, i, kind, sma40, spy) {
  const n = s.close.length
  if (i + 1 >= n) return null
  if (kind !== 'T') {
    const h = Number(kind.slice(1))
    if (i + h >= n) return null
    return done(s, i, i + h, s.close[i + h], 'time', spy)
  }
  const cap = i + 104
  for (let j = i + 1; j <= Math.min(cap, n - 1); j += 1) {
    if (ok(sma40[j]) && s.close[j] < sma40[j]) {
      if (j + 1 >= n) return null // signal on the last bar: the sale has not happened yet
      return done(s, i, j + 1, s.open[j + 1], 'trend', spy)
    }
  }
  if (cap >= n) return null
  return done(s, i, cap, s.close[cap], 'cap', spy)
}

export function summarize5(meta, s, spy, split) {
  const x = events5(s, spy)
  const per = (i) => (s.date[i] < split ? 'I' : 'II')
  const pack = (ts) => ({ ret: Float64Array.from(ts, (t) => t.ret), bars: Uint16Array.from(ts, (t) => t.bars), excess: Float64Array.from(ts, (t) => t.excess) })
  const base = {}
  const trades = {}
  for (const ex of EXITS5) {
    const oc = s.close.map((_, i) => (i >= WARMUP5 ? exit5(s, i, ex, x.sma40, x.spyAsOf) : null))
    for (const fl of FILTERS5) {
      const b = { I: [], II: [] }
      oc.forEach((o, i) => o && x.filters[fl][i] && b[per(i)].push(o))
      base[`${ex}|${fl}`] = Object.fromEntries(['I', 'II'].map((p) => [p, { ret: Float64Array.from(b[p], (o) => o.ret), wins: b[p].filter((o) => o.ret > 0).length }]))
      for (const [id, ev] of Object.entries(x.events)) {
        const gated = ev.map((e, i) => e && x.filters[fl][i])
        const ts = tradesFor(gated, oc, WARMUP5)
        trades[`weekly|${id}|${ex}|${fl}`] = { I: pack(ts.filter((t) => per(t.i) === 'I')), II: pack(ts.filter((t) => per(t.i) === 'II')) }
      }
    }
  }
  const last = s.close.length - 1
  const current = Object.entries(x.events).filter(([, ev]) => ev[last]).map(([id]) => ({ id, date: s.date[last], close: s.close[last], uptrend: x.filters.F1[last], sma40: x.sma40[last] }))
  return { ...meta, base, trades, current }
}
