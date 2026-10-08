// Measures the claim "زيرو انعكاس" (zero reversal) against price data.
//
// The claim is that price reaches a level and turns there, from the first touch,
// with essentially no penetration past it. That decomposes into two numbers per touch:
//
//   penetrationPct — how far past the level price went, as % of the level
//   excursionPct   — how far it then travelled back away from the level, as % of the level
//
// A zero reversal is small penetration AND large excursion. Either alone is worthless:
// price that stops dead at a level and then does nothing has not reversed, and price
// that blows through and comes back has not respected the level.
//
// MEASUREMENT CAVEAT, stated once here rather than hidden: a daily bar records a high
// and a low but not their order within the session, so for the bar that does the
// touching we cannot know whether the low came before or after the high. Both
// quantities are therefore measured over the window INCLUDING the touch bar. This is
// the choice that flatters the method slightly — it can only add excursion — so any
// negative result below is not an artefact of it.

const pct = (delta, level) => (delta / level) * 100

/**
 * Index of the first bar that reaches `level`, or null.
 * `from: 'below'` treats it as resistance (needs high >= level);
 * `from: 'above'` treats it as support (needs low <= level).
 */
export function firstTouch(bars, level, { from = 'below', startIndex = 0 } = {}) {
  for (let i = Math.max(0, startIndex); i < bars.length; i += 1) {
    if (from === 'below' ? bars[i].high >= level : bars[i].low <= level) {
      return i
    }
  }
  return null
}

/**
 * Score a single touch. Returns penetration and excursion as percentages of the level,
 * plus the boolean verdict when thresholds are supplied.
 */
export function classifyTouch(
  bars,
  touchIndex,
  level,
  { from = 'below', horizon = 20, maxPenetrationPct = null, minExcursionPct = null } = {},
) {
  const end = Math.min(bars.length - 1, touchIndex + horizon)

  let maxHigh = -Infinity
  let minLow = Infinity
  for (let i = touchIndex; i <= end; i += 1) {
    if (bars[i].high > maxHigh) maxHigh = bars[i].high
    if (bars[i].low < minLow) minLow = bars[i].low
  }

  // Resistance: overshoot is above, the reversal runs down. Support is the mirror.
  const penetrationPct =
    from === 'below'
      ? Math.max(0, pct(maxHigh - level, level))
      : Math.max(0, pct(level - minLow, level))

  const excursionPct =
    from === 'below'
      ? Math.max(0, pct(level - minLow, level))
      : Math.max(0, pct(maxHigh - level, level))

  const isZeroReversal =
    maxPenetrationPct === null || minExcursionPct === null
      ? null
      : penetrationPct <= maxPenetrationPct && excursionPct >= minExcursionPct

  return { touchIndex, penetrationPct, excursionPct, isZeroReversal }
}

/**
 * Score a set of levels over a series.
 *
 * Each level carries `fromIndex` — the bar it was derived from — so it is only ever
 * tested against bars after its own anchor. Scoring a level against the data that
 * produced it is the single easiest way to manufacture a fake edge, and it is exactly
 * what a chart marked up after the fact does.
 *
 * Untouched levels are excluded from the rate rather than counted as failures: a level
 * price never reached is evidence of nothing.
 */
export function scoreLevels(
  bars,
  levels,
  { from = 'below', horizon = 20, maxPenetrationPct = 0.5, minExcursionPct = 2 } = {},
) {
  const touches = []

  for (const level of levels) {
    const price = level.price ?? level
    const startIndex = (level.fromIndex ?? 0) + 1
    const touchIndex = firstTouch(bars, price, { from, startIndex })
    if (touchIndex === null) continue

    touches.push({
      price,
      ...classifyTouch(bars, touchIndex, price, {
        from,
        horizon,
        maxPenetrationPct,
        minExcursionPct,
      }),
    })
  }

  const reversed = touches.filter((t) => t.isZeroReversal).length

  return {
    levels: levels.length,
    touched: touches.length,
    reversed,
    rate: touches.length === 0 ? null : reversed / touches.length,
    touches,
  }
}
