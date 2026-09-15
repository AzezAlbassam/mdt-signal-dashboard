import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { scoreBand, scoreZone, zScore, wilson, summarise } from '../lib/score.js'

const market = JSON.parse(readFileSync(new URL('./fixtures/market.json', import.meta.url)))
const bar = Object.fromEntries(market.sessions.map((s) => [s.date, s]))
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

// The two bands published on the evening of 2026-09-11, scored against the
// session that followed. Both are read straight off the chart.
const IVOL_0911 = { anchorDate: '2026-09-11', center: 764.29, halfWidth: 5.70, upper: 769.99, lower: 758.59 }
const PLAIN_0911 = { anchorDate: '2026-09-11', center: 764.29, halfWidth: 4.89, upper: 769.18, lower: 759.40 }
// And the pair published on 2026-08-14, scored against 2026-08-17.
const IVOL_0814 = { anchorDate: '2026-08-14', center: 776.34, halfWidth: 5.32, upper: 781.66, lower: 771.02 }
const PLAIN_0814 = { anchorDate: '2026-08-14', center: 776.34, halfWidth: 3.61, upper: 779.95, lower: 772.73 }

test('a band cannot be scored against its own anchor session or anything earlier', () => {
  assert.throws(() => scoreBand(IVOL_0911, bar['2026-09-11']), /look-?ahead|after/i)
  assert.throws(() => scoreBand(IVOL_0911, bar['2026-09-10']), /look-?ahead|after/i)
  assert.doesNotThrow(() => scoreBand(IVOL_0911, bar['2026-09-14']))
})

test('a session that tags a level and recovers is tagged, not broken', () => {
  // 2026-09-14 traded down to 757.93, through 758.59, and closed at 760.88.
  const r = scoreBand(IVOL_0911, bar['2026-09-14'])
  assert.equal(r.session, '2026-09-14')
  assert.equal(r.upper, 'untouched', 'the high of 763.52 never reached 769.99')
  assert.equal(r.lower, 'tagged')
  assert.equal(r.contained, false)
  near(r.z, -0.5982, 0.0001, 'the close in half widths')
  near(r.excursionLow, (757.93 - 764.29) / 5.70, 1e-9, 'the low in half widths')
  near(r.excursionHigh, (763.52 - 764.29) / 5.70, 1e-9, 'the high in half widths')
})

test('a session that closes beyond a level is broken', () => {
  // 2026-08-17 closed at 772.67, six cents below the 772.73 line.
  const r = scoreBand(PLAIN_0814, bar['2026-08-17'])
  assert.equal(r.lower, 'broken')
  assert.equal(r.upper, 'untouched')
  assert.equal(r.contained, false)
  near(r.z, -1.0166, 0.0001, 'just past one half width')
})

test('a session entirely inside its band is contained', () => {
  // The same session against the wider iVol band, which it never reached.
  const r = scoreBand(IVOL_0814, bar['2026-08-17'])
  assert.equal(r.upper, 'untouched')
  assert.equal(r.lower, 'untouched')
  assert.equal(r.contained, true)
  near(r.z, -0.6898, 0.0001, 'the close in half widths')
})

test('touching a level to the cent counts as reaching it', () => {
  const band = { anchorDate: '2026-09-11', center: 764.29, halfWidth: 6.36, upper: 770.65, lower: 757.93 }
  const r = scoreBand(band, bar['2026-09-14'])
  assert.equal(r.lower, 'tagged', 'the low of 757.93 is exactly the level')
  assert.equal(r.contained, true, 'touching the edge is still inside')
})

test('the zone between the two lines is scored as an interval, not a level', () => {
  // On 2026-09-14 the lower zone ran from 758.59 to 759.40 and price went
  // through the far side of it before closing back above.
  const z = scoreZone({ anchorDate: '2026-09-11', low: 758.59, high: 759.40, side: 'lower' }, bar['2026-09-14'])
  assert.equal(z.outcome, 'crossed')
  assert.equal(z.closedBeyond, false, 'the close of 760.88 is back above the zone')
  // The upper zone that day was never reached.
  const u = scoreZone({ anchorDate: '2026-09-11', low: 769.18, high: 769.99, side: 'upper' }, bar['2026-09-14'])
  assert.equal(u.outcome, 'untouched')
  assert.equal(u.closedBeyond, false)
})

test('a session that stops inside a zone is entered, not crossed', () => {
  const z = scoreZone({ anchorDate: '2026-09-11', low: 757.90, high: 759.40, side: 'lower' }, bar['2026-09-14'])
  assert.equal(z.outcome, 'entered', 'the low of 757.93 stops inside 757.90 to 759.40 by three cents')
  const deeper = scoreZone({ anchorDate: '2026-09-11', low: 757.00, high: 759.40, side: 'lower' }, bar['2026-09-14'])
  assert.equal(deeper.outcome, 'entered')
})

test('a zone cannot be scored against its own anchor session either', () => {
  assert.throws(
    () => scoreZone({ anchorDate: '2026-09-11', low: 758.59, high: 759.40, side: 'lower' }, bar['2026-09-11']),
    /look-?ahead|after/i)
})

test('z scores are signed and measured in half widths', () => {
  near(zScore({ close: 760.88, center: 764.29, halfWidth: 5.70 }), -0.5982, 0.0001)
  near(zScore({ close: 770.00, center: 764.29, halfWidth: 5.70 }), 1.0018, 0.0001)
  assert.equal(zScore({ close: 764.29, center: 764.29, halfWidth: 5.70 }), 0)
  assert.equal(zScore({ close: 770, center: 764.29, halfWidth: 0 }), null, 'a zero width has no z')
})

test('the Wilson interval is the one reported, never the naive one', () => {
  const w = wilson(7, 10)
  near(w.low, 0.39677, 0.0001, 'lower bound')
  near(w.high, 0.89221, 0.0001, 'upper bound')
  near(w.point, 0.7, 1e-12, 'point estimate')
  const none = wilson(0, 0)
  assert.equal(none.point, null)
  assert.equal(none.low, 0)
  assert.equal(none.high, 1)
  // An interval on a small sample must be visibly wide, not quietly narrow.
  assert.ok(wilson(68, 100).high - wilson(68, 100).low < w.high - w.low)
})

test('a summary suppresses the point estimate until the sample can carry it', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ contained: i < 9 }))
  const s = summarise(rows, (r) => r.contained)
  assert.equal(s.n, 12)
  assert.equal(s.k, 9)
  assert.equal(s.reportable, false, 'twelve is not enough to quote a rate')
  assert.equal(s.point, null, 'the point estimate is withheld below the threshold')
  assert.ok(s.interval.high - s.interval.low > 0.3, 'but the interval is always shown')

  const many = Array.from({ length: 40 }, (_, i) => ({ contained: i < 27 }))
  const big = summarise(many, (r) => r.contained)
  assert.equal(big.reportable, true)
  near(big.point, 0.675, 1e-12)
  assert.equal(big.n, 40)
})

test('an empty history summarises to nothing rather than to zero', () => {
  const s = summarise([], (r) => r.contained)
  assert.equal(s.n, 0)
  assert.equal(s.k, 0)
  assert.equal(s.point, null)
  assert.equal(s.reportable, false)
})
