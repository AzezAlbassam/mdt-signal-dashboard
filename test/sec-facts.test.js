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
  // a short-term line counts in the high reading only (this was "debt 105" until the audit of 2026-11-22: Camden's
  // commercial paper tag held its programme's size, with nothing drawn)
  // (fixtures with LongTermDebt beside its current part carry the noncurrent tag real filers do: without it LongTermDebt
  // may be the noncurrent line, a high reading of its own; fix review 2026-11-22, Halliburton)
  const cp = debtAt(ns({ LongTermDebt: [i(d, 100)], LongTermDebtNoncurrent: [i(d, 90)], LongTermDebtCurrent: [i(d, 10)], CommercialPaper: [i(d, 5)] }), d);
  assert.deepEqual([cp.debt, cp.debtHigh], [100, 105]);
  assert.equal(debtAt(ns({ LongTermDebtNoncurrent: [i(d, 90)], LongTermDebtCurrent: [i(d, 10)] }), d).debt, 100);
  assert.equal(debtAt(ns({ DebtLongtermAndShorttermCombinedAmount: [i(d, 120)], LongTermDebt: [i(d, 100)] }), d).debt, 120);
  // non-current without any current line: incomplete, not assumed zero
  assert.equal(debtAt(ns({ LongTermDebtNoncurrent: [i(d, 90)] }), d).debt, null);
  // a stale line from another date does not count as today (fix review 2026-11-22: this used a zero line with no base,
  // which tested nothing)
  assert.deepEqual((x => [x.debt, x.debtHigh])(debtAt(ns({ LongTermDebt: [i(d, 100)], ConvertibleNotesPayable: [i('2025-12-31', 50)] }), d)), [100, null]);
  // leases are NOT debt (owner's decision 2026-11-21, following Al Rajhi's own list: flynas is compliant with lease
  // liabilities at 54% of its market value); they are still reported separately (this assertion was "debt 110" before)
  const l = debtAt(ns({ LongTermDebt: [i(d, 100)], OperatingLeaseLiability: [i(d, 7)], FinanceLeaseLiability: [i(d, 3)] }), d);
  assert.equal(l.debt, 100); assert.equal(l.parts.leases, 10);
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
test('T4: a latest quarter older than minEnd is never used (APA: 2021 revenue in 2026)', () => {
  const r = secInputs(company(ns({ Revenues: [f('2021-04-01', '2021-06-30', 0)] })), { yieldPct: 5, minEnd: '2026-05-01' });
  assert.equal(r.period, null); assert.equal(r.stale, '2021-06-30');
});

// G6 adversarial review (2026-11-21): every finding gets a test before the fix.
test('G6.1: debt built only from short-term lines is incomplete (BAX, TMUS, ORA, DE)', () => {
  const d = '2026-06-30';
  assert.equal(debtAt(ns({ ShortTermBorrowings: [i(d, 0)], OperatingLeaseLiability: [i(d, 200)] }), d).debt, null);
  assert.equal(debtAt(ns({ CommercialPaper: [i(d, 160)] }), d).debt, null);
  assert.equal(debtAt(ns({ DebtCurrent: [i(d, 17460)] }), d).debt, null);
  // a total that includes current maturities is a long-term line
  const tot = debtAt(ns({ LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities: [i(d, 17700)], CommercialPaper: [i(d, 590)] }), d);
  assert.deepEqual([tot.debt, tot.debtHigh], [17700, 18290]);   // was debt 18290 (short-term lines: high reading, audit 2026-11-22)
  const r = secInputs(company(ns({ Revenues: [f(...Q, 1000)], DebtCurrent: [i(Q[1], 50)], Liabilities: [i(Q[1], 900)] })), { yieldPct: 5 });
  assert.equal(r.debt, null); assert.equal(r.debtUpperBound, 900);
});
test('G6.2: interest = the largest interest figure the company tags (ENPH deposits, GM/SHOP loans, WEN leases)', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 1000)], InvestmentIncomeInterest: [f(...Q, 0)], InterestIncomeDepositsWithFinancialInstitutions: [f(...Q, 58)] })), { yieldPct: 5 });
  assert.equal(r.illicit, 58); assert.equal(r.illicitEstimated, false);
  for (const t of ['InterestAndFeeIncomeLoansConsumer', 'InterestAndFeeIncomeLoansAndLeases', 'SalesTypeAndDirectFinancingLeasesInterestIncome']) {
    assert.equal(secInputs(company(ns({ Revenues: [f(...Q, 1000)], [t]: [f(...Q, 20)] })), { yieldPct: 5 }).illicit, 20, t);
  }
});
// Until the audit of 2026-11-22 loans blocked the cash estimate (this and two G6 rerun tests asserted illicit null):
// Linde's 29M note against 3.9B of cash left it unknown. Now the estimate charges the loans a 20% lending rate.
test('G6.2: the estimate of a company with loans or financing receivables charges them a lending rate', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)], FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss: [i(Q[1], 5000)] })), { yieldPct: 5 });
  assert.equal(r.illicitEstimated, true); assert.ok(Math.abs(r.illicit - (100 * 0.05 * 91 / 365 + 5000 * 0.20 * 91 / 365)) < 1e-9, String(r.illicit));
});
test('G6.6: tags that include more than interest are upper bounds (decide a pass, never a fail)', () => {
  const up = secInputs(company(ns({ Revenues: [f(...Q, 1000)], InterestAndOtherIncome: [f(...Q, 80)] })), { yieldPct: 5 });
  assert.equal(up.illicit, 80); assert.equal(up.illicitEstimated, true);
  // an exact figure above 5% decides even when a bigger upper-bound tag exists
  const ex = secInputs(company(ns({ Revenues: [f(...Q, 1000)], InvestmentIncomeInterest: [f(...Q, 60)], InterestAndOtherIncome: [f(...Q, 90)] })), { yieldPct: 5 });
  assert.equal(ex.illicit, 60); assert.equal(ex.illicitEstimated, false);
  // below 5% the larger (cautious) figure is used for purification
  const lo = secInputs(company(ns({ Revenues: [f(...Q, 1000)], InvestmentIncomeInterest: [f(...Q, 10)], InterestAndOtherIncome: [f(...Q, 30)] })), { yieldPct: 5 });
  assert.equal(lo.illicit, 30); assert.equal(lo.illicitEstimated, true);
});
test('G6.4/5: shares for market value = the smaller sane count; purification uses the cover count', () => {
  const sh = (cover, wavg) => company({ ...ns({ Revenues: [f(...Q, 1000)] }), WeightedAverageNumberOfSharesOutstandingBasic: { units: { shares: [f(...Q, wavg)] } } },
    { EntityCommonStockSharesOutstanding: { units: { shares: [i('2026-07-25', cover)] } } });
  const rev = secInputs(sh(100, 1000), { yieldPct: 5 });          // 1-for-10 reverse split after the quarter
  assert.equal(rev.sharesMV, 100); assert.equal(rev.shares, 100);
  const iss = secInputs(sh(603, 403), { yieldPct: 5 });           // shares issued after the quarter (SAFX)
  assert.equal(iss.sharesMV, 403); assert.equal(iss.shares, 603);
  // two counts 1000x apart and nothing to tell which is right: not judged (changed in the G6 rerun, was "keep the cover")
  const k = secInputs(sh(181311000, 181311), { yieldPct: 5 });
  assert.equal(k.sharesMV, null); assert.equal(k.shares, null);
});
test('G6.5: weighted shares never get a "year minus 3 quarters" Q4', () => {
  const g = { WeightedAverageNumberOfSharesOutstandingBasic: { units: { shares: [f('2025-01-01', '2025-03-31', 10), f('2025-04-01', '2025-06-30', 10), f('2025-07-01', '2025-09-30', 10), f('2025-01-01', '2025-12-31', 10, { form: '10-K' })] } } };
  const r = secInputs(company({ ...ns({ Revenues: [f('2025-10-01', '2025-12-31', 100, { form: '10-K' })] }), ...g }), { yieldPct: 5 });
  assert.equal(r.sharesMV, null);
});
test('G6 rerun: loans under a company tag would count in the estimate (companyfacts carries no company tags: Deere is seen by its flows)', () => {
  const cf = company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)] }));
  cf.facts.de = { FinancingReceivablesNet: { units: { USD: [i(Q[1], 40000)] } } };
  const r = secInputs(cf, { yieldPct: 5 });
  assert.ok(r.illicit / r.revenue > 0.05);   // far above 5%: an estimate cannot fail it, so it stays unknown
});
test('G6 rerun: a share count far from net income / EPS is a unit error (TEM: weighted in thousands)', () => {
  const cf = company({ ...ns({ Revenues: [f(...Q, 1000)], NetIncomeLoss: [f(...Q, -18131100)] }),
    EarningsPerShareBasic: { units: { 'USD/shares': [f(...Q, -0.1)] } },
    WeightedAverageNumberOfSharesOutstandingBasic: { units: { shares: [f(...Q, 181311)] } } });
  const r = secInputs(cf, { yieldPct: 5 });
  assert.equal(r.shares, null); assert.equal(r.sharesMV, null);
});
test('G6 rerun: finance receivables seen only in cash flows count in the estimate (DE)', () => {
  const cf = company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)],
    PaymentsToAcquireFinanceReceivables: [f('2025-11-03', Q[1], 19139)] }));
  assert.ok(Math.abs(secInputs(cf, { yieldPct: 5 }).illicit - (100 * 0.05 * 91 / 365 + 19139 * 0.20 * 91 / 365)) < 1e-9);
});

test('A2 decided: leases out of debt; the liabilities upper bound subtracts known lease liabilities', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 1000)], Liabilities: [i(Q[1], 900)], OperatingLeaseLiability: [i(Q[1], 300)] })), { yieldPct: 5 });
  assert.equal(r.debt, null); assert.equal(r.debtUpperBound, 600); assert.equal(r.debtParts.leases, 300);
  const d = secInputs(company(ns({ Revenues: [f(...Q, 1000)], LongTermDebt: [i(Q[1], 200)], FinanceLeaseLiability: [i(Q[1], 50)] })), { yieldPct: 5 });
  assert.equal(d.debt, 200); assert.equal(d.debtParts.leases, 50);
});

// Fund-screen findings (2026-11-21): each from a real company in the funds
test('funds: a disclosure of receivables SOLD does not block the estimate (AVGO)', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)],
    FinancingReceivableSignificantSales: [i('2025-11-02', 7401)] })), { yieldPct: 5 });
  assert.equal(r.illicitEstimated, true); assert.ok(r.illicit > 0);
});
test('funds: debt tags of AbbVie and Oracle', () => {
  const d = Q[1];
  assert.equal(debtAt(ns({ LongTermDebtAndCapitalLeaseObligations: [i(d, 72230)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 8673)] }), d).debt, 80903);
  assert.equal(debtAt(ns({ LongTermNotesAndLoans: [i(d, 117712)], NotesPayableCurrent: [i(d, 7625)] }), d).debt, 125337);
});
test('funds: total liabilities from liabilities-and-equity minus equity when not tagged (MNST)', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 1000)], LiabilitiesAndStockholdersEquity: [i(Q[1], 11922)], StockholdersEquity: [i(Q[1], 9839)] })), { yieldPct: 5 });
  assert.equal(r.debt, null); assert.equal(r.debtUpperBound, 2083);
});
test('funds: share count from net income / EPS when no count is tagged (Visa, several classes)', () => {
  const cf = company({ ...ns({ Revenues: [f(...Q, 1000)], NetIncomeLoss: [f(...Q, 5000)] }), EarningsPerShareBasic: { units: { 'USD/shares': [f(...Q, 2.5)] } } });
  const r = secInputs(cf, { yieldPct: 5 });
  assert.equal(r.shares, 2000); assert.equal(r.sharesMV, 2000); assert.equal(r.sharesSource, 'implied');
});
test('funds: trade receivables (Accounts...) do not block the estimate; real loans still do', () => {
  const base = { Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)] };
  assert.ok(secInputs(company(ns({ ...base, AccountsNotesAndLoansReceivableNetCurrent: [i(Q[1], 500)] })), { yieldPct: 5 }).illicit > 0); // PEP, CVX
  // INTU buys loans: they are charged a lending rate (was illicit null before the audit of 2026-11-22)
  assert.ok(Math.abs(secInputs(company(ns({ ...base, FinancingReceivableExcludingAccruedInterestPurchase: [f(...Q, 300)] })), { yieldPct: 5 }).illicit - (100 * 0.05 * 91 / 365 + 300 * 0.20 * 91 / 365)) < 1e-9);
});
test('funds: revenue of investment banks (net of interest expense) and a plain Cash tag', () => {
  assert.equal(secInputs(company(ns({ RevenuesNetOfInterestExpense: [f(...Q, 900)] })), { yieldPct: 5 }).revenue, 900);
  const r = secInputs(company(ns({ Revenues: [f(...Q, 1000)], Cash: [i(Q[1], 200)] })), { yieldPct: 4 });
  assert.equal(r.illicitEstimated, true); assert.ok(r.illicit > 0);
});
test('debt: a short-term line equal to the current portion of long-term debt is the same money (IBM), counted once', () => {
  const d = Q[1];
  // IBM 10-Q 2026-09-30: noncurrent 56.804B, current portion 7.009B, "short-term debt" 7.013B (includes that portion)
  // (both readings: the high one too, fix review 2026-11-22: a mutation adding the line again left every test green
  // and would have made IBM, and with it SPUS, «ما ينحكم»)
  const ibm1 = debtAt(ns({ LongTermDebtNoncurrent: [i(d, 56804)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 7009)], ShortTermBorrowings: [i(d, 7013)] }), d);
  assert.deepEqual([ibm1.debt, ibm1.debtHigh], [56804 + 7009, null]);
  // LongTermDebt includes the current portion; a short-term line equal to it adds nothing
  const ibm2 = debtAt(ns({ LongTermDebt: [i(d, 63813)], LongTermDebtNoncurrent: [i(d, 56804)], LongTermDebtCurrent: [i(d, 7009)], ShortTermBorrowings: [i(d, 7013)] }), d);
  assert.deepEqual([ibm2.debt, ibm2.debtHigh], [63813, null]);
  // a different amount (commercial paper beside the current portion) counts in the high reading (was "debt 102")
  const p2 = debtAt(ns({ LongTermDebt: [i(d, 100)], LongTermDebtNoncurrent: [i(d, 90)], LongTermDebtCurrent: [i(d, 10)], CommercialPaper: [i(d, 2)] }), d);
  assert.deepEqual([p2.debt, p2.debtHigh], [100, 102]);
});

