// SEC XBRL companyfacts -> inputs for engine/shariah.js (progress/SHARIAH-PLAN.md parts L, M, T2). Pure, no I/O.
import { estimateInterest } from './shariah.js';

const FORMS = new Set(['10-Q', '10-K', '10-Q/A', '10-K/A']);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const nextDay = d => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
const rows = (ns, tag, unit = 'USD') => (ns?.[tag]?.units?.[unit] ?? []).filter(x => FORMS.has(x.form) && typeof x.val === 'number');
const latestFiled = (a, b) => (!a || b.filed > a.filed ? b : a);

export const REVENUE = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense'];
// Interest income tags. EXACT: interest only (a lower bound of the company's total interest). UPPER: interest plus
// other items (dividends, other income): an upper bound. Net figures such as InvestmentIncomeNet are excluded.
export const INTEREST_EXACT = ['InvestmentIncomeInterest', 'InterestIncomeOther', 'InterestIncomeOperating', 'InterestIncomeDepositsWithFinancialInstitutions',
  'InterestAndFeeIncomeLoansConsumer', 'InterestAndFeeIncomeLoansAndLeases', 'InterestAndFeeIncomeLoansCommercial', 'SalesTypeAndDirectFinancingLeasesInterestIncome',
  'InterestIncomeDebtSecuritiesAvailableForSaleAndHeldToMaturity', 'InterestIncomeSecuritiesTaxable'];
export const INTEREST_UPPER = ['InvestmentIncomeInterestAndDividend', 'InterestAndOtherIncome', 'InterestAndDividendIncomeOperating'];
// Interest-earning assets the cash-based estimate does not cover: with any of these, no estimate (G6.2).
const LOANS = ['FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss', 'LoansAndLeasesReceivableNetReportedAmount', 'NotesReceivableNet',
  'FinancingReceivableExcludingAccruedInterestBeforeAllowanceForCreditLoss', 'LoansReceivableNetReportedAmount', 'NetInvestmentInLease'];
const CASH = ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash'];
// with the current taxonomy's debt-securities tags and long-term investments (Arteris, Samsara, Aurora: audit 2026-11-22;
// long-term investments may hold shares too, which only raises the estimate)
const SEC_CUR = ['MarketableSecuritiesCurrent', 'ShortTermInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent',
  'DebtSecuritiesAvailableForSaleExcludingAccruedInterestCurrent', 'HeldToMaturitySecuritiesCurrent', 'DebtSecuritiesCurrent'];
const SEC_NONCUR = ['MarketableSecuritiesNoncurrent', 'AvailableForSaleSecuritiesDebtSecuritiesNoncurrent',
  'DebtSecuritiesAvailableForSaleExcludingAccruedInterestNoncurrent', 'HeldToMaturitySecuritiesNoncurrent', 'DebtSecuritiesNoncurrent', 'LongTermInvestments'];
// the same securities tagged only as a total (KLA: 3.2B available for sale, review 2026-11-22)
const SEC_TOTAL = ['AvailableForSaleSecuritiesDebtSecurities', 'MarketableSecurities', 'DebtSecuritiesAvailableForSaleExcludingAccruedInterest', 'HeldToMaturitySecurities'];
// interest on loans and finance leases: a company holding loans without one of these lines has interest no tag shows
// (Snap-on Credit). Their high reading charges the loans a lending rate of 20% a year.
const LEND_RATE = 20;
const LOAN_INTEREST = new Set(['InterestIncomeOperating', 'InterestAndFeeIncomeLoansConsumer', 'InterestAndFeeIncomeLoansAndLeases',
  'InterestAndFeeIncomeLoansCommercial', 'SalesTypeAndDirectFinancingLeasesInterestIncome', 'InterestAndDividendIncomeOperating']);
