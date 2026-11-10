import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lastUsableFiscalYear, addMonths, cagr, dcf, fairValuesAt, spearman, tTestGreater, blend, blendTrimmed, METHODS, WEIGHTS, variantFair, quoteShares, allShares } from '../engine/fairvalue.js'

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

test('quarters: a newest quarter without its cash-flow statement keeps the previous FCF, EBITDA and debt (POST-HOC 2026-10-22)', async () => {
  const { ttmFromQuarters } = await import('../engine/fairvalue.js')
  const labels = ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026']
  const val = (f) => labels.map((_, i) => ({ value: f(i) }))
  const late = (x) => val((i) => (i === 4 ? null : x + i)) // as JNJ's Q3 2026
  const t = ttmFromQuarters({ labels, series: { revenue: val(() => 10), eps: val(() => 1), net_income: val(() => 2), fcf: late(1), ebitda: late(3), total_debt: late(5) } })
  assert.equal(t.at(-1).rev, 40)
  assert.deepEqual([t.at(-1).fcf, t.at(-1).ebitda, t.at(-1).debt], [1 + 2 + 3 + 4, 3 + 4 + 5 + 6, 8])
})

test('live context: twelve months ending before the last fiscal year are not today (POST-HOC 2026-10-22)', async () => {
  const { liveContext } = await import('../engine/fairvalue.js')
  const ttm = [{ label: 'Q2 2019', n: 0, rev: 0, ni: -5, eps: -1, fcf: null, ebitda: null, gp: null, debt: 1, prev: null, revYoY: null }] // RZLV: Q2 2024 vs FY2025
  const live = liveContext(funds(), ttm, '2021-10') // fiscal years to 2021
  assert.equal(live.period, null)
  assert.equal(live.f0, null)
})

test('quarters with a repeated label are numbered by position back from the last one (POST-HOC)', async () => {
  const { ttmFromQuarters } = await import('../engine/fairvalue.js')
  const labels = ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q3 2025', 'Q1 2026', 'Q3 2026', 'Q3 2026'] // as TradingView sent UNH's
  const val = (f) => labels.map((_, i) => ({ value: f(i) }))
  const t = ttmFromQuarters({ labels, series: { revenue: val((i) => 10 + i), eps: val(() => 1), net_income: val(() => 2) } })
  assert.deepEqual(t.map((x) => x.label), ['Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026']) // 7 quarters Q1 2025 … Q3 2026 → 4 windows
  assert.equal(t.at(-1).rev, 13 + 14 + 15 + 16)
})

test('live context: today\'s share count replaces a weighted average more than 10% off, and EPS follows it (POST-HOC)', async () => {
  const { liveContext } = await import('../engine/fairvalue.js')
  const f = funds()
  const ttm = [{ label: 'Q3 2021', n: 0, rev: 600, ni: 60, eps: 6, fcf: 48, ebitda: 100, gp: 240, debt: 8, prev: null, revYoY: 0.4 }] // 10 shares
  assert.equal(liveContext(f, ttm, '2021-10', 10.5).state('2021-10').shares, 10) // 5% off: kept
  const st = liveContext(f, ttm, '2021-10', 12).state('2021-10') // 20% more shares today (an offering)
  assert.equal(st.shares, 12)
  assert.equal(st.eps, 60 / 12)
  // POST-HOC (2026-10-22): only dilution restates EPS. A larger net income ÷ EPS count (preferred
  // dividends, convertibles: CELH) or opposite signs (ALB) keep the reported EPS; shares are today's.
  const pref = liveContext(f, [{ ...ttm[0], eps: 4 }], '2021-10', 12).state('2021-10') // count 15
  assert.equal(pref.shares, 12)
  assert.equal(pref.eps, 4)
  assert.equal(liveContext(f, [{ ...ttm[0], eps: -1 }], '2021-10', 12).state('2021-10').eps, -1)
})

