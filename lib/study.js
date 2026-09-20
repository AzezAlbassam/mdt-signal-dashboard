/**
 * The long-history study engine.
 *
 * Everything here runs over a plain array of sessions, each {date, open, high,
 * low, close, vix}, and returns numbers with their sample sizes attached. No
 * I/O. The daily band is rebuilt from the prior close and the prior VIX close,
 * so nothing in a band is known only after its session.
 */

import { wilson, THEORETICAL } from './score.js'

export const DAY_BASIS = 365
export const DEFAULT_K = 0.92

export const THEORY = {
  ...THEORETICAL,
  /** Two-sided containment of a continuous ±1σ path, by simulation (78 steps, 60k paths). */
  pathContainment: 0.428,
}

/** One band per session after the first, hanging on the session before. */
export function dailyBandSeries (sessions, { k = DEFAULT_K } = {}) {
  const out = []
  for (let i = 1; i < sessions.length; i++) {
    const prev = sessions[i - 1]
    const halfWidth = prev.close * (k * prev.vix / 100) * Math.sqrt(1 / DAY_BASIS)
    out.push({
      anchorDate: prev.date,
      session: sessions[i],
      center: prev.close,
      halfWidth,
      upper: prev.close + halfWidth,
      lower: prev.close - halfWidth,
    })
  }
  return out
}

/** The same band, but centred on the session's own open once it is known. */
export function openAnchoredSeries (sessions, { k = DEFAULT_K } = {}) {
  const out = []
  for (let i = 1; i < sessions.length; i++) {
    const prev = sessions[i - 1]
    const s = sessions[i]
    const halfWidth = s.open * k * prev.vix / 100 * Math.sqrt(1 / DAY_BASIS)
    out.push({ anchorDate: prev.date, session: s, center: s.open, halfWidth, upper: s.open + halfWidth, lower: s.open - halfWidth })
  }
  return out
}

/** How a band series holds up against the sessions it was drawn for. */
export function calibrateSeries (series) {
  const n = series.length
  let contained = 0; let up = 0; let lo = 0; let bu = 0; let bl = 0; let absZ = 0; let z = 0
  for (const b of series) {
    const s = b.session
    if (s.high >= b.upper) up++
    if (s.low <= b.lower) lo++
    if (s.low >= b.lower && s.high <= b.upper) contained++
    if (s.close > b.upper) bu++
    if (s.close < b.lower) bl++
    const zz = (s.close - b.center) / b.halfWidth
    absZ += Math.abs(zz); z += zz
  }
  return {
    n,
    contained: contained / n,
    upperReached: up / n,
    lowerReached: lo / n,
    closeBreakUpper: bu / n,
    closeBreakLower: bl / n,
    meanAbsZ: absZ / n,
    meanZ: z / n,
  }
}

export const calibrate = (sessions, opts = {}) => calibrateSeries(dailyBandSeries(sessions, opts))

/**
 * The multiplier that makes the band a true one-sigma band on this sample,
 * by bisection against either the mean |z| or the one-sided close-break rate.
 */
