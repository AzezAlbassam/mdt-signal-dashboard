#!/usr/bin/env node
/**
 * The low-frequency study. One trade per holding period, held to expiry,
 * settled on the terminal price like a European index option.
 *
 * Every grid is run at every possible start offset, because a monthly grid has
 * a phase and the answer moves with it: a window that straddles a crash is a
 * different trade from one that starts the day after.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  variancePremium, simulatePremium, summarisePremium, horizons, realisedVol, marginPath,
} from '../lib/premium.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const S = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/market-long.json'), 'utf8')).sessions
// The wing that survives four legs of commission. A quarter sigma leaves too
// little credit and is under water at 0.20 a leg; a half sigma still earns
// there and at 0.30. See tests/premium.test.js.
const WING = 0.5
const pct = (x, d = 1) => x == null ? '   —' : (x * 100).toFixed(d).padStart(5) + '%'
const f2 = (x) => x == null ? '  — ' : x.toFixed(2).padStart(6)

const out = {
  generated: '2026-09-21',
  sampleWarning: 'Every configuration is run at each start offset and averaged, which removes the luck of where the grid falls. It does not add evidence: 21 phases over one decade are 21 resamplings of the same sessions, so the independent sample is roughly the number of non-overlapping periods in a single phase, about 127 months. Any confidence interval read off the pooled trade count would be about four and a half times too narrow.',
  pricingWarning: 'Both the strikes and the credit come from the same sigma = VIX/100. The mean credit and the mean profit are therefore a restatement of the measured variance risk premium, not independent confirmation of it. Only a real bid and ask would be that.',
  span: { from: S[0].date, to: S[S.length - 1].date, sessions: S.length },
  note: 'Model-priced on real index paths. sigma is the VIX close of the entry session, which for a 21-session at-the-money option is close to a real quote on this index. Skew is set to zero by default, which pays a seller less than the real surface would.',
}

// ── 1. the variance risk premium: the only thing a seller is paid for
out.variancePremium = {}
for (const hold of [10, 21]) {
  const v = variancePremium(S, { hold })
  out.variancePremium[hold] = {
    n: v.n, hold, cuts: v.cuts,
    ratioOfMeans: v.ratioOfMeans, meanImplied: v.meanImplied, meanRealised: v.meanRealised,
    meanRatio: v.meanRatio, medianRatio: v.medianRatio, meanDiff: v.meanDiff,
    shareImpliedHigher: v.shareImpliedHigher, worstDiff: v.worstDiff,
    byRegime: v.byRegime,
  }
}

/** Drawdown of the running total, which is what decides whether you survive. */
function maxDrawdown (trades) {
  let peak = 0; let run = 0; let dd = 0; let at = null
  for (const t of trades) {
    run += t.pnl
    if (run > peak) peak = run
    if (peak - run > dd) { dd = peak - run; at = t.entryDate }
  }
  return { drawdown: dd, endedAt: at, total: run }
}

/**
 * One configuration, run at every start offset the holding period allows, so
 * the reported figure is not an artefact of where the grid happened to fall.
 */
