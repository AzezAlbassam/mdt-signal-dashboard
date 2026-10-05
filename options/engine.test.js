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
  test('A needs all three', () => {
    assert.equal(grade({ spreadPct: 0.02, oi: 5000, adv: 500 }), 'A')
    assert.equal(grade({ spreadPct: 0.02, oi: 5000, adv: 100 }), 'B')
    assert.equal(grade({ spreadPct: 0.10, oi: 5000, adv: 500 }), 'C')
  })
  test('no quote is D', () => {
    assert.equal(grade({ spreadPct: null, oi: 5000, adv: 500 }), 'D')
  })
})

describe('contractMetrics', () => {
  const base = { bid: 9.8, ask: 10.2, bidSize: 40, oi: 4000, volume: 300, adv: 600, sessions: 10 }

  test('cap is the smaller of 10% ADV and 5% OI', () => {
    const m = contractMetrics(base)
    assert.equal(m.capByAdv, 60)
    assert.equal(m.capByOi, 200)
    assert.equal(m.capContracts, 60)
    assert.equal(m.binding, 'volume')
    assert.equal(m.capDollars, 60 * 10.2 * 100)
    assert.ok(Math.abs(m.spreadPct - 0.04) < 1e-12)
    assert.equal(m.grade, 'B')
  })

  test('open interest binds on a thinly held contract', () => {
    const m = contractMetrics({ ...base, oi: 300 })
    assert.equal(m.capContracts, 15)
    assert.equal(m.binding, 'oi')
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

  test('without history, today\'s volume stands in and is flagged', () => {
    const m = contractMetrics({ ...base, adv: undefined, sessions: 0 })
    assert.equal(m.adv, 300)
    assert.equal(m.advEstimated, true)
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

  test('fills the best leg to its cap, then the next', () => {
    const contracts = [
      mk(100, { adv: 300 }), // cap 30 → $30,000, grade A
      mk(110, { adv: 250 }), // cap 25 → $25,000, grade A
      mk(120, { bid: 9, ask: 10 }), // spread ~10.5% → C
    ]
    const r = allocate(contracts, { amount: 50000 })
    assert.deepEqual(r.legs.map((l) => [l.strike, l.contracts]), [[100, 30], [110, 20]])
    assert.equal(r.placed, 50000)
    assert.equal(r.unplaced, 0)
  })

  test('reports what does not fit', () => {
    const r = allocate([mk(100, { adv: 100, oi: 1000 })], { amount: 100000 })
    // cap = min(10, 50) = 10 contracts × $1000
    assert.equal(r.placed, 10000)
    assert.equal(r.unplaced, 90000)
    assert.equal(r.capacity, 10000)
  })

  test('grade-D contracts are never used', () => {
    const r = allocate([mk(100, { oi: 50, adv: 5 })], { amount: 10000 })
    assert.equal(r.legs.length, 0)
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
