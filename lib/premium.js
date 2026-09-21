/**
 * The low-frequency study: one trade a month, held to expiry, on a
 * cash-settled European index option.
 *
 * Why this is more trustworthy than the same-session study. VIX is a
 * thirty-day at-the-money implied volatility on this exact index, published
 * by the exchange that lists the options. Pricing a twenty-one session option
 * off it is close to reading a real quote rather than guessing one. The
 * earlier zero-day work had to guess, and the guess turned out to be the whole
 * result.
 *
 * Two real biases remain and both are stated rather than hidden:
 *
 *  - Skew. A one-sigma index put really trades above the at-the-money
 *    volatility and the call below it. Pricing both legs flat, which is the
 *    default here, pays a seller less than the market would, so it understates
 *    the seller's premium. That is the cautious direction.
 *  - Term. VIX is thirty days. A ten-session option is shorter, and the front
 *    of the curve is usually below VIX when markets are calm and above it when
 *    they are not. `ivScale` exists to test that both ways.
 *
 * Everything settles on the terminal price alone, because that is how a
 * European index option settles. No path, no assignment, no early exercise.
 */

import { bsPrice } from './bs.js'
import { wilsonRate } from './study.js'

/** Realised volatility is annualised over trading days. */
export const ANNUALISATION = 252

/** Option maths runs on a 365-day year, matching the rest of the model. */
const DAY_BASIS = 365
const DAY_MS = 86400000
const calendarDays = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

/**
 * Back-to-back holding periods of a fixed number of sessions. They do not
 * overlap, so each trade is an independent observation and a bad month is
 * counted once rather than smeared across twenty.
 */
export function horizons (sessions, { hold, start = 0 } = {}) {
  if (!(hold > 0)) throw new RangeError(`hold must be positive, got ${hold}`)
  const out = []
  for (let i = start; i + hold < sessions.length; i += hold) {
    const entry = sessions[i]
    const exit = sessions[i + hold]
    out.push({
      entryIndex: i,
      exitIndex: i + hold,
      entry,
      exit,
      sessions: hold,
      calendarDays: calendarDays(entry.date, exit.date),
    })
  }
  return out
}

/** Annualised close-to-close volatility between two indices, inclusive. */
export function realisedVol (sessions, from, to) {
  const r = []
  for (let i = from + 1; i <= to; i++) r.push(Math.log(sessions[i].close / sessions[i - 1].close))
  if (r.length < 2) return 0
  const mu = r.reduce((a, b) => a + b, 0) / r.length
  const varr = r.reduce((a, b) => a + (b - mu) ** 2, 0) / (r.length - 1)
  return Math.sqrt(varr * ANNUALISATION)
}

/**
 * What the index implied at the start of each period against what it went on
 * to deliver. This is the only thing a premium seller is actually paid for,
 * and unlike an option backtest it needs no option price at all.
 */
export function variancePremium (sessions, { hold = 21, cuts } = {}) {
  const rows = horizons(sessions, { hold }).map((p) => {
    const implied = p.entry.vix / 100
    const realised = realisedVol(sessions, p.entryIndex, p.exitIndex)
    return {
      entryDate: p.entry.date,
      exitDate: p.exit.date,
      vix: p.entry.vix,
      implied,
      realised,
      ratio: realised > 0 ? implied / realised : null,
      diff: implied - realised,
    }
  }).filter((r) => r.ratio != null)

  const vixes = rows.map((r) => r.vix).sort((a, b) => a - b)
  const at = (q) => vixes[Math.min(vixes.length - 1, Math.floor(q * vixes.length))]
  const cut = cuts ?? { low: at(1 / 3), high: at(2 / 3) }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

  const byRegime = {}
  for (const g of ['low', 'mid', 'high']) {
    const sel = rows.filter((r) => (r.vix <= cut.low ? 'low' : r.vix <= cut.high ? 'mid' : 'high') === g)
    byRegime[g] = sel.length === 0 ? { n: 0 } : {
      n: sel.length,
      ratioOfMeans: mean(sel.map((r) => r.implied)) / mean(sel.map((r) => r.realised)),
      meanRatio: mean(sel.map((r) => r.ratio)),
      meanDiff: mean(sel.map((r) => r.diff)),
      shareImpliedHigher: sel.filter((r) => r.diff > 0).length / sel.length,
    }
  }

  // The mean of the per-period ratios is biased upward, because dividing by a
  // small noisy realised figure is not symmetric. The ratio of the means is the
  // honest headline and the mean of ratios is kept only for comparison.
  return {
    n: rows.length,
    hold,
    cuts: cut,
    ratioOfMeans: mean(rows.map((r) => r.implied)) / mean(rows.map((r) => r.realised)),
    meanImplied: mean(rows.map((r) => r.implied)),
    meanRealised: mean(rows.map((r) => r.realised)),
    meanRatio: mean(rows.map((r) => r.ratio)),
    medianRatio: median(rows.map((r) => r.ratio)),
    meanDiff: mean(rows.map((r) => r.diff)),
    shareImpliedHigher: rows.filter((r) => r.diff > 0).length / rows.length,
    worstDiff: Math.min(...rows.map((r) => r.diff)),
    byRegime,
    rows,
  }
}

const strikesFor = ({ S0, sigma, days, widthSigma }) => {
  const move = S0 * sigma * Math.sqrt(days / DAY_BASIS)
  return { move, callStrike: S0 + widthSigma * move, putStrike: S0 - widthSigma * move }
}

/**
 * Sell one call and one put, both `widthSigma` standard deviations out, and
 * hold to expiry. `skew` lifts the put's volatility and lowers the call's by
 * the same fraction, which is the shape an index option surface really has.
 */
