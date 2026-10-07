import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseOccSymbol,
  daysToExpiry,
  isMonthly,
  grade,
  contractMetrics,
  mergeSession,
  averageVolume,
  selectExpirations,
  allocate,
  expirySummary,
  chainRows,
  limitGuide,
  tickerSummary,
  bucketCapacities,
} from './engine.js'

describe('parseOccSymbol', () => {
  test('standard root', () => {
    assert.deepEqual(parseOccSymbol('MSTR270115C00400000'), {
      root: 'MSTR', expiry: '2027-01-15', type: 'C', strike: 400,
    })
  })
  test('fractional strike and put', () => {
    assert.deepEqual(parseOccSymbol('F261218P00012500'), {
      root: 'F', expiry: '2026-12-18', type: 'P', strike: 12.5,
    })
  })
  test('adjusted root keeps its digit', () => {
    assert.equal(parseOccSymbol('MSTR1261218C00400000').root, 'MSTR1')
  })
  test('rejects junk', () => {
    assert.equal(parseOccSymbol('MSTR'), null)
  })
})

test('daysToExpiry counts calendar days', () => {
  assert.equal(daysToExpiry('2027-01-15', '2026-10-05'), 102)
})

test('isMonthly: third Friday, and Thursday before a Good Friday', () => {
  assert.equal(isMonthly('2026-12-18'), true)
  assert.equal(isMonthly('2026-12-11'), false)
  assert.equal(isMonthly('2027-01-15'), true)
  assert.equal(isMonthly('2025-04-17'), true) // Good Friday 2025-04-18
})

describe('grade: the weakest constraint decides', () => {
  test('spread and open interest both have to clear the bar', () => {
    assert.equal(grade({ spreadPct: 0.02, oi: 5000 }), 'A')
    assert.equal(grade({ spreadPct: 0.02, oi: 1000 }), 'B')
    assert.equal(grade({ spreadPct: 0.09, oi: 5000 }), 'C')
    assert.equal(grade({ spreadPct: 0.12, oi: 5000 }), 'D')
  })
  test('no quote is D', () => {
    assert.equal(grade({ spreadPct: null, oi: 5000 }), 'D')
  })
})

describe('contractMetrics', () => {
  const base = { bid: 9.8, ask: 10.2, bidSize: 40, oi: 4000, volume: 300, adv: 600, sessions: 10 }

  test('cap is the larger way out (10% ADV or the bid), held under 5% OI', () => {
    const m = contractMetrics(base)
    assert.equal(m.capByAdv, 60)
    assert.equal(m.capByOi, 200)
    assert.equal(m.capContracts, 60)
    assert.equal(m.binding, 'volume')
    assert.equal(m.capDollars, 60 * 10.2 * 100)
    assert.ok(Math.abs(m.spreadPct - 0.04) < 1e-12)
    assert.equal(m.grade, 'B')
  })

  test('open interest caps even a deep bid', () => {
    // way out: max(60, 40) = 60; held under 5% of 300 = 15
    const m = contractMetrics({ ...base, oi: 300 })
    assert.equal(m.capContracts, 15)
    assert.equal(m.binding, 'oi')
  })

  test('a deep bid counts, but only up to one normal day of volume', () => {
    // 1981 on the bid, 200 trade a day: the bid path is worth 200, not 1981; 5% of OI = 450
    const m = contractMetrics({ bid: 2.15, ask: 2.35, bidSize: 1981, oi: 9019, adv: 200, sessions: 10 })
    assert.equal(m.capByAdv, 20)
    assert.equal(m.capContracts, 200)
    assert.equal(m.binding, 'bid')
  })

  test('a deep bid on a contract that barely trades is worth almost nothing', () => {
    const m = contractMetrics({ bid: 2.15, ask: 2.35, bidSize: 1981, oi: 9019, adv: 4, sessions: 10 })
    assert.equal(m.capContracts, 4)
  })

  test('the bid binds when it is the only way out', () => {
    const m = contractMetrics({ ...base, adv: 50, bidSize: 30 })
    assert.equal(m.capContracts, 30)
    assert.equal(m.binding, 'bid')
  })

  test('no bid means nothing is exitable', () => {
    const m = contractMetrics({ ...base, bid: 0 })
    assert.equal(m.capContracts, 0)
    assert.equal(m.instantContracts, 0)
    assert.equal(m.grade, 'D')
  })

  test('spread wider than the limit zeroes the cap', () => {
    const m = contractMetrics({ ...base, bid: 8, ask: 10 })
    assert.equal(m.capContracts, 0)
    assert.equal(m.binding, 'spread')
  })

  test('without history, ADV is the 2%-of-OI prior, flagged', () => {
    const m = contractMetrics({ ...base, adv: undefined, sessions: 0 })
    assert.equal(m.adv, 80)
    assert.equal(m.advEstimated, true)
  })

  test('the prior fades as sessions arrive', () => {
    // 2 real sessions at 600, 3 prior sessions at 80 → (1200 + 240) / 5
    const m = contractMetrics({ ...base, sessions: 2 })
    assert.equal(m.adv, 288)
    assert.equal(m.advEstimated, true)
    assert.equal(contractMetrics({ ...base, sessions: 5 }).adv, 600)
  })

  test('limits are adjustable', () => {
    const m = contractMetrics(base, { pctOfAdv: 0.2 })
    assert.equal(m.capContracts, 120)
  })
})

