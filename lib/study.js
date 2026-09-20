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
