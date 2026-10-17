// Study 4 confirmation (PROTOCOL-study4.md §4): the frozen shortlist, unchanged, on the
// CONFIRMATION set — odd positions of the study-2 universe plus study 1's crypto and Saudi.
//
//   node scripts/study4-confirm.js   → reports/study4-confirm.txt, reports/study4-confirm.json

import fs from 'node:fs'
import zlib from 'node:zlib'

import { toWeekly } from '../engine/swing.js'
import { summarize4 } from '../engine/study4.js'
import { mulberry32, holm } from '../engine/study.js'
import { UNIVERSE as S1 } from '../engine/swing-universe.js'
import { splitSets } from './study4-search.js'

const SPLIT = '2018-01-01'
const DRAWS = 2000
const { shortlist } = JSON.parse(fs.readFileSync('reports/study4-shortlist.json', 'utf8'))

const { confirmUS } = splitSets()
const sets = [
  ...confirmUS.map((u) => ({ symbol: u.symbol, group: 'us', cutoff: '2026-10-06', file: `data/us/bars/${u.symbol.replace(':', '_')}.json.gz` })),
  ...S1.filter((u) => u.group !== 'us').map((u) => ({ symbol: u.symbol, group: u.group, cutoff: '2026-10-05', file: `data/swing/${u.symbol.replace(':', '_')}.json` })),
]
const load = (f) => JSON.parse(f.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(f)).toString('utf8') : fs.readFileSync(f, 'utf8'))

const syms = []
for (const u of sets) {
  const d = load(u.file)
  for (const tf of ['daily', 'weekly']) {
    const s = tf === 'daily' ? d : toWeekly({ ...d, group: u.group === 'saudi' ? 'saudi' : 'us' }, u.cutoff)
    syms.push(summarize4({ symbol: u.symbol, group: u.group }, s, tf, SPLIT))
  }
}

const rng = mulberry32(20261013)
function evaluate(key, filterGroup, periods = ['I', 'II']) {
  const [, , ex, fl] = key.split('|')
  let n = 0, wins = 0, sumR = 0, base = 0, baseWins = 0, sumRet = 0
  const parts = []
  for (const x of syms) {
    if (filterGroup && x.group !== filterGroup) continue
    const tr = x.trades[key]
    if (!tr) continue
    for (const p of periods) {
      const t = tr[p]
      const b = x.base[`${ex}|${fl}`][p]
      if (!t.r.length) continue
      n += t.r.length
      let bs = 0
      for (const r of b.r) bs += r
      base += t.r.length * (bs / b.r.length)
      baseWins += t.r.length * (b.wins / b.r.length)
      for (let j = 0; j < t.r.length; j += 1) { sumR += t.r[j]; sumRet += t.ret[j]; if (t.ret[j] > 0) wins += 1 }
      parts.push([t.r.length, b.r])
    }
  }
  return { n, win: n ? wins / n : NaN, baseWin: n ? baseWins / n : NaN, meanR: n ? sumR / n : NaN, meanRet: n ? sumRet / n : NaN, edge: n ? (sumR - base) / n : NaN, parts }
}

const rows = shortlist.map(({ key, search }) => {
  const all = evaluate(key)
  let ge = 0
  for (let d = 0; d < DRAWS; d += 1) {
    let sum = 0
    for (const [k, R] of all.parts) for (let j = 0; j < k; j += 1) sum += R[Math.floor(rng() * R.length)]
    if (sum / all.n >= all.meanR) ge += 1
  }
  const strip = ({ parts, ...rest }) => rest
  return {
    key, search,
    all: { ...strip(all), p: (ge + 1) / (DRAWS + 1) },
    I: strip(evaluate(key, null, ['I'])), II: strip(evaluate(key, null, ['II'])),
    groups: Object.fromEntries(['us', 'crypto', 'saudi'].map((g) => [g, strip(evaluate(key, g))])),
  }
})
const adj = holm(rows.map((r) => r.all.p))
rows.forEach((r, k) => {
  r.all.pHolm = adj[k]
  r.confirmed = r.all.win >= 0.6 && r.all.edge > 0 && r.all.pHolm < 0.05
})

const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—')
const pct = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : '—')
const out = [
  `Study 4 CONFIRMATION — ${confirmUS.length} unseen US symbols + ${sets.length - confirmUS.length} crypto/Saudi (study 1).`,
  'Confirmed = win ≥ 60% and edge > 0 with Holm-corrected permutation p < 0.05 (fixed in advance).',
  '',
]
for (const r of rows) {
  out.push(`${r.confirmed ? 'CONFIRMED    ' : 'not confirmed'} ${r.key}`)
  out.push(`   all   n ${r.all.n}  win ${pct(r.all.win)} (random ${pct(r.all.baseWin)})  meanR ${f(r.all.meanR)}  avg trade ${pct(r.all.meanRet)}  edge ${f(r.all.edge)}  p ${f(r.all.p, 4)}  Holm ${f(r.all.pHolm, 4)}`)
  out.push(`   I     n ${r.I.n}  win ${pct(r.I.win)}  edge ${f(r.I.edge)}      II  n ${r.II.n}  win ${pct(r.II.win)}  edge ${f(r.II.edge)}`)
  out.push(`   us ${pct(r.groups.us.win)} (${r.groups.us.n}) edge ${f(r.groups.us.edge)} | crypto ${pct(r.groups.crypto.win)} (${r.groups.crypto.n}) edge ${f(r.groups.crypto.edge)} | saudi ${pct(r.groups.saudi.win)} (${r.groups.saudi.n}) edge ${f(r.groups.saudi.edge)}`)
  out.push(`   search set: win ${pct(r.search.all.win)}  edge ${f(r.search.all.edge)}`)
}
fs.writeFileSync('reports/study4-confirm.txt', out.join('\n') + '\n')
fs.writeFileSync('reports/study4-confirm.json', JSON.stringify({ sets: sets.length, rows }, null, 1))
console.log(out.join('\n'))
