// Study 6 addendum 1 (PROTOCOL-study6-addendum-1.md): the five entries held 3 / 6 / 12
// months or until FLT Cross Down. 40 tests, run once.
//   node scripts/study6-long.js → reports/study6-long.txt, reports/study6-long.json
import fs from 'node:fs'

import { summarize6, CRYPTO6, ENTRIES6, EXITS6L, SPLIT6 } from '../engine/study6.js'
import { mulberry32, holm } from '../engine/study.js'
import { pool, permutationP } from './study5-common.js'
import { loadCrypto, loadUS, usSymbols } from './study6-run.js'

const opts = { exits: EXITS6L, keep: true }
const syms = [
  ...CRYPTO6.map((c) => summarize6({ symbol: c.symbol, group: 'crypto' }, loadCrypto(c), SPLIT6.crypto, opts)),
  ...usSymbols().map((u) => summarize6({ symbol: u, group: 'us' }, loadUS(u), SPLIT6.us, { exits: EXITS6L })),
]
const rng = mulberry32(20261017)
const strip = ({ parts, ...x }) => x
const held = (group, key) => {
  let n = 0, b = 0
  for (const x of syms) if (x.group === group) for (const p of ['I', 'II']) for (const v of x.trades[key][p].bars) { n += 1; b += v }
  return n ? b / n : NaN
}
const rows = []
for (const group of ['crypto', 'us']) {
  for (const id of ENTRIES6) {
    for (const ex of EXITS6L) {
      const key = `daily|${id}|${ex}|F0`
      const all = pool(syms, key, { group })
      rows.push({
        group, id, exit: ex, key,
        all: { ...strip(all), held: held(group, key), p: all.n ? permutationP(all, rng, 4000) : 1 },
        I: strip(pool(syms, key, { group, periods: ['I'] })),
        II: strip(pool(syms, key, { group, periods: ['II'] })),
        btc: group === 'crypto' ? strip(pool(syms.filter((x) => x.symbol === 'BITSTAMP:BTCUSD'), key)) : null,
      })
    }
  }
}
const adj = holm(rows.map((r) => r.all.p))
rows.forEach((r, k) => {
  r.all.pHolm = adj[k]
  r.beats = r.all.edge > 0 && r.all.pHolm < 0.05 && r.I.edge > 0 && r.II.edge > 0
})

const pct = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%` : '   n/a')
const w = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : 'n/a')
const NAMES = { OL: 'FLT Open Long', CU: 'FLT Cross Up', BC: 'FLT Breakout cluster', MOD: 'MOD bullish divergence', DB: 'Breakout after divergence' }
const L = []
L.push('Study 6 addendum 1 — FLT / MOD entries held 3, 6, 12 months or until Cross Down (≤ 24 months)')
L.push(`Crypto: ${CRYPTO6.length} pairs, split ${SPLIT6.crypto}; US: ${usSymbols().length} symbols, split ${SPLIT6.us}. Daily signals, long only, 0.10%/side.`)
L.push('Beats random entries = edge > 0, Holm p < 0.05 (40 tests, 4,000 draws), edge > 0 in both periods.')
L.push(`Passed: ${rows.filter((r) => r.beats).length} of ${rows.length}.`)
for (const group of ['crypto', 'us']) {
  L.push('', `── ${group.toUpperCase()} ${'─'.repeat(80)}`)
  for (const r of rows.filter((x) => x.group === group)) {
    const a = r.all
    L.push(`${r.beats ? 'BEATS RANDOM ' : 'does not     '} ${`${r.id} ${r.exit}`.padEnd(8)} ${NAMES[r.id]}`)
    L.push(`    n ${String(a.n).padStart(5)}  win ${w(a.win)} (random ${w(a.baseWin)})  mean ${pct(a.mean)}  median ${pct(a.median)}  edge ${pct(a.edge)}  held ${a.held.toFixed(1)} bars  p ${a.p.toFixed(4)}  Holm ${a.pHolm.toFixed(4)}`)
    L.push(`    I: n ${r.I.n} win ${w(r.I.win)} edge ${pct(r.I.edge)}   II: n ${r.II.n} win ${w(r.II.win)} edge ${pct(r.II.edge)}`)
    if (r.btc) L.push(`    BTC only: n ${r.btc.n} win ${w(r.btc.win)} mean ${pct(r.btc.mean)} edge ${pct(r.btc.edge)}`)
  }
}
fs.writeFileSync('reports/study6-long.txt', `${L.join('\n')}\n`)
const btc = syms.find((x) => x.symbol === 'BITSTAMP:BTCUSD')
fs.writeFileSync('reports/study6-long.json', JSON.stringify({ run: new Date().toISOString(), rows, btcTrades: btc.lists }, null, 1))
console.log(L.join('\n'))
