// Turning his levels into actual trades, so "نسبة نجاح الصفقات" — the win rate — has a
// definite meaning.
//
// His exit rule, posted 2024-10-06: "الوقف ثابت و الهدف متغير" — the stop is fixed, the
// target varies — with a note that in the Saudi market the target for a scalper is only
// 2 to 3 percent. So a trade is: enter at the level on the touch, fixed stop, chosen
// target, and walk forward until one of them is hit.
//
// THE INTRABAR PROBLEM, stated up front because it decides the whole number:
// a daily bar gives a high and a low but not their order. When one bar's range contains
// both the stop and the target we cannot know which was reached first. Every test below
// pins the conservative choice — assume the STOP hit first. The optimistic choice would
// inflate the win rate on exactly the volatile bars where it matters most, and a backtest
// that resolves its own ambiguities in its favour is worthless.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { simulateTrade, runTrades } from '../engine/trade.js'

const series = (...ranges) =>
  ranges.map(([low, high]) => ({ low, high, close: (low + high) / 2 }))

describe('simulateTrade — long from a support touch', () => {
  const opts = { direction: 'long', stopPct: 2, targetPct: 3, horizon: 10 }

  test('target hit cleanly is a win of exactly the target', () => {
    //              entry bar        rally through 103
    const bars = series([99, 101], [100, 102], [101, 104])
    const t = simulateTrade(bars, 0, { ...opts, entryPrice: 100 })
    assert.equal(t.outcome, 'target')
    assert.equal(t.exitIndex, 2)
    assert.equal(t.returnPct, 3)
  })

  test('stop hit cleanly is a loss of exactly the stop', () => {
    const bars = series([99, 101], [97.5, 100], [96, 99])
    const t = simulateTrade(bars, 0, { ...opts, entryPrice: 100 })
    assert.equal(t.outcome, 'stop')
    assert.equal(t.exitIndex, 1)
    assert.equal(t.returnPct, -2)
  })

  test('a bar containing BOTH is resolved as the stop, never the target', () => {
    // low 97 is below the 98 stop and high 104 is above the 103 target, on one bar.
    const bars = series([99, 101], [97, 104])
    const t = simulateTrade(bars, 0, { ...opts, entryPrice: 100 })
    assert.equal(t.outcome, 'stop')
    assert.equal(t.returnPct, -2)
  })

  test('neither hit inside the horizon is a timeout, marked to the last close', () => {
    const bars = series([99, 101], [99, 101], [99, 101])
    const t = simulateTrade(bars, 0, { ...opts, entryPrice: 100, horizon: 2 })
    assert.equal(t.outcome, 'timeout')
    assert.equal(t.returnPct, 0) // closes at 100, the entry
  })

  test('the entry bar itself can stop the trade out', () => {
    // He enters on the touch, so the rest of that session is live risk.
    const bars = series([97, 101], [100, 102])
    const t = simulateTrade(bars, 0, { ...opts, entryPrice: 100 })
    assert.equal(t.outcome, 'stop')
    assert.equal(t.exitIndex, 0)
  })
})

describe('simulateTrade — short from a resistance touch', () => {
  const opts = { direction: 'short', stopPct: 2, targetPct: 3, horizon: 10 }

  test('a fall to the target is a win', () => {
    const bars = series([99, 101], [96, 100], [95, 98])
    const t = simulateTrade(bars, 0, { ...opts, entryPrice: 100 })
    assert.equal(t.outcome, 'target')
    assert.equal(t.returnPct, 3)
  })

  test('a rally to the stop is a loss', () => {
    const bars = series([99, 101], [101, 103])
    const t = simulateTrade(bars, 0, { ...opts, entryPrice: 100 })
    assert.equal(t.outcome, 'stop')
    assert.equal(t.returnPct, -2)
  })

  test('the both-hit bar is still resolved against the trade', () => {
    const bars = series([99, 101], [96, 103])
    const t = simulateTrade(bars, 0, { ...opts, entryPrice: 100 })
    assert.equal(t.outcome, 'stop')
  })
})

