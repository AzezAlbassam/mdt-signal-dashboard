import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  dailyBandSeries, weeklyBandSeries, scoreSetups, calibrateSeries,
  optionLegPnl, simulateSetup, summariseTrades,
  skewedBandSeries, scaledSeries, blendedBandSeries, regimeCalibration,
} from '../lib/study.js'
import { bsPrice } from '../lib/bs.js'
import { weekExpiry, nextTradingDay } from '../lib/calendar.js'

const long = JSON.parse(readFileSync(new URL('./fixtures/market-long.json', import.meta.url))).sessions
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

// ── weekly bands and the setup scorer

test('weekly bands hang on the last session of the prior week and run to its expiry', () => {
  const w = weeklyBandSeries(long, { k: 0.92 })
  assert.ok(w.length > 500 && w.length < 560, `${w.length} complete weeks in a decade`)
  for (const b of w.slice(0, 40)) {
    assert.equal(b.expiry, weekExpiry(b.anchorDate))
    assert.ok(b.week.length >= 3 && b.week.length <= 5, `${b.anchorDate} has ${b.week.length} sessions`)
    assert.ok(b.week[0].date > b.anchorDate)
    assert.equal(b.week[b.week.length - 1].date, b.expiry, 'only complete weeks')
  }
})

test('the setup scorer reports every setup with its sample size over the decade', () => {
  const s = scoreSetups(long, { k: 0.92 })
  for (const key of ['fadeLower', 'fadeUpper', 'nextAfterLowerTag', 'nextAfterUpperTag', 'breakToWeekly', 'baseNextUp', 'baseNextDown']) {
    const r = s[key]
    assert.ok(r && Number.isInteger(r.n) && Number.isInteger(r.k), key)
    assert.ok(r.low <= r.point && r.point <= r.high, `${key} interval`)
  }
  // The tag counts must equal what the band series says was reached.
  const series = dailyBandSeries(long, { k: 0.92 })
  const lowerTags = series.filter((b) => b.session.low <= b.lower).length
  const upperTags = series.filter((b) => b.session.high >= b.upper).length
  assert.equal(s.fadeLower.n, lowerTags)
  assert.equal(s.fadeUpper.n, upperTags)
  assert.equal(s.nextAfterLowerTag.n, lowerTags - (series[series.length - 1].session.low <= series[series.length - 1].lower ? 1 : 0),
    'a tag on the last session has no next session to score')
  assert.ok(s.fadeLower.n > 300, 'hundreds of tags in a decade')
  assert.ok(s.baseNextUp.n === long.length - 1)
})

test('the break-to-weekly scorer never credits the break session itself', () => {
  const s = scoreSetups(long, { k: 0.92 })
  assert.ok(s.breakToWeekly.n > 100)
  assert.ok(s.breakToWeekly.detail.every((d) => d.reached === false || d.laterSessions > 0),
    'a run can only be credited on a later session')
})

// ── option legs, model-priced

test('an option leg loses exactly its theta on a flat path', () => {
  const leg = optionLegPnl({
    S0: 500, S1: 500, K: 500, type: 'C', daysToExpiryAtEntry: 5, daysHeld: 1,
    sigmaEntry: 0.15, sigmaExit: 0.15, r: 0, slippage: 0,
  })
  near(leg.premiumIn, bsPrice({ S: 500, K: 500, T: 5 / 365, sigma: 0.15, r: 0, type: 'C' }), 1e-12, 'entry')
  near(leg.premiumOut, bsPrice({ S: 500, K: 500, T: 4 / 365, sigma: 0.15, r: 0, type: 'C' }), 1e-12, 'exit')
  assert.ok(leg.pnl < 0, 'theta only')
  near(leg.pnlPct, leg.pnl / leg.premiumIn, 1e-12, 'pct of premium')
})

test('a leg held to expiry is worth its intrinsic value', () => {
  const leg = optionLegPnl({ S0: 500, S1: 506, K: 500, type: 'C', daysToExpiryAtEntry: 1, daysHeld: 1, sigmaEntry: 0.15, sigmaExit: 0.15 })
  assert.equal(leg.premiumOut, 6)
  const put = optionLegPnl({ S0: 500, S1: 506, K: 500, type: 'P', daysToExpiryAtEntry: 1, daysHeld: 1, sigmaEntry: 0.15, sigmaExit: 0.15 })
  assert.equal(put.premiumOut, 0)
  assert.equal(put.pnlPct, -1, 'a full loss is minus one hundred per cent')
})

test('slippage is charged on both sides and only reduces the result', () => {
  const clean = optionLegPnl({ S0: 500, S1: 503, K: 500, type: 'C', daysToExpiryAtEntry: 2, daysHeld: 1, sigmaEntry: 0.15, sigmaExit: 0.15, slippage: 0 })
  const paid = optionLegPnl({ S0: 500, S1: 503, K: 500, type: 'C', daysToExpiryAtEntry: 2, daysHeld: 1, sigmaEntry: 0.15, sigmaExit: 0.15, slippage: 0.02 })
  assert.ok(paid.pnl < clean.pnl)
  near(clean.pnl - paid.pnl, 0.02 * (clean.premiumIn + clean.premiumOut), 1e-12, 'a share of each premium')
})

