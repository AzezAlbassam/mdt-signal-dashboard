import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseChain } from '../lib/cboe-chain.js'
import { resolveAnchors, termStructure, sigmaAt, buildFamilies, FAMILIES } from '../lib/bands.js'

const market = JSON.parse(readFileSync(new URL('./fixtures/market.json', import.meta.url)))
const chain = parseChain(JSON.parse(readFileSync(new URL('./fixtures/chain-sample.json', import.meta.url))))
const closesUpTo = (last) => Object.fromEntries(
  market.sessions.filter((s) => s.date <= last).map((s) => [s.date, s.close]))
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

test('anchors come from the closes actually held, never from the clock', () => {
  assert.deepEqual(resolveAnchors(Object.keys(closesUpTo('2026-09-11'))),
    { daily: '2026-09-11', weekly: '2026-09-11', monthly: '2026-08-31' })
  assert.deepEqual(resolveAnchors(Object.keys(closesUpTo('2026-09-14'))),
    { daily: '2026-09-14', weekly: '2026-09-11', monthly: '2026-08-31' })
  assert.deepEqual(resolveAnchors(Object.keys(closesUpTo('2026-08-28'))),
    { daily: '2026-08-28', weekly: '2026-08-28', monthly: '2026-07-31' })
})

test('a month that ends on a Monday rolls the monthly without rolling the weekly', () => {
  // 2026-08-31 is a Monday and August's last session. The weekly anchor has to
  // stay on Friday the 28th while the monthly moves to the 31st.
  assert.deepEqual(resolveAnchors(Object.keys(closesUpTo('2026-08-31'))),
    { daily: '2026-08-31', weekly: '2026-08-28', monthly: '2026-08-31' })
})

test('anchors are missing rather than invented when the history is too short', () => {
  const a = resolveAnchors(['2026-09-08', '2026-09-09', '2026-09-10'])
  assert.equal(a.daily, '2026-09-10')
  assert.equal(a.weekly, null, 'no week has closed inside this window')
  assert.equal(a.monthly, null)
  assert.deepEqual(resolveAnchors([]), { daily: null, weekly: null, monthly: null })
})

test('the term structure is the at-the-money vol of every quotable expiry', () => {
  const ts = termStructure(chain, '2026-09-11')
  assert.deepEqual(ts.map((p) => p.expiry), ['2026-09-14', '2026-09-18', '2026-09-30', '2026-10-16'],
    'the expired 2026-09-11 series has no two-sided quote and drops out')
  assert.deepEqual(ts.map((p) => p.days), [3, 7, 19, 35], 'calendar days from the anchor')
  near(ts[0].iv, 0.1532, 1e-9, 'front vol')
  near(ts[3].iv, 0.15505, 1e-9, 'back vol')
})

test('vol at a tenor interpolates in total variance, not in vol', () => {
  // Between the 19-day point at 0.14965 and the 35-day point at 0.15505.
  near(sigmaAt(chain, '2026-09-11', 30), 0.153996, 1e-6, 'thirty days')
  // On a listed tenor it returns that tenor exactly.
  near(sigmaAt(chain, '2026-09-11', 7), 0.15145, 1e-9, 'exactly the weekly expiry')
  near(sigmaAt(chain, '2026-09-11', 3), 0.1532, 1e-9, 'exactly the front expiry')
  // Outside the listed range it clamps rather than extrapolating.
  near(sigmaAt(chain, '2026-09-11', 1), 0.1532, 1e-9, 'shorter than anything listed')
  near(sigmaAt(chain, '2026-09-11', 400), 0.15505, 1e-9, 'longer than anything listed')
})

test('the five families are built from one chain and one set of closes', () => {
  const f = buildFamilies({ closes: closesUpTo('2026-09-11'), chain, asOf: '2026-09-11' })
  assert.deepEqual(Object.keys(f).sort(), [...FAMILIES].sort())

  // Every family hangs on the right close and the right expiry.
  assert.equal(f.plainDaily.anchorDate, '2026-09-11')
  assert.equal(f.plainDaily.anchorClose, 764.29)
  assert.equal(f.plainDaily.expiry, '2026-09-14')
  assert.equal(f.plainWeekly.expiry, '2026-09-18')
  assert.equal(f.plainMonthly.expiry, '2026-09-30')
  assert.equal(f.ivolDaily.anchorDate, '2026-09-11')
  assert.equal(f.ivolWeekly.anchorDate, '2026-09-11')

  // The plain daily is the at-the-money straddle of the next session's expiry.
  near(f.plainDaily.halfWidth, 4.89, 1e-9, 'straddle')
  assert.equal(f.plainDaily.upper, 769.18)
  assert.equal(f.plainDaily.lower, 759.40)
  near(f.plainWeekly.halfWidth, 12.79, 1e-9, 'weekly straddle')

  // Both bands are symmetric about the same close to the cent.
  for (const k of FAMILIES) {
    near(f[k].upper - f[k].anchorClose, f[k].anchorClose - f[k].lower, 1e-9, `${k} symmetry`)
  }
})

test('every plain candidate is recorded on every run, not just the published one', () => {
  const f = buildFamilies({ closes: closesUpTo('2026-09-11'), chain, asOf: '2026-09-11' })
  const c = f.plainDaily.candidates
  near(c.straddleRaw, 4.89, 1e-9, 'the straddle mid actually quoted')
  // The modelled straddle and the one standard deviation move differ by exactly
  // the constant the two readings of the chart are separated by. A live chain
  // resolves which of them the chart plots, because they are 25 per cent apart.
  near(c.straddleModel / c.sigmaCalendar, 0.7978845608, 1e-9, 'the constant one live chain settles')
  assert.ok(c.sigmaFixed > 0 && Number.isFinite(c.sigmaFixed))
  // How many sessions of variance the quoted straddle actually carries. The
  // 2026-09-14 expiry spans three calendar days but only one session, and the
  // market prices it as one: a weekend carries almost no variance. This is why
  // the fixed variant counts sessions and not calendar days.
  near(c.effectiveDays, 1.0, 0.01, 'a weekend prices as one session, not three days')
})

test('the zone between the two families is carried on the result', () => {
  const f = buildFamilies({ closes: closesUpTo('2026-09-11'), chain, asOf: '2026-09-11' })
  assert.equal(f.plainDaily.zone.upper.low, f.plainDaily.upper)
  assert.ok(f.plainDaily.zone.upper.high >= f.plainDaily.upper)
  assert.ok(f.plainDaily.zone.lower.low <= f.plainDaily.lower)
})

test('a family whose anchor is unknown is reported absent rather than guessed', () => {
  const f = buildFamilies({ closes: closesUpTo('2026-09-11'), chain, asOf: '2026-09-11', skipMonthly: true })
  assert.equal(f.plainMonthly, null)
})
