#!/usr/bin/env node
// Pulls each company's XBRL "company facts" from SEC EDGAR and extracts every series the
// dividend analysis needs into one compact JSON per company under .cache/sec/.
//
//   node tools/sec-pull.mjs            # all companies in dividend-data.json
//   node tools/sec-pull.mjs PRI AWR    # just these
//
// This is the deterministic half of how dividend-stocks.json was built. The other half —
// choosing the right dividend series, applying stock splits to the years that were filed on
// the old share basis, separating specials, and applying the ten rules — is judgement, and
// was done per company with two independent review passes. Re-run this, then re-do that.
//
// SEC's fair-access policy requires a User-Agent that identifies you and asks for < 10 req/s.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.cache', 'sec');
const UA = { 'User-Agent': process.env.SEC_USER_AGENT || 'mdt-signal-dashboard research@example.com' };

const CIK = {
  CSWI:'0001624794', AAON:'0000824142', BMI:'0000009092', FELE:'0000038725', GRC:'0000042682',
  TNC:'0000097134', BRC:'0000746598', SSD:'0000920371', AIT:'0000109563', UFPI:'0000912767',
  IBP:'0001580905', EXPO:'0000851520', RLI:'0000084246', PRI:'0001475922', SIGI:'0000230557',
  THG:'0000944695', HLNE:'0001433642', CNS:'0001284812', VCTR:'0001570827', HLI:'0001302215',
  MKTX:'0001278021', MORN:'0001289419', TXRH:'0001289460', WINA:'0000908315', CASY:'0000726958',
  AWR:'0001056903', CWT:'0001035201', CPK:'0000019745', OGS:'0001587732', NJR:'0000356309',
  OTTR:'0001466593', MSEX:'0000066004', SCL:'0000094049', FUL:'0000039368', SLGN:'0000849869',
  LSTR:'0000853816', JKHY:'0000779152', ADC:'0000917251', CRAI:'0001053706', FHI:'0001056288',
  DCI:'0000029644', LECO:'0000059527', WTRG:'0000078128',
};

