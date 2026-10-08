// The forward log: validating logged calls and resolving them against price data.
//
// The thresholds live in PROTOCOL.md and were fixed before any call was logged. Nothing
// here may be tuned after seeing results — that is the one rule that makes the exercise
// worth running at all.

import { classifyTouch } from './reversal.js'

const CLASSES = ['forward_call', 'retrospective', 'promo', 'ambiguous']

/**
 * Enforce the log schema. Throws rather than coercing: a half-filled entry silently
 * accepted now is an unauditable row in three weeks.
 */
export function validateCall(call) {
  if (!call || typeof call !== 'object') {
    throw new TypeError('call must be an object')
  }
  for (const field of ['tweetId', 'postedAt', 'rawText', 'klass', 'klassReason']) {
    if (!call[field] || String(call[field]).trim() === '') {
      throw new TypeError(`call.${field} is required and must be non-empty`)
    }
  }
  if (!CLASSES.includes(call.klass)) {
    throw new RangeError(`call.klass must be one of ${CLASSES.join(', ')}, got ${call.klass}`)
  }
  if (Number.isNaN(Date.parse(call.postedAt))) {
    throw new TypeError(`call.postedAt must be a parseable date, got ${call.postedAt}`)
  }
  if (call.klass === 'forward_call') {
    const hasLevels = Array.isArray(call.levels) && call.levels.length > 0
    if (!hasLevels && !call.direction) {
      throw new TypeError('a forward_call needs at least one level or a direction')
    }
  }
  return call
}

/** First bar on or after an ISO date, or null past the end of the series. */
export function indexOnOrAfter(bars, isoDate) {
  const target = isoDate.slice(0, 10)
  for (let i = 0; i < bars.length; i += 1) {
    if (bars[i].date >= target) return i
  }
  return null
}

/**
 * Score one logged call.
 *
 * A level counts as TOUCHED when price trades within `tolerancePct` of it inside the
 * horizon, and as REVERSED when it then turns there within the pre-registered
 * penetration and excursion bounds — the same definition used throughout this repo,
 * so his live calls and his backtested rules are judged by one standard.
 *
 * Outcomes: hit (every level reversed), partial (some), miss (none, horizon elapsed),
 * unresolved (horizon still open), not_scored (not a forward call).
 */
export function resolveCall(
  bars,
  call,
  { tolerancePct = 0.1, maxPenetrationPct = 0.5, minExcursionPct = 1.0 } = {},
) {
  if (call.klass !== 'forward_call') {
    return { outcome: 'not_scored', levels: [] }
  }

  const start = indexOnOrAfter(bars, call.postedAt)
  if (start === null) {
    return { outcome: 'unresolved', levels: [], note: 'no price data at or after the post' }
  }

  const horizon = call.horizonDays ?? 5
  const end = start + horizon
  const horizonElapsed = end <= bars.length - 1
  const last = Math.min(end, bars.length - 1)

  const reference = bars[start].open
  const levels = (call.levels ?? []).map((level) => {
    const from = level >= reference ? 'below' : 'above'
    const band = level * (tolerancePct / 100)

    let touchIndex = null
    for (let i = start; i <= last; i += 1) {
      const reached = from === 'below' ? bars[i].high >= level - band : bars[i].low <= level + band
      if (reached) { touchIndex = i; break }
    }

    if (touchIndex === null) {
      return { level, from, touched: false, reversed: false }
    }

    const t = classifyTouch(bars, touchIndex, level, {
      from,
      horizon,
      maxPenetrationPct,
      minExcursionPct,
    })

    return {
      level,
      from,
      touched: true,
      touchDate: bars[touchIndex].date,
      penetrationPct: Number(t.penetrationPct.toFixed(3)),
      excursionPct: Number(t.excursionPct.toFixed(3)),
      reversed: t.isZeroReversal === true,
    }
  })

  const reversed = levels.filter((l) => l.reversed).length

  let outcome
  if (reversed === levels.length && levels.length > 0) outcome = 'hit'
  else if (reversed > 0) outcome = 'partial'
  else if (horizonElapsed) outcome = 'miss'
  else outcome = 'unresolved'

  return { outcome, levels, horizonElapsed, scoredFrom: bars[start].date }
}
