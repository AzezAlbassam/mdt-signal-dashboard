/**
 * Building the five expected-move families from one option chain and the
 * closes we hold.
 *
 * Two families are plotted per horizon. The plain family prices the expiry
 * itself, so it reacts to a CPI print or a Fed meeting. The iVol family reads a
 * constant-maturity volatility, so it does not. The interval between them is
 * the zone that gets traded, and it is widest exactly when the front expiry is
 * calm relative to the thirty-day curve.
 */

import {
  nextTradingDay, weekExpiry, lastSessionOfWeek, lastTradingDayOfMonth,
} from './calendar.js'
import { horizonDays, halfWidth, band, zones, outerBand, MODEL } from './implied-move.js'
import { expiriesIn, atmQuote, quotableStrikes } from './cboe-chain.js'

export const FAMILIES = ['ivolDaily', 'plainDaily', 'ivolWeekly', 'plainWeekly', 'plainMonthly']

/** The tenor the iVol family reads, in calendar days. */
export const IVOL_TENOR_DAYS = 30

/**
 * The outer band is two standard deviations. Over a decade of SPY sessions it
 * contained the intraday range 90 per cent of the time and was closed through
 * on about 5 per cent of sessions; after a close through the inner band it was
 * reached within that session or the next 57.5 per cent of the time (n=783),
 * which is what makes it a target rather than a decoration.
 */
export const OUTER_SIGMA = 2

/** The ATM straddle is this fraction of a one-standard-deviation move. */
export const STRADDLE_OVER_SIGMA = Math.sqrt(2 / Math.PI)

const DAY = 86400000
const calendarDays = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)

/**
 * Which close each family hangs on, taken from the closes actually held.
 * The clock is never consulted: a band rolls when its close arrives, and the
 * vendor's own roll has been observed both before and after the same wall time.
 */
export function resolveAnchors (availableCloses) {
  const dates = [...availableCloses].sort()
  const latest = (predicate) => {
    for (let i = dates.length - 1; i >= 0; i--) if (predicate(dates[i])) return dates[i]
    return null
  }
  return {
    daily: dates.length ? dates[dates.length - 1] : null,
    weekly: latest((d) => lastSessionOfWeek(d) === d),
    monthly: latest((d) => lastTradingDayOfMonth(+d.slice(0, 4), +d.slice(5, 7)) === d),
  }
}

/** The at-the-money volatility of every quotable expiry, by calendar tenor. */
export function termStructure (chain, asOf) {
  const points = []
  for (const expiry of expiriesIn(chain)) {
    const days = calendarDays(asOf, expiry)
    if (days <= 0) continue
    let quote
    try {
      if (quotableStrikes(chain, expiry).length === 0) continue
      quote = atmQuote(chain, expiry)
    } catch { continue }
    if (quote.iv == null) continue
    points.push({ expiry, days, iv: quote.iv, strike: quote.strike, forward: quote.forward })
  }
  return points.sort((a, b) => a.days - b.days)
}

/**
 * Volatility at a tenor, interpolated in total variance because that is what is
 * additive in time. Outside the listed range it clamps rather than
 * extrapolating, so a thin chain cannot invent a number.
 */
export function sigmaAt (chain, asOf, days, curve = termStructure(chain, asOf)) {
  if (curve.length === 0) throw new Error('term structure is empty; cannot read a volatility')
  if (days <= curve[0].days) return curve[0].iv
  const last = curve[curve.length - 1]
  if (days >= last.days) return last.iv
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]
    const b = curve[i]
    if (days > b.days) continue
    const va = a.iv * a.iv * a.days
    const vb = b.iv * b.iv * b.days
    const v = va + ((vb - va) * (days - a.days)) / (b.days - a.days)
    return Math.sqrt(v / days)
  }
  return last.iv
}

