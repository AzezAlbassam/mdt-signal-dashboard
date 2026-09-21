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
 * One option, sold at the band and held to expiry.
 *
 * This is the simplest thing the study can be reduced to: a single short put
 * below the market, or a single short call above it. There is no wing, so the
 * credit is the whole of the best case and the worst case is not a number you
 * can name in advance — a put can cost its whole strike and a call has no
 * bound at all. That asymmetry is the finding, not a detail.
 */
export function shortSingle ({
  S0, S1, sigma, days, widthSigma = 1, side = 'put', r = 0, skew = 0, costPerLeg = 0, pricingScale = 1,
}) {
  if (side !== 'put' && side !== 'call') throw new RangeError(`unknown side ${side}`)
  const { move, callStrike, putStrike } = strikesFor({ S0, sigma, days, widthSigma })
  const strike = side === 'call' ? callStrike : putStrike
  const T = days / DAY_BASIS
  const priced = sigma * pricingScale * (side === 'call' ? 1 - skew : 1 + skew)
  const premiumIn = bsPrice({ S: S0, K: strike, T, sigma: priced, r, type: side === 'call' ? 'C' : 'P' })
  const settlement = side === 'call' ? Math.max(S1 - strike, 0) : Math.max(strike - S1, 0)
  const costs = costPerLeg
  return {
    structure: 'single',
    legs: 1,
    side,
    move,
    strike,
    premiumIn,
    settlement,
    costs,
    // Named for symmetry with the spread, but it is not a maximum: a short put
    // is only bounded by a strike, and a short call is not bounded at all.
    maxLoss: side === 'put' ? strike - premiumIn + costs : Infinity,
    pnl: premiumIn - settlement - costs,
  }
}

/**
 * The same sale with a second option of the same kind bought further out. Two
 * legs instead of one, a smaller credit, and a worst case that is fixed on the
 * day you open it and cannot be exceeded by any move, gap or halt.
 */
