// Study 5 confirmation (PROTOCOL-study5.md §4): the frozen shortlist on the CONFIRMATION set.
//   node scripts/study5-confirm.js → reports/study5-confirm.txt, reports/study5-confirm.json
import fs from 'node:fs'
import zlib from 'node:zlib'

import { toWeekly } from '../engine/swing.js'
import { summarize5 } from '../engine/study5.js'
import { mulberry32, holm } from '../engine/study.js'
import { UNIVERSE as S1 } from '../engine/swing-universe.js'
import { splitSets } from './study4-search.js'
import { pool, permutationP } from './study5-common.js'

const { shortlist } = JSON.parse(fs.readFileSync('reports/study5-shortlist.json', 'utf8'))
const gz = (sym) => JSON.parse(zlib.gunzipSync(fs.readFileSync(`data/us/bars/${sym.replace(':', '_')}.json.gz`)).toString('utf8'))
const spy = toWeekly({ ...gz('AMEX:SPY'), group: 'us' }, '2026-10-06')
const { confirmUS } = splitSets()
const syms = [
  ...confirmUS.map((u) => summarize5({ symbol: u.symbol, group: 'us' }, toWeekly({ ...gz(u.symbol), group: 'us' }, '2026-10-06'), spy, '2018-01-01')),
  ...S1.filter((u) => u.group !== 'us').map((u) => {
    const d = JSON.parse(fs.readFileSync(`data/swing/${u.symbol.replace(':', '_')}.json`, 'utf8'))
    return summarize5({ symbol: u.symbol, group: u.group }, toWeekly({ ...d, group: u.group === 'saudi' ? 'saudi' : 'us' }, '2026-10-05'), spy, '2018-01-01')
  }),
]
const rng = mulberry32(20261015)
const strip = ({ parts, ...x }) => x
const rows = shortlist.map(({ key, search }) => {
  const all = pool(syms, key)
  return {
    key, search, all: { ...strip(all), p: permutationP(all, rng) },
    I: strip(pool(syms, key, { periods: ['I'] })), II: strip(pool(syms, key, { periods: ['II'] })),
    groups: Object.fromEntries(['us', 'crypto', 'saudi'].map((g) => [g, strip(pool(syms, key, { group: g }))])),
  }
})
const adj = holm(rows.map((r) => r.all.p))
rows.forEach((r, k) => { r.all.pHolm = adj[k]; r.confirmed = r.all.win >= 0.6 && r.all.edge > 0 && r.all.pHolm < 0.05 })
const pct = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : '—')
const out = [`Study 5 CONFIRMATION — ${confirmUS.length} unseen US symbols + 10 crypto/Saudi.`, 'Confirmed = win ≥ 60% and edge > 0, Holm p < 0.05.', '']
for (const r of rows) {
  out.push(`${r.confirmed ? 'CONFIRMED    ' : 'not confirmed'} ${r.key}`)
  out.push(`   all  n ${r.all.n}  win ${pct(r.all.win)} (random ${pct(r.all.baseWin)})  mean ${pct(r.all.mean)} median ${pct(r.all.median)}  edge ${pct(r.all.edge)}  vs SPY ${pct(r.all.excessSpy)}  p ${r.all.p.toFixed(4)} Holm ${r.all.pHolm.toFixed(4)}`)
  out.push(`   I    n ${r.I.n}  win ${pct(r.I.win)}  edge ${pct(r.I.edge)}     II  n ${r.II.n}  win ${pct(r.II.win)}  edge ${pct(r.II.edge)}`)
  out.push(`   us ${pct(r.groups.us.win)} (${r.groups.us.n}) edge ${pct(r.groups.us.edge)} | crypto ${pct(r.groups.crypto.win)} (${r.groups.crypto.n}) | saudi ${pct(r.groups.saudi.win)} (${r.groups.saudi.n}) edge ${pct(r.groups.saudi.edge)}`)
  out.push(`   search: win ${pct(r.search.all.win)} edge ${pct(r.search.all.edge)}`)
}
fs.writeFileSync('reports/study5-confirm.txt', out.join('\n') + '\n')
fs.writeFileSync('reports/study5-confirm.json', JSON.stringify({ rows }, null, 1))
console.log(out.join('\n'))
