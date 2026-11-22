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
  nyDate,
  chainDeltas,
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
  // A Thursday daily is not the monthly when its Friday is listed too (SPY, QQQ, IWM).
  assert.equal(isMonthly('2026-12-17', ['2026-12-17', '2026-12-18']), false)
  assert.equal(isMonthly('2026-06-18', ['2026-06-18', '2026-07-17']), true) // Juneteenth Friday
})

describe('grade: the weakest constraint decides', () => {
  test('spread and open interest both have to clear the bar', () => {
    assert.equal(grade({ spreadPct: 0.02, oi: 5000 }), 'A')
    assert.equal(grade({ spreadPct: 0.02, oi: 1000 }), 'B')
    assert.equal(grade({ spreadPct: 0.09, oi: 5000 }), 'C')
    assert.equal(grade({ spreadPct: 0.12, oi: 5000 }), 'D')
  })
  test('a spread exactly on a threshold counts as inside it', () => {
    // (4.73 - 4.07) / 4.40 is 15% on paper and 0.15000000000000002 in floating point
    assert.ok(contractMetrics({ bid: 4.07, ask: 4.73, bidSize: 10, oi: 1000, adv: 100, sessions: 10 }).capContracts > 0)
    assert.equal(contractMetrics({ bid: 9.85, ask: 10.15, bidSize: 10, oi: 5000, adv: 100, sessions: 10 }).grade, 'A') // 3.0000000000000072%
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

  test('a re-run of the same session does not drop a contract it misses', () => {
    let h = mergeSession(null, '2026-10-01', { A: 61, C: 0, E: 9 })
    h = mergeSession(h, '2026-10-01', { B: 0, E: 90 })
    assert.deepEqual(h.vol.C, [0])
    assert.deepEqual(h.vol.E, [90])
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

test('averageVolume skips sessions before listing and leaves out one-off prints', () => {
  assert.deepEqual(averageVolume([null, null, 10, 20]), { adv: 15, sessions: 2 })
  assert.deepEqual(averageVolume([7]), { adv: 7, sessions: 1 })
  assert.deepEqual(averageVolume([]), { adv: 0, sessions: 0 })
  // One 40,000-contract block on a contract that trades a few a day is not a normal day.
  assert.deepEqual(averageVolume([2, 1, 3, 40000, 2]), { adv: 2, sessions: 5 })
  // Nor are three 500-lots on a contract that is otherwise idle.
  assert.deepEqual(averageVolume([473, 800, 0, 0, 0, 0, 5, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 577, 0, 0]), { adv: 7 / 17, sessions: 20 })
  // Two blocks among four days, and a block on day two of a new contract.
  assert.deepEqual(averageVolume([40000, 30000, 5, 3]), { adv: 4, sessions: 4 })
  assert.deepEqual(averageVolume([40000, 5]), { adv: 5, sessions: 2 })
  // A busy day of a steadily traded contract (8x its typical day) is real flow and stays in.
  assert.deepEqual(averageVolume([100, 120, 90, 800, 110]), { adv: 244, sessions: 5 })
  // Small prints are never called one-off, however quiet the other days.
  assert.deepEqual(averageVolume([20, 0, 0, 0]), { adv: 5, sessions: 4 })
  // A contract that trades in bursts is not all one-off: at most the three largest days go.
  assert.deepEqual(averageVolume([0, 0, 0, 34, 77, 29, 33, 11, 75, 26, 28, 26, 0, 0, 0, 0, 0, 0, 0, 0]), { adv: 153 / 17, sessions: 20 })
  assert.deepEqual(averageVolume([...Array(11).fill(0), ...Array(9).fill(60)]), { adv: 360 / 17, sessions: 20 })
})

test('nyDate is the New York calendar date, also late in the evening', () => {
  assert.equal(nyDate('2026-11-20T02:40:00Z'), '2026-11-19')
  assert.equal(nyDate('2026-07-01T03:30:00Z'), '2026-06-30')
  assert.equal(nyDate('2026-11-19T21:23:59Z'), '2026-11-19')
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

  test('an amount within the comfortable maximum is placed in full, small legs included', () => {
    const cs = [mk(100, { adv: 550 }), mk(110, { adv: 320 }), mk(120, { adv: 40, bidSize: 0 }), mk(130, { adv: 40, bidSize: 0 }), mk(140, { adv: 30, bidSize: 0 }), mk(150, { adv: 20, bidSize: 0 })]
    const r = allocate(cs, { amount: 100000 })
    assert.equal(r.comfortable, 100000)
    assert.equal(r.unplaced, 0)
    assert.deepEqual(r.legs.map((l) => [l.strike, l.contracts]), [[100, 55], [110, 32], [120, 4], [130, 4], [140, 3], [150, 2]])
  })

  test('when every top contract costs more than the amount, the best-ranked one that fits is used', () => {
    const cs = [mk(100, { bid: 99, ask: 100, adv: 1000 }), mk(110, { bid: 99, ask: 100, adv: 500 }), mk(120, { adv: 100 }), mk(130, { adv: 90 })]
    const r = allocate(cs, { amount: 5000, maxLegs: 2 })
    assert.deepEqual(r.legs.map((l) => [l.strike, l.contracts]), [[120, 5]], 'one leg, not one per contract that fits')
    // An amount of exactly one lot fits, whatever the floating point does to ask x 100.
    const one = allocate([mk(100, { bid: 99, ask: 100, adv: 1000 }), mk(110, { bid: 1.09, ask: 1.1, adv: 100 })], { amount: 110, maxLegs: 1 })
    assert.deepEqual(one.legs.map((l) => [l.strike, l.contracts]), [[110, 1]])
  })

  test('a leftover under 1% of the amount does not open its own order', () => {
    // $99,000 in the big leg; the other top contract could only add one $1,000 contract.
    const r = allocate([mk(100, { adv: 990 }), mk(110, { adv: 10, bidSize: 0 })], { amount: 100000 })
    assert.deepEqual(r.legs.map((l) => [l.strike, l.contracts]), [[100, 99], [110, 1]], '1% is still placed')
    const r2 = allocate([mk(100, { adv: 9990, oi: 1e6 }), mk(110, { adv: 10, bidSize: 0 })], { amount: 1000000 })
    assert.deepEqual(r2.legs.map((l) => [l.strike, l.contracts]), [[100, 999]], 'a 0.1% leg is not')
  })

  test('a symbol listed twice makes one leg', () => {
    const r = allocate([mk(100, { adv: 300 }), mk(100, { adv: 300 })], { amount: 20000 })
    assert.equal(r.legs.length, 1)
    assert.equal(r.legs.reduce((s, l) => s + l.cost, 0), r.placed)
  })

  test('an amount equal to the comfortable maximum is placed in full, best-graded first', () => {
    // Five A contracts of $4,000 each (each under the 5% crumb) and one B contract of $80,000.
    const cs = [1, 2, 3, 4, 5].map((k) => mk(k, { adv: 40, bidSize: 0 })).concat(mk(200, { bid: 9.5, ask: 10, adv: 800, bidSize: 0 }))
    const r = allocate(cs, { amount: 100000 })
    assert.equal(r.comfortable, 100000)
    assert.equal(r.unplaced, 0)
    assert.deepEqual(r.legs.map((l) => [l.strike, l.contracts]), [[1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [200, 80]])
    // Over the limit, the top legs fill to exactly the comfortable figure.
    assert.equal(allocate(cs, { amount: 250000 }).placed, 100000)
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

test('expirySummary: even count takes the middle two, and the delta range is honoured', () => {
  const list = [
    { expiry: '2027-01-15', type: 'C', bid: 9.9, ask: 10, bidSize: 20, oi: 10000, adv: 1000, sessions: 10, delta: 0.5 },
    { expiry: '2027-01-15', type: 'C', bid: 9.7, ask: 10, bidSize: 20, oi: 10000, adv: 1000, sessions: 10, delta: 0.4 },
  ]
  const [row] = expirySummary(list, '2026-10-05')
  assert.ok(Math.abs(row.medianSpread - (0.1 / 9.95 + 0.3 / 9.85) / 2) < 1e-12)
  const narrow = expirySummary(list, '2026-10-05', { dMin: 0.45, dMax: 0.6 })[0]
  assert.ok(narrow.capacity > 0 && narrow.capacity < row.capacity)
})

describe('chainRows', () => {
  const o = (option, extra = {}) => ({ option, bid: 1, ask: 1.1, open_interest: 100, volume: 5, delta: 0.5, last_trade_time: '2026-10-02T15:00:00', ...extra })
  test('keeps standard roots, maps dotted tickers, drops adjusted roots and tails', () => {
    const raw = { data: { current_price: 500, options: [
      o('BRKB270115C00500000'), o('BRKB1270115C00500000'), o('BRKB270115C00900000', { delta: 0.01 }),
      o('BRKB261002C00500000'), o('BRKB270115C00600000', { last_trade_time: '2027-11-20T10:00:00' }),
    ] } }
    const r = chainRows(raw, 'BRK.B', '2026-10-05')
    assert.deepEqual(r.rows.map((x) => x.sym), ['BRKB270115C00500000', 'BRKB270115C00600000'])
    assert.equal(r.price, 500)
    assert.equal(r.session, '2026-10-02')
  })
})

test('limitGuide: start at mid, never give up more than a quarter of the spread', () => {
  assert.deepEqual(limitGuide(24.2, 25.8), { buy: 25, buyMax: 25.4, sell: 25, sellMin: 24.6 })
  assert.equal(limitGuide(0, 1), null)
  // Binance BTC options move in 5 USDT ticks; a mid between ticks rounds toward your own side.
  assert.deepEqual(limitGuide(9800, 10000, 5), { buy: 9900, buyMax: 9950, sell: 9900, sellMin: 9850 })
  assert.deepEqual(limitGuide(9805, 9890, 5), { buy: 9845, buyMax: 9865, sell: 9850, sellMin: 9830 })
  // One tick wide: the buyer joins the bid and the seller the ask; neither crosses the spread.
  assert.deepEqual(limitGuide(1, 1.01), { buy: 1, buyMax: 1, sell: 1.01, sellMin: 1.01 })
  for (let i = 0; i < 2000; i += 1) {
    const tick = [0.01, 0.05, 0.1][i % 3]
    const bid = Math.round((0.05 + (i * 7919) % 5000 / 100) / tick) * tick
    const ask = bid + tick * (1 + (i % 9))
    const g = limitGuide(bid, ask, tick)
    const mid = (bid + ask) / 2, q = (ask - bid) / 4
    assert.ok(g.buy >= bid - 1e-9 && g.buy <= g.buyMax && g.buyMax <= mid + q + 1e-9, `buy ${JSON.stringify(g)} for ${bid} x ${ask}`)
    assert.ok(g.sell <= ask + 1e-9 && g.sell >= g.sellMin && g.sellMin >= mid - q - 1e-9, `sell ${JSON.stringify(g)} for ${bid} x ${ask}`)
  }
  // Every price on the grid, also for ticks with more decimals than their size suggests.
  for (const [bid, ask, tick] of [[3517, 3517.25, 0.25], [86.15, 87.275, 0.025], [3.75, 4, 0.05], [5.1, 5.6, 0.1]]) {
    for (const v of Object.values(limitGuide(bid, ask, tick))) assert.ok(Math.abs(v / tick - Math.round(v / tick)) < 1e-9, `${v} off the ${tick} grid`)
  }
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

describe('chainDeltas (chains without Greeks)', () => {
  const N = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const y = 1 - (Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return x >= 0 ? y : 1 - y }
  // European prices with a dividend yield q, standing in for what a source quotes.
  const euro = (S, K, T, v, q, type, r = 0.04) => {
    const d1 = (Math.log(S / K) + (r - q + (v * v) / 2) * T) / (v * Math.sqrt(T))
    const d2 = d1 - v * Math.sqrt(T)
    return type === 'C' ? S * Math.exp(-q * T) * N(d1) - K * Math.exp(-r * T) * N(d2) : K * Math.exp(-r * T) * N(-d2) - S * Math.exp(-q * T) * N(-d1)
  }
  const leg = (type, strike, T, price) => ({ expiry: '2029-01-19', type, strike, T, price, mid: price })
  // A two-sided quote, and one a fraction w either side of a European price.
  const quote = (type, strike, T, bid, ask, root = 'X') => ({ root, expiry: '2026-12-18', type, strike, T, bid, ask, mid: (bid + ask) / 2, price: (bid + ask) / 2 })
  const fair = (type, strike, T, S, v, q = 0, w = 0.02) => { const m = euro(S, strike, T, v, q, type); return quote(type, strike, T, m * (1 - w), m * (1 + w)) }
  const at = (chain, S, type, strike) => chainDeltas(chain, S)[chain.findIndex((o) => o.type === type && o.strike === strike)]
  const falling = (chain, S, type) => chain.map((o, i) => [o, chainDeltas(chain, S)[i]]).filter(([o]) => o.type === type).sort(([a], [b]) => a.strike - b.strike).every(([, d], i, xs) => i === 0 || d <= xs[i - 1][1] + 1e-9)

  test('a deep put with no call quoted at its strike reads like its neighbours, not from its own wide quote', () => {
    // VALE Dec-18: S 9.83, the 12 put closed 2.00 x 2.60 and read -0.83 on its own; Cboe had -0.977
    const S = 9.83
    const T = 29 / 365
    const chain = [fair('C', 9, T, S, 0.4), fair('C', 10, T, S, 0.37), fair('C', 11, T, S, 0.36), fair('P', 8, T, S, 0.5), fair('P', 9, T, S, 0.42), quote('P', 11, T, 1.16, 1.4), quote('P', 12, T, 2.0, 2.6)]
    const d = at(chain, S, 'P', 12)
    assert.ok(d < -0.95, `the 12 put reads ${d}`)
    assert.ok(falling(chain, S, 'P'), 'put deltas fall as the strike rises')
  })

  test('a placeholder call quote (0.05 x 10.00) does not drag the deep put at its strike into the band', () => {
    // IESC Dec-18: S 166.9, calls from 240 up quoted 0.05 x 10.00 lifted the puts there to -0.83
    const S = 166.9
    const T = 29 / 365
    const chain = [170, 180, 190, 200, 210, 220].map((K) => fair('C', K, T, S, 0.9, 0, 0.3))
    for (const K of [240, 250, 260]) chain.push(quote('C', K, T, 0.05, 10), quote('P', K, T, K - S - 1, K - S + 9))
    for (const K of [240, 250, 260]) assert.ok(at(chain, S, 'P', K) < -0.88, `put ${K}: ${at(chain, S, 'P', K)}`)
    assert.ok(at(chain, S, 'C', 240) < at(chain, S, 'C', 220), 'the placeholder call reads below the last real one')
    assert.ok(falling(chain, S, 'P') && falling(chain, S, 'C'))
  })

  test('one call quoted far over its neighbours misleads neither itself nor its put', () => {
    // AAL Dec-2028: the 27 call read 0.375 between 0.299 (25) and 0.197 (30), so its put read -0.719 (Cboe -0.974)
    const S = 12.72
    const T = 2.07
    const chain = [15, 17, 20, 22, 25, 30, 35].map((K) => fair('C', K, T, S, 0.45, 0, 0.1))
    chain.push(fair('C', 27, T, S, 0.62, 0, 0.1))
    for (const K of [10, 12, 22, 25, 27]) chain.push(fair('P', K, T, S, 0.45, 0, 0.03))
    const c = at(chain, S, 'C', 27)
    assert.ok(c < at(chain, S, 'C', 25) && c > at(chain, S, 'C', 30), `the 27 call reads ${c}`)
    assert.ok(at(chain, S, 'P', 27) < -0.9, `the 27 put reads ${at(chain, S, 'P', 27)}`)
    assert.ok(falling(chain, S, 'P') && falling(chain, S, 'C'))
  })

  test('a dividend payer keeps a long-dated in-the-money put inside the band', () => {
    // O Jan-2029: S 57.66, a 5% yield; the 67.5 put read -1.000 (exercised at once without dividends) and Cboe had -0.674
    const S = 57.6
    const T = 2.17
    const chain = [45, 50, 55, 57.5, 60, 65, 67.5, 75].flatMap((K) => [fair('C', K, T, S, 0.21, 0.05, 0.03), fair('P', K, T, S, 0.21, 0.05, 0.03)])
    const p = at(chain, S, 'P', 67.5)
    assert.ok(p > -0.75 && p < -0.6, `the 67.5 put reads ${p}`)
    // dollar dividends: a call's delta is its put's plus 1 (a hair more, the put is American)
    const gap = at(chain, S, 'C', 57.5) - at(chain, S, 'P', 57.5)
    assert.ok(gap > 1 && gap < 1.03, `call minus put at the money: ${gap}`)
  })

  test('an adjusted root at the same strike does not stand in for the real partner', () => {
    // MSTR1 delivers something other than 100 shares, so its 120 call is priced for that
    const S = 100
    const chain = [fair('C', 120, 1, S, 0.3), fair('P', 120, 1, S, 0.3), fair('C', 110, 1, S, 0.3), fair('P', 90, 1, S, 0.3)]
    const alone = at(chain, S, 'P', 120)
    const withAdjusted = chainDeltas([...chain, quote('C', 120, 1, 30, 31, 'X1')], S)[1]
    assert.equal(withAdjusted, alone)
    assert.ok(alone < -0.65 && alone > -0.8, `the 120 put: ${alone}`)
  })

  test('with nothing quoted out of the money, options read from their own price, a deeper put never nearer the band', () => {
    // BTQ Jan-15, S 1.19: on its own 3.70 x 4.30 the 5 put read -0.64, between -0.82 (2.5) and -1 (7.5)
    const S = 1.1885
    const T = 57 / 365
    const chain = [quote('P', 2.5, T, 1.25, 1.45), quote('P', 5, T, 3.7, 4.3), quote('P', 7.5, T, 5.8, 6.8)]
    const [p25, p5] = chainDeltas(chain, S)
    assert.ok(p25 < -0.75 && p25 > -0.9, `the 2.5 put on its own price: ${p25}`)
    assert.ok(chainDeltas([chain[1]], S)[0] > -0.7, 'the 5 put alone reads from its own quote')
    assert.ok(p5 <= p25, `next to the 2.5 put: ${p5}`)
    assert.ok(falling(chain, S, 'P'))
  })

  test("a call on a dividend payer trades under parity: it is 1 + its put's delta, not 1", () => {
    const call = leg('C', 90, 3, euro(100, 90, 3, 0.15, 0.04, 'C'))
    const put = leg('P', 90, 3, euro(100, 90, 3, 0.15, 0.04, 'P'))
    assert.equal(chainDeltas([call], 100)[0], 1, 'on its own price it has no time value left')
    const [d] = chainDeltas([call, put], 100)
    assert.ok(d > 0.6 && d < 0.85, `with its put: ${d}`)
  })

  test('away from the money a wide quote never reads nearer the band than its neighbour; an unpriced option reads null', () => {
    // XYZ Dec-24: the 86 call read 0.210 next to the 85 at 0.177 (Cboe 0.150 / 0.173)
    const S = 70
    const T = 32 / 365
    const chain = [70, 75, 80, 85, 90, 95].map((K) => fair('C', K, T, S, 0.5, 0, 0.05))
    chain.push(quote('C', 86, T, 0.2, 1.4)) // wide, its vol under the outlier tolerance
    chain.push({ ...quote('C', 100, T, 0, 0), mid: null, price: null }) // no quote, no trade
    const d = chainDeltas(chain, S)
    assert.ok(d[6] <= d[3], `the 86 call reads ${d[6]}, the 85 ${d[3]}`)
    assert.ok(falling(chain.slice(0, 7), S, 'C'))
    assert.equal(d[7], null)
  })

  test('one put with a broken time to expiry beside the money leaves the rest of its expiry readable', () => {
    // the at-the-money pair is the only one to read dividends from, and another expiry has a smile to lend
    const S = 100
    const chain = [quote('C', 100, 0.5, 9.9, 10.1), quote('P', 100, NaN, 8.9, 9.1), quote('C', 110, 0.5, 5.9, 6.1), quote('P', 90, 0.5, 4.9, 5.1), quote('P', 120, 0.5, 23, 24), quote('C', 80, 0.5, 23, 24)]
    const other = [quote('C', 110, 0.15, 1.9, 2.1), quote('P', 90, 0.15, 1.4, 1.6)].map((o) => ({ ...o, expiry: '2027-01-15' }))
    const d = chainDeltas([...chain, ...other], S)
    assert.equal(d.filter(Number.isFinite).length, 7, d.join(' ')) // all but the broken put
  })

  test('out-of-the-money options read from their own price, the put as the American option it is', () => {
    const [c, p] = chainDeltas([leg('C', 110, 1, euro(100, 110, 1, 0.4, 0, 'C')), leg('P', 90, 1, euro(100, 90, 1, 0.4, 0, 'P'))], 100)
    assert.ok(Math.abs(c - 0.5246) < 0.005, `call ${c}`) // N(d1) at the 40% it was priced with
    assert.ok(p < -0.2866 && p > -0.31, `put ${p}`) // a little past the European -0.2866: early exercise
    assert.deepEqual(chainDeltas([leg('C', 110, 1, null)], 100), [null])
    assert.deepEqual(chainDeltas([leg('C', 110, 1, 1)], null), [null])
  })
})
