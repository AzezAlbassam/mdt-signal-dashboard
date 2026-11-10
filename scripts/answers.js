// Three questions, measured:
//   1. which timeframe works best?
//   2. what is the win rate?
//   3. does it work better on stocks, or on NDX?
//
//   node scripts/answers.js
//
// DATA LIMIT, stated first because it bounds two of the three answers:
// this data plan serves ^GSPC daily only. Intraday bars are gated, and so is every other
// symbol tried (^NDX, QQQ). So Q1 is answered for daily/weekly/monthly and NOT for the
// 5-minute and 1-hour charts he actually posts; Q3 cannot be answered by direct
// measurement and is addressed structurally instead.
//
// Every rate carries a Wilson interval and every expectancy a bootstrap interval, because
// the interesting-looking rows here are the small ones.

import fs from 'node:fs'

import { digitSum, numericStep } from '../engine/numeric.js'
import { maAnchorLevels } from '../engine/ma-anchor.js'
import { resample } from '../engine/resample.js'
import { runTrades } from '../engine/trade.js'
import { seededRng, displaceSameDirection, reLadder } from '../engine/null-models.js'
import { wilsonInterval, bootstrapMean } from '../engine/stats.js'

const DATA = process.env.SPX_CSV ?? '/tmp/zen/data/spx_all.csv'
const DRAWS = 800

