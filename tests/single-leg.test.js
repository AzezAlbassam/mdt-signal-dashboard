/**
 * One option. Not four.
 *
 * The condor study answered whether the band is worth selling. It answered it
 * with a four-legged structure, which is the right shape and the wrong thing
 * to ask someone to place if they cannot picture it. This file asks the same
 * question of the two simplest trades there are: sell one put, or sell one
 * call, at the band, and hold it to expiry. Then the two-legged version of
 * each, where a second option is bought further out so the worst case is a
 * number you know on the day you open it.
 *
 * Everything settles European on the terminal close, as before. The tests
 * come first so the structures cannot be defined to flatter the result.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  shortSingle, creditSpread, simulateSingle, shortStrangle, singleMarginPath,
} from '../lib/premium.js'

const long = JSON.parse(readFileSync(new URL('./fixtures/market-long.json', import.meta.url))).sessions
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

const base = { S0: 5000, sigma: 0.15, days: 30, widthSigma: 1 }

// ──────────────────────────────────────────────── one leg

test('a short put sits below the market and a short call sits above it, both by the stated move', () => {
  const p = shortSingle({ ...base, S1: 5000, side: 'put' })
  const c = shortSingle({ ...base, S1: 5000, side: 'call' })
  const move = 5000 * 0.15 * Math.sqrt(30 / 365)
  near(p.strike, 5000 - move, 1e-9, 'the put strike is one move below')
  near(c.strike, 5000 + move, 1e-9, 'the call strike is one move above')
  assert.equal(p.legs, 1, 'one option, one leg')
})

test('a short put that finishes above its strike keeps the whole credit, and nothing more', () => {
  const t = shortSingle({ ...base, S1: 5200, side: 'put' })
  assert.equal(t.settlement, 0)
  near(t.pnl, t.premiumIn, 1e-12, 'the best case is the credit, whatever the index did')
  assert.ok(t.premiumIn > 0)

  // Finishing a single point above the strike is still a full win: European
  // cash settlement has no assignment and no early exercise.
  const edge = shortSingle({ ...base, S1: shortSingle({ ...base, S1: 5000, side: 'put' }).strike + 1, side: 'put' })
  near(edge.pnl, edge.premiumIn, 1e-12)
})

test('a short put below its strike loses point for point, and the loss is bounded only by zero', () => {
  const t = shortSingle({ ...base, S1: 4200, side: 'put' })
  near(t.settlement, t.strike - 4200, 1e-9)
  near(t.pnl, t.premiumIn - (t.strike - 4200), 1e-9)
  // The worst case a single short put can have is the strike itself.
  const ruin = shortSingle({ ...base, S1: 0, side: 'put' })
  near(ruin.pnl, ruin.premiumIn - ruin.strike, 1e-9, 'the index at zero costs the whole strike')
  assert.ok(ruin.pnl < -4000, 'which is why this one is not defined risk')
})

test('a short call above its strike loses point for point, with no bound at all', () => {
  const t = shortSingle({ ...base, S1: 6000, side: 'call' })
  near(t.settlement, 6000 - t.strike, 1e-9)
  const worse = shortSingle({ ...base, S1: 12000, side: 'call' })
  assert.ok(worse.pnl < t.pnl - 5000, 'a short call has no worst case to name')
})

test('the two single legs together are the strangle the earlier study sold', () => {
  const p = shortSingle({ ...base, S1: 5400, side: 'put' })
  const c = shortSingle({ ...base, S1: 5400, side: 'call' })
  const s = shortStrangle({ ...base, S1: 5400 })
  near(p.premiumIn + c.premiumIn, s.premiumIn, 1e-9, 'the credits add')
  near(p.pnl + c.pnl, s.pnl, 1e-9, 'and so do the outcomes')
})

// ──────────────────────────────────────────────── two legs of the same kind

test('a credit spread buys a second option further out, for a smaller credit and a loss you can name', () => {
  const single = shortSingle({ ...base, S1: 5000, side: 'put' })
  const sp = creditSpread({ ...base, S1: 5000, side: 'put', wingSigma: 0.5 })
  assert.equal(sp.legs, 2)
  near(sp.shortStrike, single.strike, 1e-9, 'the short strike is the same one')
  assert.ok(sp.longStrike < sp.shortStrike, 'the bought put is further from the market')
  assert.ok(sp.premiumIn > 0 && sp.premiumIn < single.premiumIn, 'buying protection costs part of the credit')
  near(sp.maxLoss, (sp.shortStrike - sp.longStrike) - sp.premiumIn, 1e-9, 'the worst case is the width less the credit')
})

test('no move, however violent, can cost a credit spread more than its stated maximum', () => {
  for (const S1 of [4800, 4000, 2500, 1, 0]) {
    const sp = creditSpread({ ...base, S1, side: 'put', wingSigma: 0.5 })
    assert.ok(sp.pnl >= -sp.maxLoss - 1e-9, `at ${S1} the loss stayed inside the maximum`)
  }
  const worst = creditSpread({ ...base, S1: 0, side: 'put', wingSigma: 0.5 })
  near(worst.pnl, -worst.maxLoss, 1e-9, 'and at the extreme it is exactly the maximum')

  for (const S1 of [5300, 7000, 20000]) {
    const sp = creditSpread({ ...base, S1, side: 'call', wingSigma: 0.5 })
    assert.ok(sp.pnl >= -sp.maxLoss - 1e-9, `a call spread is capped too, at ${S1}`)
  }
})

test('a call spread is the put spread reflected, when the market is reflected with it', () => {
  const up = creditSpread({ ...base, S1: 5000 * 1.08, side: 'call', wingSigma: 0.5 })
  const down = creditSpread({ ...base, S1: 5000 / 1.08, side: 'put', wingSigma: 0.5 })
  // Not identical to the last cent, because a lognormal is not symmetric, but
  // the same trade in every structural respect.
  near(up.maxLoss / down.maxLoss, 1, 0.06, 'the same money at risk')
  assert.equal(up.legs, down.legs)
})

// ──────────────────────────────────────────────── over the decade

test('a one-sided trade is breached less often than a two-sided one, by construction', () => {
  const opts = { hold: 21, widthSigma: 1 }
  const puts = simulateSingle(long, { ...opts, side: 'put', structure: 'single' })
  const calls = simulateSingle(long, { ...opts, side: 'call', structure: 'single' })
  const rate = (ts) => ts.filter((t) => t.settlement === 0).length / ts.length
  assert.ok(puts.length > 110 && puts.length < 130, `one a month over a decade: ${puts.length}`)
  // Selling only one side can only be touched by one side.
  assert.ok(rate(puts) > 0.8, `a one-sigma put is untouched most months: ${rate(puts)}`)
  assert.ok(rate(calls) > 0.7, `and so is a one-sigma call: ${rate(calls)}`)
  assert.ok(rate(puts) + rate(calls) > 1.5)
})

test('the decade knows which side of the band gets hit, and it is not the symmetric one', () => {
  // An index that drifts up breaches its call strike more often than its put
  // strike, and this is the fact any one-sided sale lives or dies on.
  const puts = simulateSingle(long, { hold: 21, widthSigma: 1, side: 'put', structure: 'single' })
  const calls = simulateSingle(long, { hold: 21, widthSigma: 1, side: 'call', structure: 'single' })
  const breached = (ts) => ts.filter((t) => t.settlement > 0).length
  assert.ok(breached(calls) > breached(puts),
    `the call side is breached more over a rising decade: ${breached(calls)} against ${breached(puts)}`)
})

test('every simulated trade prices its option off the VIX of the day it opened and nothing later', () => {
  const ts = simulateSingle(long, { hold: 21, widthSigma: 1, side: 'put', structure: 'spread', wingSigma: 0.5 })
  for (const t of ts.slice(0, 20)) {
    near(t.sigma, t.entryVix / 100, 1e-12, 'the volatility used is the entry VIX')
    assert.ok(t.entryDate < t.exitDate)
    assert.ok(t.maxLoss > 0 && t.pnl >= -t.maxLoss - 1e-9)
  }
})

// ──────────────────────────────────────────────── being there at expiry

test('a defined-risk spread posts its whole worst case on day one and never asks for more', () => {
  const ts = simulateSingle(long, { hold: 21, widthSigma: 1, side: 'put', structure: 'spread', wingSigma: 0.5 })
  const worst = [...ts].sort((a, b) => a.pnl - b.pnl)[0]
  const path = singleMarginPath(long, worst)
  assert.equal(path.initialMargin, worst.maxLoss, 'the requirement is the maximum loss itself')
  assert.equal(path.peakMultiple, 1, 'and it cannot grow')
  assert.equal(path.calledOn, null, 'so no move can produce a call')
})

test('a naked short put asks for more as it goes against you, which is the whole difference', () => {
  const flat = Array.from({ length: 40 }, (_, i) => ({
    date: `2020-01-${String(i + 1).padStart(2, '0')}`, open: 100, high: 100, low: 100, close: 100, vix: 15,
  }))
  const calm = singleMarginPath(flat, {
    entryDate: flat[0].date, exitDate: flat[21].date, structure: 'single', side: 'put',
    strike: 95, S0: 100, sigma: 0.15, calendarDays: 21, premiumIn: 0.4, costs: 0.05,
  })
  assert.equal(calm.calledOn, null, 'a tape that never moves never calls')
  assert.ok(calm.peakMultiple <= 1.01, 'and the requirement barely moves')
  assert.ok(calm.initialMargin > 0)
})

test('the worst month of the decade takes the naked account out before the expiry the study books', () => {
  // This is the finding the settle-every-trade backtest cannot see. The trade
  // books its loss at expiry; the account is gone before it gets there.
  const all = []
  for (let start = 0; start < 21; start++) {
    all.push(...simulateSingle(long, { hold: 21, widthSigma: 1, side: 'put', structure: 'single', start, costPerLeg: 0.05 }))
  }
  const worst = [...all].sort((a, b) => a.pnl - b.pnl)[0]
  const path = singleMarginPath(long, worst, { funding: 1 })
  assert.ok(path.peakMultiple > 2, `the requirement more than doubled against the account: ${path.peakMultiple}`)
  assert.ok(path.calledOn != null, 'an account funded at the initial requirement is called')
  assert.ok(path.calledOn < worst.exitDate, `called on ${path.calledOn}, before expiry on ${worst.exitDate}`)
})
