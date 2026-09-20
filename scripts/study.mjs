#!/usr/bin/env node
/**
 * The decade study. Runs every question over the long fixture and writes
 * data/em/study-spy.json plus a readable table.
 *
 * Option results are model-priced with Black-Scholes on real underlying paths.
 * No real option print is involved and every such number says so.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  dailyBandSeries, calibrate, calibrateSeries, solveK, scoreSetups, simulateSetup, summariseTrades,
  skewedBandSeries, scaledSeries, blendedBandSeries, regimeCalibration, openAnchoredSeries,
  vixTerciles, THEORY, wilsonRate, solveKByRegime, regimeAdjustedSeries, outOfSample,
  regimeError, rollingRegime, outerAfterBreak, reachAfterBreakBaseRate,
} from '../lib/study.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const S = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/market-long.json'), 'utf8')).sessions
const K = 0.92
const pct = (x, d = 1) => x == null ? '   —' : (x * 100).toFixed(d).padStart(5) + '%'
const f3 = (x) => x == null ? '  —  ' : x.toFixed(3)
const ci = (r) => `[${(r.low * 100).toFixed(0)}–${(r.high * 100).toFixed(0)}]`

const out = { generated: '2026-09-20', span: { from: S[0].date, to: S[S.length - 1].date, sessions: S.length }, k: K, theory: THEORY }

// ── 1. calibration at the fitted k and at the solved k, whole decade and per year
const cal = (sessions, k) => calibrate(sessions, { k })
out.calibration = { k092: cal(S, K), kSolvedAbsZ: null, kSolvedBreak: null, byYear: {} }
out.calibration.kSolvedAbsZ = solveK(S, { target: 'meanAbsZ' })
out.calibration.kSolvedBreak = solveK(S, { target: 'closeBreak' })
out.calibration.atSolved = cal(S, out.calibration.kSolvedAbsZ)
const years = [...new Set(S.map((s) => s.date.slice(0, 4)))]
for (const y of years) {
  const ys = S.filter((s) => s.date.slice(0, 4) === y)
  if (ys.length < 60) continue
  out.calibration.byYear[y] = { n: ys.length - 1, kSolved: solveK(ys, { target: 'meanAbsZ' }), at092: cal(ys, K) }
}
out.calibration.regime = regimeCalibration(S, { k: K })

// ── 2. setups over the decade, at k=0.92 and by VIX regime
out.setups = scoreSetups(S, { k: K })
delete out.setups.breakToWeekly.detail
const terc = vixTerciles(S)
out.setupsByRegime = {}
{
  const series = dailyBandSeries(S, { k: K })
  const idx = new Map(S.map((s, i) => [s.date, i]))
  const byDate = new Map(S.map((s) => [s.date, s]))
  for (const g of ['low', 'mid', 'high']) {
    const rows = series.filter((b) => { const v = byDate.get(b.anchorDate).vix; return g === 'low' ? v <= terc.low : g === 'mid' ? v > terc.low && v <= terc.high : v > terc.high })
    const lt = rows.filter((b) => b.session.low <= b.lower && S[idx.get(b.session.date) + 1])
    const ut = rows.filter((b) => b.session.high >= b.upper && S[idx.get(b.session.date) + 1])
    const all = rows.filter((b) => S[idx.get(b.session.date) + 1])
    out.setupsByRegime[g] = {
      vixCut: terc,
      nextAfterLowerTag: wilsonRate(lt.filter((b) => S[idx.get(b.session.date) + 1].close > b.session.close).length, lt.length),
      nextAfterUpperTag: wilsonRate(ut.filter((b) => S[idx.get(b.session.date) + 1].close < b.session.close).length, ut.length),
      baseNextUp: wilsonRate(all.filter((b) => S[idx.get(b.session.date) + 1].close > b.session.close).length, all.length),
      fadeLower: wilsonRate(rows.filter((b) => b.session.low <= b.lower && b.session.close > b.lower).length, rows.filter((b) => b.session.low <= b.lower).length),
    }
  }
}

// ── 3. the option legs: which DTE, model-priced
out.options = { note: 'Black-Scholes on real paths; sigma = ivScale x VIX; slippage 1% of premium each side; strike at the money; contract = 100 shares.', runs: [] }
for (const setup of ['lowerTagLong', 'upperTagShort']) {
  for (const ivScale of [0.92, 0.72]) {
    for (const dte of [0, 1, 2, 5]) {
      // A same-session leg cannot know when the band was touched, so it is
      // bounded: a whole session of time paid for (conservative), half, a quarter.
      const fractions = dte === 0 ? [1, 0.5, 0.25] : [null]
      for (const entryFraction of fractions) {
        const trades = simulateSetup(S, { setup, dte, k: K, ivScale, slippage: 0.01, excludeGapThrough: dte === 0, ...(entryFraction ? { entryFraction } : {}) })
        const sum = summariseTrades(trades)
        out.options.runs.push({ setup, ivScale, dte, entryFraction, excludeGapThrough: dte === 0, ...sum, meanDollarsPerContract: sum.meanPnl * 100 })
      }
    }
  }
}
// how rich the 0DTE volatility can be before the same-session edge disappears
out.options.zeroDteIvSensitivity = []
for (const setup of ['lowerTagLong', 'upperTagShort']) for (const ivScale of [0.92, 1.05, 1.15, 1.30, 1.50]) {
  const sum = summariseTrades(simulateSetup(S, { setup, dte: 0, k: K, ivScale, slippage: 0.01, entryFraction: 1, excludeGapThrough: true }))
  out.options.zeroDteIvSensitivity.push({ setup, ivScale, n: sum.n, meanPnlPct: sum.meanPnlPct, winRate: sum.winRate.point, profitFactor: sum.profitFactor, meanPremiumIn: sum.meanPremiumIn })
}
// The ladder, read as one experiment. The rungs above are each priced on the
// volatility known when that rung is entered, which is not the same number:
// a same-session leg is entered intraday off the previous VIX close, a held
// leg at the close off that session's. Pricing every rung on the anchor is
// the only way to compare them, and it moves them all.
out.options.ladder = []
for (const volAnchor of ['knownAtEntry', 'anchor']) {
  for (const setup of ['lowerTagLong', 'upperTagShort']) {
    for (const dte of [0, 1, 2, 5]) {
      const trades = simulateSetup(S, {
        setup, dte, k: K, ivScale: K, volAnchor, entryFraction: 1,
        excludeGapThrough: dte === 0, halfSpread: 0.015, commission: 0.65,
      })
      const sum = summariseTrades(trades)
      out.options.ladder.push({
        volAnchor, setup, dte, n: sum.n, winRate: sum.winRate.point, meanPnlPct: sum.meanPnlPct,
        medianPnlPct: sum.medianPnlPct, profitFactor: sum.profitFactor, meanPremiumIn: sum.meanPremiumIn,
        meanCostShare: sum.meanCostShare, costShareAggregate: sum.costShareAggregate,
        meanDollarsPerContract: sum.meanPnl * 100,
      })
    }
  }
}

// A cost model a broker would recognise: a penny and a half of half-spread and
// 65 cents a contract, charged on the way out only when the leg is worth closing.
out.options.realCosts = []
for (const ivScale of [0.92, 1.15, 1.264, 1.46]) {
  const sum = summariseTrades(simulateSetup(S, {
    setup: 'lowerTagLong', dte: 0, k: K, ivScale, entryFraction: 1,
    excludeGapThrough: true, halfSpread: 0.015, commission: 0.65,
  }))
  out.options.realCosts.push({
    ivScale, n: sum.n, winRate: sum.winRate.point, meanPnlPct: sum.meanPnlPct,
    profitFactor: sum.profitFactor, meanPremiumIn: sum.meanPremiumIn,
    meanCostShare: sum.meanCostShare, costShareAggregate: sum.costShareAggregate,
  })
}

// How volatile the sessions that reach a band are, which is what decides
// whether 0.92 x the previous VIX close is anywhere near the real quote.
{
  const series = dailyBandSeries(S, { k: K })
  const range = (rows) => rows.reduce((a, b) => a + (b.session.high - b.session.low) / b.session.close, 0) / rows.length
  const touched = series.filter((b) => b.session.low <= b.lower)
  const untouched = series.filter((b) => b.session.low > b.lower && b.session.high < b.upper)
  out.options.selection = {
    meanRangeLowerTouch: range(touched),
    meanRangeAll: range(series),
    meanRangeNoTouch: range(untouched),
    ratioTouchToAll: range(touched) / range(series),
    note: 'A session that reaches a one-sigma band is by selection a volatile one, so the volatility quoted at the moment of the touch is not the previous close.',
  }
}

// what realistic bid-ask costs do to a sub-dollar 0DTE option
out.options.zeroDteSlippage = []
for (const ivScale of [0.92, 1.15]) for (const slippage of [0.01, 0.03, 0.05]) {
  const sum = summariseTrades(simulateSetup(S, { setup: 'lowerTagLong', dte: 0, k: K, ivScale, slippage, entryFraction: 1, excludeGapThrough: true }))
  out.options.zeroDteSlippage.push({ ivScale, slippage, n: sum.n, meanPnlPct: sum.meanPnlPct, winRate: sum.winRate.point, profitFactor: sum.profitFactor, meanDollarsPerContract: sum.meanPnl * 100 })
}
// underlying-only comparison for the same events (no option, no theta)
{
  const series = dailyBandSeries(S, { k: K })
  const idx = new Map(S.map((s, i) => [s.date, i]))
  const ret = (rows, dir) => rows.map((b) => { const n = S[idx.get(b.session.date) + 1]; return dir * (n.close - b.session.close) / b.session.close })
  const lt = series.filter((b) => b.session.low <= b.lower && S[idx.get(b.session.date) + 1])
  const ut = series.filter((b) => b.session.high >= b.upper && S[idx.get(b.session.date) + 1])
  const stat = (v) => ({ n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length, win: wilsonRate(v.filter((x) => x > 0).length, v.length) })
  out.options.underlying = { lowerTagLong: stat(ret(lt, 1)), upperTagShort: stat(ret(ut, -1)), allLong: stat(ret(series.filter((b) => S[idx.get(b.session.date) + 1]), 1)) }
}

// ── 4. enhancement candidates
out.enhancements = {}
out.enhancements.regimeK = solveKByRegime(S)
out.enhancements.regimeInSample = (() => {
  const adj = regimeAdjustedSeries(S, out.enhancements.regimeK)
  const o = { overall: calibrateSeries(adj) }
  for (const g of ['low', 'mid', 'high']) o[g] = calibrateSeries(adj.filter((b) => b.regime === g))
  return o
})()
out.enhancements.outOfSample = { split2022: outOfSample(S, { split: '2022-01-01', fixedK: K }), split2020: outOfSample(S, { split: '2020-01-01', fixedK: K }) }
out.enhancements.kGrid = [0.80, 0.86, 0.92, 1.00].map((k) => ({ k, ...cal(S, k) }))
out.enhancements.skew = [0, 0.05, 0.10, 0.15, 0.20].map((skew) => ({ skew, ...calibrateSeries(skewedBandSeries(S, { k: K, skew })) }))
const base = dailyBandSeries(S, { k: K })
out.enhancements.outer = [1, 1.5, 2].map((m) => ({ m, ...calibrateSeries(scaledSeries(base, m)) }))
out.enhancements.blend = []
for (const window of [10, 20]) for (const weight of [1, 0.75, 0.5, 0.25, 0]) {
  const c = calibrateSeries(blendedBandSeries(S, { k: K, window, weight }))
  out.enhancements.blend.push({ window, weight, ...c, absZErr: Math.abs(c.meanAbsZ - THEORY.meanAbsZ), breakErr: Math.abs((c.closeBreakUpper + c.closeBreakLower) / 2 - THEORY.oneSidedBreak) })
}
out.enhancements.openAnchored = calibrateSeries(openAnchoredSeries(S, { k: K }))
// The outer band after a close break of the inner one, split into the part
// that was over before the signal existed and the part that was still ahead,
// each against the rate a random walk of the same width gives for free.
out.enhancements.outerAfterBreak = outerAfterBreak(S, { k: K, multiple: 2 })
out.enhancements.outerBaseRate = {
  matched: reachAfterBreakBaseRate({ paths: 200000, halfWidth: 1.036, multiple: 2, seed: 20260920 }),
  trueSigma: reachAfterBreakBaseRate({ paths: 200000, halfWidth: 1, multiple: 2, seed: 20260920 }),
  note: 'halfWidth 1.036 is the measured band: mean |z| 0.770 against a normal 0.798 means the band is 3.6 per cent wider than the true one sigma of the close.',
}

// The calibration score, taken inside each regime rather than pooled, and the
// rolling refit that the single fixed split could not test.
out.enhancements.regimeErrorFixed = regimeError(dailyBandSeries(S, { k: K }), vixTerciles(S))
out.enhancements.rollingRegime = [250, 500, 1000].map((window) => {
  const r = rollingRegime(S, { window })
  return {
    window,
    n: r.n,
    k: r.k,
    cuts: r.cuts,
    fixed: { pooled: r.fixed.pooled, weighted: r.fixed.weighted, byRegime: r.fixed.byRegime },
    regime: { pooled: r.regime.pooled, weighted: r.regime.weighted, byRegime: r.regime.byRegime },
    improves: r.regime.weighted < r.fixed.weighted,
  }
})

writeFileSync(join(ROOT, 'data/em/study-spy.json'), JSON.stringify(out, null, 2) + '\n')

// ── print
const c = out.calibration
console.log(`SPY ${out.span.from} → ${out.span.to}: ${out.span.sessions} sessions\n`)
console.log('CALIBRATION                     k=0.92   solved-k   theory')
console.log(`solved k (mean|z|)              ${f3(K)}    ${f3(c.kSolvedAbsZ)}`)
console.log(`solved k (close-break)                   ${f3(c.kSolvedBreak)}`)
console.log(`range contained                 ${pct(c.k092.contained)}   ${pct(c.atSolved.contained)}   ${pct(THEORY.pathContainment)}`)
console.log(`upper reached                   ${pct(c.k092.upperReached)}   ${pct(c.atSolved.upperReached)}   ${pct(THEORY.oneSidedTouch)}`)
console.log(`lower reached                   ${pct(c.k092.lowerReached)}   ${pct(c.atSolved.lowerReached)}   ${pct(THEORY.oneSidedTouch)}`)
console.log(`close-break upper               ${pct(c.k092.closeBreakUpper)}   ${pct(c.atSolved.closeBreakUpper)}   ${pct(THEORY.oneSidedBreak)}`)
console.log(`close-break lower               ${pct(c.k092.closeBreakLower)}   ${pct(c.atSolved.closeBreakLower)}   ${pct(THEORY.oneSidedBreak)}`)
console.log(`mean |z|                         ${f3(c.k092.meanAbsZ)}    ${f3(c.atSolved.meanAbsZ)}    ${f3(THEORY.meanAbsZ)}`)
console.log(`mean z                          ${c.k092.meanZ >= 0 ? '+' : ''}${f3(c.k092.meanZ)}`)
console.log('\nSOLVED k BY YEAR  ' + Object.entries(c.byYear).map(([y, v]) => `${y}:${v.kSolved.toFixed(2)}`).join('  '))
console.log('\nREGIME (k=0.92)        n     contained  reach↑  reach↓  break↑  break↓  mean|z|')
for (const [g, r] of Object.entries(c.regime)) console.log(`${g.padEnd(6)} VIX≤${g === 'low' ? r.vixCut.low.toFixed(1) : g === 'mid' ? r.vixCut.high.toFixed(1) : '   ∞'}  ${String(r.n).padStart(5)}   ${pct(r.contained)}   ${pct(r.upperReached)}  ${pct(r.lowerReached)}  ${pct(r.closeBreakUpper)}  ${pct(r.closeBreakLower)}   ${f3(r.meanAbsZ)}`)
console.log('\nSETUPS (decade)                                 win      n    95% CI')
const lab = { fadeLower: 'lower tag, closes back inside', fadeUpper: 'upper tag, closes back inside', nextAfterLowerTag: 'lower tag → next session up', nextAfterUpperTag: 'upper tag → next session down', breakToWeekly: 'close-break → weekly band later that week', baseNextUp: 'BASE next session up', baseNextDown: 'BASE next session down' }
for (const [k, r] of Object.entries(out.setups)) console.log(`${lab[k].padEnd(46)} ${pct(r.point)}  ${String(r.n).padStart(5)}  ${ci(r)}`)
console.log('\nSETUPS BY VIX REGIME        lower tag→next up   base up    upper tag→next down')
for (const [g, r] of Object.entries(out.setupsByRegime)) console.log(`${g.padEnd(6)}                      ${pct(r.nextAfterLowerTag.point)} n=${String(r.nextAfterLowerTag.n).padStart(3)}     ${pct(r.baseNextUp.point)}    ${pct(r.nextAfterUpperTag.point)} n=${r.nextAfterUpperTag.n}`)
console.log('\nOPTION LEGS, MODEL-PRICED (slippage 1%/side, ATM)')
console.log('setup           iv   dte@frac  n    win     mean%   median%   PF    $/contract  premium   (frac = share of session assumed left at a 0DTE entry)')
for (const r of out.options.runs) console.log(`${r.setup.padEnd(14)} ${r.ivScale.toFixed(2)}   ${r.dte}${r.entryFraction ? '@' + r.entryFraction : '  '} ${String(r.n).padStart(4)}  ${pct(r.winRate.point)}  ${pct(r.meanPnlPct)}   ${pct(r.medianPnlPct)}  ${r.profitFactor === Infinity ? '  ∞ ' : r.profitFactor.toFixed(2).padStart(4)}   ${r.meanDollarsPerContract.toFixed(0).padStart(6)}    ${r.meanPremiumIn.toFixed(2)}`)
console.log('0DTE, whole session paid for, gap-throughs excluded: how rich the 0DTE vol can be before the edge is gone')
for (const r of out.options.zeroDteIvSensitivity) console.log(`   ${r.setup.padEnd(14)} iv ${r.ivScale.toFixed(2)}×VIX  n=${r.n}  win ${pct(r.winRate)}  mean ${pct(r.meanPnlPct)}  PF ${r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2)}  premium ${r.meanPremiumIn.toFixed(2)}`)
console.log('0DTE lowerTagLong, whole session paid for, gap-throughs excluded: bid-ask cost as a share of premium each side')
for (const r of out.options.zeroDteSlippage) console.log(`   iv ${r.ivScale.toFixed(2)}×VIX  slippage ${(r.slippage * 100).toFixed(0)}%  n=${r.n}  win ${pct(r.winRate)}  mean ${pct(r.meanPnlPct)}  PF ${r.profitFactor.toFixed(2)}  $/contract ${r.meanDollarsPerContract.toFixed(0)}`)
const u = out.options.underlying
console.log(`underlying only: lowerTagLong mean ${(u.lowerTagLong.mean * 100).toFixed(3)}% win ${pct(u.lowerTagLong.win.point)} n=${u.lowerTagLong.n} | upperTagShort mean ${(u.upperTagShort.mean * 100).toFixed(3)}% win ${pct(u.upperTagShort.win.point)} | any-day long mean ${(u.allLong.mean * 100).toFixed(3)}%`)
console.log('\nENHANCEMENTS')
console.log('k grid        k     contained  reach↑  reach↓  break↑  break↓  mean|z|')
for (const r of out.enhancements.kGrid) console.log(`             ${r.k.toFixed(2)}   ${pct(r.contained)}   ${pct(r.upperReached)}  ${pct(r.lowerReached)}  ${pct(r.closeBreakUpper)}  ${pct(r.closeBreakLower)}   ${f3(r.meanAbsZ)}`)
console.log('skew        skew    contained  reach↑  reach↓  break↑  break↓')
for (const r of out.enhancements.skew) console.log(`             ${r.skew.toFixed(2)}   ${pct(r.contained)}   ${pct(r.upperReached)}  ${pct(r.lowerReached)}  ${pct(r.closeBreakUpper)}  ${pct(r.closeBreakLower)}`)
console.log('outer band    m     contained  reach↑  reach↓  break↑  break↓')
for (const r of out.enhancements.outer) console.log(`             ${r.m.toFixed(1)}   ${pct(r.contained)}   ${pct(r.upperReached)}  ${pct(r.lowerReached)}  ${pct(r.closeBreakUpper)}  ${pct(r.closeBreakLower)}`)
console.log(`outer 2σ reached within a session of an inner close-break: ${pct(out.enhancements.outerAfterBreak.point)} n=${out.enhancements.outerAfterBreak.n} ${ci(out.enhancements.outerAfterBreak)}`)
console.log('blend      win  weight(implied)  contained  mean|z|  |z err|  break err')
for (const r of out.enhancements.blend) console.log(`            ${r.window}    ${r.weight.toFixed(2)}            ${pct(r.contained)}   ${f3(r.meanAbsZ)}   ${f3(r.absZErr)}   ${f3(r.breakErr)}`)
const rk = out.enhancements.regimeK
console.log(`\nREGIME-ADJUSTED MULTIPLIER (fitted on the decade): low(VIX≤${rk.cuts.low.toFixed(1)}) ${rk.k.low.toFixed(3)}  mid ${rk.k.mid.toFixed(3)}  high(VIX>${rk.cuts.high.toFixed(1)}) ${rk.k.high.toFixed(3)}`)
for (const [name, oos] of Object.entries(out.enhancements.outOfSample)) {
  console.log(`OUT OF SAMPLE ${name}: fit ${oos.fit.from}..${oos.fit.to} (n=${oos.fit.n}) → test ${oos.test.from}..${oos.test.to} (n=${oos.test.n})`)
  console.log(`   fitted k: low ${oos.regime.k.low.toFixed(3)} mid ${oos.regime.k.mid.toFixed(3)} high ${oos.regime.k.high.toFixed(3)}`)
  console.log(`   test set        contained  reach↑  reach↓  break↑  break↓  mean|z|   |z err|`)
  const f = oos.fixed, g = oos.regime
  console.log(`   fixed 0.92       ${pct(f.contained)}   ${pct(f.upperReached)}  ${pct(f.lowerReached)}  ${pct(f.closeBreakUpper)}  ${pct(f.closeBreakLower)}   ${f3(f.meanAbsZ)}    ${f3(Math.abs(f.meanAbsZ - THEORY.meanAbsZ))}`)
  console.log(`   regime k         ${pct(g.contained)}   ${pct(g.upperReached)}  ${pct(g.lowerReached)}  ${pct(g.closeBreakUpper)}  ${pct(g.closeBreakLower)}   ${f3(g.meanAbsZ)}    ${f3(Math.abs(g.meanAbsZ - THEORY.meanAbsZ))}   ${g.improves ? 'IMPROVES' : 'does not improve'}`)
  for (const r of ['low', 'mid', 'high']) { const b = g.byRegime[r]; console.log(`     ${r.padEnd(5)} n=${String(b.regime.n).padStart(4)}  fixed mean|z| ${f3(b.fixed.meanAbsZ)} contained ${pct(b.fixed.contained)}  |  regime mean|z| ${f3(b.regime.meanAbsZ)} contained ${pct(b.regime.contained)}`) }
}
const o = out.enhancements.openAnchored
console.log(`open-anchored (k=0.92): contained ${pct(o.contained)} reach↑ ${pct(o.upperReached)} reach↓ ${pct(o.lowerReached)} break↑ ${pct(o.closeBreakUpper)} break↓ ${pct(o.closeBreakLower)} mean|z| ${f3(o.meanAbsZ)}`)
