#!/usr/bin/env node
/**
 * Backtest of the trade setups the expected-move bands produce.
 *
 * The iVol family can be rebuilt for any past session from the prior close and
 * the prior VIX close, so every setup below is measured on real SPY sessions.
 * The plain family needs a historical option chain, which is not available, so
 * the zone is approximated by the straddle constant (0.798 of the iVol width)
 * and is labelled as such.
 *
 *   node scripts/backtest.mjs            # prints the table and writes JSON
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { halfWidth, band, horizonDays } from '../lib/implied-move.js'
import { weekAnchor, weekExpiry, prevTradingDay } from '../lib/calendar.js'
import { scoreBand, scoreZone, wilson, summarise, THEORETICAL } from '../lib/score.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const market = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/market.json'), 'utf8'))
const S = market.sessions
const byDate = Object.fromEntries(S.map((s) => [s.date, s]))

/** The volatility the iVol family was observed to read, as a share of VIX. */
export const VIX_SHARE = 0.92
/** The straddle-to-sigma constant used to approximate the plain line. */
export const PLAIN_SCALE = Math.sqrt(2 / Math.PI)

const dailyBand = (prev) => {
  const iv = VIX_SHARE * prev.vix / 100
  const h = halfWidth({ close: prev.close, iv, days: horizonDays('daily', prev.date) })
  return { anchorDate: prev.date, ...band(prev.close, h) }
}
const weeklyBand = (anchor) => {
  const iv = VIX_SHARE * anchor.vix / 100
  const h = halfWidth({ close: anchor.close, iv, days: horizonDays('weekly', anchor.date) })
  return { anchorDate: anchor.date, expiry: weekExpiry(anchor.date), ...band(anchor.close, h) }
}

// ── daily
const daily = []
for (let i = 1; i < S.length; i++) {
  const b = dailyBand(S[i - 1])
  const r = scoreBand(b, S[i])
  const zoneLo = { anchorDate: b.anchorDate, side: 'lower', high: b.center - PLAIN_SCALE * b.halfWidth, low: b.lower }
  const zoneHi = { anchorDate: b.anchorDate, side: 'upper', low: b.center + PLAIN_SCALE * b.halfWidth, high: b.upper }
  daily.push({ ...r, band: b, session: S[i],
    zoneLower: { ...scoreZone(zoneLo, S[i]), ...zoneLo },
    zoneUpper: { ...scoreZone(zoneHi, S[i]), ...zoneHi } })
}

// ── weekly: one row per completed week
const weekly = []
const anchors = [...new Set(S.map((s) => weekAnchor(s.date)))].filter((a) => byDate[a])
for (const a of anchors) {
  const b = weeklyBand(byDate[a])
  const week = S.filter((s) => s.date > a && s.date <= b.expiry)
  if (week.length === 0 || week[week.length - 1].date !== b.expiry) continue // incomplete week
  const agg = { date: b.expiry, high: Math.max(...week.map((s) => s.high)),
    low: Math.min(...week.map((s) => s.low)), close: week[week.length - 1].close, open: week[0].open }
  weekly.push({ ...scoreBand(b, agg), band: b, week, agg })
}

// ── setups
const setups = {}
const rate = (rows, pred, label) => ({ label, ...summarise(rows, pred) })

// A. Fade a daily tag: price reaches the band and the session closes back inside.
const lowerTouched = daily.filter((r) => r.lower !== 'untouched')
const upperTouched = daily.filter((r) => r.upper !== 'untouched')
setups.fadeLower = rate(lowerTouched, (r) => r.lower === 'tagged', 'Lower band tagged, closes back inside')
setups.fadeUpper = rate(upperTouched, (r) => r.upper === 'tagged', 'Upper band tagged, closes back inside')
setups.fadeAny = rate([...lowerTouched, ...upperTouched],
  (r) => (r.lower !== 'untouched' ? r.lower : r.upper) === 'tagged', 'Either band tagged, closes back inside')
setups.fadeLowerToCenter = rate(lowerTouched, (r) => r.session.close >= r.band.center,
  'Lower band tagged, closes above the anchor')
setups.fadeUpperToCenter = rate(upperTouched, (r) => r.session.close <= r.band.center,
  'Upper band tagged, closes below the anchor')

// Z. The zone specifically (approximated): entered the lower zone, closed back above it.
const zoneLowerReached = daily.filter((r) => r.zoneLower.outcome !== 'untouched')
const zoneUpperReached = daily.filter((r) => r.zoneUpper.outcome !== 'untouched')
setups.zoneLowerFade = rate(zoneLowerReached, (r) => r.session.close > r.zoneLower.high,
  'Lower zone entered, closes back above the zone (approx.)')
setups.zoneUpperFade = rate(zoneUpperReached, (r) => r.session.close < r.zoneUpper.low,
  'Upper zone entered, closes back below the zone (approx.)')
setups.zoneLowerHeld = rate(zoneLowerReached, (r) => r.zoneLower.outcome === 'entered',
  'Lower zone entered and NOT crossed intraday (approx.)')