// ---- Independent review of the funds tab, 2026-11-22 (post-hoc fixes; progress/SHARIAH-PLAN.md part M12) ----
test('review: noncurrent + DebtCurrent counts (Cisco: commercial paper only inside DebtCurrent); a combined figure can stand below it (Valero)', () => {
  const d = Q[1];
  // Cisco 2026-10-24: LongTermDebt 21,375 (incl. 2,001 current), noncurrent 19,374, DebtCurrent 10,425 (incl. CP 8,424)
  assert.equal(debtAt(ns({ LongTermDebt: [i(d, 21375)], LongTermDebtNoncurrent: [i(d, 19374)], LongTermDebtCurrent: [i(d, 2001)], DebtCurrent: [i(d, 10425)] }), d).debt, 29799);
  // KDP: noncurrent + LongTermDebtCurrent 2,840 misses the paper and the term loan inside DebtCurrent 7,270
  assert.equal(debtAt(ns({ LongTermDebtNoncurrent: [i(d, 21595)], LongTermDebtCurrent: [i(d, 2840)], DebtCurrent: [i(d, 7270)] }), d).debt, 21595 + 7270);
  // LongTermDebt plus the part of DebtCurrent that is not its own current portion
  assert.equal(debtAt(ns({ LongTermDebt: [i(d, 100)], LongTermDebtCurrent: [i(d, 10)], DebtCurrent: [i(d, 25)] }), d).debt, 115);
  // QCOM: a combined principal below the balance sheet's two lines
  assert.equal(debtAt(ns({ DebtLongtermAndShorttermCombinedAmount: [i(d, 14613)], LongTermDebtNoncurrent: [i(d, 12620)], DebtCurrent: [i(d, 2492)] }), d).debt, 15112);
  // other short-term lines: securitisation (Corpay), lines of credit (Global Payments), other borrowings (Charter).
  // These assertions were "debt 107 / 104 / 103" until the external audit (2026-11-22) showed such a line can sit
  // inside the current portion (Corpay's 2,300 securitisation is part of its 5,161): it counts in the high reading.
  const two = (t, x) => debtAt(ns({ LongTermDebt: [i(d, 100)], LongTermDebtNoncurrent: [i(d, 90)], LongTermDebtCurrent: [i(d, 10)], [t]: [i(d, x)] }), d);
  assert.deepEqual([two('SecuredDebtCurrent', 7).debt, two('SecuredDebtCurrent', 7).debtHigh], [100, 107]);
  assert.deepEqual([two('LinesOfCreditCurrent', 4).debt, two('LinesOfCreditCurrent', 4).debtHigh], [100, 104]);
  assert.deepEqual([two('OtherShortTermBorrowings', 3).debt, two('OtherShortTermBorrowings', 3).debtHigh], [100, 103]);
  assert.deepEqual([two('SecuredDebtCurrent', 17).debt, two('SecuredDebtCurrent', 17).debtHigh], [100, 117]);
});
test('review: the DebtCurrent rule takes a tagged current finance lease out where the lines show it inside (A2: Micron, Valero)', () => {
  const d = Q[1];
  // Micron 2026-09-03: LongTermDebt 2,792 is all of its debt; "current debt" 491 is its current finance lease, and the
  // 4,688 long-term line bundles 1,896 of finance leases
  assert.equal(debtAt(ns({ LongTermDebt: [i(d, 2792)], DebtCurrent: [i(d, 491)], FinanceLeaseLiabilityCurrent: [i(d, 491)],
    LongTermDebtAndCapitalLeaseObligations: [i(d, 4688)], FinanceLeaseLiabilityNoncurrent: [i(d, 1896)] }), d).debt, 2792);
  // Valero: debt 8,579; the 10,012 and 989 lines carry finance leases it does not tag separately
  assert.equal(debtAt(ns({ DebtLongtermAndShorttermCombinedAmount: [i(d, 8579)], DebtCurrent: [i(d, 989)], LongTermDebtAndCapitalLeaseObligations: [i(d, 10012)] }), d).debt, 8579);
  // KDP: this said "DebtCurrent 7,270 holds 151 of current finance leases" until the audit of 2026-11-22 read its 10-Q:
  // 7,270 = paper 1,242 + term loan 3,188 + notes 2,840, no leases. The current finance lease comes out of DebtCurrent
  // only when what is left equals the other current debt lines (Micron: 491 - 491 = 0).
  assert.equal(debtAt(ns({ LongTermDebtNoncurrent: [i(d, 21595)], LongTermDebtCurrent: [i(d, 2840)], DebtCurrent: [i(d, 7270)], FinanceLeaseLiabilityCurrent: [i(d, 151)],
    CommercialPaper: [i(d, 1242)] }), d).debt, 21595 + 7270);
  // Corteva: LongTermDebt 3,458, nothing current in it, DebtCurrent 3,988 of short-term borrowings
  assert.equal(debtAt(ns({ LongTermDebt: [i(d, 3458)], LongTermDebtCurrent: [i(d, 0)], DebtCurrent: [i(d, 3988)] }), d).debt, 7446);
});
const Q0 = ['2026-01-01', '2026-03-31'];
test('review: the interest estimate covers debt securities tagged only as a total (KLA: 3.2B available for sale)', () => {
  const r = secInputs(company(ns({
    Revenues: [f(...Q0, 900), f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q0[1], 100), i(Q[1], 100)],
    AvailableForSaleSecuritiesDebtSecurities: [i(Q0[1], 300), i(Q[1], 300)],
  })), { yieldPct: 5 });
  assert.equal(r.illicitEstimated, true); assert.ok(Math.abs(r.illicit - 400 * 0.05 * 91 / 365) < 1e-9);
});
test('review: a split restates earlier share counts; the ratio and the window it falls in (CrowdStrike 4:1)', () => {
  // This test was "a share count 1.5x or more away from the previous quarter flags a split" until the audit of
  // 2026-11-22 showed IPOs and share issues jump too (Cerebras 1.58x, SpaceX 2.04x) without restating anything.
  const w = (start, end, val, filed, accn) => ({ start, end, val, form: '10-Q', filed, accn });
  const sh = (rows) => company({ ...ns({ Revenues: [f(...Q0, 900), f(...Q, 1000)] }), WeightedAverageNumberOfSharesOutstandingBasic: { units: { shares: rows } } });
  // the 2026-08-15 filing gives last year's quarter as 1,016 where its own filing said 254: a 4:1 split in between
  const crwd = secInputs(sh([w('2025-04-01', '2025-06-30', 254, '2025-08-14', 'a'), w(...Q0, 255, '2026-05-01', 'b'),
    w(...Q, 1019, '2026-08-15', 'c'), w('2025-04-01', '2025-06-30', 1016, '2026-08-15', 'c')]), { yieldPct: 5 });
  assert.ok(Math.abs(crwd.splitRatio - 1016 / 254) < 1e-12); assert.deepEqual(crwd.splitWindow, ['2025-08-14', '2026-08-15']);
  // reverse 1:10 split
  const rev = secInputs(sh([w('2025-04-01', '2025-06-30', 1000, '2025-08-14', 'a'), w('2025-04-01', '2025-06-30', 100, '2026-08-15', 'c'), w(...Q, 101, '2026-08-15', 'c')]), { yieldPct: 5 });
  assert.ok(Math.abs(rev.splitRatio - 0.1) < 1e-12);
  // an IPO or a share issue: the count jumps, nothing earlier is restated (Cerebras, SpaceX): no split
  const ipo = secInputs(sh([w('2025-04-01', '2025-06-30', 54, '2025-11-12', 'a'), w(...Q0, 54, '2026-05-01', 'b'), w(...Q, 85, '2026-08-15', 'c'),
    w('2025-04-01', '2025-06-30', 54, '2026-08-15', 'c')]), { yieldPct: 5 });
  assert.equal(ipo.splitRatio, null);
  // one quarter in thousands restated to units (1000x: Geron, Iovance) is a unit error, not a split; 50:1 is kept
  const unit = secInputs(sh([w('2025-04-01', '2025-06-30', 1, '2025-08-14', 'a'), w('2025-04-01', '2025-06-30', 1000, '2026-08-15', 'c'), w(...Q, 1000, '2026-08-15', 'c')]), { yieldPct: 5 });
  assert.equal(unit.splitRatio, null);
  const fifty = secInputs(sh([w('2025-04-01', '2025-06-30', 10, '2025-08-14', 'a'), w('2025-04-01', '2025-06-30', 500, '2026-08-15', 'c'), w(...Q, 500, '2026-08-15', 'c')]), { yieldPct: 5 });
  assert.equal(fifty.splitRatio, 50);
  // the window is the tightest the filings allow: after the last filing still unrestated, by the first restated one
  // (Palo Alto 2:1 in December 2024; its 10-K of 2026-09-10 restates FY2024 again, which must not stretch the window)
  const panw = secInputs(sh([w('2024-08-01', '2024-10-31', 330, '2024-11-20', 'a'), w('2024-08-01', '2024-10-31', 660, '2025-11-19', 'd'),
    w('2023-11-01', '2024-01-31', 324, '2024-02-20', 'b'), w('2023-11-01', '2024-01-31', 324, '2024-05-20', 'b2'), w('2023-11-01', '2024-01-31', 648, '2025-02-18', 'c'),
    w('2023-11-01', '2024-01-31', 648, '2026-09-10', 'e'), w(...Q, 670, '2026-08-15', 'f')]), { yieldPct: 5 });
  assert.equal(panw.splitRatio, 2); assert.deepEqual(panw.splitWindow, ['2024-11-20', '2025-02-18']);
  // the threshold: a 3:2 split (1.5x) and a 1.6x restatement count, a 1.4x restatement (a correction) does not
  const k = (x) => secInputs(sh([w('2025-04-01', '2025-06-30', 100, '2025-08-14', 'a'), w('2025-04-01', '2025-06-30', x, '2026-08-15', 'c'), w(...Q, x, '2026-08-15', 'c')]), { yieldPct: 5 }).splitRatio;
  assert.equal(k(150), 1.5); assert.equal(k(160), 1.6); assert.equal(k(140), null);
});

test('audit: splits of the same ratio years apart stay apart, and the latest is the one (Monster 2:1 in 2012, 2023 and 2026, 3:1 in 2016)', () => {
  // Found while checking the fix branch: one group per ratio merged Monster's three 2:1 splits into a window that ended
  // before it began, so the 2016 3:1 split was taken and VOO's and XLP's pre-split prices were not divided (half the
  // purification). Each step between two filings of a period is one split; steps of one split share a window.
  const w = (start, end, val, filed) => ({ start, end, val, form: '10-Q', filed });
  const sh = (rows) => company({ ...ns({ Revenues: [f(...Q0, 900), f(...Q, 1000)] }), WeightedAverageNumberOfSharesOutstandingBasic: { units: { shares: rows } } });
  const mnst = secInputs(sh([
    w('2011-07-01', '2011-09-30', 87, '2011-11-09'), w('2011-07-01', '2011-09-30', 174, '2012-11-09'),
    w('2016-07-01', '2016-09-30', 190, '2016-11-07'), w('2016-07-01', '2016-09-30', 570, '2017-11-09'),
    w('2022-07-01', '2022-09-30', 530, '2022-11-04'), w('2022-07-01', '2022-09-30', 1060, '2023-11-06'),
    w('2025-07-01', '2025-09-30', 976.6, '2025-11-07'), w('2025-07-01', '2025-09-30', 1953.2, '2026-11-06'), w(...Q, 1958.6, '2026-11-06')]), { yieldPct: 5 });
  assert.ok(Math.abs(mnst.splitRatio - 2) < 1e-9, String(mnst.splitRatio)); assert.deepEqual(mnst.splitWindow, ['2025-11-07', '2026-11-06']);
  // a period restated by two splits (a five-year table) gives each split its own step, not their product
  const two = secInputs(sh([w('2020-01-01', '2020-03-31', 100, '2020-05-01'), w('2020-01-01', '2020-03-31', 200, '2022-05-01'),
    w('2020-01-01', '2020-03-31', 400, '2026-08-15'), w('2025-04-01', '2025-06-30', 210, '2025-08-14'), w('2025-04-01', '2025-06-30', 420, '2026-08-15'),
    w(...Q, 425, '2026-08-15')]), { yieldPct: 5 });
  assert.equal(two.splitRatio, 2); assert.deepEqual(two.splitWindow, ['2025-08-14', '2026-08-15']);
});

