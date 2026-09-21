/**
 * An account, as opposed to a strategy.
 *
 * The study reports percentages of the money at risk, which is the right unit
 * for comparing structures and the wrong unit for answering "what happens to
 * my ten thousand". An account has a size. It buys whole contracts. And a
 * contract whose maximum loss exceeds the risk budget cannot be bought at all
 * — not in a smaller size, not in a fraction. That indivisibility is the
 * difference between a strategy that works and a strategy you can trade, and
 * it is the first thing a percentage hides.
 */

import { simulateSingle } from './premium.js'

const calendarDaysBetween = (a, b) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)

/** An index option covers a hundred units of the index. */
export const CONTRACT_MULTIPLIER = 100

/**
 * How many contracts a rule permits, given what one of them risks.
 *
 * The risk budget is a ceiling, not a target: three contracts at $1,650 is
 * $4,950 against a $5,000 budget, and the fourth is simply not bought.
 */
export function sizePosition ({ equity, riskPct, maxLossPoints, multiplier = CONTRACT_MULTIPLIER }) {
  const contractRisk = maxLossPoints * multiplier
  const budget = equity * riskPct
  const contracts = contractRisk > 0 ? Math.floor(budget / contractRisk) : 0
  return {
    contracts,
    contractRisk,
    budget,
    riskDollars: contracts * contractRisk,
    affordable: contracts >= 1,
    // What a single contract would cost you as a share of the account, which
    // is the number that matters when the answer is zero.
    onePositionRiskPct: equity > 0 ? contractRisk / equity : Infinity,
    // And the account at which the rule would permit one.
    equityNeededForOne: riskPct > 0 ? contractRisk / riskPct : Infinity,
  }
}

/**
 * The account through time: one trade a period, sized on the equity standing
 * at the moment it is opened, compounding.
 *
 * `forceOneContract` overrides the sizing rule and buys one contract whenever
 * the account can absorb its worst case at all. It exists so the consequence
 * of breaking the rule can be measured rather than argued about, and every
 * trade it forces is counted in `overRiskTrades`.
 */
export function simulateAccount (sessions, {
  capital, riskPct = 0.05, from = null, to = null, forceOneContract = false,
  multiplier = CONTRACT_MULTIPLIER, cashRate = 0, start = 0, ...trade
} = {}) {
  let span = sessions
  if (from) span = span.filter((s) => s.date >= from)
  if (to) span = span.filter((s) => s.date <= to)

  // Everything else is forwarded whole. An earlier version named the keys it
  // would pass on, so pricingScale, skew, ivScale, r and wingPoints were
  // accepted and then silently dropped — which returns an identical answer to
  // anyone trying to stress the pricing, and reads as "pricing does not
  // matter" rather than "you were ignored".
  // structure defaults to 'single' downstream, whose maximum loss is a strike
  // or unbounded. An account is about defined risk, so the default here is the
  // two-legged one and a caller has to ask for the other.
  const raw = simulateSingle(span, { structure: 'spread', costPerLeg: 0.05, ...trade, start })
  let equity = capital
  let peak = capital
  let maxDrawdownPct = 0
  let skipped = 0
  let overRiskTrades = 0
  let maxSingleRiskPct = 0
  let ruined = false
  const trades = []

  for (const t of raw) {
    if (ruined) break
    const size = sizePosition({ equity, riskPct, maxLossPoints: t.maxLoss, multiplier })
    let contracts = size.contracts
    let forced = false
    if (contracts < 1 && forceOneContract) {
      // Only if the account could actually survive the worst case at all.
      if (size.contractRisk <= equity) { contracts = 1; forced = true } else { skipped++; continue }
    }
    if (contracts < 1) { skipped++; continue }

    const riskDollars = contracts * size.contractRisk
    const riskPctTaken = riskDollars / equity
    if (riskPctTaken > riskPct + 1e-12) { overRiskTrades++ }
    if (riskPctTaken > maxSingleRiskPct) maxSingleRiskPct = riskPctTaken

    const pnlDollars = t.pnl * contracts * multiplier
    const equityBefore = equity
    equity = equity + pnlDollars
    if (equity <= 0) { equity = 0; ruined = true }
    if (equity > peak) peak = equity
    const dd = peak > 0 ? (peak - equity) / peak : 0
    if (dd > maxDrawdownPct) maxDrawdownPct = dd

    trades.push({
      entryDate: t.entryDate,
      exitDate: t.exitDate,
      entryVix: t.entryVix,
      shortStrike: t.shortStrike,
      longStrike: t.longStrike,
      creditDollars: t.premiumIn * contracts * multiplier,
      maxLossPoints: t.maxLoss,
      contracts,
      forced,
      riskDollars,
      riskPctTaken,
      pnlPoints: t.pnl,
      pnlDollars,
      pnlPctOfRisk: t.pnlPctOfRisk,
      indexMovePct: t.movePct,
      equityBefore,
      equityAfter: equity,
    })
  }

  // Money that is not at risk is not idle: it earns the bill rate. At r = 0
  // an account that cannot afford a contract "ends where it started", which
  // is false, and it hides the fact that the bill rate is the thing the
  // strategy has to beat.
  let cashInterest = 0
  if (cashRate > 0 && span.length > 1) {
    const years = calendarDaysBetween(span[0].date, span[span.length - 1].date) / 365
    const grown = (capital + (equity - capital)) * Math.pow(1 + cashRate, years)
    cashInterest = grown - equity
    equity = grown
  }

  return {
    capital,
    finalEquity: equity,
    cashInterest,
    returnPct: (equity - capital) / capital,
    trades,
    n: trades.length,
    wins: trades.filter((t) => t.pnlDollars > 0).length,
    skipped,
    everTraded: trades.length > 0,
    overRiskTrades,
    maxSingleRiskPct,
    maxDrawdownPct,
    ruined,
    from: span.length ? span[0].date : null,
    to: span.length ? span[span.length - 1].date : null,
  }
}

