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
const TRUST = ['DecommissioningFundInvestments', 'DecommissioningTrustAssetsAmount'];
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
// noncurrent debt lines debtAt does not read as such, which can show that LongTermDebt holds its current portion
// (Conagra's senior notes, Sarepta's loans payable: final check 2026-11-22)
const LT_LINES = ['SeniorLongTermNotes', 'LongTermLoansPayable', 'UnsecuredLongTermDebt', 'SecuredLongTermDebt', 'SubordinatedLongTermDebt', 'OtherLongTermDebtNoncurrent'];
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
  // prepaid expenses with the lines that are often inside "prepaid expenses and other current assets": one figure, the
  // largest (final check 2026-11-22: Mastercard's 1,126 of tax receivable inside its 4,370 came off twice). Current loans
  // earn the lending rate, by their tagged interest or at 20% in the loan book, not again the yield (fix review: Dell).
  ['PrepaidExpenseAndOtherAssetsCurrent', 'PrepaidExpenseCurrent', 'IncomeTaxReceivable', 'CapitalizedContractCostNetCurrent',
    'NotesAndLoansReceivableNetCurrent', 'FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLossCurrent'], ['OtherAssetsCurrent'],
  ['ContractWithCustomerAssetNetCurrent', 'ContractWithCustomerAssetNet', 'UnbilledReceivablesCurrent', 'UnbilledContractsReceivable'], ['DerivativeAssetsCurrent'],
  ['AssetsHeldForSaleCurrent', 'DisposalGroupIncludingDiscontinuedOperationAssetsCurrent', 'AssetsOfDisposalGroupIncludingDiscontinuedOperationCurrent'], ['CryptoAssetFairValueCurrent'], ['EquitySecuritiesFvNiCurrent']];

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
// zero: convertible notes the filing shows at 0.00% (data/shariah/zero-coupon.json): in the high reading only until the
// owner decides whether they are interest-bearing debt (A4)
export function debtAt(ns, date, { leaseTotal = true, zero = 0 } = {}) {
  const raw = tags => instantAt(ns, [].concat(tags), date);
  const same = (a, b) => a > 0 && b > 0 && Math.abs(a - b) <= 0.02 * Math.max(a, b);
  const near1 = (a, b) => Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b), 1);
  // (leaseTotal false: a FinanceLeaseLiability total is not read, for the high reading of one that other filings contradict)
  const fin = (leaseTotal ? raw('FinanceLeaseLiability') : null) ?? ((raw('FinanceLeaseLiabilityCurrent') ?? 0) + (raw('FinanceLeaseLiabilityNoncurrent') ?? 0));
  const op = raw('OperatingLeaseLiability') ?? ((raw('OperatingLeaseLiabilityCurrent') ?? 0) + (raw('OperatingLeaseLiabilityNoncurrent') ?? 0));
  const leases = fin + op;
  // a finance lease tagged only as a total comes out of the bundled lines all the same (fix review 2026-11-22: Waste
  // Management's 1,630 stayed inside its 23,370 while the panel said it was not counted)
  const flCur = raw('FinanceLeaseLiabilityCurrent') ?? 0, flNc = raw('FinanceLeaseLiabilityNoncurrent') ?? (fin > flCur ? fin - flCur : null);
  const bundled = raw('LongTermDebtAndCapitalLeaseObligations'), bundledCur = raw('LongTermDebtAndCapitalLeaseObligationsCurrent');
  // a plain debt tag equal to its lease-bundled twin is that line: the tagged finance leases come out of it too (final
  // check 2026-11-22: Honeywell's LongTermDebt 14,169 = 10,386 + 3,783, Campbell's combined 7,137 = DebtCurrent 977 + the
  // bundled 6,160; Iron Mountain tags its bundled lines under the plain tags as well)
  // (to 0.1%: NRG's LongTermDebt 23,052, 0.6% above its bundled lines, is their total less the leases)
  const twin = (x, b, l) => (x != null && b != null && l > 0 && Math.abs(x - b) <= 0.001 * Math.max(Math.abs(x), Math.abs(b), 1) ? Math.max(0, x - l) : x);
  const combinedRaw = raw('DebtLongtermAndShorttermCombinedAmount'), dcRaw0 = raw('DebtCurrent');
  const adj = {
    LongTermDebtNoncurrent: twin(raw('LongTermDebtNoncurrent'), bundled, flNc),
    LongTermDebtCurrent: twin(raw('LongTermDebtCurrent'), bundledCur, flCur),
    LongTermDebt: twin(raw('LongTermDebt'), bundled != null && bundledCur != null ? bundled + bundledCur : null, fin),
    DebtLongtermAndShorttermCombinedAmount: twin(combinedRaw, dcRaw0 != null && bundled != null ? dcRaw0 + bundled : null, fin),
    DebtCurrent: twin(dcRaw0, combinedRaw != null && bundled != null ? combinedRaw - bundled : null, flCur),
  };
  const v = tags => { for (const t of [].concat(tags)) { const x = t in adj ? adj[t] : raw(t); if (x != null) return x; } return null; };
  const top = tags => Math.max(0, ...tags.map(t => v(t) ?? 0));
  const combined = v('DebtLongtermAndShorttermCombinedAmount');
  // a total that bundles finance leases loses the tagged ones (A2)
  const lt = v('LongTermDebt') ?? (x => (x == null ? null : Math.max(0, x - fin)))(v('LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities'));
  // noncurrent and current debt; a line that bundles finance leases loses them when they are tagged
  const lessFl = x => (x == null ? null : Math.max(0, x - flCur));
  const nonCur = v(['LongTermDebtNoncurrent', 'LongTermNotesAndLoans', 'LongTermNotesPayable']) ?? (bundled == null ? null : bundled - (flNc ?? 0))
    ?? v('NotesPayableToBankNoncurrent');
  // DebtCurrent loses the current finance lease only when what is left is the other current debt lines (Micron: 491 is
  // its current finance lease, 491 - 491 = 0); KDP's 7,270 and PayPal's 2,533 hold no lease (audit 2026-11-22)
  const dcRaw = v('DebtCurrent'), others = (v('LongTermDebtCurrent') ?? 0) + top(SHORT);
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
  // (a short-term line tagged at zero is that current line too: Cognizant's 0 beside 1,552; fix review 2026-11-22)
  const base = combined ?? lt ?? parts ?? (nonCur != null && SHORT.some(t => v(t) != null) ? nonCur : null);
  // the larger of the two credit-line tags (they can hold each other: Arrowhead's 195.4 holds its 155.4 long-term part)
  const ltLoc = v('LongTermLineOfCredit') ?? 0, loc = Math.max(ltLoc, v('LineOfCredit') ?? 0);
  const conv = Math.max(top(CONV_TOTAL), top(CONV_NC) + top(CONV_CUR));
  // the convertibles the filing shows at 0.00% (no more than are tagged)
  const z = Math.min(zero ?? 0, conv);
  // no long-term line at all: a drawn long-term credit line and convertible notes are debt for sure (Ironwood's 325,
  // Dropbox's 2,580.2 term loan, BlackLine's 1.00% notes), less the 0.00% notes (Akamai's 3,455.6 of 7,567.7); an unnamed
  // LineOfCredit is not (Toll Brothers' 2,507.7 is what its joint ventures borrowed). secInputs keeps the liabilities
  // bound as the pass test (fix review and final check 2026-11-22)
  // Short-term lines beside them (no current portion is tagged that they could hold) are debt for sure too, except
  // commercial paper, which can be a programme's size (final check 2026-11-22: Opendoor's 2,016 of asset-backed lines)
  if (base == null) {
    const sureShort = (stb && rest.length > 1 && same(stb.s, restSum) ? [stb] : lines).filter(l => l.t !== 'CommercialPaper').reduce((a, l) => a + l.s, 0);
    const sure0 = ltLoc + sureShort + conv - z;
    return conv + loc > 0 ? { debt: sure0 > 0 ? sure0 : null, debtHigh: null, partial: true, parts: { borrowings: sure0 > 0 ? sure0 : null, leases } }
      : { debt: null, debtHigh: null, parts: { borrowings: null, leases } };
  }
  const lo = [base];
  // LongTermDebt smaller than the noncurrent tag is itself a noncurrent line (Tapestry: 1,960 beside 2,000 + 597)
  // (only where no finance lease is tagged: beside a bundled line with leases the comparison is not like for like)
  if (lt != null && nonCur != null && lt < nonCur && curLtd != null && !(fin > 0)) lo.push(lt + curLtd);
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
  // (no more than the balance sheet's own pair where there is one: MPC tags a principal total of 33,492, before
  // discounts and with untagged leases, beside 32,894 + 128; the larger stays in the high reading. Fix review 2026-11-22)
  const daclo = v('DebtAndCapitalLeaseObligations'), dacloFree = daclo != null && combined == null ? daclo - fin : null;
  if (dacloFree != null) lo.push(parts != null ? Math.min(dacloFree, parts) : dacloFree);
  // the high reading: every short-term line apart on top of the long-term readings (DebtCurrent already holds them),
  // the parts when larger, and LongTermDebt as a noncurrent line beside DebtCurrent (Adobe)
  // (fix review 2026-11-22: DebtCurrent holds the short lines, so the parts built on it add none; LongTermDebt is a
  // noncurrent line beside DebtCurrent only when no noncurrent tag shows it holding a current portion: Hubbell, Boeing;
  // with no noncurrent tag it may be the noncurrent line beside its current maturities: Halliburton 7,072 + 90)
  const hi = [...lo.map(x => x + shortSum), ...sure];
  if (dacloFree != null) hi.push(dacloFree);
  if (parts != null) hi.push(parts + (v('LongTermDebtCurrent') == null && dcFree != null ? 0 : shortSum));
  if (lt != null && curLtd == null && dc != null && (nonCur == null || same(nonCur, lt))) hi.push(lt + dc + shortSum);
  // (not where LongTermDebt is the current portion itself, or another tagged noncurrent line plus it: then it holds it.
  // Final check 2026-11-22: Conagra's senior notes 6,940.1 + 787.5, Sarepta's loans payable 699.4 + 158.0, Fusemachines)
  const ltPlain = v('LongTermDebt');
  if (ltPlain != null && nonCur == null && curLtd != null) {
    const lines2 = LT_LINES.map(t => raw(t)).filter(x => x > 0), sum2 = lines2.reduce((a, x) => a + x, 0);
    if (!(same(ltPlain, curLtd) || [...lines2, sum2].some(x => x > 0 && near1(x + curLtd, ltPlain)))) hi.push(ltPlain + curLtd + shortSum);
  }
  if (sure.length) lo.push(Math.min(...sure));
  // the debt total less its finance leases may hold short-term lines the pair does not (Lennox's 455.1 of commercial
  // paper): the low reading takes it up to the pair plus those lines (final check 2026-11-22)
  if (dacloFree != null && parts != null) lo.push(Math.min(dacloFree, parts + shortSum));
  // A drawn long-term credit line (PSIX: 35M revolver beside 0.9M of other long-term debt) and convertible notes (SMCI:
  // 4,669M beside a combined 3,977M): debt for sure when larger than all the debt they could sit inside, else perhaps
  // inside it (high reading only); a credit line equal to the long-term line is that line (Rollins). An unnamed
  // LineOfCredit is in the high reading only (Toll's joint ventures), and so are the 0.00% notes (final check 2026-11-22).
  let low = Math.max(...lo), high = Math.max(...hi);
  const host = pureNonCur ?? nonCur ?? (lt != null ? lt - (curLtd ?? 0) : null);
  // (a line of credit equal to a short-term line is that line: M&T's 6,300 beside 6,373 of short-term borrowings)
  const own = x => x > 0 && !same(x, host) && !lines.some(l => same(l.s, x));
  if (own(loc)) high += loc;
  if (own(ltLoc) && !(host >= ltLoc)) low += ltLoc;
  // (a convertible that is the whole figure is that figure: Tyler's 1,410 combined is its convertible notes). The 0.00%
  // notes come out of the sure reading wherever they sit: beside the base (SMCI's 2,267), inside it (Bill's 1,507.4 in
  // its LongTermDebt) or as the whole of it (Onto)
  if (conv > 0 && !same(conv, base)) { high += conv; if (conv > low) low += conv - z; else low = Math.max(0, low - z); }
  else if (z > 0) low = Math.max(0, low * (1 - z / conv));
  // a lease total another filing contradicts for a date of the last 400 days may hold other debt: the high reading
  // keeps it (final check 2026-11-22: Waste Management's 10-Q tags its "Financing leases and other" line, 1,284 at
  // 2025-12-31, where its 10-K gave 563 of leases for that date)
  if (leaseTotal && raw('FinanceLeaseLiability') != null) {
    const by = new Map();
    for (const x of rows(ns, 'FinanceLeaseLiability')) if (!x.start && x.end <= date && days(x.end, date) <= 400) by.set(x.end, [...(by.get(x.end) ?? []), x.val]);
    if ([...by.values()].some(vs => Math.max(...vs) - Math.min(...vs) > 0.02 * Math.max(...vs.map(Math.abs)))) {
      const s = debtAt(ns, date, { leaseTotal: false, zero }); high = Math.max(high, s.debtHigh ?? s.debt ?? 0);
      // (the page calls it a line that may hold other debt, counted in the high reading, not "leases, not counted")
      return { debt: low, debtHigh: high > low ? high : null, parts: { borrowings: low, leases, leaseDoubt: raw('FinanceLeaseLiability') } };
    }
  }
  // ponytail: debt under a company's own (custom) tag is missed (Penske's floor-plan notes); the G3 hand check samples for it.
  return { debt: low, debtHigh: high > low ? high : null, parts: { borrowings: low, leases } };
}

