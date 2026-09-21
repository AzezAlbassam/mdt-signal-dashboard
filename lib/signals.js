/**
 * Single-leg trades off the expected-move band: buy one call, or buy one put,
 * with a target and a stop stated before entry.
 *
 * The arithmetic that bounds the whole exercise. On a path with no edge, a
 * target T and a stop S, both measured from the entry, are reached first with
 * probability S/(T+S) and T/(T+S). So a 90 per cent win rate forces a
 * reward-to-risk near one to nine, and a three-to-one reward forces a win rate
 * near a quarter. Wanting both high is wanting an edge over that line, and the
 * only honest way to look for one is to measure against it.
 *
 * Two rules keep this from flattering itself:
 *
 *  - Entry is the open of the session AFTER the signal. A close-break is known
 *    at the close, and filling at that same close is a fill you did not have.
 *  - A session that touches both levels is scored as the stop. Daily bars
 *    cannot say which came first, and assuming the good one is how a backtest
 *    lies.
 */

import { dailyBandSeries } from './study.js'
import { wilsonRate } from './study.js'

/** The entry rules, each read only from sessions that have already closed. */
export const RULES = [
  'closeBelowBand',
  'closeAboveBand',
  'closeBelowOuter',
  'closeAboveOuter',
  'twoClosesBelowBand',
  'twoClosesAboveBand',
  'closeBelowBandHighVix',
  'closeBelowBandLowVix',
]

const bandRows = (sessions, k) => {
  const rows = dailyBandSeries(sessions, { k })
  const byDate = new Map(rows.map((b) => [b.session.date, b]))
  return { rows, byDate }
}

/**
 * The dates a rule fires on. Each is the date of the session whose close
 * triggered it, so a trade opens on the session after.
 */
export function signalDates (sessions, { rule, k = 0.92, outerMultiple = 2, vixCut = 22 } = {}) {
  if (!RULES.includes(rule)) throw new RangeError(`unknown rule ${rule}`)
  const { rows } = bandRows(sessions, k)
  const hit = []
  for (let i = 0; i < rows.length; i++) {
    const b = rows[i]
    const s = b.session
    const prev = i > 0 ? rows[i - 1] : null
    const below = s.close < b.lower
    const above = s.close > b.upper
    const belowOuter = s.close < b.center - outerMultiple * b.halfWidth
    const aboveOuter = s.close > b.center + outerMultiple * b.halfWidth
    const prevBelow = prev ? prev.session.close < prev.lower : false
    const prevAbove = prev ? prev.session.close > prev.upper : false
    let fires = false
    switch (rule) {
      case 'closeBelowBand': fires = below; break
      case 'closeAboveBand': fires = above; break
      case 'closeBelowOuter': fires = belowOuter; break
      case 'closeAboveOuter': fires = aboveOuter; break
      case 'twoClosesBelowBand': fires = below && prevBelow; break
      case 'twoClosesAboveBand': fires = above && prevAbove; break
      case 'closeBelowBandHighVix': fires = below && b.anchorVix >= vixCut; break
      case 'closeBelowBandLowVix': fires = below && b.anchorVix < vixCut; break
    }
    if (fires) hit.push(s.date)
  }
  return hit
}

/**
 * One trade from `path[from]`, entered at the next session's open. `unit` is
 * the price distance one sigma represents, so the target and stop are stated
 * in the same units the band is drawn in.
 */
