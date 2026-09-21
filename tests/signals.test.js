/**
 * Single-leg trades off the expected-move band: buy one call, or buy one put,
 * with a stated target and a stated stop.
 *
 * This is a different question from the premium study. There the trade was
 * defined by an expiry. Here it is defined by two price levels, so a win rate
 * and a reward-to-risk ratio both exist and can be measured.
 *
 * The arithmetic that governs the whole search: on a path with no edge, a
 * target of T and a stop of S are hit first with probabilities S/(T+S) and
 * T/(T+S). Win rate and reward-to-risk are therefore locked together, and
 * asking for both to be high is asking for an edge over that. These tests pin
 * the measurement so the search cannot quietly cheat it.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  signalDates, runTrade, simulateSignal, summariseSignal, randomWalkBaseRate,
  unconditionalBaseline, placeboTrades, placeboDistribution, searchPlacebo, RULES,
} from '../lib/signals.js'

const long = JSON.parse(readFileSync(new URL('./fixtures/market-long.json', import.meta.url))).sessions
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

// ─────────────────────────────────────────────── triggers

test('every rule is named, and a rarer rule fires strictly less often', () => {
  assert.ok(RULES.includes('closeBelowBand'))
  assert.ok(RULES.includes('closeBelowOuter'))
  const one = signalDates(long, { rule: 'closeBelowBand' })
  const two = signalDates(long, { rule: 'closeBelowOuter' })
  assert.ok(one.length > 200, `a one-sigma close break is common: ${one.length}`)
  assert.ok(two.length < one.length / 3, `a two-sigma break is much rarer: ${two.length} against ${one.length}`)
  for (const d of two) assert.ok(one.includes(d), 'every deep break is also a break')
})

test('a trigger is only ever read from a session that has already closed', () => {
  const dates = signalDates(long, { rule: 'closeBelowBand' })
  const index = new Map(long.map((s, i) => [s.date, i]))
  for (const d of dates.slice(0, 50)) {
    const i = index.get(d)
    assert.ok(i >= 1, 'a band needs a prior close')
    // The rule can only involve this session's close and earlier data.
    assert.ok(long[i].close < long[i - 1].close, 'a down break closed below the prior close')
  }
})

// ─────────────────────────────────────────────── one trade

const bar = (close, high, low, open = close) => ({ date: 'x', open, high, low, close })

test('a trade is entered on the session after the signal, never on the signal itself', () => {
  const trades = simulateSignal(long, { rule: 'closeBelowBand', direction: 'call', targetSigma: 2, stopSigma: 1, maxHold: 10 })
  const index = new Map(long.map((s, i) => [s.date, i]))
  for (const t of trades.slice(0, 40)) {
    assert.ok(index.get(t.entryDate) === index.get(t.signalDate) + 1,
      `${t.signalDate} should be entered the next session, not ${t.entryDate}`)
    assert.equal(t.entryPrice, long[index.get(t.entryDate)].open, 'entered at the open you could actually get')
    assert.ok(t.exitDate >= t.entryDate)
  }
})

// Entry is always the OPEN of the session after the signal, so every path
// below states that open explicitly rather than letting it default.
test('the target is taken when reached, and the level is the one that was stated', () => {
  const path = [bar(100, 100, 100, 100), bar(101, 106, 99, 100)]
  const t = runTrade(path, 0, { direction: 'call', unit: 5, targetSigma: 1, stopSigma: 1 })
  assert.equal(t.entryPrice, 100, 'the open of the session after the signal')
  assert.equal(t.outcome, 'target')
  assert.equal(t.exitPrice, 105, 'filled at the target, not at the high')
  near(t.rMultiple, 1, 1e-12)
})

test('the stop is taken when reached', () => {
  const path = [bar(100, 100, 100, 100), bar(97, 100, 94, 100)]
  const t = runTrade(path, 0, { direction: 'call', unit: 5, targetSigma: 2, stopSigma: 1 })
  assert.equal(t.outcome, 'stop')
  assert.equal(t.exitPrice, 95)
  near(t.rMultiple, -1, 1e-12)
})

test('a session that touches both the target and the stop is scored as the stop', () => {
  // Daily bars cannot say which came first, and assuming the good one is how
  // a backtest lies to itself.
  const path = [bar(100, 100, 100, 100), bar(100, 112, 94, 100)]
  const t = runTrade(path, 0, { direction: 'call', unit: 5, targetSigma: 2, stopSigma: 1 })
  assert.equal(t.outcome, 'stop', 'the ambiguous bar resolves against the trade')
  near(t.rMultiple, -1, 1e-12)
})

test('a trade that reaches neither level exits at the close of the last session held', () => {
  const path = [bar(100, 100, 100, 100), bar(101, 102, 100, 100), bar(102, 103, 101, 101), bar(101.5, 102, 101, 102)]
  const t = runTrade(path, 0, { direction: 'call', unit: 5, targetSigma: 2, stopSigma: 2, maxHold: 3 })
  assert.equal(t.outcome, 'time')
  assert.equal(t.exitPrice, 101.5)
  near(t.rMultiple, (101.5 - 100) / 10, 1e-12, 'a time exit is scored in the same risk units')
})

test('a put is the mirror of a call in every particular', () => {
  const stopped = runTrade([bar(100, 100, 100, 100), bar(100, 112, 99, 100)], 0,
    { direction: 'put', unit: 5, targetSigma: 2, stopSigma: 1 })
  assert.equal(stopped.outcome, 'stop', 'a rally stops a put')
  assert.equal(stopped.exitPrice, 105)
  near(stopped.rMultiple, -1, 1e-12)

  const hit = runTrade([bar(100, 100, 100, 100), bar(100, 101, 88, 100)], 0,
    { direction: 'put', unit: 5, targetSigma: 2, stopSigma: 1 })
  assert.equal(hit.outcome, 'target')
  assert.equal(hit.exitPrice, 90)
  near(hit.rMultiple, 2, 1e-12)
})

// ─────────────────────────────────────────────── the arithmetic that bounds it

test('on a walk with no edge the win rate is set by the reward-to-risk and nothing else', () => {
  for (const [targetSigma, stopSigma] of [[1, 1], [2, 1], [1, 2], [3, 1]]) {
    const b = randomWalkBaseRate({ targetSigma, stopSigma, maxHold: 60, paths: 40000, seed: 7 })
    const theory = stopSigma / (targetSigma + stopSigma)
    near(b.winRate, theory, 0.03, `target ${targetSigma} stop ${stopSigma}`)
    near(b.expectancy, 0, 0.06, 'and the expectancy is zero, whatever the pair')
  }
})

test('the base rate is reproducible from a seed', () => {
  const a = randomWalkBaseRate({ targetSigma: 2, stopSigma: 1, maxHold: 40, paths: 8000, seed: 3 })
  const b = randomWalkBaseRate({ targetSigma: 2, stopSigma: 1, maxHold: 40, paths: 8000, seed: 3 })
  assert.equal(a.winRate, b.winRate)
})

// ─────────────────────────────────────────────── the summary

test('a summary reports the rate, the reward-to-risk actually achieved, and how often it fires', () => {
  const trades = simulateSignal(long, { rule: 'closeBelowBand', direction: 'call', targetSigma: 2, stopSigma: 1, maxHold: 10 })
  const s = summariseSignal(trades, long)
  assert.equal(s.n, trades.length)
  assert.ok(s.n > 100)
  assert.ok(s.winRate.point > 0.1 && s.winRate.point < 0.9)
  assert.ok(s.perYear > 1, `a rule this loose fires many times a year: ${s.perYear}`)
  // Expectancy in risk units is the number that decides everything.
  near(s.expectancyR, s.winRate.point * s.meanWinR + (1 - s.winRate.point) * s.meanLossR, 1e-9)
  assert.ok(Number.isFinite(s.profitFactor))
})

// ─────────────────────────────────────────────── the control that matters most

test('an unconditional baseline takes the same trade on every session, so a rule can be compared to doing it anyway', () => {
  const b = unconditionalBaseline(long, { direction: 'call', targetSigma: 2, stopSigma: 1, maxHold: 10 })
  assert.ok(b.n > 200, `with a ten-session cooldown a decade gives a few hundred: ${b.n}`)
  assert.ok(b.winRate.point > 0.2 && b.winRate.point < 0.7)

  // The whole point: a long call on a drifting index wins more often than a
  // driftless walk says it should, before any signal is involved.
  const walk = randomWalkBaseRate({ targetSigma: 2, stopSigma: 1, maxHold: 10, paths: 20000, seed: 11 })
  assert.ok(b.winRate.point > walk.winRate,
    `buying calls at random already beats the driftless rate: ${b.winRate.point} against ${walk.winRate}`)

  // And the put mirror should be worse than its driftless rate, for the same reason.
  const p = unconditionalBaseline(long, { direction: 'put', targetSigma: 2, stopSigma: 1, maxHold: 10 })
  assert.ok(p.winRate.point < b.winRate.point, 'a put bought at random does worse than a call bought at random')
})

test('a rule is only interesting if it beats taking the same trade unconditionally', () => {
  const opts = { direction: 'call', targetSigma: 3, stopSigma: 1, maxHold: 10 }
  const rule = summariseSignal(simulateSignal(long, { rule: 'closeBelowBand', cooldown: 10, ...opts }), long)
  const anyway = unconditionalBaseline(long, opts)
  // Both numbers must exist for the comparison to mean anything; the verdict
  // itself is measured in the study, not asserted here.
  assert.ok(Number.isFinite(rule.expectancyR) && Number.isFinite(anyway.expectancyR))
  assert.ok(anyway.n > rule.n, 'the unconditional version necessarily has more trades')
})

// ─────────────────────────────────────────────── the placebo

/**
 * The control that survives a search. `unconditionalBaseline` answers "is this
 * better than doing it anyway", but 576 combinations were tried, and the best
 * of 576 noisy estimates is large even when every one of them is noise. The
 * placebo answers the remaining question: take the same number of trades on
 * random dates, and see how big an edge that alone produces.
 */

