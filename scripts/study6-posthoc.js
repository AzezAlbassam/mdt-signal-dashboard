// POST-HOC, report only (not in PROTOCOL-study6.md; written after reports/study6.txt).
// For the two tests that beat random entries: is the edge carried by a few coins/stocks or
// a few huge trades? Nothing here changes the verdict.
//   node scripts/study6-posthoc.js → reports/study6-posthoc.txt
import fs from 'node:fs'

import { summarize6, CRYPTO6, SPLIT6 } from '../engine/study6.js'
import { pool } from './study5-common.js'
import { loadCrypto, loadUS, usSymbols } from './study6-run.js'

const crypto = CRYPTO6.map((c) => summarize6({ symbol: c.symbol, group: 'crypto' }, loadCrypto(c), SPLIT6.crypto))
const us = usSymbols().map((u) => summarize6({ symbol: u, group: 'us' }, loadUS(u), SPLIT6.us))
const pct = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%` : 'n/a')
const L = ['Study 6 — POST-HOC robustness of the two passing tests (report only; the verdict stands as run)']

function check(label, syms, key, showEach) {
  const [, , ex] = key.split('|')
  const all = pool(syms, key)
  L.push('', `── ${label} (${key}) ─ n ${all.n}, mean ${pct(all.mean)}, edge ${pct(all.edge)}`)
  // trades and the random population, flattened
  const tr = []
  const rnd = []
  for (const x of syms) for (const p of ['I', 'II']) {
    for (const v of x.trades[key][p].ret) tr.push({ s: x.symbol, v })
    for (const v of x.base[`${ex}|F0`][p].ret) rnd.push(v)
  }
  const sorted = tr.map((t) => t.v).sort((a, b) => a - b)
  const r = rnd.slice().sort((a, b) => a - b)
  const med = (a) => a[a.length >> 1]
  L.push(`  median trade ${pct(med(sorted))} vs median random entry ${pct(med(r))}`)
  const trim = (a, f) => { const k = Math.floor(a.length * f); const b = a.slice(k, a.length - k); return b.reduce((s, v) => s + v, 0) / b.length }
  L.push(`  5%-trimmed mean: trades ${pct(trim(sorted, 0.05))} vs random ${pct(trim(r, 0.05))}`)
  const top = sorted.slice(-5).reduce((s, v) => s + v, 0)
  const sum = sorted.reduce((s, v) => s + v, 0)
  L.push(`  the 5 best trades are ${(100 * top / sum).toFixed(0)}% of the summed return; without them the mean is ${pct((sum - top) / (sorted.length - 5))}`)
  // leave one symbol out
  const loo = syms.filter((x) => x.trades[key].I.ret.length + x.trades[key].II.ret.length > 0)
    .map((x) => ({ s: x.symbol, e: pool(syms.filter((y) => y !== x), key).edge }))
    .sort((a, b) => a.e - b.e)
  L.push(`  leave one symbol out: edge from ${pct(loo[0].e)} (without ${loo[0].s}) to ${pct(loo.at(-1).e)} (without ${loo.at(-1).s})`)
  const pos = syms.map((x) => pool([x], key)).filter((q) => q.n > 0)
  L.push(`  symbols with a positive edge: ${pos.filter((q) => q.edge > 0).length} of ${pos.length}`)
  if (showEach) {
    for (const x of syms) {
      const q = pool([x], key)
      if (q.n) L.push(`    ${x.symbol.padEnd(18)} n ${String(q.n).padStart(3)}  win ${(q.win * 100).toFixed(0).padStart(3)}% (random ${(q.baseWin * 100).toFixed(0)}%)  mean ${pct(q.mean).padStart(9)}  edge ${pct(q.edge).padStart(9)}`)
    }
  }
}

check('Crypto: FLT breakout cluster, hold 20 days', crypto, 'daily|BC|H20|F0', true)
check('US: MOD bullish divergence, exit FLT Close Long', us, 'daily|MOD|X|F0', false)
fs.writeFileSync('reports/study6-posthoc.txt', `${L.join('\n')}\n`)
console.log(L.join('\n'))
