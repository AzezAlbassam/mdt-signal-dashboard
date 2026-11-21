// SEC XBRL companyfacts -> inputs for engine/shariah.js (progress/SHARIAH-PLAN.md parts L, M, T2). Pure, no I/O.
import { estimateInterest } from './shariah.js';

const FORMS = new Set(['10-Q', '10-K', '10-Q/A', '10-K/A']);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const nextDay = d => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
const rows = (ns, tag, unit = 'USD') => (ns?.[tag]?.units?.[unit] ?? []).filter(x => FORMS.has(x.form) && typeof x.val === 'number');
const latestFiled = (a, b) => (!a || b.filed > a.filed ? b : a);

export const REVENUE = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet'];
// Gross interest (or interest plus dividends: overstates, cautious). Net figures such as InvestmentIncomeNet are excluded.
export const INTEREST = ['InvestmentIncomeInterest', 'InvestmentIncomeInterestAndDividend', 'InterestIncomeOther', 'InterestAndOtherIncome', 'InterestIncomeOperating', 'InterestAndDividendIncomeOperating'];
const CASH = ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'];
const SEC_CUR = ['MarketableSecuritiesCurrent', 'ShortTermInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'];
const SEC_NONCUR = ['MarketableSecuritiesNoncurrent', 'AvailableForSaleSecuritiesDebtSecuritiesNoncurrent'];

// Three-month facts of one tag (latest filing per period) plus Q4 derived from the annual figure.
function quartersOfTag(ns, tag, unit) {
  const q = new Map(), annual = new Map();
  for (const x of rows(ns, tag, unit)) {
    if (!x.start) continue;
    const n = days(x.start, x.end), key = x.start + '/' + x.end;
    if (n >= 80 && n <= 100) q.set(key, latestFiled(q.get(key), x));
    else if (n >= 350 && n <= 380) annual.set(key, latestFiled(annual.get(key), x));
  }
  const out = [...q.values()].map(x => ({ tag, start: x.start, end: x.end, val: x.val, form: x.form, filed: x.filed }));
  for (const a of annual.values()) {
    if (out.some(x => x.end === a.end)) continue;
    const three = out.filter(x => x.start >= a.start && x.end < a.end).sort((x, y) => x.end.localeCompare(y.end));
    if (three.length !== 3) continue;
    out.push({ tag, start: nextDay(three[2].end), end: a.end, val: a.val - three.reduce((s, x) => s + x.val, 0), form: a.form, filed: a.filed, derived: true });
  }
  return out;
}

// All quarters for the first tag (in priority order) that reports each period end, sorted by end.
export function quarterFacts(ns, tags, unit = 'USD') {
  const byEnd = new Map();
  for (const t of tags) for (const x of quartersOfTag(ns, t, unit)) if (!byEnd.has(x.end)) byEnd.set(x.end, x);
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

// Interest-bearing debt on one balance-sheet date. Leases added (A2 default). null when incomplete.
export function debtAt(ns, date) {
  const v = tags => instantAt(ns, [].concat(tags), date);
  const st = Math.max(v('ShortTermBorrowings') ?? 0, v('CommercialPaper') ?? 0);
  const fin = v('FinanceLeaseLiability') ?? ((v('FinanceLeaseLiabilityCurrent') ?? 0) + (v('FinanceLeaseLiabilityNoncurrent') ?? 0));
  const op = v('OperatingLeaseLiability') ?? ((v('OperatingLeaseLiabilityCurrent') ?? 0) + (v('OperatingLeaseLiabilityNoncurrent') ?? 0));
  const leases = fin + op;
  let borrowings = v('DebtLongtermAndShorttermCombinedAmount');
  if (borrowings == null) {
    const lt = v('LongTermDebt'), nonCur = v(['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations']);
    const cur = v(['LongTermDebtCurrent', 'DebtCurrent']);
    if (lt != null) borrowings = lt + st;
    else if (nonCur != null && cur != null) borrowings = nonCur + cur + st;
    else if (nonCur == null && cur != null) borrowings = cur + st;
    else if (nonCur == null && (v('ShortTermBorrowings') != null || v('CommercialPaper') != null)) borrowings = st;
  }
  // ponytail: debt under a company's own (custom) tag is missed; the G3 hand check samples for it.
  return { debt: borrowings == null ? null : borrowings + leases, parts: { borrowings, leases } };
}

// Inputs for the latest quarter that has revenue. Market value is added by the page (quarter-average price).
export function secInputs(cf, { yieldPct, minEnd = '' }) {
  const g = cf.facts?.['us-gaap'] ?? {}, dei = cf.facts?.dei ?? {};
  const rev = quarterFacts(g, REVENUE).at(-1);
  if (!rev) return { name: cf.entityName, period: null };
  // T4: an old quarter (the company stopped using these tags) is never taken as the latest
  if (rev.end < minEnd) return { name: cf.entityName, period: null, stale: rev.end };
  const period = { start: rev.start, end: rev.end, form: rev.form, filed: rev.filed, derived: !!rev.derived };
  const int = quarterFacts(g, INTEREST).find(x => x.end === rev.end);
  let illicit = int?.val ?? null, illicitEstimated = false, estimate = null;
  if (int == null) {
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
  const wavg = quarterFacts(g, ['WeightedAverageNumberOfSharesOutstandingBasic'], 'shares').find(x => x.end === rev.end);
  return {
    name: cf.entityName, period, revenue: rev.val, revenueTag: rev.tag,
    illicit, illicitTag: int?.tag ?? null, illicitEstimated, estimate,
    debt: d.debt, debtParts: d.parts, debtUpperBound: d.debt == null ? instantAt(g, ['Liabilities'], rev.end) : null,
    bookEquity: instantAt(g, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], rev.end),
    shares: deiShares?.val ?? wavg?.val ?? null, sharesSource: deiShares ? 'cover' : wavg ? 'weighted' : null,
  };
}