export function runTrade (path, from, { direction, unit, targetSigma, stopSigma, maxHold = 21 }) {
  const long = direction === 'call'
  if (!long && direction !== 'put') throw new RangeError(`unknown direction ${direction}`)
  const entryIndex = from + 1
  if (entryIndex >= path.length) return null
  const entryPrice = path[entryIndex].open
  const target = long ? entryPrice + targetSigma * unit : entryPrice - targetSigma * unit
  const stop = long ? entryPrice - stopSigma * unit : entryPrice + stopSigma * unit
  const risk = stopSigma * unit

  let exitIndex = entryIndex
  let exitPrice = path[entryIndex].close
  let outcome = 'time'
  const last = Math.min(path.length - 1, entryIndex + maxHold - 1)

  for (let i = entryIndex; i <= last; i++) {
    const s = path[i]
    const hitTarget = long ? s.high >= target : s.low <= target
    const hitStop = long ? s.low <= stop : s.high >= stop
    exitIndex = i
    // Both in one session is unresolvable on daily bars, so it is the stop.
    if (hitStop) { exitPrice = stop; outcome = 'stop'; break }
    if (hitTarget) { exitPrice = target; outcome = 'target'; break }
    exitPrice = s.close
  }

  const move = long ? exitPrice - entryPrice : entryPrice - exitPrice
  return {
    signalDate: path[from].date,
    entryDate: path[entryIndex].date,
    exitDate: path[exitIndex].date,
    direction,
    entryPrice,
    exitPrice,
    target,
    stop,
    unit,
    risk,
    bars: exitIndex - entryIndex + 1,
    outcome,
    move,
    rMultiple: move / risk,
  }
}

/** Every trade a rule and a direction would have produced over the sample. */
export function simulateSignal (sessions, {
  rule, direction, targetSigma = 2, stopSigma = 1, maxHold = 21,
  k = 0.92, outerMultiple = 2, vixCut = 22, cooldown = 0,
} = {}) {
  const dates = new Set(signalDates(sessions, { rule, k, outerMultiple, vixCut }))
  const { byDate } = bandRows(sessions, k)
  const trades = []
  let blockedUntil = -1
  for (let i = 0; i < sessions.length - 1; i++) {
    if (!dates.has(sessions[i].date)) continue
    if (i <= blockedUntil) continue
    const band = byDate.get(sessions[i].date)
    if (!band) continue
    const t = runTrade(sessions, i, { direction, unit: band.halfWidth, targetSigma, stopSigma, maxHold })
    if (!t) continue
    t.signalVix = band.anchorVix
    trades.push(t)
    // A cooldown stops one event being counted as a dozen overlapping trades.
    if (cooldown > 0) blockedUntil = i + cooldown
  }
  return trades
}

export function summariseSignal (trades, sessions) {
  const n = trades.length
  if (n === 0) return { n: 0 }
  const wins = trades.filter((t) => t.rMultiple > 0)
  const losses = trades.filter((t) => t.rMultiple <= 0)
  const sum = (a) => a.reduce((x, y) => x + y, 0)
  const rs = trades.map((t) => t.rMultiple)
  const years = sessions ? (sessions.length / 252) : null
  const meanWinR = wins.length ? sum(wins.map((t) => t.rMultiple)) / wins.length : 0
  const meanLossR = losses.length ? sum(losses.map((t) => t.rMultiple)) / losses.length : 0
  const grossWin = sum(wins.map((t) => t.rMultiple))
  const grossLoss = Math.abs(sum(losses.map((t) => t.rMultiple)))
  return {
    n,
    winRate: wilsonRate(wins.length, n),
    expectancyR: sum(rs) / n,
    meanWinR,
    meanLossR,
    rewardToRisk: meanLossR < 0 ? meanWinR / Math.abs(meanLossR) : Infinity,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : Infinity,
    totalR: sum(rs),
    meanBars: sum(trades.map((t) => t.bars)) / n,
    perYear: years ? n / years : null,
    byOutcome: {
      target: trades.filter((t) => t.outcome === 'target').length,
      stop: trades.filter((t) => t.outcome === 'stop').length,
      time: trades.filter((t) => t.outcome === 'time').length,
    },
  }
}

