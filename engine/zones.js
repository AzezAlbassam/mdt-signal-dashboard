// Study 13 (PROTOCOL-study13.md): buy and sell zones for profitable companies, drawn from a
// stock's own history. Every month uses its own close and the fiscal year known then (study 7's
// rule, `stateAt`), so a value never sees a later report.
import { stateAt, addMonths } from './fairvalue.js'

const pos = (x) => Number.isFinite(x) && x > 0
export const ZONE = { buy: 0.2, sell: 0.8, minMonths: 36, stretchMonths: 48 }

/**
 * Map(month → { pe, ps, ev, pfcf, stretch }), each only when positive. P/FCF is left out for the
 * Finance sector; stretch = the close ÷ the mean of the 48 closes up to that month (all present).
 * `state(m)` is the fiscal-year state at m (the backtest rule by default).
 */
export function monthlyMultiples(funds, closes, sector, state = (m) => stateAt(funds, m)) {
  const out = new Map()
  for (const m of [...closes.keys()].sort()) {
    const c = closes.get(m)
    if (!pos(c)) continue
    const st = state(m)
    const v = {}
    if (st) {
      if (pos(st.eps)) v.pe = c / st.eps
      if (pos(st.revPS)) v.ps = c / st.revPS
      const ev = pos(st.ebitda) && pos(st.shares) ? (c * st.shares + (st.debt ?? 0)) / st.ebitda : null
      if (pos(ev)) v.ev = ev
      if (sector !== 'Finance' && pos(st.fcfPS)) v.pfcf = c / st.fcfPS
    }
    let sum = 0
    let k = 0
    for (; k < ZONE.stretchMonths && pos(closes.get(addMonths(m, -k))); k += 1) sum += closes.get(addMonths(m, -k))
    if (k === ZONE.stretchMonths) v.stretch = c / (sum / k)
    out.set(m, v)
  }
  return out
}

/**
 * Own-history percentile of `key` at d: the share of the months before d whose value was below the
 * value at d, ties counting half; null without a value at d or with fewer than 36 earlier months.
 * `series` maps month → { [key]: value } (or month → value when key is null).
 */
export function ownPercentile(series, key, d, min = ZONE.minMonths) {
  const get = (v) => (key == null ? v : v?.[key])
  const now = get(series.get(d))
  if (!Number.isFinite(now)) return null
  let below = 0
  let n = 0
  for (const [m, v] of series) {
    const x = get(v)
    if (m >= d || !Number.isFinite(x)) continue
    n += 1
    below += x < now ? 1 : x === now ? 0.5 : 0
  }
  return n >= min ? below / n : null
}

/** Buy (cheap end), sell (expensive end) or null for a percentile, or for PEG with its own cutoffs. */
export const zoneOf = (p) => (p == null ? null : p <= ZONE.buy ? 'buy' : p >= ZONE.sell ? 'sell' : null)
export const pegZone = (peg) => (peg == null ? null : peg < 1 ? 'buy' : peg > 2 ? 'sell' : null)