export function solveK (sessions, { target = 'meanAbsZ', lo = 0.3, hi = 3 } = {}) {
  const measure = (k) => {
    const c = calibrate(sessions, { k })
    return target === 'meanAbsZ'
      ? c.meanAbsZ - THEORY.meanAbsZ
      : (c.closeBreakUpper + c.closeBreakLower) / 2 - THEORY.oneSidedBreak
  }
  // Both measures fall as k rises.
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (measure(mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Annualised Parkinson volatility over the last `window` sessions, or null. */
export function parkinsonVol (sessions, window) {
  if (sessions.length < window) return null
  const recent = sessions.slice(-window)
  let sum = 0
  for (const s of recent) { const l = Math.log(s.high / s.low); sum += l * l }
  return Math.sqrt((sum / recent.length) / (4 * Math.LN2) * 252)
}

/** The two VIX levels that cut the sample into thirds. */
export function vixTerciles (sessions) {
  const v = sessions.map((s) => s.vix).sort((a, b) => a - b)
  const at = (q) => v[Math.min(v.length - 1, Math.floor(q * v.length))]
  return { low: at(1 / 3), high: at(2 / 3) }
}

/** A rate with its sample size and interval attached. */
export function wilsonRate (k, n) {
  const w = wilson(k, n)
  return { k, n, point: w.point, low: w.low, high: w.high, reportable: n >= 20 }
}

// ─────────────────────────────────────────────── weekly bands and setups

import { weekAnchor, weekExpiry, lastSessionOfWeek, prevTradingDay, nextTradingDay } from './calendar.js'
import { bsPrice } from './bs.js'

const DAY_MS = 86400000
export const calendarDays = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

/** One band per complete week, hanging on the last session of the week before. */
export function weeklyBandSeries (sessions, { k = DEFAULT_K } = {}) {
  const byDate = new Map(sessions.map((s) => [s.date, s]))
  const out = []
  for (const a of sessions) {
    if (lastSessionOfWeek(a.date) !== a.date) continue
    const expiry = weekExpiry(a.date)
    if (!byDate.has(expiry)) continue
    const week = sessions.filter((s) => s.date > a.date && s.date <= expiry)
    if (week.length === 0 || week[week.length - 1].date !== expiry) continue
    const halfWidth = a.close * (k * a.vix / 100) * Math.sqrt(week.length / DAY_BASIS)
    out.push({
      anchorDate: a.date,
      expiry,
      center: a.close,
      halfWidth,
      upper: a.close + halfWidth,
      lower: a.close - halfWidth,
      week,
      agg: {
        open: week[0].open,
        high: Math.max(...week.map((s) => s.high)),
        low: Math.min(...week.map((s) => s.low)),
        close: week[week.length - 1].close,
      },
    })
  }
  return out
}

/**
 * The setups a trader would take off the bands, each as a rate with its
 * sample size. The break-to-weekly run credits later sessions only: the
 * close-break signal does not exist until the close.
 */
export function scoreSetups (sessions, { k = DEFAULT_K } = {}) {
  const series = dailyBandSeries(sessions, { k })
  const byDate = new Map(sessions.map((s) => [s.date, s]))
  const index = new Map(sessions.map((s, i) => [s.date, i]))
  const next = (date) => sessions[index.get(date) + 1] ?? null
  const rate = (rows, pred) => wilsonRate(rows.filter(pred).length, rows.length)

  const lowerTags = series.filter((b) => b.session.low <= b.lower)
  const upperTags = series.filter((b) => b.session.high >= b.upper)
  const withNext = (rows) => rows.filter((b) => next(b.session.date))

  const breaks = series.filter((b) => b.session.close < b.lower || b.session.close > b.upper)
  const detail = []
  for (const b of breaks) {
    const side = b.session.close < b.lower ? 'lower' : 'upper'
    const anchorDate = weekAnchor(prevTradingDay(b.session.date))
    const anchor = byDate.get(anchorDate)
    if (!anchor) continue
    const expiry = weekExpiry(anchorDate)
    const later = sessions.filter((s) => s.date > b.session.date && s.date <= expiry)
    const weekSessions = sessions.filter((s) => s.date > anchorDate && s.date <= expiry).length
    const halfWidth = anchor.close * (k * anchor.vix / 100) * Math.sqrt(weekSessions / DAY_BASIS)
    const level = side === 'lower' ? anchor.close - halfWidth : anchor.close + halfWidth
    const reached = side === 'lower' ? later.some((s) => s.low <= level) : later.some((s) => s.high >= level)
    detail.push({ date: b.session.date, side, weeklyAnchor: anchorDate, level, reached, laterSessions: later.length })
  }

  const all = sessions.slice(0, -1)
  return {
    fadeLower: rate(lowerTags, (b) => b.session.close > b.lower),
    fadeUpper: rate(upperTags, (b) => b.session.close < b.upper),
    nextAfterLowerTag: rate(withNext(lowerTags), (b) => next(b.session.date).close > b.session.close),
    nextAfterUpperTag: rate(withNext(upperTags), (b) => next(b.session.date).close < b.session.close),
    breakToWeekly: { ...rate(detail, (d) => d.reached), detail },
    baseNextUp: rate(all, (s) => next(s.date).close > s.close),
    baseNextDown: rate(all, (s) => next(s.date).close < s.close),
  }
}

// ──────────────────────────────────────────────── option legs, model-priced

/**
 * One long option leg, priced at entry and exit with Black-Scholes.
 * Slippage is a fraction of premium charged on each side.
 */
export function optionLegPnl ({
  S0, S1, K, type, daysToExpiryAtEntry, daysHeld, sigmaEntry, sigmaExit, r = 0, slippage = 0,
}) {
  const premiumIn = bsPrice({ S: S0, K, T: daysToExpiryAtEntry / DAY_BASIS, sigma: sigmaEntry, r, type })
  const tOut = Math.max(0, daysToExpiryAtEntry - daysHeld) / DAY_BASIS
  const premiumOut = bsPrice({ S: S1, K, T: tOut, sigma: sigmaExit, r, type })
  const pnl = (premiumOut - premiumIn) - slippage * (premiumIn + premiumOut)
  return { premiumIn, premiumOut, pnl, pnlPct: premiumIn > 0 ? pnl / premiumIn : 0 }
}

/** A regular session, as a fraction of a calendar day. */
const SESSION_DAYS = 6.5 / 24

/**
 * Every trade a setup would have produced, priced as an option leg.
 *
 *  lowerTagLong   the band's lower edge was reached; buy a call
 *  upperTagShort  the band's upper edge was reached; buy a put
 *
 * dte 0 is a same-session trade entered at the band itself and closed at the
 * bell. Daily bars do not say when the band was touched, so entryFraction
 * states how much of the session is assumed to remain; 1 prices a whole
 * session of time, which is the conservative case for a buyer. dte 1 and
 * above are entered at that session's close and closed at the next close.
 */
export function simulateSetup (sessions, { setup, dte, k = DEFAULT_K, ivScale = DEFAULT_K, slippage = 0, r = 0, entryFraction = 0.5, excludeGapThrough = false }) {
  const series = dailyBandSeries(sessions, { k })
  const index = new Map(sessions.map((s, i) => [s.date, i]))
  const isLower = setup === 'lowerTagLong'
  if (!isLower && setup !== 'upperTagShort') throw new RangeError(`unknown setup ${setup}`)
  const type = isLower ? 'C' : 'P'
  const trades = []
  for (const b of series) {
    const s = b.session
    const reached = isLower ? s.low <= b.lower : s.high >= b.upper
    if (!reached) continue
    const prev = sessions[index.get(s.date) - 1]

    if (dte === 0) {
      // A band the session opened beyond was never available as a fill.
      const gapped = isLower ? s.open <= b.lower : s.open >= b.upper
      if (excludeGapThrough && gapped) continue
      const entryS = isLower ? b.lower : b.upper
      const K = Math.round(entryS)
      const sigma = ivScale * prev.vix / 100
      const remaining = entryFraction * SESSION_DAYS
      const leg = optionLegPnl({
        S0: entryS, S1: s.close, K, type,
        daysToExpiryAtEntry: remaining, daysHeld: remaining,
        sigmaEntry: sigma, sigmaExit: sigma, r, slippage,
      })
      trades.push({
        setup, dte, type, strike: K, entryDate: s.date, exitDate: s.date, expiryDate: s.date,
        entryLevel: entryS, entryS, exitS: s.close, openS: s.open, gappedThrough: gapped, entryFraction,
        daysToExpiryAtEntry: remaining, daysHeld: remaining, ...leg,
      })
      continue
    }

    const nxt = sessions[index.get(s.date) + 1]
    if (!nxt) continue
    let expiryDate = s.date
    for (let i = 0; i < dte; i++) expiryDate = nextTradingDay(expiryDate)
    const daysToExpiryAtEntry = calendarDays(s.date, expiryDate)
    const daysHeld = calendarDays(s.date, nxt.date)
    const K = Math.round(s.close)
    const leg = optionLegPnl({
      S0: s.close, S1: nxt.close, K, type, daysToExpiryAtEntry, daysHeld,
      sigmaEntry: ivScale * s.vix / 100, sigmaExit: ivScale * nxt.vix / 100, r, slippage,
    })
    trades.push({
      setup, dte, type, strike: K, entryDate: s.date, exitDate: nxt.date, expiryDate,
      entryLevel: isLower ? b.lower : b.upper, entryS: s.close, exitS: nxt.close,
      daysToExpiryAtEntry, daysHeld, ...leg,
    })
  }
  return trades
}

export function summariseTrades (trades) {
  const n = trades.length
  if (n === 0) {
    return { n: 0, winRate: wilsonRate(0, 0), meanPnlPct: null, medianPnlPct: null, meanPnl: null, profitFactor: null, worstPct: null, bestPct: null, meanPremiumIn: null }
  }
  const pct = trades.map((t) => t.pnlPct).sort((a, b) => a - b)
  const wins = trades.filter((t) => t.pnl > 0)
  const gross = wins.reduce((a, t) => a + t.pnl, 0)
  const lossSum = trades.filter((t) => t.pnl <= 0).reduce((a, t) => a + t.pnl, 0)
  return {
    n,
    winRate: wilsonRate(wins.length, n),
    meanPnlPct: pct.reduce((a, b) => a + b, 0) / n,
    medianPnlPct: pct[Math.floor(n / 2)],
    meanPnl: trades.reduce((a, t) => a + t.pnl, 0) / n,
    profitFactor: lossSum < 0 ? gross / -lossSum : Infinity,
    worstPct: pct[0],
    bestPct: pct[n - 1],
    meanPremiumIn: trades.reduce((a, t) => a + t.premiumIn, 0) / n,
  }
}

// ──────────────────────────────────────────────── enhancement candidates

/** Lower side widened and upper side narrowed by the same fraction. */
export function skewedBandSeries (sessions, { k = DEFAULT_K, skew = 0 } = {}) {
  return dailyBandSeries(sessions, { k }).map((b) => ({
    ...b,
    lower: b.center - b.halfWidth * (1 + skew),
    upper: b.center + b.halfWidth * (1 - skew),
  }))
}

/** The same bands with every half width multiplied. */
export const scaledSeries = (series, m) => series.map((b) => ({
  ...b, halfWidth: b.halfWidth * m, upper: b.center + b.halfWidth * m, lower: b.center - b.halfWidth * m,
}))

/** Implied vol blended with realised Parkinson vol over the prior window. */
export function blendedBandSeries (sessions, { k = DEFAULT_K, window = 10, weight = 0.5 } = {}) {
  const out = []
  for (let i = 1; i < sessions.length; i++) {
    const prev = sessions[i - 1]
    const implied = k * prev.vix / 100
    const realised = parkinsonVol(sessions.slice(0, i), window)
    const vol = realised == null ? implied : weight * implied + (1 - weight) * realised
    const halfWidth = prev.close * vol * Math.sqrt(1 / DAY_BASIS)
    out.push({ anchorDate: prev.date, session: sessions[i], center: prev.close, halfWidth, upper: prev.close + halfWidth, lower: prev.close - halfWidth, blended: realised != null, vol })
  }
  return out
}

/** Calibration split by the VIX tercile the band was drawn from. */
export function regimeCalibration (sessions, { k = DEFAULT_K } = {}) {
  const t = vixTerciles(sessions)
  const series = dailyBandSeries(sessions, { k })
  const byDate = new Map(sessions.map((s) => [s.date, s]))
  const groups = { low: [], mid: [], high: [] }
  for (const b of series) {
    const v = byDate.get(b.anchorDate).vix
    groups[v <= t.low ? 'low' : v <= t.high ? 'mid' : 'high'].push(b)
  }
  return Object.fromEntries(Object.entries(groups).map(([g, rows]) => [g, { ...calibrateSeries(rows), vixCut: t }]))
}

// ─────────────────────────────────────────────── regime-adjusted multiplier

/** The multiplier that calibrates each VIX tercile separately. */
export function solveKByRegime (sessions) {
  const cuts = vixTerciles(sessions)
  const byDate = new Map(sessions.map((s) => [s.date, s]))
  const series = dailyBandSeries(sessions, { k: 1 })
  const regimeOf = (anchorDate) => { const v = byDate.get(anchorDate).vix; return v <= cuts.low ? 'low' : v <= cuts.high ? 'mid' : 'high' }
  const k = {}
  const n = {}
  for (const g of ['low', 'mid', 'high']) {
    const rows = series.filter((b) => regimeOf(b.anchorDate) === g)
    n[g] = rows.length
    // mean |z| scales as 1/k, so the solution is closed form from any k.
    const c = calibrateSeries(rows)
    k[g] = c.meanAbsZ / THEORY.meanAbsZ
  }
  return { cuts, k, n }
}

/** Bands whose multiplier depends on the VIX regime the anchor sits in. */
export function regimeAdjustedSeries (sessions, { cuts, k }) {
  const out = []
  for (let i = 1; i < sessions.length; i++) {
    const prev = sessions[i - 1]
    const regime = prev.vix <= cuts.low ? 'low' : prev.vix <= cuts.high ? 'mid' : 'high'
    const halfWidth = prev.close * (k[regime] * prev.vix / 100) * Math.sqrt(1 / DAY_BASIS)
    out.push({ anchorDate: prev.date, session: sessions[i], center: prev.close, halfWidth, upper: prev.close + halfWidth, lower: prev.close - halfWidth, regime, k: k[regime] })
  }
  return out
}

/**
 * Fit on everything before `split`, evaluate on everything from it on.
 * The regime cuts and multipliers come from the fit span only.
 */
export function outOfSample (sessions, { split, fixedK = DEFAULT_K }) {
  const fitSessions = sessions.filter((s) => s.date < split)
  const testSessions = sessions.filter((s) => s.date >= split)
  const fitted = solveKByRegime(fitSessions)
  // The test series needs the last fit session as the first anchor.
  const testWithAnchor = [fitSessions[fitSessions.length - 1], ...testSessions]
  const fixed = { k: fixedK, ...calibrateSeries(dailyBandSeries(testWithAnchor, { k: fixedK })) }
  const regime = { ...fitted, ...calibrateSeries(regimeAdjustedSeries(testWithAnchor, fitted)) }
  regime.improves = Math.abs(regime.meanAbsZ - THEORY.meanAbsZ) < Math.abs(fixed.meanAbsZ - THEORY.meanAbsZ)
  regime.byRegime = {}
  const adj = regimeAdjustedSeries(testWithAnchor, fitted)
  const fx = dailyBandSeries(testWithAnchor, { k: fixedK })
  for (const g of ['low', 'mid', 'high']) {
    const idx = adj.map((b, i) => (b.regime === g ? i : -1)).filter((i) => i >= 0)
    regime.byRegime[g] = { regime: calibrateSeries(idx.map((i) => adj[i])), fixed: calibrateSeries(idx.map((i) => fx[i])) }
  }
  return {
    fit: { from: fitSessions[0].date, to: fitSessions[fitSessions.length - 1].date, n: fitSessions.length },
    test: { from: testSessions[0].date, to: testSessions[testSessions.length - 1].date, n: testSessions.length },
    fixed,
    regime,
  }
}