describe('mergeSession', () => {
  test('appends a session and aligns new and missing contracts', () => {
    let h = mergeSession(null, '2026-10-01', { A: 10, B: 5 })
    h = mergeSession(h, '2026-10-02', { A: 20, C: 7 })
    assert.deepEqual(h.dates, ['2026-10-01', '2026-10-02'])
    assert.deepEqual(h.vol.A, [10, 20])
    assert.deepEqual(h.vol.B, [5, 0])
    assert.deepEqual(h.vol.C, [null, 7])
  })

  test('same session keeps the larger, later figure', () => {
    let h = mergeSession(null, '2026-10-01', { A: 10 })
    h = mergeSession(h, '2026-10-01', { A: 25 })
    h = mergeSession(h, '2026-10-01', { A: 3 })
    assert.deepEqual(h.dates, ['2026-10-01'])
    assert.deepEqual(h.vol.A, [25])
  })

  test('an older session is ignored', () => {
    const h = mergeSession(mergeSession(null, '2026-10-02', { A: 1 }), '2026-10-01', { A: 99 })
    assert.deepEqual(h.vol.A, [1])
  })

  test('rolls the window and prunes dead contracts', () => {
    let h = null
    for (let d = 1; d <= 5; d += 1) h = mergeSession(h, `2026-10-0${d}`, d === 1 ? { A: 1, X: 0 } : { A: d }, 3)
    assert.deepEqual(h.dates, ['2026-10-03', '2026-10-04', '2026-10-05'])
    assert.deepEqual(h.vol.A, [3, 4, 5])
    assert.equal('X' in h.vol, false)
  })
})

test('averageVolume skips sessions before listing', () => {
  assert.deepEqual(averageVolume([null, null, 10, 20]), { adv: 15, sessions: 2 })
  assert.deepEqual(averageVolume([]), { adv: 0, sessions: 0 })
})

describe('selectExpirations', () => {
  const exps = ['2026-11-20', '2027-01-15', '2027-03-19', '2027-04-16', '2027-06-17', '2028-01-21']
  test('takes expirations inside the window', () => {
    // 200 days from 2026-10-05 → window 150..250 days: 2027-03-19 (165), 2027-04-16 (193), 2027-06-17 (255 is out)
    assert.deepEqual(selectExpirations(exps, '2026-10-05', 200), ['2027-03-19', '2027-04-16'])
  })
  test('falls back to the two nearest', () => {
    assert.deepEqual(selectExpirations(exps, '2026-10-05', 400, 0.05), ['2027-06-17', '2028-01-21'])
  })
})

