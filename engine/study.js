// Study machinery that scales to many symbols (PROTOCOL-us.md §3): each symbol is reduced to
// compact per-rule outcomes as soon as it is loaded, then the tracks are aggregated from
// those. The rules, exits, metrics and nulls are study 1's (scripts/swing-backtest.js);
// `node scripts/us-backtest.js --study1` reruns study 1 through this path as a check.

import { TRACKS, signals, toWeekly, outcomesFor, tradesFor, regimeReturns, perf } from './swing.js'
import { wilsonInterval, bootstrapMean } from './stats.js'

export const DRAWS_AB = 2000
export const DRAWS_C = 1000
export const THIN = 100
export const PERIODS = ['I', 'II']
const REASONS = ['target', 'stop', 'time']

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const median = (xs) => {
  const s = Array.from(xs).filter(Number.isFinite).sort((a, b) => a - b)
  if (!s.length) return NaN
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
export const mean = (xs) => {
  let s = 0
  for (const x of xs) s += x
  return xs.length ? s / xs.length : NaN
}

export function holm(ps) {
  const idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0])
  const out = new Array(ps.length)
  let run = 0
  idx.forEach(([p, i], k) => {
    run = Math.max(run, Math.min(1, (ps.length - k) * p))
    out[i] = run
  })
  return out
}

const pack = (trades) => ({
  r: Float64Array.from(trades, (t) => t.r),
  ret: Float64Array.from(trades, (t) => t.ret),
  bars: Uint16Array.from(trades, (t) => t.bars),
  reason: Uint8Array.from(trades, (t) => REASONS.findIndex((k) => t.reason.startsWith(k))),
})

/** Reduce one symbol's daily series to everything the study needs. */
export function summarizeSymbol(meta, daily, { cutoff, split }) {
  const periodOf = (d) => (d < split ? 'I' : 'II')
  const weekly = toWeekly(daily, cutoff)
  const sig = { daily: signals(daily, 'daily'), weekly: signals(weekly, 'weekly') }
  const out = { ...meta, tracks: {}, current: { A: [], B: [], C: [] } }

  for (const [key, tf] of [['A', 'daily'], ['B', 'weekly']]) {
    const track = TRACKS[key]
    const s = tf === 'daily' ? daily : weekly
    const outcomes = outcomesFor(s, sig[tf].atr, track)
    const base = { I: [], II: [] }
    outcomes.forEach((o, i) => o && base[periodOf(s.date[i])].push(o))
    const trades = {}
    for (const [id, ev] of Object.entries(sig[tf].events)) {
      const all = tradesFor(ev, outcomes, track.warmup)
      trades[id] = Object.fromEntries(PERIODS.map((p) => [p, pack(all.filter((t) => periodOf(s.date[t.i]) === p))]))
    }
    out.tracks[key] = {
      base: Object.fromEntries(PERIODS.map((p) => [p, { r: Float64Array.from(base[p], (o) => o.r), wins: base[p].filter((o) => o.ret > 0).length }])),
      trades,
    }
    const i = s.close.length - 1
    for (const [id, ev] of Object.entries(sig[tf].events)) {
      if (!ev[i]) continue
      out.current[key].push({ id, date: s.date[i], close: s.close[i], atr: sig[tf].atr[i],
        stop: s.close[i] - track.stopAtr * sig[tf].atr[i], target: s.close[i] + track.targetAtr * sig[tf].atr[i], horizon: track.horizon })
    }
  }

  out.weekly = { date: weekly.date, open: Float64Array.from(weekly.open), close: Float64Array.from(weekly.close) }
  out.states = Object.fromEntries(Object.entries(sig.weekly.states).map(([id, st]) => [id, Uint8Array.from(st, Boolean)]))
  const wi = weekly.close.length - 1
  for (const [id, st] of Object.entries(out.states)) {
    out.current.C.push({ id, date: weekly.date[wi], close: weekly.close[wi], in: Boolean(st[wi]), changed: Boolean(st[wi]) !== Boolean(st[wi - 1]) })
  }
  return out
}

// ── tracks A and B ─────────────────────────────────────────────────────────────

