/**
 * The low-frequency question: one trade a month, held to expiry, on a
 * cash-settled European index option.
 *
 * This is a different experiment from the same-session study, and a more
 * trustworthy one, for a single reason. VIX *is* a thirty-day at-the-money
 * implied volatility on this very index, published by the exchange that lists
 * the options. Pricing a twenty-one session option off it is close to reading
 * a real quote. Pricing a zero-day option off it, as the earlier study had to,
 * was a guess that turned out to be the whole result.
 *
 * Everything here settles on the terminal price alone, because that is how a
 * European index option settles. No path, no assignment, no exercise decision.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  horizons, realisedVol, variancePremium, shortStrangle, ironCondor,
  simulatePremium, summarisePremium, ANNUALISATION,
} from '../lib/premium.js'

const long = JSON.parse(readFileSync(new URL('./fixtures/market-long.json', import.meta.url))).sessions
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

// ──────────────────────────────────────────────── holding periods

test('holding periods are a fixed number of sessions, back to back, and never run off the end', () => {
  const h = horizons(long, { hold: 21 })
  assert.ok(h.length > 120 && h.length < 130, `about five a year over a decade, got ${h.length}`)
  for (const p of h) {
    assert.equal(p.exitIndex - p.entryIndex, 21, 'every period is the same length in sessions')
    assert.ok(p.exitIndex < long.length)
    assert.ok(p.entry.date < p.exit.date)
    assert.ok(p.calendarDays >= 28 && p.calendarDays <= 35, `21 sessions is about a month: ${p.calendarDays}`)
  }
  for (let i = 1; i < h.length; i++) {
    assert.equal(h[i].entryIndex, h[i - 1].exitIndex, 'each trade starts where the last one ended, so none overlap')
  }
  assert.equal(horizons(long, { hold: 10 })[0].exitIndex, 10)
  assert.ok(horizons(long, { hold: 21, start: 5 })[0].entryIndex === 5, 'the first entry can be offset')
})

// ──────────────────────────────────────────────── realised volatility

test('realised volatility is annualised from close to close and is zero for a flat tape', () => {
  const flat = Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, close: 100, high: 100, low: 100, open: 100, vix: 15 }))
  near(realisedVol(flat, 0, 29), 0, 1e-12, 'a tape that never moves realises nothing')

  // A tape that alternates by a fixed log step has a known standard deviation.
  const step = 0.01
  const alt = Array.from({ length: 41 }, (_, i) => ({ close: 100 * Math.exp(i % 2 === 0 ? 0 : step) }))
  const v = realisedVol(alt, 0, 40)
  // returns alternate +step and -step, mean 0, sample sd = step * sqrt(n/(n-1))
  near(v, step * Math.sqrt(40 / 39) * Math.sqrt(ANNUALISATION), 1e-9, 'alternating steps')
  assert.equal(ANNUALISATION, 252, 'realised volatility counts trading days')
})

test('over the decade the index implied more volatility than it went on to deliver', () => {
  const p = variancePremium(long, { hold: 21 })
  assert.ok(p.n > 120, `${p.n} non-overlapping months`)
  assert.ok(p.meanRatio > 1.05,
    `mean implied over subsequent realised should exceed one: ${p.meanRatio}`)
  assert.ok(p.shareImpliedHigher > 0.6,
    `and it should be the usual case, not a rare one: ${p.shareImpliedHigher}`)
  // This is the whole reason a premium seller has anything to sell.
  assert.ok(p.medianRatio > 1, 'the median month too, not just a mean dragged by calm years')
  for (const g of ['low', 'mid', 'high']) assert.ok(p.byRegime[g].n > 20, `${g} regime has a sample`)
})

// ──────────────────────────────────────────────── the structures

test('a short strangle keeps the whole premium when the index settles between the strikes', () => {
  const t = shortStrangle({ S0: 5000, S1: 5050, sigma: 0.16, days: 30, widthSigma: 1 })
  assert.ok(t.putStrike < 5000 && t.callStrike > 5000)
  assert.ok(t.premiumIn > 0)
  assert.equal(t.settlement, 0, 'both legs expire worthless')
  near(t.pnl, t.premiumIn, 1e-9)
})

test('a short strangle loses linearly once the index settles past a strike', () => {
  const base = { S0: 5000, sigma: 0.16, days: 30, widthSigma: 1 }
  const inside = shortStrangle({ ...base, S1: 5000 })
  const beyond = shortStrangle({ ...base, S1: base.S0 * 2 })
  assert.ok(beyond.pnl < 0)
  const further = shortStrangle({ ...base, S1: base.S0 * 2 + 100 })
  near(further.pnl - beyond.pnl, -100, 1e-9, 'each further point costs one more point')
  assert.equal(inside.premiumIn, beyond.premiumIn, 'the premium is set at entry and does not depend on the outcome')
})

test('the strikes sit a stated number of standard deviations out, on the horizon actually held', () => {
  const t = shortStrangle({ S0: 5000, S1: 5000, sigma: 0.20, days: 30, widthSigma: 1 })
  const move = 5000 * 0.20 * Math.sqrt(30 / 365)
  near(t.callStrike, 5000 + move, 1e-9)
  near(t.putStrike, 5000 - move, 1e-9)
  const wide = shortStrangle({ S0: 5000, S1: 5000, sigma: 0.20, days: 30, widthSigma: 2 })
  near(wide.callStrike - 5000, 2 * move, 1e-9)
  assert.ok(wide.premiumIn < t.premiumIn, 'further out collects less')
})

test('skew pays the seller more for the put than the call, which is why ignoring it is the cautious choice', () => {
  const flat = shortStrangle({ S0: 5000, S1: 5000, sigma: 0.16, days: 30, widthSigma: 1, skew: 0 })
  const skewed = shortStrangle({ S0: 5000, S1: 5000, sigma: 0.16, days: 30, widthSigma: 1, skew: 0.10 })
  assert.ok(skewed.putPremium > flat.putPremium, 'the put is bid up')
  assert.ok(skewed.callPremium < flat.callPremium, 'the call is offered down')
  assert.ok(skewed.premiumIn > flat.premiumIn, 'and on the whole the seller is paid more')
})

test('an iron condor caps the loss at the wing width however far the index goes', () => {
  const base = { S0: 5000, sigma: 0.16, days: 30, widthSigma: 1, wingPoints: 100 }
  const calm = ironCondor({ ...base, S1: 5000 })
  near(calm.pnl, calm.premiumIn, 1e-9, 'inside the strikes it keeps the credit')
  const crash = ironCondor({ ...base, S1: 1000 })
  const worse = ironCondor({ ...base, S1: 500 })
  assert.equal(crash.pnl, worse.pnl, 'past the wing the loss stops growing')
  near(crash.pnl, calm.premiumIn - 100, 1e-9, 'the most it can lose is the wing less the credit')
  assert.ok(crash.premiumIn < shortStrangle({ ...base, S1: 5000 }).premiumIn,
    'buying the wings costs some of the credit')
  // A wing can also be named in sigma, which is what travels between instruments.
  const bySigma = ironCondor({ ...base, wingPoints: undefined, wingSigma: 1, S1: 5000 })
  near(bySigma.wingPoints, bySigma.move, 1e-9, 'one sigma of wing is one sigma of move')
  assert.throws(() => ironCondor({ ...base, wingPoints: undefined, S1: 5000 }), /wing width/)
})

// ──────────────────────────────────────────────── the decade

test('selling further out raises the win rate and every structure is measured on the same months', () => {
  const runs = [1, 1.5, 2].map((widthSigma) =>
    summarisePremium(simulatePremium(long, { hold: 21, widthSigma, structure: 'strangle' })))
  for (const r of runs) assert.ok(r.n > 120)
  assert.ok(runs[0].n === runs[1].n && runs[1].n === runs[2].n, 'same months, different strikes')
  assert.ok(runs[0].winRate.point < runs[1].winRate.point && runs[1].winRate.point < runs[2].winRate.point,
    `win rate should rise with distance: ${runs.map((r) => r.winRate.point).join(' ')}`)
  assert.ok(runs[2].winRate.point > 0.85, 'a two-sigma strangle wins almost every month')
})

test('the high win rate is bought with a tail, and the tail is the number that matters', () => {
  const r = summarisePremium(simulatePremium(long, { hold: 21, widthSigma: 2, structure: 'strangle' }))
  assert.ok(r.worst < 0)
  assert.ok(Math.abs(r.worst) > 8 * r.meanWin,
    `the worst month should dwarf an average win: worst ${r.worst}, mean win ${r.meanWin}`)
  // A wing only helps if it is close enough to bind. The worst month of the
  // decade breached the two-sigma strike by less than half a sigma, so a wing
  // a whole sigma out was paid for and never used.
  const wide = summarisePremium(simulatePremium(long, { hold: 21, widthSigma: 2, structure: 'condor', wingSigma: 1 }))
  const tight = summarisePremium(simulatePremium(long, { hold: 21, widthSigma: 2, structure: 'condor', wingSigma: 0.25 }))
  assert.equal(wide.n, r.n)
  assert.ok(Math.abs(wide.worst) >= Math.abs(r.worst) * 0.98,
    `a wing that never binds does not improve the worst month: ${wide.worst} against ${r.worst}`)
  assert.ok(Math.abs(tight.worst) < Math.abs(r.worst) * 0.7,
    `a wing close enough to bind does: ${tight.worst} against ${r.worst}`)
  assert.ok(tight.meanPremiumIn < r.meanPremiumIn, 'and it is paid for out of the credit')
  assert.ok(tight.meanPnl < r.meanPnl, 'which costs expectancy')
})

test('every trade is priced on the volatility quoted at its entry and nothing later', () => {
  const trades = simulatePremium(long, { hold: 21, widthSigma: 1, structure: 'strangle' })
  for (const t of trades.slice(0, 40)) {
    assert.equal(t.sigma, t.entryVix / 100, 'the entry volatility is the VIX close of the entry session')
    assert.ok(t.entryDate < t.exitDate)
    assert.ok(t.premiumIn > 0)
  }
})

test('a defined-risk trade knows its worst case before it is put on, and the decade never beat it', () => {
  const trades = simulatePremium(long, { hold: 21, widthSigma: 2, structure: 'condor', wingSigma: 0.25 })
  for (const x of trades) {
    assert.ok(Number.isFinite(x.maxLoss) && x.maxLoss > 0, 'the worst case is a number, stated at entry')
    assert.ok(x.pnl >= -x.maxLoss - 1e-9, `${x.entryDate} lost ${-x.pnl} against a stated cap of ${x.maxLoss}`)
  }
})

test('the answer depends on which day of the month the grid starts, so every start is run', () => {
  const worsts = []
  const means = []
  for (let start = 0; start < 21; start++) {
    const s = summarisePremium(simulatePremium(long, { hold: 21, widthSigma: 2, structure: 'strangle', start }))
    assert.ok(s.n > 120)
    worsts.push(s.worst)
    means.push(s.meanPnl)
  }
  const worstOfWorst = Math.min(...worsts)
  const bestOfWorst = Math.max(...worsts)
  assert.ok(worstOfWorst < bestOfWorst * 1.8,
    `the worst month varies a lot with the phase of the grid: ${worstOfWorst} to ${bestOfWorst}`)
  assert.ok(Math.min(...means) < Math.max(...means) * 0.9,
    'and so does the mean, which is why one grid is not a result')
})

test('the volatility that places the strikes and the one that prices them can differ, because VIX is not the at-the-money quote', () => {
  const base = { S0: 5000, S1: 5000, sigma: 0.16, days: 30, widthSigma: 1 }
  const asIs = shortStrangle(base)
  const cheaper = shortStrangle({ ...base, pricingScale: 0.95 })
  assert.equal(cheaper.callStrike, asIs.callStrike, 'the strikes are where the chart drew them')
  assert.equal(cheaper.putStrike, asIs.putStrike)
  assert.ok(cheaper.premiumIn < asIs.premiumIn, 'but the seller is paid less for them')
  assert.equal(shortStrangle({ ...base, pricingScale: 1 }).premiumIn, asIs.premiumIn)

  // This is a different question from moving the strikes in, which ivScale does.
  const narrower = shortStrangle({ ...base, sigma: 0.16 * 0.95 })
  assert.ok(narrower.callStrike < asIs.callStrike, 'ivScale moves the strikes, pricingScale does not')
})

test('over the decade a five per cent cheaper at-the-money quote takes a large bite out of the edge', () => {
  const full = summarisePremium(simulatePremium(long, { hold: 21, widthSigma: 1, structure: 'strangle', costPerLeg: 0.05 }))
  const real = summarisePremium(simulatePremium(long, { hold: 21, widthSigma: 1, structure: 'strangle', costPerLeg: 0.05, pricingScale: 0.95 }))
  assert.equal(full.n, real.n)
  assert.ok(real.meanPnl < full.meanPnl, 'less premium for the same risk is less profit')
  // The settlement is untouched, because the strikes did not move. The worst
  // month still gets slightly worse, because a smaller credit offsets less of it.
  const fullTrades = simulatePremium(long, { hold: 21, widthSigma: 1, structure: 'strangle', costPerLeg: 0.05 })
  const realTrades = simulatePremium(long, { hold: 21, widthSigma: 1, structure: 'strangle', costPerLeg: 0.05, pricingScale: 0.95 })
  for (let i = 0; i < fullTrades.length; i++) {
    assert.equal(realTrades[i].settlement, fullTrades[i].settlement, 'the risk is identical')
  }
  assert.ok(real.worst < full.worst, 'so the worst month is a little worse, not the same')
  assert.ok(real.meanPnl > 0.7 * full.meanPnl,
    `a five per cent haircut should cost something but not the edge: ${full.meanPnl} → ${real.meanPnl}`)
})
