import test from 'node:test';
import assert from 'node:assert/strict';
import { quarterFacts, instantAt, debtAt, secInputs } from '../engine/sec-facts.js';

// companyfacts-shaped helpers
const f = (start, end, val, o = {}) => ({ start, end, val, form: '10-Q', filed: o.filed ?? end, fy: 2026, fp: 'Q', ...o });
const i = (end, val, o = {}) => ({ end, val, form: '10-Q', filed: o.filed ?? end, ...o });
const ns = (tags) => Object.fromEntries(Object.entries(tags).map(([k, v]) => [k, { units: { USD: v } }]));

test('T2: only 80-100 day periods are quarters; YTD and annual never taken as a quarter', () => {
  const q = quarterFacts(ns({ Revenues: [f('2026-01-01', '2026-03-31', 10), f('2026-01-01', '2026-06-30', 25), f('2026-04-01', '2026-06-30', 15)] }), ['Revenues']);
  assert.deepEqual(q.map(x => [x.end, x.val]), [['2026-03-31', 10], ['2026-06-30', 15]]);
});
test('T2: amended or restated value (later filing) replaces the original', () => {
  const q = quarterFacts(ns({ Revenues: [f('2026-04-01', '2026-06-30', 15, { filed: '2026-08-01' }), f('2026-04-01', '2026-06-30', 14, { form: '10-Q/A', filed: '2026-09-01' })] }), ['Revenues']);
  assert.equal(q.at(-1).val, 14);
});
test('T2: Q4 = annual - (Q1+Q2+Q3) only when all three exist', () => {
  const full = quarterFacts(ns({ Revenues: [
    f('2025-01-01', '2025-03-31', 10), f('2025-04-01', '2025-06-30', 11), f('2025-07-01', '2025-09-30', 12),
    f('2025-01-01', '2025-12-31', 50, { form: '10-K', filed: '2026-02-20', fp: 'FY' })] }), ['Revenues']);
  const q4 = full.at(-1);
  assert.equal(q4.end, '2025-12-31'); assert.equal(q4.val, 17); assert.equal(q4.start, '2025-10-01'); assert.equal(q4.derived, true);
  const gap = quarterFacts(ns({ Revenues: [f('2025-01-01', '2025-03-31', 10), f('2025-07-01', '2025-09-30', 12),
    f('2025-01-01', '2025-12-31', 50, { form: '10-K' })] }), ['Revenues']);
  assert.equal(gap.at(-1).end, '2025-09-30');
});
test('T2: fiscal years not ending in December (NVDA late January)', () => {
  const q = quarterFacts(ns({ Revenues: [f('2025-01-27', '2025-04-27', 1), f('2025-04-28', '2025-07-27', 2), f('2025-07-28', '2025-10-26', 3),
    f('2025-01-27', '2026-01-25', 10, { form: '10-K' })] }), ['Revenues']);
  assert.equal(q.at(-1).val, 4); assert.equal(q.at(-1).start, '2025-10-27');
});
test('T2: forms other than 10-Q/10-K (and amendments) are ignored; non-USD units ignored', () => {
  const q = quarterFacts({ Revenues: { units: { USD: [f('2026-04-01', '2026-06-30', 15, { form: '8-K' })], EUR: [f('2026-04-01', '2026-06-30', 9)] } } }, ['Revenues']);
  assert.equal(q.length, 0);
});
test('instantAt: the value on that exact date, latest filing wins', () => {
  const g = ns({ StockholdersEquity: [i('2026-06-30', 5, { filed: '2026-08-01' }), i('2026-06-30', 6, { filed: '2026-11-01' }), i('2026-03-31', 4)] });
  assert.equal(instantAt(g, ['StockholdersEquity'], '2026-06-30'), 6);
  assert.equal(instantAt(g, ['StockholdersEquity'], '2026-05-31'), null);
});
test('T2b: debt sums lines of the SAME date, never LongTermDebt and its current part twice', () => {
  const d = '2026-06-30';
  assert.equal(debtAt(ns({ LongTermDebt: [i(d, 100)], LongTermDebtCurrent: [i(d, 10)], CommercialPaper: [i(d, 5)] }), d).debt, 105);
  assert.equal(debtAt(ns({ LongTermDebtNoncurrent: [i(d, 90)], LongTermDebtCurrent: [i(d, 10)] }), d).debt, 100);
  assert.equal(debtAt(ns({ DebtLongtermAndShorttermCombinedAmount: [i(d, 120)], LongTermDebt: [i(d, 100)] }), d).debt, 120);
  // non-current without any current line: incomplete, not assumed zero
  assert.equal(debtAt(ns({ LongTermDebtNoncurrent: [i(d, 90)] }), d).debt, null);
  // a stale line from another date does not count as today
  assert.equal(debtAt(ns({ ConvertibleNotesPayable: [i('2025-12-31', 0)] }), d).debt, null);
  // leases are added (A2 default) and listed separately
  const l = debtAt(ns({ LongTermDebt: [i(d, 100)], OperatingLeaseLiability: [i(d, 7)], FinanceLeaseLiability: [i(d, 3)] }), d);
  assert.equal(l.debt, 110); assert.equal(l.parts.leases, 10);
});

