#!/usr/bin/env node
/**
 * The single-leg search: buy one call or one put off the expected-move band,
 * with a target and a stop, and see whether anything beats the line that a
 * target and a stop draw on a path with no edge at all.
 *
 * 576 combinations are tried, which is a lot of chances to find noise, so
 * every result is reported next to its own random-walk base rate and then
 * split out of sample. Nothing here is a recommendation until it survives both.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { simulateSignal, summariseSignal, randomWalkBaseRate, unconditionalBaseline, placeboDistribution, searchPlacebo, RULES } from '../lib/signals.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const S = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/market-long.json'), 'utf8')).sessions
const pct = (x, d = 1) => x == null ? '   — ' : (x * 100).toFixed(d).padStart(5) + '%'
const f2 = (x) => x == null ? '  —  ' : x.toFixed(2).padStart(6)

const TARGETS = [1, 1.5, 2, 3]
const STOPS = [1, 1.5, 2]
const HOLDS = [5, 10, 21]

// The base rate depends only on the target, the stop and the time limit, so it
// is computed once per triple rather than once per rule.
const baseCache = new Map()
// The control that decides everything: the same trade taken on every session,
// with no rule. A call rule must beat buying calls anyway, not just beat a
// driftless walk, because the index itself drifts up.
const anywayCache = new Map()
const anywayFor = (sessions, tag, direction, targetSigma, stopSigma, maxHold) => {
  const key = `${tag}|${direction}|${targetSigma}|${stopSigma}|${maxHold}`
  if (!anywayCache.has(key)) {
    anywayCache.set(key, unconditionalBaseline(sessions, { direction, targetSigma, stopSigma, maxHold }))
  }
  return anywayCache.get(key)
}
const baseFor = (targetSigma, stopSigma, maxHold) => {
  const key = `${targetSigma}|${stopSigma}|${maxHold}`
  if (!baseCache.has(key)) {
    baseCache.set(key, randomWalkBaseRate({ targetSigma, stopSigma, maxHold, paths: 30000, seed: 20260921 }))
  }
  return baseCache.get(key)
}

function sweep (sessions, { label }) {
  const rows = []
  for (const rule of RULES) {
    for (const direction of ['call', 'put']) {
      for (const targetSigma of TARGETS) {
        for (const stopSigma of STOPS) {
          for (const maxHold of HOLDS) {
            const trades = simulateSignal(sessions, {
              rule, direction, targetSigma, stopSigma, maxHold, cooldown: maxHold,
            })
            if (trades.length < 20) continue
            const s = summariseSignal(trades, sessions)
            const base = baseFor(targetSigma, stopSigma, maxHold)
            const anyway = anywayFor(sessions, label, direction, targetSigma, stopSigma, maxHold)
            rows.push({
              label, rule, direction, targetSigma, stopSigma, maxHold,
              n: s.n, perYear: s.perYear,
              winRate: s.winRate.point, winLow: s.winRate.low, winHigh: s.winRate.high,
              baseWinRate: base.winRate,
              edge: s.winRate.point - base.winRate,
              anywayWinRate: anyway.winRate.point,
              anywayExpectancyR: anyway.expectancyR,
              anywayN: anyway.n,
              // The only edge that means anything: over taking it regardless.
              edgeOverAnyway: s.winRate.point - anyway.winRate.point,
              expectancyOverAnyway: s.expectancyR - anyway.expectancyR,
              rewardToRisk: s.rewardToRisk,
              expectancyR: s.expectancyR,
              totalR: s.totalR,
              profitFactor: s.profitFactor,
              meanBars: s.meanBars,
              byOutcome: s.byOutcome,
            })
          }
        }
      }
    }
  }
  return rows
}

const out = {
  generated: '2026-09-21',
  span: { from: S[0].date, to: S[S.length - 1].date, sessions: S.length },
  method: 'Buy one call or one put at the open after the signal. Target and stop are stated in units of the daily band half width. A session that touches both is scored as the stop. Trades do not overlap: a cooldown of the hold limit follows each entry.',
  warning: `${RULES.length} rules x 2 directions x ${TARGETS.length} targets x ${STOPS.length} stops x ${HOLDS.length} hold limits is 576 combinations. At a 5 per cent threshold you would expect about 29 to look significant by chance. Every row is therefore shown against its own random-walk base rate, and the leaders are re-checked out of sample.`,
}

// ── 1. the whole sweep, in sample
out.all = sweep(S, { label: 'full' })

// ── 2. the line the sweep has to beat
out.baseRates = [...baseCache.entries()].map(([key, v]) => {
  const [targetSigma, stopSigma, maxHold] = key.split('|').map(Number)
  return { targetSigma, stopSigma, maxHold, winRate: v.winRate, theoryWinRate: v.theoryWinRate, expectancy: v.expectancy }
})

// ── 3. what the trader actually asked for: rare, high win rate, good reward
const RARE = 26 // at most about twice a month
out.rare = out.all.filter((r) => r.perYear <= RARE && r.n >= 25)
out.byExpectancy = [...out.all].sort((a, b) => b.expectancyR - a.expectancyR).slice(0, 15)
// Ranked by the only figure that is not just the market's drift.
out.byEdgeOverAnyway = [...out.all].sort((a, b) => b.expectancyOverAnyway - a.expectancyOverAnyway).slice(0, 15)
out.beatsAnyway = out.all.filter((r) => r.expectancyOverAnyway > 0).length
out.byWinRate = [...out.all].filter((r) => r.rewardToRisk >= 1).sort((a, b) => b.winRate - a.winRate).slice(0, 15)
out.bestRare = [...out.rare].sort((a, b) => b.expectancyR - a.expectancyR).slice(0, 15)

// ── 4. out of sample: does any leader survive a split it was not fitted on?
{
  const before = S.filter((s) => s.date < '2022-01-01')
  const after = S.filter((s) => s.date >= '2022-01-01')
  const fit = sweep(before, { label: 'fit' })
  const test = sweep(after, { label: 'test' })
  const key = (r) => `${r.rule}|${r.direction}|${r.targetSigma}|${r.stopSigma}|${r.maxHold}`
  const testByKey = new Map(test.map((r) => [key(r), r]))
  out.outOfSample = [...fit]
    .sort((a, b) => b.expectancyR - a.expectancyR)
    .slice(0, 20)
    .map((f) => ({ ...f, test: testByKey.get(key(f)) ?? null }))
  out.outOfSampleHeld = out.outOfSample.filter((r) => r.test && r.test.expectancyR > 0).length
}

// ── 5. the placebo: what a 576-way search finds when nothing is there
{
  // One rule's dates are reused across every direction, target and stop, so
  // the null reuses them too rather than pretending 576 independent tries.
  const configs = out.all.map((r) => ({
    n: r.n, group: `${r.rule}|${r.maxHold}`, direction: r.direction,
    targetSigma: r.targetSigma, stopSigma: r.stopSigma, maxHold: r.maxHold, cooldown: r.maxHold,
  }))
  const nullMax = searchPlacebo(S, configs, { draws: 400, seed: 20260921 })
  const observedBest = Math.max(...out.all.map((r) => r.expectancyOverAnyway))
  out.placebo = {
    draws: 400,
    combinations: configs.length,
    observedBestEdge: observedBest,
    nullMeanBestEdge: nullMax.mean,
    nullSd: nullMax.sd,
    null95: nullMax.quantile(0.95),
    nullMax: Math.max(...nullMax.samples),
    pValue: nullMax.pValue(observedBest),
  }
  // And the same question one combination at a time, for the leaders.
  out.placebo.leaders = out.byEdgeOverAnyway.slice(0, 6).map((r) => {
    const d = placeboDistribution(S, {
      n: r.n, direction: r.direction, targetSigma: r.targetSigma,
      stopSigma: r.stopSigma, maxHold: r.maxHold, cooldown: r.maxHold, draws: 600, seed: 424242,
    })
    return {
      rule: r.rule, direction: r.direction, targetSigma: r.targetSigma, stopSigma: r.stopSigma,
      maxHold: r.maxHold, n: r.n,
      edge: r.expectancyOverAnyway,
      nullSd: d.edgeSd,
      null95: d.edgeMean + 1.645 * d.edgeSd,
      pAlone: d.edgePValue(r.expectancyOverAnyway),
    }
  })
}

writeFileSync(join(ROOT, 'data/em/signals-spy.json'), JSON.stringify(out, null, 2) + '\n')

// ── print
console.log(`SPY ${out.span.from} → ${out.span.to}\n`)
console.log(out.warning + '\n')

const head = 'rule                      dir   tgt  stop  hold    n  per yr    win  anyway   edge    R:R   expR  vs anyway'
const line = (r) => `${r.rule.padEnd(24)} ${r.direction.padEnd(5)} ${String(r.targetSigma).padStart(3)}  ${String(r.stopSigma).padStart(4)}  ${String(r.maxHold).padStart(4)} ${String(r.n).padStart(4)}  ${r.perYear.toFixed(1).padStart(5)}  ${pct(r.winRate)} ${pct(r.anywayWinRate)} ${pct(r.edgeOverAnyway)} ${f2(r.rewardToRisk)} ${f2(r.expectancyR)}  ${f2(r.expectancyOverAnyway)}`

console.log('BEST BY EXPECTANCY, ANY FREQUENCY')
console.log(head)
for (const r of out.byExpectancy.slice(0, 10)) console.log(line(r))

console.log(`\nBEST OF THE RARE ONES (at most ${RARE} a year, at least 25 trades)`)
console.log(head)
for (const r of out.bestRare.slice(0, 10)) console.log(line(r))

console.log('\nHIGHEST WIN RATE THAT ALSO PAYS AT LEAST ONE TO ONE')
console.log(head)
for (const r of out.byWinRate.slice(0, 10)) console.log(line(r))

console.log('\nBEST AFTER SUBTRACTING WHAT YOU GET BY TAKING THE TRADE ANYWAY')
console.log(head)
for (const r of out.byEdgeOverAnyway.slice(0, 10)) console.log(line(r))
console.log(`\n${out.beatsAnyway} of ${out.all.length} combinations beat their own unconditional version at all.`)

console.log('\nOUT OF SAMPLE: the 20 best on data before 2022, re-run on 2022 onward')
console.log('rule                      dir   tgt stop hold   fit expR   test expR   test n')
for (const r of out.outOfSample) {
  const t = r.test
  console.log(`${r.rule.padEnd(24)} ${r.direction.padEnd(5)} ${String(r.targetSigma).padStart(3)} ${String(r.stopSigma).padStart(4)} ${String(r.maxHold).padStart(4)}  ${f2(r.expectancyR)}     ${t ? f2(t.expectancyR) : '  —  '}     ${t ? String(t.n).padStart(4) : '   —'}`)
}
console.log(`\n${out.outOfSampleHeld} of ${out.outOfSample.length} leaders still had a positive expectancy out of sample.`)
const p = out.placebo
console.log('\nTHE PLACEBO: the same trades, the same rarity, on dates no rule chose')
console.log(`Best edge actually found across ${p.combinations} combinations:      ${f2(p.observedBestEdge)} R`)
console.log(`Best edge a search of the same size finds in noise, on average: ${f2(p.nullMeanBestEdge)} R`)
console.log(`                                          19 times in 20 under: ${f2(p.null95)} R`)
console.log(`                                     largest of ${p.draws} draws: ${f2(p.nullMax)} R`)
console.log(`Share of null searches that did at least as well as the real one: ${(p.pValue * 100).toFixed(1)}%`)
console.log('\nEach leader against random dates at its own rarity, ignoring the search')
console.log('rule                      dir  tgt stop hold    n    edge  null sd  null 95   p alone')
for (const r of p.leaders) {
  console.log(`${r.rule.padEnd(24)} ${r.direction.padEnd(4)} ${String(r.targetSigma).padStart(3)} ${String(r.stopSigma).padStart(4)} ${String(r.maxHold).padStart(4)} ${String(r.n).padStart(4)}  ${f2(r.edge)}  ${f2(r.nullSd)}   ${f2(r.null95)}    ${(r.pAlone * 100).toFixed(1).padStart(5)}%`)
}

console.log('\ndata/em/signals-spy.json written')