test('a simulated setup produces one trade per event, with the expiry it says', () => {
  const trades = simulateSetup(long, { setup: 'lowerTagLong', dte: 1, k: 0.92, ivScale: 0.92 })
  const s = scoreSetups(long, { k: 0.92 })
  assert.equal(trades.length, s.nextAfterLowerTag.n)
  for (const t of trades.slice(0, 50)) {
    assert.equal(t.exitDate, nextTradingDay(t.entryDate), 'held one session')
    assert.equal(t.expiryDate, nextTradingDay(t.entryDate), 'one session to expiry')
    assert.ok(t.daysToExpiryAtEntry >= 1 && t.daysToExpiryAtEntry <= 4, 'calendar days, weekends included')
    assert.equal(t.daysHeld, t.daysToExpiryAtEntry, 'a 1DTE is held to expiry')
    assert.ok(t.premiumIn > 0 && Number.isFinite(t.pnlPct))
    assert.equal(t.type, 'C')
    assert.equal(t.strike, Math.round(t.entryS), 'at the money, whole-dollar strike')
  }
  const five = simulateSetup(long, { setup: 'lowerTagLong', dte: 5, k: 0.92, ivScale: 0.92 })
  assert.equal(five.length, trades.length, 'same events, different contract')
  assert.ok(five[0].premiumIn > trades[0].premiumIn, 'more time costs more')
  assert.ok(five[0].daysToExpiryAtEntry > five[0].daysHeld, 'a 5DTE is sold with time left')
})

test('the trade summary is honest about what it aggregates', () => {
  const trades = simulateSetup(long, { setup: 'lowerTagLong', dte: 2, k: 0.92, ivScale: 0.92 })
  const s = summariseTrades(trades)
  assert.equal(s.n, trades.length)
  assert.ok(s.winRate.n === s.n && s.winRate.point >= 0 && s.winRate.point <= 1)
  for (const f of ['meanPnlPct', 'medianPnlPct', 'profitFactor', 'worstPct', 'bestPct', 'meanPremiumIn']) {
    assert.ok(Number.isFinite(s[f]) || s[f] === Infinity, f)
  }
  assert.ok(s.worstPct >= -1 - 1e-9, 'a long option cannot lose more than the premium plus slippage')
  assert.equal(summariseTrades([]).n, 0)
  assert.equal(summariseTrades([]).meanPnlPct, null)
})

test('every supported setup and DTE runs without look-ahead', () => {
  for (const setup of ['lowerTagLong', 'upperTagShort']) {
    for (const dte of [0, 1, 2, 5]) {
      const trades = simulateSetup(long, { setup, dte, k: 0.92, ivScale: 0.92 })
      assert.ok(trades.length > 100, `${setup} ${dte}DTE has trades`)
      for (const t of trades.slice(0, 30)) {
        assert.ok(t.exitDate >= t.entryDate)
        assert.ok(t.expiryDate >= t.exitDate, 'never sold after expiry')
        if (dte === 0) {
          assert.equal(t.exitDate, t.entryDate, 'a 0DTE is a same-session trade')
          assert.equal(t.entryS, t.entryLevel, 'entered at the band, not at the close')
        }
      }
    }
  }
})

// ── enhancement candidates

test('a skewed band widens one side and narrows the other by the same fraction', () => {
  const sym = dailyBandSeries(long, { k: 0.92 })
  const sk = skewedBandSeries(long, { k: 0.92, skew: 0.1 })
  for (let i = 0; i < 10; i++) {
    near(sk[i].center - sk[i].lower, (sym[i].center - sym[i].lower) * 1.1, 1e-9, 'lower wider')
    near(sk[i].upper - sk[i].center, (sym[i].upper - sym[i].center) * 0.9, 1e-9, 'upper narrower')
  }
  const cs = calibrateSeries(sym)
  const ck = calibrateSeries(sk)
  assert.ok(ck.lowerReached < cs.lowerReached && ck.upperReached > cs.upperReached)
})

test('a scaled band contains more and is reached less', () => {
  const one = dailyBandSeries(long, { k: 0.92 })
  const two = scaledSeries(one, 2)
  for (let i = 0; i < 5; i++) near(two[i].halfWidth, one[i].halfWidth * 2, 1e-12, 'doubled')
  const c1 = calibrateSeries(one)
  const c2 = calibrateSeries(two)
  assert.ok(c2.contained > c1.contained)
  assert.ok(c2.upperReached < c1.upperReached && c2.lowerReached < c1.lowerReached)
  assert.ok(c2.closeBreakUpper + c2.closeBreakLower < 0.1, 'a two-sigma band is rarely closed through')
})

test('a blended band mixes implied and realised vol and says which sessions it could', () => {
  const b = blendedBandSeries(long, { k: 0.92, window: 10, weight: 0.5 })
  assert.equal(b.length, long.length - 1)
  const pure = dailyBandSeries(long, { k: 0.92 })
  let differs = 0
  for (let i = 0; i < b.length; i++) {
    assert.ok(b[i].halfWidth > 0)
    if (i < 9) assert.equal(b[i].blended, false, 'no realised window yet')
    else assert.equal(b[i].blended, true)
    if (Math.abs(b[i].halfWidth - pure[i].halfWidth) > 1e-9) differs++
  }
  assert.ok(differs > b.length * 0.9)
})

test('regime calibration partitions the decade by VIX tercile with nothing lost', () => {
  const r = regimeCalibration(long, { k: 0.92 })
  assert.deepEqual(Object.keys(r).sort(), ['high', 'low', 'mid'])
  assert.equal(r.low.n + r.mid.n + r.high.n, long.length - 1)
  for (const g of Object.values(r)) assert.ok(Number.isFinite(g.meanAbsZ) && Number.isFinite(g.contained))
})
