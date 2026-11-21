// SEC XBRL companyfacts -> inputs for engine/shariah.js (progress/SHARIAH-PLAN.md parts L, M, T2). Pure, no I/O.
import { estimateInterest } from './shariah.js';

const FORMS = new Set(['10-Q', '10-K', '10-Q/A', '10-K/A']);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const nextDay = d => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
const rows = (ns, tag, unit = 'USD') => (ns?.[tag]?.units?.[unit] ?? []).filter(x => FORMS.has(x.form) && typeof x.val === 'number');
const latestFiled = (a, b) => (!a || b.filed > a.filed ? b : a);

export const REVENUE = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet'];
// Interest income tags. EXACT: interest only (a lower bound of the company's total interest). UPPER: interest plus
// other items (dividends, other income): an upper bound. Net figures such as InvestmentIncomeNet are excluded.
export const INTEREST_EXACT = ['InvestmentIncomeInterest', 'InterestIncomeOther', 'InterestIncomeOperating', 'InterestIncomeDepositsWithFinancialInstitutions',
  'InterestAndFeeIncomeLoansConsumer', 'InterestAndFeeIncomeLoansAndLeases', 'InterestAndFeeIncomeLoansCommercial', 'SalesTypeAndDirectFinancingLeasesInterestIncome',
  'InterestIncomeDebtSecuritiesAvailableForSaleAndHeldToMaturity', 'InterestIncomeSecuritiesTaxable'];
export const INTEREST_UPPER = ['InvestmentIncomeInterestAndDividend', 'InterestAndOtherIncome', 'InterestAndDividendIncomeOperating'];
// Interest-earning assets the cash-based estimate does not cover: with any of these, no estimate (G6.2).
const LOANS = ['FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss', 'LoansAndLeasesReceivableNetReportedAmount', 'NotesReceivableNet',
  'FinancingReceivableExcludingAccruedInterestBeforeAllowanceForCreditLoss', 'LoansReceivableNetReportedAmount', 'NetInvestmentInLease'];
const CASH = ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'];
const SEC_CUR = ['MarketableSecuritiesCurrent', 'ShortTermInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'];
const SEC_NONCUR = ['MarketableSecuritiesNoncurrent', 'AvailableForSaleSecuritiesDebtSecuritiesNoncurrent'];

// Three-month facts of one tag (latest filing per period) plus Q4 derived from the annual figure.
function quartersOfTag(ns, tag, unit, derive = true) {
  const q = new Map(), annual = new Map();
  for (const x of rows(ns, tag, unit)) {
    if (!x.start) continue;
    const n = days(x.start, x.end), key = x.start + '/' + x.end;
    if (n >= 80 && n <= 100) q.set(key, latestFiled(q.get(key), x));
    else if (n >= 350 && n <= 380) annual.set(key, latestFiled(annual.get(key), x));
  }
  const out = [...q.values()].map(x => ({ tag, start: x.start, end: x.end, val: x.val, form: x.form, filed: x.filed }));
  for (const a of derive ? annual.values() : []) {
    if (out.some(x => x.end === a.end)) continue;
    const three = out.filter(x => x.start >= a.start && x.end < a.end).sort((x, y) => x.end.localeCompare(y.end));
    if (three.length !== 3) continue;
    out.push({ tag, start: nextDay(three[2].end), end: a.end, val: a.val - three.reduce((s, x) => s + x.val, 0), form: a.form, filed: a.filed, derived: true });
  }
  return out;
}

// All quarters for the first tag (in priority order) that reports each period end, sorted by end.
// derive = false for averages (weighted shares), where "year minus three quarters" means nothing (G6.5).
export function quarterFacts(ns, tags, unit = 'USD', derive = true) {
  const byEnd = new Map();
  for (const t of tags) for (const x of quartersOfTag(ns, t, unit, derive)) if (!byEnd.has(x.end)) byEnd.set(x.end, x);
  return [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end));
}

export function instantAt(ns, tags, date, unit = 'USD') {
  for (const t of tags) {
    let best = null;
    for (const x of rows(ns, t, unit)) if (!x.start && x.end === date) best = latestFiled(best, x);
    if (best) return best.val;
  }
  return null;
}

// Interest-bearing debt on one balance-sheet date; null when incomplete. Lease liabilities are NOT debt (A2, owner
// 2026-11-21, following Al Rajhi's own list) but are returned in parts for the page.
// ponytail: tags that bundle finance leases with debt (LongTermDebtAndCapitalLeaseObligations...) overstate it: stricter.
export function debtAt(ns, date) {
  const v = tags => instantAt(ns, [].concat(tags), date);
  const st = Math.max(v('ShortTermBorrowings') ?? 0, v('CommercialPaper') ?? 0);
  const fin = v('FinanceLeaseLiability') ?? ((v('FinanceLeaseLiabilityCurrent') ?? 0) + (v('FinanceLeaseLiabilityNoncurrent') ?? 0));
  const op = v('OperatingLeaseLiability') ?? ((v('OperatingLeaseLiabilityCurrent') ?? 0) + (v('OperatingLeaseLiabilityNoncurrent') ?? 0));
  const leases = fin + op;
  let borrowings = v('DebtLongtermAndShorttermCombinedAmount');
  if (borrowings == null) {
    const lt = v(['LongTermDebt', 'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities']);
    const nonCur = v(['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations']);
    const cur = v(['LongTermDebtCurrent', 'DebtCurrent']);
    if (lt != null) borrowings = lt + st;
    else if (nonCur != null && cur != null) borrowings = nonCur + cur + st;
    // Only short-term lines (G6.1: BAX, TMUS, ORA, DE): the long-term debt is under another tag, so the figure is
    // incomplete and the liabilities upper bound is used instead.
  }
  // ponytail: debt under a company's own (custom) tag is missed; the G3 hand check samples for it.
  return { debt: borrowings, parts: { borrowings, leases } };
}

