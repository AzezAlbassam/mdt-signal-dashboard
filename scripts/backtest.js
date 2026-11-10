// Does @zero_en3kas's method actually mark levels that price respects?
//
// A hit rate on its own cannot answer that. In a market that trends and mean-reverts,
// ANY horizontal line gets touched and is followed by movement. The only question with
// content is whether HIS levels do better than levels placed by chance in the same
// places at the same times.
//
// Two null models, both matched on anchors, scoring and thresholds:
//
//   SAME-SIDE   the level is displaced at random but stays on the same side of its
//               anchor, with the same expected distance. Tests: is this exact price
//               special, or would any level roughly this far away have done as well?
//
//   MULTIPLIER  his numeric ladder rebuilt with a random constant in place of 45.
//               Tests his claim directly: everything else held fixed, is 45 special?
//
//   node scripts/backtest.js

import fs from 'node:fs'

import { numericStep } from '../engine/numeric.js'
import { maAnchorLevels } from '../engine/ma-anchor.js'
import { scoreLevels } from '../engine/reversal.js'
import { seededRng, displaceSameDirection, reLadder } from '../engine/null-models.js'

const DATA = process.env.SPX_CSV ?? '/tmp/zen/data/spx_all.csv'
const DRAWS = 2000

// ---------------------------------------------------------------- data

function loadBars(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
  const idx = Object.fromEntries(lines[0].split(',').map((h, i) => [h.trim(), i]))
  return lines.slice(1).map((line) => {
    const f = line.split(',')
    return {
      date: f[idx.date],
      open: Number(f[idx.open]),
      high: Number(f[idx.high]),
      low: Number(f[idx.low]),
      close: Number(f[idx.close]),
    }
  })
}

// ---------------------------------------------------------------- his rules

function swingLows(bars, lookback) {
  const out = []
  for (let i = lookback; i < bars.length - lookback; i += 1) {
    let isTrough = true
    for (let j = i - lookback; j <= i + lookback; j += 1) {
      if (j !== i && bars[j].low <= bars[i].low) {
        isTrough = false
        break
      }
    }
    if (isTrough) out.push(i)
  }
  return out
}

/** MA50 anchor rule: the MA50's value at each swing peak, carried forward. */
function maRuleLevels(bars, { period = 50, lookback = 5 } = {}) {
  return maAnchorLevels(bars, { period, lookback }).map((l) => ({
    price: l.price,
    fromIndex: l.barIndex,
    reference: bars[l.barIndex].high, // the peak the vertical is dropped on
  }))
}

/** Numeric rule: from each swing low, ladder up by digitSum(low) × 45. */
function numericRuleAnchors(bars, { lookback = 5 } = {}) {
  return swingLows(bars, lookback).map((barIndex) => ({
    anchorLow: bars[barIndex].low,
    fromIndex: barIndex,
  }))
}

function numericRuleLevels(anchors, rungs = 2) {
  return anchors.flatMap((a) => reLadder({ ...a, rungs }, 45))
}

// ---------------------------------------------------------------- stats

function summarise(actualRate, nullRates) {
  nullRates.sort((a, b) => a - b)
  const mean = nullRates.reduce((s, r) => s + r, 0) / nullRates.length
  const sd = Math.sqrt(
    nullRates.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, nullRates.length - 1),
  )
  const p = (nullRates.filter((r) => r >= actualRate).length + 1) / (nullRates.length + 1)
  return { nullMean: mean, nullSd: sd, z: sd === 0 ? null : (actualRate - mean) / sd, p }
}

function runNull(bars, opts, makeLevels) {
  const random = seededRng(0x5eed)
  const rates = []
  for (let draw = 0; draw < DRAWS; draw += 1) {
    const result = scoreLevels(bars, makeLevels(random), opts)
    if (result.rate !== null) rates.push(result.rate)
  }
  return rates
}

// ---------------------------------------------------------------- report

const fmtPct = (x) => (x === null || x === undefined ? '  — ' : `${(x * 100).toFixed(1)}%`)

function table(rows) {
  const head = 'rule vs null                          lvls  touch   his    chance     z      p'
  const out = [head, '─'.repeat(head.length)]
  for (const r of rows) {
    out.push(
      [
        r.label.padEnd(36),
        String(r.levels).padStart(4),
        String(r.touched).padStart(5),
        fmtPct(r.rate).padStart(7),
        fmtPct(r.nullMean).padStart(8),
        (r.z === null ? '  —' : r.z.toFixed(2)).padStart(7),
        r.p.toFixed(3).padStart(7),
      ].join(' '),
    )
  }
  return out.join('\n')
}

// ---------------------------------------------------------------- run

const bars = loadBars(DATA)
console.log(`\nSPX daily — ${bars.length} sessions, ${bars[0].date} to ${bars.at(-1).date}`)
console.log(`Null model: ${DRAWS} seeded draws per rule, anchors held fixed.\n`)

const maLevels = maRuleLevels(bars)
const numAnchors = numericRuleAnchors(bars)
const numLevels = numericRuleLevels(numAnchors)

console.log(`MA50-anchor rule  → ${maLevels.length} levels from ${maLevels.length} swing peaks`)
console.log(`Numeric ladder    → ${numLevels.length} levels from ${numAnchors.length} swing lows\n`)

const GRID = [
  { maxPenetrationPct: 0.25, minExcursionPct: 2 },
  { maxPenetrationPct: 0.5, minExcursionPct: 2 },
  { maxPenetrationPct: 0.5, minExcursionPct: 5 },
  { maxPenetrationPct: 1.0, minExcursionPct: 5 },
]

for (const thresholds of GRID) {
  const opts = { from: 'below', horizon: 20, ...thresholds }
  console.log(
    `── zero reversal = penetration ≤ ${thresholds.maxPenetrationPct}% ` +
      `and excursion ≥ ${thresholds.minExcursionPct}% within 20 sessions`,
  )

  const rows = []

  const ma = scoreLevels(bars, maLevels, opts)
  rows.push({
    label: 'MA50 at peak  vs same-side random',
    levels: ma.levels,
    touched: ma.touched,
    rate: ma.rate,
    ...summarise(ma.rate, runNull(bars, opts, (r) => maLevels.map((l) => displaceSameDirection(l, r)))),
  })

  const num = scoreLevels(bars, numLevels, opts)
  rows.push({
    label: 'numeric ×45   vs same-side random',
    levels: num.levels,
    touched: num.touched,
    rate: num.rate,
    ...summarise(num.rate, runNull(bars, opts, (r) => numLevels.map((l) => displaceSameDirection(l, r)))),
  })
  rows.push({
    label: 'numeric ×45   vs random multiplier',
    levels: num.levels,
    touched: num.touched,
    rate: num.rate,
    ...summarise(
      num.rate,
      runNull(bars, opts, (r) => {
        // A random multiplier in the same broad range as 45, redrawn each anchor.
        const m = 5 + r() * 195
        return numAnchors.flatMap((a) => reLadder({ ...a, rungs: 2 }, m))
      }),
    ),
  })

  console.log(table(rows))
  console.log()
}

console.log(
  'Reading: "his" is his hit rate among levels price actually reached. "chance" is the\n' +
    `mean hit rate of the matched null. p is how often chance matched or beat him across\n` +
    `${DRAWS} draws. p > 0.05 means the rule is indistinguishable from chance.\n`,
)