// ---- Fix-branch review, 2026-11-22 (post-hoc; progress/SHARIAH-PLAN.md part M15) ----
test('fix review: a separate securities-interest line adds to the high reading (Realty Income: 32.2M of loan interest + 105.0M on loans and preferred equity)', () => {
  const o = secInputs(company(ns({ Revenues: [f(...Q, 1621.582)], InterestAndFeeIncomeLoansAndLeases: [f(...Q, 32.248)], InterestAndDividendIncomeSecurities: [f(...Q, 104.982)] })), { yieldPct: 5 });
  assert.equal(o.illicit, 32.248);
  assert.ok(Math.abs(o.illicitHigh - (32.248 + 104.982)) < 1e-9, String(o.illicitHigh));   // 8.46%: R3 open, not a 1.99% pass
  // tagged alone, it floors the estimate like published investment income
  const only = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)], InterestAndDividendIncomeSecurities: [f(...Q, 80)] })), { yieldPct: 5 });
  assert.equal(only.illicitEstimated, true); assert.equal(only.illicit, 80);
});
test('fix review: interest joins the revenue only when it is 10% of it or more, so the total never turns a fail into a pass (Duolingo)', () => {
  // Duolingo's own interest income (InterestIncomeOperating, below its operating income) had been added to its revenue.
  // A non-lender at 5.2% would have passed at 4.94% that way. From 10% up the share is above 9% either way: a fail.
  const contract = (v) => ({ RevenueFromContractWithCustomerExcludingAssessedTax: [f(...Q, v)] });
  const duol = secInputs(company(ns({ ...contract(309.007), InterestIncomeOperating: [f(...Q, 12.426)] })), { yieldPct: 5 });
  assert.equal(duol.revenue, 309.007);
  const near = secInputs(company(ns({ ...contract(1000), InterestIncomeOperating: [f(...Q, 52)] })), { yieldPct: 5 });
  assert.equal(near.revenue, 1000);   // 5.2%: a fail, not 4.94%
  const axp = secInputs(company(ns({ ...contract(11232), InterestAndFeeIncomeLoansAndLeases: [f(...Q, 6387)] })), { yieldPct: 5 });
  assert.equal(axp.revenue, 11232 + 6387);
  const ibkr = secInputs(company(ns({ ...contract(690), InterestIncomeOperating: [f(...Q, 2433)] })), { yieldPct: 5 });   // a broker's margin interest
  assert.equal(ibkr.revenue, 690 + 2433);
});
test('fix review: the published total interest is kept for purifying a fail (KeyCorp, Goldman Sachs); exact lines are not added up for it (SoFi tags its total and its parts)', () => {
  const key = secInputs(company(ns({ Revenues: [f(...Q, 2054)], InterestIncomeOperating: [f(...Q, 107)], InterestAndDividendIncomeOperating: [f(...Q, 2133)] })), { yieldPct: 5 });
  assert.equal(key.illicit, 107); assert.equal(key.illicitEstimated, false); assert.equal(key.illicitPublished, 2133);
  const gs = secInputs(company(ns({ Revenues: [f(...Q, 15180)], InterestAndFeeIncomeLoansAndLeases: [f(...Q, 3760)], InterestAndDividendIncomeOperating: [f(...Q, 22793)] })), { yieldPct: 5 });
  assert.equal(gs.illicitPublished, 22793);
  // SoFi's 1,343.2 of interest income is its loans' 1,260.9 plus 82.3 of other interest, all three tagged: adding the
  // lines would purify twice its interest (so would Raymond James' 994 + 736 and State Street's 2,916 + 748)
  const sofi = secInputs(company(ns({ Revenues: [f(...Q, 1506.6)], InterestIncomeOperating: [f(...Q, 1343.2)], InterestAndFeeIncomeLoansAndLeases: [f(...Q, 1260.9)],
    InterestIncomeOther: [f(...Q, 82.3)] })), { yieldPct: 5 });
  assert.equal(sofi.illicit, 1343.2); assert.equal(sofi.illicitPublished, null);
  // one line only: nothing to add
  assert.equal(secInputs(company(ns({ Revenues: [f(...Q, 1000)], InvestmentIncomeInterest: [f(...Q, 10)] })), { yieldPct: 5 }).illicitPublished, null);
});
test('fix review: the high reading of a tagged figure keeps its loan candidate (Cisco: a combined tag plus loans at the lending rate)', () => {
  // mutation M10 (dropping "illicit + loans") survived every test: Cisco's purification would fall 35% unnoticed
  const csco = secInputs(company(ns({ Revenues: [f(...Q, 14670)], InvestmentIncomeInterestAndDividend: [f(...Q, 234)],
    NotesAndLoansReceivableNetCurrent: [i(Q[1], 3623)], NotesAndLoansReceivableNetNoncurrent: [i(Q[1], 5118)] })), { yieldPct: 5 });
  assert.ok(Math.abs(csco.illicitHigh - (234 + (3623 + 5118) * 0.20 * 91 / 365)) < 1e-6, String(csco.illicitHigh));
});
test('fix review: a loan balance older than 400 days is not the book; unexplained current assets earn the corporate yield in the high reading', () => {
  const old = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)], NotesAndLoansReceivableNetCurrent: [i('2025-03-31', 5000)] })), { yieldPct: 5 });
  assert.equal(old.estimate.loans, undefined);
  // ADP-like: 1,000 of current assets no tagged line explains, beside a tagged interest line of 10
  const adp = secInputs(company(ns({ Revenues: [f(...Q0, 1000), f(...Q, 1000)], InvestmentIncomeInterest: [f(...Q, 10)], AssetsCurrent: [i(Q0[1], 1100), i(Q[1], 1100)],
    CashAndCashEquivalentsAtCarryingValue: [i(Q0[1], 100), i(Q[1], 100)] })), { yieldPct: 5 });
  assert.ok(Math.abs(adp.illicitHigh - (10 + 1000 * 0.05 * 91 / 365)) < 1e-9, String(adp.illicitHigh));
});