function acrossPhases (opts) {
  const runs = []
  for (let start = 0; start < opts.hold; start++) {
    const trades = simulatePremium(S, { ...opts, start })
    // A phase is kept unless it is too small to summarise at all. An earlier
    // threshold of twenty dropped whole phases once an entry filter thinned
    // them, and it dropped exactly the phases the filter had thinned most,
    // which flattered every filtered result.
    if (trades.length < 5) continue
    const s = summarisePremium(trades)
    const dd = maxDrawdown(trades)
    runs.push({ start, ...s, maxDrawdown: dd.drawdown, drawdownEndedAt: dd.endedAt })
  }
  const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length
  const totalTrades = runs.reduce((a, r) => a + r.n, 0)
  const weighted = (f) => runs.reduce((a, r) => a + f(r) * r.n, 0) / totalTrades
  return {
    phases: runs.length,
    n: Math.round(mean((r) => r.n)),
    winRate: mean((r) => r.winRate.point),
    winRateWorstPhase: Math.min(...runs.map((r) => r.winRate.point)),
    meanPnl: mean((r) => r.meanPnl),
    meanPnlWorstPhase: Math.min(...runs.map((r) => r.meanPnl)),
    meanPnlPctOfIndex: mean((r) => r.meanPnlPctOfIndex),
    meanPremiumIn: mean((r) => r.meanPremiumIn),
    returnOnPremium: mean((r) => r.returnOnPremium),
    worst: mean((r) => r.worst),
    worstOfAnyPhase: Math.min(...runs.map((r) => r.worst)),
    worstAsMultipleOfMeanWin: mean((r) => r.worstAsMultipleOfMeanWin),
    maxDrawdown: mean((r) => r.maxDrawdown),
    maxDrawdownWorstPhase: Math.max(...runs.map((r) => r.maxDrawdown)),
    totalPnl: mean((r) => r.totalPnl),
    // How much of everything the strategy ever made does its worst single
    // period take back. Meaningless when the strategy made nothing, so it is
    // reported as null rather than as a very large number.
    worstAsShareOfTotal: (() => {
      const good = runs.filter((r) => r.totalPnl > 0)
      return good.length ? good.reduce((a, r) => a + Math.abs(r.worst) / r.totalPnl, 0) / good.length : null
    })(),
    periodsOfProfitInWorst: (() => {
      const good = runs.filter((r) => r.meanPnl > 0.01)
      return good.length ? good.reduce((a, r) => a + Math.abs(r.worst) / r.meanPnl, 0) / good.length : null
    })(),
    profitablePhases: runs.filter((r) => r.meanPnl > 0).length,
    // Weighted by how many trades each phase actually had, so a thin phase
    // cannot carry the same weight as a full one.
    weightedMeanPnl: weighted((r) => r.meanPnl),
    meanPnlRange: [Math.min(...runs.map((r) => r.meanPnl)), Math.max(...runs.map((r) => r.meanPnl))],
    // Twenty-one phases over the same decade are not twenty-one samples. The
    // independent evidence is one phase's worth of non-overlapping periods.
    independentPeriods: Math.round(mean((r) => r.n)),
    phasesAreResamples: true,
  }
}

// ── 2. the structure grid
out.grid = []
for (const hold of [10, 21]) {
  for (const widthSigma of [1, 1.5, 2]) {
    for (const structure of ['strangle', 'condor']) {
      const base = { hold, widthSigma, structure, costPerLeg: 0.05 }
      const opts = structure === 'condor' ? { ...base, wingSigma: WING } : base
      out.grid.push({ hold, widthSigma, structure, wingSigma: structure === 'condor' ? WING : null, ...acrossPhases(opts) })
    }
  }
}

// ── 3. what the assumptions are worth
out.sensitivity = { skew: [], costs: [], ivScale: [], pricingScale: [] }
for (const skew of [0, 0.05, 0.10, 0.15]) {
  out.sensitivity.skew.push({ skew, ...acrossPhases({ hold: 21, widthSigma: 2, structure: 'strangle', skew, costPerLeg: 0.05 }) })
}
for (const costPerLeg of [0, 0.05, 0.10, 0.20]) {
  out.sensitivity.costs.push({ costPerLeg, ...acrossPhases({ hold: 21, widthSigma: 2, structure: 'strangle', costPerLeg }) })
}
// A ten-session option is shorter than the thirty days VIX measures.
for (const ivScale of [0.85, 0.92, 1, 1.1]) {
  out.sensitivity.ivScale.push({ ivScale, ...acrossPhases({ hold: 10, widthSigma: 2, structure: 'strangle', ivScale, costPerLeg: 0.05 }) })
}

// VIX is a variance swap rate over the whole strip, not the at-the-money quote,
// and it sits above it. Leaving the strikes where the chart drew them and
// pricing the legs lower is the honest version of that doubt.
for (const pricingScale of [1, 0.97, 0.95, 0.92, 0.90, 0.85]) {
  for (const [label, opts] of [
    ['strangle1', { hold: 21, widthSigma: 1, structure: 'strangle', costPerLeg: 0.05 }],
    ['condor1', { hold: 21, widthSigma: 1, structure: 'condor', wingSigma: WING, costPerLeg: 0.05 }],
  ]) {
    out.sensitivity.pricingScale.push({ pricingScale, label, ...acrossPhases({ ...opts, pricingScale }) })
  }
}