/** The expiry each horizon runs to, given the close it hangs on. */
export function expiryFor (horizon, anchorDate) {
  switch (horizon) {
    case 'daily':
      return nextTradingDay(anchorDate)
    case 'weekly':
      return lastSessionOfWeek(anchorDate) === anchorDate
        ? weekExpiry(anchorDate)
        : lastSessionOfWeek(anchorDate)
    case 'monthly': {
      const next = nextTradingDay(anchorDate)
      return lastTradingDayOfMonth(+next.slice(0, 4), +next.slice(5, 7))
    }
    default: throw new RangeError(`unknown horizon ${JSON.stringify(horizon)}`)
  }
}

const HORIZON_OF = {
  ivolDaily: 'daily', plainDaily: 'daily',
  ivolWeekly: 'weekly', plainWeekly: 'weekly',
  plainMonthly: 'monthly',
}

/**
 * Build every family.
 * @param {{closes:Object<string,number>, chain:object, asOf:string,
 *          skipMonthly?:boolean}} args
 */
export function buildFamilies ({ closes, chain, asOf, skipMonthly = false }) {
  const anchors = resolveAnchors(Object.keys(closes))
  const curve = termStructure(chain, asOf)
  const out = {}

  for (const key of FAMILIES) {
    const horizon = HORIZON_OF[key]
    const anchorDate = anchors[horizon]
    if (!anchorDate || (horizon === 'monthly' && skipMonthly)) { out[key] = null; continue }
    const anchorClose = closes[anchorDate]
    const expiry = expiryFor(horizon, anchorDate)
    const days = horizonDays(horizon, anchorDate)
    const tCal = calendarDays(anchorDate, expiry)

    if (key.startsWith('ivol')) {
      const iv = sigmaAt(chain, asOf, IVOL_TENOR_DAYS, curve)
      const h = halfWidth({ close: anchorClose, iv, days })
      const inner = band(anchorClose, h)
      out[key] = {
        family: key, horizon, anchorDate, anchorClose, expiry, days, tCal,
        iv, source: `constant-maturity ${IVOL_TENOR_DAYS}-day at-the-money volatility`,
        ...inner,
        outer: outerBand(inner, OUTER_SIGMA),
      }
      continue
    }

    let quote = null
    try { quote = atmQuote(chain, expiry) } catch { quote = null }
    if (!quote) { out[key] = null; continue }

    // Every reading of the chart is computed and kept, whichever one is
    // published, so the archive can settle the question without a refetch.
    const sigmaCalendar = quote.forward * quote.iv * Math.sqrt(tCal / MODEL.dayBasis)
    const candidates = {
      straddleRaw: quote.straddle,
      straddleModel: STRADDLE_OVER_SIGMA * sigmaCalendar,
      sigmaCalendar,
      sigmaFixed: quote.forward * quote.iv * Math.sqrt(days / MODEL.dayBasis),
      /**
       * Sessions of variance the quoted straddle actually carries, backed out
       * of its own at-the-money volatility. Over a weekend this lands near one
       * rather than near three, which is the evidence that horizons should be
       * counted in sessions rather than calendar days.
       */
      effectiveDays: MODEL.dayBasis * ((quote.straddle /
        (STRADDLE_OVER_SIGMA * quote.forward * quote.iv)) ** 2),
    }
    const h = MODEL.straddleMultiplier * candidates.straddleRaw
    out[key] = {
      family: key, horizon, anchorDate, anchorClose, expiry, days, tCal,
      iv: quote.iv, source: `at-the-money straddle of the ${expiry} expiry`,
      strike: quote.strike, forward: quote.forward,
      straddleSpread: quote.straddleSpread,
      candidates, halfWidth: h, ...band(anchorClose, h),
    }
  }

  // Attach the zone each plain family forms with its iVol counterpart.
  for (const [plain, ivol] of [['plainDaily', 'ivolDaily'], ['plainWeekly', 'ivolWeekly']]) {
    if (out[plain] && out[ivol]) out[plain].zone = zones(out[plain], out[ivol])
  }
  if (out.plainMonthly) out.plainMonthly.zone = null
  return out
}