test('fix review: LongTermDebt on the noncurrent line beside its current maturities, with no noncurrent tag, is in the high reading (Halliburton 7,072 + 90; Coupang)', () => {
  const d = Q[1];
  const hal = debtAt(ns({ LongTermDebt: [i(d, 7072)], LongTermDebtCurrent: [i(d, 90)] }), d);
  assert.deepEqual([hal.debt, hal.debtHigh], [7072, 7162]);
  const cpng = debtAt(ns({ LongTermDebt: [i(d, 654)], LongTermDebtCurrent: [i(d, 119)], ShortTermBorrowings: [i(d, 988)] }), d);
  assert.deepEqual([cpng.debt, cpng.debtHigh], [654, 1761]);
});
test('final check: LongTermDebt that another tagged line plus the current portion makes up, or that is the current portion, already holds it (Conagra, Sarepta, Fusemachines)', () => {
  const d = Q[1];
  // Conagra: senior notes 6,940.1 + current installments 787.5 = its LongTermDebt 7,730 (the high reading had 8,550)
  const cag = debtAt(ns({ LongTermDebt: [i(d, 7730)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 787.5)], SeniorLongTermNotes: [i(d, 6940.1)], ShortTermBorrowings: [i(d, 32.5)] }), d);
  assert.deepEqual([cag.debt, cag.debtHigh], [7730, 7762.5]);
  const srpt = debtAt(ns({ LongTermDebt: [i(d, 857.4)], LongTermDebtCurrent: [i(d, 158.0)], LongTermLoansPayable: [i(d, 699.4)] }), d);
  assert.deepEqual([srpt.debt, srpt.debtHigh], [857.4, null]);
  const fuse = debtAt(ns({ LongTermDebt: [i(d, 1.545)], LongTermDebtCurrent: [i(d, 1.545)] }), d);
  assert.deepEqual([fuse.debt, fuse.debtHigh], [1.545, null]);
  // a total derived from the bundled tag with current maturities is no noncurrent line either (Air Products: no 18,700.5)
  const apd = debtAt(ns({ LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities: [i(d, 17778.8)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 921.7)],
    ShortTermBorrowings: [i(d, 77)] }), d);
  assert.ok(Math.abs(apd.debt - 17778.8) < 1e-9 && Math.abs(apd.debtHigh - 17855.8) < 1e-9, JSON.stringify(apd));
});
test('final check: the debt total less its finance leases may take the pair plus the short-term lines in the low reading (Lennox: 1,550.3 with its 455.1 of commercial paper)', () => {
  const d = Q[1];
  const lii = debtAt(ns({ DebtAndCapitalLeaseObligations: [i(d, 1621.4)], LongTermDebtAndCapitalLeaseObligations: [i(d, 847.1)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 319.2)],
    FinanceLeaseLiabilityCurrent: [i(d, 19.6)], FinanceLeaseLiabilityNoncurrent: [i(d, 51.5)], CommercialPaper: [i(d, 455.1)] }), d);
  assert.ok(Math.abs(lii.debt - 1550.3) < 1e-9, String(lii.debt)); assert.equal(lii.debtHigh, null);
});
test('final check: a debt line equal to its lease-bundled twin holds the tagged finance leases too (Honeywell, Campbell, Iron Mountain)', () => {
  const d = Q[1];
  // Honeywell: LongTermDebt 14,169 = 10,386 + 3,783 of "debt and finance leases"; finance leases 72 (29 current)
  const hon = debtAt(ns({ LongTermDebt: [i(d, 14169)], LongTermDebtAndCapitalLeaseObligations: [i(d, 10386)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 3783)],
    FinanceLeaseLiability: [i(d, 72)], FinanceLeaseLiabilityCurrent: [i(d, 29)], FinanceLeaseLiabilityNoncurrent: [i(d, 43)], ShortTermBorrowings: [i(d, 2424)] }), d);
  assert.deepEqual([hon.debt, hon.debtHigh], [14097, 16521]);
  // Campbell: the combined 7,137 = DebtCurrent 977 + the bundled 6,160; finance leases 84 (33 current)
  const cpb = debtAt(ns({ DebtLongtermAndShorttermCombinedAmount: [i(d, 7137)], DebtCurrent: [i(d, 977)], LongTermDebtAndCapitalLeaseObligations: [i(d, 6160)],
    FinanceLeaseLiability: [i(d, 84)], FinanceLeaseLiabilityCurrent: [i(d, 33)], FinanceLeaseLiabilityNoncurrent: [i(d, 51)], CommercialPaper: [i(d, 373)] }), d);
  assert.deepEqual([cpb.debt, cpb.debtHigh], [7053, 7426]);
  // Iron Mountain tags its bundled lines under the plain tags too: 16,739.3 + 1,232.9 hold 499.1 + 71.9 of leases
  const irm = debtAt(ns({ LongTermDebt: [i(d, 17972.2)], LongTermDebtNoncurrent: [i(d, 16739.3)], LongTermDebtCurrent: [i(d, 1232.9)],
    LongTermDebtAndCapitalLeaseObligations: [i(d, 16739.3)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 1232.9)],
    FinanceLeaseLiabilityCurrent: [i(d, 71.9)], FinanceLeaseLiabilityNoncurrent: [i(d, 499.1)] }), d);
  assert.ok(Math.abs(irm.debt - 17401.2) < 1e-6, String(irm.debt)); assert.equal(irm.debtHigh, null);
  // near is not equal: NRG's LongTermDebt 23,052 is 0.6% above its bundled lines and is their total less the 45 of leases
  const nrg = debtAt(ns({ LongTermDebt: [i(d, 23052)], LongTermDebtAndCapitalLeaseObligations: [i(d, 21844)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 1079)],
    LongTermDebtCurrent: [i(d, 1079)], DebtAndCapitalLeaseObligations: [i(d, 23097)], FinanceLeaseLiability: [i(d, 45)] }), d);
  assert.deepEqual([nrg.debt, nrg.debtHigh], [23052, null]);
  // a plain line with no bundled twin keeps what it holds (Solventum: its 206 of finance leases are a line of their own)
  const solv = debtAt(ns({ LongTermDebtNoncurrent: [i(d, 4561)], DebtCurrent: [i(d, 507)], DebtLongtermAndShorttermCombinedAmount: [i(d, 5068)], FinanceLeaseLiabilityNoncurrent: [i(d, 206)] }), d);
  assert.deepEqual([solv.debt, solv.debtHigh], [5068, null]);
});
test('final check: the debt rules each mutation of the fix review left untested (Occidental, M&T, Onto)', () => {
  const d = Q[1];
  // LongTermDebt below a noncurrent line that holds finance leases is the lease-free total, not another noncurrent line
  const oxy = debtAt(ns({ LongTermDebt: [i(d, 1000)], LongTermDebtNoncurrent: [i(d, 1050)], LongTermDebtCurrent: [i(d, 50)], FinanceLeaseLiabilityNoncurrent: [i(d, 100)] }), d);
  assert.deepEqual([oxy.debt, oxy.debtHigh], [1000, 1100]);
  // a credit line equal to a short-term line is that line (M&T: 6,300 beside 6,373 of short-term borrowings)
  const mtb = debtAt(ns({ LongTermDebt: [i(d, 13648)], ShortTermBorrowings: [i(d, 6373)], LineOfCredit: [i(d, 6300)] }), d);
  assert.deepEqual([mtb.debt, mtb.debtHigh], [13648, 20021]);
  // convertible notes within 2% of the whole figure are that figure (Onto: 1,473.2 carried of 1,500 face)
  const onto = debtAt(ns({ LongTermDebt: [i(d, 1500)], ConvertibleLongTermNotesPayable: [i(d, 1473.2)] }), d);
  assert.deepEqual([onto.debt, onto.debtHigh], [1500, null]);
});
test('fix review: a line of credit under us-gaap LineOfCredit is read like a long-term one (EastGroup: 194.7 of bank credit facilities beside 1,611.9 of notes)', () => {
  const d = Q[1];
  const egp = debtAt(ns({ LongTermDebt: [i(d, 1611.864)], LineOfCredit: [i(d, 194.692)] }), d);
  assert.equal(egp.debt, 1611.864); assert.ok(Math.abs(egp.debtHigh - 1806.556) < 1e-9, String(egp.debtHigh));
});
test('fix review: a finance lease tagged only as a total comes out of the bundled lines (A2: Waste Management, UPS, Murphy Oil)', () => {
  const d = Q[1];
  // WM: "long-term debt and finance leases" 21,846 + 1,524 current, finance leases 1,630: 21,740 (the panel said the 1,630
  // were not counted while all of it was inside the 23,370)
  const wm = debtAt(ns({ LongTermDebtAndCapitalLeaseObligations: [i(d, 21846)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 1524)], FinanceLeaseLiability: [i(d, 1630)] }), d);
  assert.deepEqual([wm.debt, wm.debtHigh], [21740, null]);
  // UPS: 25,121 noncurrent with leases, DebtCurrent 957 holding the current lease, total 26,078 with 1,467 of finance leases
  const ups = debtAt(ns({ LongTermDebtAndCapitalLeaseObligations: [i(d, 25121)], DebtCurrent: [i(d, 957)], DebtAndCapitalLeaseObligations: [i(d, 26078)],
    FinanceLeaseLiability: [i(d, 1467)] }), d);
  assert.deepEqual([ups.debt, ups.debtHigh], [24611, null]);
  // Murphy: LongTermDebt 1,539.6 is the lease-free total; the bundled 1,623.1 + 11.2 hold 94.7 of leases (all its current 11.2)
  const mur = debtAt(ns({ LongTermDebt: [i(d, 1539.6)], LongTermDebtAndCapitalLeaseObligations: [i(d, 1623.1)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 11.2)],
    FinanceLeaseLiability: [i(d, 94.7)] }), d);
  assert.ok(Math.abs(mur.debt - 1539.6) < 1e-9, String(mur.debt)); assert.equal(mur.debtHigh, null);
  // a bundled current line loses its tagged current finance lease
  assert.equal(debtAt(ns({ LongTermDebtNoncurrent: [i(d, 1000)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 409)], FinanceLeaseLiabilityCurrent: [i(d, 5)] }), d).debt, 1404);
  // only the noncurrent part of the total comes out of the noncurrent line (Charles River: 9.7 of which 1.0 is current)
  const crl = debtAt(ns({ LongTermDebtAndCapitalLeaseObligations: [i(d, 2443.5)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 3.1)], LongTermDebtCurrent: [i(d, 2.1)],
    FinanceLeaseLiability: [i(d, 9.7)], FinanceLeaseLiabilityCurrent: [i(d, 1.0)] }), d);
  assert.ok(Math.abs(crl.debt - 2436.9) < 1e-9, String(crl.debt)); assert.equal(crl.debtHigh, null);
});
test('final check: a lease total another filing contradicts comes out of the low reading only (Waste Management: 1,284 at 2025-12-31 in its 10-Q, 563 of leases in its 10-K)', () => {
  // WM's 10-Q tags its debt line "Financing leases and other" as FinanceLeaseLiability; its 10-K gave 563 of leases on
  // that date, so about 720 of the line are other debt. The panel had called all 1,630 leases.
  const d = Q[1], ye = '2025-12-31';
  const wm = (fl) => debtAt(ns({ LongTermDebtAndCapitalLeaseObligations: [i(d, 21846)], LongTermDebtCurrent: [i(d, 1524)], DebtCurrent: [i(d, 1524)],
    LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities: [i(d, 23370)], FinanceLeaseLiability: fl }), d);
  const r = wm([i(d, 1630), i(ye, 563, { form: '10-K', filed: '2026-02-12' }), i(ye, 1284, { filed: '2026-10-28' })]);
  assert.deepEqual([r.debt, r.debtHigh], [21740, 23370]);
  assert.equal(r.parts.leaseDoubt, 1630);   // the page says this line may hold other debt, not "leases, not counted"
  assert.equal(wm([i(d, 1630)]).parts.leaseDoubt, undefined);
  // the same total that every filing agrees on comes out of both readings (UPS, Murphy, Charles River above)
  assert.deepEqual((x => [x.debt, x.debtHigh])(wm([i(d, 1630), i(ye, 1284, { form: '10-K', filed: '2026-02-12' }), i(ye, 1284, { filed: '2026-10-28' })])), [21740, null]);
  // a contradiction more than 400 days old says nothing about today's line (Murphy Oil's 2020 figures)
  assert.deepEqual((x => [x.debt, x.debtHigh])(wm([i(d, 1630), i('2020-12-31', 7, { form: '10-K', filed: '2021-02-20' }), i('2020-12-31', 0, { filed: '2021-11-01' })])), [21740, null]);
});
test('fix review: the high reading counts no line twice: LongTermDebt that holds its current portion, short lines inside DebtCurrent, a convertible that is the whole figure (Hubbell, Boeing, Tyler)', () => {
  const d = Q[1];
  // Hubbell: LongTermDebt 4,805.9 holds its current 299.5; DebtCurrent 613.8 = that + paper 313 + 1.3: 5,120.2 (was 5,734)
  const hubb = debtAt(ns({ LongTermDebt: [i(d, 4805.9)], LongTermDebtNoncurrent: [i(d, 4506.4)], DebtCurrent: [i(d, 613.8)], CommercialPaper: [i(d, 313)],
    OtherShortTermBorrowings: [i(d, 1.3)] }), d);
  assert.ok(Math.abs(hubb.debt - 5120.2) < 1e-9, String(hubb.debt)); assert.equal(hubb.debtHigh, null);
  // Boeing: 41,351 + 4,569 = 45,920 (LongTermDebt 45,606 is its total at another measure): no second reading of 50,175
  const ba = debtAt(ns({ LongTermDebt: [i(d, 45606)], LongTermDebtNoncurrent: [i(d, 41351)], DebtCurrent: [i(d, 4569)] }), d);
  assert.deepEqual([ba.debt, ba.debtHigh], [45920, null]);
  // Tyler: its only debt is its convertible notes, which are also its combined figure
  const tyl = debtAt(ns({ DebtLongtermAndShorttermCombinedAmount: [i(d, 1410.11)], ConvertibleDebtNoncurrent: [i(d, 1410.11)] }), d);
  assert.deepEqual([tyl.debt, tyl.debtHigh], [1410.11, null]);
  // Adobe (LongTermDebt is its noncurrent line, no noncurrent tag) keeps its high reading
  assert.deepEqual((x => [x.debt, x.debtHigh])(debtAt(ns({ LongTermDebt: [i(d, 4766)], DebtCurrent: [i(d, 1597)] }), d)), [4766, 6363]);
});
test('final check (post-hoc): convertible notes are interest-bearing debt, except notes the filing shows at 0.00%; an unnamed credit line is not debt for sure (Akamai, BlackLine, Toll Brothers, Ironwood, Dropbox)', () => {
  // This test was "convertible notes that are the only debt prove a fail" (0cbdb9c), then "prove no fail" (first fix of
  // the final check, 2026-11-22) until its review showed that rule unjudged BlackLine, PagerDuty, Five9, PacBio and
  // WhiteFiber, whose notes carry coupons. Only notes the filing shows at 0.00% are in question (the owner's decision,
  // A4): data/shariah/zero-coupon.json lists them, and they stay in the high reading. us-gaap LineOfCredit can be someone
  // else's borrowing (Toll Brothers' 2,507.7 is its joint ventures'). The liabilities bound is the pass test.
  const akamTags = ns({ Revenues: [f(...Q, 1000)], ConvertibleNotesPayableCurrent: [i(Q[1], 1148.346)], ConvertibleLongTermNotesPayable: [i(Q[1], 6419.341)],
    Liabilities: [i(Q[1], 9000)], OperatingLeaseLiability: [i(Q[1], 482.3)] });
  const akam = secInputs(company(akamTags), { yieldPct: 5, zeroCoupon: { period: Q[1], zero: 3455.562 } });
  assert.ok(Math.abs(akam.debt - 4112.125) < 1e-9, String(akam.debt)); assert.ok(Math.abs(akam.debtHigh - 8517.7) < 1e-9, String(akam.debtHigh));
  // an entry for an earlier quarter still applies to the notes that are left (the weekly report names it as stale)
  assert.ok(Math.abs(secInputs(company(akamTags), { yieldPct: 5, zeroCoupon: { period: '2026-03-31', zero: 3455.562 } }).debt - 4112.125) < 1e-9);
  // BlackLine: 667.97 of 1.00% notes, its only debt: interest-bearing, a fail can rest on them
  const bl = secInputs(company(ns({ Revenues: [f(...Q, 1000)], ConvertibleDebtNoncurrent: [i(Q[1], 667.97)], Liabilities: [i(Q[1], 1200)] })), { yieldPct: 5 });
  assert.equal(bl.debt, 667.97); assert.equal(bl.debtHigh, 1200); assert.equal(bl.debtPartial, true);
  const tol = secInputs(company(ns({ Revenues: [f(...Q, 1000)], LineOfCredit: [i(Q[1], 2507.7)], Liabilities: [i(Q[1], 6144.3)], OperatingLeaseLiability: [i(Q[1], 147.3)] })), { yieldPct: 5 });
  assert.equal(tol.debt, null); assert.ok(Math.abs(tol.debtUpperBound - 5997) < 1e-9, String(tol.debtUpperBound));
  // a drawn long-term credit line is the company's own interest-bearing debt: it proves a fail; the bound is its high reading
  const irwd = secInputs(company(ns({ Revenues: [f(...Q, 1000)], LongTermLineOfCredit: [i(Q[1], 325)], Liabilities: [i(Q[1], 387.8)], OperatingLeaseLiability: [i(Q[1], 11.2)] })), { yieldPct: 5 });
  assert.equal(irwd.debt, 325); assert.ok(Math.abs(irwd.debtHigh - 376.6) < 1e-9, String(irwd.debtHigh)); assert.equal(irwd.debtPartial, true);
  // Dropbox: its 691.1 are 0.00% 2028 notes; the 2,580.2 term loan is the sure debt
  const dbx = secInputs(company(ns({ Revenues: [f(...Q, 1000)], LongTermLineOfCredit: [i(Q[1], 2580.2)], ConvertibleDebtNoncurrent: [i(Q[1], 691.1)],
    Liabilities: [i(Q[1], 5021.7)], OperatingLeaseLiability: [i(Q[1], 376.9)], FinanceLeaseLiability: [i(Q[1], 280.5)] })), { yieldPct: 5, zeroCoupon: { period: Q[1], zero: 691.1 } });
  assert.equal(dbx.debt, 2580.2); assert.ok(Math.abs(dbx.debtHigh - 4364.3) < 1e-9, String(dbx.debtHigh));
  // with no liabilities figure there is nothing to bound a pass: no debt figure at all, as before
  const nob = secInputs(company(ns({ Revenues: [f(...Q, 1000)], ConvertibleNotesPayable: [i(Q[1], 500)] })), { yieldPct: 5 });
  assert.equal(nob.debt, null);
});
test('final check: beside or inside long-term debt, 0.00% notes leave the fail-proving reading; an unnamed credit line is in the high reading only; a long-term credit line counts once, at its larger tag (Super Micro, Bill, Onto, Arrowhead)', () => {
  const d = Q[1];
  // SMCI: 4,669 of convertibles beside a combined 3,977, 2,267 of them 0.00% 2030 notes: 3,977 + 2,402 for sure
  const smciTags = ns({ DebtLongtermAndShorttermCombinedAmount: [i(d, 3977)], ConvertibleDebtNoncurrent: [i(d, 4669)] });
  assert.deepEqual((x => [x.debt, x.debtHigh])(debtAt(smciTags, d, { zero: 2267 })), [6379, 8646]);
  assert.deepEqual((x => [x.debt, x.debtHigh])(debtAt(smciTags, d)), [8646, null]);   // no entry: all of them, as in the audit
  // Bill: LongTermDebt 1,837.4 holds its 1,507.4 of 0.00% notes and a 330 revolver
  const bill = debtAt(ns({ LongTermDebt: [i(d, 1837.404)], ConvertibleDebtCurrent: [i(d, 123.204)], ConvertibleDebtNoncurrent: [i(d, 1384.2)], LongTermLineOfCredit: [i(d, 330)] }), d, { zero: 1507.404 });
  assert.ok(Math.abs(bill.debt - 330) < 1e-9 && Math.abs(bill.debtHigh - 3674.808) < 1e-9, JSON.stringify(bill));
  // Onto: its 1,500 is its 0.00% 2031 notes (1,473.2 carried): nothing is debt for sure
  assert.deepEqual((x => [x.debt, x.debtHigh])(debtAt(ns({ LongTermDebt: [i(d, 1500)], ConvertibleLongTermNotesPayable: [i(d, 1473.179)] }), d, { zero: 1473.179 })), [0, 1500]);
  // a drawn long-term line larger than every line it could sit inside is debt for sure (PSIX: 35 beside 0.9)
  const psix = debtAt(ns({ LongTermDebt: [i(d, 0.9)], LongTermLineOfCredit: [i(d, 35)] }), d);
  assert.deepEqual([psix.debt, psix.debtHigh], [35.9, null]);
  // the same line under both tags (Arrowhead's 195.4 holds its 155.4 long-term part) counts once, at the larger figure
  const arwr = debtAt(ns({ LongTermDebt: [i(d, 100)], LongTermLineOfCredit: [i(d, 155.4)], LineOfCredit: [i(d, 195.4)] }), d);
  assert.ok(Math.abs(arwr.debt - 255.4) < 1e-9 && Math.abs(arwr.debtHigh - 295.4) < 1e-9, JSON.stringify(arwr));
  // an unnamed credit line larger than the rest is still not debt for sure (Toll's joint ventures)
  const tol = debtAt(ns({ LongTermDebt: [i(d, 100)], LineOfCredit: [i(d, 2507.7)] }), d);
  assert.deepEqual([tol.debt, tol.debtHigh], [100, 2607.7]);
});
test('final check: the debt-total cap of the Lennox rule and the bundled-current condition of the LongTermDebt twin (NXP, Dutch Bros)', () => {
  const d = Q[1];
  // NXP: its 2,000 of "commercial paper" is a programme with nothing outstanding; the total less leases caps the low reading
  const nxpi = debtAt(ns({ DebtAndCapitalLeaseObligations: [i(d, 10978)], DebtCurrent: [i(d, 999)], LongTermDebtAndCapitalLeaseObligations: [i(d, 9979)],
    LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 999)], CommercialPaper: [i(d, 2000)] }), d);
  assert.deepEqual([nxpi.debt, nxpi.debtHigh], [10978, 12978]);
  // Dutch Bros tags its lease-free total under LongTermDebt and the bundled tag alike, its 407.4 of finance leases apart:
  // without a bundled current line the two are no twin
  const bros = debtAt(ns({ LongTermDebt: [i(d, 199.534)], LongTermDebtCurrent: [i(d, 4.766)], LongTermDebtNoncurrent: [i(d, 192.87)],
    LongTermDebtAndCapitalLeaseObligations: [i(d, 199.534)], FinanceLeaseLiabilityCurrent: [i(d, 16.872)], FinanceLeaseLiabilityNoncurrent: [i(d, 390.557)] }), d);
  assert.deepEqual([bros.debt, bros.debtHigh], [199.534, null]);
});
test('fix review: a short-term line tagged at zero is the current line beside a noncurrent one (Cognizant: 0 + 1,552)', () => {
  const d = Q[1];
  assert.equal(debtAt(ns({ LongTermDebtNoncurrent: [i(d, 1552)], ShortTermBorrowings: [i(d, 0)] }), d).debt, 1552);
});
test('fix review: debt and finance leases less the leases is the low reading only where no balance-sheet pair exists (Marathon Petroleum: principal 33,492 against 32,894 + 128)', () => {
  const d = Q[1];
  const mpc = debtAt(ns({ LongTermDebtNoncurrent: [i(d, 32894)], LongTermDebtCurrent: [i(d, 128)], DebtAndCapitalLeaseObligations: [i(d, 33492)] }), d);
  assert.deepEqual([mpc.debt, mpc.debtHigh], [33022, 33492]);
});