export function shortStrangle ({
  S0, S1, sigma, days, widthSigma = 1, r = 0, skew = 0, costPerLeg = 0, pricingScale = 1,
}) {
  const { move, callStrike, putStrike } = strikesFor({ S0, sigma, days, widthSigma })
  const T = days / DAY_BASIS
  // VIX is a variance swap rate over the whole strip, not the at-the-money
  // quote, and it sits above it. pricingScale prices the legs at what a desk
  // would really quote while leaving the strikes where the chart drew them.
  // ivScale, by contrast, moves the strikes as well.
  const priced = sigma * pricingScale
  const callPremium = bsPrice({ S: S0, K: callStrike, T, sigma: priced * (1 - skew), r, type: 'C' })
  const putPremium = bsPrice({ S: S0, K: putStrike, T, sigma: priced * (1 + skew), r, type: 'P' })
  const premiumIn = callPremium + putPremium
  const settlement = Math.max(S1 - callStrike, 0) + Math.max(putStrike - S1, 0)
  const costs = 2 * costPerLeg
  return {
    structure: 'strangle',
    move,
    callStrike,
    putStrike,
    callPremium,
    putPremium,
    premiumIn,
    settlement,
    costs,
    pnl: premiumIn - settlement - costs,
  }
}

/**
 * The same trade with the tail bought back: long a call `wingPoints` above the
 * short call and a put the same distance below the short put. The credit is
 * smaller and the worst case is a number you can name in advance.
 */
export function ironCondor ({
  S0, S1, sigma, days, widthSigma = 1, wingPoints, wingSigma, r = 0, skew = 0, costPerLeg = 0, pricingScale = 1,
}) {
  const short = shortStrangle({ S0, S1, sigma, days, widthSigma, r, skew, pricingScale })
  // A wing named in points does not travel between an index and the fund that
  // tracks it at a tenth the price, so it can also be named in the same sigma
  // units the strikes use.
  if (wingSigma != null) wingPoints = wingSigma * short.move
  if (!(wingPoints > 0)) throw new RangeError(`a wing width is required, got ${wingPoints}`)
  const T = days / DAY_BASIS
  const priced = sigma * pricingScale
  const longCall = bsPrice({ S: S0, K: short.callStrike + wingPoints, T, sigma: priced * (1 - skew), r, type: 'C' })
  const longPut = bsPrice({ S: S0, K: short.putStrike - wingPoints, T, sigma: priced * (1 + skew), r, type: 'P' })
  const premiumIn = short.premiumIn - longCall - longPut
  const settlement = Math.min(short.settlement, wingPoints)
  const costs = 4 * costPerLeg
  return {
    structure: 'condor',
    move: short.move,
    callStrike: short.callStrike,
    putStrike: short.putStrike,
    wingPoints,
    premiumIn,
    settlement,
    costs,
    maxLoss: wingPoints - premiumIn + costs,
    pnl: premiumIn - settlement - costs,
  }
}

/**
 * Every non-overlapping period in the sample, traded the same way. The
 * volatility is the VIX close of the entry session and nothing that happened
 * afterwards enters the price.
 */
export function simulatePremium (sessions, {
  hold = 21, widthSigma = 1, structure = 'strangle', wingPoints, wingSigma,
  ivScale = 1, skew = 0, costPerLeg = 0, r = 0, minVix = null, maxVix = null, start = 0, pricingScale = 1,
} = {}) {
  const trades = []
  for (const p of horizons(sessions, { hold, start })) {
    const entryVix = p.entry.vix
    if (minVix != null && entryVix < minVix) continue
    if (maxVix != null && entryVix > maxVix) continue
    const sigma = (entryVix / 100) * ivScale
    const args = {
      S0: p.entry.close, S1: p.exit.close, sigma, days: p.calendarDays,
      widthSigma, r, skew, costPerLeg, pricingScale,
    }
    const leg = structure === 'condor' ? ironCondor({ ...args, wingPoints, wingSigma }) : shortStrangle(args)
    trades.push({
      entryDate: p.entry.date,
      exitDate: p.exit.date,
      entryVix,
      sigma: entryVix / 100,
      ivScale,
      S0: p.entry.close,
      S1: p.exit.close,
      movePct: (p.exit.close - p.entry.close) / p.entry.close,
      calendarDays: p.calendarDays,
      ...leg,
      pnlPctOfIndex: leg.pnl / p.entry.close,
    })
  }
  return trades
}

export function summarisePremium (trades) {
  const n = trades.length
  if (n === 0) return { n: 0 }
  const pnl = trades.map((t) => t.pnl)
  const wins = pnl.filter((x) => x > 0)
  const losses = pnl.filter((x) => x <= 0)
  const sorted = [...pnl].sort((a, b) => a - b)
  const sum = (a) => a.reduce((x, y) => x + y, 0)
  const premium = sum(trades.map((t) => t.premiumIn))
  return {
    n,
    winRate: wilsonRate(wins.length, n),
    meanPnl: sum(pnl) / n,
    medianPnl: sorted[Math.floor(n / 2)],
    meanWin: wins.length ? sum(wins) / wins.length : 0,
    meanLoss: losses.length ? sum(losses) / losses.length : 0,
    worst: sorted[0],
    best: sorted[n - 1],
    profitFactor: losses.length ? sum(wins) / Math.abs(sum(losses)) : Infinity,
    meanPremiumIn: premium / n,
    returnOnPremium: sum(pnl) / premium,
    totalPnl: sum(pnl),
    meanPnlPctOfIndex: sum(trades.map((t) => t.pnlPctOfIndex)) / n,
    worstAsMultipleOfMeanWin: wins.length ? Math.abs(sorted[0]) / (sum(wins) / wins.length) : null,
    worstDate: trades[pnl.indexOf(sorted[0])]?.entryDate ?? null,
  }
}