setups.zoneUpperHeld = rate(zoneUpperReached, (r) => r.zoneUpper.outcome === 'entered',
  'Upper zone entered and NOT crossed intraday (approx.)')

// B. Break then run: close beyond the daily band, then reach the weekly band
// on the same side before the week ends. The signal exists only at the close,
// so the break session's own high and low cannot be credited: that would be
// look-ahead. Only later sessions count. A touch on the break day itself is
// kept as a separate diagnostic.
// The weekly band in force DURING a session is the one anchored on the last
// session of the previous week. weekAnchor(date) answers "after this close",
// which on a Friday is the Friday itself, so it is asked about the prior session.
const weeklyFor = (date) => {
  const a = weekAnchor(prevTradingDay(date))
  return byDate[a] ? weeklyBand(byDate[a]) : null
}
const breaks = daily.filter((r) => r.lower === 'broken' || r.upper === 'broken')
const runRows = breaks.map((r) => {
  const side = r.lower === 'broken' ? 'lower' : 'upper'
  const wb = weeklyFor(r.session.date)
  if (!wb) return null
  const rest = S.filter((s) => s.date > r.session.date && s.date <= wb.expiry)
  const reached = side === 'lower'
    ? rest.some((s) => s.low <= wb.lower)
    : rest.some((s) => s.high >= wb.upper)
  const alreadyThere = side === 'lower' ? r.session.low <= wb.lower : r.session.high >= wb.upper
  return { ...r, side, wb, reached, alreadyThere, remaining: rest.length }
}).filter(Boolean)
setups.breakToWeekly = rate(runRows, (r) => r.reached, 'Daily band broken at the close, weekly band reached LATER that week')
setups.breakToWeeklyWithDaysLeft = rate(runRows.filter((r) => r.remaining > 0),
  (r) => r.reached, 'Same, only breaks with sessions left in the week')
setups.breakTouchedWeeklySameDay = rate(runRows, (r) => r.alreadyThere,
  'DIAGNOSTIC: break day itself already touched the weekly band (not tradeable)')

// C. Weekly fade: the week reaches its band and closes back inside.
const wkLower = weekly.filter((r) => r.lower !== 'untouched')
const wkUpper = weekly.filter((r) => r.upper !== 'untouched')
setups.weeklyFadeLower = rate(wkLower, (r) => r.lower === 'tagged', 'Weekly lower band reached, week closes back inside')
setups.weeklyFadeUpper = rate(wkUpper, (r) => r.upper === 'tagged', 'Weekly upper band reached, week closes back inside')
setups.weeklyFadeAny = rate([...wkLower, ...wkUpper],
  (r) => (r.lower !== 'untouched' ? r.lower : r.upper) === 'tagged', 'Either weekly band reached, week closes back inside')

// D. Continuation after a tag: the next session closes further beyond.
const nextOf = (date) => { const i = S.findIndex((s) => s.date === date); return S[i + 1] ?? null }
const lowerTagNext = lowerTouched.map((r) => ({ r, n: nextOf(r.session.date) })).filter((x) => x.n)
setups.afterLowerTagNextUp = rate(lowerTagNext, ({ r, n }) => n.close > r.session.close,
  'After a lower tag, the NEXT session closes higher')
const upperTagNext = upperTouched.map((r) => ({ r, n: nextOf(r.session.date) })).filter((x) => x.n)
setups.afterUpperTagNextDown = rate(upperTagNext, ({ r, n }) => n.close < r.session.close,
  'After an upper tag, the NEXT session closes lower')

// ── base rates the setups have to beat
const upDays = daily.map((r) => ({ r, n: nextOf(r.session.date) })).filter((x) => x.n)
setups.baseNextUp = rate(upDays, ({ r, n }) => n.close > r.session.close, 'BASE: any session, the NEXT session closes higher')
setups.baseNextDown = rate(upDays, ({ r, n }) => n.close < r.session.close, 'BASE: any session, the NEXT session closes lower')
// For a driftless path the reflection principle gives P(close back inside | touched) = 1/2 exactly.
const REFLECTION_FADE = 0.5
// Two-sided containment of a continuous path inside +/-1 sigma: simulated once here.
const pathContainment = (() => {
  let seed = 20260919; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const gauss = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
  const N = 60000, steps = 78, dt = 1 / steps
  let inside = 0
  for (let i = 0; i < N; i++) {
    let x = 0, ok = true
    for (let k = 0; k < steps; k++) { x += gauss() * Math.sqrt(dt); if (Math.abs(x) >= 1) { ok = false; break } }
    if (ok) inside++
  }
  return inside / N
})()

