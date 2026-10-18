// How long a trade actually lasts, per timeframe. Written to reports/harmonic-holding.json.
//
//   node scripts/harmonic-holding.js
//
// POST-HOC and purely descriptive — PROTOCOL-harmonic.md §6 pre-registers no duration
// hypothesis, and nothing here is tested against a null. It answers one practical question:
// if you want to hold a position for roughly N months, which timeframe produces trades that
// last that long? Durations are calendar days between the entry bar and the exit bar, so
// weekends and holidays are counted the way a position actually experiences them.

import fs from 'node:fs'
import zlib from 'node:zlib'
import { scan } from '../engine/harmonic.js'

const TF = ['1h', '4h', '1D', '1W', '1M']
const universe = JSON.parse(fs.readFileSync('data/harmonic/universe.json', 'utf8')).symbols

const load = (sym, tf) => {
  const f = `data/harmonic/bars/${sym.replace(/[:/]/g, '_')}__${tf}.json.gz`
  if (!fs.existsSync(f)) return null
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)))
  return d.close.map((c, i) => ({ o: d.open[i], h: d.high[i], l: d.low[i], c, date: d.date[i] }))
}

const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000
const q = (a, p) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN)

const out = {
  note: 'POST-HOC, descriptive. Calendar days from the entry bar to the exit bar. "wait" is from the bar the pattern was registered (C confirmed) to the bar the limit filled — dead time before the trade exists.',
  caveat: 'The 1h and 4h series carry date-only stamps, so every intraday duration is rounded down to whole days and reads 0 inside one session. Their bar counts are exact; their day counts are a floor. 1D and above are unaffected.',
  horizonBars: 60,
  rows: [],
}

for (const tf of TF) {
  const hold = []     // entry → exit
  const win = []      // the same, for trades that reached T1: the ones that actually ran
  const wait = []     // registration → entry: dead time, the limit order sitting there
  const struct = []   // X → C: how long the pattern itself takes to form
  const cycle = []    // X → exit: the whole thing, first pivot to closed position
  const step = []     // calendar days per bar, for turning the 60-bar horizon into a date
  const holdB = []    // entry → exit in BARS: exact on every timeframe, unlike the day counts
  let n = 0
  for (const m of universe) {
    const bars = load(m.symbol, tf)
    if (!bars || bars.length < 200) continue
    for (let i = 1; i < bars.length; i += 1) step.push(days(bars[i - 1].date, bars[i].date))
    for (const t of scan(bars).trades) {
      n += 1
      const d = days(bars[t.entryAt].date, bars[t.exitAt].date)
      hold.push(d)
      holdB.push(t.bars)
      if (t.outcome === 't1') win.push(d)
      wait.push(days(bars[t.confirmedAt].date, bars[t.entryAt].date))
      const x = bars[t.points[0].index].date
      struct.push(days(x, bars[t.points[t.points.length - 1].index].date))
      cycle.push(days(x, bars[t.exitAt].date))
    }
  }
  if (!n) continue
  out.rows.push({
    tf,
    n,
    // The horizon is the hard ceiling the rules impose: 60 bars, in calendar days. The MEAN
    // step is the right converter — the median is 0 intraday, where most bars sit inside one
    // session and the overnight gap is carried by a minority of them.
    horizonDays: 60 * (step.reduce((s, x) => s + x, 0) / step.length),
    holdBars: { median: q(holdB, 0.5), p90: q(holdB, 0.9) },
    holdDays: { median: q(hold, 0.5), p75: q(hold, 0.75), p90: q(hold, 0.9) },
    winnerDays: { median: q(win, 0.5), p75: q(win, 0.75), p90: q(win, 0.9) },
    waitDays: { median: q(wait, 0.5), p90: q(wait, 0.9) },
    structureDays: { median: q(struct, 0.5), p90: q(struct, 0.9) },
    cycleDays: { median: q(cycle, 0.5), p90: q(cycle, 0.9) },
  })
}

fs.mkdirSync('reports', { recursive: true })
fs.writeFileSync('reports/harmonic-holding.json', `${JSON.stringify(out, null, 2)}\n`)

const f = (x) => (x >= 1000 ? x.toFixed(0) : x >= 100 ? x.toFixed(0) : x.toFixed(1)).padStart(6)
console.log('                                        calendar days, median (p90)')
console.log('tf      n    horizon   X→C form      wait      hold   winner hold    X→exit cycle')
for (const r of out.rows) {
  console.log(
    `${r.tf.padEnd(4)} ${String(r.n).padStart(5)} ${f(r.horizonDays)}  ` +
    `${f(r.structureDays.median)} (${f(r.structureDays.p90).trim()})  ${f(r.waitDays.median)}  ${f(r.holdDays.median)}  ` +
    `${f(r.winnerDays.median)} (${f(r.winnerDays.p90).trim()})  ${f(r.cycleDays.median)} (${f(r.cycleDays.p90).trim()})`,
  )
}