test('fix review: capitalized contract costs, tax receivables and current loans (charged at the lending rate) are no interest-earning current assets (Duolingo, Dell)', () => {
  // (one figure with prepaid expenses since the final check of 2026-11-22: they are often inside that line; Mastercard)
  const ccc = secInputs(company(ns({ Revenues: [f(...Q, 1000)], AssetsCurrent: [i(Q[1], 150)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)],
    CapitalizedContractCostNetCurrent: [i(Q[1], 50)], IncomeTaxReceivable: [i(Q[1], 10)] })), { yieldPct: 5 });
  assert.ok(Math.abs(ccc.illicit - 100 * 0.05 * 91 / 365) < 1e-9, String(ccc.illicit));
  // Dell: 12,805 of current financing receivables inside the 20,430 loan book: charged at 20%, not again at the yield
  const dell = secInputs(company(ns({ Revenues: [f(...Q, 29000)], AssetsCurrent: [i(Q[1], 24374)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 11569)],
    NotesAndLoansReceivableNetCurrent: [i(Q[1], 12805)], NotesReceivableNet: [i(Q[1], 20430)] })), { yieldPct: 5 });
  assert.ok(Math.abs(dell.illicit - (11569 * 0.05 + 20430 * 0.20) * 91 / 365) < 1e-6, String(dell.illicit));
});
test('fix review: interest joins a lender\'s contract revenue below the 10% line too (a lending tag or a loan book), never a non-lender\'s', () => {
  const contract = (v) => ({ RevenueFromContractWithCustomerExcludingAssessedTax: [f(...Q, v)] });
  const lend = secInputs(company(ns({ ...contract(1000), InterestAndFeeIncomeLoansAndLeases: [f(...Q, 52.6)] })), { yieldPct: 5 });
  assert.ok(Math.abs(lend.revenue - 1052.6) < 1e-9);   // 5.00%: its total revenue, as before
  const book = secInputs(company(ns({ ...contract(1000), InterestIncomeOperating: [f(...Q, 60)], LoansAndLeasesReceivableNetReportedAmount: [i(Q[1], 500)] })), { yieldPct: 5 });
  assert.ok(Math.abs(book.revenue - 1060) < 1e-9);
});
test('fix review: a fail is purified on a positive net interest line when it is larger than the exact one (Nano Nuclear: 0.374 against 4.98)', () => {
  const nne = secInputs(company(ns({ Revenues: [f(...Q, 5)], InterestIncomeOther: [f(...Q, 0.374)], InterestIncomeExpenseNet: [f(...Q, 4.978577)] })), { yieldPct: 5 });
  assert.equal(nne.illicit, 0.374); assert.equal(nne.illicitPublished, 4.978577);
  // a net line below the exact one adds nothing
  assert.equal(secInputs(company(ns({ Revenues: [f(...Q, 5)], InterestIncomeOther: [f(...Q, 1)], InterestIncomeExpenseNet: [f(...Q, 0.4)] })), { yieldPct: 5 }).illicitPublished, null);
});
test('fix review: a 10-K quarter with no quarterly weighted count caps the cover count at the year\'s weighted count (Skyworks: 150.0M, not the 234.9M after its merger)', () => {
  const g = { WeightedAverageNumberOfSharesOutstandingBasic: { units: { shares: [f('2025-10-04', '2026-10-02', 150.0e6, { form: '10-K' })] } } };
  const cover = { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2026-11-04', val: 234854620, form: '10-K', filed: '2026-11-13' }] } } };
  const r = secInputs(company({ ...ns({ Revenues: [f('2026-07-04', '2026-10-02', 1100, { form: '10-K' })] }), ...g }, cover), { yieldPct: 5 });
  assert.equal(r.sharesMV, 150.0e6);
  // the year's count alone is no quarter's count (G6.5)
  assert.equal(secInputs(company({ ...ns({ Revenues: [f('2026-07-04', '2026-10-02', 1100, { form: '10-K' })] }), ...g }), { yieldPct: 5 }).sharesMV, null);
});

test('fix review: a loan book read from cash flows says so, and a credit-loss provision is no loan (Rocket, Dave)', () => {
  const flow = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)],
    PaymentsToAcquireFinanceReceivables: [f('2025-11-03', Q[1], 19139)] })), { yieldPct: 5 });
  assert.equal(flow.estimate.loansFlow, true);
  const bal = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)], NotesAndLoansReceivableNetCurrent: [i(Q[1], 500)] })), { yieldPct: 5 });
  assert.equal(bal.estimate.loans, 500); assert.equal(bal.estimate.loansFlow, undefined);
  // the flow's own period and the smaller balance beside it, for the page (final check 2026-11-22: Block tags 2,352.2 of
  // loans beside 32,145.2 of 2025 originations; Rocket's flow covers nine months)
  assert.equal(flow.estimate.loansFlowDays, 240); assert.equal(flow.estimate.loansBalance, undefined);
  // (the balance at the quarter's end, from a loan tag: Block's 2,670.3 of the year before is not today's; a lease
  // investment is no loan balance, and Deere's 42.9B of receivables sit under its own tag: review of the final check)
  const both = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)],
    NotesAndLoansReceivableNetCurrent: [i('2025-12-31', 2670.3, { filed: '2026-02-20' }), i(Q[1], 2352.2)],
    PaymentsToAcquireFinanceReceivables: [f('2025-01-01', '2025-12-31', 32145.2)] })), { yieldPct: 5 });
  assert.deepEqual([both.estimate.loans, both.estimate.loansFlow, both.estimate.loansBalance, both.estimate.loansFlowDays], [32145.2, true, 2352.2, 365]);
  const de = secInputs(company(ns({ Revenues: [f(...Q, 12608)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 10300)], NetInvestmentInLease: [i(Q[1], 2593)],
    ProceedsFromCollectionOfFinanceReceivables: [f('2025-06-01', Q[1], 26480)] })), { yieldPct: 5 });
  assert.equal(de.estimate.loansFlow, true); assert.equal(de.estimate.loansBalance, undefined);
  // Dave: 7,600 of yearly advances under a credit-loss tag beside a 357 book
  const dave = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)], NotesAndLoansReceivableNetCurrent: [i(Q[1], 357)],
    FinancingReceivableExcludingAccruedInterestCreditLossExpenseReversal: [f('2025-07-01', Q[1], 7600)] })), { yieldPct: 5 });
  assert.equal(dave.estimate.loans, 357);
});

test('fix review: a reverse split of 1:50 or more is a split; only a 1000x step is a unit error', () => {
  // (since the final check of 2026-11-22 a step beyond 50x needs the cover count to move by about as much: a split
  // restated with a unit change gave ONEOK 2,000 and Freeport 2,000,000; Chesapeake's real 1:200 moved its cover count)
  const w = (start, end, val, filed) => ({ start, end, val, form: '10-Q', filed });
  const cover = (vals) => ({ EntityCommonStockSharesOutstanding: { units: { shares: vals.map(([filed, val]) => ({ end: filed, val, form: '10-Q', filed })) } } });
  const sh = (rows, dei = {}) => company({ ...ns({ Revenues: [f(...Q0, 900), f(...Q, 1000)] }), WeightedAverageNumberOfSharesOutstandingBasic: { units: { shares: rows } } }, dei);
  const rows100 = [w('2025-04-01', '2025-06-30', 1000, '2025-08-14'), w('2025-04-01', '2025-06-30', 10, '2026-08-15'), w(...Q, 10.1, '2026-08-15')];
  const r100 = secInputs(sh(rows100, cover([['2025-08-14', 1000], ['2026-08-15', 10.2]])), { yieldPct: 5 });
  assert.ok(Math.abs(r100.splitRatio - 0.01) < 1e-12, String(r100.splitRatio));
  assert.equal(secInputs(sh(rows100, cover([['2025-08-14', 1000], ['2026-08-15', 980]])), { yieldPct: 5 }).splitRatio, null);   // the cover did not move: no split
  assert.equal(secInputs(sh(rows100), { yieldPct: 5 }).splitRatio, null);                                                        // nothing to confirm it
  const unit = secInputs(sh([w('2025-04-01', '2025-06-30', 1, '2025-08-14'), w('2025-04-01', '2025-06-30', 1000, '2026-08-15'), w(...Q, 1000, '2026-08-15')]), { yieldPct: 5 });
  assert.equal(unit.splitRatio, null);
});