// ── calibration of the bands themselves
const calib = {
  daily: {
    n: daily.length,
    contained: summarise(daily, (r) => r.contained),
    lowerReached: summarise(daily, (r) => r.lower !== 'untouched'),
    upperReached: summarise(daily, (r) => r.upper !== 'untouched'),
    lowerBroken: summarise(daily, (r) => r.lower === 'broken'),
    upperBroken: summarise(daily, (r) => r.upper === 'broken'),
    meanAbsZ: daily.reduce((a, r) => a + Math.abs(r.z), 0) / daily.length,
    meanZ: daily.reduce((a, r) => a + r.z, 0) / daily.length,
  },
  weekly: {
    n: weekly.length,
    contained: summarise(weekly, (r) => r.contained),
    lowerReached: summarise(weekly, (r) => r.lower !== 'untouched'),
    upperReached: summarise(weekly, (r) => r.upper !== 'untouched'),
    meanAbsZ: weekly.reduce((a, r) => a + Math.abs(r.z), 0) / weekly.length,
    meanZ: weekly.reduce((a, r) => a + r.z, 0) / weekly.length,
  },
  theory: { ...THEORETICAL, pathContainment, fadeGivenTouch: REFLECTION_FADE },
}

const out = {
  generated: '2026-09-19',
  span: { from: S[0].date, to: S[S.length - 1].date, sessions: S.length },
  assumptions: {
    vixShare: VIX_SHARE, plainScale: PLAIN_SCALE,
    note: 'iVol bands rebuilt from the prior close and prior VIX close; the plain line is approximated by the straddle constant and every zone figure is marked approx.',
  },
  calibration: calib,
  setups,
  dailyRows: daily.map((r) => ({ date: r.session.date, anchor: r.anchorDate, lower: r.band.lower, upper: r.band.upper,
    low: r.session.low, high: r.session.high, close: r.session.close, lowerOutcome: r.lower, upperOutcome: r.upper,
    contained: r.contained, z: +r.z.toFixed(4), zoneLower: r.zoneLower.outcome, zoneUpper: r.zoneUpper.outcome })),
  breakRows: runRows.map((r) => ({ date: r.session.date, side: r.side, weeklyAnchor: r.wb.anchorDate,
    weeklyLevel: r.side === 'lower' ? r.wb.lower : r.wb.upper, reached: r.reached, alreadyThere: r.alreadyThere })),
  weeklyRows: weekly.map((r) => ({ anchor: r.anchorDate, expiry: r.band.expiry, lower: r.band.lower, upper: r.band.upper,
    low: r.agg.low, high: r.agg.high, close: r.agg.close, lowerOutcome: r.lower, upperOutcome: r.upper, contained: r.contained, z: +r.z.toFixed(4) })),
}

mkdirSync(join(ROOT, 'data/em'), { recursive: true })
writeFileSync(join(ROOT, 'data/em/backtest-spy.json'), JSON.stringify(out, null, 2) + '\n')

const pct = (x) => x == null ? '   —  ' : (x * 100).toFixed(1).padStart(5) + '%'
const ci = (s) => `[${(s.interval.low * 100).toFixed(0)}–${(s.interval.high * 100).toFixed(0)}]`
console.log(`SPY ${out.span.from} → ${out.span.to}: ${daily.length} daily sessions, ${weekly.length} full weeks\n`)
console.log('CALIBRATION                          measured   theory   n')
const c = calib.daily
console.log(`daily contained (intraday range)     ${pct(c.contained.interval.point)}   ${pct(pathContainment)}  ${c.n}  ${ci(c.contained)}   theory = continuous path inside ±1σ`)
console.log(`daily lower reached                  ${pct(c.lowerReached.interval.point)}   ${pct(THEORETICAL.oneSidedTouch)}  ${c.n}`)
console.log(`daily upper reached                  ${pct(c.upperReached.interval.point)}   ${pct(THEORETICAL.oneSidedTouch)}  ${c.n}`)
console.log(`daily lower broken (close)           ${pct(c.lowerBroken.interval.point)}   ${pct(THEORETICAL.oneSidedBreak)}  ${c.n}`)
console.log(`daily upper broken (close)           ${pct(c.upperBroken.interval.point)}   ${pct(THEORETICAL.oneSidedBreak)}  ${c.n}`)
console.log(`daily mean |z|                        ${c.meanAbsZ.toFixed(3)}    ${THEORETICAL.meanAbsZ.toFixed(3)}`)
console.log(`daily mean z (centre bias)           ${c.meanZ >= 0 ? '+' : ''}${c.meanZ.toFixed(3)}`)
const w = calib.weekly
console.log(`weekly contained (range)             ${pct(w.contained.interval.point)}   ${pct(pathContainment)}  ${w.n}  ${ci(w.contained)}`)
console.log(`weekly mean |z|                       ${w.meanAbsZ.toFixed(3)}    ${THEORETICAL.meanAbsZ.toFixed(3)}\n`)
console.log(`base rate for any fade-on-close setup (reflection principle)   50.0%\n`)
console.log('SETUPS                                                          win     n   95% CI     reportable')
for (const [k, s] of Object.entries(setups)) {
  console.log(`${s.label.padEnd(62)} ${pct(s.interval.point)}  ${String(s.n).padStart(3)}  ${ci(s).padEnd(9)} ${s.reportable ? 'yes' : 'no, n<20'}`)
}
