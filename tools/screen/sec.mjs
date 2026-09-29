// SEC EDGAR access for the automated screen: the ticker map, XBRL frames (one concept across
// every filer at once), and a compact extract of each company's own filed facts.
//
// SEC's fair-access policy asks for a User-Agent with a contact address and fewer than ten
// requests a second. Every request here goes through one paced queue at about seven a second.

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

export const UA = { 'User-Agent': process.env.SEC_USER_AGENT || 'mdt-signal-dashboard research@example.com' };

const GAP_MS = 140;
let nextSlot = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function slot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + GAP_MS;
  if (at > now) await sleep(at - now);
}

// GET a SEC JSON document. 404 resolves to null (no XBRL on file); 429/5xx and dropped
// connections back off and retry.
export async function secJson(url) {
  for (let attempt = 0; ; attempt++) {
    await slot();
    let r;
    try {
      r = await fetch(url, { headers: UA });
    } catch (e) {
      if (attempt >= 4) throw e;
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (r.status === 404) return null;
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && attempt < 4) { await sleep(2000 * 2 ** attempt); continue; }
    throw new Error(`HTTP ${r.status} for ${url}`);
  }
}

// Read a cached JSON file if it is younger than maxAgeDays, else fetch and cache it.
export async function cached(file, maxAgeDays, load) {
  try {
    const s = await stat(file);
    if ((Date.now() - s.mtimeMs) / 86400000 < maxAgeDays) return JSON.parse(await readFile(file, 'utf8'));
  } catch { /* not cached yet */ }
  const v = await load();
  if (v != null) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(v));
  }
  return v;
}

export const pad10 = cik => String(cik).padStart(10, '0');
export const normTicker = t => String(t).trim().toUpperCase().replace(/[./]/g, '-');

// ticker -> { cik, name, exchange } for NYSE and Nasdaq listings
export async function tickerMap(cacheFile) {
  const j = await cached(cacheFile, 7, () => secJson('https://www.sec.gov/files/company_tickers_exchange.json'));
  const map = new Map();
  for (const [cik, name, ticker, exchange] of j.data) {
    if (exchange !== 'NYSE' && exchange !== 'Nasdaq') continue;
    const t = normTicker(ticker);
    if (!map.has(t)) map.set(t, { cik, name, exchange });
  }
  return map;
}

// One concept for every filer: [{cik, entityName, loc, start, end, val}]
export async function frame(cacheDir, concept, unit, period) {
  const url = `https://data.sec.gov/api/xbrl/frames/us-gaap/${concept}/${unit}/${period}.json`;
  const j = await cached(`${cacheDir}/frames/${concept}-${unit}-${period}.json`, 7, () => secJson(url));
  return j?.data || [];
}

// ---- company facts ---------------------------------------------------------

const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
const isAnnualForm = f => /^10-K/.test(f.form || '');
const isYear = f => f.start && (d => d >= 350 && d <= 380)(days(f.start, f.end));

// Flow and balance-sheet items: one value per fiscal-year end, from the latest 10-K that
// reports it (restatements win). Kept per tag so the derive step chooses among them.
const FLOW = [
  'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax',
  'SalesRevenueNet', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet', 'RevenuesNetOfInterestExpense', 'PremiumsEarnedNet',
  'CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold', 'CostOfServices', 'GrossProfit',
  'OperatingIncomeLoss', 'NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  'IncomeTaxExpenseBenefit', 'InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt', 'InterestPaidNet',
  'DepreciationDepletionAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'DepreciationAndAmortization', 'Depreciation',
  'NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  'PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PaymentsToAcquireOtherPropertyPlantAndEquipment',
  'PaymentsForCapitalImprovements', 'PaymentsToAcquireRealEstate', 'PaymentsToDevelopRealEstateAssets',
  'PaymentsToAcquireOtherProductiveAssets', 'PaymentsForConstructionInProcess', 'PaymentsToAcquireAndDevelopRealEstate',
  'PaymentsForSoftware', 'PaymentsToDevelopSoftware',
  'PaymentsOfDividendsCommonStock', 'PaymentsOfDividends', 'PaymentsOfOrdinaryDividends',
  'DividendsCommonStockCash', 'DividendsCommonStock', 'Dividends', 'DividendsCash',
  'PaymentsForRepurchaseOfCommonStock', 'ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense',
];
const INSTANT = [
  'CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash',
  'ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent',
  'LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings', 'CommercialPaper',
  'LongTermDebtAndCapitalLeaseObligations', 'LongTermDebtAndCapitalLeaseObligationsCurrent',
  'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities', 'LongTermLineOfCredit', 'LineOfCredit',
  'LinesOfCreditCurrent', 'SeniorNotes', 'ConvertibleNotesPayable', 'NotesPayable', 'SecuredDebt', 'UnsecuredDebt',
  'ConvertibleDebtNoncurrent', 'ConvertibleNotesPayableCurrent', 'ConvertibleDebtCurrent', 'LongTermNotesPayable',
  'OtherLongTermDebtNoncurrent', 'SeniorLongTermNotes',
  'StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'Assets',
];
// Per-share figures and share counts get restated onto the new basis after a split, but only
// for the years the new filing shows. Kept per filing so the derive step can chain the bases.
const PER_FILING = {
  'USD/shares': ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid',
                 'EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'],
  shares: ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingBasic',
           'WeightedAverageNumberOfShareOutstandingBasicAndDiluted'],
};