test('final check: a 10-K quarter caps the cover count at the shares outstanding at the quarter\'s end; the year\'s weighted count only without them (BitMine: 613.3M at the end, 482.3M on average)', () => {
  const rev = ns({ Revenues: [f('2026-06-01', '2026-08-31', 100, { form: '10-K' })] });
  const g = (w, qe) => ({ WeightedAverageNumberOfSharesOutstandingBasic: { units: { shares: [f('2025-09-01', '2026-08-31', w, { form: '10-K' })] } },
    ...(qe ? { CommonStockSharesOutstanding: { units: { shares: [i('2026-08-31', qe, { form: '10-K' })] } } } : {}) });
  const cover = { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2026-11-20', val: 625e6, form: '10-K', filed: '2026-11-21' }] } } };
  assert.equal(secInputs(company({ ...rev, ...g(482.29e6, 613.27e6) }, cover), { yieldPct: 5 }).sharesMV, 613.27e6);
  assert.equal(secInputs(company({ ...rev, ...g(482.29e6) }, cover), { yieldPct: 5 }).sharesMV, 482.29e6);   // as before
  // a count 1000x off the other with nothing to tell which is right stays unjudged (G6 rerun), whichever count it is
  assert.equal(secInputs(company({ ...rev, ...g(482.29e3) }, cover), { yieldPct: 5 }).sharesMV, null);
});
test('final check: where every exact interest line is a lending line, the high reading adds the cash and securities at the corporate yield (Shopify: 96M on loans, its 65M on 5.25B of cash under a net tag; HPE)', () => {
  const shop = secInputs(company(ns({ Revenues: [f(...Q, 3742)], InterestAndFeeIncomeLoansAndLeases: [f(...Q, 96)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 5250)] })), { yieldPct: 5 });
  assert.equal(shop.illicit, 96); assert.ok(Math.abs(shop.illicitHigh - (96 + 5250 * 0.05 * 91 / 365)) < 1e-9, String(shop.illicitHigh));
  // HPE: InterestIncomeOperating 192 is the same figure as its lease-interest line
  const hpe = secInputs(company(ns({ Revenues: [f(...Q, 12213)], InterestIncomeOperating: [f(...Q, 192)], SalesTypeAndDirectFinancingLeasesInterestIncome: [f(...Q, 192)],
    CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 6216)] })), { yieldPct: 5 });
  assert.ok(Math.abs(hpe.illicitHigh - (192 + 6216 * 0.05 * 91 / 365)) < 1e-9, String(hpe.illicitHigh));
  // an exact line on cash covers the cash: nothing is added
  const other = secInputs(company(ns({ Revenues: [f(...Q, 1000)], InvestmentIncomeInterest: [f(...Q, 10)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 5250)] })), { yieldPct: 5 });
  assert.equal(other.illicitHigh, null);
});
test('final check: an estimate proves no interest pass for a credit, brokerage or asset-management business (Ameriprise: 154M estimated, 908M of net investment income in its 10-Q)', () => {
  const amp = (sic) => secInputs(company(ns({ Revenues: [f(...Q, 5191)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 11159)] })), { yieldPct: 5, sic });
  for (const s of ['6282', '6211', '6162', '6199', '6411']) assert.equal(amp(s).illicitOpen, true, s);
  // a REIT's, a patent owner's or anyone else's estimate stands
  for (const s of ['6798', '6794', '3571', null, undefined]) assert.equal(amp(s).illicitOpen, false, String(s));
});
test('final check: a loan cash flow or a small note does not make a lender of a company whose interest is under 10% of revenue (Tronox: one 11M loan collection)', () => {
  const contract = { RevenueFromContractWithCustomerExcludingAssessedTax: [f(...Q, 1000)], InterestIncomeOperating: [f(...Q, 51)] };
  const flow = secInputs(company(ns({ ...contract, ProceedsFromCollectionOfLoansReceivable: [f('2025-01-01', '2025-12-31', 11)] })), { yieldPct: 5 });
  assert.equal(flow.revenue, 1000);   // 5.10%: a fail, as on contract revenue alone
  const note = secInputs(company(ns({ ...contract, NotesReceivableNet: [i(Q[1], 11)] })), { yieldPct: 5 });
  assert.equal(note.revenue, 1000);
});
test('final check: a tax receivable, contract costs or current loans inside "prepaid expenses and other current assets" are not taken off twice (Mastercard: 1,126 of tax receivable inside 4,370)', () => {
  const ma = secInputs(company(ns({ Revenues: [f(...Q, 8000)], AssetsCurrent: [i(Q[1], 24480)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 10147)],
    AccountsReceivableNetCurrent: [i(Q[1], 5258)], IncomeTaxReceivable: [i(Q[1], 1126)], PrepaidExpenseAndOtherAssetsCurrent: [i(Q[1], 4370)], OtherAssetsCurrent: [i(Q[1], 1654)] })), { yieldPct: 5 });
  assert.ok(Math.abs(ma.illicit - (10147 + 3051) * 0.05 * 91 / 365) < 1e-6, String(ma.illicit));
});
test('audit round 2: a cover count of one share class is no count of the company (Mobileye: 252.4M Class A of 824M)', () => {
  const g = { WeightedAverageNumberOfSharesOutstandingBasic: { units: { shares: [f(...Q, 824e6)] } }, ...ns({ Revenues: [f(...Q, 1000)], NetIncomeLoss: [f(...Q, -67e6)] }),
    EarningsPerShareBasic: { units: { 'USD/shares': [f(...Q, -0.08)] } } };
  const cover = { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2026-07-20', val: 252403844, form: '10-Q', filed: '2026-07-30' }] } } };
  const r = secInputs(company(g, cover), { yieldPct: 5 });
  assert.equal(r.sharesMV, 824e6); assert.equal(r.shares, 824e6);
});
test('audit round 2: notes receivable from related parties are loans (Muscle Maker Grill: 12% notes; its estimate missed them)', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)], NotesReceivableRelatedPartiesNoncurrent: [i(Q[1], 12.44)] })), { yieldPct: 5 });
  assert.equal(r.estimate.loans, 12.44);
  // a change in trade receivables is no loan book (the first, broad version of this rule charged Axon's 448.9M of
  // "increase in accounts and notes receivable" at 20%); nor is a gross figure beside the net one already read (Verizon)
  const axon = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)],
    IncreaseDecreaseInAccountsAndNotesReceivable: [f('2026-01-01', Q[1], 448.9)] })), { yieldPct: 5 });
  assert.equal(axon.estimate.loans, undefined);
  const vz = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)], NotesReceivableNet: [i(Q[1], 29530)],
    NotesReceivableGross: [i(Q[1], 32055)] })), { yieldPct: 5 });
  assert.equal(vz.estimate.loans, 29530);
});

test('final check: a business held for sale under the current taxonomy\'s tag earns no interest (IFF: 5,181 of current assets; purified 69M against a 3M interest line)', () => {
  const iff = secInputs(company(ns({ Revenues: [f(...Q0, 1900), f(...Q, 1942)], InvestmentIncomeInterest: [f(...Q, 3)], AssetsCurrent: [i(Q0[1], 9275), i(Q[1], 9275)],
    CashAndCashEquivalentsAtCarryingValue: [i(Q0[1], 272), i(Q[1], 272)], AssetsOfDisposalGroupIncludingDiscontinuedOperationCurrent: [i(Q0[1], 5181), i(Q[1], 5181)],
    InventoryNet: [i(Q0[1], 1452), i(Q[1], 1452)], OtherAssetsCurrent: [i(Q0[1], 837), i(Q[1], 837)], IncomeTaxesReceivable: [i(Q0[1], 368), i(Q[1], 368)],
    AccountsAndOtherReceivablesNetCurrent: [i(Q0[1], 1165), i(Q[1], 1165)] })), { yieldPct: 5 });
  assert.equal(iff.illicitHigh, null, String(iff.illicitHigh));   // every current asset is explained: no high reading above the 3
});

