// Study 5 search (PROTOCOL-study5.md §4) on the SEARCH set only.
//   node scripts/study5-search.js → reports/study5-search.txt, reports/study5-shortlist.json
import fs from 'node:fs'
import zlib from 'node:zlib'

import { toWeekly } from '../engine/swing.js'
import { summarize5 } from '../engine/study5.js'
import { mulberry32 } from '../engine/study.js'
import { splitSets } from './study4-search.js'
import { pool, permutationP } from './study5-common.js'

const load = (sym) => JSON.parse(zlib.gunzipSync(fs.readFileSync(`data/us/bars/${sym.replace(':', '_')}.json.gz`)).toString('utf8'))
const spy = toWeekly({ ...load('AMEX:SPY'), group: 'us' }, '2026-10-06')
const { search } = splitSets()
const syms = search.map((u) => summarize5({ symbol: u.symbol, group: 'us' }, toWeekly({ ...load(u.symbol), group: 'us' }, '2026-10-06'), spy, '2018-01-01'))
const keys = Object.keys(syms[0].trades)
const rows = keys.map((key) => ({ key, all: pool(syms, key), I: pool(syms, key, { periods: ['I'] }), II: pool(syms, key, { periods: ['II'] }) }))
const pass = rows.filter((r) => r.all.win >= 0.6 && r.I.win >= 0.55 && r.II.win >= 0.55 && r.I.edge > 0 && r.II.edge > 0 && r.all.n >= 200)
const rng = mulberry32(20261014)
for (const r of pass) r.p = permutationP(r.all, rng)
const shortlist = pass.filter((r) => r.p < 0.001).sort((a, b) => b.all.edge - a.all.edge).slice(0, 10)

const pct = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : '—')
const line = (r) => `${r.key.padEnd(30)} n ${String(r.all.n).padStart(5)}  win ${pct(r.all.win).padStart(6)} (rand ${pct(r.all.baseWin)}; I ${pct(r.I.win)}, II ${pct(r.II.win)})  mean ${pct(r.all.mean)} median ${pct(r.all.median)}  edge ${pct(r.all.edge)} (I ${pct(r.I.edge)}, II ${pct(r.II.edge)})  vs SPY ${pct(r.all.excessSpy)}${r.p ? `  p ${r.p.toFixed(4)}` : ''}`
const out = [
  `Study 5 SEARCH — ${search.length} US symbols (even positions), ${rows.length} weekly strategies. Key = weekly|entry|exit|filter.`,
  'Shortlist rule: win ≥ 60% overall and ≥ 55% each period; edge > 0 both periods; ≥ 200 trades; p < 0.001.',
  `Passed win/edge/trades: ${pass.length}; also p < 0.001: ${pass.filter((r) => r.p < 0.001).length}; shortlisted: ${shortlist.length}`,
  '', 'SHORTLIST', ...shortlist.map(line),
  '', 'All that passed win/edge/trades', ...pass.sort((a, b) => b.all.edge - a.all.edge).map(line),
  '', 'Every strategy by edge', ...rows.sort((a, b) => b.all.edge - a.all.edge).map(line),
]
const strip = ({ parts, ...x }) => x
fs.writeFileSync('reports/study5-search.txt', out.join('\n') + '\n')
fs.writeFileSync('reports/study5-shortlist.json', JSON.stringify({ frozen: new Date().toISOString(), shortlist: shortlist.map((r) => ({ key: r.key, search: { all: strip(r.all), I: strip(r.I), II: strip(r.II), p: r.p } })) }, null, 1))
console.log(out.slice(0, 18).join('\n'))