const company = (us, dei = {}) => ({ entityName: 'X', facts: { 'us-gaap': us, dei } });
const Q = ['2026-04-01', '2026-06-30'];
test('secInputs: tagged gross interest income, same quarter as revenue', () => {
  const r = secInputs(company(ns({
    Revenues: [f(...Q, 1000)], InvestmentIncomeInterest: [f(...Q, 30)],
    LongTermDebt: [i(Q[1], 200)], DebtCurrent: [i(Q[1], 0)], StockholdersEquity: [i(Q[1], 500)],
  }), { EntityCommonStockSharesOutstanding: { units: { shares: [i('2026-07-25', 100)] } } }), { yieldPct: 5 });
  assert.equal(r.period.end, Q[1]); assert.equal(r.revenue, 1000); assert.equal(r.illicit, 30); assert.equal(r.illicitEstimated, false);
  assert.equal(r.debt, 200); assert.equal(r.bookEquity, 500); assert.equal(r.shares, 100);
});
test('secInputs: interest from an older quarter is never used for the latest one', () => {
  const r = secInputs(company(ns({
    Revenues: [f(...Q, 1000)], InvestmentIncomeInterest: [f('2026-01-01', '2026-03-31', 30)],
    CashAndCashEquivalentsAtCarryingValue: [i('2026-03-31', 400), i(Q[1], 600)],
  })), { yieldPct: 5 });
  assert.equal(r.illicitEstimated, true);
  assert.ok(Math.abs(r.illicit - 600 * 0.05 * 91 / 365) < 1e-9);
});
test('secInputs: no interest tag and no cash data -> illicit missing (never 0)', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 1000)] })), { yieldPct: 5 });
  assert.equal(r.illicit, null);
});
test('secInputs: net "InvestmentIncomeNet" is not used as gross interest', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 1000)], InvestmentIncomeNet: [f(...Q, 30)] })), { yieldPct: 5 });
  assert.equal(r.illicit, null);
});
test('secInputs: debt unknown -> total liabilities as an upper bound, flagged', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 1000)], Liabilities: [i(Q[1], 80)] })), { yieldPct: 5 });
  assert.equal(r.debt, null); assert.equal(r.debtUpperBound, 80);
});
test('secInputs: shares from the cover page, else weighted basic shares of the quarter', () => {
  const r = secInputs(company({ ...ns({ Revenues: [f(...Q, 1000)] }), WeightedAverageNumberOfSharesOutstandingBasic: { units: { shares: [f(...Q, 77)] } } }), { yieldPct: 5 });
  assert.equal(r.shares, 77);
});
test('secInputs: no revenue quarter at all -> nothing to judge', () => {
  assert.equal(secInputs(company(ns({})), { yieldPct: 5 }).period, null);
});