test('combinations that share a rule share the dates a draw gives them', () => {
  const shared = [
    { n: 30, group: 'r', direction: 'call', targetSigma: 2, stopSigma: 1, maxHold: 10 },
    { n: 30, group: 'r', direction: 'put', targetSigma: 2, stopSigma: 1, maxHold: 10 },
  ]
  // The real sweep reuses one rule's dates across every target and stop, so
  // the null has to reuse them too, or it would pretend they were independent.
  const m = searchPlacebo(long, shared, { draws: 5, seed: 2, keepDates: true })
  for (const d of m.dates) assert.equal(d.r.length, 30)
  assert.equal(Object.keys(m.dates[0]).length, 1, 'one date set, not two')
})

test('a placebo draw takes the number of trades asked for, on dates the rule never chose, without overlapping', () => {
  const opts = { direction: 'call', targetSigma: 3, stopSigma: 1, maxHold: 10, cooldown: 10 }
  const trades = placeboTrades(long, { n: 40, seed: 5, ...opts })
  assert.equal(trades.length, 40)
  const index = new Map(long.map((s, i) => [s.date, i]))
  const at = trades.map((t) => index.get(t.signalDate)).sort((a, b) => a - b)
  for (let i = 1; i < at.length; i++) {
    assert.ok(at[i] - at[i - 1] > 10, `entries must respect the same cooldown: ${at[i - 1]} then ${at[i]}`)
  }
  for (const t of trades) assert.equal(t.entryPrice, long[index.get(t.entryDate)].open)
})