/** Pooled statistics for one rule over a set of symbols in one period, with its permutation test. */
function poolRule(syms, key, id, p, rng, groupKey) {
  const per = syms.map((x) => ({ x, t: x.tracks[key].trades[id][p], base: x.tracks[key].base[p] }))
  let n = 0
  let sumR = 0
  let wins = 0
  let baseSum = 0
  let baseWinSum = 0
  let pos = 0
  let neg = 0
  let sumRet = 0
  let sumBars = 0
  const reasons = [0, 0, 0]
  const rs = []
  for (const q of per) {
    const k = q.t.r.length
    if (!k) continue
    const bn = q.base.r.length
    n += k
    baseSum += k * mean(q.base.r)
    baseWinSum += k * (q.base.wins / bn)
    for (let j = 0; j < k; j += 1) {
      const r = q.t.r[j]
      rs.push(r)
      sumR += r
      if (r > 0) pos += r
      else neg -= r
      if (q.t.ret[j] > 0) wins += 1
      sumRet += q.t.ret[j]
      sumBars += q.t.bars[j]
      reasons[q.t.reason[j]] += 1
    }
  }
  const obs = n ? sumR / n : NaN
  const baseMean = n ? baseSum / n : NaN

  let ge = 0
  let le = 0
  if (n && rng) {
    const active = per.filter((q) => q.t.r.length)
    for (let d = 0; d < DRAWS_AB; d += 1) {
      let sum = 0
      for (const q of active) {
        const R = q.base.r
        const L = R.length
        for (let j = q.t.r.length; j > 0; j -= 1) sum += R[Math.floor(rng() * L)]
      }
      const m = sum / n
      if (m >= obs) ge += 1
      if (m <= obs) le += 1
    }
  }

  const symEdges = per.filter((q) => q.t.r.length >= 5).map((q) => mean(q.t.r) - mean(q.base.r))
  const groups = {}
  if (groupKey) {
    for (const q of per) {
      const g = q.x[groupKey]
      groups[g] ??= { n: 0, sum: 0, base: 0, wins: 0 }
      const G = groups[g]
      const k = q.t.r.length
      if (!k) continue
      G.n += k
      G.base += k * mean(q.base.r)
      for (let j = 0; j < k; j += 1) {
        G.sum += q.t.r[j]
        if (q.t.ret[j] > 0) G.wins += 1
      }
    }
    for (const G of Object.values(groups)) {
      G.edge = G.n ? (G.sum - G.base) / G.n : null
      G.win = G.n ? G.wins / G.n : null
      delete G.sum
      delete G.base
      delete G.wins
    }
  }

  return {
    n,
    meanR: obs,
    ci: n && rng ? bootstrapMean(rs, { rng, draws: 2000 }) : null,
    baseR: baseMean,
    edge: obs - baseMean,
    win: n ? wins / n : null,
    winCi: wilsonInterval(wins, n),
    baseWin: n ? baseWinSum / n : null,
    pf: neg > 0 ? pos / neg : null,
    meanRet: n ? sumRet / n : NaN,
    hold: n ? sumBars / n : NaN,
    p: n && rng ? (ge + 1) / (DRAWS_AB + 1) : null,
    pLow: n && rng ? (le + 1) / (DRAWS_AB + 1) : null,
    breadth: symEdges.length ? symEdges.filter((e) => e > 0).length / symEdges.length : null,
    breadthN: symEdges.length,
    groups,
    exits: Object.fromEntries(REASONS.map((k, i) => [k, n ? reasons[i] / n : null])),
  }
}

export function verdictAB(r) {
  if (r.II.n < THIN) return 'Thin'
  if (r.II.pLow < 0.05 && r.II.edge < 0) return 'Worse than random'
  if (r.II.edge > 0 && r.II.pHolm < 0.05 && r.I.edge > 0) return 'Robust'
  if (r.II.edge > 0 && r.II.p < 0.05) return 'Possible'
  return 'No edge'
}

export function runTradeTrack(syms, key, seed, groupKey = 'group') {
  const rng = mulberry32(seed)
  const ids = Object.keys(syms[0].tracks[key].trades)
  const rows = ids.map((id) => {
    const row = { id }
    for (const p of PERIODS) row[p] = poolRule(syms, key, id, p, rng, groupKey)
    return row
  })
  const adj = holm(rows.map((r) => r.II.p))
  rows.forEach((r, k) => {
    r.II.pHolm = adj[k]
    r.verdict = verdictAB(r)
  })
  rows.sort((a, b) => (a.verdict === 'Thin') - (b.verdict === 'Thin') || b.II.edge - a.II.edge)
  const baseline = Object.fromEntries(PERIODS.map((p) => {
    let n = 0
    let s = 0
    let w = 0
    for (const x of syms) {
      const b = x.tracks[key].base[p]
      n += b.r.length
      for (const r of b.r) s += r
      w += b.wins
    }
    return [p, { n, meanR: s / n, win: w / n }]
  }))
  const selection = rows.slice().sort((a, b) => b.I.edge - a.I.edge).slice(0, 5).map((r) => r.id)
  return { key, track: TRACKS[key], rows, baseline, selection }
}

