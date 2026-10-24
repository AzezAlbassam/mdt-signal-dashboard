// Turning levels into trades, so the win rate has a definite meaning.
//
// His exit rule, 2024-10-06: "الوقف ثابت و الهدف متغير" — fixed stop, variable target,
// with a target of 2–3% for a scalper in the Saudi market.
//
// Intrabar ambiguity is resolved AGAINST the trade throughout: when a single bar's range
// contains both the stop and the target, the stop is taken. Daily bars do not record the
// order of the high and the low, and a backtest that guesses in its own favour on exactly
// the most volatile bars is not measuring anything.

import { firstTouch } from './reversal.js'

const tidy = (n) => Math.round(n * 1e8) / 1e8

/**
 * Walk one trade forward from its entry bar until the stop or the target is reached.
 * Evaluation starts ON the entry bar — he enters at the touch, so the remainder of that
 * session is live risk.
 */
export function simulateTrade(
  bars,
  entryIndex,
  { direction = 'long', entryPrice, stopPct, targetPct, horizon = 20 } = {},
) {
  if (direction !== 'long' && direction !== 'short') {
    throw new RangeError(`direction must be 'long' or 'short', got ${direction}`)
  }

  const long = direction === 'long'
  const stop = long ? entryPrice * (1 - stopPct / 100) : entryPrice * (1 + stopPct / 100)
  const target = long ? entryPrice * (1 + targetPct / 100) : entryPrice * (1 - targetPct / 100)

  const end = Math.min(bars.length - 1, entryIndex + horizon)

  for (let i = entryIndex; i <= end; i += 1) {
    const hitStop = long ? bars[i].low <= stop : bars[i].high >= stop
    const hitTarget = long ? bars[i].high >= target : bars[i].low <= target

    // Stop first on an ambiguous bar — see the note above.
    if (hitStop) {
      return { outcome: 'stop', exitIndex: i, returnPct: -stopPct }
    }
    if (hitTarget) {
      return { outcome: 'target', exitIndex: i, returnPct: targetPct }
    }
  }

  const exitPrice = bars[end].close
  const raw = long
    ? ((exitPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - exitPrice) / entryPrice) * 100

  return { outcome: 'timeout', exitIndex: end, returnPct: tidy(raw) }
}

/**
 * Run one trade per level and aggregate.
 *
 * `winRate` counts resolved trades only — a trade that never reached either exit is
 * evidence about neither. It is null rather than 0 when nothing resolved.
 * `expectancy` is the mean return across every trade, timeouts included, because a
 * position that sat open and went nowhere still consumed capital.
 */
export function runTrades(
  bars,
  levels,
  { direction = 'long', from = 'above', stopPct = 2, targetPct = 3, horizon = 20 } = {},
) {
  const returns = []
  let wins = 0
  let losses = 0
  let timeouts = 0

  for (const level of levels) {
    const price = level.price ?? level
    const startIndex = (level.fromIndex ?? -1) + 1
    const entryIndex = firstTouch(bars, price, { from, startIndex })
    if (entryIndex === null) continue

    const trade = simulateTrade(bars, entryIndex, {
      direction,
      entryPrice: price,
      stopPct,
      targetPct,
      horizon,
    })

    returns.push(trade.returnPct)
    if (trade.outcome === 'target') wins += 1
    else if (trade.outcome === 'stop') losses += 1
    else timeouts += 1
  }

  const resolved = wins + losses

  return {
    trades: returns.length,
    wins,
    losses,
    timeouts,
    winRate: resolved === 0 ? null : wins / resolved,
    expectancy:
      returns.length === 0 ? null : tidy(returns.reduce((s, r) => s + r, 0) / returns.length),
    returns,
  }
}
