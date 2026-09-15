import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DAY_BASIS, halfWidth, impliedVol, band, zone, zones, MODEL, horizonDays,
} from '../lib/implied-move.js'

const fx = JSON.parse(readFileSync(new URL('./fixtures/screenshots.json', import.meta.url)))
const market = JSON.parse(readFileSync(new URL('./fixtures/market.json', import.meta.url)))
const vixOn = Object.fromEntries(market.sessions.map((s) => [s.date, s.vix]))

const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

test('the day basis is 365 calendar days', () => {
  assert.equal(DAY_BASIS, 365)
  assert.equal(MODEL.dayBasis, 365)
})

test('half width is close times vol times root time', () => {
  // The iVol daily band on the 2026-09-11 close, at the volatility it implies.
  near(halfWidth({ close: 764.29, iv: 0.1425, days: 1 }), 5.70, 0.005, 'daily')
  // Four times the horizon doubles the width.
  const one = halfWidth({ close: 700, iv: 0.16, days: 1 })
  const four = halfWidth({ close: 700, iv: 0.16, days: 4 })
  near(four / one, 2, 1e-12, 'root-time scaling')
  // Zero volatility or zero time collapses the band.
  assert.equal(halfWidth({ close: 700, iv: 0, days: 5 }), 0)
  assert.equal(halfWidth({ close: 700, iv: 0.2, days: 0 }), 0)
})

test('half width rejects nonsense inputs instead of returning NaN', () => {
  assert.throws(() => halfWidth({ close: -1, iv: 0.2, days: 1 }), /close/)
  assert.throws(() => halfWidth({ close: 700, iv: -0.2, days: 1 }), /iv/)
  assert.throws(() => halfWidth({ close: 700, iv: 0.2, days: -1 }), /days/)
  assert.throws(() => halfWidth({ close: 700, iv: 0.2, days: 1, dayBasis: 0 }), /dayBasis/)
})

test('implied vol inverts half width exactly', () => {
  for (const days of [1, 4, 5, 21]) {
    for (const iv of [0.08, 0.1425, 0.22, 0.65]) {
      const h = halfWidth({ close: 764.29, iv, days })
      near(impliedVol({ close: 764.29, halfWidth: h, days }), iv, 1e-12, `d=${days} iv=${iv}`)
    }
  }
})

test('a band is symmetric about its centre to the cent', () => {
  for (const [c, h] of [[764.29, 5.70], [770.19, 11.44], [747.03, 27.01], [100, 0.005]]) {
    const b = band(c, h)
    near(b.upper - b.center, b.center - b.lower, 1e-9, `symmetry at ${c}`)
    assert.equal(Number(b.upper.toFixed(2)), b.upper, 'upper is a whole cent')
    assert.equal(Number(b.lower.toFixed(2)), b.lower, 'lower is a whole cent')
  }
})

test('half width rises with volatility and with time', () => {
  const base = { close: 760, iv: 0.15, days: 5 }
  assert.ok(halfWidth({ ...base, iv: 0.16 }) > halfWidth(base))
  assert.ok(halfWidth({ ...base, days: 6 }) > halfWidth(base))
  assert.ok(halfWidth({ ...base, close: 800 }) > halfWidth(base))
})

test('horizon day counts come from the calendar, not a constant', () => {
  assert.equal(horizonDays('daily', '2026-09-10'), 1)
  assert.equal(horizonDays('daily', '2026-09-11'), 1, 'Friday to Monday is still one session')
  assert.equal(horizonDays('weekly', '2026-09-11'), 5, 'a normal week')
  assert.equal(horizonDays('weekly', '2026-09-04'), 4, 'the Labor Day week is one short')
  assert.equal(horizonDays('weekly', '2026-06-12'), 4, 'the Juneteenth week is one short')
  assert.equal(horizonDays('monthly', '2026-07-31'), 21, 'August has 21 sessions')
  assert.equal(horizonDays('monthly', '2026-04-30'), 20, 'May has 20')
  assert.equal(horizonDays('monthly', '2026-05-29'), 21, 'June has 21')
})

test('a zone is the interval between the plain line and the iVol line', () => {
  // 2026-09-11 evening: the red box sits between 769.18 and 769.99, the green
  // box between 758.59 and 759.40. Both are read straight off the chart.
  const z = zone(769.18, 769.99)
  assert.deepEqual(z, { low: 769.18, high: 769.99, width: 0.81 })
  assert.deepEqual(zone(769.99, 769.18), { low: 769.18, high: 769.99, width: 0.81 },
    'argument order does not matter')
  const both = zones(
    { upper: 769.18, lower: 759.40 },
    { upper: 769.99, lower: 758.59 })
  assert.deepEqual(both.upper, { low: 769.18, high: 769.99, width: 0.81 })
  assert.deepEqual(both.lower, { low: 758.59, high: 759.40, width: 0.81 })
})

test('ACCEPTANCE: every fixture band is reproduced to the cent from its centre and width', () => {
  let checked = 0
  for (const ob of fx.observations) {
    for (const [name, v] of Object.entries(ob.bands)) {
      if (v.upper == null || v.lower == null) continue
      const h = (v.upper - v.lower) / 2
      const b = band(v.anchorClose, h)
      assert.equal(b.upper, v.upper, `${ob.id} ${name} upper`)
      assert.equal(b.lower, v.lower, `${ob.id} ${name} lower`)
      checked++
    }
  }
  assert.ok(checked >= 30, `expected at least 30 two-sided bands, checked ${checked}`)
})

test('ACCEPTANCE: the volatility each iVol band implies stays in its calibrated range', () => {
  // The iVol family tracks a smooth volatility series: every observation sits
  // close to the VIX close of the day the band was last refreshed. A change in
  // the day-count convention would push these out of range immediately.
  const seen = { ivolDaily: [], ivolWeekly: [], plainMonthly: [] }
  for (const ob of fx.observations) {
    for (const name of Object.keys(seen)) {
      const v = ob.bands[name]
      if (!v || v.upper == null || v.lower == null) continue
      const days = horizonDays(name.includes('Daily') ? 'daily'
        : name.includes('Weekly') ? 'weekly' : 'monthly', v.anchorDate)
      const iv = impliedVol({ close: v.anchorClose, halfWidth: (v.upper - v.lower) / 2, days })
      seen[name].push(iv / (vixOn[v.anchorDate] / 100))
    }
  }
  assert.ok(seen.ivolDaily.length >= 8, 'enough daily observations')
  for (const r of seen.ivolDaily) assert.ok(r > 0.85 && r < 1.00, `daily ratio ${r.toFixed(3)}`)
  for (const r of seen.ivolWeekly) assert.ok(r > 0.78 && r < 1.00, `weekly ratio ${r.toFixed(3)}`)
})

test('ACCEPTANCE: the monthly band matches the month it spans', () => {
  // 2026-07-31 close 747.03, upper 774.04, 21 sessions in August.
  const iv = impliedVol({ close: 747.03, halfWidth: 774.04 - 747.03, days: horizonDays('monthly', '2026-07-31') })
  near(iv, 0.1507, 0.0005, 'August implied vol')
  near(iv / 0.1599, 0.943, 0.002, 'as a share of the VIX close')
  const b = band(747.03, halfWidth({ close: 747.03, iv, days: 21 }))
  assert.equal(b.upper, 774.04)
})
