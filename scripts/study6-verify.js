// PROTOCOL-study6.md §5: does the Pine script (pine/flt-mod.pine) give the same signals as
// the backtest engine? Put the script on a DAILY TradingView chart, use "Export chart
// data", then:
//   node scripts/study6-verify.js <export.csv> <EXCHANGE:SYMBOL>
// The symbol must be one the study stored (crypto or US). The first 600 bars of the
// stored series are skipped: EMA 200 and OBV start from a different first bar on the
// chart, and that start-up difference fades out. Every other bar is compared and every
// disagreement is listed.
import fs from 'node:fs'

import { events6, CRYPTO6 } from '../engine/study6.js'
import { loadCrypto, loadUS } from './study6-run.js'

const [csv, symbol] = process.argv.slice(2)
if (!csv || !symbol) throw new Error('usage: study6-verify.js <export.csv> <EXCHANGE:SYMBOL>')
const c = CRYPTO6.find((x) => x.symbol === symbol)
const s = c ? loadCrypto(c) : loadUS(symbol)
const x = events6(s)
const ours = { OL: x.events.OL, CL: x.flt.closeLong, CU: x.events.CU, BO: x.flt.breakout, BC: x.events.BC, MOD: x.events.MOD, DB: x.events.DB }

const lines = fs.readFileSync(csv, 'utf8').trim().split(/\r?\n/)
const head = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
const col = Object.fromEntries(Object.keys(ours).map((k) => [k, head.indexOf(k)]))
const missing = Object.entries(col).filter(([, i]) => i < 0).map(([k]) => k)
if (missing.length) throw new Error(`export has no column(s) ${missing.join(', ')}; header: ${head.join(' | ')}`)
const toDate = (t) => (/^\d+$/.test(t) ? new Date(Number(t) * 1000).toISOString().slice(0, 10) : t.slice(0, 10))
const theirs = new Map(lines.slice(1).map((l) => l.split(',')).map((r) => [toDate(r[0].replace(/"/g, '')), r]))

const BURN = 600
let bars = 0
const bad = []
for (let i = BURN; i < s.date.length; i += 1) {
  const r = theirs.get(s.date[i])
  if (!r) continue
  bars += 1
  for (const [k, j] of Object.entries(col)) {
    const tv = Number(r[j]) === 1
    if (tv !== ours[k][i]) bad.push(`${s.date[i]} ${k}: TradingView ${tv ? 1 : 0}, backtest ${ours[k][i] ? 1 : 0}`)
  }
}
const signals = Object.values(ours).reduce((n, a) => n + a.slice(BURN).filter(Boolean).length, 0)
console.log(`${symbol}: compared ${bars} bars × ${Object.keys(ours).length} signals (${signals} backtest signals in range)`)
console.log(bad.length ? `${bad.length} disagreements:\n${bad.join('\n')}` : 'every signal on every compared bar agrees')