test('a placebo distribution is reproducible from a seed', () => {
  const opts = { n: 30, direction: 'call', targetSigma: 2, stopSigma: 1, maxHold: 10, draws: 40, seed: 9 }
  const a = placeboDistribution(long, opts)
  const b = placeboDistribution(long, opts)
  assert.deepEqual(a.samples, b.samples)
  assert.equal(a.samples.length, 40)
})

test('the placebo averages out to the unconditional baseline, because a random date is no rule at all', () => {
  // This is the test that makes the placebo mean anything. If random entries
  // did not reproduce the take-it-anyway number, the comparison would be
  // measuring the machinery rather than the rule.
  const opts = { direction: 'call', targetSigma: 2, stopSigma: 1, maxHold: 10 }
  const anyway = unconditionalBaseline(long, opts)
  const p = placeboDistribution(long, { n: 120, draws: 300, seed: 4, cooldown: 10, ...opts })
  near(p.mean, anyway.expectancyR, 0.09, 'random dates reproduce the unconditional expectancy')
})

test('a placebo p-value counts the draws that matched the claim, and falls as the claim grows', () => {
  const opts = { n: 36, direction: 'call', targetSigma: 3, stopSigma: 1, maxHold: 21, draws: 200, seed: 12, cooldown: 21 }
  const p = placeboDistribution(long, opts)
  assert.ok(p.pValue(-99) === 1, 'everything beats an absurdly low claim')
  assert.ok(p.pValue(99) < 0.02, 'nothing beats an absurdly high one')
  assert.ok(p.pValue(p.mean) > 0.2 && p.pValue(p.mean) < 0.8, 'the middle of the distribution is not remarkable')
  // And the spread at this sample size is the whole point: it must be wide
  // enough that a tenth of a risk unit is not evidence of anything.
  assert.ok(p.sd > 0.1, `36 trades is a noisy estimate: sd ${p.sd}`)
})

test('the honest threshold is the best of the whole search, not the best of one combination', () => {
  // Under the null, each draw runs every combination on its own random dates
  // and keeps the largest edge found. That maximum is what a 576-way search
  // produces from noise, and it is the number a headline has to beat.
  const configs = [
    { n: 36, direction: 'call', targetSigma: 3, stopSigma: 1, maxHold: 21 },
    { n: 40, direction: 'put', targetSigma: 3, stopSigma: 1, maxHold: 10 },
    { n: 33, direction: 'put', targetSigma: 3, stopSigma: 2, maxHold: 10 },
  ]
  const m = searchPlacebo(long, configs, { draws: 60, seed: 21 })
  assert.equal(m.samples.length, 60)
  // Compared like with like: both are edges over the same unconditional line,
  // and the best of three cannot average less than one of the three.
  const one = placeboDistribution(long, { ...configs[0], draws: 60, seed: 21, cooldown: 21 })
  assert.ok(m.mean >= one.edgeMean - 1e-9, 'the max over a search cannot be smaller than one of its members')
  assert.ok(m.pValue(99) < 0.02)
  assert.ok(m.mean > 0, 'searching 576 ways finds a positive edge in pure noise, and that is the point')
})
