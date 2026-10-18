// Study 6 addendum 3 (PROTOCOL-study6-addendum-3.md): monthly MOD divergence on the user's
// watchlist (study 7's monthly bars), held 3 or 6 months. 2 tests, then the last 12 months'
// signals.   node scripts/study6-monthly.js → reports/study6-monthly.txt, .json
import fs from 'node:fs'

import { tradesFor } from '../engine/swing.js'
import { exit5 } from '../engine/study5.js'
import { mod, pivotLowsConfirmed } from '../engine/study6.js'
import { mulberry32, holm } from '../engine/study.js'
import { pool, permutationP } from './study5-common.js'

const DIR = 'data/fv/raw/px'
const FORMING = '2026-10' // still-forming month, dropped
const SPLIT = '2018-01-01'
const WARM = 36
const EXITS = ['H3', 'H6']

function load(file) {
  const { symbol, bars: b } = JSON.parse(fs.readFileSync(`${DIR}/${file}`, 'utf8'))
  const s = { symbol, date: [], open: [], high: [], low: [], close: [], volume: [] }
  b.t.forEach((t, i) => {
    const date = new Date(t * 1000).toISOString().slice(0, 10)
    if (date >= FORMING || ![b.o[i], b.h[i], b.l[i], b.c[i]].every((x) => x > 0)) return
    s.date.push(date); s.open.push(b.o[i]); s.high.push(b.h[i]); s.low.push(b.l[i]); s.close.push(b.c[i]); s.volume.push(b.v[i] ?? 0)
  })
  return s
}

const syms = fs.readdirSync(DIR).map(load).filter((s) => s.close.length > WARM + 6).map((s) => {
  const m = mod(s)
  const nan = new Float64Array(s.close.length).fill(NaN)
  const per = (i) => (s.date[i] < SPLIT ? 'I' : 'II')
  const pack = (ts) => ({ ret: Float64Array.from(ts, (t) => t.ret), bars: Uint16Array.from(ts, (t) => t.bars), excess: Float64Array.from(ts, (t) => t.excess) })
  const base = {}
  const trades = {}
  for (const ex of EXITS) {
    const oc = s.close.map((_, i) => (i >= WARM ? exit5(s, i, ex, nan, nan) : null))
    const b = { I: [], II: [] }
    oc.forEach((o, i) => o && b[per(i)].push(o))
    base[`${ex}|F0`] = Object.fromEntries(['I', 'II'].map((p) => [p, { ret: Float64Array.from(b[p], (o) => o.ret), wins: b[p].filter((o) => o.ret > 0).length }]))
    const ts = tradesFor(m.bull, oc, WARM)
    trades[`monthly|MODM|${ex}|F0`] = { I: pack(ts.filter((t) => per(t.i) === 'I')), II: pack(ts.filter((t) => per(t.i) === 'II')) }
  }
  // §4: signals in the last 12 completed months, with the two lows
  const at = pivotLowsConfirmed(s.low, 5)
  const n = s.close.length
  const recent = []
  for (let c = Math.max(0, n - 12); c < n; c += 1) {
    if (!m.bull[c]) continue
    let p1 = -1
    for (let k = c - 1; k >= 0; k -= 1) if (at[k] >= 0) { p1 = at[k]; break }
    const p2 = at[c]
    recent.push({ symbol: s.symbol, signal: s.date[c].slice(0, 7), low1: [s.date[p1].slice(0, 7), s.low[p1]], low2: [s.date[p2].slice(0, 7), s.low[p2]], oscillators: m.count[c], closeNow: s.close[n - 1], lastMonth: s.date[n - 1].slice(0, 7) })
  }
  return { symbol: s.symbol, group: 'us', base, trades, recent }
})

const rng = mulberry32(20261019)
const strip = ({ parts, ...x }) => x
const rows = EXITS.map((ex) => {
  const key = `monthly|MODM|${ex}|F0`
  const all = pool(syms, key)
  return { key, all: { ...strip(all), p: all.n ? permutationP(all, rng, 4000) : 1 }, I: strip(pool(syms, key, { periods: ['I'] })), II: strip(pool(syms, key, { periods: ['II'] })) }
})
const adj = holm(rows.map((r) => r.all.p))
rows.forEach((r, k) => {
  r.all.pHolm = adj[k]
  r.beats = r.all.edge > 0 && r.all.pHolm < 0.05 && r.I.edge > 0 && r.II.edge > 0
})

const pct = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%` : '   n/a')
const w1 = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : 'n/a')
const L = ['Study 6 addendum 3 — monthly MOD divergence on the user\'s watchlist, held 3 or 6 months',
  `${syms.length} stocks with > ${WARM + 6} completed months (study 7 monthly bars, last month 2026-09), split ${SPLIT}. Long only, 0.10%/side.`,
  'Beats random entries = edge > 0, Holm p < 0.05 (2 tests, 4,000 draws), edge > 0 in both periods.',
  `Passed: ${rows.filter((r) => r.beats).length} of ${rows.length}.`, '']
for (const r of rows) {
  const a = r.all
  L.push(`${r.beats ? 'BEATS RANDOM ' : 'does not     '} ${r.key}`)
  L.push(`    n ${String(a.n).padStart(5)}  win ${w1(a.win)} (random ${w1(a.baseWin)})  mean ${pct(a.mean)}  median ${pct(a.median)}  edge ${pct(a.edge)}  p ${a.p.toFixed(4)}  Holm ${a.pHolm.toFixed(4)}`)
  L.push(`    I: n ${r.I.n} win ${w1(r.I.win)} edge ${pct(r.I.edge)}   II: n ${r.II.n} win ${w1(r.II.win)} edge ${pct(r.II.edge)}`)
}
const recent = syms.flatMap((x) => x.recent).sort((a, b) => (a.signal < b.signal ? 1 : -1))
L.push('', `Monthly MOD signals in the last 12 completed months (${recent.length}):`)
for (const r of recent) L.push(`  ${r.signal}  ${r.symbol.padEnd(16)} lows ${r.low1[0]} ${r.low1[1]} → ${r.low2[0]} ${r.low2[1]}  oscillators ${r.oscillators}/4  close ${r.lastMonth} ${r.closeNow}`)
fs.writeFileSync('reports/study6-monthly.txt', `${L.join('\n')}\n`)
fs.writeFileSync('reports/study6-monthly.json', JSON.stringify({ run: new Date().toISOString(), rows, recent }, null, 1))
console.log(L.join('\n'))