/** A seeded generator, so a simulated base rate is a fixture and not a toss. */
function mulberry32 (a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * What a target and a stop are worth on a path with no edge at all. This is
 * the line every measured rule has to beat before it means anything.
 */
export function randomWalkBaseRate ({
  targetSigma = 2, stopSigma = 1, maxHold = 21, stepsPerSession = 78, paths = 20000, seed = 1,
} = {}) {
  const rnd = mulberry32(seed)
  const gauss = () => {
    const u = Math.max(rnd(), 1e-12)
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd())
  }
  const step = 1 / Math.sqrt(stepsPerSession)
  let hitTarget = 0; let hitStop = 0; let timed = 0; let totalR = 0
  for (let p = 0; p < paths; p++) {
    let w = 0
    let done = false
    for (let s = 0; s < maxHold && !done; s++) {
      for (let i = 0; i < stepsPerSession; i++) {
        w += gauss() * step
        if (w <= -stopSigma) { hitStop++; totalR += -1; done = true; break }
        if (w >= targetSigma) { hitTarget++; totalR += targetSigma / stopSigma; done = true; break }
      }
    }
    if (!done) { timed++; totalR += w / stopSigma }
  }
  return {
    paths,
    winRate: hitTarget / paths,
    hitTarget,
    hitStop,
    timedOut: timed,
    expectancy: totalR / paths,
    theoryWinRate: stopSigma / (targetSigma + stopSigma),
  }
}

/**
 * The same trade taken on every session, with no rule at all.
 *
 * This is the control that decides whether a rule is worth anything. A long
 * call on an index that rises beats a driftless random walk before any signal
 * is involved, so measuring a call rule only against the driftless line
 * credits the rule with the market's own drift. The question is always whether
 * the rule beats taking the trade anyway.
 */
export function unconditionalBaseline (sessions, {
  direction, targetSigma = 2, stopSigma = 1, maxHold = 21, k = 0.92,
} = {}) {
  const { byDate } = bandRows(sessions, k)
  const trades = []
  let blockedUntil = -1
  for (let i = 0; i < sessions.length - 1; i++) {
    if (i <= blockedUntil) continue
    const band = byDate.get(sessions[i].date)
    if (!band) continue
    const t = runTrade(sessions, i, { direction, unit: band.halfWidth, targetSigma, stopSigma, maxHold })
    if (!t) continue
    trades.push(t)
    blockedUntil = i + maxHold
  }
  return summariseSignal(trades, sessions)
}

/**
 * The control that survives a search.
 *
 * `unconditionalBaseline` asks whether a rule beats taking the trade anyway.
 * That is the right question for one rule. It is not enough for a search: try
 * 576 combinations and the best of them is large even when every one is noise,
 * because the best of 576 noisy estimates is a maximum, not an average.
 *
 * The placebo answers what is left. It takes the same number of trades, at the
 * same rarity, on dates drawn at random, and reports the distribution of what
 * that alone produces. A rule is only worth anything if it lands outside it.
 */

const bandCache = new WeakMap()
const cachedBands = (sessions, k) => {
  let byK = bandCache.get(sessions)
  if (!byK) { byK = new Map(); bandCache.set(sessions, byK) }
  if (!byK.has(k)) byK.set(k, bandRows(sessions, k))
  return byK.get(k)
}

/** Random entry indices, honouring the same non-overlap rule as a real run. */
function drawIndices (rnd, sessions, { n, cooldown = 0, byDate }) {
  const valid = []
  for (let i = 0; i < sessions.length - 1; i++) if (byDate.has(sessions[i].date)) valid.push(i)
  const gap = Math.max(cooldown, 0)
  const blocked = new Set()
  const chosen = []
  let guard = 0
  while (chosen.length < n && guard++ < n * 500) {
    const i = valid[Math.floor(rnd() * valid.length)]
    if (blocked.has(i)) continue
    chosen.push(i)
    for (let j = i - gap; j <= i + gap; j++) blocked.add(j)
  }
  return chosen.sort((a, b) => a - b)
}

function tradesAt (sessions, indices, byDate, { direction, targetSigma, stopSigma, maxHold }) {
  const out = []
  for (const i of indices) {
    const band = byDate.get(sessions[i].date)
    if (!band) continue
    const t = runTrade(sessions, i, { direction, unit: band.halfWidth, targetSigma, stopSigma, maxHold })
    if (t) { t.signalVix = band.anchorVix; out.push(t) }
  }
  return out
}

