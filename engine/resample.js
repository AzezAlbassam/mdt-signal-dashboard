// Aggregate daily bars up to weekly or monthly.
//
// Intraday data is not available on this data plan, so his rules can only be tested at
// daily and above. Anything he posts on 5-minute or 1-hour charts is therefore outside
// what was measured here, and the results say so rather than extrapolating.

/** ISO-ish week key: the Monday of the week the date falls in. */
function weekKey(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

const KEYS = {
  weekly: weekKey,
  monthly: (iso) => iso.slice(0, 7),
}

export function resample(bars, timeframe = 'daily') {
  if (timeframe === 'daily') return bars
  const keyOf = KEYS[timeframe]
  if (!keyOf) {
    throw new RangeError(`unsupported timeframe: ${timeframe}`)
  }

  const out = []
  let current = null
  let currentKey = null

  for (const b of bars) {
    const key = keyOf(b.date)
    if (key !== currentKey) {
      if (current) out.push(current)
      currentKey = key
      current = { date: b.date, open: b.open, high: b.high, low: b.low, close: b.close }
    } else {
      current.high = Math.max(current.high, b.high)
      current.low = Math.min(current.low, b.low)
      current.close = b.close
    }
  }
  if (current) out.push(current)

  return out
}