describe('allocate', () => {
  const mk = (strike, over) => ({
    sym: `T${strike}`, strike, bid: 9.9, ask: 10, bidSize: 20, oi: 10000, volume: 500, adv: 1000, sessions: 10, ...over,
  })

  test('spreads a large amount: no contract takes more than half while others have room', () => {
    const contracts = [
      mk(100, { adv: 300 }), // cap 30 → $30,000, grade A
      mk(110, { adv: 250 }), // cap 25 → $25,000, grade A
      mk(120, { bid: 9, ask: 10 }), // spread ~10.5% → D, ranked last
    ]
    const r = allocate(contracts, { amount: 50000 })
    assert.deepEqual(r.legs.map((l) => [l.strike, l.contracts]), [[100, 25], [110, 25]])
    assert.equal(r.placed, 50000)
    assert.equal(r.unplaced, 0)
  })

  test('tops up past half when the others are full', () => {
    const r = allocate([mk(100, { adv: 600 }), mk(110, { adv: 100 })], { amount: 60000 })
    // caps: 60 contracts and max(10% of 100, min(20 on the bid, 100)) = 20.
    // Half-limit pass gives 30 + 20; the top-up gives the first 10 more.
    assert.deepEqual(r.legs.map((l) => [l.strike, l.contracts]), [[100, 40], [110, 20]])
  })

  test('reports what does not fit', () => {
    const r = allocate([mk(100, { adv: 100, oi: 1000, bidSize: 5 })], { amount: 100000 })
    // cap = min(max(10, 5), 50) = 10 contracts × $1000
    assert.equal(r.placed, 10000)
    assert.equal(r.unplaced, 90000)
    assert.equal(r.comfortable, 10000)
  })

  test('a leg too small to be worth its own order is not split off', () => {
    // second contract can only take one contract ($1,000) — under 5% of $50,000
    const r = allocate([mk(100, { adv: 1000 }), mk(110, { adv: 10, bidSize: 0 })], { amount: 50000 })
    assert.deepEqual(r.legs.map((l) => [l.strike, l.contracts]), [[100, 50]])
  })

  test('never places more than the comfortable figure', () => {
    const cs = [mk(100, { adv: 300 }), mk(110, { adv: 250 }), mk(120, { adv: 200 })]
    const r = allocate(cs, { amount: 1e7, maxLegs: 2 })
    assert.equal(r.placed, r.comfortable)
  })

  test('too wide a spread is never used', () => {
    const r = allocate([mk(100, { bid: 8, ask: 10 })], { amount: 10000 })
    assert.equal(r.legs.length, 0)
  })

  test('comfortable is what the top legs hold, whatever the amount', () => {
    const cs = [mk(100, { adv: 300 }), mk(110, { adv: 250 })]
    assert.equal(allocate(cs, { amount: 0 }).comfortable, 55000)
    assert.equal(allocate(cs, { amount: 1e9 }).placed, 55000)
    assert.equal(allocate(cs, { amount: 0, maxLegs: 1 }).comfortable, 30000)
  })
})

test('expirySummary rolls up per expiry', () => {
  const rows = expirySummary([
    { expiry: '2027-01-15', bid: 9.9, ask: 10, oi: 1000, adv: 100, sessions: 10, delta: 0.5 },
    { expiry: '2027-01-15', bid: 4.9, ask: 5, oi: 500, adv: 50, sessions: 10, delta: 0.2 },
    { expiry: '2026-11-20', bid: 1, ask: 1.2, oi: 10, adv: 1, sessions: 10, delta: 0.5 },
  ], '2026-10-05')
  assert.deepEqual(rows.map((r) => r.expiry), ['2026-11-20', '2027-01-15'])
  assert.equal(rows[1].oi, 1500)
  assert.equal(rows[1].monthly, true)
  assert.ok(Math.abs(rows[1].medianSpread - 0.1 / 9.95) < 1e-12)
})