// Which wing. The narrow one looks cheaper and dies to commission.
out.wingSweep = [0.25, 0.5, 0.75, 1].map((wingSigma) => ({
  wingSigma,
  ...acrossPhases({ hold: 21, widthSigma: 1, structure: 'condor', wingSigma, costPerLeg: 0.05 }),
  atHighCost: acrossPhases({ hold: 21, widthSigma: 1, structure: 'condor', wingSigma, costPerLeg: 0.20 }).meanPnl,
}))

// ── 4. does waiting for a rich premium help?
out.regimeFilter = []
for (const minVix of [null, 15, 18, 20, 25]) {
  out.regimeFilter.push({
    minVix,
    ...acrossPhases({ hold: 21, widthSigma: 2, structure: 'strangle', minVix, costPerLeg: 0.05 }),
  })
}

// ── 5. out of sample: does anything fitted before 2022 still work after it?
{
  const before = S.filter((s) => s.date < '2022-01-01')
  const after = S.filter((s) => s.date >= '2022-01-01')
  const run = (rows, opts) => {
    const all = []
    for (let start = 0; start < opts.hold; start++) {
      const t = simulatePremium(rows, { ...opts, start })
      if (t.length >= 10) all.push(summarisePremium(t))
    }
    return {
      n: Math.round(all.reduce((a, r) => a + r.n, 0) / all.length),
      winRate: all.reduce((a, r) => a + r.winRate.point, 0) / all.length,
      meanPnl: all.reduce((a, r) => a + r.meanPnl, 0) / all.length,
      worstOfAnyPhase: Math.min(...all.map((r) => r.worst)),
    }
  }
  out.outOfSample = {}
  for (const widthSigma of [1, 2]) {
    const opts = { hold: 21, widthSigma, structure: 'strangle', costPerLeg: 0.05 }
    out.outOfSample[`strangle${widthSigma}`] = { fit: run(before, opts), test: run(after, opts) }
  }
}

// ── 5b. which years carry it
{
  out.byYear = {}
  for (const [label, opts] of [
    ['strangle1', { hold: 21, widthSigma: 1, structure: 'strangle', costPerLeg: 0.05 }],
    ['condor1', { hold: 21, widthSigma: 1, structure: 'condor', wingSigma: WING, costPerLeg: 0.05 }],
  ]) {
    const byYear = {}
    for (let start = 0; start < opts.hold; start++) {
      for (const t of simulatePremium(S, { ...opts, start })) {
        const y = t.entryDate.slice(0, 4)
        // In points a credit grows with the index, so a decade that tripled
        // makes the later years look better than they were. Basis points of
        // the index at entry is the comparable unit.
        ;(byYear[y] ??= []).push({ pnl: t.pnl, bp: 10000 * t.pnl / t.S0 })
      }
    }
    out.byYear[label] = Object.fromEntries(Object.entries(byYear).sort().map(([y, v]) => [y, {
      periods: Math.round(v.length / opts.hold),
      meanPnl: v.reduce((a, b) => a + b.pnl, 0) / v.length,
      meanBp: v.reduce((a, b) => a + b.bp, 0) / v.length,
      worst: Math.min(...v.map((x) => x.pnl)),
      worstBp: Math.min(...v.map((x) => x.bp)),
      shareLosing: v.filter((x) => x.pnl < 0).length / v.length,
    }]))
  }
}

