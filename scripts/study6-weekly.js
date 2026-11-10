// Study 6 addendum 2 (PROTOCOL-study6-addendum-2.md): weekly MOD divergence, regular
// (MODW) and hidden (HIDW), with / without close > SMA 40, held 8 or 13 weeks. 8 tests,
// then the stocks whose signal fired in the last completed weeks.
//   node scripts/study6-weekly.js → reports/study6-weekly.txt, reports/study6-weekly.json
import fs from 'node:fs'

import * as I from '../engine/indicators.js'
import { toWeekly, tradesFor } from '../engine/swing.js'
import { exit5, asOf } from '../engine/study5.js'
import { mod } from '../engine/study6.js'
import { mulberry32, holm } from '../engine/study.js'
import { pool, permutationP } from './study5-common.js'
import { loadUS, usSymbols } from './study6-run.js'

const CUT = '2026-10-06'
const SPLIT = '2018-01-01'
const WARM = 80
const ENTRIES = ['MODW', 'HIDW']
const FILTERS = ['F0', 'F1']
const EXITS = ['H8', 'H13']
const spyW = toWeekly({ ...loadUS('AMEX:SPY'), group: 'us' }, CUT)

const syms = usSymbols().map((symbol) => {
  const w = toWeekly({ ...loadUS(symbol), group: 'us' }, CUT)
  const m = mod(w)
  const sma40 = I.sma(w.close, 40)
  const spy = asOf(w.date, spyW)
  const ev = { MODW: m.bull, HIDW: m.hidden }
  const fl = { F0: w.close.map(() => true), F1: Array.from(w.close, (c, i) => Number.isFinite(sma40[i]) && c > sma40[i]) }
  const per = (i) => (w.date[i] < SPLIT ? 'I' : 'II')
  const pack = (ts) => ({ ret: Float64Array.from(ts, (t) => t.ret), bars: Uint16Array.from(ts, (t) => t.bars), excess: Float64Array.from(ts, (t) => t.excess) })
  const base = {}
  const trades = {}
  for (const ex of EXITS) {
    const oc = w.close.map((_, i) => (i >= WARM ? exit5(w, i, ex, sma40, spy) : null))
    for (const f of FILTERS) {
      const b = { I: [], II: [] }
      oc.forEach((o, i) => o && fl[f][i] && b[per(i)].push(o))
      base[`${ex}|${f}`] = Object.fromEntries(['I', 'II'].map((p) => [p, { ret: Float64Array.from(b[p], (o) => o.ret), wins: b[p].filter((o) => o.ret > 0).length }]))
      for (const id of ENTRIES) {
        const ts = tradesFor(ev[id].map((e, i) => e && fl[f][i]), oc, WARM)
        trades[`weekly|${id}|${ex}|${f}`] = { I: pack(ts.filter((t) => per(t.i) === 'I')), II: pack(ts.filter((t) => per(t.i) === 'II')) }
      }
    }
  }
  // signals in the last 6 completed weeks (for §3)
  const n = w.close.length
  const recent = []
  for (let i = Math.max(0, n - 6); i < n; i += 1) {
    for (const id of ENTRIES) if (ev[id][i]) recent.push({ id, week: w.date[i], close: w.close[i], aboveSma40: fl.F1[i], sma40: sma40[i] })
  }
  return { symbol, group: 'us', base, trades, recent, lastWeek: w.date[n - 1], lastClose: w.close[n - 1] }
})

const rng = mulberry32(20261018)
const strip = ({ parts, ...x }) => x
const rows = []
for (const id of ENTRIES) for (const f of FILTERS) for (const ex of EXITS) {
  const key = `weekly|${id}|${ex}|${f}`
  const all = pool(syms, key)
  rows.push({ id, filter: f, exit: ex, key, all: { ...strip(all), p: all.n ? permutationP(all, rng, 4000) : 1 }, I: strip(pool(syms, key, { periods: ['I'] })), II: strip(pool(syms, key, { periods: ['II'] })) })
}
const adj = holm(rows.map((r) => r.all.p))
rows.forEach((r, k) => {
  r.all.pHolm = adj[k]
  r.beats = r.all.edge > 0 && r.all.pHolm < 0.05 && r.I.edge > 0 && r.II.edge > 0
})

const pct = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%` : '   n/a')
const w1 = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : 'n/a')
const L = ['Study 6 addendum 2 — weekly MOD divergence (regular MODW, hidden HIDW), held 8 or 13 weeks',
  `US: ${syms.length} symbols, weekly bars to the week before ${CUT}, split ${SPLIT}. Long only, 0.10%/side.`,
  'Beats random entries = edge > 0, Holm p < 0.05 (8 tests, 4,000 draws), edge > 0 in both periods.',
  `Passed: ${rows.filter((r) => r.beats).length} of ${rows.length}.`, '']
for (const r of rows) {
  const a = r.all
  L.push(`${r.beats ? 'BEATS RANDOM ' : 'does not     '} ${r.key}`)
  L.push(`    n ${String(a.n).padStart(5)}  win ${w1(a.win)} (random ${w1(a.baseWin)})  mean ${pct(a.mean)}  median ${pct(a.median)}  edge ${pct(a.edge)}  vs SPY ${pct(a.excessSpy)}  p ${a.p.toFixed(4)}  Holm ${a.pHolm.toFixed(4)}`)
  L.push(`    I: n ${r.I.n} win ${w1(r.I.win)} edge ${pct(r.I.edge)}   II: n ${r.II.n} win ${w1(r.II.win)} edge ${pct(r.II.edge)}`)
}
const recent = syms.flatMap((x) => x.recent.map((r) => ({ symbol: x.symbol, lastWeek: x.lastWeek, lastClose: x.lastClose, ...r })))
  .sort((a, b) => (a.week < b.week ? 1 : -1))
L.push('', `Signals in the last 6 completed weeks (last week ${syms[0].lastWeek}):`)
for (const r of recent) L.push(`  ${r.week}  ${r.id}  ${r.symbol.padEnd(14)} close ${r.close.toFixed(2)}  ${r.aboveSma40 ? 'above' : 'below'} SMA40 (${r.sma40.toFixed(2)})  last close ${r.lastClose.toFixed(2)}`)
fs.writeFileSync('reports/study6-weekly.txt', `${L.join('\n')}\n`)
fs.writeFileSync('reports/study6-weekly.json', JSON.stringify({ run: new Date().toISOString(), rows, recent }, null, 1))
console.log(L.join('\n'))
