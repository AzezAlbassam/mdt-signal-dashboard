import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lastUsableFiscalYear, addMonths, cagr, dcf, fairValuesAt, spearman, tTestGreater, blend, WEIGHTS, variantFair } from '../engine/fairvalue.js'

const funds = (n = 12) =>
  Array.from({ length: n }, (_, i) => {
    const year = 2010 + i
    const eps = 1 + 0.1 * i
    return { year, eps, rev: 100 * (1 + 0.1 * i), fcf: 8 * (1 + 0.1 * i), ebitda: 20 * (1 + 0.1 * i), debt: 10, ni: eps * 10, shares: 10 }
  })

const closes = () => {
  const m = new Map()
  let month = '2010-01'
  for (let i = 0; i < 200; i += 1) {
    m.set(month, 20 + 5 * Math.sin(i / 7) + i * 0.1)
    month = addMonths(month, 1)
  }
  return m
}

test('fiscal year Y is public from May of Y+1', () => {
  assert.equal(lastUsableFiscalYear('2016-04'), 2014)
  assert.equal(lastUsableFiscalYear('2016-05'), 2015)
  assert.equal(lastUsableFiscalYear('2016-12'), 2015)
})

test('addMonths crosses years both ways', () => {
  assert.equal(addMonths('2016-12', 1), '2017-01')
  assert.equal(addMonths('2016-01', -1), '2015-12')
  assert.equal(addMonths('2016-05', -59), '2011-06')
})

test('cagr matches the Pine helper', () => {
  assert.ok(Math.abs(cagr([1, 2, 4, 8]) - 1) < 1e-12)
  assert.equal(cagr([5]), null)
  assert.equal(cagr([-1, 2]), null)
})

test('dcf with zero growth everywhere is a growing perpetuity check', () => {
  // g1 = gT = 0: value = fcf / r exactly.
  assert.ok(Math.abs(dcf(9, 0, 0.09, 0) - 100) < 1e-9)
  assert.equal(dcf(-1, 0.1, 0.09, 0.025), null)
})

test('no look-ahead: later fundamentals and later prices change nothing', () => {
  const month = '2016-05'
  const f = funds()
  const c = closes()
  const base = fairValuesAt(f, c, 'Technology Services', month)
  assert.ok(base && base.values.pe > 0)

  const f2 = f.map((x) => (x.year > 2015 ? { ...x, eps: x.eps * 50, rev: 1, fcf: -5, ebitda: 0.1, shares: 1 } : x))
  const c2 = new Map([...c].map(([k, v]) => [k, k > month ? v * 9 : v]))
  assert.deepEqual(fairValuesAt(f2, c2, 'Technology Services', month), base)
})

test('the fiscal year just reported in May is used that month, not the month before', () => {
  const f = funds()
  const c = closes()
  assert.equal(fairValuesAt(f, c, 'Finance', '2016-04').fiscalYear, 2014)
  assert.equal(fairValuesAt(f, c, 'Finance', '2016-05').fiscalYear, 2015)
})

test('blend re-weights over the methods that exist', () => {
  const v = { pe: 10, peg: null, dcf: 20, graham: null, ev: null, ps: null, pb: null, pbj: null, cash: null, pen: null }
  // Mature: pe 0.30, dcf 0.30 survive → plain average.
  assert.equal(blend(v, WEIGHTS['Mature / profitable']).fair, 15)
  assert.equal(variantFair({ profile: 'Pre-revenue', values: v }, 'V1'), null)
  assert.equal(variantFair({ profile: 'Mature / profitable', values: v }, 'V1'), 10)
})

test('spearman and the t-test', () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1)
  assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1)
  // t = 2 with 10 df: one-sided p = 0.03669 (tables).
  const xs = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map((_, i) => i - 5)
  const shift = 2 * Math.sqrt(xs.reduce((a, b) => a + b * b, 0) / 10) / Math.sqrt(11)
  const r = tTestGreater(xs.map((x) => x + shift))
  assert.ok(Math.abs(r.t - 2) < 1e-9)
  assert.ok(Math.abs(r.p - 0.03669) < 1e-4)
})

