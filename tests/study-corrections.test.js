/**
 * The corrections an adversarial review forced on the decade study.
 *
 * Each test here pins a defect that was found after the first run: a
 * days-to-expiry ladder whose rungs were priced on different volatility
 * inputs, a cost model that charged a fraction of premium rather than a
 * spread and a commission, a calibration score that let opposite errors
 * cancel, and an outer band reported without the base rate that decides
 * whether reaching it means anything.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  simulateSetup, summariseTrades, optionLegPnl, regimeOf, regimeError,
  rollingRegime, outerAfterBreak, reachAfterBreakBaseRate, dailyBandSeries,
  vixTerciles, solveKByRegime, THEORY,
} from '../lib/study.js'

const long = JSON.parse(readFileSync(new URL('./fixtures/market-long.json', import.meta.url))).sessions
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

// ─────────────────────────────────────────── one volatility for the whole ladder

test('a same-session leg and a held leg are priced on different volatility unless told otherwise', () => {
  const zeroKnown = simulateSetup(long, { setup: 'lowerTagLong', dte: 0, entryFraction: 1 })
  const zeroAnchor = simulateSetup(long, { setup: 'lowerTagLong', dte: 0, entryFraction: 1, volAnchor: 'anchor' })
  assert.deepEqual(zeroKnown.map((t) => t.sigmaEntry), zeroAnchor.map((t) => t.sigmaEntry),
    'a same-session leg is entered intraday, so the last close known is the anchor either way')

  const oneKnown = simulateSetup(long, { setup: 'lowerTagLong', dte: 1 })
  const oneAnchor = simulateSetup(long, { setup: 'lowerTagLong', dte: 1, volAnchor: 'anchor' })
  assert.equal(oneKnown.length, oneAnchor.length)
  const differ = oneKnown.filter((t, i) => t.sigmaEntry !== oneAnchor[i].sigmaEntry).length
  assert.ok(differ > 0.9 * oneKnown.length,
    `the two conventions should disagree on nearly every held leg, they disagreed on ${differ} of ${oneKnown.length}`)

  assert.equal(oneKnown[0].volAnchor, 'knownAtEntry', 'the default prices on what is known when the order is sent')
  assert.equal(oneAnchor[0].volAnchor, 'anchor')
})

test('the days-to-expiry ladder changes its ordering when every rung is priced on the anchor', () => {
  const run = (dte, volAnchor) => summariseTrades(simulateSetup(long, {
    setup: 'lowerTagLong', dte, entryFraction: 1, excludeGapThrough: dte === 0, volAnchor, slippage: 0.01,
  })).meanPnlPct

  const known = [1, 2, 5].map((d) => run(d, 'knownAtEntry'))
  const anchored = [1, 2, 5].map((d) => run(d, 'anchor'))
  for (let i = 0; i < 3; i++) {
    assert.ok(anchored[i] > known[i],
      `pricing on the stale anchor flatters the held legs: dte ${[1, 2, 5][i]} went ${known[i]} → ${anchored[i]}`)
  }
  assert.ok(known[2] < 0 && anchored[2] > 0,
    'the five-session rung changes sign on the convention alone, which is why the ladder cannot be read as a result')
})

// ─────────────────────────────────────────── a cost model a broker would recognise

test('a leg can be charged a half spread and a commission, and pays no exit cost when it expires worthless', () => {
  const common = { K: 100, type: 'C', daysToExpiryAtEntry: 1, daysHeld: 1, sigmaEntry: 0.2, sigmaExit: 0.2, halfSpread: 0.015, commission: 0.65 }
  const worthless = optionLegPnl({ ...common, S0: 100, S1: 95 })
  near(worthless.premiumOut, 0, 1e-9, 'a call 5 per cent out of the money at expiry is worth nothing')
  near(worthless.costs, 0.015 + 0.0065, 1e-12, 'entry only: a commission is per contract, so per share it is a hundredth')

  const closed = optionLegPnl({ ...common, S0: 100, S1: 110 })
  near(closed.costs, 2 * (0.015 + 0.0065), 1e-12, 'a leg worth closing pays both sides')
  near(closed.pnl, closed.premiumOut - closed.premiumIn - closed.costs, 1e-12)

  const free = optionLegPnl({ ...common, S0: 100, S1: 110, halfSpread: 0, commission: 0 })
  near(free.costs, 0, 1e-12)
  assert.ok(free.pnl > closed.pnl)
})

test('real costs are a larger share of a cheap same-session premium than the flat one per cent used first', () => {
  const flat = summariseTrades(simulateSetup(long, {
    setup: 'lowerTagLong', dte: 0, entryFraction: 1, excludeGapThrough: true, slippage: 0.01,
  }))
  const real = summariseTrades(simulateSetup(long, {
    setup: 'lowerTagLong', dte: 0, entryFraction: 1, excludeGapThrough: true, halfSpread: 0.015, commission: 0.65,
  }))
  assert.equal(flat.n, real.n)
  near(real.costShareAggregate, 0.043, 0.004,
    'a penny and a half of spread plus 65 cents a contract, against the total premium paid, is about four per cent')
  assert.ok(real.meanCostShare > real.costShareAggregate * 1.3,
    `averaging the per-trade shares gives ${real.meanCostShare}, well above the aggregate ${real.costShareAggregate}: a fixed ticket is a far larger share of a cheap option`)
  assert.ok(real.meanPnlPct < flat.meanPnlPct, 'and it costs more than the flat one per cent did')
  near(flat.costShareAggregate, 0.024, 0.002, 'which is roughly double what the flat one per cent charged')
})

// ─────────────────────────────────────────── scoring calibration inside each regime

test('a pooled calibration score hides errors that cancel, so the score is taken inside each regime', () => {
  const cuts = vixTerciles(long)
  const fixed = dailyBandSeries(long, { k: 0.92 })
  const e = regimeError(fixed, cuts)

  assert.equal(e.n, fixed.length)
  assert.deepEqual(Object.keys(e.byRegime).sort(), ['high', 'low', 'mid'])
  assert.ok(e.byRegime.low.meanAbsZ < THEORY.meanAbsZ, 'a fixed multiplier is too wide when the market is calm')
  assert.ok(e.byRegime.high.meanAbsZ > THEORY.meanAbsZ, 'and too narrow when it is not')
  assert.ok(e.weighted > e.pooled * 2,
    `the pooled error ${e.pooled} is flattered by offsetting regimes; weighted is ${e.weighted}`)
})

test('a rolling refit of the multiplier beats a fixed one out of sample on every window tried', () => {
  let pooledDisagrees = 0
  for (const window of [250, 500, 1000]) {
    const r = rollingRegime(long, { window })
    assert.ok(r.n > 1000, `window ${window} leaves ${r.n} scored sessions`)
    assert.ok(r.regime.weighted < r.fixed.weighted,
      `window ${window}: regime ${r.regime.weighted} should beat fixed ${r.fixed.weighted} on the score that counts`)
    if (r.fixed.pooled <= r.regime.pooled) pooledDisagrees++
    for (const g of ['low', 'mid', 'high']) assert.ok(r.k[g] > 0.3 && r.k[g] < 2, `${g} last fit ${r.k[g]}`)
  }
  assert.ok(pooledDisagrees > 0,
    'and on at least one window the pooled score prefers the fixed multiplier, which is exactly why the first verdict was wrong')
})

test('every session a rolling refit scores was priced by a fit that ended before it', () => {
  const r = rollingRegime(long, { window: 250, keepSeries: true })
  assert.ok(r.series.length === r.n)
  for (const row of r.series) {
    assert.ok(row.fitTo < row.date, `${row.date} was priced by a fit running to ${row.fitTo}`)
    assert.ok(row.k > 0)
  }
})

// ─────────────────────────────────────────── the outer band against its base rate

test('the outer band separates what was already reached from what was still ahead', () => {
  const o = outerAfterBreak(long, { multiple: 2 })
  assert.ok(o.n > 700)
  assert.equal(o.reached.k, o.sameSession.k + o.nextSessionOnly.k,
    'every reach happened either on the break session or the one after it')
  assert.ok(o.sameSession.k > 200,
    'a large share of the reaches had already happened by the close that defined the setup')
  assert.equal(o.tradeable.n, o.n - o.sameSession.k,
    'only the breaks that had not already reached it were ever a trade')
  assert.ok(o.tradeable.point < o.reached.point,
    'so the tradeable rate is lower than the headline rate')
})

test('the outer band is reached no more often than a random walk of the same width reaches it', () => {
  const base = reachAfterBreakBaseRate({ paths: 60000, halfWidth: 1.036, multiple: 2, seed: 20260920 })
  near(base.point, 0.58, 0.02, 'a matched random walk reaches two sigma after a one sigma close about 58 per cent of the time')
  const o = outerAfterBreak(long, { multiple: 2 })
  assert.ok(o.reached.point < base.point,
    `measured ${o.reached.point} is not above the base rate ${base.point}, so reaching the inner band predicts nothing`)
  assert.ok(o.reached.high > base.point - 0.05,
    'it is not dramatically below it either: the outer line is a fair target, not a signal')
})

test('the same base rate is reproduced from the same seed and moves the right way with width', () => {
  const a = reachAfterBreakBaseRate({ paths: 20000, halfWidth: 1, multiple: 2, seed: 7 })
  const b = reachAfterBreakBaseRate({ paths: 20000, halfWidth: 1, multiple: 2, seed: 7 })
  assert.equal(a.point, b.point, 'seeded, so it is a fixture and not a coin toss')
  const wide = reachAfterBreakBaseRate({ paths: 20000, halfWidth: 1.2, multiple: 2, seed: 7 })
  assert.ok(wide.point < a.point, 'a wider band puts the outer line further away, so it is reached less often')
})

// ─────────────────────────────────────────── the regime helper itself

test('a session is placed in the regime its anchor volatility falls in', () => {
  const cuts = { low: 14.82, high: 19.4 }
  assert.equal(regimeOf(10, cuts), 'low')
  assert.equal(regimeOf(14.82, cuts), 'low', 'the cut belongs to the band below it')
  assert.equal(regimeOf(15, cuts), 'mid')
  assert.equal(regimeOf(19.4, cuts), 'mid')
  assert.equal(regimeOf(30, cuts), 'high')
  const solved = solveKByRegime(long)
  assert.equal(regimeOf(solved.cuts.low - 0.01, solved.cuts), 'low')
})
