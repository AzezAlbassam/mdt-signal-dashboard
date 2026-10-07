// Study 4 search (PROTOCOL-study4.md §3) on the SEARCH set only — even positions of the
// alphabetically sorted study-2 stage-1 universe. The confirmation set is never loaded here.
//
//   node scripts/study4-search.js   → reports/study4-search.txt, reports/study4-shortlist.json

import fs from 'node:fs'
import zlib from 'node:zlib'

import { toWeekly } from '../engine/swing.js'
import { summarize4 } from '../engine/study4.js'
import { mulberry32 } from '../engine/study.js'

const SPLIT = '2018-01-01'
const CUTOFF = '2026-10-06'
const DRAWS = 2000

export function splitSets() {
  const u = JSON.parse(fs.readFileSync('data/us/universe.json', 'utf8')).symbols
  const sorted = [...u].sort((a, b) => (a.symbol < b.symbol ? -1 : 1))
  return { search: sorted.filter((_, k) => k % 2 === 0), confirmUS: sorted.filter((_, k) => k % 2 === 1) }
}

const load = (sym) => JSON.parse(zlib.gunzipSync(fs.readFileSync(`data/us/bars/${sym.replace(':', '_')}.json.gz`)).toString('utf8'))

if (import.meta.url === `file://${process.argv[1]}`) {
  const { search } = splitSets()
  const syms = []
  const t0 = Date.now()
  for (const [k, u] of search.entries()) {
    const d = { ...load(u.symbol), group: u.group }
    for (const tf of ['daily', 'weekly']) {
      const s = tf === 'daily' ? d : toWeekly(d, CUTOFF)
      syms.push(summarize4({ symbol: u.symbol, group: u.group }, s, tf, SPLIT))
    }
    if ((k + 1) % 25 === 0) console.error(`summarized ${k + 1}/${search.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
  }

  const keys = [...new Set(syms.flatMap((x) => Object.keys(x.trades)))]
  const stat = (key, periods) => {
    let n = 0, wins = 0, sumR = 0, base = 0
    for (const x of syms) {
      const tr = x.trades[key]
      if (!tr) continue
      const [, , ex, fl] = key.split('|')
      for (const p of periods) {
        const t = tr[p]
        const b = x.base[`${ex}|${fl}`][p]
        if (!t.r.length) continue
        n += t.r.length
        let bs = 0
        for (const r of b.r) bs += r
        base += t.r.length * (bs / b.r.length)
        for (let j = 0; j < t.r.length; j += 1) { sumR += t.r[j]; if (t.ret[j] > 0) wins += 1 }
      }
    }
    return { n, win: n ? wins / n : NaN, meanR: n ? sumR / n : NaN, edge: n ? (sumR - base) / n : NaN }
  }

  const rows = keys.map((key) => ({ key, all: stat(key, ['I', 'II']), I: stat(key, ['I']), II: stat(key, ['II']) }))
  const pass123 = rows.filter((r) => r.all.win >= 0.6 && r.I.win >= 0.55 && r.II.win >= 0.55 && r.I.edge > 0 && r.II.edge > 0 && r.all.n >= 300)

  // Permutation only where it can matter: criteria 1, 2 and 4 already hold.
  const rng = mulberry32(20261012)
  for (const r of pass123) {
    const [, , ex, fl] = r.key.split('|')
    const parts = []
    for (const x of syms) {
      const tr = x.trades[r.key]
      if (!tr) continue
      for (const p of ['I', 'II']) if (tr[p].r.length) parts.push([tr[p].r.length, x.base[`${ex}|${fl}`][p].r])
    }
    let ge = 0
    for (let d = 0; d < DRAWS; d += 1) {
      let sum = 0
      for (const [k, R] of parts) for (let j = 0; j < k; j += 1) sum += R[Math.floor(rng() * R.length)]
      if (sum / r.all.n >= r.all.meanR) ge += 1
    }
    r.p = (ge + 1) / (DRAWS + 1)
  }
  const shortlist = pass123.filter((r) => r.p < 0.001).sort((a, b) => b.all.edge - a.all.edge).slice(0, 10)

  const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—')
  const pct = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : '—')
  const line = (r) => `${r.key.padEnd(34)} n ${String(r.all.n).padStart(6)}  win ${pct(r.all.win).padStart(6)} (I ${pct(r.I.win)}, II ${pct(r.II.win)})  meanR ${f(r.all.meanR)}  edge ${f(r.all.edge)} (I ${f(r.I.edge)}, II ${f(r.II.edge)})${r.p ? `  p ${f(r.p, 4)}` : ''}`
  const out = [
    `Study 4 SEARCH — ${search.length} US symbols (even positions), ${rows.length} strategies. Key = timeframe|entry|exit|filter.`,
    'Shortlist rule (fixed in advance): win ≥ 60% overall and ≥ 55% in each period; edge > 0 in both periods; ≥ 300 trades; permutation p < 0.001.',
    '',
    `Passed win/edge/trades: ${pass123.length}. Passed all incl. p < 0.001: ${pass123.filter((r) => r.p < 0.001).length}. Shortlisted (top 10 by edge): ${shortlist.length}`,
    '',
    'SHORTLIST',
    ...shortlist.map(line),
    '',
    'All that passed win/edge/trades (with p):',
    ...pass123.sort((a, b) => b.all.edge - a.all.edge).map(line),
    '',
    'Descriptive: 20 highest win rates (≥ 300 trades) regardless of edge',
    ...rows.filter((r) => r.all.n >= 300).sort((a, b) => b.all.win - a.all.win).slice(0, 20).map(line),
    '',
    'Every strategy, by overall edge',
    ...rows.sort((a, b) => b.all.edge - a.all.edge).map(line),
  ]
  fs.writeFileSync('reports/study4-search.txt', out.join('\n') + '\n')
  fs.writeFileSync('reports/study4-shortlist.json', JSON.stringify({ frozen: new Date().toISOString(), searchSymbols: search.length, shortlist: shortlist.map((r) => ({ key: r.key, search: { all: r.all, I: r.I, II: r.II, p: r.p } })) }, null, 1))
  console.log(out.slice(0, 22).join('\n'))
  console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}
