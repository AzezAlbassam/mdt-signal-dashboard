/**
 * What an actual account does, as opposed to what a strategy returns.
 *
 * The study reports percentages of the money at risk. An account is not a
 * percentage: it has a size, it buys whole contracts, and a contract whose
 * maximum loss is larger than the risk budget cannot be bought at all. That
 * last fact is the whole reason this file exists, because it is the difference
 * between a strategy that works and a strategy you can trade.
 *
 * Tests first, so the sizing rule cannot be quietly relaxed to make a small
 * account look tradeable.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sizePosition, simulateAccount, windowResults, accountAcrossPhases, CONTRACT_MULTIPLIER } from '../lib/account.js'

const long = JSON.parse(readFileSync(new URL('./fixtures/market-long.json', import.meta.url))).sessions
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

// ──────────────────────────────────────────────── sizing

test('a contract is a whole number, and the risk budget is a ceiling not a target', () => {
  // $10,000 at 5 per cent is $500. A contract risking $1,650 does not fit.
  const none = sizePosition({ equity: 10000, riskPct: 0.05, maxLossPoints: 16.5 })
  assert.equal(none.contracts, 0, 'you cannot buy a fraction of a contract')
  assert.equal(none.affordable, false)
  near(none.onePositionRiskPct, 0.165, 1e-9, 'one contract would be 16.5% of the account')

  // The same trade in an account ten times larger buys six, not six and a half.
  const six = sizePosition({ equity: 100000, riskPct: 0.05, maxLossPoints: 16.5 })
  assert.equal(six.contracts, 3, '$5,000 budget ÷ $1,650 a contract is three whole ones')
  assert.ok(six.riskDollars <= 100000 * 0.05, 'and the risk taken never exceeds the budget')
})

test('the multiplier is a hundred, because an index option covers a hundred units', () => {
  assert.equal(CONTRACT_MULTIPLIER, 100)
  const s = sizePosition({ equity: 50000, riskPct: 0.05, maxLossPoints: 5 })
  assert.equal(s.contractRisk, 500, 'five points of loss is five hundred dollars')
  assert.equal(s.contracts, 5)
})

test('a risk budget that cannot buy one contract reports how much it is short by', () => {
  const s = sizePosition({ equity: 10000, riskPct: 0.05, maxLossPoints: 16.5 })
  assert.equal(s.contracts, 0)
  near(s.equityNeededForOne, 16.5 * 100 / 0.05, 1e-9, 'the account that could buy one at this rule')
  assert.ok(s.equityNeededForOne > 30000, 'and it is a lot more than ten thousand')
})

// ──────────────────────────────────────────────── the account through time

test('an account that can never afford a contract never trades and never changes', () => {
  const r = simulateAccount(long, {
    capital: 10000, riskPct: 0.05, from: '2026-01-01',
    side: 'call', widthSigma: 1.25, wingSigma: 0.5, hold: 21,
  })
  assert.equal(r.trades.length, 0, 'not one trade was affordable')
  assert.equal(r.finalEquity, 10000, 'so the account is exactly where it started')
  assert.ok(r.skipped > 0, 'and every opportunity was recorded as skipped, not as a win')
  assert.equal(r.everTraded, false)
})

test('an account large enough compounds, and every trade is one of the study\'s own', () => {
  const r = simulateAccount(long, {
    capital: 250000, riskPct: 0.05, from: '2026-01-01',
    side: 'call', widthSigma: 1.25, wingSigma: 0.5, hold: 21,
  })
  assert.ok(r.trades.length >= 7, `about one a month from January: ${r.trades.length}`)
  assert.equal(r.everTraded, true)
  for (const t of r.trades) {
    assert.ok(t.contracts >= 1)
    assert.ok(t.riskDollars <= t.equityBefore * 0.05 + 1e-9, 'the rule holds on every single trade')
    near(t.equityAfter, t.equityBefore + t.pnlDollars, 1e-9, 'the account moves by exactly the trade')
    assert.ok(t.pnlDollars >= -t.riskDollars - 1e-9, 'and never by more than the risk')
  }
  near(r.finalEquity, r.trades[r.trades.length - 1].equityAfter, 1e-9)
})

test('forcing one contract into a too-small account is recorded as the over-risk it is', () => {
  const r = simulateAccount(long, {
    capital: 10000, riskPct: 0.05, from: '2026-01-01', forceOneContract: true,
    side: 'call', widthSigma: 1.25, wingSigma: 0.5, hold: 21,
  })
  assert.ok(r.trades.length > 0, 'now it trades')
  assert.ok(r.maxSingleRiskPct > 0.12, `but each trade risked far more than the rule allows: ${r.maxSingleRiskPct}`)
  for (const t of r.trades) assert.equal(t.contracts, 1)
  assert.ok(r.overRiskTrades === r.trades.length, 'every one of them broke the sizing rule')
})

test('a defined-risk account cannot be taken below zero by a losing trade', () => {
  // Even forcing contracts into an account far too small, the worst case is
  // bounded, because the structure itself is bounded.
  const r = simulateAccount(long, {
    capital: 3000, riskPct: 0.05, from: '2022-01-01', forceOneContract: true,
    side: 'call', widthSigma: 1.25, wingSigma: 0.5, hold: 21,
  })
  for (const t of r.trades) assert.ok(t.equityAfter > -1e-9, `equity went negative on ${t.entryDate}`)
  assert.ok(r.ruined === true || r.finalEquity >= 0)
})

// ──────────────────────────────────────────────── one path is not the answer

test('every same-length window of the decade is reported, because one window is an anecdote', () => {
  const w = windowResults(long, {
    capital: 250000, riskPct: 0.05, months: 9,
    side: 'call', widthSigma: 1.25, wingSigma: 0.5, hold: 21,
  })
  assert.ok(w.windows.length > 80, `a decade holds many nine-month windows: ${w.windows.length}`)
  assert.ok(w.worst.returnPct < w.median.returnPct)
  assert.ok(w.median.returnPct < w.best.returnPct)
  // The spread is the point: a single window tells you almost nothing.
  assert.ok(w.best.returnPct - w.worst.returnPct > 0.05,
    `nine months is short enough that outcomes differ a lot: ${w.worst.returnPct} to ${w.best.returnPct}`)
  assert.ok(w.shareProfitable >= 0 && w.shareProfitable <= 1)
})

// ──────────────────────────────────────────────── the options must actually arrive

test('every pricing option an account is given reaches the structure that prices the trade', () => {
  // An earlier version destructured a closed list and passed seven keys on.
  // Anything else was accepted, ignored, and returned a confidently identical
  // answer — which is worse than refusing it, because it reads as "pricing
  // does not matter" to whoever tried to stress it.
  const base = { capital: 1000000, riskPct: 0.05, from: '2020-01-01', side: 'call', widthSigma: 1.25, wingSigma: 0.5, hold: 21 }
  const plain = simulateAccount(long, base)
  for (const override of [{ pricingScale: 0.8 }, { skew: 0.15 }, { ivScale: 0.85 }, { r: 0.04 }]) {
    const moved = simulateAccount(long, { ...base, ...override })
    assert.notEqual(moved.finalEquity, plain.finalEquity,
      `${Object.keys(override)[0]} was accepted and then ignored`)
  }
})

test('a wing can be named in points, because listed strikes are a fixed distance apart', () => {
  // XSP lists strikes $5 apart above $200, so a wing named in sigma lands
  // between two strikes that do not exist. A wing named in points does not.
  const bySigma = simulateAccount(long, {
    capital: 1000000, riskPct: 0.05, from: '2026-01-01', side: 'call', widthSigma: 1.25, wingSigma: 0.5, hold: 21,
  })
  const byPoints = simulateAccount(long, {
    capital: 1000000, riskPct: 0.05, from: '2026-01-01', side: 'call', widthSigma: 1.25, wingPoints: 5, hold: 21,
  })
  assert.ok(byPoints.trades.length > 0)
  for (const t of byPoints.trades) {
    assert.ok(t.maxLossPoints < 5, 'a five point wing cannot lose more than five points')
    assert.ok(t.maxLossPoints > 3, `and the credit is only part of it: ${t.maxLossPoints}`)
  }
  assert.notEqual(byPoints.finalEquity, bySigma.finalEquity)
})

test('idle cash is not zero, so an account that never trades still moves', () => {
  // r = 0 runs through the whole model. At the account level that turns "you
  // cannot trade this" into "you end where you started", which is false: the
  // money earns the bill rate while it sits there, and that rate is the thing
  // the strategy actually has to beat.
  const idle = simulateAccount(long, {
    capital: 10000, riskPct: 0.05, from: '2026-01-01', cashRate: 0.04,
    side: 'call', widthSigma: 1.25, wingSigma: 0.5, hold: 21,
  })
  assert.equal(idle.trades.length, 0, 'still unaffordable')
  assert.ok(idle.finalEquity > 10000, `cash earned something: ${idle.finalEquity}`)
  assert.ok(idle.finalEquity < 10400, 'but only eight and a half months of it')
  near(idle.cashInterest, idle.finalEquity - 10000, 1e-9)
})

test('the phase a calendar happens to fall on is reported, not chosen', () => {
  // Every other study in this repo runs all start offsets and averages. The
  // account study is the one that answers the question a person actually
  // asks, so it is the one that must not quietly pick a phase.
  const a = accountAcrossPhases(long, {
    capital: 10000, riskPct: 0.05, from: '2026-01-01', forceOneContract: true,
    side: 'call', widthSigma: 1.25, wingSigma: 0.5, hold: 21,
  })
  assert.ok(a.phases >= 15, `one per start offset that fits: ${a.phases}`)
  assert.ok(a.worst.returnPct < a.median.returnPct)
  assert.ok(a.median.returnPct < a.best.returnPct)
  assert.ok(a.best.returnPct - a.worst.returnPct > 0.04,
    `the same year on a different start day is a different answer: ${a.worst.returnPct} to ${a.best.returnPct}`)
})
