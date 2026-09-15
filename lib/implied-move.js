/**
 * The expected-move maths.
 *
 * A band is a close, a volatility and a horizon: the market's one-standard-deviation
 * guess at how far price travels before that horizon ends. Two families are plotted
 * against each other. The plain family prices the expiry itself, so it reacts to
 * events. The iVol family reads a smooth volatility series, so it does not. The gap
 * between them is the zone that gets traded.
 *
 * Pure functions only. Nothing here reads a file or a clock.
 */

import {
  nextTradingDay, sessionsBetween, weekExpiry, tradingDaysInMonth,
} from './calendar.js'

/** Volatility is quoted per annum on a 365-day year. */
export const DAY_BASIS = 365

/**
 * The model, gathered in one place. Two values here are fitted rather than
 * observed, and each is a single flag to flip once a live option chain settles it.
 *
 *  - straddleMultiplier: whether the plain family plots the whole at-the-money
 *    straddle (1) or a fraction of it. The screenshots cannot separate a straddle
 *    from a volatility times root time, because the two differ by a constant that
 *    the unknown volatility absorbs.
 *  - weeklyDayCount: 'calendar' counts real sessions from the anchor to the expiry,
 *    which gives five in a normal week and four in a holiday week. The fixtures
 *    are also consistent with a fixed five.
 */
export const MODEL = {
  dayBasis: DAY_BASIS,
  straddleMultiplier: 1,
  weeklyDayCount: 'calendar',
  horizons: ['daily', 'weekly', 'monthly'],
}

const cents = (x) => Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100

/**
 * One side of a band, in dollars.
 * @param {{close:number, iv:number, days:number, dayBasis?:number}} args
 *   iv is a decimal, so 15% is 0.15.
 */
export function halfWidth ({ close, iv, days, dayBasis = DAY_BASIS }) {
  if (!(close > 0)) throw new RangeError(`close must be positive, got ${close}`)
  if (!(iv >= 0)) throw new RangeError(`iv must not be negative, got ${iv}`)
  if (!(days >= 0)) throw new RangeError(`days must not be negative, got ${days}`)
  if (!(dayBasis > 0)) throw new RangeError(`dayBasis must be positive, got ${dayBasis}`)
  return close * iv * Math.sqrt(days / dayBasis)
}

/** The volatility a band of this width implies. The exact inverse of halfWidth. */
export function impliedVol ({ close, halfWidth: h, days, dayBasis = DAY_BASIS }) {
  if (!(close > 0)) throw new RangeError(`close must be positive, got ${close}`)
  if (!(days > 0)) throw new RangeError(`days must be positive, got ${days}`)
  if (!(dayBasis > 0)) throw new RangeError(`dayBasis must be positive, got ${dayBasis}`)
  return h / (close * Math.sqrt(days / dayBasis))
}

/** A band as plotted: symmetric about the centre, both edges on whole cents. */
export function band (center, half) {
  const h = cents(Math.abs(half))
  const c = cents(center)
  return { center: c, halfWidth: h, upper: cents(c + h), lower: cents(c - h) }
}

/** The interval between the two lines on one side. Order does not matter. */
export function zone (a, b) {
  const low = cents(Math.min(a, b))
  const high = cents(Math.max(a, b))
  return { low, high, width: cents(high - low) }
}

/** Both zones for a horizon, given the plain band and the iVol band. */
export function zones (plain, ivol) {
  return {
    upper: zone(plain.upper, ivol.upper),
    lower: zone(plain.lower, ivol.lower),
  }
}

/**
 * How many sessions a horizon spans, measured from the close it hangs on.
 *
 *  daily   the next session
 *  weekly  the anchor Friday through the last session of the following week
 *  monthly every session of the month that follows the anchor
 */
export function horizonDays (horizon, anchorDate) {
  switch (horizon) {
    case 'daily':
      return sessionsBetween(anchorDate, nextTradingDay(anchorDate)).length - 1
    case 'weekly': {
      if (MODEL.weeklyDayCount !== 'calendar') return MODEL.weeklyDayCount
      return sessionsBetween(anchorDate, weekExpiry(anchorDate)).length - 1
    }
    case 'monthly': {
      const first = nextTradingDay(anchorDate)
      return tradingDaysInMonth(+first.slice(0, 4), +first.slice(5, 7))
    }
    default:
      throw new RangeError(`unknown horizon ${JSON.stringify(horizon)}`)
  }
}

/** The end of a horizon, as a session date. */
export function horizonExpiry (horizon, anchorDate) {
  switch (horizon) {
    case 'daily': return nextTradingDay(anchorDate)
    case 'weekly': return weekExpiry(anchorDate)
    case 'monthly': {
      const first = nextTradingDay(anchorDate)
      const y = +first.slice(0, 4)
      const m = +first.slice(5, 7)
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
      let d = `${y}-${String(m).padStart(2, '0')}-${last}`
      const all = sessionsBetween(`${y}-${String(m).padStart(2, '0')}-01`, d)
      return all[all.length - 1]
    }
    default: throw new RangeError(`unknown horizon ${JSON.stringify(horizon)}`)
  }
}

/** A full band for one horizon from a volatility. */
export function bandFor ({ horizon, anchorDate, anchorClose, iv }) {
  const days = horizonDays(horizon, anchorDate)
  return {
    horizon,
    anchorDate,
    expiry: horizonExpiry(horizon, anchorDate),
    days,
    iv,
    ...band(anchorClose, halfWidth({ close: anchorClose, iv, days })),
  }
}

/** A full band for one horizon from a straddle price. */
export function bandForStraddle ({ horizon, anchorDate, anchorClose, straddle }) {
  const days = horizonDays(horizon, anchorDate)
  const half = MODEL.straddleMultiplier * straddle
  return {
    horizon,
    anchorDate,
    expiry: horizonExpiry(horizon, anchorDate),
    days,
    straddle,
    iv: impliedVol({ close: anchorClose, halfWidth: half, days }),
    ...band(anchorClose, half),
  }
}