// ---- External audit, 2026-11-22 (post-hoc fixes; progress/SHARIAH-PLAN.md part M13) ----
// Debt has two readings when the tags cannot show whether two lines are the same money: debt counts such lines once,
// debtHigh separately (null when both agree). The balance sheet's figure lies between them.
test('audit: short-term lines count apart in the high reading; the low one keeps only lines that cannot overlap (Cummins, Camden)', () => {
  const d = Q[1];
  // Cummins 10-Q 2026-09-30: loans payable 383, commercial paper 348, current maturities 154, long-term debt 6,634 = 7,519
  const r = debtAt(ns({ CommercialPaper: [i(d, 348)], ShortTermBankLoansAndNotesPayable: [i(d, 383)], LongTermDebtCurrent: [i(d, 154)],
    LongTermDebtAndCapitalLeaseObligations: [i(d, 6634)] }), d);
  assert.deepEqual([r.debt, r.debtHigh], [6788, 7519]);
  // Camden: CommercialPaper 600 is the programme's size, nothing drawn; notes payable 4,228.3 are the debt
  const cpt = debtAt(ns({ LongTermDebt: [i(d, 4228.3)], CommercialPaper: [i(d, 600)] }), d);
  assert.deepEqual([cpt.debt, cpt.debtHigh], [4228.3, 4828.3]);
  // the same amount under two tags is one line (Genuine Parts 388.1 / 389.0; KeyCorp 5,185 twice)
  const gpc = debtAt(ns({ LongTermDebt: [i(d, 4722)], LongTermDebtNoncurrent: [i(d, 4472)], LongTermDebtCurrent: [i(d, 250)], ShortTermBorrowings: [i(d, 388.1)], CommercialPaper: [i(d, 389)] }), d);
  assert.deepEqual([gpc.debt, gpc.debtHigh], [4722, 4722 + 389]);
  // short-term borrowings equal to the sum of the other lines is their total (Citigroup 51,878 = 19,941 + 31,937)
  const c = debtAt(ns({ LongTermDebt: [i(d, 315827)], ShortTermBorrowings: [i(d, 51878)], CommercialPaper: [i(d, 19941)], OtherShortTermBorrowings: [i(d, 31937)] }), d);
  assert.deepEqual([c.debt, c.debtHigh], [315827, 315827 + 51878]);
  // Walmart: the combined figure 39,932 is only the long-term debt; short-term borrowings 10,479 beside it
  const wmt = debtAt(ns({ DebtLongtermAndShorttermCombinedAmount: [i(d, 39932)], LongTermDebtNoncurrent: [i(d, 36462)], LongTermDebtCurrent: [i(d, 3470)],
    ShortTermBorrowings: [i(d, 10479)] }), d);
  assert.deepEqual([wmt.debt, wmt.debtHigh], [39932, 50411]);
  // short-term borrowings beside other lines may be their total (ADM: 1,156 holds the 466): low counts it alone, high adds them
  const adm = debtAt(ns({ LongTermDebtNoncurrent: [i(d, 7429)], LongTermDebtCurrent: [i(d, 153)], ShortTermBorrowings: [i(d, 1156)], OtherShortTermBorrowings: [i(d, 466)] }), d);
  assert.ok(adm.debt <= 7429 + 153 + 1156 && adm.debtHigh >= 7429 + 153 + 1156 + 466, JSON.stringify(adm));
});
test('audit: a line that may sit inside the current portion counts only in the high reading (Corpay, Charter, MercadoLibre)', () => {
  const d = Q[1];
  // Corpay: securitisation 2,300 + notes and lines 2,861 = the 5,161 current portion of its 11,233 long-term debt
  const cpay = debtAt(ns({ LongTermDebt: [i(d, 11233)], LongTermNotesAndLoans: [i(d, 6072)], LongTermDebtCurrent: [i(d, 5161)],
    NotesAndLoansPayableCurrent: [i(d, 2861)], SecuredDebtCurrent: [i(d, 2300)] }), d);
  assert.deepEqual([cpay.debt, cpay.debtHigh], [11233, 13533]);
  // Charter: other borrowings 1,180 inside the 1,990 current portion; MercadoLibre: credit lines 231 inside 6,909
  const chtr = debtAt(ns({ LongTermDebt: [i(d, 107052)], LongTermDebtNoncurrent: [i(d, 105062)], LongTermDebtCurrent: [i(d, 1990)], OtherShortTermBorrowings: [i(d, 1180)] }), d);
  assert.deepEqual([chtr.debt, chtr.debtHigh], [107052, 108232]);
  const meli = debtAt(ns({ LongTermDebt: [i(d, 13190)], LongTermDebtNoncurrent: [i(d, 6281)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 6909)], LinesOfCreditCurrent: [i(d, 231)] }), d);
  assert.deepEqual([meli.debt, meli.debtHigh], [13190, 13421]);
});
test('audit: noncurrent + DebtCurrent is a sure reading; the short lines stay in the high one (eBay, BMY, IFF, Marriott, Adobe); finance leases stay out', () => {
  const d = Q[1];
  // eBay 2026-09-30: short-term debt 1,599 + long-term debt 5,134 = 6,733, the long-term line only under the bundled
  // tag (no finance lease tagged) and 750 of commercial paper only inside DebtCurrent
  const ebay = debtAt(ns({ LongTermDebtAndCapitalLeaseObligations: [i(d, 5134)], LongTermDebtCurrent: [i(d, 850)], DebtCurrent: [i(d, 1599)],
    OtherShortTermBorrowings: [i(d, 5)] }), d);
  assert.deepEqual([ebay.debt, ebay.debtHigh], [6733, null]);   // its 5 of other borrowings sit inside the 1,599
  // BMY: short-term borrowings 1,028 = DebtCurrent = current portion 768 + bank loans 260: 42,877 (it was counted as
  // 43,645, now the low reading; the high one counts every line apart)
  const bmy = debtAt(ns({ LongTermDebt: [i(d, 42617)], LongTermDebtNoncurrent: [i(d, 41849)], LongTermDebtCurrent: [i(d, 768)], DebtCurrent: [i(d, 1028)],
    ShortTermBorrowings: [i(d, 1028)], ShortTermBankLoansAndNotesPayable: [i(d, 260)] }), d);
  assert.equal(bmy.debt, 42877); assert.ok(bmy.debtHigh >= 43645);
  // IFF: DebtCurrent 1,538 is only the current portion; the 539 of commercial paper beside it is debt too
  const iff = debtAt(ns({ LongTermDebtNoncurrent: [i(d, 4735)], LongTermDebtCurrent: [i(d, 1538)], DebtCurrent: [i(d, 1538)], CommercialPaper: [i(d, 539)] }), d);
  assert.deepEqual([iff.debt, iff.debtHigh], [6273, 6812]);
  // Marriott 2026-09-30: LongTermDebt holds a stray 23; debt and finance leases 16,843 less finance leases 108 = 16,735
  const mar = debtAt(ns({ LongTermDebt: [i(d, 23)], DebtAndCapitalLeaseObligations: [i(d, 16843)], FinanceLeaseLiability: [i(d, 108)],
    LongTermDebtAndCapitalLeaseObligations: [i(d, 16434)], LongTermDebtAndCapitalLeaseObligationsCurrent: [i(d, 409)] }), d);
  assert.equal(mar.debt, 16735); assert.equal(mar.debtHigh, null);   // its bundled lines less the 108 now say the same
  // Adobe 2026-08-28: LongTermDebt 4,766 is the noncurrent line, DebtCurrent 1,597 the current one: 6,363 in the high reading
  const adbe = debtAt(ns({ LongTermDebt: [i(d, 4766)], DebtCurrent: [i(d, 1597)] }), d);
  assert.deepEqual([adbe.debt, adbe.debtHigh], [4766, 6363]);
  // PayPal: the noncurrent tag (10,939, carrying) and LongTermDebt less its current portion (13,353 - 2,333, principal)
  // disagree: the low reading takes the smaller, the high one the larger; its short-term debt 2,533 = notes 2,333 +
  // paper 200 holds no lease, so the 5 of current finance lease stays (audit 2026-11-22)
  const pypl = debtAt(ns({ LongTermDebt: [i(d, 13353)], LongTermDebtCurrent: [i(d, 2333)], LongTermDebtNoncurrent: [i(d, 10939)], DebtCurrent: [i(d, 2533)],
    FinanceLeaseLiabilityCurrent: [i(d, 5)], CommercialPaper: [i(d, 200)] }), d);
  assert.deepEqual([pypl.debt, pypl.debtHigh], [13472, 13553]);
  // a bundled noncurrent line loses its tagged finance lease (Micron-like: 4,688 holds 1,896; current debt is the lease)
  assert.equal(debtAt(ns({ LongTermDebtAndCapitalLeaseObligations: [i(d, 4688)], FinanceLeaseLiabilityNoncurrent: [i(d, 1896)],
    DebtCurrent: [i(d, 491)], FinanceLeaseLiabilityCurrent: [i(d, 491)] }), d).debt, 2792);
});
test('audit: a long-term credit line is debt; it counts for sure when the other long-term line is too small to hold it', () => {
  const d = Q[1];
  // Power Solutions (thousands): revolver 35,000 + long-term debt 875 + current 15 + other short-term 250 = 36,140
  const psix = debtAt(ns({ LongTermDebtNoncurrent: [i(d, 875)], LongTermDebtCurrent: [i(d, 15)], OtherShortTermBorrowings: [i(d, 250)],
    LongTermLineOfCredit: [i(d, 35000)], FinanceLeaseLiabilityCurrent: [i(d, 414)], FinanceLeaseLiabilityNoncurrent: [i(d, 1165)] }), d);
  assert.deepEqual([psix.debt, psix.debtHigh], [35890, 36140]);   // the 250 of other borrowings: high reading
  // EQT: 333 beside 5,553 of long-term debt may be inside it: high reading only
  const eqt = debtAt(ns({ LongTermDebt: [i(d, 5553)], LongTermDebtNoncurrent: [i(d, 5553)], LongTermDebtCurrent: [i(d, 0)], LongTermLineOfCredit: [i(d, 333)] }), d);
  assert.deepEqual([eqt.debt, eqt.debtHigh], [5553, 5886]);
  // Rollins: the long-term debt IS the credit line (487.6 twice): once
  const rol = debtAt(ns({ LongTermDebt: [i(d, 487.6)], LongTermDebtNoncurrent: [i(d, 487.6)], LongTermDebtCurrent: [i(d, 0)], LongTermLineOfCredit: [i(d, 487.6)] }), d);
  assert.deepEqual([rol.debt, rol.debtHigh], [487.6, null]);
});
test('audit: convertible notes are debt; for sure when larger than the debt they could sit inside (SMCI), else high reading only', () => {
  // (since the final check of 2026-11-22, notes the filing shows at 0.00% excepted: see the zero-coupon tests above)
  const d = Q[1];
  // Super Micro 2026-09-30 ($K): lines of credit and term loans 3,977,071 (combined) + convertible notes 4,668,946
  const smci = debtAt(ns({ DebtLongtermAndShorttermCombinedAmount: [i(d, 3977071)], ConvertibleLongTermNotesPayable: [i(d, 4668946)] }), d);
  assert.deepEqual([smci.debt, smci.debtHigh], [8646017, null]);
  // most companies carry them inside LongTermDebt
  const inside = debtAt(ns({ LongTermDebt: [i(d, 1000)], ConvertibleNotesPayable: [i(d, 300)] }), d);
  assert.deepEqual([inside.debt, inside.debtHigh], [1000, 1300]);
});
test('audit: secInputs passes the high reading on; equal readings give none', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 1000)], LongTermDebt: [i(Q[1], 11233)], LongTermDebtNoncurrent: [i(Q[1], 6072)], LongTermDebtCurrent: [i(Q[1], 5161)], SecuredDebtCurrent: [i(Q[1], 2300)] })), { yieldPct: 5 });
  assert.deepEqual([r.debt, r.debtHigh], [11233, 13533]);
  const s = secInputs(company(ns({ Revenues: [f(...Q, 1000)], LongTermDebt: [i(Q[1], 100)] })), { yieldPct: 5 });
  assert.equal(s.debtHigh, null);
});
test('audit: current assets no tagged line explains count as interest-earning in the estimate (Energy Fuels)', () => {
  // Energy Fuels 2026-09-30 (millions): current assets 980.086; tagged cash 76.421, receivables 26.866 (+1.498 nontrade
  // inside), inventory 90.291, prepaid 7.036; its 779.5 of marketable securities sit under its own tag (efr:...), which
  // companyfacts does not carry. Interest disclosed: 9.484 on revenue 29.18 (32.5%); the estimate said 4.8%.
  const at = (d, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [i(d, v * 1e6)]]));
  const bal = (d) => ({ AssetsCurrent: 980.086, CashAndCashEquivalentsAtCarryingValue: 76.421, ReceivablesNetCurrent: 26.866, NontradeReceivablesCurrent: 1.498,
    InventoryNet: 90.291, PrepaidExpenseCurrent: 7.036, MarketableSecuritiesNoncurrent: 25.182 });
  const g = {}; for (const d of [Q0[1], Q[1]]) for (const [k, v] of Object.entries(at(d, bal(d)))) g[k] = [...(g[k] ?? []), ...v];
  const r = secInputs(company({ ...ns({ Revenues: [f(...Q0, 30e6), f(...Q, 29.18e6)] }), ...ns(g) }), { yieldPct: 5.474 });
  assert.equal(r.illicitEstimated, true);
  assert.ok(r.illicit / r.revenue > 0.05, `estimate ${r.illicit} is ${(100 * r.illicit / r.revenue).toFixed(1)}% of revenue`);
  // a company whose tagged lines explain its current assets keeps the plain estimate
  const plain = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)], AccountsReceivableNetCurrent: [i(Q[1], 50)],
    AssetsCurrent: [i(Q[1], 150)] })), { yieldPct: 5 });
  assert.ok(Math.abs(plain.illicit - 100 * 0.05 * 91 / 365) < 1e-9);
});
test('audit: interest has a high reading: separate exact lines add up (IBM), non-contract revenue may be financing income (MercadoLibre), unexplained current assets may earn it (ADP)', () => {
  // IBM Q3 2026: other interest income 87 + interest on sales-type and direct-financing leases 62 = 149
  const ibm = secInputs(company(ns({ Revenues: [f(...Q, 16331)], InterestIncomeOther: [f(...Q, 87)], SalesTypeAndDirectFinancingLeasesInterestIncome: [f(...Q, 62)] })), { yieldPct: 5 });
  assert.deepEqual([ibm.illicit, ibm.illicitHigh], [87, 149]);
  // MercadoLibre: credit revenues 3,244 are revenue not from contracts with customers, at a company holding loans
  const meli = secInputs(company(ns({ Revenues: [f(...Q, 10750)], InvestmentIncomeInterest: [f(...Q, 55)], RevenueNotFromContractWithCustomer: [f(...Q, 3244)],
    LoansAndLeasesReceivableNetReportedAmount: [i(Q[1], 1)] })), { yieldPct: 5 });
  assert.equal(meli.illicit, 55); assert.ok(meli.illicitHigh >= 3299);
  // without loans it is commodity contracts or leases (Bunge, Sempra): not counted
  const bg = secInputs(company(ns({ Revenues: [f(...Q, 10750)], InvestmentIncomeInterest: [f(...Q, 55)], RevenueNotFromContractWithCustomer: [f(...Q, 3244)] })), { yieldPct: 5 });
  assert.equal(bg.illicitHigh, null);
  // ADP 2026-09-30: 44.7B of client funds sit in current assets no tagged line explains; their interest is in revenue
  const adp = secInputs(company(ns({ Revenues: [f(...Q, 5490.7)], InvestmentIncomeInterest: [f(...Q, 133.7)],
    AssetsCurrent: [i(Q[1], 52825.9)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 3277)], AccountsReceivableNetCurrent: [i(Q[1], 3524)],
    OtherAssetsCurrent: [i(Q[1], 1291.6)], MarketableSecuritiesCurrent: [i(Q[1], 50)] })), { yieldPct: 5.474 });
  assert.equal(adp.illicit, 133.7); assert.ok(adp.illicitHigh / adp.revenue > 0.05, String(adp.illicitHigh));
  // lines that explain the current assets: one reading
  const plain = secInputs(company(ns({ Revenues: [f(...Q, 1000)], InvestmentIncomeInterest: [f(...Q, 10)], AssetsCurrent: [i(Q[1], 150)],
    CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)], AccountsReceivableNetCurrent: [i(Q[1], 50)] })), { yieldPct: 5 });
  assert.equal(plain.illicitHigh, null); assert.equal(plain.illicitOpen, false);
});
test('audit: loans whose interest no tag shows are charged 20% a year in the high reading (Snap-on, DE)', () => {
  const loans = { FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss: [i(Q[1], 2500)] };
  const sna = secInputs(company(ns({ Revenues: [f(...Q, 1282.3)], InvestmentIncomeInterest: [f(...Q, 13.9)], ...loans })), { yieldPct: 5 });
  assert.equal(sna.illicit, 13.9); assert.equal(sna.illicitOpen, false);
  assert.ok(Math.abs(sna.illicitHigh - (13.9 + 2500 * 0.20 * 91 / 365)) < 1e-9, String(sna.illicitHigh));
  // loans small against revenue keep a high reading under 5%
  const small = secInputs(company(ns({ Revenues: [f(...Q, 14000)], InvestmentIncomeInterest: [f(...Q, 180)], FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss: [i(Q[1], 5600)] })), { yieldPct: 5 });
  assert.ok(small.illicitHigh / small.revenue < 0.05);
  // loan interest tagged: read as it is
  const read = secInputs(company(ns({ Revenues: [f(...Q, 1282.3)], InterestAndFeeIncomeLoansAndLeases: [f(...Q, 98.6)], ...loans })), { yieldPct: 5 });
  assert.equal(read.illicitOpen, false); assert.equal(read.illicitHigh, null);
  // loans seen only in cash flows (DE bought 19.1B of finance receivables in its year): the flow stands in for the book
  const flows = secInputs(company(ns({ Revenues: [f(...Q, 12000)], InvestmentIncomeInterest: [f(...Q, 10)], PaymentsToAcquireFinanceReceivables: [f('2025-11-03', Q[1], 19139)] })), { yieldPct: 5 });
  assert.ok(Math.abs(flows.illicitHigh - (10 + 19139 * 0.20 * 91 / 365)) < 1e-9, String(flows.illicitHigh));
});
test('audit: the estimate base reads the debt-securities tags of the current taxonomy and long-term investments (Arteris)', () => {
  // Arteris 2026-09-30 (millions): cash 71.014 + short-term investments 33.169 + long-term investments 16.114
  const r = secInputs(company(ns({ Revenues: [f(...Q0, 25), f(...Q, 25.774)], CashAndCashEquivalentsAtCarryingValue: [i(Q0[1], 93.3), i(Q[1], 71.014)],
    DebtSecuritiesAvailableForSaleExcludingAccruedInterestCurrent: [i(Q[1], 33.169)], LongTermInvestments: [i(Q[1], 16.114)] })), { yieldPct: 5.2 });
  assert.ok(Math.abs(r.illicit - (71.014 + 33.169 + 16.114) * 0.052 * 91 / 365) < 1e-9, String(r.illicit));
});
test('audit: a lender whose revenue is contract revenue only has its interest added to revenue (AXP: 56.9% -> 36.3%)', () => {
  const r = secInputs(company(ns({ RevenueFromContractWithCustomerExcludingAssessedTax: [f(...Q, 1000)], InterestAndFeeIncomeLoansAndLeases: [f(...Q, 569)] })), { yieldPct: 5 });
  assert.equal(r.revenue, 1569); assert.equal(r.revenueTag, 'RevenueFromContractWithCustomerExcludingAssessedTax+interest');
  // contract revenue never holds interest (ASC 606); other companies keep the revenue they publish
  assert.equal(secInputs(company(ns({ RevenueFromContractWithCustomerExcludingAssessedTax: [f(...Q, 1000)], InvestmentIncomeInterest: [f(...Q, 50)] })), { yieldPct: 5 }).revenue, 1000);
  assert.equal(secInputs(company(ns({ Revenues: [f(...Q, 1000)], InterestAndFeeIncomeLoansAndLeases: [f(...Q, 569)] })), { yieldPct: 5 }).revenue, 1000);
});
test('audit: a small note receivable no longer leaves the estimate out (Linde: 29M against 3.9B of cash); loans held for sale count (Carvana)', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 8600)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 3947)], NotesAndLoansReceivableNetNoncurrent: [i('2025-12-31', 29)] })), { yieldPct: 5.474 });
  assert.ok(r.illicit / r.revenue < 0.01, String(r.illicit));
  const cvna = secInputs(company(ns({ Revenues: [f(...Q, 5000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 3606)], LoansReceivableHeldForSaleNetNotPartOfDisposalGroup: [i(Q[1], 896)] })), { yieldPct: 5 });
  assert.ok(Math.abs(cvna.illicit - (3606 * 0.05 * 91 / 365 + 896 * 0.20 * 91 / 365)) < 1e-9, String(cvna.illicit));
});
test('audit: loan interest tagged far below what the loans would earn adds the loan book in the high reading (IBM: 62 of lease interest on 13,257 of loans)', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 16331)], InterestIncomeOther: [f(...Q, 87)], SalesTypeAndDirectFinancingLeasesInterestIncome: [f(...Q, 62)],
    FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss: [i(Q[1], 13257)] })), { yieldPct: 5 });
  assert.ok(Math.abs(r.illicitHigh - (87 + 13257 * 0.20 * 91 / 365)) < 1e-9, String(r.illicitHigh));
  // a lender whose tagged loan interest is a normal yield keeps it
  const bank = secInputs(company(ns({ Revenues: [f(...Q, 1000)], InterestAndFeeIncomeLoansAndLeases: [f(...Q, 150)], LoansAndLeasesReceivableNetReportedAmount: [i(Q[1], 10000)] })), { yieldPct: 5 });
  assert.equal(bank.illicitHigh, null);
});
test('audit: noncurrent debt with only short-term lines beside it (PepsiCo: 42,658 + 9,223); NotesAndLoansPayableCurrent is a current line (Motorola, Estee Lauder)', () => {
  const d = Q[1];
  const pep = debtAt(ns({ LongTermDebtAndCapitalLeaseObligations: [i(d, 42658)], ShortTermBorrowings: [i(d, 9223)], CommercialPaper: [i(d, 4800)] }), d);
  assert.deepEqual([pep.debt, pep.debtHigh], [42658, 42658 + 9223 + 4800]);
  assert.equal(debtAt(ns({ LongTermDebtNoncurrent: [i(d, 9361)], NotesAndLoansPayableCurrent: [i(d, 750)] }), d).debt, 10111);
  // only a noncurrent line, nothing current at all: still incomplete
  assert.equal(debtAt(ns({ LongTermDebtNoncurrent: [i(d, 90)] }), d).debt, null);
});
test('audit: LongTermDebt smaller than the noncurrent tag is itself the noncurrent line (Tapestry: 1,960 + 597)', () => {
  const d = Q[1];
  const tpr = debtAt(ns({ LongTermDebt: [i(d, 1960)], LongTermDebtCurrent: [i(d, 597)], LongTermDebtNoncurrent: [i(d, 2000)] }), d);
  assert.equal(tpr.debt, 2557); assert.ok(tpr.debtHigh >= 2557);
});
test('audit: current debt securities under DebtSecuritiesCurrent are securities, not unexplained assets (Nvidia: 34,143)', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 96221)], InvestmentIncomeInterest: [f(...Q, 496)], AssetsCurrent: [i(Q[1], 154629)],
    CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 22443)], DebtSecuritiesCurrent: [i(Q[1], 34143)], AccountsReceivableNetCurrent: [i(Q[1], 63059)],
    InventoryNet: [i(Q[1], 31575)], PrepaidExpenseAndOtherAssetsCurrent: [i(Q[1], 3409)] })), { yieldPct: 5 });
  assert.equal(r.illicitHigh, null);
});
test('audit: a debt total that bundles finance leases loses the tagged ones; notes payable to banks are a noncurrent line (Sky Quarry)', () => {
  const d = Q[1];
  assert.equal(debtAt(ns({ LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities: [i(d, 17700)], FinanceLeaseLiability: [i(d, 300)] }), d).debt, 17400);
  const skyq = debtAt(ns({ LongTermDebt: [i(d, 5957)], NotesPayableCurrent: [i(d, 8661)], NotesPayableToBankNoncurrent: [i(d, 1689)] }), d);
  assert.equal(skyq.debt, 5957); assert.ok(skyq.debtHigh >= 8661 + 1689, String(skyq.debtHigh));
});
test('audit: a securities total is used only when no investment line is tagged and it is not the cash itself (AMD, Natera); KLA stays', () => {
  const at = (o) => secInputs(company(ns({ Revenues: [f(...Q, 1000)], ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [i(Q[1], v)]])) })), { yieldPct: 5 });
  const r = (base) => base * 0.05 * 91 / 365;
  // AMD-like: the available-for-sale total 11,000 holds 3,000 of cash equivalents and the 8,000 of short-term investments
  assert.ok(Math.abs(at({ CashAndCashEquivalentsAtCarryingValue: 5000, ShortTermInvestments: 8000, AvailableForSaleSecuritiesDebtSecurities: 11000 }).illicit - r(13000)) < 1e-9);
  // Natera-like: the total equals the cash
  assert.ok(Math.abs(at({ CashAndCashEquivalentsAtCarryingValue: 1000, AvailableForSaleSecuritiesDebtSecurities: 1000 }).illicit - r(1000)) < 1e-9);
  // KLA: securities tagged only as a total still count
  assert.ok(Math.abs(at({ CashAndCashEquivalentsAtCarryingValue: 100, AvailableForSaleSecuritiesDebtSecurities: 300 }).illicit - r(400)) < 1e-9);
});
test('audit: published investment income bounds the estimate from below and is a high reading (insurers: AMERISAFE, Primerica)', () => {
  const est = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)], NetInvestmentIncome: [f(...Q, 50)] })), { yieldPct: 5 });
  assert.equal(est.illicit, 50); assert.equal(est.illicitEstimated, true);
  const ex = secInputs(company(ns({ Revenues: [f(...Q, 1000)], InvestmentIncomeInterest: [f(...Q, 10)], GrossInvestmentIncomeOperating: [f(...Q, 60)] })), { yieldPct: 5 });
  assert.deepEqual([ex.illicit, ex.illicitHigh], [10, 60]);
});
test('audit: a loan book tagged in a current and a noncurrent part counts both (Caterpillar: 11,051 + 14,402)', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 20682)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 18703)],
    NotesAndLoansReceivableNetCurrent: [i(Q[1], 11051)], NotesAndLoansReceivableNetNoncurrent: [i(Q[1], 14402)],
    ProceedsFromCollectionOfFinanceReceivables: [f('2025-10-01', Q[1], 15329)] })), { yieldPct: 5.474 });
  assert.equal(r.estimate.loans, 11051 + 14402);
  assert.ok(r.illicit / r.revenue > 0.05, String(r.illicit / r.revenue));
  // a total tagged beside its parts is not added to them
  const t = secInputs(company(ns({ Revenues: [f(...Q, 20682)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 18703)], NotesAndLoansReceivableNet: [i(Q[1], 25453)],
    NotesAndLoansReceivableNetCurrent: [i(Q[1], 11051)], NotesAndLoansReceivableNetNoncurrent: [i(Q[1], 14402)] })), { yieldPct: 5.474 });
  assert.equal(t.estimate.loans, 25453);
});
test('fix review: the loan book is the larger of loan balances and loan cash flows (Deere: a 2.6B lease balance beside 26.5B of collections)', () => {
  // This test was "a tagged loan balance wins over loan cash flows" (b839eca) until the fix-branch review of 2026-11-22:
  // Deere's retail notes sit under its own de: tags, which companyfacts does not carry; its only us-gaap balance is a
  // 2,593M net investment in leases, so balances-first charged 2.6B of loans and passed R3 at 2.09% against the 10-Q's
  // 1,353M of finance and interest income (10.7%). A flow can overstate the book; that only leaves R3 open.
  const de = secInputs(company(ns({ Revenues: [f(...Q, 12608)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 10300)], NetInvestmentInLease: [i(Q[1], 2593)],
    PaymentsToAcquireFinanceReceivables: [f('2025-11-03', Q[1], 19139)], ProceedsFromCollectionOfFinanceReceivables: [f('2024-11-04', '2025-11-02', 26480)] })), { yieldPct: 5.22 });
  assert.equal(de.estimate.loans, 26480);
  assert.ok(de.illicit / de.revenue > 0.05, String(de.illicit / de.revenue));   // an estimate above 5%: R3 stays open, never a pass
});
test('audit: a loan balance repeated in later filings counts once (Cisco: 3,623 + 5,118, not every filing that repeats them)', () => {
  const rep = (end, val) => [i(end, val, { filed: '2026-08-01' }), i(end, val, { filed: '2026-11-20' })];
  const r = secInputs(company(ns({ Revenues: [f(...Q, 1000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)],
    NotesAndLoansReceivableNetCurrent: rep(Q[1], 3623), NotesAndLoansReceivableNetNoncurrent: rep(Q[1], 5118) })), { yieldPct: 5 });
  assert.equal(r.estimate.loans, 3623 + 5118);
});

