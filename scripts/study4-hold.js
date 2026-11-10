// Holding time and the size of wins and losses for study 4's page, over the whole stage-1
// US universe (search + confirmation sets). Descriptive only.
//   node scripts/study4-hold.js   → reports/study4-hold.json
import fs from 'node:fs'
import zlib from 'node:zlib'

import { toWeekly } from '../engine/swing.js'
import { summarize4 } from '../engine/study4.js'

const u = JSON.parse(fs.readFileSync('data/us/universe.json', 'utf8')).symbols
const keys = JSON.parse(fs.readFileSync('reports/study4-confirm.json', 'utf8')).rows.map((r) => r.key)
const acc = Object.fromEntries(keys.map((k) => [k, { bars: [], ret: [] }]))
for (const x of u) {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(`data/us/bars/${x.symbol.replace(':', '_')}.json.gz`)).toString('utf8'))
  for (const tf of ['daily', 'weekly']) {
    const s = tf === 'daily' ? d : toWeekly({ ...d, group: 'us' }, '2026-10-06')
    const z = summarize4({ symbol: x.symbol }, s, tf, '2018-01-01')
    for (const k of keys) if (k.startsWith(tf)) for (const p of ['I', 'II']) { acc[k].bars.push(...z.trades[k][p].bars); acc[k].ret.push(...z.trades[k][p].ret) }
  }
}
const mean = (a) => a.reduce((p, q) => p + q, 0) / a.length
const out = {}
for (const k of keys) {
  const b = acc[k].bars.sort((p, q) => p - q)
  const r = acc[k].ret.slice().sort((p, q) => p - q)
  out[k] = { n: r.length, holdMean: mean(b), median: b[b.length >> 1], avgWin: mean(r.filter((v) => v > 0)), avgLoss: mean(r.filter((v) => v <= 0)), worst: r[0], p5: r[Math.floor(r.length * 0.05)] }
}
fs.writeFileSync('reports/study4-hold.json', JSON.stringify(out, null, 1))
console.log(out)