// [family, kind, unit, candidate tags in preference order]
const FAMILIES = [
  ['dps',        'dur', 'USD/shares', ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid']],
  ['divPaid',    'dur', 'USD', ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends', 'PaymentsOfOrdinaryDividends',
                                'DividendsCommonStockCash', 'DividendsCommonStock', 'Dividends', 'DividendsCash']],
  ['buybacks',   'dur', 'USD', ['PaymentsForRepurchaseOfCommonStock']],
  ['cfo',        'dur', 'USD', ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']],
  ['capex',      'dur', 'USD', ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets',
                                'PaymentsToAcquireOtherPropertyPlantAndEquipment', 'PaymentsForCapitalImprovements',
                                'PaymentsToAcquireRealEstate', 'PaymentsToDevelopRealEstateAssets',
                                'PaymentsToAcquireOtherProductiveAssets', 'PaymentsForConstructionInProcess',
                                'PaymentsToAcquireAndDevelopRealEstate']],
  ['splitRatio', 'dur', 'pure', ['StockholdersEquityNoteStockSplitConversionRatio1', 'StockholdersEquityNoteStockSplitConversionRatio']],
  ['netIncome',  'dur', 'USD', ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss']],
  ['revenue',    'dur', 'USD', ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet',
                                'RevenueFromContractWithCustomerIncludingAssessedTax', 'PremiumsEarnedNet']],
  ['opIncome',   'dur', 'USD', ['OperatingIncomeLoss']],
  ['pretax',     'dur', 'USD', ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
                                'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments']],
  ['tax',        'dur', 'USD', ['IncomeTaxExpenseBenefit']],
  ['da',         'dur', 'USD', ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'Depreciation']],
  ['interest',   'dur', 'USD', ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt', 'InterestPaidNet']],
  ['sharesDil',  'dur', 'shares', ['WeightedAverageNumberOfDilutedSharesOutstanding']],
  ['sharesBasic','dur', 'shares', ['WeightedAverageNumberOfSharesOutstandingBasic']],
  ['sharesOut',  'inst','shares', ['CommonStockSharesOutstanding']],
  ['debtLT',     'inst','USD', ['LongTermDebtNoncurrent', 'LongTermDebt', 'LongTermDebtAndCapitalLeaseObligations', 'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities']],
  ['debtCur',    'inst','USD', ['LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings', 'LongTermDebtAndCapitalLeaseObligationsCurrent']],
  ['cash',       'inst','USD', ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash']],
  ['equity',     'inst','USD', ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']],
  ['assets',     'inst','USD', ['Assets']],
];

const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

// Annual points for one tag: 10-K facts of ~one year's duration (or instants), one per period
// end. SEC marks the canonical fact for each period with a `frame`; the others are the same
// number restated in later filings, so prefer the framed one.
function annual(facts, kind) {
  const byEnd = {};
  for (const f of facts) {
    if (!/^10-K/.test(f.form || '')) continue;
    if (kind === 'dur') {
      if (!f.start) continue;
      const d = days(f.start, f.end);
      if (d < 350 || d > 380) continue;
    } else if (f.start) continue;
    const cur = byEnd[f.end];
    if (!cur || (f.frame && !cur.frame) || (!!f.frame === !!cur.frame && f.filed > cur.filed)) byEnd[f.end] = f;
  }
  return Object.values(byEnd).sort((a, b) => a.end.localeCompare(b.end)).map(f => ({ end: f.end, val: f.val }));
}

// Every dividend-per-share fact regardless of form — filers that report the quarterly rate in
// the annual context only show up here.
function allDps(facts) {
  const seen = {};
  for (const f of facts) {
    const key = (f.start || '') + '|' + f.end;
    const cur = seen[key];
    if (!cur || (f.frame && !cur.frame) || (!!f.frame === !!cur.frame && f.filed > cur.filed)) seen[key] = f;
  }
  return Object.values(seen).sort((a, b) => a.end.localeCompare(b.end)).map(f => ({
    start: f.start || null, end: f.end, days: f.start ? Math.round(days(f.start, f.end)) : 0,
    val: f.val, form: f.form, fp: f.fp,
  }));
}

function extract(sym, j, liveRow, generated) {
  const gaap = j.facts['us-gaap'] || {}, dei = j.facts['dei'] || {};
  const out = {
    symbol: sym, entity: j.entityName, cik: CIK[sym], fiscalYearEnd: null,
    live: liveRow ? { price: liveRow.p, marketCap: liveRow.mc, ttmDividend: liveRow.d,
                      regularDividendIfSpecial: liveRow.dr ?? null, sector: liveRow.sec, asOf: generated } : null,
    priorEstimates: liveRow ? { growth5y: liveRow.g, streak: liveRow.st, payoutPctFcf: liveRow.po, flags: liveRow.fl } : null,
    families: {}, table: {}, dpsAllFacts: [], splitFacts: [], tagHints: [],
  };

  const fye = dei.CurrentFiscalYearEndDate?.units?.pure;
  if (fye?.length) out.fiscalYearEnd = fye[fye.length - 1].val;

  for (const [fam, kind, unit, cands] of FAMILIES) {
    const found = [];
    for (const tag of cands) {
      const facts = gaap[tag]?.units?.[unit];
      if (!facts?.length) continue;
      if (fam === 'dps') out.dpsAllFacts.push(...allDps(facts).map(f => ({ tag, ...f })));
      const pts = annual(facts, kind);
      if (!pts.length) continue;
      found.push({ tag, points: pts.length, first: pts[0].end, last: pts[pts.length - 1].end, series: pts });
    }
    if (!found.length) continue;
    found.sort((a, b) => b.points - a.points);
    out.families[fam] = { primary: found[0].tag, candidates: found.map(f => ({ tag: f.tag, points: f.points, first: f.first, last: f.last })) };
    for (const p of found[0].series) { (out.table[p.end] ||= {})[fam] = p.val; }
    if (['dps', 'divPaid', 'cfo', 'capex'].includes(fam)) out.families[fam].series = Object.fromEntries(found.map(f => [f.tag, f.series]));
  }

  for (const tag of ['StockholdersEquityNoteStockSplitConversionRatio1', 'StockholdersEquityNoteStockSplitConversionRatio']) {
    for (const f of gaap[tag]?.units?.pure || []) if (f.end >= '2009') out.splitFacts.push({ tag, end: f.end, val: f.val, form: f.form });
  }
  out.splitFacts = [...new Map(out.splitFacts.map(f => [f.end + f.val, f])).values()].sort((a, b) => a.end.localeCompare(b.end));

  for (const [tag, node] of Object.entries(gaap)) {
    if (!/Payments|Capital|Dividend|Repurchase|Distribution/.test(tag)) continue;
    const facts = node.units?.USD || node.units?.['USD/shares'];
    if (!facts) continue;
    const pts = annual(facts, 'dur');
    if (pts.length >= 3) out.tagHints.push({ tag, points: pts.length, last: pts[pts.length - 1].end, lastVal: pts[pts.length - 1].val });
  }
  out.tagHints.sort((a, b) => b.points - a.points);

  if (!out.fiscalYearEnd) {
    const md = {};
    for (const e of Object.keys(out.table)) { const k = e.slice(5); md[k] = (md[k] || 0) + 1; }
    const top = Object.entries(md).sort((a, b) => b[1] - a[1])[0];
    if (top) out.fiscalYearEnd = '--' + top[0];
  }
  const eso = dei.EntityCommonStockSharesOutstanding?.units?.shares;
  if (eso?.length) { const l = eso.slice().sort((a, b) => b.end.localeCompare(a.end))[0]; out.coverSharesOutstanding = { asOf: l.end, val: l.val }; }

  out.table = Object.fromEntries(Object.entries(out.table).filter(([k]) => k >= '2009').sort());
  out.dpsAllFacts = out.dpsAllFacts.filter(f => f.end >= '2009');
  return out;
}

// ---- main -----------------------------------------------------------------
await mkdir(OUT, { recursive: true });
const data = JSON.parse(await readFile(join(ROOT, 'dividend-data.json'), 'utf8'));
const want = process.argv.slice(2).map(s => s.toUpperCase());
const rows = data.companies.filter(c => !want.length || want.includes(c.s));
let ok = 0; const bad = [];

for (const c of rows) {
  const cik = CIK[c.s];
  if (!cik) { bad.push(`${c.s} (no CIK on file)`); continue; }
  try {
    const r = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: UA });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const x = extract(c.s, j, c, data.generated);
    await writeFile(join(OUT, `${c.s}.json`), JSON.stringify(x, null, 1));
    const yrs = Object.keys(x.table);
    console.log(`${c.s.padEnd(5)} ${yrs.length} fiscal years ${yrs[0]?.slice(0, 4)}–${yrs[yrs.length - 1]?.slice(0, 4)}, ` +
                `dps facts ${x.dpsAllFacts.length}, splits ${x.splitFacts.length}`);
    ok++;
  } catch (e) { bad.push(`${c.s} (${e.message})`); }
  await new Promise(r => setTimeout(r, 150));
}
console.log(`\n${ok}/${rows.length} written to ${OUT}` + (bad.length ? `\nFailed: ${bad.join(', ')}` : ''));
