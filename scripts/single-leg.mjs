#!/usr/bin/env node
/**
 * One option, or two of the same kind. No condors.
 *
 * The condor is the right shape and the wrong thing to ask someone to place if
 * they cannot picture it. This script asks the same question of the simplest
 * trades there are — sell one put below the band, sell one call above it, and
 * the version of each with a second option bought further out so the worst
 * case is fixed on the day you open it.
 *
 * Every configuration is run at each start offset and averaged, so the figure
 * is not the luck of where the monthly grid happened to fall. That removes a
 * bias; it adds no evidence. The independent sample is one phase's worth of
 * non-overlapping periods, about 127 months over the decade.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { simulateSingle, summarisePremium, singleMarginPath } from '../lib/premium.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const S = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/market-long.json'), 'utf8')).sessions
const pct = (x, d = 1) => x == null ? '   — ' : (x * 100).toFixed(d).padStart(5) + '%'
const f2 = (x) => x == null ? '  —  ' : x.toFixed(2).padStart(6)

const COST = 0.05 // per leg, in index points, the study's standing assumption

function maxDrawdown (trades) {
  let peak = 0; let run = 0; let dd = 0; let at = null
  for (const t of trades) {
    run += t.pnl
    if (run > peak) peak = run
    if (peak - run > dd) { dd = peak - run; at = t.exitDate }
  }
  return { drawdown: dd, endedAt: at, total: run }
}

/** One configuration at every start offset, averaged. */
function acrossPhases (opts) {
  const runs = []
  for (let start = 0; start < opts.hold; start++) {
    const trades = simulateSingle(S, { ...opts, start, costPerLeg: COST })
    if (trades.length < 5) continue
    const s = summarisePremium(trades)
    const dd = maxDrawdown(trades)
    const risk = trades.map((t) => t.maxLoss).filter(Number.isFinite)
    const meanRisk = risk.length ? risk.reduce((a, b) => a + b, 0) / risk.length : null
    runs.push({
      start, ...s, maxDrawdown: dd.drawdown,
      meanRisk,
      // The only return a defined-risk trade can be sized by.
      returnOnRisk: meanRisk ? s.meanPnl / meanRisk : null,
      fullLosses: trades.filter((t) => Number.isFinite(t.maxLoss) && t.pnl <= -0.995 * t.maxLoss).length / trades.length,
      creditShare: meanRisk ? s.meanPremiumIn / (s.meanPremiumIn + meanRisk) : null,
    })
  }
  const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length
  return {
    phases: runs.length,
    n: Math.round(mean((r) => r.n)),
    winRate: mean((r) => r.winRate.point),
    winRateWorstPhase: Math.min(...runs.map((r) => r.winRate.point)),
    meanPnl: mean((r) => r.meanPnl),
    meanPnlWorstPhase: Math.min(...runs.map((r) => r.meanPnl)),
    returnOnRisk: mean((r) => r.returnOnRisk),
    returnOnRiskWorstPhase: Math.min(...runs.map((r) => r.returnOnRisk ?? Infinity)),
    meanRisk: mean((r) => r.meanRisk),
    meanPremiumIn: mean((r) => r.meanPremiumIn),
    creditShare: mean((r) => r.creditShare),
    fullLosses: mean((r) => r.fullLosses),
    worst: mean((r) => r.worst),
    worstOfAnyPhase: Math.min(...runs.map((r) => r.worst)),
    maxDrawdown: mean((r) => r.maxDrawdown),
    maxDrawdownWorstPhase: Math.max(...runs.map((r) => r.maxDrawdown)),
    profitablePhases: runs.filter((r) => r.meanPnl > 0).length,
    meanPnlRange: [Math.min(...runs.map((r) => r.meanPnl)), Math.max(...runs.map((r) => r.meanPnl))],
    independentPeriods: Math.round(mean((r) => r.n)),
    phasesAreResamples: true,
  }
}

