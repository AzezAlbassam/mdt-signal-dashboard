/**
 * Assembling one evening's record.
 *
 * Pure: it takes the closes, a parsed chain and the previous record, and
 * returns the row to be written. Fetching and writing live in the script that
 * calls this, so the whole assembly is testable without a network.
 *
 * Three rules shape the output. A run that could not fetch is still a row, or
 * the history silently biases toward the calm days when the feed was healthy.
 * A plain half width set at a roll is carried forward rather than recomputed,
 * because that is what the chart does. And the previous session is scored only
 * against bands published before it.
 */

import { etParts } from './calendar.js'
import { MODEL } from './implied-move.js'
import { buildFamilies, FAMILIES, IVOL_TENOR_DAYS } from './bands.js'
import { expiriesIn } from './cboe-chain.js'
import { scoreBand } from './score.js'

export const SCHEMA_VERSION = 1

/** How far the live spot may sit from the anchor close before the run is void. */
export const MAX_SPOT_DRIFT = 0.015

const PLAIN = FAMILIES.filter((f) => f.startsWith('plain'))

/** JSON with sorted keys and a trailing newline, so a commit shows real changes only. */
export function stableJson (value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort)
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]))
    }
    return v
  }
  return JSON.stringify(sort(value), null, 2) + '\n'
}

/** A short stable digest of the config, so a silent parameter change is visible. */
export function configHash (config) {
  const text = stableJson(config)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const currentConfig = (symbol, roots) => ({
  symbol,
  roots,
  dayBasis: MODEL.dayBasis,
  straddleMultiplier: MODEL.straddleMultiplier,
  weeklyDayCount: MODEL.weeklyDayCount,
  ivolTenorDays: IVOL_TENOR_DAYS,
  plainMode: 'straddle',
  maxSpotDrift: MAX_SPOT_DRIFT,
})

/**
 * @param {{closes:Object<string,number>, chain:object|null, capturedAt:string,
 *          symbol?:string, bars?:Object<string,object>, previous?:object|null,
 *          failure?:string}} args
 */
export function buildSnapshot ({ closes, chain, capturedAt, symbol = 'SPY', bars = {}, previous = null, failure = null }) {
  const config = currentConfig(symbol, chain?.roots ?? null)
  const dates = Object.keys(closes).sort()
  const asOf = dates.length ? dates[dates.length - 1] : null
  const base = {
    schema: SCHEMA_VERSION,
    symbol,
    capturedAt,
    capturedEt: etParts(capturedAt),
    asOf,
    config,
    configHash: configHash(config),
    bands: null,
    scored: null,
    source: null,
    reason: null,
  }

  if (failure || !chain) {
    return { ...base, status: 'missing', reason: failure ?? 'no chain available' }
  }

  const anchorClose = closes[asOf]
  const drift = chain.spot != null && anchorClose ? chain.spot / anchorClose - 1 : 0
  const source = {
    chainTimestamp: chain.timestamp,
    spot: chain.spot,
    prevClose: chain.prevClose,
    vendorIv30: chain.vendorIv30,
    rejected: chain.rejected,
    expiries: expiriesIn(chain),
    spotDrift: drift,
  }

  if (Math.abs(drift) > MAX_SPOT_DRIFT) {
    return {
      ...base,
      status: 'stale',
      source,
      reason: `chain spot ${chain.spot} drifts ${(drift * 100).toFixed(2)}% from the ${asOf} close of ${anchorClose}, beyond the ${(MAX_SPOT_DRIFT * 100).toFixed(1)}% limit`,
    }
  }

  const built = buildFamilies({ closes, chain, asOf })
  const bands = {}
  for (const key of FAMILIES) {
    const b = built[key]
    if (!b) { bands[key] = null; continue }
    const frozen = PLAIN.includes(key)
    const carried = frozen && previous?.bands?.[key]?.anchorDate === b.anchorDate
      ? previous.bands[key]
      : null
    bands[key] = carried
      ? { ...b, halfWidth: carried.halfWidth, upper: carried.upper, lower: carried.lower, frozen: true, carriedFrom: previous.asOf }
      : { ...b, frozen }
  }

  return { ...base, status: 'ok', source, bands, scored: scorePrevious(previous, bars, asOf) }
}

/** Grade the bands published at the previous close against the session that followed. */
function scorePrevious (previous, bars, asOf) {
  if (!previous?.bands || !previous.asOf || previous.asOf >= asOf) return null
  const bar = bars[asOf]
  if (!bar) return null
  const out = { session: asOf, anchorDate: previous.asOf }
  let any = false
  for (const key of FAMILIES) {
    const b = previous.bands[key]
    if (!b || b.upper == null || b.lower == null) continue
    if (!(b.anchorDate < asOf)) continue
    out[key] = scoreBand(
      { anchorDate: b.anchorDate, center: b.center ?? b.anchorClose, halfWidth: b.halfWidth, upper: b.upper, lower: b.lower },
      bar)
    any = true
  }
  return any ? out : null
}