// ── 5c. could you still be there at expiry?
{
  out.margin = {}
  for (const [label, opts] of [
    ['strangle1', { hold: 21, widthSigma: 1, structure: 'strangle', costPerLeg: 0.05 }],
    ['strangle2', { hold: 21, widthSigma: 2, structure: 'strangle', costPerLeg: 0.05 }],
    ['condor1', { hold: 21, widthSigma: 1, structure: 'condor', wingSigma: WING, costPerLeg: 0.05 }],
  ]) {
    const all = []
    for (let start = 0; start < opts.hold; start++) {
      for (const t of simulatePremium(S, { ...opts, start })) all.push({ t, p: marginPath(S, t) })
    }
    const mult = all.map((x) => x.p.peakMultiple).sort((a, b) => a - b)
    const liq = all.filter((x) => x.p.liquidatedOn != null)
    const worst = all.reduce((a, b) => (b.t.pnl < a.t.pnl ? b : a))
    out.margin[label] = {
      trades: all.length,
      meanInitialMargin: all.reduce((a, x) => a + x.p.initialMargin, 0) / all.length,
      meanReturnOnMargin: all.reduce((a, x) => a + x.t.pnl / x.p.initialMargin, 0) / all.length,
      medianPeakMultiple: mult[Math.floor(mult.length / 2)],
      worstPeakMultiple: mult[mult.length - 1],
      liquidated: liq.length,
      liquidatedShare: liq.length / all.length,
      worstWindow: {
        entryDate: worst.t.entryDate, exitDate: worst.t.exitDate, pnl: worst.t.pnl,
        entryVix: worst.t.entryVix, initialMargin: worst.p.initialMargin,
        peakMultiple: worst.p.peakMultiple, liquidatedOn: worst.p.liquidatedOn,
        settledLossAsShareOfMargin: worst.t.pnl / worst.p.initialMargin,
      },
    }
  }
  out.margin.note = 'A backtest that settles every trade assumes you were never closed out. A defined-risk position posts its whole worst case on day one, so that is true of it. A naked one does not.'
}