// Inputs for the latest quarter that has revenue. Market value is added by the page (quarter-average price).
// zeroCoupon: this company's entry in data/shariah/zero-coupon.json, {period, zero}: 0.00% convertible notes read from a
// filing; it applies from its period on, to no more notes than are tagged (debtAt)
export function secInputs(cf, { yieldPct, minEnd = '', sic = null, zeroCoupon = null }) {
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
  // (notes receivable from related parties too: Muscle Maker Grill's 12% notes; audit round 2. Not every note: a broad
  // rule took trade receivables and Verizon's gross device plans)
  const LOANISH = /(Financ\w*Receivable|Loans?(AndLeases)?Receivable|NetInvestmentInLease|NotesReceivable\w*RelatedPart|OriginationOfNotesReceivable)/
  // Accounts...: trade receivables (PEP, CVX). Loans held for sale and balances after or before the allowance are held
  // loans (audit 2026-11-22: Carvana's 896M held for sale); sales of loans and the allowance itself are not.
  // (sales-type lease investments are held: 'SalesType' is no sale; their undiscounted payments and unearned income are no
  // balance: final check 2026-11-22, Intuitive Surgical's 366.0 net beside 396.9 of payments)
  const NOT_HELD = /(^Accounts|Sold|(?<!HeldFor)Sale(?!sType)|PaymentsToBeReceived|Undiscounted|Significant|(?<!After|Before)Allowance|Modification|Impaired|Writeoff|WriteOff|Recover|Collectively|Individually|Nonaccrual|PastDue|Troubled|Charge|CreditLossExpense|IncreaseDecrease)/
  const recent = x => x.end <= rev.end && days(x.end, rev.end) <= 400 && x.val > 0
  const hasLoans = LOANS.some(t => (instantAt(g, [t], rev.end) ?? 0) > 0)
    || Object.values(cf.facts ?? {}).some(nsx => Object.entries(nsx).some(([t, v]) => LOANISH.test(t) && !NOT_HELD.test(t) && (v.units?.USD ?? []).some(recent)));
  // the loans to charge a lending rate: the largest loan balance (a current and a noncurrent part of one line on one
  // date added up: Caterpillar 11,051 + 14,402) or loan cash flow of the last 400 days, whichever is larger (Corning
  // collected 1.1B of finance receivables in 2025; Deere's only us-gaap balance is a 2.6B lease investment beside 26.5B
  // of collections: balances first passed its R3 on a fifth of its book, fix review 2026-11-22). A flow that overstates
  // the book leaves R3 open, never passes it.
  // each fact once (later filings repeat earlier balances as comparatives: the latest filing's value counts)
  const loanFacts = Object.values(cf.facts ?? {}).flatMap(nsx => Object.entries(nsx)
    .filter(([t]) => LOANS.includes(t) || (LOANISH.test(t) && !NOT_HELD.test(t))).flatMap(([t, x]) => {
      const one = new Map();
      for (const y of (x.units?.USD ?? []).filter(recent)) { const k = `${y.start ?? ''}/${y.end}`; one.set(k, latestFiled(one.get(k), y)); }
      return [...one.values()].map(y => ({ t, ...y }));
    }));
  const parts = new Map();   // base tag @ date -> sum of its current and noncurrent parts (a total stays as it is)
  for (const y of loanFacts) if (!y.start && /[Cc]urrent$/.test(y.t)) { const k = y.t.replace(/(Non)?[Cc]urrent$/, '') + '@' + y.end; parts.set(k, (parts.get(k) ?? 0) + y.val); }
  const loanBook = Math.max(0, ...parts.values(), ...loanFacts.map(y => y.val));
  const loanBal = Math.max(0, ...parts.values(), ...loanFacts.filter(y => !y.start).map(y => y.val)), loanFlow = loanBook > loanBal;
  // (the flow's own period and the smaller balance, for the page: Block tags 2,352.2 of loans beside 32,145.2 of 2025
  // originations, Rocket's flow is nine months; final check 2026-11-22)
  // (the balance shown is the largest loan balance at the quarter's end, a current and a noncurrent part added up; a lease
  // investment is no loan balance: Deere's 2,593 of leases beside its 42.9B of receivables under its own tag)
  const flowFact = loanFacts.filter(y => y.start).reduce((a, y) => (!a || y.val > a.val ? y : a), null);
  const atEnd = loanFacts.filter(y => !y.start && y.end === rev.end && !/Lease/.test(y.t)), endParts = new Map();
  for (const y of atEnd) if (/[Cc]urrent$/.test(y.t)) { const k = y.t.replace(/(Non)?[Cc]urrent$/, ''); endParts.set(k, (endParts.get(k) ?? 0) + y.val); }
  const endBal = Math.max(0, ...endParts.values(), ...atEnd.filter(y => !/[Cc]urrent$/.test(y.t)).map(y => y.val));
  const flowInfo = loanFlow && flowFact ? { loansFlow: true, loansFlowDays: days(flowFact.start, flowFact.end) + 1, ...(endBal > 0 ? { loansBalance: endBal } : {}) } : {};
  const max = (tags, d) => Math.max(0, ...tags.map(t => instantAt(g, [t], d) ?? 0));
  const unexplainedAt = (d, c) => {
    const ac = instantAt(g, ['AssetsCurrent'], d);
    return ac == null ? 0 : Math.max(0, ac - (c ?? 0) - max(SEC_CUR, d) - CUR_GROUPS.reduce((a, grp) => a + max(grp, d), 0));
  };
  // a securities total counts only when no investment line is tagged (KLA) and it is not the cash itself (Natera):
  // filers' fair-value tables often hold the cash equivalents too (AMD's 14,107 holds 5,736; audit 2026-11-22); the
  // part of it already among the unexplained current assets is not counted twice
  // a nuclear decommissioning trust is a book of its own beside the cash and securities (review of the final check
  // 2026-11-22: Constellation's 20.5B, mostly bonds and cash equivalents, had left its estimate on the cash alone)
  const bal = d => {
    const c = instantAt(g, CASH, d);
    if (c == null) return null;
    const parts = max(SEC_CUR, d) + max(SEC_NONCUR, d), total = max(SEC_TOTAL, d), unexpl = unexplainedAt(d, c);
    const fromTotal = parts > 0 || Math.abs(total - c) <= 0.02 * Math.max(total, c) ? 0 : Math.max(0, total - unexpl);
    return c + parts + fromTotal + unexpl + max(TRUST, d);
  };
  const prevEnd = quarterFacts(g, REVENUE).at(-2)?.end, qDays = days(rev.start, rev.end) + 1;
  const loanInterest = loanBook * LEND_RATE / 100 * qDays / 365;
  // No interest tagged: cash and securities at the corporate yield, and any loans at the lending rate (until the audit
  // of 2026-11-22 loans blocked the estimate: Linde's 29M note against 3.9B of cash left it unknown)
  if (int == null) {
    const end = bal(rev.end), start = prevEnd ? bal(prevEnd) : null;
    if (end != null) {
      estimate = { cashStart: start ?? end, cashEnd: end, yieldPct, days: qDays, ...(loanBook > 0 ? { loans: loanBook, lendPct: LEND_RATE, ...flowInfo } : {}) };
      const cashPart = estimateInterest(estimate);
      illicit = cashPart == null ? null : cashPart + loanInterest; illicitEstimated = illicit != null;
      // an insurer's published investment income is at least what its interest-earning book yields (AMERISAFE,
      // Primerica: their bonds held to maturity are not all tagged; audit 2026-11-22)
      // a published securities-interest line likewise (Realty Income's loans and preferred equity: fix review 2026-11-22)
      const nii = top(['NetInvestmentIncome', 'GrossInvestmentIncomeOperating', 'InterestAndDividendIncomeSecurities']);
      if (illicit != null && nii?.val > illicit) { illicit = nii.val; estimate = { ...estimate, published: nii.tag, publishedVal: nii.val }; }
    }
  }
  // A higher reading of the interest when a tagged figure is used (audit 2026-11-22): separate exact lines add up (IBM:
  // other interest 87 + lease interest 62), a lender's revenue not from contracts with customers may be financing income
  // (MercadoLibre's credit revenues), current assets no tagged line explains may earn interest booked in revenue (ADP's
  // 44.7B of client funds), and loans whose interest no tag shows earn a lending rate (Snap-on).
  let illicitHigh = null, illicitOpen = false, illicitPublished = null;
  if (estimate == null && illicit != null) {
    // separate lines add up; interest and dividends on securities is one more such line (Realty Income: 32.2M on its
    // financing receivables and 105.0M on loans and preferred equity; fix review 2026-11-22)
    const distinct = vs => vs.reduce((a, v) => (a.some(y => Math.abs(y - v) <= 0.02 * Math.max(y, v)) ? a : [...a, v]), []);
    const exacts = INTEREST_EXACT.map(t => quarterFacts(g, [t]).find(x => x.end === rev.end)).filter(Boolean);
    const secLine = quarterFacts(g, ['InterestAndDividendIncomeSecurities']).find(x => x.end === rev.end)?.val;
    const sep = distinct([...exacts.map(x => x.val), ...(secLine > 0 ? [secLine] : [])]);
    const nonContract = quarterFacts(g, ['RevenueNotFromContractWithCustomer']).find(x => x.end === rev.end)?.val ?? 0;
    const unexpl = estimateInterest({ cashStart: prevEnd ? unexplainedAt(prevEnd, instantAt(g, CASH, prevEnd)) : 0, cashEnd: unexplainedAt(rev.end, instantAt(g, CASH, rev.end)), yieldPct, days: qDays }) ?? 0;
    // revenue outside contracts with customers is financing income only at a company that lends (MercadoLibre); at
    // others it is commodity contracts (Bunge), leases or regulated programmes (Sempra)
    const nii = top(['NetInvestmentIncome', 'GrossInvestmentIncomeOperating'])?.val ?? 0;   // published investment income
    // where every exact line is a lending line, no tagged figure covers the cash and securities: they earn the corporate
    // yield (final check 2026-11-22: Shopify's 96M of loan interest beside 65M on 5.25B of cash under a net tag; HPE)
    const lendLine = x => /^(InterestAndFeeIncome|SalesTypeAndDirectFinancingLeasesInterestIncome)/.test(x.tag);
    const lendingOnly = exacts.length > 0 && exacts.every(x => lendLine(x) || exacts.some(y => lendLine(y) && Math.abs(y.val - x.val) <= 0.02 * Math.max(x.val, y.val)));
    const cashEnd = lendingOnly ? bal(rev.end) : null, cashStart = lendingOnly && prevEnd ? bal(prevEnd) : null;
    const cashPart = cashEnd != null ? estimateInterest({ cashStart: cashStart ?? cashEnd, cashEnd, yieldPct, days: qDays }) ?? 0 : 0;
    let high = Math.max(sep.reduce((a, x) => a + x, 0), illicit + (hasLoans ? Math.max(0, nonContract) : 0), illicit + unexpl, illicit + cashPart, nii);
    // loans earning less than 4% a year by their tagged interest: that interest is not all of it (IBM: 62 of lease
    // interest on 13,257 of loans and leases; Snap-on: none tagged), so the loans earn the lending rate instead
    const loanTagged = exacts.filter(x => LOAN_INTEREST.has(x.tag)).reduce((a, x) => Math.max(a, x.val), 0);
    if (hasLoans && loanBook > 0 && loanTagged * 365 / qDays < 0.04 * loanBook) high = Math.max(high, sep.reduce((a, x) => a + x, 0) - loanTagged + loanInterest, illicit + loanInterest);
    else if (hasLoans && !(loanBook > 0) && !loanTagged) illicitOpen = true;
    illicitHigh = high > illicit + 1e-9 ? high : null;
    // The figure to purify a fail with: the company's own total interest income when it tags one (KeyCorp's exact line
    // was 107 of a total of 2,133, Goldman's 3,760 of 22,793). Exact lines are not added up for it: banks tag the total
    // beside its parts (SoFi 1,343.2 = 1,260.9 + 82.3); the high reading adds them only as a bound for a pass.
    // A positive net interest line is a floor of the gross interest (Nano Nuclear: 4.98 of net interest, no expense,
    // against an exact line of 0.374; verification of the fixes, 2026-11-22)
    const total = quarterFacts(g, ['InterestAndDividendIncomeOperating']).find(x => x.end === rev.end)?.val ?? 0;
    const net = Math.max(0, quarterFacts(g, ['InterestIncomeExpenseNet']).find(x => x.end === rev.end)?.val ?? 0);
    if (!illicitEstimated && Math.max(total, net) > illicit + 1e-9) illicitPublished = Math.max(total, net);
  }
  // an estimate proves no R3 pass for a credit, brokerage, asset-management or insurance-agent business (SIC 6100-6299,
  // 6411): their interest-earning books sit under company tags companyfacts does not carry (final check 2026-11-22:
  // Ameriprise's 154M estimate beside 908M of net investment income in its 10-Q; M13: Apollo, Virtus). REITs, patent
  // and royalty owners (6700-6799) keep theirs.
  if (estimate && /^(6[12]\d\d|6411)$/.test(String(sic ?? ''))) illicitOpen = true;
  const d0 = debtAt(g, rev.end, { zero: zeroCoupon && zeroCoupon.period <= rev.end ? zeroCoupon.zero : 0 });
  // total liabilities; when not tagged, liabilities-and-equity minus the parent's equity (includes minority and mezzanine
  // equity, so it can only overstate: still an upper bound of the borrowings)
  const le = instantAt(g, ['LiabilitiesAndStockholdersEquity'], rev.end), se = instantAt(g, ['StockholdersEquity'], rev.end);
  const liabilities = instantAt(g, ['Liabilities'], rev.end) ?? (le != null && se != null ? le - se : null);
  // a drawn long-term credit line that is all the debt the tags show for sure (debtAt's partial reading) proves a fail;
  // the liabilities bound is the high reading a pass needs, and without it there is no debt figure (fix review and final
  // check 2026-11-22: Ironwood, Dropbox; Akamai's convertibles alone give no figure, only the bound)
  const bound = liabilities != null ? Math.max(0, liabilities - d0.parts.leases) : null;
  const d = !d0.partial ? d0 : bound == null || d0.debt == null ? { debt: null, debtHigh: null, parts: { borrowings: null, leases: d0.parts.leases } }
    : { debt: d0.debt, debtHigh: bound > d0.debt ? bound : null, partial: bound > d0.debt, parts: d0.parts };
  const deiShares = (dei.EntityCommonStockSharesOutstanding?.units?.shares ?? []).filter(x => x.end >= rev.end && days(rev.end, x.end) <= 120)
    .reduce(latestFiled, null);
  const wq = quarterFacts(g, ['WeightedAverageNumberOfSharesOutstandingBasic'], 'shares', false);
  // a 10-K quarter has no quarterly count: the shares outstanding at its end cap a cover count dated after it (fix review
  // 2026-11-22: Skyworks' cover count after its merger raised its last quarter's market value 1.56x), else the year's
  // weighted count, which lags a company that issued shares (final check: BitMine's 482.3M against 613.3M at the end);
  // alone neither is the quarter's count (G6.5)
  const wavg = wq.find(x => x.end === rev.end) ?? (deiShares
    ? rows(g, 'CommonStockSharesOutstanding', 'shares').filter(x => !x.start && x.end === rev.end).reduce(latestFiled, null)
      ?? rows(g, 'WeightedAverageNumberOfSharesOutstandingBasic', 'shares').filter(x => x.end === rev.end && x.start && days(x.start, x.end) > 300).reduce(latestFiled, null)
    : null);
  // Market value uses the smaller count (G6.4): a split or new shares after the quarter can only lower it (stricter).
  // A count 50x away from the other is a unit error (TEM reports thousands) and is dropped.
  // Implied count = net income / EPS of the quarter, when both are there and not tiny: a count 50x away is a unit error.
  const ni = quarterFacts(g, ['NetIncomeLoss']).find(x => x.end === rev.end)?.val;
  const eps = quarterFacts(g, ['EarningsPerShareBasic'], 'USD/shares').find(x => x.end === rev.end)?.val;
  const implied = ni && eps && Math.abs(eps) >= 0.01 ? Math.abs(ni / eps) : null;
  const near = (a, b) => a / b <= 50 && b / a <= 50;
  let c = deiShares?.val, w = wavg?.val;
  if (implied) { if (!(c > 0 && near(c, implied))) c = undefined; if (!(w > 0 && near(w, implied))) w = undefined; }
  // a cover count far below a weighted count that net income / EPS confirms is one share class of several (Mobileye's
  // cover lists Class A only, 252.4M of 824M; audit round 2)
  if (c > 0 && w > 0 && implied && Math.abs(w / implied - 1) <= 0.1 && c < w / 1.5) c = undefined;
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
  // Each step in a period's count between two filings in date order is one split, after the earlier filing and by the
  // later one (a period restated twice gives two steps, not their product). One split restates many periods: steps of
  // the same ratio whose windows overlap narrow it together; the same ratio years apart is another split (Monster 2:1 in
  // 2012, 2023 and 2026: grouped by ratio alone their window ended before it began). The most recent split matters.
  const close = (a, b) => Math.abs(a / b - 1) <= 0.02, events = [];
  // a step beyond 50x counts only when the cover count moved by about as much between the two filings (final check
  // 2026-11-22: a split restated with a unit change gave ONEOK 2,000 and Freeport 2,000,000; Chesapeake's real 1:200 of
  // 2020 moved its cover count from 1,954.6M to 9.78M)
  const covers = (dei.EntityCommonStockSharesOutstanding?.units?.shares ?? []).filter(x => x.val > 0);
  const coverMoved = (k, after, until) => {
    const a = covers.filter(x => x.filed <= after).reduce(latestFiled, null), b = covers.filter(x => x.filed > after && x.filed <= until).reduce(latestFiled, null);
    return !!(a && b) && b.val / a.val >= k / 1.5 && b.val / a.val <= k * 1.5;
  };
  for (const xs of periods.values()) {
    const s = [...xs].sort((a, b) => (a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : 0));
    for (let i = 1; i < s.length; i++) {
      const k = s[i].val / s[i - 1].val, after = s[i - 1].filed, until = s[i].filed;
      // a step of exactly 1000x is a unit error (thousands against units: Geron); a 1:50 or 1:100 reverse split is a split
      const unitErr = [1e3, 1e-3, 1e6, 1e-6].some(u => close(k, u));
      if (!(k >= 1.5 || k <= 1 / 1.5) || unitErr || !(after < until) || ((k > 51 || k < 1 / 51) && !coverMoved(k, after, until))) continue;
      const e = events.find(x => close(x.k, k) && (x.after > after ? x.after : after) < (x.until < until ? x.until : until));
      if (e) { e.after = e.after > after ? e.after : after; e.until = e.until < until ? e.until : until; } else events.push({ k, after, until });
    }
  }
  for (const e of events) if (!split || e.until > split.until) split = e;
  // Contract revenue never holds interest (ASC 606): a lender's interest comes on top of it for the total revenue
  // R3 divides by (audit 2026-11-22: AXP's card fees alone made its interest 56.9% of "revenue", 36.3% of the total)
  // ...only when the interest is 10% of that revenue or more: then the share is above 9% with or without it, so adding
  // it never turns a fail into a pass (fix review 2026-11-22: Duolingo's own non-operating interest had been added)
  // A lender below that line (a lending tag or a loan book) keeps its interest in the total too (verification of the
  // fixes, 2026-11-22: a loan-interest share in (5%, 5.26%] would have failed on contract revenue alone)
  // (a loan balance of 10% of the revenue or more, not a flow or a stray note: Tronox's one 11M collection had made it a
  // lender; final check 2026-11-22)
  const lender = /^(InterestAndFeeIncome|SalesTypeAndDirectFinancingLeasesInterestIncome)/.test(int?.tag ?? '') || loanBal >= 0.1 * rev.val || illicit >= 0.1 * rev.val;
  const lenderTotal = /^RevenueFromContractWithCustomer/.test(rev.tag) && LOAN_INTEREST.has(int?.tag) && !illicitEstimated && illicit > 0 && lender;
  return {
    name: cf.entityName, period, revenue: lenderTotal ? rev.val + illicit : rev.val, revenueTag: lenderTotal ? `${rev.tag}+interest` : rev.tag,
    illicit, illicitHigh, illicitOpen, illicitPublished, illicitTag: int?.tag ?? null, illicitEstimated, estimate,
    debt: d.debt, debtHigh: d.debtHigh, debtParts: d.parts, // all liabilities minus the lease liabilities still bound the borrowings from above
    ...(d.partial ? { debtPartial: true } : {}),   // debtHigh is that bound, not a reading of debt lines (the page says so)
    debtUpperBound: d.debt == null && liabilities != null ? Math.max(0, liabilities - d.parts.leases) : null,
    bookEquity: instantAt(g, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], rev.end),
    // purification is owed per share held when the statements are issued: the cover-page count (the stock page; fund
    // rows divide by sharesMV, the cautious side: engine/funds.js)
    shares: c > 0 && sane.includes(c) ? c : sharesMV, sharesMV,
    sharesSource: c > 0 && sane.includes(c) ? 'cover' : w > 0 && sane.includes(w) ? 'weighted' : sharesMV != null ? 'implied' : null,
    splitRatio: split?.k ?? null, splitWindow: split ? [split.after, split.until] : null,
  };
}