test('study 8: trend uses only the last 10 months up to this one', async () => {
  const { trendUp, signFlipGreater, holm } = await import('../engine/fairvalue.js')
  const c = new Map()
  let m = '2015-01'
  for (let i = 0; i < 24; i += 1) {
    c.set(m, 10 + i)
    m = addMonths(m, 1)
  }
  assert.equal(trendUp(c, '2015-12'), true)
  const c2 = new Map(c)
  c2.set('2016-01', 1) // a later month changes nothing
  assert.equal(trendUp(c2, '2015-12'), true)
  assert.equal(trendUp(c, '2015-09'), null) // only 9 months exist
  assert.equal(signFlipGreater([1, 1, 1]), 1 / 8)
  assert.deepEqual(holm([0.01, 0.04]), [0.02, 0.04])
})

test('live: a fiscal year labelled this year (ends mid-year, already reported) is used', () => {
  const f = funds() // years 2010–2021
  const c = closes()
  assert.equal(fairValuesAt(f, c, 'Finance', '2021-10').fiscalYear, 2020)
  assert.equal(fairValuesAt(f, c, 'Finance', '2021-10', true).fiscalYear, 2021)
})

test('months with P/S above 100 are no anchor for the fair P/S', () => {
  // Revenue was almost nothing until FY2014 (P/S in the thousands), then 100 (P/S about 2.5).
  const f = funds().map((x) => ({ ...x, rev: x.year < 2015 ? 0.1 : 100 }))
  const c = closes()
  assert.equal(fairValuesAt(f, c, 'Technology Services', '2016-05').values.ps, null) // one clean month
  const fv = fairValuesAt(f, c, 'Technology Services', '2017-05')
  assert.ok(fv.values.ps > 0 && fv.values.ps < 2 * fv.close)
})

test('a fiscal year with no revenue, EPS or profit is left out', async () => {
  const { parseFundamentals } = await import('../engine/fairvalue.js')
  const resp = { labels: ['2023', '2024', '2025'], series: { revenue: [{ value: 10 }, { value: 12 }, { value: null }], eps: [{ value: 1 }, { value: 1.2 }, { value: null }], net_income: [{ value: 5 }, { value: 6 }, { value: null }] } }
  assert.deepEqual(parseFundamentals(resp).map((x) => x.year), [2023, 2024])
})

test('quarters → last twelve months: sums four consecutive quarters, skips gaps and empty quarters', async () => {
  const { ttmFromQuarters } = await import('../engine/fairvalue.js')
  const labels = ['Q1 2024', 'Q2 2024', 'Q3 2024', 'Q4 2024', 'Q1 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026']
  const val = (f) => labels.map((_, i) => ({ value: f(i) }))
  const resp = { labels, series: { revenue: val((i) => (i === 9 ? null : 10 + i)), eps: val((i) => (i === 9 ? null : 1)), net_income: val((i) => (i === 9 ? null : 2)), fcf: val(() => 1), total_debt: val((i) => i) } }
  const t = ttmFromQuarters(resp)
  // Q4 2024 and Q1 2025 close full years; Q2 2025 is missing, so the next full year is Q2 2026.
  assert.deepEqual(t.map((x) => x.label), ['Q4 2024', 'Q1 2025', 'Q2 2026'])
  assert.equal(t[0].rev, 10 + 11 + 12 + 13)
  assert.equal(t[0].eps, 4)
  assert.equal(t[2].debt, 8)
  assert.equal(t[2].prev, null) // Q2 2025 is not there
})

test('live context: today reads the last twelve months, months before the quarterly data read fiscal years', async () => {
  const { liveContext } = await import('../engine/fairvalue.js')
  const f = funds() // fiscal years 2010–2021, EPS 1.0 … 2.1
  const ttm = [{ label: 'Q2 2021', n: 0, rev: 500, ni: 50, eps: 5, fcf: 40, ebitda: 90, gp: 200, debt: 7, prev: null, revYoY: 0.3 },
    { label: 'Q3 2021', n: 1, rev: 600, ni: 60, eps: 6, fcf: 48, ebitda: 100, gp: 240, debt: 8, prev: null, revYoY: 0.4 }]
  const live = liveContext(f, ttm, '2021-10')
  assert.equal(live.state('2021-10').eps, 6) // newest quarter: out now
  assert.equal(live.state('2021-07').eps, 5) // the one before: out three months earlier
  assert.equal(live.state('2021-06').eps, f.find((x) => x.year === 2021).eps) // before that: fiscal year, shifted like today
  assert.equal(live.yoy, 0.4)
  assert.equal(live.state('2021-10').fcfPS, 48 / 10)
})
