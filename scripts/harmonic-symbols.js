// Per-symbol table with a split-half column, written to reports/harmonic-symbols.json.
//
//   node scripts/harmonic-symbols.js
//
// POST-HOC and descriptive. Ranking 40 symbols and reading the top is the same winner's-curse
// machine family 2 demonstrated, so the only part of this worth anything is whether a
// symbol's score survives being cut in half by date — and whether the ranking as a whole
// persists, which is the Spearman figure at the bottom.

import fs from 'node:fs'
import zlib from 'node:zlib'
import { scan } from '../engine/harmonic.js'
import { wilsonInterval } from '../engine/stats.js'

const TF = ['4h', '1D', '1W', '1M']
const universe = JSON.parse(fs.readFileSync('data/harmonic/universe.json', 'utf8')).symbols

const load = (sym, tf) => {
  const f = `data/harmonic/bars/${sym.replace(/[:/]/g, '_')}__${tf}.json.gz`
  if (!fs.existsSync(f)) return null
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)))
  return d.close.map((c, i) => ({ o: d.open[i], h: d.high[i], l: d.low[i], c, date: d.date[i] }))
}

const stat = (a) => ({
  n: a.length,
  hit: a.length ? a.filter((x) => x.win).length / a.length : NaN,
  r: a.length ? a.reduce((s, x) => s + x.r, 0) / a.length : NaN,
})

const rows = []
for (const m of universe) {
  const ts = []
  for (const tf of TF) {
    const bars = load(m.symbol, tf)
    if (!bars || bars.length < 200) continue
    for (const t of scan(bars).trades) ts.push({ date: bars[t.entryAt].date, r: t.r, win: t.outcome === 't1' })
  }
  if (ts.length < 40) continue
  ts.sort((a, b) => (a.date < b.date ? -1 : 1))
  const half = Math.floor(ts.length / 2)
  const all = stat(ts)
  rows.push({
    sym: m.symbol, group: m.group, ...all,
    ci: wilsonInterval(Math.round(all.hit * all.n), all.n),
    I: stat(ts.slice(0, half)), II: stat(ts.slice(half)),
  })
}
rows.sort((a, b) => b.hit - a.hit)

// Does the ranking itself persist? Spearman between the two halves' orderings.
const rank = (k) => new Map([...rows].sort((a, b) => b[k].hit - a[k].hit).map((r, i) => [r.sym, i]))
const r1 = rank('I')
const r2 = rank('II')
const n = rows.length
let sd = 0
for (const r of rows) sd += (r1.get(r.sym) - r2.get(r.sym)) ** 2
const rho = 1 - (6 * sd) / (n * (n * n - 1))

const out = {
  note: 'POST-HOC, descriptive. PROTOCOL-harmonic.md §6 does not pre-register a per-symbol table; this is a reading, not a verdict.',
  spread: { best: rows[0].hit, worst: rows[rows.length - 1].hit, rho: rho.toFixed(3), symbols: n },
  rows,
}
fs.mkdirSync('reports', { recursive: true })
fs.writeFileSync('reports/harmonic-symbols.json', `${JSON.stringify(out, null, 2)}\n`)
console.log(`${n} symbols; best ${(rows[0].hit * 100).toFixed(1)}% (${rows[0].sym}), worst ${(rows[n - 1].hit * 100).toFixed(1)}%, rank persistence rho ${rho.toFixed(3)}`)
for (const r of rows.slice(0, 5)) console.log(`  ${r.sym.padEnd(18)} n ${String(r.n).padStart(4)}  hit ${(r.hit * 100).toFixed(1)}%  R ${r.r.toFixed(3)}  halves ${(r.I.hit * 100).toFixed(0)}% / ${(r.II.hit * 100).toFixed(0)}%`)