test('final check: sales-type lease investments are in the loan book; their undiscounted payments and unearned income are not (Intuitive Surgical: 366.0 net, not 396.9 gross)', () => {
  const r = secInputs(company(ns({ Revenues: [f(...Q, 3048.7)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 100)],
    SalesTypeLeaseNetInvestmentInLeaseExcludingAccruedInterestBeforeAllowanceForCreditLoss: [i(Q[1], 366.0)],
    SalesTypeAndDirectFinancingLeasesLeaseReceivablePaymentsToBeReceived: [i(Q[1], 396.9)], SalesTypeAndDirectFinancingLeasesLeaseReceivableUndiscountedExcessAmount: [i(Q[1], 27.1)] })), { yieldPct: 5 });
  assert.equal(r.estimate.loans, 366.0);
});
test('final check: with no long-term line, current credit lines and short-term borrowings are debt for sure; commercial paper is not (Opendoor: 2,016 of asset-backed lines)', () => {
  const open = secInputs(company(ns({ Revenues: [f(...Q, 1000)], LongTermLineOfCredit: [i(Q[1], 348)], LinesOfCreditCurrent: [i(Q[1], 2016)], ConvertibleDebtNoncurrent: [i(Q[1], 639)],
    ConvertibleDebtCurrent: [i(Q[1], 59)], Liabilities: [i(Q[1], 3148)], OperatingLeaseLiability: [i(Q[1], 8)] })), { yieldPct: 5 });
  assert.deepEqual([open.debt, open.debtHigh, open.debtPartial], [3062, 3140, true]);   // its balance sheet's 3,062
  const cp = secInputs(company(ns({ Revenues: [f(...Q, 1000)], ConvertibleDebtNoncurrent: [i(Q[1], 639)], CommercialPaper: [i(Q[1], 600)], Liabilities: [i(Q[1], 3148)] })), { yieldPct: 5 });
  assert.equal(cp.debt, 639);   // the paper is a programme's size, not money owed for sure: it stays out
});

test('final check: a nuclear decommissioning trust is an interest-earning book in the estimate, beside the cash (Constellation: 20.5B, its estimate had fallen to the cash alone)', () => {
  const ceg = secInputs(company(ns({ Revenues: [f(...Q, 6000)], CashAndCashEquivalentsAtCarryingValue: [i(Q[1], 697)], LongTermInvestments: [i(Q[1], 500)],
    DecommissioningFundInvestments: [i(Q[1], 20492)], DecommissioningTrustAssetsAmount: [i(Q[1], 20583)] })), { yieldPct: 5 });
  assert.ok(Math.abs(ceg.illicit - (697 + 500 + 20583) * 0.05 * 91 / 365) < 1e-6, String(ceg.illicit));   // one figure of the two trust tags, on top
});