describe('chainRows', () => {
  const o = (option, extra = {}) => ({ option, bid: 1, ask: 1.1, open_interest: 100, volume: 5, delta: 0.5, last_trade_time: '2026-10-02T15:00:00', ...extra })
  test('keeps standard roots, maps dotted tickers, drops adjusted roots and tails', () => {
    const raw = { data: { current_price: 500, options: [
      o('BRKB270115C00500000'), o('BRKB1270115C00500000'), o('BRKB270115C00900000', { delta: 0.01 }),
      o('BRKB261002C00500000'),
    ] } }
    const r = chainRows(raw, 'BRK.B', '2026-10-05')
    assert.deepEqual(r.rows.map((x) => x.sym), ['BRKB270115C00500000'])
    assert.equal(r.price, 500)
    assert.equal(r.session, '2026-10-02')
  })
})

test('limitGuide: start at mid, never give up more than a quarter of the spread', () => {
  assert.deepEqual(limitGuide(24.2, 25.8), { mid: 25, buyMax: 25.4, sellMin: 24.6 })
  assert.equal(limitGuide(0, 1), null)
  // Binance BTC options move in 5 USDT ticks
  assert.deepEqual(limitGuide(9800, 10000, 5), { mid: 9900, buyMax: 9950, sellMin: 9850 })
  assert.deepEqual(limitGuide(9805, 9890, 5), { mid: 9850, buyMax: 9865, sellMin: 9830 })
})

test('tickerSummary grades a whole chain on long-dated near-the-money calls', () => {
  const c = (strike, over = {}) => ({ expiry: '2027-06-17', type: 'C', strike, bid: 9.9, ask: 10, oi: 20000, adv: 3000, sessions: 10, delta: 0.5, ...over })
  const deep = tickerSummary([c(100), c(110), c(120), c(90, { delta: 0.9 })], '2026-10-05')
  // each: min(300, 1000) contracts × $1000 = $300k → $900k
  assert.equal(deep.capacity, 900000)
  assert.equal(deep.tier, 'A')
  const thin = tickerSummary([c(100, { bid: 8, ask: 10, oi: 300, adv: 20 })], '2026-10-05')
  assert.equal(thin.tier, 'D')
  assert.equal(tickerSummary([], '2026-10-05').tier, 'D')
})

test('bucketCapacities sizes each duration and type separately', () => {
  const c = (expiry, type, over = {}) => ({ expiry, type, strike: 100, bid: 9.9, ask: 10, bidSize: 0, oi: 20000, adv: 1000, sessions: 10, delta: type === 'C' ? 0.5 : -0.5, ...over })
  const caps = bucketCapacities([c('2026-11-20', 'C'), c('2027-06-17', 'C'), c('2027-06-17', 'P'), c('2028-01-21', 'C')], '2026-10-05')
  // each contract: min(100, 1000) = 100 contracts × $1000
  assert.deepEqual(caps.C, [100000, 0, 100000, 100000, 0])
  assert.deepEqual(caps.P, [0, 0, 100000, 0, 0])
})

describe('crypto contracts: fractional lots, one coin per unit', () => {
  // A BTC option quoted in USDT per coin, traded in 0.01 BTC, open interest in coins.
  const btc = { sym: 'BTC-270326-120000-C', bid: 9800, ask: 10000, bidSize: 0.8, oi: 60, adv: 4.5, sessions: 5, lot: 0.01, multiplier: 1 }

  test('sizes in coins and dollars without the 100-share multiplier', () => {
    // way out: max(10% of 4.5 = 0.45, min(0.8, 4.5) = 0.8) = 0.8; 5% of 60 = 3
    const m = contractMetrics(btc, { gradeOi: [20, 5, 1] })
    assert.equal(m.capContracts, 0.8)
    assert.equal(m.capDollars, 8000)
    assert.equal(m.roundTripCostPerContract, 200)
    assert.equal(m.grade, 'A')
  })

  test('allocates in 0.01 lots', () => {
    const r = allocate([btc], { amount: 5555, gradeOi: [20, 5, 1] })
    assert.equal(r.legs[0].contracts, 0.55)
    assert.equal(r.placed, 5500)
  })

  test('equity defaults are unchanged', () => {
    const m = contractMetrics({ bid: 9.9, ask: 10, bidSize: 0, oi: 4000, adv: 600, sessions: 10 })
    assert.equal(m.capDollars, 60 * 10 * 100)
  })
})