/**
 * The same account run over every window of the same length the sample holds.
 *
 * One window is an anecdote. A nine-month run that happened to miss the one
 * bad month looks like a strategy and is a coincidence, and the only way to
 * see which you are looking at is to run all of them.
 */
export function windowResults (sessions, { months = 9, hold = 21, ...opts } = {}) {
  const length = months * hold
  const windows = []
  for (let i = 0; i + length < sessions.length; i++) {
    const slice = sessions.slice(i, i + length + 1)
    const r = simulateAccount(slice, { ...opts, hold, from: null, to: null })
    if (r.n < months - 1) continue
    windows.push({
      from: slice[0].date,
      to: slice[slice.length - 1].date,
      returnPct: r.returnPct,
      n: r.n,
      wins: r.wins,
      maxDrawdownPct: r.maxDrawdownPct,
      finalEquity: r.finalEquity,
      ruined: r.ruined,
    })
  }
  const sorted = [...windows].sort((a, b) => a.returnPct - b.returnPct)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]
  return {
    months,
    windows,
    count: windows.length,
    worst: sorted[0],
    p05: at(0.05),
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    p95: at(0.95),
    best: sorted[sorted.length - 1],
    mean: windows.reduce((a, w) => a + w.returnPct, 0) / windows.length,
    shareProfitable: windows.filter((w) => w.returnPct > 0).length / windows.length,
    shareRuined: windows.filter((w) => w.ruined).length / windows.length,
  }
}

/**
 * The same account run at every start offset the holding period allows.
 *
 * Every other study in this repo does this and says why: a monthly trade has
 * as many calendars as it has sessions in a month, and which one you happen to
 * be on moves the answer by more than most of the effects being measured. The
 * account study is the one that answers the question a person actually asks,
 * so it is the one that must not quietly pick a phase and report it as the
 * result.
 */
export function accountAcrossPhases (sessions, { hold = 21, ...opts } = {}) {
  const runs = []
  for (let start = 0; start < hold; start++) {
    const r = simulateAccount(sessions, { ...opts, hold, start })
    if (r.n === 0 && !r.everTraded && r.skipped === 0) continue
    runs.push({ start, ...r })
  }
  const sorted = [...runs].sort((a, b) => a.returnPct - b.returnPct)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]
  const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length
  return {
    phases: runs.length,
    runs,
    worst: sorted[0],
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    best: sorted[sorted.length - 1],
    meanReturnPct: mean((r) => r.returnPct),
    meanTrades: mean((r) => r.n),
    meanSkipped: mean((r) => r.skipped),
    worstDrawdownPct: Math.max(...runs.map((r) => r.maxDrawdownPct)),
    losingPhases: runs.filter((r) => r.returnPct < 0).length,
  }
}