test('quoteShares: ADR market value from the home listing (TSM) uses the share count; NVO, Aramco and RIVN keep market ÷ price', () => {
  // TradingView quotes of 2026-10-20.
  const tsm = { close: 425.08, market_cap_basic: 1929255198933, total_shares_outstanding: 5186480000, net_income_ttm: 80579754536, earnings_per_share_diluted_ttm: 15.5375 }
  const nvo = { close: 39.35, market_cap_basic: 170099131862, total_shares_outstanding: 3345880520, net_income_ttm: 18192950078, earnings_per_share_diluted_ttm: 4.0918 }
  const aramco = { close: 25.48, market_cap_basic: 6240962974822, total_shares_outstanding: 241823600000, net_income_ttm: 408371000000, earnings_per_share_diluted_ttm: 1.9587 }
  const rivn = { close: 12.43, market_cap_basic: 17996907730, total_shares_outstanding: 1443948100, net_income_ttm: -3233000000, earnings_per_share_diluted_ttm: -2.581 }
  assert.equal(quoteShares(tsm), 5186480000)
  assert.ok(Math.abs(quoteShares(nvo) / (170099131862 / 39.35) - 1) < 1e-12)
  assert.ok(Math.abs(quoteShares(aramco) / (6240962974822 / 25.48) - 1) < 1e-12)
  assert.ok(Math.abs(quoteShares(rivn) / (17996907730 / 12.43) - 1) < 1e-12)
  assert.equal(quoteShares({ close: 10 }), null)
  // 2026-10-22: the ADR fell 4.3% and Taipei's market value came within 10% (9.6%); the two counts agree within 2% (POST-HOC).
  const tsm22 = { close: 413.145, market_cap_basic: 1936095639264.9456, total_shares_outstanding: 5186480000, net_income_ttm: 80579754536.5383, earnings_per_share_diluted_ttm: 15.5375 }
  assert.equal(quoteShares(tsm22), 5186480000)
})

test('allShares: every class for a US Up-C (TKO); UROY, a Tadawul "Class A" and a DR keep quoteShares (POST-HOC)', () => {
  // TradingView quotes of 2026-10-22.
  const tko = { description: 'TKO Group Holdings, Inc. Class A', type: 'stock', currency: 'USD', close: 176.775, market_cap_basic: 33458154194.878193, total_shares_outstanding: 73111100, net_income_ttm: 229556000, earnings_per_share_diluted_ttm: 2.8908 }
  const uroy = { description: 'Uranium Royalty Corporation', type: 'stock', currency: 'USD', close: 3.385, market_cap_basic: 1289912932.2412283, total_shares_outstanding: 146483000, net_income_ttm: 3191153.35507368, earnings_per_share_diluted_ttm: 0.0231 }
  const rabigh = { description: 'Rabigh Refining & Petrochemical Co. Class A', type: 'stock', currency: 'SAR', close: 16.05, market_cap_basic: 44805360417, total_shares_outstanding: 2197036000, net_income_ttm: 2284915000, earnings_per_share_diluted_ttm: 1.3677 }
  const nvo = { description: 'Novo Nordisk A/S Sponsored ADR Class B', type: 'dr', currency: 'USD', close: 39.35, market_cap_basic: 170099131862, total_shares_outstanding: 3345880520, net_income_ttm: 18192950078, earnings_per_share_diluted_ttm: 4.0918 }
  assert.equal(quoteShares(tko), 73111100) // Class A: what EPS and P/E are on
  assert.ok(Math.abs(allShares(tko) / (33458154194.878193 / 176.775) - 1) < 1e-12) // 189M with the units
  for (const q of [uroy, rabigh, nvo]) assert.equal(allShares(q), quoteShares(q))
})

test('quoteShares: a Tadawul market value is at the previous close (4292, −7.5% today, no diluted EPS)', () => {
  const q = { close: 30.68, change: -7.53465943339361, market_cap_basic: 1396453821, total_shares_outstanding: 42087200, net_income_ttm: 96524465, earnings_per_share_diluted_ttm: null, currency: 'SAR' }
  assert.ok(Math.abs((q.close * quoteShares(q)) / q.net_income_ttm - 13.38) < 0.01)
  assert.ok(Math.abs(quoteShares({ ...q, currency: 'USD' }) - q.market_cap_basic / q.close) < 1) // elsewhere, today's close
})

test('blendTrimmed (study 16 D2 C): a method above 3× or below ⅓ of the weighted median is left out', () => {
  const w = WEIGHTS['Mature / profitable'] // pe .3, dcf .3, graham .15, ev .25
  const noGraham = w.map((x, i) => (METHODS[i] === 'graham' ? 0 : x))
  const b = blendTrimmed({ pe: 10, dcf: 100, ev: 12 }, noGraham) // median 12 (cumulative .3, .55 ≥ .425)
  assert.deepEqual(b.dropped, ['dcf'])
  assert.equal(b.med, 12)
  assert.ok(Math.abs(b.fair - (10 * 0.3 + 12 * 0.25) / 0.55) < 1e-12)
  assert.ok(Math.abs(b.coverage - 0.85) < 1e-12) // coverage still counts the dropped method's data
  const two = blendTrimmed({ pe: 10, dcf: 100 }, noGraham) // fewer than 3 valued methods: the plain blend
  assert.deepEqual(two.dropped, [])
  assert.equal(two.fair, blend({ pe: 10, dcf: 100 }, noGraham).fair)
  assert.equal(blendTrimmed({}, noGraham), null)
})