/** One rule, one period, one sample — used for the confirmatory H1 test. */
export function testOne(syms, key, id, p, seed) {
  return poolRule(syms, key, id, p, mulberry32(seed), null)
}

// ── track C ────────────────────────────────────────────────────────────────────

function windowOf(w, p, split) {
  const warm = Math.max(TRACKS.C.warmup, 2)
  const s = w.date.findIndex((d) => d >= split)
  const cut = s < 0 ? w.date.length : s
  return p === 'I' ? [warm, cut] : [Math.max(warm, cut), w.date.length]
}

export function runRegimeTrack(syms, seed, split, groupKey = 'group') {
  const rng = mulberry32(seed)
  const ids = Object.keys(syms[0].states)
  const rows = ids.map((id) => {
    const row = { id }
    for (const p of PERIODS) {
      const per = []
      for (const x of syms) {
        const w = x.weekly
        const [from, to] = windowOf(w, p, split)
        if (to - from < 52) continue
        const state = x.states[id]
        const { rule, hold, trades } = regimeReturns(w, state, from, to)
        const a = perf(rule)
        const b = perf(hold)
        let switches = 0
        let inWeeks = 0
        for (let j = from; j < to; j += 1) {
          if (Boolean(state[j - 1]) !== Boolean(state[j - 2])) switches += 1
          if (state[j - 1]) inWeeks += 1
        }
        per.push({ x, from, to, state, a, b, trades, switches, exposure: inWeeks / (to - from), weeks: to - from })
      }
      const dS = per.map((q) => q.a.sharpe - q.b.sharpe)
      const obs = median(dS)
      const trades = per.flatMap((q) => q.trades)

      let ge = 0
      if (p === 'II' && per.length) {
        for (let d = 0; d < DRAWS_C; d += 1) {
          const ds = per.map((q) => {
            const n = q.to - q.from + 1
            const off = 1 + Math.floor(rng() * (n - 1))
            const shifted = q.state.slice()
            for (let k = 0; k < n; k += 1) shifted[q.from - 2 + k] = q.state[q.from - 2 + ((k + off) % n)]
            return perf(regimeReturns(q.x.weekly, shifted, q.from, q.to).rule).sharpe - q.b.sharpe
          })
          if (median(ds) >= obs) ge += 1
        }
      }
      const groups = {}
      for (const q of per) (groups[q.x[groupKey]] ??= []).push(q.a.sharpe - q.b.sharpe)
      const winN = trades.filter((t) => t > 0).length
      row[p] = {
        symbols: per.length,
        dSharpe: obs,
        dCagr: median(per.map((q) => q.a.cagr - q.b.cagr)),
        dMaxDD: median(per.map((q) => q.a.maxDD - q.b.maxDD)),
        sharpe: median(per.map((q) => q.a.sharpe)),
        bhSharpe: median(per.map((q) => q.b.sharpe)),
        cagr: median(per.map((q) => q.a.cagr)),
        bhCagr: median(per.map((q) => q.b.cagr)),
        maxDD: median(per.map((q) => q.a.maxDD)),
        bhMaxDD: median(per.map((q) => q.b.maxDD)),
        beatShare: mean(dS.map((d) => (d > 0 ? 1 : 0))),
        exposure: mean(per.map((q) => q.exposure)),
        switchesPerYear: mean(per.map((q) => (q.switches / q.weeks) * 52)),
        trades: trades.length,
        win: trades.length ? winN / trades.length : null,
        winCi: wilsonInterval(winN, trades.length),
        meanTrade: mean(trades),
        medianTrade: median(trades),
        p: p === 'II' ? (ge + 1) / (DRAWS_C + 1) : null,
        groups: Object.fromEntries(Object.entries(groups).map(([g, v]) => [g, { symbols: v.length, dSharpe: median(v) }])),
      }
    }
    return row
  })
  const adj = holm(rows.map((r) => r.II.p))
  rows.forEach((r, k) => {
    r.II.pHolm = adj[k]
    const e2 = r.II.dSharpe
    r.verdict = e2 > 0 && r.II.pHolm < 0.05 && r.I.dSharpe > 0 ? 'Robust' : e2 > 0 && r.II.p < 0.05 ? 'Possible' : 'No edge'
  })
  rows.sort((a, b) => b.II.dSharpe - a.II.dSharpe)
  const selection = rows.slice().sort((a, b) => b.I.dSharpe - a.I.dSharpe).slice(0, 5).map((r) => r.id)
  return { key: 'C', rows, selection }
}