function latestPerEnd(facts, wantDuration) {
  const byEnd = {};
  for (const f of facts) {
    if (!isAnnualForm(f)) continue;
    if (wantDuration ? !isYear(f) : f.start) continue;
    const cur = byEnd[f.end];
    if (!cur || f.filed > cur.filed) byEnd[f.end] = f;
  }
  return Object.fromEntries(Object.entries(byEnd).filter(([e]) => e >= '2008').sort().map(([e, f]) => [e, f.val]));
}

export function extractFacts(sym, j) {
  const gaap = j.facts?.['us-gaap'] || {}, dei = j.facts?.dei || {};
  const x = { sym, cik: j.cik, entity: j.entityName, flow: {}, inst: {}, perFiling: {}, filings: {}, cover: null };

  for (const tag of FLOW) {
    const facts = gaap[tag]?.units?.USD;
    if (!facts) continue;
    const s = latestPerEnd(facts, true);
    if (Object.keys(s).length) x.flow[tag] = s;
  }
  for (const tag of INSTANT) {
    const facts = gaap[tag]?.units?.USD;
    if (!facts) continue;
    const s = latestPerEnd(facts, false);
    if (Object.keys(s).length) x.inst[tag] = s;
  }
  for (const [unit, tags] of Object.entries(PER_FILING)) {
    for (const tag of tags) {
      const facts = gaap[tag]?.units?.[unit];
      if (!facts) continue;
      const rows = [];
      const seen = new Set();
      for (const f of facts) {
        if (!isAnnualForm(f) || !isYear(f) || f.end < '2008') continue;
        const k = f.accn + f.end;
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push([f.accn, f.end, f.val]);
        x.filings[f.accn] ||= f.filed;
      }
      if (rows.length) x.perFiling[tag] = rows;
    }
  }
  // quarterly dividend rates from 10-Qs and 10-Ks, per filing like the annual ones: they show
  // specials inside a year, fill years with no annual figure, and give the current run-rate
  for (const tag of ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid']) {
    const rows = [], seen = new Set();
    for (const f of gaap[tag]?.units?.['USD/shares'] || []) {
      if (!f.start || f.end < '2008') continue;
      const d = days(f.start, f.end);
      if (d < 80 || d > 100) continue;
      const k = f.accn + f.end;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push([f.accn, f.end, f.val]);
      x.filings[f.accn] ||= f.filed;
    }
    if (rows.length) (x.perQuarter ||= {})[tag] = rows;
  }

  // every 10-K on file, so years with no per-share facts still have a filing date
  for (const node of Object.values(gaap)) {
    for (const facts of Object.values(node.units || {})) {
      for (const f of facts) if (isAnnualForm(f) && !x.filings[f.accn]) x.filings[f.accn] = f.filed;
    }
  }
  const eso = dei.EntityCommonStockSharesOutstanding?.units?.shares;
  if (eso?.length) {
    // multi-class filers report one cover figure per class on the same date — sum those
    const last = eso.reduce((m, f) => f.end > m ? f.end : m, '');
    const lastFiled = eso.filter(f => f.end === last).reduce((m, f) => f.filed > m ? f.filed : m, '');
    const sameDay = eso.filter(f => f.end === last && f.filed === lastFiled);
    const seen = new Set();
    let total = 0;
    for (const f of sameDay) { if (!seen.has(f.val)) { seen.add(f.val); total += f.val; } }
    x.cover = { asOf: last, shares: total, classes: seen.size };
  }
  return x;
}

export function extractSubmissions(s) {
  if (!s) return null;
  const r = s.filings?.recent || {};
  let last10k = null, n10k = 0;
  for (let i = 0; i < (r.form || []).length; i++) {
    if (r.form[i] === '10-K') { n10k++; if (!last10k) last10k = { filed: r.filingDate[i], period: r.reportDate[i] }; }
  }
  return {
    name: s.name, sic: s.sic ? Number(s.sic) : null, sicDescription: s.sicDescription || null,
    tickers: s.tickers || [], exchanges: s.exchanges || [], fiscalYearEnd: s.fiscalYearEnd || null,
    category: s.category || null, entityType: s.entityType || null, stateOfIncorporation: s.stateOfIncorporation || null,
    last10k, n10k,
  };
}

// Filer profile (SIC code, fiscal year end, latest 10-K) — cheap, so it is fetched first and
// used to skip the companies the rules don't describe before pulling their full facts.
export async function companyProfile(cacheDir, sym, cik, maxAgeDays = 7) {
  return cached(`${cacheDir}/sub/${sym}.json`, maxAgeDays, async () =>
    extractSubmissions(await secJson(`https://data.sec.gov/submissions/CIK${pad10(cik)}.json`)) || { missing: true });
}

// Compact extract of every filed fact the screen uses, cached so re-running the derive step
// costs nothing.
export async function companyFacts(cacheDir, sym, cik, maxAgeDays = 7) {
  return cached(`${cacheDir}/x/${sym}.json`, maxAgeDays, async () => {
    const facts = await secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad10(cik)}.json`);
    return facts ? extractFacts(sym, facts) : { sym, cik, missing: 'no XBRL company facts' };
  });
}
