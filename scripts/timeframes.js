// Accuracy of both indicator rules, per timeframe, on SPX.
//
//   node scripts/timeframes.js
//
// For each timeframe and each rule in pine/mizan-levels.pine this reports:
//   - how many levels were drawn and how many price ever reached
//   - the "zero reversal" rate (his claim) vs a matched null, with p
//   - the trade result at his own 2% stop / 3% target: win rate with a Wilson
//     interval, the break-even it must clear, and expectancy with a bootstrap interval
//
// Intraday is gated on this data plan. Daily, weekly and monthly only.

import fs from 'node:fs'

import { digitSum } from '../engine/numeric.js'
import { maAnchorLevels } from '../engine/ma-anchor.js'
import { resample } from '../engine/resample.js'
import { scoreLevels } from '../engine/reversal.js'
import { runTrades } from '../engine/trade.js'
import { seededRng, displaceSameDirection, reLadder } from '../engine/null-models.js'
import { wilsonInterval, bootstrapMean } from '../engine/stats.js'

const DATA = process.env.SPX_CSV ?? '/tmp/zen/data/spx_all.csv'
const DRAWS = 1000

function loadBars(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
  const idx = Object.fromEntries(lines[0].split(',').map((h, i) => [h.trim(), i]))
  return lines.slice(1).map((l) => {
    const f = l.split(',')
    return { date: f[idx.date], open: +f[idx.open], high: +f[idx.high], low: +f[idx.low], close: +f[idx.close] }
  })
}

function swingLows(bars, lookback) {
  const out = []
  for (let i = lookback; i < bars.length - lookback; i += 1) {
    let trough = true
    for (let j = i - lookback; j <= i + lookback; j += 1) {
      if (j !== i && bars[j].low <= bars[i].low) { trough = false; break }
    }
    if (trough) out.push(i)
  }
  return out
}

const numericLevels = (bars, lookback) =>
  swingLows(bars, lookback).flatMap((fromIndex) =>
    reLadder({ anchorLow: bars[fromIndex].low, fromIndex, rungs: 2 }, 45))

const maLevels = (bars, lookback) =>
  maAnchorLevels(bars, { period: 50, lookback }).map((l) => ({
    price: l.price, fromIndex: l.barIndex, reference: bars[l.barIndex].high,
  }))

const TF = [
  { name: 'daily', lookback: 5, horizon: 20 },
  { name: 'weekly', lookback: 2, horizon: 6 },
  { name: 'monthly', lookback: 2, horizon: 6 },
]

const RULES = [
  { name: 'numeric ladder (Σ×45)', make: numericLevels, from: 'below', direction: 'short' },
  { name: 'MA50 at peak', make: maLevels, from: 'above', direction: 'long' },
]

const pc = (x) => (x == null ? '   —' : `${(x * 100).toFixed(1)}%`)
const sg = (x) => (x == null ? '   —' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`)
const ci = (iv, f) => (iv ? `[${f(iv[0])}, ${f(iv[1])}]` : '—')

const daily = loadBars(DATA)
console.log(`\nSPX ${daily[0].date} → ${daily.at(-1).date} — ${daily.length} sessions`)
console.log('Intraday (5m / 15m / 1h / 4h) is gated on this data plan and NOT measured.\n')

for (const rule of RULES) {
  console.log(`━━━ ${rule.name} — ${rule.direction} the first touch ━━━\n`)
  const h1 = 'timeframe   bars  levels touched | zero-rev  chance     p  | trades  win%   95% CI       need   expectancy   95% CI'
  console.log(h1)
  console.log('─'.repeat(h1.length))

  for (const tf of TF) {
    const bars = resample(daily, tf.name)
    const levels = rule.make(bars, tf.lookback)
    if (levels.length === 0) { console.log(`${tf.name.padEnd(10)} no levels`); continue }

    // His claim: zero reversal at the level. pen ≤ 0.5%, exc ≥ 2% within the horizon.
    const revOpts = { from: rule.from, horizon: tf.horizon, maxPenetrationPct: 0.5, minExcursionPct: 2 }
    const rev = scoreLevels(bars, levels, revOpts)
    const rng = seededRng(0x5eed)
    const nullRates = []
    for (let d = 0; d < DRAWS; d += 1) {
      const n = scoreLevels(bars, levels.map((l) => displaceSameDirection(l, rng)), revOpts)
      if (n.rate !== null) nullRates.push(n.rate)
    }
    const chance = nullRates.reduce((s, r) => s + r, 0) / nullRates.length
    const p = rev.rate === null ? null
      : (nullRates.filter((r) => r >= rev.rate).length + 1) / (nullRates.length + 1)

    // The trade: 2% stop, 3% target, his own exit rule.
    const tr = runTrades(bars, levels, { direction: rule.direction, from: rule.from, stopPct: 2, targetPct: 3, horizon: tf.horizon })
    const wi = wilsonInterval(tr.wins, tr.wins + tr.losses)
    const bi = bootstrapMean(tr.returns, { draws: 3000, rng: seededRng(7) })

    console.log([
      tf.name.padEnd(10),
      String(bars.length).padStart(5),
      String(levels.length).padStart(7),
      String(rev.touched).padStart(7),
      ' |',
      pc(rev.rate).padStart(8),
      pc(chance).padStart(7),
      (p == null ? '   —' : p.toFixed(3)).padStart(6),
      ' |',
      String(tr.trades).padStart(6),
      pc(tr.winRate).padStart(6),
      ci(wi, (x) => `${(x * 100).toFixed(0)}%`).padEnd(12),
      '40.0%'.padStart(5),
      sg(tr.expectancy).padStart(12),
      ci(bi, (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`).padStart(15),
    ].join(' '))
  }
  console.log()
}

console.log('zero-rev  = share of touched levels where price turned at the level (his claim).')
console.log('chance    = the same share for randomly displaced levels at the same anchors.')
console.log('p         = how often chance matched or beat him; p > 0.05 = no detectable edge.')
console.log('need      = break-even win rate for a 2% stop / 3% target.')
console.log('expectancy= mean return per trade, timeouts included.\n')