const out = {
  generated: '2026-09-21',
  span: { from: S[0].date, to: S[S.length - 1].date, sessions: S.length },
  method: 'One short option at the expected-move band, or two of the same kind, held to expiry on a cash-settled European index option. Priced off the VIX close of the entry session. Five cents a leg in costs. Averaged over every start offset.',
  sampleWarning: 'Phases are resamplings of one decade, not independent samples. Any interval read off the pooled trade count would be about four and a half times too narrow.',
}

// ── 1. the grid
out.grid = []
for (const hold of [10, 21]) {
  for (const widthSigma of [0.75, 1, 1.25, 1.5]) {
    for (const side of ['put', 'call']) {
      for (const structure of ['single', 'spread']) {
        out.grid.push({
          hold, widthSigma, side, structure, wingSigma: structure === 'spread' ? 0.5 : null,
          ...acrossPhases({ hold, widthSigma, side, structure, wingSigma: 0.5 }),
        })
      }
    }
  }
}

// ── 2. the spread grid alone, ranked by the only figure that sizes a trade
out.spreads = out.grid.filter((r) => r.structure === 'spread')
  .sort((a, b) => b.returnOnRisk - a.returnOnRisk)

// ── 3. does the put side or the call side pay, and is the difference real?
out.sides = []
for (const hold of [21]) {
  for (const widthSigma of [1, 1.25]) {
    const put = acrossPhases({ hold, widthSigma, side: 'put', structure: 'spread', wingSigma: 0.5 })
    const call = acrossPhases({ hold, widthSigma, side: 'call', structure: 'spread', wingSigma: 0.5 })
    out.sides.push({ hold, widthSigma, put, call, difference: put.returnOnRisk - call.returnOnRisk })
  }
}

// ── 4. the fill floor: how much credit the trade needs to survive at all
out.fillFloor = []
for (const r of out.spreads.slice(0, 4)) {
  const opts = { hold: r.hold, widthSigma: r.widthSigma, side: r.side, structure: 'spread', wingSigma: 0.5 }
  const floors = []
  for (let scale = 1; scale >= 0.3; scale -= 0.02) {
    const a = acrossPhases({ ...opts, pricingScale: scale })
    floors.push({ scale, creditShare: a.creditShare, returnOnRisk: a.returnOnRisk })
  }
  const last = floors.filter((f) => f.returnOnRisk > 0).pop()
  out.fillFloor.push({
    hold: r.hold, widthSigma: r.widthSigma, side: r.side,
    modelCreditShare: r.creditShare,
    floorCreditShare: last ? last.creditShare : null,
    curve: floors,
  })
}

// ── 5. year by year, for the two that lead their side
out.byYear = []
for (const cfg of [
  { side: 'call', widthSigma: 1.25, hold: 21 },
  { side: 'put', widthSigma: 0.75, hold: 21 },
  { side: 'call', widthSigma: 1, hold: 21 },
]) {
  const years = new Map()
  // Every phase, so a year is not one grid's luck.
  for (let start = 0; start < cfg.hold; start++) {
    for (const t of simulateSingle(S, { ...cfg, structure: 'spread', wingSigma: 0.5, start, costPerLeg: COST })) {
      const y = t.exitDate.slice(0, 4)
      if (!years.has(y)) years.set(y, [])
      years.get(y).push(t)
    }
  }
  const rows = [...years.entries()].sort().map(([year, ts]) => {
    const risk = ts.reduce((a, t) => a + t.maxLoss, 0) / ts.length
    const pnl = ts.reduce((a, t) => a + t.pnl, 0) / ts.length
    return {
      year,
      trades: Math.round(ts.length / cfg.hold),
      winRate: ts.filter((t) => t.pnl > 0).length / ts.length,
      returnOnRisk: pnl / risk,
      worst: Math.min(...ts.map((t) => t.pnlPctOfRisk)),
    }
  })
  out.byYear.push({ ...cfg, rows })
}