// Inputs for the latest quarter that has revenue. Market value is added by the page (quarter-average price).
export function secInputs(cf, { yieldPct, minEnd = '' }) {
  const g = cf.facts?.['us-gaap'] ?? {}, dei = cf.facts?.dei ?? {};
  const rev = quarterFacts(g, REVENUE).at(-1);
  if (!rev) return { name: cf.entityName, period: null };
  // T4: an old quarter (the company stopped using these tags) is never taken as the latest
  if (rev.end < minEnd) return { name: cf.entityName, period: null, stale: rev.end };
  const period = { start: rev.start, end: rev.end, form: rev.form, filed: rev.filed, derived: !!rev.derived };
  // Largest figure of each kind for this quarter (a smaller tag never wins: G6.6).
  const top = tags => tags.map(t => quarterFacts(g, [t]).find(x => x.end === rev.end)).filter(Boolean).sort((a, b) => b.val - a.val)[0] ?? null;
  const exact = top(INTEREST_EXACT), upper = top(INTEREST_UPPER);
  let int = exact, illicit = exact?.val ?? null, illicitEstimated = false, estimate = null;
  // An exact figure above 5% decides; otherwise the larger upper-bound figure is used (it can prove a pass only).
  if (upper && !(exact && rev.val > 0 && exact.val / rev.val > 0.05) && upper.val > (exact?.val ?? -Infinity)) {
    int = upper; illicit = upper.val; illicitEstimated = true;
  }
  // Also any company-specific tag that names finance receivables or loans (DE: de:FinancingReceivables...).
  // Balances or cash flows of the last 400 days count (DE shows its receivables only in cash flows).
  const LOANISH = /(Financ\w*Receivable|Loans?(AndLeases)?Receivable|NetInvestmentInLease)/
  const recent = x => x.end <= rev.end && days(x.end, rev.end) <= 400 && x.val > 0
  const hasLoans = LOANS.some(t => (instantAt(g, [t], rev.end) ?? 0) > 0)
    || Object.values(cf.facts ?? {}).some(nsx => Object.entries(nsx).some(([t, v]) => LOANISH.test(t) && (v.units?.USD ?? []).some(recent)));
  if (int == null && !hasLoans) {
    const bal = d => {
      const c = instantAt(g, CASH, d);
      return c == null ? null : c + Math.max(0, ...SEC_CUR.map(t => instantAt(g, [t], d) ?? 0)) + Math.max(0, ...SEC_NONCUR.map(t => instantAt(g, [t], d) ?? 0));
    };
    const prevEnd = quarterFacts(g, REVENUE).at(-2)?.end;
    const end = bal(rev.end), start = prevEnd ? bal(prevEnd) : null;
    if (end != null) {
      estimate = { cashStart: start ?? end, cashEnd: end, yieldPct, days: days(rev.start, rev.end) + 1 };
      illicit = estimateInterest(estimate); illicitEstimated = illicit != null;
    }
  }
  const d = debtAt(g, rev.end);
  const deiShares = (dei.EntityCommonStockSharesOutstanding?.units?.shares ?? []).filter(x => x.end >= rev.end && days(rev.end, x.end) <= 120)
    .reduce(latestFiled, null);
  const wavg = quarterFacts(g, ['WeightedAverageNumberOfSharesOutstandingBasic'], 'shares', false).find(x => x.end === rev.end);
  // Market value uses the smaller count (G6.4): a split or new shares after the quarter can only lower it (stricter).
  // A count 50x away from the other is a unit error (TEM reports thousands) and is dropped.
  // Implied count = net income / EPS of the quarter, when both are there and not tiny: a count 50x away is a unit error.
  const ni = quarterFacts(g, ['NetIncomeLoss']).find(x => x.end === rev.end)?.val;
  const eps = quarterFacts(g, ['EarningsPerShareBasic'], 'USD/shares').find(x => x.end === rev.end)?.val;
  const implied = ni && eps && Math.abs(eps) >= 0.01 ? Math.abs(ni / eps) : null;
  const near = (a, b) => a / b <= 50 && b / a <= 50;
  let c = deiShares?.val, w = wavg?.val;
  if (implied) { if (!(c > 0 && near(c, implied))) c = undefined; if (!(w > 0 && near(w, implied))) w = undefined; }
  const sane = c > 0 && w > 0 ? (near(c, w) ? [c, w] : []) : [c, w].filter(x => x > 0);
  const sharesMV = sane.length ? Math.min(...sane) : null;
  return {
    name: cf.entityName, period, revenue: rev.val, revenueTag: rev.tag,
    illicit, illicitTag: int?.tag ?? null, illicitEstimated, estimate,
    debt: d.debt, debtParts: d.parts, // all liabilities minus the lease liabilities still bound the borrowings from above
    debtUpperBound: d.debt == null && instantAt(g, ['Liabilities'], rev.end) != null ? Math.max(0, instantAt(g, ['Liabilities'], rev.end) - d.parts.leases) : null,
    bookEquity: instantAt(g, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], rev.end),
    // purification is owed per share held when the statements are issued: the cover-page count
    shares: c > 0 && sane.includes(c) ? c : sharesMV, sharesMV, sharesSource: c > 0 && sane.includes(c) ? 'cover' : wavg ? 'weighted' : null,
  };
}