/** One placebo run: `n` trades on dates no rule chose. */
export function placeboTrades (sessions, {
  n, direction, targetSigma = 2, stopSigma = 1, maxHold = 21, k = 0.92, cooldown = 0, seed = 1, rng,
} = {}) {
  const rnd = rng ?? mulberry32(seed)
  const { byDate } = cachedBands(sessions, k)
  const idx = drawIndices(rnd, sessions, { n, cooldown, byDate })
  return tradesAt(sessions, idx, byDate, { direction, targetSigma, stopSigma, maxHold })
}

const stats = (samples) => {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, samples.length - 1))
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    mean,
    sd,
    quantile: (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))],
    // The share of draws that matched the claim. A claim the noise reaches
    // often is not a finding.
    pValue: (observed) => samples.filter((s) => s >= observed).length / samples.length,
  }
}

/** What random dates produce, over many draws, for one combination. */
export function placeboDistribution (sessions, {
  n, direction, targetSigma = 2, stopSigma = 1, maxHold = 21, k = 0.92,
  cooldown = null, draws = 200, seed = 1,
} = {}) {
  const rnd = mulberry32(seed)
  const hold = cooldown == null ? maxHold : cooldown
  const anyway = unconditionalBaseline(sessions, { direction, targetSigma, stopSigma, maxHold, k })
  const samples = []
  for (let d = 0; d < draws; d++) {
    const trades = placeboTrades(sessions, { n, direction, targetSigma, stopSigma, maxHold, k, cooldown: hold, rng: rnd })
    samples.push(trades.length ? summariseSignal(trades, sessions).expectancyR : 0)
  }
  const edges = samples.map((s) => s - anyway.expectancyR)
  const e = stats(edges)
  return {
    ...stats(samples),
    samples,
    edgeSamples: edges,
    edgeMean: e.mean,
    edgeSd: e.sd,
    edgePValue: e.pValue,
    anywayExpectancyR: anyway.expectancyR,
  }
}

/**
 * The threshold a headline actually has to clear: the best edge the whole
 * search finds when nothing is there.
 *
 * Each draw gives every combination random dates and keeps the largest edge
 * over its own unconditional line. Combinations that share a `group` share
 * their dates within a draw, because in the real sweep one rule's dates are
 * reused across every target, stop and direction, and pretending they were
 * independent would overstate the maximum.
 */
export function searchPlacebo (sessions, configs, { draws = 200, seed = 1, k = 0.92, keepDates = false } = {}) {
  const rnd = mulberry32(seed)
  const { byDate } = cachedBands(sessions, k)
  const anyways = configs.map((c) =>
    unconditionalBaseline(sessions, { direction: c.direction, targetSigma: c.targetSigma, stopSigma: c.stopSigma, maxHold: c.maxHold, k }).expectancyR)
  const samples = []
  const kept = []
  const argmax = []
  for (let d = 0; d < draws; d++) {
    const dates = new Map()
    let best = -Infinity
    let bestAt = -1
    for (let j = 0; j < configs.length; j++) {
      const c = configs[j]
      const g = c.group ?? `#${j}`
      if (!dates.has(g)) {
        dates.set(g, drawIndices(rnd, sessions, { n: c.n, cooldown: c.cooldown ?? c.maxHold, byDate }))
      }
      const trades = tradesAt(sessions, dates.get(g), byDate, c)
      const edge = (trades.length ? summariseSignal(trades, sessions).expectancyR : 0) - anyways[j]
      if (edge > best) { best = edge; bestAt = j }
    }
    samples.push(best)
    argmax.push(bestAt)
    if (keepDates) kept.push(Object.fromEntries([...dates].map(([g, v]) => [g, v])))
  }
  return { ...stats(samples), samples, argmax, dates: kept }
}