// ── 6. the reward against the risk, in the form the question was asked
out.rewardToRisk = []
for (const cfg of [
  { side: 'call', widthSigma: 1.25, hold: 21 },
  { side: 'call', widthSigma: 1, hold: 21 },
  { side: 'put', widthSigma: 0.75, hold: 21 },
  { side: 'put', widthSigma: 1, hold: 21 },
]) {
  const all = []
  for (let start = 0; start < cfg.hold; start++) {
    all.push(...simulateSingle(S, { ...cfg, structure: 'spread', wingSigma: 0.5, start, costPerLeg: COST }))
  }
  const r = all.map((t) => t.pnlPctOfRisk)
  const wins = r.filter((x) => x > 0)
  const losses = r.filter((x) => x <= 0)
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
  out.rewardToRisk.push({
    ...cfg,
    winRate: wins.length / r.length,
    meanWin: mean(wins),
    meanLoss: mean(losses),
    rewardToRisk: Math.abs(mean(wins) / mean(losses)),
    expectancy: mean(r),
    // The break-even win rate this reward-to-risk demands. A trade only pays
    // if the measured rate clears it, and the gap is the whole edge.
    breakEvenWinRate: Math.abs(mean(losses)) / (mean(wins) + Math.abs(mean(losses))),
  })
}

// ── 7. the single leg's catch: can the account still be there at expiry?
{
  const all = []
  // Every phase, so the crash month cannot fall between the grid lines.
  for (let start = 0; start < 21; start++) {
    all.push(...simulateSingle(S, { hold: 21, widthSigma: 1, side: 'put', structure: 'single', start, costPerLeg: COST }))
  }
  const worst = [...all].sort((a, b) => a.pnl - b.pnl)[0]
  const path = singleMarginPath(S, worst, { funding: 1 })
  // The same month in the two-legged version, for the comparison that matters.
  const spread = []
  for (let start = 0; start < 21; start++) {
    spread.push(...simulateSingle(S, { hold: 21, widthSigma: 1, side: 'put', structure: 'spread', wingSigma: 0.5, start, costPerLeg: COST }))
  }
  const twin = spread.find((t) => t.entryDate === worst.entryDate)
  out.nakedCatch = {
    worstTrade: { entryDate: worst.entryDate, exitDate: worst.exitDate, strike: worst.strike, S1: worst.S1, pnl: worst.pnl, premiumIn: worst.premiumIn },
    lossAsMultipleOfCredit: Math.abs(worst.pnl) / worst.premiumIn,
    initialMargin: path.initialMargin,
    peakMultiple: path.peakMultiple,
    calledOn: path.calledOn,
    sameMonthAsSpread: twin ? { pnl: twin.pnl, maxLoss: twin.maxLoss, pnlPctOfRisk: twin.pnlPctOfRisk } : null,
    note: 'A single short option is not defined risk. The spread version posts its worst case on day one and cannot be called for more.',
  }
}

writeFileSync(join(ROOT, 'data/em/single-leg-spy.json'), JSON.stringify(out, null, 2) + '\n')

// ── print
console.log(`SPY ${out.span.from} → ${out.span.to}, ${out.span.sessions} sessions\n`)
console.log('ONE OPTION, OR TWO OF THE SAME KIND, SOLD AT THE BAND AND HELD TO EXPIRY')
console.log('side  structure  width  hold     n     win   worst phase   on risk   worst phase  loses it all')
for (const r of out.grid) {
  console.log(`${r.side.padEnd(5)} ${r.structure.padEnd(9)} ${String(r.widthSigma).padStart(5)}σ ${String(r.hold).padStart(5)} ${String(r.n).padStart(5)}  ${pct(r.winRate)}       ${pct(r.winRateWorstPhase)}   ${r.returnOnRisk == null ? '   —  ' : pct(r.returnOnRisk)}        ${r.returnOnRiskWorstPhase == null || !Number.isFinite(r.returnOnRiskWorstPhase) ? '   —  ' : pct(r.returnOnRiskWorstPhase)}       ${pct(r.fullLosses)}`)
}