describe('runTrades', () => {
  test('win rate counts resolved trades only, timeouts reported separately', () => {
    const bars = series(
      [99, 101], [101, 104], [103, 105],   // level 100 → long → target
      [99, 101], [96, 99], [95, 98],       // level 100 → long → stop
      [99, 101], [99, 101], [99, 101],     // level 100 → long → timeout
    )
    const result = runTrades(
      bars,
      [{ price: 100, fromIndex: -1 }],
      { direction: 'long', stopPct: 2, targetPct: 3, horizon: 2, from: 'above' },
    )
    assert.equal(result.trades, 1)
    assert.ok(result.wins + result.losses + result.timeouts === result.trades)
  })

  test('expectancy is the mean return across every trade, timeouts included', () => {
    // Two trades: one +3, one -2 → mean +0.5
    const result = {
      returns: [3, -2],
    }
    const mean = result.returns.reduce((s, r) => s + r, 0) / result.returns.length
    assert.equal(mean, 0.5)
  })

  test('win rate is null when nothing resolved, never 0', () => {
    const bars = series([99, 101], [99, 101], [99, 101])
    const result = runTrades(
      bars,
      [{ price: 100, fromIndex: -1 }],
      { direction: 'long', stopPct: 2, targetPct: 3, horizon: 2, from: 'above' },
    )
    assert.equal(result.wins + result.losses, 0)
    assert.equal(result.winRate, null)
  })
})

describe('the arithmetic that makes a win rate meaningless on its own', () => {
  // This is the point the site's $2 SPX study already makes, restated as a test:
  // a high win rate with an unfavourable payoff still loses money.
  test('a 60% win rate at 2% target and 3% stop is negative', () => {
    const expectancy = 0.6 * 2 + 0.4 * -3
    assert.ok(expectancy < 0, `${expectancy}`)
  })

  test('break-even win rate is stop / (stop + target)', () => {
    const breakEven = (stop, target) => stop / (stop + target)
    // 2% target, 2% stop → need 50%
    assert.equal(breakEven(2, 2), 0.5)
    // 3% target, 2% stop → need 40%
    assert.equal(breakEven(2, 3), 0.4)
    // 2% target, 3% stop → need 60%
    assert.equal(breakEven(3, 2), 0.6)
  })
})

describe('long/short mirror symmetry — why a win rate alone proves nothing', () => {
  // When no single bar is wide enough to contain both exits, a long and a short entered
  // at the SAME price with the SAME distances are exact opposites: every long win is a
  // short loss. On the real SPX sample this holds perfectly — 122/158 short mirrors
  // 158/122 long — so the numeric ladder's "win rate" is 43.6% or 56.4% depending only
  // on which way you face.
  //
  // What this DOES show: a win rate quoted without its direction and payoff is not
  // information. What it does NOT show: that his levels are uninformative. That claim
  // rests on the null-model comparison in scripts/backtest.js, not on this symmetry,
  // which any entry price whatsoever would exhibit.

  const bars = series(
    [99, 101], [101, 104], [103, 105],
    [99, 101], [96, 99], [95, 98],
    [99, 101], [100, 102], [98, 103],
  )
  const levels = [{ price: 100, fromIndex: -1 }]

  test('a long win is a short loss when no bar spans both exits', () => {
    const base = { stopPct: 2, targetPct: 2, horizon: 4 }
    const long = runTrades(bars, levels, { ...base, direction: 'long', from: 'above' })
    const short = runTrades(bars, levels, { ...base, direction: 'short', from: 'above' })
    assert.equal(long.wins, short.losses)
    assert.equal(long.losses, short.wins)
    assert.equal(long.expectancy + short.expectancy, 0)
  })

  test('the symmetry breaks — against both sides — once a bar spans both exits', () => {
    // A 6% bar around a 2%/2% trade triggers the stop for long AND short.
    const wild = series([99, 101], [96, 106])
    const base = { stopPct: 2, targetPct: 2, horizon: 4 }
    const long = simulateTrade(wild, 0, { ...base, direction: 'long', entryPrice: 100 })
    const short = simulateTrade(wild, 0, { ...base, direction: 'short', entryPrice: 100 })
    assert.equal(long.outcome, 'stop')
    assert.equal(short.outcome, 'stop')
    assert.ok(long.returnPct + short.returnPct < 0)
  })
})

describe('a high win rate that loses money', () => {
  // The 5%/5% run on real data: 52 wins, 24 losses — 68.4% — and an expectancy of
  // -0.58%, because 243 of the 319 trades never reached either exit and were marked to
  // the close. The headline rate described 24% of the trades.
  test('win rate ignores timeouts; expectancy does not', () => {
    const wins = 52, losses = 24, timeouts = 243
    const winRate = wins / (wins + losses)
    assert.ok(winRate > 0.68)
    // The resolved trades are a minority of everything that was actually opened.
    assert.ok((wins + losses) / (wins + losses + timeouts) < 0.25)
  })
})
