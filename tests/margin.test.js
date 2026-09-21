/**
 * The thing the study could not see: you have to still be there at expiry.
 *
 * Every trade in the premium study is carried to settlement. A naked short
 * index position is margined, the requirement grows as it moves against you,
 * and a broker closes you out when your equity runs out. A backtest that
 * settles every trade is quietly assuming infinite collateral, and on the
 * worst window in the decade that assumption is the difference between the
 * number it reports and the money you actually have.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { marginRequirement, marginPath, simulatePremium } from '../lib/premium.js'

const long = JSON.parse(readFileSync(new URL('./fixtures/market-long.json', import.meta.url))).sessions
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

test('a naked short option is margined on the greater of a share of notional and a share of the strike', () => {
  // At the money, the 15 per cent of notional rule binds and nothing is out of the money.
  const atm = marginRequirement({ S: 100, strike: 100, value: 3, type: 'C' })
  near(atm, 0.15 * 100 - 0 + 3, 1e-9, '15% of spot plus the premium')

  // Far out of the money, the out-of-the-money credit eats the first rule and the floor binds.
  const far = marginRequirement({ S: 100, strike: 200, value: 0.1, type: 'C' })
  near(far, 0.10 * 200 + 0.1, 1e-9, 'the floor is a tenth of the strike')
  assert.ok(far > 0.15 * 100 - 100 + 0.1, 'the first rule would have gone negative')

  const put = marginRequirement({ S: 100, strike: 90, value: 1, type: 'P' })
  near(put, Math.max(0.15 * 100 - 10, 0.10 * 90) + 1, 1e-9, 'the put measures its own distance')
  assert.ok(marginRequirement({ S: 200, strike: 200, value: 6, type: 'C' }) >
    marginRequirement({ S: 100, strike: 100, value: 3, type: 'C' }), 'it scales with notional')
})

const everyPhase = (opts) => {
  const all = []
  for (let start = 0; start < opts.hold; start++) all.push(...simulatePremium(long, { ...opts, start }))
  return all
}

test('the margin on the worst window of the decade triples, and a fully used account is closed out first', () => {
  // Search every start offset rather than assume which one holds the crash.
  const trades = everyPhase({ hold: 21, widthSigma: 1, structure: 'strangle', costPerLeg: 0.05 })
  const worst = trades.reduce((a, b) => (b.pnl < a.pnl ? b : a))
  assert.equal(worst.entryDate, '2020-02-21')
  assert.equal(worst.exitDate, '2020-03-23')
  assert.ok(worst.pnl < -80, `the worst window is the crash: ${worst.pnl}`)

  const path = marginPath(long, worst)
  assert.ok(path.initialMargin > 0)
  assert.ok(path.peakMultiple > 2.5,
    `the requirement should multiply as it moves against you: ${path.peakMultiple}`)
  assert.ok(path.liquidatedOn != null && path.liquidatedOn < worst.exitDate,
    `an account funded at the initial margin runs out before expiry: ${path.liquidatedOn} against ${worst.exitDate}`)
  assert.ok(path.minEquity <= 0)
  assert.ok(path.liquidationLoss <= path.initialMargin + 1e-9,
    'you cannot lose more than you had, because you were closed out')
})

test('an ordinary month still asks for more collateral than it took to open', () => {
  const trades = everyPhase({ hold: 21, widthSigma: 1, structure: 'strangle', costPerLeg: 0.05 })
  const paths = trades.map((t) => marginPath(long, t))
  const multiples = paths.map((p) => p.peakMultiple).sort((a, b) => a - b)
  const median = multiples[Math.floor(multiples.length / 2)]
  assert.ok(median > 1.2, `even the median month peaks well above what was posted: ${median}`)

  const liquidated = paths.filter((p) => p.liquidatedOn != null)
  const share = liquidated.length / trades.length
  assert.ok(share > 0.002 && share < 0.02,
    `a fully used account is wiped out rarely and really: ${liquidated.length} of ${trades.length}`)
  // Roughly one month in 150 over a decade of monthly trades is once every dozen
  // years, which is inside the horizon of anyone asking about this.
  assert.ok(liquidated.every((p) => p.minEquity <= 0))
})

test('a defined-risk position cannot be closed out, because its worst case is posted on day one', () => {
  const trades = everyPhase({ hold: 21, widthSigma: 1, structure: 'condor', wingSigma: 0.25, costPerLeg: 0.05 })
  for (const t of trades) {
    const path = marginPath(long, t)
    assert.equal(path.liquidatedOn, null, `${t.entryDate} should never be liquidated`)
    near(path.initialMargin, t.maxLoss, 1e-9, 'the collateral is exactly the stated worst case')
    assert.equal(path.peakMultiple, 1, 'and it never rises')
  }
})