// Short-term borrowing lines (review 2026-11-22: securitisation at Corpay, lines of credit at Global Payments, other
// borrowings at Charter). They may sit inside the current portion of long-term debt (Corpay), include it (IBM, BMY), be
// the total of the others (Citigroup) or be a programme's size rather than money owed (Camden's 600M of commercial
// paper, nothing drawn): they count only in the high reading (audit 2026-11-22). The specific tags come first, so an
// amount tagged both as paper and as short-term borrowings is one line.
const SHORT = ['CommercialPaper', 'ShortTermBankLoansAndNotesPayable', 'SecuredDebtCurrent', 'LinesOfCreditCurrent', 'OtherShortTermBorrowings', 'ShortTermBorrowings'];
// convertible notes: inside LongTermDebt at most companies, beside it at some (SMCI: 4,669M beside a combined 3,977M)
const CONV_TOTAL = ['ConvertibleNotesPayable', 'ConvertibleDebt', 'ConvertibleSubordinatedDebt'];
const CONV_NC = ['ConvertibleLongTermNotesPayable', 'ConvertibleDebtNoncurrent', 'ConvertibleSubordinatedDebtNoncurrent'];
const CONV_CUR = ['ConvertibleNotesPayableCurrent', 'ConvertibleDebtCurrent', 'ConvertibleSubordinatedDebtCurrent'];
// Current assets the estimate may treat as not earning interest (one figure per group, the largest: a group's tags can
// nest). Whatever current assets these and the cash and securities lines leave unexplained counts as interest-earning
// (audit 2026-11-22: Energy Fuels keeps 779M of securities under its own tag, which companyfacts does not carry).
const CUR_GROUPS = [['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent', 'AccountsNotesAndLoansReceivableNetCurrent', 'AccountsAndOtherReceivablesNetCurrent'],
  ['NontradeReceivablesCurrent', 'OtherReceivablesNetCurrent'], ['IncomeTaxesReceivable'],
  ['InventoryNet', 'InventoryFinishedGoodsNetOfReserves', 'InventoryNetOfAllowancesCustomerAdvancesAndProgressBillings'],
  ['PrepaidExpenseAndOtherAssetsCurrent', 'PrepaidExpenseCurrent'], ['OtherAssetsCurrent'],
  ['ContractWithCustomerAssetNetCurrent', 'ContractWithCustomerAssetNet', 'UnbilledReceivablesCurrent', 'UnbilledContractsReceivable'], ['DerivativeAssetsCurrent'],
  ['AssetsHeldForSaleCurrent', 'DisposalGroupIncludingDiscontinuedOperationAssetsCurrent'], ['CryptoAssetFairValueCurrent'], ['EquitySecuritiesFvNiCurrent']];

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
// Two readings (audit 2026-11-22), because tags can overlap, miss lines or be misused: debt is the largest figure made
// only of lines that are debt and cannot overlap (it can prove a fail); debtHigh is the largest figure any reading of
// the tags gives (null when equal; it must stay under 30% to prove a pass). The balance sheet's debt lies between.
// ponytail: tags that bundle finance leases with debt (LongTermDebtAndCapitalLeaseObligations...) overstate it: stricter.
export function debtAt(ns, date) {
  const v = tags => instantAt(ns, [].concat(tags), date);
  const top = tags => Math.max(0, ...tags.map(t => v(t) ?? 0));
  const same = (a, b) => a > 0 && b > 0 && Math.abs(a - b) <= 0.02 * Math.max(a, b);
  const fin = v('FinanceLeaseLiability') ?? ((v('FinanceLeaseLiabilityCurrent') ?? 0) + (v('FinanceLeaseLiabilityNoncurrent') ?? 0));
  const op = v('OperatingLeaseLiability') ?? ((v('OperatingLeaseLiabilityCurrent') ?? 0) + (v('OperatingLeaseLiabilityNoncurrent') ?? 0));
  const leases = fin + op;
  const combined = v('DebtLongtermAndShorttermCombinedAmount');
  // a total that bundles finance leases loses the tagged ones (A2)
  const lt = v('LongTermDebt') ?? (x => (x == null ? null : Math.max(0, x - fin)))(v('LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities'));
  // noncurrent and current debt; a line that bundles finance leases loses them when they are tagged
  const flCur = v('FinanceLeaseLiabilityCurrent') ?? 0, flNc = v('FinanceLeaseLiabilityNoncurrent');
  const bundled = v('LongTermDebtAndCapitalLeaseObligations'), lessFl = x => (x == null ? null : Math.max(0, x - flCur));
  const nonCur = v(['LongTermDebtNoncurrent', 'LongTermNotesAndLoans', 'LongTermNotesPayable']) ?? (bundled == null ? null : bundled - (flNc ?? 0))
    ?? v('NotesPayableToBankNoncurrent');
  // DebtCurrent loses the current finance lease only when what is left is the other current debt lines (Micron: 491 is
  // its current finance lease, 491 - 491 = 0); KDP's 7,270 and PayPal's 2,533 hold no lease (audit 2026-11-22)
  const dcRaw = v('DebtCurrent'), others = (v('LongTermDebtCurrent') ?? 0) + top(SHORT);
  const near1 = (a, b) => Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b), 1);
  const dcFree = dcRaw == null ? null : flCur > 0 && near1(dcRaw - flCur, others) && !near1(dcRaw, others) ? Math.max(0, dcRaw - flCur) : dcRaw;
  const cur = v('LongTermDebtCurrent') ?? dcFree ?? lessFl(v('LongTermDebtAndCapitalLeaseObligationsCurrent')) ?? v(['NotesPayableCurrent', 'NotesAndLoansPayableCurrent']);
  const curLtd = v('LongTermDebtCurrent') ?? lessFl(v('LongTermDebtAndCapitalLeaseObligationsCurrent'));
  const parts = nonCur != null && cur != null ? nonCur + cur : null;
  // the short-term lines apart (one amount under two tags is one line; a line equal to the current portion is that
  // same money: IBM's 7.013B "short-term debt" holds the 7.009B portion; a line equal to the sum of the others is
  // their total)
  const c = lt != null ? curLtd : cur, lines = [];
  for (const t of SHORT) {
    const s = v(t), twin = lines.find(l => same(l.s, s));
    if (twin) twin.s = Math.max(twin.s, s); else if (s > 0 && !same(s, c)) lines.push({ t, s });
  }
  const stb = lines.find(l => l.t === 'ShortTermBorrowings'), rest = lines.filter(l => l !== stb), restSum = rest.reduce((a, l) => a + l.s, 0);
  const shortSum = stb && rest.length > 1 && same(stb.s, restSum) ? stb.s : (stb?.s ?? 0) + restSum;
  // the long-term debt with its current portion; a noncurrent line with only short-term lines beside it (PepsiCo:
  // 42,658 + 9,223 of short-term obligations, which hold the current portion). Only short-term lines (G6.1: BAX, TMUS,
  // ORA, DE): the long-term debt is under another tag, so the figure is incomplete and the liabilities bound is used.
  const base = combined ?? lt ?? parts ?? (nonCur != null && shortSum > 0 ? nonCur : null);
  if (base == null) return { debt: null, debtHigh: null, parts: { borrowings: null, leases } };
  const lo = [base];
  // LongTermDebt smaller than the noncurrent tag is itself a noncurrent line (Tapestry: 1,960 beside 2,000 + 597)
  if (lt != null && nonCur != null && lt < nonCur && curLtd != null) lo.push(lt + curLtd);
  // DebtCurrent is usually the balance sheet's whole current debt: commercial paper inside it is often tagged only on
  // an axis (Cisco 2026-10-24: 8.4B) and eBay's long-term debt is only under the bundled tag. Leases stay out (A2):
  // DebtCurrent loses the current finance lease when tagged, a bundled noncurrent line its tagged finance lease
  // (Micron's 4,688 holds 1,896), and a bundled line never stands beside the combined figure (Valero's 10,012 carries
  // leases it does not tag; its combined 8,579 does not). At IFF DebtCurrent is the current portion alone, beside 539
  // of paper: the high reading still adds the paper.
  const dc = dcFree;
  const pureNonCur = v(['LongTermDebtNoncurrent', 'LongTermNotesAndLoans', 'LongTermNotesPayable'])
    ?? (bundled != null && (flNc != null || combined == null) ? bundled - (flNc ?? 0) : null);
  const pureLt = v('LongTermDebt'), pureCurLtd = v('LongTermDebtCurrent');
  // the noncurrent part from its own tag or from LongTermDebt less its current portion (PayPal: 10,939 carrying or
  // 11,020 from its principal schedule): the low reading takes the smaller, the high one the larger
  const sure = [dc != null && pureNonCur != null && dc >= (curLtd ?? 0) ? pureNonCur + dc : null,
    dc != null && pureLt != null && pureCurLtd != null && dc >= pureCurLtd ? pureLt - pureCurLtd + dc : null].filter(x => x != null);
  // debt and finance leases together, less the finance leases (Marriott: 16,843 - 108, where LongTermDebt holds a stray 23)
  const daclo = v('DebtAndCapitalLeaseObligations');
  if (daclo != null && combined == null) lo.push(daclo - fin);
  // the high reading: every short-term line apart on top of the long-term readings (DebtCurrent already holds them),
  // the parts when larger, and LongTermDebt as a noncurrent line beside DebtCurrent (Adobe)
  const hi = [...lo.map(x => x + shortSum), ...sure];
  if (parts != null) hi.push(parts + shortSum);
  if (lt != null && curLtd == null && dc != null) hi.push(lt + dc + shortSum);
  if (sure.length) lo.push(Math.min(...sure));
  // A drawn long-term credit line (PSIX: 35M revolver beside 0.9M of other long-term debt) and convertible notes
  // (SMCI: 4,669M beside a combined 3,977M): debt for sure when larger than all the debt they could sit inside, else
  // perhaps inside it (high reading only); a credit line equal to the long-term line is that line (Rollins).
  let low = Math.max(...lo), high = Math.max(...hi);
  const loc = v('LongTermLineOfCredit'), host = pureNonCur ?? nonCur ?? (lt != null ? lt - (curLtd ?? 0) : null);
  if (loc > 0 && !same(loc, host)) { high += loc; if (!(host >= loc)) low += loc; }
  const conv = Math.max(top(CONV_TOTAL), top(CONV_NC) + top(CONV_CUR));
  if (conv > 0) { high += conv; if (conv > low) low += conv; }
  // ponytail: debt under a company's own (custom) tag is missed (Penske's floor-plan notes); the G3 hand check samples for it.
  return { debt: low, debtHigh: high > low ? high : null, parts: { borrowings: low, leases } };
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
  // Balances or cash flows of the last 400 days count (DE shows its receivables only in cash flows). Disclosures about
  // receivables (sold, significant sales, allowances, modifications) are not holdings: AVGO only discloses sold ones.
  const LOANISH = /(Financ\w*Receivable|Loans?(AndLeases)?Receivable|NetInvestmentInLease)/
  // Accounts...: trade receivables (PEP, CVX). Loans held for sale and balances after or before the allowance are held
  // loans (audit 2026-11-22: Carvana's 896M held for sale); sales of loans and the allowance itself are not.
  const NOT_HELD = /(^Accounts|Sold|(?<!HeldFor)Sale|Significant|(?<!After|Before)Allowance|Modification|Impaired|Writeoff|WriteOff|Recover|Collectively|Individually|Nonaccrual|PastDue|Troubled|Charge)/
  const recent = x => x.end <= rev.end && days(x.end, rev.end) <= 400 && x.val > 0
  const hasLoans = LOANS.some(t => (instantAt(g, [t], rev.end) ?? 0) > 0)
    || Object.values(cf.facts ?? {}).some(nsx => Object.entries(nsx).some(([t, v]) => LOANISH.test(t) && !NOT_HELD.test(t) && (v.units?.USD ?? []).some(recent)));
  // the loans to charge a lending rate: the largest loan balance (a current and a noncurrent part of one line on one
  // date added up: Caterpillar 11,051 + 14,402) or loan cash flow of the last 400 days (a flow stands in where no
  // balance is tagged: Corning collected 1.1B of finance receivables in 2025)
  const loanFacts = Object.values(cf.facts ?? {}).flatMap(nsx => Object.entries(nsx)
    .filter(([t]) => LOANS.includes(t) || (LOANISH.test(t) && !NOT_HELD.test(t))).flatMap(([t, x]) => (x.units?.USD ?? []).filter(recent).map(y => ({ t, ...y }))));
  const parts = new Map();   // base tag @ date -> sum of its current and noncurrent parts (a total stays as it is)
  for (const y of loanFacts) if (!y.start && /[Cc]urrent$/.test(y.t)) { const k = y.t.replace(/(Non)?[Cc]urrent$/, '') + '@' + y.end; parts.set(k, (parts.get(k) ?? 0) + y.val); }
  const loanBook = Math.max(0, ...parts.values(), ...loanFacts.map(y => y.val));
  const max = (tags, d) => Math.max(0, ...tags.map(t => instantAt(g, [t], d) ?? 0));
  const unexplainedAt = (d, c) => {
    const ac = instantAt(g, ['AssetsCurrent'], d);
    return ac == null ? 0 : Math.max(0, ac - (c ?? 0) - max(SEC_CUR, d) - CUR_GROUPS.reduce((a, grp) => a + max(grp, d), 0));
  };
  // a securities total counts only when no investment line is tagged (KLA) and it is not the cash itself (Natera):
  // filers' fair-value tables often hold the cash equivalents too (AMD's 14,107 holds 5,736; audit 2026-11-22); the
  // part of it already among the unexplained current assets is not counted twice
  const bal = d => {
    const c = instantAt(g, CASH, d);
    if (c == null) return null;
    const parts = max(SEC_CUR, d) + max(SEC_NONCUR, d), total = max(SEC_TOTAL, d), unexpl = unexplainedAt(d, c);
    const fromTotal = parts > 0 || Math.abs(total - c) <= 0.02 * Math.max(total, c) ? 0 : Math.max(0, total - unexpl);
    return c + parts + fromTotal + unexpl;
  };
  const prevEnd = quarterFacts(g, REVENUE).at(-2)?.end, qDays = days(rev.start, rev.end) + 1;
  const loanInterest = loanBook * LEND_RATE / 100 * qDays / 365;
  // No interest tagged: cash and securities at the corporate yield, and any loans at the lending rate (until the audit
  // of 2026-11-22 loans blocked the estimate: Linde's 29M note against 3.9B of cash left it unknown)
  if (int == null) {
    const end = bal(rev.end), start = prevEnd ? bal(prevEnd) : null;
    if (end != null) {
      estimate = { cashStart: start ?? end, cashEnd: end, yieldPct, days: qDays, ...(loanBook > 0 ? { loans: loanBook, lendPct: LEND_RATE } : {}) };
      const cashPart = estimateInterest(estimate);
      illicit = cashPart == null ? null : cashPart + loanInterest; illicitEstimated = illicit != null;
      // an insurer's published investment income is at least what its interest-earning book yields (AMERISAFE,
      // Primerica: their bonds held to maturity are not all tagged; audit 2026-11-22)
      const nii = top(['NetInvestmentIncome', 'GrossInvestmentIncomeOperating']);
      if (illicit != null && nii?.val > illicit) { illicit = nii.val; estimate = { ...estimate, published: nii.tag, publishedVal: nii.val }; }
    }
  }
  // A higher reading of the interest when a tagged figure is used (audit 2026-11-22): separate exact lines add up (IBM:
  // other interest 87 + lease interest 62), a lender's revenue not from contracts with customers may be financing income
  // (MercadoLibre's credit revenues), current assets no tagged line explains may earn interest booked in revenue (ADP's
  // 44.7B of client funds), and loans whose interest no tag shows earn a lending rate (Snap-on).
  let illicitHigh = null, illicitOpen = false;
  if (estimate == null && illicit != null) {
    const exacts = INTEREST_EXACT.map(t => quarterFacts(g, [t]).find(x => x.end === rev.end)).filter(Boolean), sep = [];
    for (const x of exacts) if (!sep.some(y => Math.abs(y - x.val) <= 0.02 * Math.max(y, x.val))) sep.push(x.val);
    const nonContract = quarterFacts(g, ['RevenueNotFromContractWithCustomer']).find(x => x.end === rev.end)?.val ?? 0;
    const unexpl = estimateInterest({ cashStart: prevEnd ? unexplainedAt(prevEnd, instantAt(g, CASH, prevEnd)) : 0, cashEnd: unexplainedAt(rev.end, instantAt(g, CASH, rev.end)), yieldPct, days: qDays }) ?? 0;
    // revenue outside contracts with customers is financing income only at a company that lends (MercadoLibre); at
    // others it is commodity contracts (Bunge), leases or regulated programmes (Sempra)
    const nii = top(['NetInvestmentIncome', 'GrossInvestmentIncomeOperating'])?.val ?? 0;   // published investment income
    let high = Math.max(sep.reduce((a, x) => a + x, 0), illicit + (hasLoans ? Math.max(0, nonContract) : 0), illicit + unexpl, nii);
    // loans earning less than 4% a year by their tagged interest: that interest is not all of it (IBM: 62 of lease
    // interest on 13,257 of loans and leases; Snap-on: none tagged), so the loans earn the lending rate instead
    const loanTagged = exacts.filter(x => LOAN_INTEREST.has(x.tag)).reduce((a, x) => Math.max(a, x.val), 0);
    if (hasLoans && loanBook > 0 && loanTagged * 365 / qDays < 0.04 * loanBook) high = Math.max(high, sep.reduce((a, x) => a + x, 0) - loanTagged + loanInterest, illicit + loanInterest);
    else if (hasLoans && !(loanBook > 0) && !loanTagged) illicitOpen = true;
    illicitHigh = high > illicit + 1e-9 ? high : null;
  }
  const d = debtAt(g, rev.end);
  // total liabilities; when not tagged, liabilities-and-equity minus the parent's equity (includes minority and mezzanine
  // equity, so it can only overstate: still an upper bound of the borrowings)
  const le = instantAt(g, ['LiabilitiesAndStockholdersEquity'], rev.end), se = instantAt(g, ['StockholdersEquity'], rev.end);
  const liabilities = instantAt(g, ['Liabilities'], rev.end) ?? (le != null && se != null ? le - se : null);
  const deiShares = (dei.EntityCommonStockSharesOutstanding?.units?.shares ?? []).filter(x => x.end >= rev.end && days(rev.end, x.end) <= 120)
    .reduce(latestFiled, null);
  const wq = quarterFacts(g, ['WeightedAverageNumberOfSharesOutstandingBasic'], 'shares', false);
  const wavg = wq.find(x => x.end === rev.end);
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
  // nothing usable tagged: net income / EPS, only when EPS is large enough that its rounding to the cent costs < 2.5%
  if (!sane.length && !(c > 0 && w > 0) && implied && Math.abs(eps) >= 0.2) sane.push(implied);
  const sharesMV = sane.length ? Math.min(...sane) : null;
  // A split restates the share counts of earlier periods in later filings; an IPO or a share issue does not (Cerebras
  // 1.58x, SpaceX 2.04x: audit 2026-11-22). The ratio is restated / original count of the period restated last; the
  // split falls after the original's filing and on or before the restating one. 50x or more is a unit error (Geron).
  let split = null;
  const periods = new Map();
  for (const x of rows(g, 'WeightedAverageNumberOfSharesOutstandingBasic', 'shares')) if (x.start && x.val > 0) {
    const k = x.start + '/' + x.end; periods.set(k, [...(periods.get(k) ?? []), x]);
  }
  // per period: after the last filing still unrestated, by the first restated one; one split restates many periods, so
  // the periods with the same ratio narrow the window together, and the most recent split is the one that matters
  const close = (a, b) => Math.abs(a / b - 1) <= 0.02, events = [];
  for (const xs of periods.values()) {
    const first = xs.reduce((a, b) => (b.filed < a.filed ? b : a)), last = xs.reduce(latestFiled, null), k = last.val / first.val;
    if (!((k >= 1.5 || k <= 1 / 1.5) && near(k, 1))) continue;
    const after = xs.filter(x => close(x.val, first.val)).reduce((a, b) => (b.filed > a.filed ? b : a)).filed;
    const until = xs.filter(x => close(x.val, last.val)).reduce((a, b) => (b.filed < a.filed ? b : a)).filed;
    const e = events.find(x => close(x.k, k));
    if (e) { e.after = e.after > after ? e.after : after; e.until = e.until < until ? e.until : until; } else events.push({ k, after, until });
  }
  for (const e of events) if (!split || e.until > split.until) split = e;
  // Contract revenue never holds interest (ASC 606): a lender's interest comes on top of it for the total revenue
  // R3 divides by (audit 2026-11-22: AXP's card fees alone made its interest 56.9% of "revenue", 36.3% of the total)
  const lenderTotal = /^RevenueFromContractWithCustomer/.test(rev.tag) && LOAN_INTEREST.has(int?.tag) && !illicitEstimated && illicit > 0;
  return {
    name: cf.entityName, period, revenue: lenderTotal ? rev.val + illicit : rev.val, revenueTag: lenderTotal ? `${rev.tag}+interest` : rev.tag,
    illicit, illicitHigh, illicitOpen, illicitTag: int?.tag ?? null, illicitEstimated, estimate,
    debt: d.debt, debtHigh: d.debtHigh, debtParts: d.parts, // all liabilities minus the lease liabilities still bound the borrowings from above
    debtUpperBound: d.debt == null && liabilities != null ? Math.max(0, liabilities - d.parts.leases) : null,
    bookEquity: instantAt(g, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], rev.end),
    // purification is owed per share held when the statements are issued: the cover-page count
    shares: c > 0 && sane.includes(c) ? c : sharesMV, sharesMV,
    sharesSource: c > 0 && sane.includes(c) ? 'cover' : w > 0 && sane.includes(w) ? 'weighted' : sharesMV != null ? 'implied' : null,
    splitRatio: split?.k ?? null, splitWindow: split ? [split.after, split.until] : null,
  };
}
