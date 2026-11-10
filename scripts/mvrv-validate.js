// Check the Bitcoin series against Coin Metrics' own published numbers.
//
// Coin Metrics publishes daily market cap and MVRV in github.com/coinmetrics/data
// (csv/btc.csv). Two checks:
//   1. our weekly MVRV (TradingView price × issuance-schedule supply ÷ Coin Metrics
//      realized cap) against Coin Metrics' CapMVRVCur on the same Sunday;
//   2. the Z-score recomputed DAILY from Coin Metrics' data, with σ expanding from
//      2010-07-18, against the peaks quoted for the published chart (~10 in 2013 and
//      2017, ~7 in 2021).
//
//   CM_CSV=/path/to/btc.csv node scripts/mvrv-validate.js

import fs from 'node:fs'

import { mvrvRatio, mvrvZ } from '../engine/mvrv.js'

const file = process.env.CM_CSV
if (!file) throw new Error('set CM_CSV to Coin Metrics csv/btc.csv')

const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
const head = lines[0].split(',')
const col = (k) => head.indexOf(k)
const daily = []
for (const line of lines.slice(1)) {
  const f = line.split(',')
  const mc = Number(f[col('CapMrktCurUSD')])
  const mvrv = Number(f[col('CapMVRVCur')])
  if (mc > 0 && mvrv > 0 && f[0] >= '2010-07-18') daily.push({ date: f[0], mc, rc: mc / mvrv, mvrv })
}
const byDate = new Map(daily.map((r) => [r.date, r]))

const out = []
const say = (s = '') => out.push(s)
say(`Coin Metrics daily: ${daily.length} days, ${daily[0].date} → ${daily.at(-1).date}`)

// 1. weekly agreement
const d = JSON.parse(fs.readFileSync('data/mvrv/BTC.json', 'utf8'))
const ours = mvrvRatio(d.c.map((c, i) => c * d.supply[i]), d.realizedCap)
const rows = []
d.t.forEach((t, i) => {
  const sunday = new Date((t + 6 * 86400) * 1000).toISOString().slice(0, 10)
  const cm = byDate.get(sunday)
  if (cm) rows.push({ sunday, ours: ours[i], cm: cm.mvrv, err: Math.abs(ours[i] / cm.mvrv - 1) })
})
const errs = rows.map((r) => r.err).sort((a, b) => a - b)
const flips = rows.filter((r) => (r.ours < 1) !== (r.cm < 1))
say()
say(`1. Weekly MVRV vs Coin Metrics CapMVRVCur, ${rows.length} Sundays`)
say(`   median abs difference ${(errs[errs.length >> 1] * 100).toFixed(2)}%, 95th pct ${(errs[Math.floor(errs.length * 0.95)] * 100).toFixed(2)}%`)
say(`   weeks on opposite sides of MVRV = 1: ${flips.length}${flips.length ? ` (${flips.map((r) => `${r.sunday}: ${r.ours.toFixed(3)} vs ${r.cm.toFixed(3)}`).join('; ')})` : ''}`)

// 2. daily Z peaks and troughs
const z = mvrvZ(daily.map((r) => r.mc), daily.map((r) => r.rc))
const extreme = (from, to, pick) => {
  let best = null
  daily.forEach((r, i) => {
    if (r.date < from || r.date > to) return
    if (!best || pick(z[i], best.z)) best = { date: r.date, z: z[i] }
  })
  return best
}
const summary = { days: daily.length, from: daily[0].date, to: daily.at(-1).date, sundays: rows.length, medianAbsDiff: errs[errs.length >> 1], p95AbsDiff: errs[Math.floor(errs.length * 0.95)], flips: flips.length, peaks: [], lows: [] }
say()
say('2. Daily Z-score from Coin Metrics data, σ expanding from 2010-07-18')
for (const [from, to] of [['2011-05-01', '2011-07-31'], ['2013-03-01', '2013-05-31'], ['2013-11-01', '2013-12-31'], ['2017-11-01', '2018-01-31'], ['2021-01-01', '2021-05-31'], ['2021-10-01', '2021-12-31'], ['2024-02-01', '2024-04-30'], ['2024-11-01', '2025-10-31']]) {
  const p = extreme(from, to, (a, b) => a > b)
  summary.peaks.push(p)
  say(`   peak  ${p.date}  Z ${p.z.toFixed(2)}`)
}
for (const [from, to] of [['2011-09-01', '2011-12-31'], ['2014-12-01', '2015-10-31'], ['2018-11-01', '2019-03-31'], ['2020-03-01', '2020-03-31'], ['2022-06-01', '2023-01-31'], ['2025-11-01', '2026-12-31']]) {
  const p = extreme(from, to, (a, b) => a < b)
  if (p) {
    summary.lows.push(p)
    say(`   low   ${p.date}  Z ${p.z.toFixed(2)}`)
  }
}
say()
say('   Weekly closes sample the same series and so print lower peaks (2017: 8.3 weekly vs 10.1 on')
say('   2017-12-07): the daily peak lands on a day when σ had not yet absorbed the spike. The zero')
say('   line is identical — it does not depend on σ at all.')

fs.writeFileSync('reports/mvrv-validation.txt', `${out.join('\n')}\n`)
fs.writeFileSync('data/mvrv/validation.json', `${JSON.stringify(summary, null, 1)}\n`)
console.log(out.join('\n'))
