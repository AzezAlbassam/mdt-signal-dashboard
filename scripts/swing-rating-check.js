// Protocol §8: compare the rebuilt Technical Rating with TradingView's live one.
// Live values and today's forming bar are in data/swing/live-rating.json; the bar is
// appended so both sides rate the same session. Reported as is — nothing is re-fitted.
//
//   node scripts/swing-rating-check.js

import fs from 'node:fs'

import { technicalRating } from '../engine/indicators.js'

const live = JSON.parse(fs.readFileSync('data/swing/live-rating.json', 'utf8'))
const bucket = (x) => (x > 0.5 ? 'strong buy' : x > 0.1 ? 'buy' : x >= -0.1 ? 'neutral' : x >= -0.5 ? 'sell' : 'strong sell')
const sign = (x) => (x > 0.1 ? 1 : x < -0.1 ? -1 : 0)

const lines = []
let sameBucket = 0
let sameSign = 0
let exactMa = 0
let n = 0
const errs = { all: [], ma: [], osc: [] }
for (const [symbol, v] of Object.entries(live.symbols)) {
  const s = JSON.parse(fs.readFileSync(`data/swing/${symbol.replace(':', '_')}.json`, 'utf8'))
  const t = v.today
  const ser = (k, x) => [...s[k], x]
  const r = technicalRating(ser('high', t.h), ser('low', t.l), ser('close', t.c), ser('volume', t.v))
  const k = s.close.length
  const mine = { all: r.all[k], ma: r.ma[k], osc: r.osc[k] }
  n += 1
  if (bucket(mine.all) === bucket(v.all)) sameBucket += 1
  if (sign(mine.all) === sign(v.all)) sameSign += 1
  if (Math.abs(mine.ma - v.ma) < 1e-9) exactMa += 1
  for (const f of ['all', 'ma', 'osc']) errs[f].push(Math.abs(mine[f] - v[f]))
  lines.push(`${symbol.padEnd(17)} live ${v.all.toFixed(3).padStart(6)} ${bucket(v.all).padEnd(11)} rebuilt ${mine.all.toFixed(3).padStart(6)} ${bucket(mine.all).padEnd(11)}  MA ${v.ma.toFixed(3)}/${mine.ma.toFixed(3)}  Osc ${v.osc.toFixed(3)}/${mine.osc.toFixed(3)}`)
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const head = [
  'TradingView Technical Rating — live vs rebuilt, daily, 2026-10-06 (protocol §8)',
  `same bucket (strong sell … strong buy): ${sameBucket} of ${n}`,
  `same direction (buy / neutral / sell at ±0.1): ${sameSign} of ${n}`,
  `MA rating identical: ${exactMa} of ${n}`,
  `mean |difference|: All ${mean(errs.all).toFixed(3)}, MA ${mean(errs.ma).toFixed(3)}, Osc ${mean(errs.osc).toFixed(3)}`,
  '',
]
fs.writeFileSync('reports/swing-rating-check.txt', [...head, ...lines].join('\n') + '\n')
console.log([...head, ...lines].join('\n'))