export function creditSpread ({
  S0, S1, sigma, days, widthSigma = 1, side = 'put', wingSigma = 0.5, wingPoints,
  r = 0, skew = 0, costPerLeg = 0, pricingScale = 1,
}) {
  const short = shortSingle({ S0, S1, sigma, days, widthSigma, side, r, skew, pricingScale })
  const width = wingPoints != null ? wingPoints : wingSigma * short.move
  if (!(width > 0)) throw new RangeError(`a spread needs a width, got ${width}`)
  const longStrike = side === 'call' ? short.strike + width : short.strike - width
  const T = days / DAY_BASIS
  const priced = sigma * pricingScale * (side === 'call' ? 1 - skew : 1 + skew)
  const longPremium = bsPrice({ S: S0, K: longStrike, T, sigma: priced, r, type: side === 'call' ? 'C' : 'P' })
  const premiumIn = short.premiumIn - longPremium
  const settlement = Math.min(short.settlement, width)
  const costs = 2 * costPerLeg
  return {
    structure: 'spread',
    legs: 2,
    side,
    move: short.move,
    shortStrike: short.strike,
    longStrike,
    width,
    premiumIn,
    settlement,
    costs,
    maxLoss: width - premiumIn + costs,
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

// ──────────────────────────────────────────────── being there at expiry

/** The share of notional a broker asks for on a naked short index option. */
export const MARGIN = { rate: 0.15, floor: 0.10 }

/**
 * One short leg's requirement, the standard two-rule form: a share of the
 * underlying less however far the strike is out of the money, floored at a
 * share of the strike, plus what it would cost to buy the option back.
 */
export function marginRequirement ({ S, strike, value, type, rate = MARGIN.rate, floor = MARGIN.floor }) {
  const outOfMoney = type === 'C' ? Math.max(strike - S, 0) : Math.max(S - strike, 0)
  return Math.max(rate * S - outOfMoney, floor * strike) + value
}

/**
 * What the position asks for on every session it is open, and whether an
 * account funded with the initial requirement survives to expiry.
 *
 * This is the question a backtest that settles every trade cannot ask. A
 * defined-risk position posts its whole worst case on day one, so the answer
 * is always yes. A naked one does not, and on the worst window of this decade
 * the answer is no, fourteen sessions before the expiry the study books.
 */
export function marginPath (sessions, trade, { rate = MARGIN.rate, floor = MARGIN.floor, funding = 1 } = {}) {
  const i0 = sessions.findIndex((s) => s.date === trade.entryDate)
  const i1 = sessions.findIndex((s) => s.date === trade.exitDate)
  if (i0 < 0 || i1 < 0) throw new Error(`cannot locate ${trade.entryDate}..${trade.exitDate}`)

  // A defined-risk position is collateralised by its own maximum loss and the
  // requirement never moves, so there is nothing to track.
  if (trade.structure === 'condor') {
    return {
      initialMargin: trade.maxLoss,
      peakMargin: trade.maxLoss,
      peakMultiple: 1,
      minEquity: trade.maxLoss - Math.min(trade.settlement, trade.wingPoints) - trade.costs,
      liquidatedOn: null,
      liquidationLoss: null,
      rows: [],
    }
  }

  const value = (S, K, T, type) => bsPrice({ S, K, T, sigma: trade.sigma, r: 0, type })
  const requirementAt = (S, T) =>
    Math.max(
      marginRequirement({ S, strike: trade.callStrike, value: value(S, trade.callStrike, T, 'C'), type: 'C', rate, floor }),
      marginRequirement({ S, strike: trade.putStrike, value: value(S, trade.putStrike, T, 'P'), type: 'P', rate, floor }),
    ) + Math.min(value(S, trade.callStrike, T, 'C'), value(S, trade.putStrike, T, 'P'))

  const initialMargin = requirementAt(trade.S0, trade.calendarDays / DAY_BASIS)
  const account = funding * initialMargin
  let peakMargin = initialMargin
  let minEquity = account
  let liquidatedOn = null
  let liquidationLoss = null
  const rows = []

  for (let i = i0; i <= i1; i++) {
    const s = sessions[i]
    const held = calendarDays(trade.entryDate, s.date)
    const T = Math.max(0, trade.calendarDays - held) / DAY_BASIS
    const markToMarket = value(s.close, trade.callStrike, T, 'C') + value(s.close, trade.putStrike, T, 'P')
    const openPnl = trade.premiumIn - markToMarket - trade.costs
    const need = requirementAt(s.close, T)
    const equity = account + openPnl
    if (need > peakMargin) peakMargin = need
    if (equity < minEquity) minEquity = equity
    rows.push({ date: s.date, close: s.close, openPnl, requirement: need, equity })
    if (equity <= 0 && liquidatedOn == null) {
      liquidatedOn = s.date
      liquidationLoss = account
    }
  }

  return {
    initialMargin,
    peakMargin,
    peakMultiple: peakMargin / initialMargin,
    minEquity,
    liquidatedOn,
    liquidationLoss,
    rows,
  }
}

/**
 * The single-leg and two-leg study over the whole sample, one trade at a time
 * with no overlap, priced off the VIX of the session it opened on.
 */
export function simulateSingle (sessions, {
  hold = 21, widthSigma = 1, side = 'put', structure = 'single', wingSigma = 0.5, wingPoints,
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
      widthSigma, side, r, skew, costPerLeg, pricingScale,
    }
    const leg = structure === 'spread' ? creditSpread({ ...args, wingSigma, wingPoints }) : shortSingle(args)
    trades.push({
      entryDate: p.entry.date,
      exitDate: p.exit.date,
      entryVix,
      sigma: entryVix / 100,
      S0: p.entry.close,
      S1: p.exit.close,
      movePct: (p.exit.close - p.entry.close) / p.entry.close,
      calendarDays: p.calendarDays,
      ...leg,
      pnlPctOfIndex: leg.pnl / p.entry.close,
      // The figure that lets a defined-risk trade be sized: what the worst
      // case actually returned.
      pnlPctOfRisk: Number.isFinite(leg.maxLoss) ? leg.pnl / leg.maxLoss : null,
    })
  }
  return trades
}

/**
 * What a one-sided position asks for on every session it is open, and whether
 * an account funded with the initial requirement survives to expiry.
 *
 * A spread is collateralised by its own maximum loss, so the requirement is
 * fixed on day one and no move can raise it. A naked leg is not: as the index
 * comes at the strike the requirement grows while the equity falls, and the
 * two meet before expiry. A backtest that settles every trade on the terminal
 * close cannot see that, which is exactly why it is measured separately.
 */
export function singleMarginPath (sessions, trade, { rate = MARGIN.rate, floor = MARGIN.floor, funding = 1 } = {}) {
  const i0 = sessions.findIndex((s) => s.date === trade.entryDate)
  const i1 = sessions.findIndex((s) => s.date === trade.exitDate)
  if (i0 < 0 || i1 < 0) throw new Error(`cannot locate ${trade.entryDate}..${trade.exitDate}`)
  const type = trade.side === 'call' ? 'C' : 'P'

  if (trade.structure === 'spread') {
    return {
      initialMargin: trade.maxLoss,
      peakMargin: trade.maxLoss,
      peakMultiple: 1,
      minEquity: trade.maxLoss - trade.settlement - trade.costs,
      calledOn: null,
      rows: [],
    }
  }

  const value = (S, T) => bsPrice({ S, K: trade.strike, T, sigma: trade.sigma, r: 0, type })
  const requirementAt = (S, T) =>
    marginRequirement({ S, strike: trade.strike, value: value(S, T), type, rate, floor })

  const initialMargin = requirementAt(trade.S0, trade.calendarDays / DAY_BASIS)
  const account = funding * initialMargin
  let peakMargin = initialMargin
  let minEquity = account
  let calledOn = null
  const rows = []

  for (let i = i0; i <= i1; i++) {
    const s = sessions[i]
    const held = calendarDays(trade.entryDate, s.date)
    const T = Math.max(0, trade.calendarDays - held) / DAY_BASIS
    const openPnl = trade.premiumIn - value(s.close, T) - trade.costs
    const need = requirementAt(s.close, T)
    const equity = account + openPnl
    if (need > peakMargin) peakMargin = need
    if (equity < minEquity) minEquity = equity
    rows.push({ date: s.date, close: s.close, openPnl, requirement: need, equity })
    // A call comes when the equity no longer covers what the position asks
    // for, not when the account reaches zero. The broker does not wait.
    if (equity < need && calledOn == null) calledOn = s.date
  }

  return { initialMargin, peakMargin, peakMultiple: peakMargin / initialMargin, minEquity, calledOn, rows }
}
