// Run the pre-registered swing study (PROTOCOL-swing.md) and write its reports.
//
//   node scripts/swing-backtest.js
//
// Outputs reports/swing-{A,B,C}.txt, reports/swing-results.json (read by swing.html) and
// the current-signals sheet inside the JSON. Seeded, so every number reproduces.

import fs from 'node:fs'
import path from 'node:path'

import { UNIVERSE, CUTOFF, SPLIT } from '../engine/swing-universe.js'
import { TRACKS, signals, toWeekly, outcomesFor, tradesFor, regimeReturns, perf } from '../engine/swing.js'
import { wilsonInterval, bootstrapMean } from '../engine/stats.js'

const DRAWS_AB = 2000
const DRAWS_C = 1000
const THIN = 100

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!s.length) return NaN
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

function holm(ps) {
  const idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0])
  const out = new Array(ps.length)
  let run = 0
  idx.forEach(([p, i], k) => {
    run = Math.max(run, Math.min(1, (ps.length - k) * p))
    out[i] = run
  })
  return out
}

const PERIODS = ['I', 'II']
const periodOf = (date) => (date < SPLIT ? 'I' : 'II')

// ── load ───────────────────────────────────────────────────────────────────────

const series = UNIVERSE.map(({ symbol }) => {
  const s = JSON.parse(fs.readFileSync(`data/swing/${symbol.replace(':', '_')}.json`, 'utf8'))
  const weekly = toWeekly(s, CUTOFF)
  return { symbol, group: s.group, name: s.name, daily: s, weekly, sig: { daily: signals(s, 'daily'), weekly: signals(weekly, 'weekly') } }
})
const EVENT_IDS = Object.keys(series[0].sig.daily.events)
const STATE_IDS = Object.keys(series[0].sig.weekly.states)

// ── tracks A and B ─────────────────────────────────────────────────────────────

function runTradeTrack(key) {
  const track = TRACKS[key]
  const rng = mulberry32(key === 'A' ? 20261006 : 20261007)

  // Per symbol: all eligible outcomes, split by period — the random-entry population.
  const pop = series.map((x) => {
    const s = x[track.tf]
    const outcomes = outcomesFor(s, x.sig[track.tf].atr, track)
    const byPeriod = { I: [], II: [] }
    outcomes.forEach((o, i) => o && byPeriod[periodOf(s.date[i])].push(o))
    const summary = Object.fromEntries(PERIODS.map((p) => {
      const rs = byPeriod[p].map((o) => o.r)
      return [p, { r: Float64Array.from(rs), mean: mean(rs), win: mean(byPeriod[p].map((o) => (o.ret > 0 ? 1 : 0))) }]
    }))
    return { x, s, outcomes, summary }
  })

  const rows = EVENT_IDS.map((id) => {
    const row = { id }
    for (const p of PERIODS) {
      const per = pop.map(({ x, s, outcomes, summary }) => {
        const trades = tradesFor(x.sig[track.tf].events[id], outcomes, track.warmup).filter((t) => periodOf(s.date[t.i]) === p)
        return { x, trades, base: summary[p] }
      })
      const all = per.flatMap((q) => q.trades)
      const n = all.length
      const rs = all.map((t) => t.r)
      const obs = mean(rs)
      const baseMean = per.reduce((a, q) => a + q.trades.length * (q.base.mean || 0), 0) / (n || 1)
      // A symbol with no eligible bars in this period has no trades in it either, so the
      // `|| 0` below never weights a missing baseline.
      const baseWin = per.reduce((a, q) => a + q.trades.length * (q.base.win || 0), 0) / (n || 1)
      const wins = all.filter((t) => t.ret > 0).length

      // Permutation: same count per symbol, uniformly random eligible entries.
      let ge = 0
      let le = 0
      const drawMeans = []
      if (n) {
        for (let d = 0; d < DRAWS_AB; d += 1) {
          let sum = 0
          for (const q of per) {
            const k = q.trades.length
            if (!k) continue
            const R = q.base.r
            for (let j = 0; j < k; j += 1) sum += R[Math.floor(rng() * R.length)]
          }
          const m = sum / n
          drawMeans.push(m)
          if (m >= obs) ge += 1
          if (m <= obs) le += 1
        }
      }
      const pos = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0)
      const neg = -rs.filter((r) => r < 0).reduce((a, b) => a + b, 0)
      const symEdges = per.filter((q) => q.trades.length >= 5).map((q) => mean(q.trades.map((t) => t.r)) - q.base.mean)
      const groups = {}
      for (const g of ['crypto', 'us', 'saudi']) {
        const gp = per.filter((q) => q.x.group === g)
        const gt = gp.flatMap((q) => q.trades)
        const gb = gp.reduce((a, q) => a + q.trades.length * (q.base.mean || 0), 0) / (gt.length || 1)
        groups[g] = { n: gt.length, edge: gt.length ? mean(gt.map((t) => t.r)) - gb : null, win: gt.length ? mean(gt.map((t) => (t.ret > 0 ? 1 : 0))) : null }
      }
      row[p] = {
        n,
        meanR: obs,
        ci: n ? bootstrapMean(rs, { rng, draws: 2000 }) : null,
        baseR: baseMean,
        edge: obs - baseMean,
        win: n ? wins / n : null,
        winCi: wilsonInterval(wins, n),
        baseWin,
        pf: neg > 0 ? pos / neg : null,
        meanRet: mean(all.map((t) => t.ret)),
        hold: mean(all.map((t) => t.bars)),
        p: n ? (ge + 1) / (DRAWS_AB + 1) : 1,
        pLow: n ? (le + 1) / (DRAWS_AB + 1) : 1,
        breadth: symEdges.length ? symEdges.filter((e) => e > 0).length / symEdges.length : null,
        breadthN: symEdges.length,
        groups,
        exits: Object.fromEntries(['target', 'stop', 'time'].map((k) => [k, n ? all.filter((t) => t.reason.startsWith(k)).length / n : null])),
      }
    }
    return row
  })

  const adj = holm(rows.map((r) => r.II.p))
  rows.forEach((r, k) => {
    r.II.pHolm = adj[k]
    r.verdict = verdictAB(r)
  })
  rows.sort((a, b) => rankKey(a) - rankKey(b))

  // Baseline row: every eligible bar, pooled.
  const baseline = Object.fromEntries(PERIODS.map((p) => {
    const all = pop.flatMap((q) => Array.from(q.summary[p].r))
    const wins = pop.reduce((a, q) => a + (q.summary[p].r.length ? q.summary[p].win * q.summary[p].r.length : 0), 0)
    return [p, { n: all.length, meanR: mean(all), win: wins / all.length }]
  }))

  const byI = rows.slice().sort((a, b) => b.I.edge - a.I.edge).slice(0, 5).map((r) => r.id)
  return { key, track, rows, baseline, selection: byI }
}