console.log('\nTHE TWO-LEG VERSIONS, RANKED BY RETURN ON THE MOST YOU CAN LOSE')
console.log('side  width  hold     n     win   on risk  worst phase  profitable phases  max drawdown')
for (const r of out.spreads) {
  console.log(`${r.side.padEnd(5)} ${String(r.widthSigma).padStart(5)}σ ${String(r.hold).padStart(5)} ${String(r.n).padStart(5)}  ${pct(r.winRate)}  ${pct(r.returnOnRisk)}       ${pct(r.returnOnRiskWorstPhase)}          ${String(r.profitablePhases).padStart(2)} of ${r.phases}      ${f2(r.maxDrawdown)}`)
}

console.log('\nWHICH SIDE PAYS')
for (const s of out.sides) {
  console.log(`${s.widthSigma}σ, ${s.hold} sessions: put spread ${pct(s.put.returnOnRisk)} on risk at ${pct(s.put.winRate)} wins; call spread ${pct(s.call.returnOnRisk)} at ${pct(s.call.winRate)}. Difference ${pct(s.difference)}.`)
}

console.log('\nTHE FILL FLOOR: the credit below which each trade has no edge left')
for (const f of out.fillFloor) {
  console.log(`${f.side} spread ${f.widthSigma}σ over ${f.hold} sessions: the model takes ${pct(f.modelCreditShare)} of the width in credit; below ${pct(f.floorCreditShare)} it stops paying.`)
}

console.log('\nTHE QUESTION AS IT WAS ASKED: how often it wins, and what it pays when it does')
console.log('side  width  hold     win    mean win   mean loss    R:R   needs    edge')
for (const r of out.rewardToRisk) {
  console.log(`${r.side.padEnd(5)} ${String(r.widthSigma).padStart(5)}σ ${String(r.hold).padStart(5)}   ${pct(r.winRate)}     ${pct(r.meanWin)}     ${pct(r.meanLoss)}  ${f2(r.rewardToRisk)}  ${pct(r.breakEvenWinRate)}  ${pct(r.winRate - r.breakEvenWinRate)}`)
}

console.log('\nYEAR BY YEAR, EVERY START DATE AVERAGED')
for (const g of out.byYear) {
  console.log(`\n${g.side} spread ${g.widthSigma}σ, ${g.hold} sessions`)
  console.log('year   trades     win   on risk   worst single trade')
  for (const r of g.rows) {
    console.log(`${r.year}  ${String(r.trades).padStart(6)}  ${pct(r.winRate)}    ${pct(r.returnOnRisk)}              ${pct(r.worst)}`)
  }
}

console.log(`\nTHE SINGLE LEG'S CATCH`)
console.log(`Worst month for a naked 1σ put, over every start date: ${out.nakedCatch.worstTrade.entryDate} → ${out.nakedCatch.worstTrade.exitDate}, ${f2(out.nakedCatch.worstTrade.pnl)} index points, which is ${out.nakedCatch.lossAsMultipleOfCredit.toFixed(1)} times the credit it collected.`)
console.log(`The requirement grew to ${out.nakedCatch.peakMultiple.toFixed(1)} times what the account was funded with, and the broker called on ${out.nakedCatch.calledOn ?? 'no session'} — ${out.nakedCatch.calledOn ? 'before' : 'never before'} the expiry the backtest books.`)
if (out.nakedCatch.sameMonthAsSpread) {
  console.log(`The same month in the two-legged version lost ${f2(out.nakedCatch.sameMonthAsSpread.pnl)} points, which was ${pct(-out.nakedCatch.sameMonthAsSpread.pnlPctOfRisk)} of a maximum known on the day it was opened.`)
}
console.log('\ndata/em/single-leg-spy.json written')
