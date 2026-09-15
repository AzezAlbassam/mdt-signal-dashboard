import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { impliedVol, horizonDays, band } from '../lib/implied-move.js'

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)))
const spx = load('spx-market.json')
const spy = load('market.json')
const spxObs = load('spx-observations.json').observations[0]
const spyFx = load('screenshots.json')

const spxBar = Object.fromEntries(spx.sessions.map((s) => [s.date, s]))
const spyBar = Object.fromEntries(spy.sessions.map((s) => [s.date, s]))
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

test('the SPX fixture is real index data lining up with the SPY sessions', () => {
  assert.equal(spx.sessions.length, 35)
  assert.equal(spxBar['2026-08-28'].close, 7711.76)
  assert.equal(spxBar['2026-09-11'].close, 7656.98)
  for (const s of spx.sessions) {
    assert.equal(s.vix, spyBar[s.date].vix, `${s.date} shares one VIX close`)
    const ratio = s.close / spyBar[s.date].close
    assert.ok(ratio > 9.9 && ratio < 10.1, `${s.date} index to fund ratio ${ratio.toFixed(4)}`)
  }
})

test('the SPX bands are symmetric about one shared centre', () => {
  const d = spxObs.bands.dailyExpectedMove
  const w = spxObs.bands.weeklyExpectedMove
  near((d.upper + d.lower) / 2, spxObs.observedCenter, 0.005, 'daily centre')
  near((w.upper + w.lower) / 2, spxObs.observedCenter, 0.005, 'weekly centre')
  // The sixteen-cent gap to the real close is recorded, not reproduced.
  near(spxObs.observedCenter, spxObs.anchorClose, 0.2, 'centre against the real close')
})

test('the SPX daily band implies the same volatility as the SPY band that day', () => {
  // Both are one session ahead from the 2026-08-28 close, which was a Friday, so
  // both are pricing the same weekend-spanning move on the same underlying index.
  const d = spxObs.bands.dailyExpectedMove
  const ivSpx = impliedVol({
    close: spxObs.observedCenter,
    halfWidth: (d.upper - d.lower) / 2,
    days: horizonDays('daily', '2026-08-28'),
  })
  const spyBand = spyFx.observations.find((o) => o.id === '2026-08-31T17:39').bands.plainDaily
  const ivSpy = impliedVol({
    close: spyBand.anchorClose,
    halfWidth: (spyBand.upper - spyBand.lower) / 2,
    days: horizonDays('daily', spyBand.anchorDate),
  })
  near(ivSpx, 0.09444, 0.0002, 'SPX implied volatility')
  near(ivSpy, 0.09563, 0.0002, 'SPY implied volatility')
  near(ivSpx / ivSpy, 1, 0.02, 'two tools, two instruments, the same front expiry')
  // Both sit far below VIX, which is the signature of a front expiry over a
  // weekend and is why this family cannot come from a volatility index.
  const vix = spxBar['2026-08-28'].vix / 100
  assert.ok(ivSpx / vix < 0.7, `SPX at ${(ivSpx / vix).toFixed(3)} of VIX`)
  assert.ok(ivSpy / vix < 0.7, `SPY at ${(ivSpy / vix).toFixed(3)} of VIX`)
})

test('the SPX monthly band implies the same volatility as the SPY monthly that month', () => {
  // Both span August 2026 from the 31 July close.
  const m = spxObs.bands.monthlyExpectedMove
  const days = horizonDays('monthly', '2026-07-31')
  assert.equal(days, 21)
  const ivSpx = impliedVol({ close: m.anchorClose, halfWidth: m.upper - m.anchorClose, days })
  const spyMtd = spyFx.observations.find((o) => o.id === '2026-08-14T19:23').bands.plainMonthly
  const ivSpy = impliedVol({ close: spyMtd.anchorClose, halfWidth: spyMtd.upper - spyMtd.anchorClose, days })
  near(ivSpx, 0.1513, 0.0005, 'SPX August volatility')
  near(ivSpy, 0.1507, 0.0005, 'SPY August volatility')
  near(ivSpx / ivSpy, 1, 0.01, 'the two monthly bands agree to one per cent')
  const vix = spxBar['2026-07-31'].vix / 100
  near(ivSpx / vix, 0.946, 0.003, 'SPX as a share of VIX')
  near(ivSpy / vix, 0.943, 0.003, 'SPY as a share of VIX')
})

test('the same maths produces the SPX band from a volatility', () => {
  // Nothing about the engine is fund-specific: feed it the index close and the
  // volatility its own band implies, and the levels come back.
  const d = spxObs.bands.dailyExpectedMove
  const h = (d.upper - d.lower) / 2
  const iv = impliedVol({ close: spxObs.observedCenter, halfWidth: h, days: 1 })
  const rebuilt = band(spxObs.observedCenter, spxObs.observedCenter * iv * Math.sqrt(1 / 365))
  assert.equal(rebuilt.upper, d.upper)
  assert.equal(rebuilt.lower, d.lower)
})