function verdictAB(r) {
  if (r.II.n < THIN) return 'Thin'
  if (r.II.pLow < 0.05 && r.II.edge < 0) return 'Worse than random'
  if (r.II.edge > 0 && r.II.pHolm < 0.05 && r.I.edge > 0) return 'Robust'
  if (r.II.edge > 0 && r.II.p < 0.05) return 'Possible'
  return 'No edge'
}
const rankKey = (r) => (r.verdict === 'Thin' ? 1e6 : 0) - r.II.edge

// ── track C ────────────────────────────────────────────────────────────────────

function windowOf(s, p) {
  const warm = Math.max(TRACKS.C.warmup, 2)
  const split = s.date.findIndex((d) => d >= SPLIT)
  const cut = split < 0 ? s.date.length : split
  return p === 'I' ? [warm, cut] : [Math.max(warm, cut), s.date.length]
}

function runRegimeTrack() {
  const rng = mulberry32(20261008)
  const rows = STATE_IDS.map((id) => {
    const row = { id }
    for (const p of PERIODS) {
      const per = []
      for (const x of series) {
        const s = x.weekly
        const [from, to] = windowOf(s, p)
        if (to - from < 52) continue
        const state = x.sig.weekly.states[id]
        const { rule, hold, trades } = regimeReturns(s, state, from, to)
        const a = perf(rule)
        const b = perf(hold)
        let switches = 0
        for (let j = from; j < to; j += 1) if (Boolean(state[j - 1]) !== Boolean(state[j - 2])) switches += 1
        const exposure = mean(Array.from({ length: to - from }, (_, k) => (state[from + k - 1] ? 1 : 0)))
        per.push({ x, s, from, to, state, a, b, trades, switches, exposure, weeks: to - from })
      }
      const dS = per.map((q) => q.a.sharpe - q.b.sharpe)
      const obs = median(dS)
      const trades = per.flatMap((q) => q.trades)

      let ge = 0
      if (p === 'II') {
        for (let d = 0; d < DRAWS_C; d += 1) {
          const ds = per.map((q) => {
            const n = q.to - q.from + 1 // states q.from−2 … q.to−2 drive the window
            const off = 1 + Math.floor(rng() * (n - 1))
            const shifted = q.state.slice()
            for (let k = 0; k < n; k += 1) shifted[q.from - 2 + k] = q.state[q.from - 2 + ((k + off) % n)]
            return perf(regimeReturns(q.s, shifted, q.from, q.to).rule).sharpe - q.b.sharpe
          })
          if (median(ds) >= obs) ge += 1
        }
      }
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
        win: trades.length ? trades.filter((t) => t > 0).length / trades.length : null,
        winCi: wilsonInterval(trades.filter((t) => t > 0).length, trades.length),
        meanTrade: mean(trades),
        medianTrade: median(trades),
        p: p === 'II' ? (ge + 1) / (DRAWS_C + 1) : null,
        perSymbol: per.map((q) => ({ symbol: q.x.symbol, group: q.x.group, sharpe: q.a.sharpe, bh: q.b.sharpe, cagr: q.a.cagr, bhCagr: q.b.cagr, maxDD: q.a.maxDD, bhMaxDD: q.b.maxDD })),
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
  const byI = rows.slice().sort((a, b) => b.I.dSharpe - a.I.dSharpe).slice(0, 5).map((r) => r.id)
  return { key: 'C', rows, selection: byI }
}

// ── current signals ────────────────────────────────────────────────────────────

function currentSignals() {
  const out = { A: [], B: [], C: [] }
  for (const x of series) {
    for (const [key, tf] of [['A', 'daily'], ['B', 'weekly']]) {
      const s = x[tf]
      const sg = x.sig[tf]
      const i = s.close.length - 1
      const t = TRACKS[key]
      for (const id of EVENT_IDS) {
        if (!sg.events[id][i]) continue
        const ref = s.close[i]
        out[key].push({
          symbol: x.symbol, name: x.name, group: x.group, id, date: s.date[i], close: ref, atr: sg.atr[i],
          stop: ref - t.stopAtr * sg.atr[i], target: ref + t.targetAtr * sg.atr[i], horizon: t.horizon,
        })
      }
    }
    const w = x.weekly
    const i = w.close.length - 1
    for (const id of STATE_IDS) {
      const now = Boolean(x.sig.weekly.states[id][i])
      const before = Boolean(x.sig.weekly.states[id][i - 1])
      out.C.push({ symbol: x.symbol, name: x.name, group: x.group, id, date: w.date[i], close: w.close[i], in: now, changed: now !== before })
    }
  }
  return out
}

// ── reports ────────────────────────────────────────────────────────────────────

const f = (x, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d))
const pct = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${(100 * x).toFixed(d)}%`)

function reportAB(res) {
  const L = []
  const t = res.track
  L.push(`Track ${res.key} — ${t.tf} bars; stop ${t.stopAtr}×ATR14, target ${t.targetAtr}×ATR14, time exit ${t.horizon} bars; cost 0.10%/side`)
  L.push(`Generated by scripts/swing-backtest.js under PROTOCOL-swing.md. R = 1 stop distance. Edge = mean R − random-entry mean R.`)
  L.push('')
  for (const p of PERIODS) {
    const b = res.baseline[p]
    L.push(`Random entry, period ${p}: ${b.n} eligible bars, mean R ${f(b.meanR)}, win rate ${pct(b.win)}`)
  }
  L.push('')
  L.push('PERIOD II (2018 → 2026-10-05) — headline ranking')
  L.push('rank id              verdict             n    win%   rand%   meanR   [95% CI]          edgeR   PF    hold  p      pHolm  breadth  | I: n   edgeR')
  res.rows.forEach((r, k) => {
    const a = r.II
    const b = r.I
    L.push(
      `${String(k + 1).padStart(3)}  ${r.id.padEnd(15)} ${r.verdict.padEnd(18)} ${String(a.n).padStart(5)} ${pct(a.win).padStart(6)} ${pct(a.baseWin).padStart(6)} ${f(a.meanR).padStart(7)} [${f(a.ci?.[0])}, ${f(a.ci?.[1])}] ${f(a.edge).padStart(7)} ${f(a.pf, 2).padStart(5)} ${f(a.hold, 1).padStart(5)} ${f(a.p, 4)} ${f(a.pHolm, 4)} ${pct(a.breadth, 0).padStart(5)}/${a.breadthN} | ${String(b.n).padStart(5)} ${f(b.edge).padStart(7)}`,
    )
  })
  L.push('')
  L.push('By group, period II (descriptive only): edge R / win% / n')
  for (const r of res.rows) {
    const g = r.II.groups
    L.push(`  ${r.id.padEnd(15)} crypto ${f(g.crypto.edge).padStart(7)} ${pct(g.crypto.win).padStart(6)} ${String(g.crypto.n).padStart(4)}   us ${f(g.us.edge).padStart(7)} ${pct(g.us.win).padStart(6)} ${String(g.us.n).padStart(5)}   saudi ${f(g.saudi.edge).padStart(7)} ${pct(g.saudi.win).padStart(6)} ${String(g.saudi.n).padStart(4)}`)
  }
  L.push('')
  L.push(`Selection test — the five best by period I edge, and where they finished in period II:`)
  for (const id of res.selection) {
    const k = res.rows.findIndex((r) => r.id === id)
    const r = res.rows[k]
    L.push(`  ${id.padEnd(15)} I edge ${f(r.I.edge)} → II edge ${f(r.II.edge)}, rank ${k + 1} of ${res.rows.length}, ${r.verdict}`)
  }
  return L.join('\n')
}

function reportC(res) {
  const L = []
  L.push('Track C — weekly in/out rules vs buy-and-hold; cost 0.10% per switch; medians across symbols')
  L.push('Primary: median ΔSharpe (rule − buy & hold), period II. p from 1,000 circular shifts of each rule\'s own in/out sequence.')
  L.push('')
  L.push('rank id              verdict    ΔSharpe  p      pHolm  beat%  ΔCAGR    ΔMaxDD   ruleDD   b&hDD    expo  sw/yr trades win%   | I: ΔSharpe')
  res.rows.forEach((r, k) => {
    const a = r.II
    L.push(
      `${String(k + 1).padStart(3)}  ${r.id.padEnd(15)} ${r.verdict.padEnd(9)} ${f(a.dSharpe).padStart(7)} ${f(a.p, 4)} ${f(a.pHolm, 4)} ${pct(a.beatShare, 0).padStart(5)} ${pct(a.dCagr).padStart(7)} ${pct(a.dMaxDD).padStart(7)} ${pct(a.maxDD).padStart(7)} ${pct(a.bhMaxDD).padStart(7)} ${pct(a.exposure, 0).padStart(5)} ${f(a.switchesPerYear, 1).padStart(5)} ${String(a.trades).padStart(6)} ${pct(a.win).padStart(6)} | ${f(r.I.dSharpe).padStart(7)} (${r.I.symbols} sym)`,
    )
  })
  L.push('')
  L.push(`Buy & hold, period II: median Sharpe ${f(res.rows[0].II.bhSharpe)}, median CAGR ${pct(res.rows[0].II.bhCagr)}, median max drawdown ${pct(res.rows[0].II.bhMaxDD)} over ${res.rows[0].II.symbols} symbols`)
  L.push('')
  L.push('Selection test — five best by period I ΔSharpe, and where they finished in period II:')
  for (const id of res.selection) {
    const k = res.rows.findIndex((r) => r.id === id)
    const r = res.rows[k]
    L.push(`  ${id.padEnd(15)} I ${f(r.I.dSharpe)} → II ${f(r.II.dSharpe)}, rank ${k + 1} of ${res.rows.length}, ${r.verdict}`)
  }
  return L.join('\n')
}

const A = runTradeTrack('A')
const B = runTradeTrack('B')
const C = runRegimeTrack()
const now = currentSignals()

fs.mkdirSync('reports', { recursive: true })
fs.writeFileSync('reports/swing-A.txt', reportAB(A) + '\n')
fs.writeFileSync('reports/swing-B.txt', reportAB(B) + '\n')
fs.writeFileSync('reports/swing-C.txt', reportC(C) + '\n')
fs.writeFileSync(
  'reports/swing-results.json',
  JSON.stringify({ generated: CUTOFF, split: SPLIT, A: { ...A, track: A.track }, B: { ...B, track: B.track }, C, current: now }),
)
console.log(reportAB(A))
console.log('\n' + reportAB(B))
console.log('\n' + reportC(C))