function loadBars(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
  const idx = Object.fromEntries(lines[0].split(',').map((h, i) => [h.trim(), i]))
  return lines.slice(1).map((line) => {
    const f = line.split(',')
    return {
      date: f[idx.date], open: Number(f[idx.open]), high: Number(f[idx.high]),
      low: Number(f[idx.low]), close: Number(f[idx.close]),
    }
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

function numericAnchors(bars, lookback) {
  return swingLows(bars, lookback).map((fromIndex) => ({
    anchorLow: bars[fromIndex].low, fromIndex,
  }))
}

/** His ladder, optionally with his own ÷10 / ÷100 scaling for cheaper instruments. */
function ladderFrom(anchors, { rungs = 2, autoScale = false } = {}) {
  return anchors.flatMap(({ anchorLow, fromIndex }) => {
    const step = autoScale
      ? numericStep(anchorLow, { autoScale: true })
      : digitSum(anchorLow) * 45
    const out = []
    for (let r = 1; r <= rungs; r += 1) {
      out.push({ price: anchorLow + step * r, fromIndex, reference: anchorLow })
    }
    return out
  })
}

function maLevels(bars, period, lookback) {
  return maAnchorLevels(bars, { period, lookback }).map((l) => ({
    price: l.price, fromIndex: l.barIndex, reference: bars[l.barIndex].high,
  }))
}

const pc = (x) => (x === null ? '  — ' : `${(x * 100).toFixed(1)}%`)
const sg = (x) => (x === null ? '  — ' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`)
const ci = (iv, f) => (iv === null ? '—' : `[${f(iv[0])}, ${f(iv[1])}]`)

const daily = loadBars(DATA)
console.log(`\nSPX ${daily[0].date} → ${daily.at(-1).date}, ${daily.length} daily sessions`)
console.log('Intraday is gated on this data plan — daily and above only.')

// ══════════════════════════════════════════════════════════════ Q1: timeframe

console.log('\n═══ Q1 — which timeframe? ═══')
console.log('Numeric ladder, short the first touch, 2% stop / 3% target. Break-even = 40%.\n')

for (const tf of ['daily', 'weekly', 'monthly']) {
  const bars = resample(daily, tf)
  const lookback = tf === 'daily' ? 5 : 2
  const horizon = tf === 'daily' ? 20 : 6
  const levels = ladderFrom(numericAnchors(bars, lookback))
  const r = runTrades(bars, levels, {
    direction: 'short', from: 'below', stopPct: 2, targetPct: 3, horizon,
  })
  const wi = wilsonInterval(r.wins, r.wins + r.losses)
  const bi = bootstrapMean(r.returns, { draws: 4000, rng: seededRng(11) })

  console.log(
    `${tf.padEnd(8)} ${String(bars.length).padStart(5)} bars  ` +
    `${String(r.trades).padStart(4)} trades   ` +
    `win ${pc(r.winRate).padStart(6)} ${ci(wi, (x) => `${(x * 100).toFixed(0)}%`).padEnd(12)}  ` +
    `exp ${sg(r.expectancy).padStart(7)} ${ci(bi, (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`)}`,
  )
}
console.log(
  '\nThe monthly row looks best and means least: 32 trades, and its interval spans the\n' +
  '40% break-even in both directions. A 16-16 split at a 3:2 payoff is what a coin flip\n' +
  'pays. Higher timeframes here buy a smaller sample, not a better rule.',
)

// ═══════════════════════════════════════════════════════════════ Q2: win rate

console.log('\n═══ Q2 — the win rate ═══')
console.log('It is not one number: it moves from 15% to 68% purely by moving the exits.')
console.log('What matters is the win rate MINUS the break-even it has to clear.\n')

const GRID = [
  { stopPct: 2, targetPct: 2 }, { stopPct: 2, targetPct: 3 }, { stopPct: 3, targetPct: 3 },
  { stopPct: 2, targetPct: 5 }, { stopPct: 5, targetPct: 5 },
]

const numLevels = ladderFrom(numericAnchors(daily, 5))
const ma = maLevels(daily, 50, 5)

const RULES = [
  { name: 'numeric ×45 (short)', levels: numLevels, opts: { direction: 'short', from: 'below' } },
  { name: 'numeric ×45 (long)', levels: numLevels, opts: { direction: 'long', from: 'below' } },
  { name: 'MA50 at peak (long)', levels: ma, opts: { direction: 'long', from: 'above' } },
]

const head = 'rule                 stop/tgt  trades   win%      need    edge     expectancy  95% CI'
console.log(head)
console.log('─'.repeat(head.length))

for (const rule of RULES) {
  for (const g of GRID) {
    const r = runTrades(daily, rule.levels, { ...rule.opts, ...g, horizon: 20 })
    const need = g.stopPct / (g.stopPct + g.targetPct)
    const edge = r.winRate === null ? null : r.winRate - need
    const bi = bootstrapMean(r.returns, { draws: 4000, rng: seededRng(13) })
    console.log(
      [
        rule.name.padEnd(20),
        `${g.stopPct}/${g.targetPct}`.padStart(8),
        String(r.trades).padStart(7),
        pc(r.winRate).padStart(7),
        pc(need).padStart(9),
        (edge === null ? '  —' : `${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}pp`).padStart(8),
        sg(r.expectancy).padStart(13),
        ci(bi, (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`).padStart(18),
      ].join(' '),
    )
  }
  console.log()
}

// ─── the MA50 rows looked positive; attack them with a second, harder null ───

console.log('The MA50 rows are the only ones whose expectancy is not clearly negative,')
console.log('so they get a second null: same offset below the anchor, but anchored at a')
console.log('RANDOM bar instead of a swing peak. That separates "the MA50 at the peak is')
console.log('special" from "buying a dip of about this depth in a bull market works".\n')

const head2 = 'MA50 test          stop/tgt   his exp    vs displaced       vs random anchor'
console.log(head2)
console.log('─'.repeat(head2.length))

for (const g of [{ stopPct: 2, targetPct: 5 }, { stopPct: 5, targetPct: 5 }]) {
  const opts = { direction: 'long', from: 'above', ...g, horizon: 20 }
  const actual = runTrades(daily, ma, opts)

  const rngA = seededRng(0x5eed)
  const nullA = []
  for (let d = 0; d < DRAWS; d += 1) {
    const n = runTrades(daily, ma.map((l) => displaceSameDirection(l, rngA)), opts)
    if (n.expectancy !== null) nullA.push(n.expectancy)
  }

  // Harder null: keep each level's distance below its anchor, move the anchor bar.
  const rngB = seededRng(0xbeef)
  const nullB = []
  const usable = daily.length - 40
  for (let d = 0; d < DRAWS; d += 1) {
    const shifted = ma.map((l) => {
      const drop = l.reference - l.price
      const bar = 20 + Math.floor(rngB() * usable)
      return { price: daily[bar].high - drop, fromIndex: bar, reference: daily[bar].high }
    })
    const n = runTrades(daily, shifted, opts)
    if (n.expectancy !== null) nullB.push(n.expectancy)
  }

  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length
  const pOf = (a) => (a.filter((x) => x >= actual.expectancy).length + 1) / (a.length + 1)

  console.log(
    [
      'MA50 at peak'.padEnd(18),
      `${g.stopPct}/${g.targetPct}`.padStart(8),
      sg(actual.expectancy).padStart(9),
      `${sg(mean(nullA))} p=${pOf(nullA).toFixed(3)}`.padStart(19),
      `${sg(mean(nullB))} p=${pOf(nullB).toFixed(3)}`.padStart(22),
    ].join(' '),
  )
}

// ══════════════════════════════════════════════ Q3: stocks — structural check

console.log('\n═══ Q3 — stocks vs index ═══')
console.log('^NDX and QQQ are gated on this plan, so this is not a direct comparison.')
console.log('What can be measured is the property that decides it: his ladder is built from')
console.log('the DIGIT SUM of the price, so re-quoting the same market — a split — rewrites')
console.log('every level. Stocks split; indices do not. Both columns below are the identical')
console.log('SPX series, only the quote units differ.\n')

const SPLITS = [
  { label: 'index, unchanged', divisor: 1 },
  { label: 'after a 2:1 split', divisor: 2 },
  { label: 'after a 4:1 split', divisor: 4 },
  { label: 'after a 10:1 split', divisor: 10 },
]

const head3 =
  'same market, re-quoted   sample low   Σ   raw step   raw win%   with his ÷10 rule'
console.log(head3)
console.log('─'.repeat(head3.length))

const sampleLow = daily[swingLows(daily, 5)[0]].low

for (const s of SPLITS) {
  const scaled = daily.map((b) => ({
    date: b.date, open: b.open / s.divisor, high: b.high / s.divisor,
    low: b.low / s.divisor, close: b.close / s.divisor,
  }))
  const anchors = numericAnchors(scaled, 5)
  const tradeOpts = { direction: 'short', from: 'below', stopPct: 2, targetPct: 3, horizon: 20 }

  const raw = runTrades(scaled, ladderFrom(anchors), tradeOpts)
  const fixed = runTrades(scaled, ladderFrom(anchors, { autoScale: true }), tradeOpts)
  const low = sampleLow / s.divisor

  console.log(
    [
      s.label.padEnd(24),
      low.toFixed(2).padStart(10),
      String(digitSum(low)).padStart(3),
      (digitSum(low) * 45).toFixed(0).padStart(10),
      `${pc(raw.winRate)} (${raw.trades})`.padStart(11),
      `${pc(fixed.winRate)} (${fixed.trades}) exp ${sg(fixed.expectancy)}`.padStart(19),
    ].join(' '),
  )
}

console.log(
  '\nHis ÷10/÷100 rule does most of its job — it keeps the ladder on the same scale as the\n' +
  'price, so the trade count survives. What it cannot fix is the digit sum itself: Σ moves\n' +
  '26 → 22 → 20 → 18 across these rows for a market that never changed. On an index that\n' +
  'never splits, that instability never shows up. On a stock it fires on the split date.\n',
)
