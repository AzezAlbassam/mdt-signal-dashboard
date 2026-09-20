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
  vixTerciles, THEORY, wilsonRate,
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
      const trades = simulateSetup(S, { setup, dte, k: K, ivScale, slippage: 0.01 })
      const sum = summariseTrades(trades)
      out.options.runs.push({ setup, ivScale, dte, ...sum, meanDollarsPerContract: sum.meanPnl * 100, byRegime: null })
    }
  }
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
// the outer band as a target after a close-break of the inner
{
  const inner = base
  const idx = new Map(S.map((s, i) => [s.date, i]))
  const hits = { n: 0, k: 0 }
  for (const b of inner) {
    const s = b.session
    const side = s.close > b.upper ? 'up' : s.close < b.lower ? 'down' : null
    if (!side) continue
    const nxt = S[idx.get(s.date) + 1]
    if (!nxt) continue
    // the next session's band, and whether it runs to the outer 2σ of the ORIGINAL anchor
    const outerUp = b.center + 2 * b.halfWidth
    const outerDn = b.center - 2 * b.halfWidth
    hits.n++
    if (side === 'up' ? (s.high >= outerUp || nxt.high >= outerUp) : (s.low <= outerDn || nxt.low <= outerDn)) hits.k++
  }
  out.enhancements.outerAfterBreak = wilsonRate(hits.k, hits.n)
}

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
console.log('setup           iv    dte    n    win     mean%   median%   PF    $/contract  premium')
for (const r of out.options.runs) console.log(`${r.setup.padEnd(14)} ${r.ivScale.toFixed(2)}   ${r.dte}   ${String(r.n).padStart(4)}  ${pct(r.winRate.point)}  ${pct(r.meanPnlPct)}   ${pct(r.medianPnlPct)}  ${r.profitFactor === Infinity ? '  ∞ ' : r.profitFactor.toFixed(2).padStart(4)}   ${r.meanDollarsPerContract.toFixed(0).padStart(6)}    ${r.meanPremiumIn.toFixed(2)}`)
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
const o = out.enhancements.openAnchored
console.log(`open-anchored (k=0.92): contained ${pct(o.contained)} reach↑ ${pct(o.upperReached)} reach↓ ${pct(o.lowerReached)} break↑ ${pct(o.closeBreakUpper)} break↓ ${pct(o.closeBreakLower)} mean|z| ${f3(o.meanAbsZ)}`)