// ── 5d. what it looks like sized to risk one unit a month
{
  out.sizing = {}
  for (const [label, opts] of [
    ['condor1', { hold: 21, widthSigma: 1, structure: 'condor', wingSigma: WING, costPerLeg: 0.05 }],
    ['condor15', { hold: 21, widthSigma: 1.5, structure: 'condor', wingSigma: WING, costPerLeg: 0.05 }],
  ]) {
    const totals = []; const dds = []; const streaks = []
    for (let start = 0; start < opts.hold; start++) {
      const trades = simulatePremium(S, { ...opts, start })
      let run = 0; let peak = 0; let dd = 0; let cur = 0; let worstRun = 0
      for (const t of trades) {
        // Each month risks exactly one unit, so the series is comparable and
        // the drawdown is in units of a single month's stake.
        const u = t.pnl / t.maxLoss
        run += u
        if (run > peak) peak = run
        if (peak - run > dd) dd = peak - run
        cur = u < 0 ? cur + 1 : 0
        if (cur > worstRun) worstRun = cur
      }
      totals.push(run); dds.push(dd); streaks.push(worstRun)
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
    out.sizing[label] = {
      months: Math.round(simulatePremium(S, { ...opts, start: 0 }).length),
      totalInStakes: mean(totals),
      totalRange: [Math.min(...totals), Math.max(...totals)],
      worstDrawdownInStakes: mean(dds),
      worstDrawdownAnyPhase: Math.max(...dds),
      longestLosingStreak: mean(streaks),
      longestLosingStreakAnyPhase: Math.max(...streaks),
    }
  }
  out.sizing.note = 'Risking one unit a month, the decade returns about fourteen units and the worst drawdown is about three, four in the unluckiest phase. Risk one per cent of an account a month and that is roughly fourteen per cent over the decade against a four per cent drawdown. Risk ten per cent a month for a meaningful return and the drawdown is forty.'
}

// ── 6. how thin is the tail estimate?
{
  const trades = simulatePremium(S, { hold: 21, widthSigma: 2, structure: 'strangle', costPerLeg: 0.05 })
  const losers = trades.filter((t) => t.pnl < 0).sort((a, b) => a.pnl - b.pnl)
  out.tail = {
    n: trades.length,
    losingMonths: losers.length,
    worstFive: losers.slice(0, 5).map((t) => ({ entryDate: t.entryDate, exitDate: t.exitDate, movePct: t.movePct, pnl: t.pnl, entryVix: t.entryVix })),
    note: 'The whole tail estimate rests on this handful of months. A decade holds very few crashes and the next one need not resemble them.',
  }
  const v = variancePremium(S, { hold: 21 })
  out.tail.worstVarianceMonths = [...v.rows].sort((a, b) => a.diff - b.diff).slice(0, 5)
    .map((r) => ({ entryDate: r.entryDate, vix: r.vix, realised: r.realised, diff: r.diff }))
}

writeFileSync(join(ROOT, 'data/em/premium-spy.json'), JSON.stringify(out, null, 2) + '\n')

// ── print
console.log(`SPY ${out.span.from} → ${out.span.to}\n`)
console.log('VARIANCE RISK PREMIUM (implied at entry against realised over the period)')
for (const [hold, v] of Object.entries(out.variancePremium)) {
  console.log(`  ${hold}-session periods, n=${v.n}: mean implied ${(v.meanImplied * 100).toFixed(2)} against mean realised ${(v.meanRealised * 100).toFixed(2)} = ${v.ratioOfMeans.toFixed(3)}  (mean of ratios ${v.meanRatio.toFixed(3)}, upward biased)  implied higher ${pct(v.shareImpliedHigher)}  worst ${(v.worstDiff * 100).toFixed(1)} vol points`)
  for (const g of ['low', 'mid', 'high']) {
    const b = v.byRegime[g]
    console.log(`     ${g.padEnd(5)} n=${String(b.n).padStart(3)}  implied/realised ${b.ratioOfMeans.toFixed(3)}  higher ${pct(b.shareImpliedHigher)}`)
  }
}

console.log('\nSTRUCTURE GRID (averaged over every start offset; costs $0.05 a leg)')
console.log('hold width structure  n   win    credit  meanP&L  worst  worst(any) maxDD  worst as share of all profit  phases in profit')
for (const g of out.grid) {
  const share = g.worstAsShareOfTotal == null ? '   —  ' : (g.worstAsShareOfTotal * 100).toFixed(0).padStart(4) + '%'
  console.log(`${String(g.hold).padStart(4)} ${g.widthSigma.toFixed(1)}σ  ${g.structure.padEnd(9)}${String(g.n).padStart(4)} ${pct(g.winRate)} ${f2(g.meanPremiumIn)}  ${f2(g.meanPnl)}  ${f2(g.worst)} ${f2(g.worstOfAnyPhase)} ${f2(g.maxDrawdown)}        ${share}                ${g.profitablePhases}/${g.phases}`)
}

console.log('\nWHAT THE ASSUMPTIONS ARE WORTH (21 sessions, 2σ strangle)')
for (const r of out.sensitivity.skew) console.log(`  2σ skew ${r.skew.toFixed(2)}   mean ${f2(r.meanPnl)}  win ${pct(r.winRate)}`)
for (const skew of [0, 0.05, 0.10, 0.15]) {
  const r = acrossPhases({ hold: 21, widthSigma: 1, structure: 'strangle', skew, costPerLeg: 0.05 })
  out.sensitivity.skew.push({ skew, widthSigma: 1, ...r })
  console.log(`  1σ skew ${skew.toFixed(2)}   mean ${f2(r.meanPnl)}  win ${pct(r.winRate)}  credit ${f2(r.meanPremiumIn)}`)
}
for (const r of out.sensitivity.costs) console.log(`  cost ${r.costPerLeg.toFixed(2)}/leg  mean ${f2(r.meanPnl)}  win ${pct(r.winRate)}`)
console.log('  ten-session periods priced off a thirty-day volatility:')
for (const r of out.sensitivity.ivScale) console.log(`    ivScale ${r.ivScale.toFixed(2)}  mean ${f2(r.meanPnl)}  win ${pct(r.winRate)}  worst ${f2(r.worstOfAnyPhase)}`)

console.log('\nWHICH WING (1σ shorts, 21 sessions)')
console.log('  wing    win     mean   ret/risk   mean max loss   mean at 0.20 a leg')
for (const w of out.wingSweep) {
  console.log(`  ${w.wingSigma.toFixed(2)}σ   ${pct(w.winRate)} ${f2(w.meanPnl)}              ${f2(w.meanPremiumIn)}        ${f2(w.atHighCost)}`)
}

console.log('\nIF VIX OVERSTATES THE AT-THE-MONEY QUOTE (strikes unmoved, legs priced lower)')
for (const r of out.sensitivity.pricingScale) {
  console.log(`  ${r.label.padEnd(10)} quote at ${r.pricingScale.toFixed(2)} x VIX   mean ${f2(r.meanPnl)}  win ${pct(r.winRate)}  worst ${f2(r.worstOfAnyPhase)}`)
}

console.log('\nWAITING FOR A RICHER PREMIUM (21 sessions, 2σ strangle)')
console.log('  every phase kept; the simple mean and the trade-weighted mean are both shown because a filter thins the phases unevenly')
for (const r of out.regimeFilter) {
  console.log(`  VIX ≥ ${String(r.minVix ?? 'any').padStart(3)}  periods=${String(r.independentPeriods).padStart(3)}  win ${pct(r.winRate)}  mean ${f2(r.meanPnl)}  weighted ${f2(r.weightedMeanPnl)}  range ${f2(r.meanPnlRange[0])} to ${f2(r.meanPnlRange[1])}  worst ${f2(r.worstOfAnyPhase)}`)
}

console.log('\nOUT OF SAMPLE (fit span before 2022, test span from 2022)')
for (const [k, v] of Object.entries(out.outOfSample)) {
  console.log(`  ${k}: fit n=${v.fit.n} win ${pct(v.fit.winRate)} mean ${f2(v.fit.meanPnl)} | test n=${v.test.n} win ${pct(v.test.winRate)} mean ${f2(v.test.meanPnl)} worst ${f2(v.test.worstOfAnyPhase)}`)
}

console.log('\nCOULD YOU STILL BE THERE AT EXPIRY? (account funded at the initial requirement)')
for (const [k, m] of Object.entries(out.margin)) {
  if (k === 'note') continue
  const w = m.worstWindow
  console.log(`  ${k.padEnd(10)} mean margin ${f2(m.meanInitialMargin)}  return on margin ${pct(m.meanReturnOnMargin, 2)}/period  median peak ${m.medianPeakMultiple.toFixed(2)}x  closed out ${m.liquidated}/${m.trades}`)
  console.log(`             worst window ${w.entryDate} to ${w.exitDate}, VIX ${w.entryVix.toFixed(1)} at entry, peak ${w.peakMultiple.toFixed(2)}x, ${w.liquidatedOn ? 'CLOSED OUT ' + w.liquidatedOn : 'survived'}, settled loss ${pct(w.settledLossAsShareOfMargin, 0)} of margin`)
}

console.log('\nWHICH YEARS CARRY IT (21 sessions, 1σ, every phase pooled)')
console.log('       naked strangle            defined-risk condor')
console.log('year   mean bp   worst bp    |   mean bp   worst bp')
for (const y of Object.keys(out.byYear.strangle1)) {
  const a = out.byYear.strangle1[y]; const b = out.byYear.condor1[y]
  console.log(`${y}   ${a.meanBp.toFixed(0).padStart(6)}   ${a.worstBp.toFixed(0).padStart(7)}    |   ${b.meanBp.toFixed(0).padStart(6)}   ${b.worstBp.toFixed(0).padStart(7)}`)
}

console.log('\nSIZED TO RISK ONE UNIT A MONTH')
for (const [k, z] of Object.entries(out.sizing)) {
  if (k === 'note') continue
  console.log(`  ${k.padEnd(9)} over ${z.months} months: total ${z.totalInStakes.toFixed(1)} stakes (${z.totalRange[0].toFixed(1)} to ${z.totalRange[1].toFixed(1)})  worst drawdown ${z.worstDrawdownInStakes.toFixed(2)} stakes (${z.worstDrawdownAnyPhase.toFixed(2)} worst phase)  longest losing run ${z.longestLosingStreakAnyPhase} months`)
}
console.log(`  ${out.sizing.note}`)

console.log('\nTHE TAIL IS FIVE MONTHS')
for (const t of out.tail.worstFive) console.log(`  ${t.entryDate} → ${t.exitDate}  VIX at entry ${t.entryVix.toFixed(1)}  index moved ${pct(t.movePct)}  P&L ${f2(t.pnl)}`)
console.log(`  ${out.tail.losingMonths} losing months out of ${out.tail.n}`)
console.log('\ndata/em/premium-spy.json written')
