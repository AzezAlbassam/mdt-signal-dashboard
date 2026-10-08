// Study 6 (PROTOCOL-study6.md §2–4): the 20 pre-registered tests, run once on all data.
//   node scripts/study6-run.js → reports/study6.txt, reports/study6.json
import fs from 'node:fs'
import zlib from 'node:zlib'

import { summarize6, CRYPTO6, ENTRIES6, EXITS6, SPLIT6 } from '../engine/study6.js'
import { mulberry32, holm } from '../engine/study.js'
import { pool, permutationP } from './study5-common.js'

export const gz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
export const loadCrypto = (c) => (c.file.endsWith('.gz') ? gz(c.file) : JSON.parse(fs.readFileSync(c.file, 'utf8')))
export const usSymbols = () => JSON.parse(fs.readFileSync('data/us/universe.json', 'utf8')).symbols.map((u) => u.symbol)
export const loadUS = (sym) => gz(`data/us/bars/${sym.replace(':', '_')}.json.gz`)

const isMain = process.argv[1]?.endsWith('study6-run.js')
if (isMain) {
  const syms = [
    ...CRYPTO6.map((c) => summarize6({ symbol: c.symbol, group: 'crypto' }, loadCrypto(c), SPLIT6.crypto, { keep: true })),
    ...usSymbols().map((u) => summarize6({ symbol: u, group: 'us' }, loadUS(u), SPLIT6.us)),
  ]
  const rng = mulberry32(20261016)
  const strip = ({ parts, ...x }) => x
  const held = (group, key, periods = ['I', 'II']) => {
    let n = 0, b = 0
    for (const x of syms) if (x.group === group) for (const p of periods) for (const v of x.trades[key][p].bars) { n += 1; b += v }
    return n ? b / n : NaN
  }
  const rows = []
  for (const group of ['crypto', 'us']) {
    for (const id of ENTRIES6) {
      for (const ex of EXITS6) {
        const key = `daily|${id}|${ex}|F0`
        const all = pool(syms, key, { group })
        rows.push({
          group, id, exit: ex, key,
          all: { ...strip(all), held: held(group, key), p: all.n ? permutationP(all, rng) : 1 },
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
  L.push('Study 6 — FLT and MOD (open look-alikes of the TBO / TBT Divergence ideas; NOT those products)')
  L.push(`Crypto: ${CRYPTO6.length} pairs, split ${SPLIT6.crypto}; US: ${usSymbols().length} symbols, split ${SPLIT6.us}. Daily, long only, 0.10%/side.`)
  L.push('Beats random entries = edge > 0, Holm p < 0.05 (20 tests), edge > 0 in both periods.')
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
  fs.writeFileSync('reports/study6.txt', `${L.join('\n')}\n`)
  const current = syms.filter((x) => x.group === 'crypto').map((x) => ({ symbol: x.symbol, current: x.current }))
  const btc = syms.find((x) => x.symbol === 'BITSTAMP:BTCUSD')
  fs.writeFileSync('reports/study6.json', JSON.stringify({ run: new Date().toISOString(), rows, current, btcTrades: btc.lists }, null, 1))
  console.log(L.join('\n'))
}
