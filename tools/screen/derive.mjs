// Turns one company's compact SEC extract (sec.mjs) into fiscal-year series on a single share
// basis, and the figures the rules in rules.mjs test. Pure functions, no I/O.
//
// The hard part is per-share history. A 10-K shows three years of dividends and earnings per
// share, restated for any split since; the years before that exist only in older 10-Ks, on
// the old basis. Taking each year from the latest filing that reports it therefore leaves a
// step at every split. The fix used here: walk the filings newest to oldest and compare each
// one with the newer basis on the years both report. A ratio that matches a split is a basis
// change, and everything older converts. Quarterly figures get the same treatment (10-Qs
// restate last year's quarter too), and they are what show a special dividend inside a year.

const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
const median = a => {
  const s = a.slice().sort((x, y) => x - y), n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN;
};
const fin = v => typeof v === 'number' && isFinite(v);
export const round = (v, d = 1) => fin(v) ? Math.round(v * 10 ** d) / 10 ** d : null;
const cagr = (a, b, n) => a > 0 && b > 0 && n > 0 ? (Math.pow(b / a, 1 / n) - 1) * 100 : null;
const yr = e => Number(e.slice(0, 4));
const fy = e => 'FY' + yr(e);

// ratios a split or reverse split restates share counts by
const SPLITS = [2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 1.5, 2.5, 1.25, 4 / 3, 1.2, 1.1];
function snap(r) {
  if (!(r > 0)) return null;
  if (Math.abs(r - 1) <= 0.008) return 1;
  for (const k of SPLITS) {
    if (Math.abs(r / k - 1) <= 0.012) return k;
    if (Math.abs(r * k - 1) <= 0.012) return 1 / k;
  }
  return null;
}
// Per-share figures are filed to the cent, so after a 2-for-1 split a $0.29 dividend comes back
// as $0.15, not $0.145. Test each candidate ratio against every overlapping pair with a
// half-cent allowance instead of the ratio of the medians.
function snapPairs(pairs) {
  const fits = k => pairs.every(([s, v]) => Math.abs(s - v * k) <= 0.0051 + 0.012 * Math.abs(s));
  if (fits(1)) return 1;
  for (const k of SPLITS) {
    if (fits(1 / k)) return 1 / k;
    if (fits(k)) return k;
  }
  return null;
}
const RATIOS = [[4, 3], [5, 4], [3, 2], [5, 2], [6, 5], [11, 10]];
const splitLabel = k => {
  if (k < 1) return `1-for-${round(1 / k, 2)} reverse split`;
  if (Number.isInteger(k)) return `${k}-for-1 split`;
  const r = RATIOS.find(([p, q]) => Math.abs(k - p / q) < 0.01);
  return r ? `${r[0]}-for-${r[1]} split` : `${round(k, 2)}-for-1 split`;
};

function groupByFiling(rows) {
  const by = new Map();
  for (const [a, e, v] of rows) {
    if (!by.has(a)) by.set(a, new Map());
    by.get(a).set(e, v);
  }
  return by;
}
const newestFirst = (by, filed) => [...by.keys()].sort((a, b) => (filed[b] || '').localeCompare(filed[a] || '') || b.localeCompare(a));

// Chain one series' filings onto the newest basis. `k` in events is the share multiplier
// (2 for a 2-for-1 split), whether the series is a share count or a per-share figure.
function chain(rows, filed, perShare, shareFactorOf = null) {
  const by = groupByFiling(rows);
  const order = newestFirst(by, filed);
  const series = new Map(), factor = new Map(), events = [], odd = [];
  let prev = 1, overlapped = 0, newer = null;
  for (const a of order) {
    const m = by.get(a);
    const pairs = [];
    for (const [e, v] of m) {
      const s = series.get(e);
      if (s && v && Math.sign(s) === Math.sign(v)) pairs.push([s, v * prev]);
    }
    let f = prev;
    // no year in common with the newer filings: carry the basis across using the share
    // counts' own restatements, when they cover both filings
    if (!pairs.length && perShare && shareFactorOf && newer) {
      const sa = shareFactorOf(a), sn = shareFactorOf(newer);
      if (sa && sn) f = prev * sn / sa;
    }
    if (pairs.length) {
      overlapped++;
      const r = median(pairs.map(([s, v]) => s / v));
      let k = perShare ? snapPairs(pairs) : snap(r);
      // a few percent either way is a restatement, not a change of basis
      if (k == null && Math.abs(r - 1) < 0.06) k = 1;
      if (k == null) odd.push({ filed: filed[a], ratio: round(r, 3) });
      else if (k !== 1) {
        f = prev * k;
        const shareK = perShare ? 1 / k : k;
        events.push({ k: shareK, label: splitLabel(shareK), between: [filed[a], newer ? filed[newer] : null] });
      }
    }
    factor.set(a, f);
    for (const [e, v] of m) if (!series.has(e)) series.set(e, v * f);
    prev = f;
    newer = a;
  }
  return { series, factor, events, odd, overlapped };
}

// the share-count basis of any filing: its own factor, else the nearest 10-K filed on or after it
function shareFactorFn(filed, shareFactor) {
  const known = [...shareFactor.keys()].map(a => [filed[a] || '', shareFactor.get(a)]).sort((a, b) => a[0].localeCompare(b[0]));
  return a => {
    if (shareFactor.has(a)) return shareFactor.get(a);
    const next = known.find(([fd]) => fd >= (filed[a] || ''));
    return next ? next[1] : null;
  };
}

// Per-share figures converted with the share-count chain's factors. A filing with no share
// counts (a 10-Q, say) takes the factor of the nearest 10-K filed on or after it, since a
// split shows up in the next annual report.
function onShareBasis(rows, filed, shareFactor) {
  const by = groupByFiling(rows);
  const order = newestFirst(by, filed);
  const known = [...shareFactor.keys()].map(a => [filed[a] || '', shareFactor.get(a)]).sort((a, b) => a[0].localeCompare(b[0]));
  const factorFor = a => {
    if (shareFactor.has(a)) return shareFactor.get(a);
    const d = filed[a] || '';
    const next = known.find(([fd]) => fd >= d);
    return next ? next[1] : 1;
  };
  const series = new Map(), clashes = [];
  for (const a of order) {
    const f = factorFor(a);
    for (const [e, v] of by.get(a)) {
      const adj = v / f;
      if (!series.has(e)) series.set(e, adj);
      else if (Math.abs(adj - series.get(e)) > 0.0051 + 0.03 * Math.abs(series.get(e))) clashes.push(e);
    }
  }
  return { series, clashes: [...new Set(clashes)] };
}

// Own restatements where the filings overlap; otherwise the share-count chain. A split seen
// only in the per-share figures — no matching jump in share counts — is usually one filing's
// comparative tagged wrong, so it is overruled by the share counts when they exist.
function perShare(rows, filed, sh, note, what) {
  if (!rows?.length) return null;
  const own = chain(rows, filed, true, sh.factor.size ? shareFactorFn(filed, sh.factor) : null);
  const confirmed = ev => sh.events.some(s => Math.abs(s.k / ev.k - 1) < 0.02);
  const unconfirmed = own.events.filter(ev => !confirmed(ev));
  if (own.overlapped > 0 && !own.odd.length && !(unconfirmed.length && sh.factor.size)) {
    return { map: own.series, how: 'own', events: own.events };
  }
  if (sh.factor.size) {
    if (unconfirmed.length) note('warn', `A filing restated ${what} by a ${unconfirmed[0].label.replace(/ split$/, '')} ratio (between ${unconfirmed[0].between.join(' and ')}) with no matching change in share counts; the share counts were used.`);
    const v = onShareBasis(rows, filed, sh.factor);
    return { map: v.series, how: 'shares', clashes: v.clashes };
  }
  return { map: own.series, how: 'as filed', odd: own.odd };
}

// value for fiscal-year end e from a Map/object keyed by period end, allowing a few days' drift
function at(src, e) {
  if (!src) return null;
  const get = k => src instanceof Map ? src.get(k) : src[k];
  const v = get(e);
  if (v != null) return v;
  for (const k of src instanceof Map ? src.keys() : Object.keys(src)) if (Math.abs(days(k, e)) <= 10) return get(k);
  return null;
}

// first tag in preference order that has a value for each period end
function merged(src, tags) {
  const out = {}, used = {};
  for (const t of tags) {
    for (const [e, v] of Object.entries(src[t] || {})) if (!(e in out)) { out[e] = v; used[e] = t; }
  }
  return { vals: out, used };
}

function fiscalYearEnds(x) {
  const ends = new Set();
  for (const t of ['NetIncomeLoss', 'ProfitLoss', 'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax',
                   'NetCashProvidedByUsedInOperatingActivities', 'OperatingIncomeLoss']) {
    for (const e of Object.keys(x.flow[t] || {})) ends.add(e);
  }
  const out = [];
  for (const e of [...ends].sort()) {
    if (out.length && days(out[out.length - 1], e) < 300) out[out.length - 1] = e;
    else out.push(e);
  }
  return out;
}

const REVENUE = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax',
                 'SalesRevenueNet', 'RevenuesNetOfInterestExpense', 'SalesRevenueGoodsNet', 'PremiumsEarnedNet'];
const COGS = ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold', 'CostOfServices'];
const NET_INCOME = ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss'];
const PRETAX = ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
                'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'];
const DA = ['DepreciationDepletionAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'DepreciationAndAmortization', 'Depreciation'];
const INTEREST = ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt', 'InterestPaidNet'];
const CFO = ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'];
const CAPEX = ['PaymentsToAcquireProductiveAssets', 'PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsForCapitalImprovements',
               'PaymentsToAcquireOtherPropertyPlantAndEquipment', 'PaymentsToAcquireOtherProductiveAssets', 'PaymentsForConstructionInProcess',
               'PaymentsToAcquireRealEstate', 'PaymentsToDevelopRealEstateAssets', 'PaymentsToAcquireAndDevelopRealEstate'];
const SOFTWARE_CAPEX = ['PaymentsToDevelopSoftware', 'PaymentsForSoftware'];
const DIV_PAID = ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends', 'PaymentsOfOrdinaryDividends',
                  'DividendsCommonStockCash', 'DividendsCommonStock', 'Dividends', 'DividendsCash'];
const CASH = ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash'];
const ST_INV = ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'];
const EQUITY = ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'];
const DECL = 'CommonStockDividendsPerShareDeclared', PAID = 'CommonStockDividendsPerShareCashPaid';

// Total borrowings at a balance-sheet date. Filers split debt across many tags and some are
// subtotals of others, so this takes the largest consistent long-term total, adds short-term
// borrowings not already inside it, and falls back to instrument tags only when nothing else
// is filed. Operating leases are left out.
function totalDebt(inst, e) {
  const g = t => at(inst[t], e);
  const lt = g('LongTermDebt'), ltn = g('LongTermDebtNoncurrent'), ltc = g('LongTermDebtCurrent');
  const cl = g('LongTermDebtAndCapitalLeaseObligations'), clc = g('LongTermDebtAndCapitalLeaseObligationsCurrent');
  const clt = g('LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities');
  const dc = g('DebtCurrent');
  const convCur = Math.max(g('ConvertibleNotesPayableCurrent') || 0, g('ConvertibleDebtCurrent') || 0);
  let longTotal = Math.max(lt || 0, (ltn || 0) + (ltc || 0), clt || 0, (cl || 0) + (clc || 0));
  let floor = false;
  if (!longTotal) {
    longTotal = Math.max(...['ConvertibleDebtNoncurrent', 'ConvertibleNotesPayable', 'SeniorNotes', 'SeniorLongTermNotes',
      'LongTermNotesPayable', 'NotesPayable', 'SecuredDebt', 'UnsecuredDebt', 'LongTermLineOfCredit', 'LineOfCredit',
      'OtherLongTermDebtNoncurrent'].map(t => g(t) || 0)) + convCur;
    floor = longTotal > 0;
  }
  const currentMaturities = ltc ?? clc ?? (lt != null && ltn != null ? Math.max(0, lt - ltn) : 0);
  const shortExtra = dc != null ? Math.max(0, dc - currentMaturities)
                                : (g('ShortTermBorrowings') || 0) + (g('CommercialPaper') || 0) + (g('LinesOfCreditCurrent') || 0);
  const anyTag = [lt, ltn, ltc, cl, clc, clt, dc].some(v => v != null) || longTotal > 0 || shortExtra > 0
    || ['ShortTermBorrowings', 'CommercialPaper', 'LinesOfCreditCurrent'].some(t => g(t) != null);
  return { debt: longTotal + shortExtra, floor, anyTag };
}

// Share counts filed in thousands (or, now and then, a thousand times too big): a value three
// orders of magnitude off the company's median is rescaled. Splits never come close to 300×.
function unthousand(rows) {
  const med = median(rows.map(r => r[2]).filter(v => v > 0));
  return rows.map(([a, e, v]) => [a, e, v > 0 && v / med > 300 ? v / 1000 : v > 0 && v / med < 1 / 300 ? v * 1000 : v]);
}
// Rows for one per-filing figure from the first tag that has it, filling (filing, year) gaps
// from the next: diluted share counts, then the combined basic-and-diluted figure small
// filers use, then basic. Basic and diluted differ by a percent or two, which the chain reads
// as a restatement, not a split.
function mergedRows(x, tags) {
  const rows = [], have = new Set();
  for (const t of tags) {
    for (const r of x.perFiling[t] || []) {
      const k = r[0] + r[1];
      if (!have.has(k)) { have.add(k); rows.push(r); }
    }
  }
  return rows;
}

// ---- dividends per share --------------------------------------------------
// Annual totals by fiscal year from the filed annual figure, else the four quarters, else
// dividends paid ÷ shares; specials found as a quarter that spikes and falls straight back.
function dividendHistory(x, ends, filed, sh, IMPL, note) {
  const N = ends.length;
  const start = i => i > 0 && days(ends[i - 1], ends[i]) <= 380 ? ends[i - 1] : new Date(Date.parse(ends[i]) - 365 * 86400000).toISOString().slice(0, 10);
  const tags = {};
  for (const t of [DECL, PAID]) {
    const a = perShare(x.perFiling[t], filed, sh, note, 'annual dividends per share');
    const q = perShare(x.perQuarter?.[t], filed, sh, note, 'quarterly dividends per share');
    if (a || q) tags[t] = { a, q };
  }
  const order = [DECL, PAID].filter(t => tags[t]);
  const events = [];
  for (const t of order) for (const part of ['a', 'q']) {
    const p = tags[t][part];
    if (p?.clashes?.length) note('warn', `Filed dividends per share disagree between filings for ${p.clashes.slice(0, 3).map(fy).join(', ')}.`);
    for (const ev of p?.events || []) events.push(ev);
  }

  // per tag: quarters falling inside each fiscal year, with a missing fourth quarter derived
  // from the annual figure where both exist
  const timeline = {}, fromQuarters = {};
  for (const t of order) {
    const qm = tags[t].q?.map, am = tags[t].a?.map;
    const tl = [];
    fromQuarters[t] = ends.map(() => null);
    ends.forEach((e, i) => {
      const s = start(i);
      const inside = qm ? [...qm].filter(([qe]) => days(s, qe) > 45 && days(qe, e) >= -5).sort((p, q) => p[0].localeCompare(q[0])) : [];
      const annual = am ? at(am, e) : null;
      let quarters = inside.map(([qe, v]) => ({ end: qe, v }));
      if (quarters.length === 3 && days(quarters[2].end, e) > 60) {
        const q4 = annual != null ? annual - quarters.reduce((s, q) => s + q.v, 0) : null;
        if (q4 != null && q4 >= -0.0005) quarters.push({ end: e, v: Math.max(0, q4), derived: true });
        else if (annual == null) quarters.push({ end: e, v: quarters[2].v, assumed: true });
      }
      if (quarters.length === 4) fromQuarters[t][i] = { total: quarters.reduce((s, q) => s + q.v, 0), assumed: quarters.some(q => q.assumed) };
      tl.push(...quarters.filter(q => !q.assumed));
    });
    // quarters after the last fiscal year feed the current rate
    if (qm) for (const [qe, v] of qm) if (qe > ends[N - 1]) tl.push({ end: qe, v });
    timeline[t] = tl.sort((p, q) => p.end.localeCompare(q.end)).filter((q, i, a) => i === 0 || q.end !== a[i - 1].end);
  }

  // totals per fiscal year, preferring declared over paid and filed annual over summed quarters
  const total = ends.map(() => null), source = ends.map(() => null);
  ends.forEach((e, i) => {
    // both tags filed for the year and far apart: the one that matches cash paid ÷ shares
    const both = order.map(t => tags[t].a ? at(tags[t].a.map, e) : null);
    if (both.length === 2 && both[0] > 0 && both[1] > 0 && Math.abs(both[0] / both[1] - 1) > 0.25 && IMPL[i] > 0) {
      const pick = Math.abs(Math.log(both[0] / IMPL[i])) <= Math.abs(Math.log(both[1] / IMPL[i])) ? 0 : 1;
      total[i] = both[pick]; source[i] = 'annual'; return;
    }
    for (const t of order) {
      const annual = tags[t].a ? at(tags[t].a.map, e) : null;
      const fq = fromQuarters[t][i];
      if (annual != null && fq && !fq.assumed && fq.total > 0 && Math.abs(annual / fq.total - 1) > 0.05) {
        // an annual figure a quarter the size of the four quarters is a quarterly rate tagged as the year
        if (annual / fq.total > 0.2 && annual / fq.total < 0.32) { total[i] = fq.total; source[i] = 'quarters'; return; }
      }
      if (annual != null) { total[i] = annual; source[i] = 'annual'; return; }
    }
    for (const t of order) {
      const fq = fromQuarters[t][i];
      if (fq) { total[i] = fq.total; source[i] = fq.assumed ? 'three quarters' : 'quarters'; return; }
    }
  });

  // a whole history of quarterly rates tagged as the year
  const q = total.map((d, i) => d > 0 && IMPL[i] > 0 ? d / IMPL[i] : null).filter(fin);
  if (q.length >= 3 && median(q) > 0.2 && median(q) < 0.32) {
    total.forEach((d, i) => { if (d != null && source[i] === 'annual') total[i] = d * 4; });
    note('warn', 'The filed dividend per share is a quarterly rate; multiplied by 4 (it then matches dividends paid ÷ shares).');
  }

  // Single years filed as the quarterly rate: about a quarter of cash paid ÷ shares. A regular-
  // only figure in a year the cash included a special looks the same, so the quarters decide
  // where they're filed (the figure matches one quarter, not the four); otherwise it needs
  // cash paid ÷ shares to track the filed figure in most years and to show no spikes.
  const tl = order.map(t => timeline[t]).sort((a, b) => b.length - a.length)[0] || [];
  const trackRate = q.length ? q.filter(r => Math.abs(r - 1) < 0.15).length / q.length : 0;
  const implSpiky = IMPL.some((v, i) => i > 0 && i < N - 1 && v > 0 && IMPL[i - 1] > 0 && IMPL[i + 1] > 0 && v > 1.35 * Math.max(IMPL[i - 1], IMPL[i + 1]));
  total.forEach((d, i) => {
    const r = d > 0 && IMPL[i] > 0 ? d / IMPL[i] : null;
    if (r == null || r <= 0.2 || r >= 0.32 || source[i] !== 'annual') return;
    const s = start(i);
    const qs = tl.filter(t => days(s, t.end) > 45 && days(t.end, ends[i]) >= -5).map(t => t.v);
    const quarterly = qs.length >= 3 ? Math.abs(d / median(qs) - 1) < 0.12 : q.length >= 3 && trackRate >= 0.7 && !implSpiky;
    if (!quarterly) return;
    total[i] = d * 4;
    note('warn', `${fy(ends[i])}: the filed dividend per share (${round(d, 4)}) is a quarterly rate; multiplied by 4.`);
  });

  // specials: a quarter that spikes above both neighbours and falls straight back
  const specialQ = new Map();
  for (let j = 1; j < tl.length - 1; j++) {
    const a = tl[j - 1].v, b = tl[j].v, c = tl[j + 1].v;
    if (a > 0 && c > 0 && b > 1.4 * Math.max(a, c)) specialQ.set(tl[j].end, b - Math.max(a, c));
  }
  const special = ends.map((e, i) => {
    const s = start(i);
    let sum = 0;
    for (const [qe, v] of specialQ) if (days(s, qe) > 45 && days(qe, e) >= -5) sum += v;
    return sum;
  });
  // without quarters, the same test on the annual figures
  for (let i = 1; i < N - 1; i++) {
    if (special[i]) continue;
    const a = total[i - 1], b = total[i], c = total[i + 1];
    if (a > 0 && b > 0 && c > 0 && b > 1.35 * Math.max(a, c)) special[i] = b - Math.max(a, Math.min(c, Math.sqrt(a * c) * 1.02));
  }

  // cash paid ÷ shares: fills the years next to filed ones that have no per-share figure (a
  // filer that stopped tagging it, or started late), and replaces a filed figure that dips
  // below both neighbouring years while the cash paid did not
  const reg = total.map((d, i) => d == null ? null : d - special[i]);
  const fill = i => { reg[i] = IMPL[i]; total[i] = IMPL[i]; source[i] = 'cash paid ÷ shares'; };
  for (let i = 1; i < N; i++) if (reg[i] == null && IMPL[i] > 0 && reg[i - 1] > 0) fill(i);
  for (let i = N - 2; i >= 0; i--) if (reg[i] == null && IMPL[i] > 0 && reg[i + 1] > 0) fill(i);
  if (!reg.some(v => v > 0) && IMPL.some(v => v > 0)) {
    IMPL.forEach((v, i) => { if (v > 0) { reg[i] = v; total[i] = v; source[i] = 'cash paid ÷ shares'; } });
  }
  const agrees = j => reg[j] > 0 && IMPL[j] > 0 && Math.abs(IMPL[j] / reg[j] - 1) < 0.15;
  for (let i = 1; i < N - 1; i++) {
    const a = reg[i - 1], b = reg[i], c = reg[i + 1];
    // only where cash paid tracks the filed figure in the years either side (no specials muddying it)
    if (trackRate >= 0.7 && a > 0 && b > 0 && c > 0 && b < 0.9 * Math.min(a, c) && agrees(i - 1) && agrees(i + 1) && IMPL[i] >= 0.97 * IMPL[i - 1]) {
      const scale = median(reg.map((d, j) => d > 0 && IMPL[j] > 0 && j !== i ? d / IMPL[j] : null).filter(fin));
      if (scale > 0.8 && scale < 1.25) {
        note('warn', `${fy(ends[i])}: the filed dividend per share (${round(b, 3)}) dips below both neighbouring years while cash paid did not; used cash paid ÷ shares (${round(IMPL[i] * scale, 3)}).`);
        reg[i] = IMPL[i] * scale; total[i] = reg[i] + special[i]; source[i] = 'cash paid ÷ shares';
      }
    }
  }

  // current rate from the quarters after the fiscal year, if the company pays quarterly
  const afterFY = tl.filter(t => t.end > ends[N - 1]);
  let lastQ = afterFY[afterFY.length - 1] || null, lastQNote = null, steadyBefore = false;
  if (lastQ) {
    // the two quarters before it paid about the same: a regular quarterly payer, so a lower
    // figure now is a cut rather than a semiannual gap
    const j = tl.indexOf(lastQ), a = tl[j - 1]?.v, b = tl[j - 2]?.v;
    steadyBefore = a > 0 && b > 0 && Math.abs(a / b - 1) < 0.25 && days(tl[j - 1].end, lastQ.end) < 120;
  }
  if (lastQ && tl.length >= 3) {
    const j = tl.indexOf(lastQ), prev = tl[j - 1]?.v, prev2 = tl[j - 2]?.v;
    if (prev > 0 && lastQ.v > 1.4 * prev && prev2 > 0 && Math.abs(prev / prev2 - 1) < 0.15) {
      lastQNote = `The quarter to ${lastQ.end} (${round(lastQ.v, 3)}) is ${round(lastQ.v / prev, 1)}× the one before — read as including a special; the current rate uses the prior quarter.`;
      lastQ = { end: tl[j - 1].end, v: prev };
    } else if (specialQ.has(lastQ.end)) lastQ = { end: lastQ.end, v: lastQ.v - specialQ.get(lastQ.end) };
  }
  const used = new Set(source.filter(Boolean));
  return { total, reg, special, source, lastQ, lastQNote, steadyBefore, events, used, trackRate, anyTag: order.length > 0 };
}

// ---- main ------------------------------------------------------------------
// x: compact facts; sub: filer profile; mkt: { price, mc } from the price snapshot;
// kind: 'standard'; 'utility' (payout and coverage on earnings — their free cash flow is
// structurally negative); 'financial' (brokers, asset managers: earnings basis, since client
// and fund flows run through operating cash); 'insurer' (earnings, return on equity, no
// leverage rule).
export function derive(x, sub, mkt, { kind = 'standard', keepYears = 12 } = {}) {
  const notes = [];
  const note = (sev, text) => { if (!notes.some(n => n.text === text)) notes.push({ sev, text }); };
  const filed = x.filings || {};

  const allEnds = fiscalYearEnds(x);
  if (!allEnds.length) return { error: 'no annual figures in the filings' };
  const lastEnd = allEnds[allEnds.length - 1];
  const ends = allEnds.filter(e => e >= '2009-01-01');
  const N = ends.length;
  if (N < 2) return { error: 'fewer than two fiscal years filed' };
  const series = f => ends.map(f);
  const i0 = N - 1;

  // ---- flows and balances
  const rev = merged(x.flow, REVENUE), cogs = merged(x.flow, COGS);
  const R = series(e => at(rev.vals, e));
  const GP = series((e, i) => {
    const g = at(x.flow.GrossProfit, e);
    if (g != null) return g;
    const c = at(cogs.vals, e);
    return c != null && R[i] != null ? R[i] - c : null;
  });
  const OPI = series(e => at(x.flow.OperatingIncomeLoss, e));
  const NI = series(e => at(merged(x.flow, NET_INCOME).vals, e));
  const PRE = series(e => at(merged(x.flow, PRETAX).vals, e));
  const TAX = series(e => at(x.flow.IncomeTaxExpenseBenefit, e));
  const DAv = series(e => at(merged(x.flow, DA).vals, e));
  const INT = series(e => at(merged(x.flow, INTEREST).vals, e));
  const CFOv = series(e => at(merged(x.flow, CFO).vals, e));
  const capMain = merged(x.flow, CAPEX), soft = merged(x.flow, SOFTWARE_CAPEX);
  const anyCapex = Object.keys(capMain.vals).length > 0 || Object.keys(soft.vals).length > 0;
  const CAPEXv = series(e => {
    const m = at(capMain.vals, e), s = at(soft.vals, e);
    if (m == null && s == null) return null;
    return (m || 0) + (at(capMain.used, e) === 'PaymentsToAcquireProductiveAssets' ? 0 : (s || 0));
  });
  const FCF = series((e, i) => CFOv[i] == null ? null : CAPEXv[i] != null ? CFOv[i] - CAPEXv[i] : anyCapex ? null : CFOv[i]);
  if (!anyCapex && CFOv.some(v => v != null)) note('info', 'No capital spending is tagged in the filings, so free cash flow here is operating cash flow.');
  // a few filers sign dividends paid as negative
  const DIVP = series(e => { const v = at(merged(x.flow, DIV_PAID).vals, e); return v == null ? v : Math.abs(v); });
  const BUYB = series(e => at(x.flow.PaymentsForRepurchaseOfCommonStock, e));
  const CASHv = series(e => at(merged(x.inst, CASH).vals, e));
  const STI = series(e => at(merged(x.inst, ST_INV).vals, e));
  const EQ = series(e => at(merged(x.inst, EQUITY).vals, e));
  const DEBTx = series(e => totalDebt(x.inst, e));
  const DEBT = DEBTx.map(d => d.debt);
  if (DEBTx[i0]?.floor) note('warn', 'Borrowings are filed only under instrument tags, so debt may be understated.');

  // ---- shares, on the newest basis
  const DIL = 'WeightedAverageNumberOfDilutedSharesOutstanding', BOTH = 'WeightedAverageNumberOfShareOutstandingBasicAndDiluted',
        BAS = 'WeightedAverageNumberOfSharesOutstandingBasic';
  const rawShares = mergedRows(x, [DIL, BOTH, BAS]);
  const shRows = unthousand(rawShares);
  const sh = chain(shRows, filed, false);
  const shBasic = x.perFiling[BAS] ? chain(unthousand(mergedRows(x, [BAS, BOTH, DIL])), filed, false) : sh;
  if (shRows.some((r, i) => r[2] !== rawShares[i][2])) note('info', 'Some filings give share counts in thousands; rescaled.');
  if (sh.odd.length) note('warn', `Share counts were restated by an unexplained ratio (${sh.odd.map(o => o.ratio).join(', ')}) — per-share history before ${sh.odd[0].filed.slice(0, 4)} may be on another basis.`);
  let SHD = series(e => at(sh.series, e));
  let SHB = series(e => at(shBasic.series, e));

  // ---- EPS on the share basis
  const epsRows = mergedRows(x, ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic']);
  const eps = sh.factor.size ? onShareBasis(epsRows, filed, sh.factor).series : chain(epsRows, filed, true).series;
  const EPS = series(e => at(eps, e));
  // no weighted share count filed (some Up-C structures): net income ÷ EPS stands in
  if (!SHD.some(v => v > 0)) {
    SHD = NI.map((n, i) => n && EPS[i] ? Math.abs(n / EPS[i]) : null);
    SHB = SHD;
    if (SHD.some(v => v > 0)) note('info', 'No weighted share count is filed; shares are taken as net income ÷ earnings per share.');
  }
  const splits = sh.events.map(s => ({ label: s.label, between: s.between }));

  // ---- dividends per share
  const IMPL = series((e, i) => DIVP[i] > 0 && SHB[i] > 0 ? DIVP[i] / SHB[i] : null);
  const dv = dividendHistory(x, ends, filed, sh, IMPL, note);
  for (const ev of dv.events) if (!splits.some(s => s.label === ev.label)) splits.push({ label: ev.label, between: ev.between });
  const REG = dv.reg, TOT = dv.total, SPEC = dv.special;
  const specialYears = SPEC.map((s, i) => s > 0.0005 ? yr(ends[i]) : null).filter(Boolean);
  if (specialYears.length) note('info', `Special dividends are left out of the growth and payout figures: FY${specialYears.join(', FY')}.`);
  if (REG[i0] > 1.6 * REG[i0 - 1] && REG[i0 - 1] > 0) note('warn', `FY${yr(ends[i0])} dividends are ${round(REG[i0] / REG[i0 - 1], 2)}× the year before — a special may be included.`);
  if (dv.lastQNote) note('info', dv.lastQNote);
  const derivedYears = dv.source.map((s, i) => s && s !== 'annual' && REG[i] > 0 ? `${fy(ends[i])} (${s})` : null).filter(Boolean);
  if (derivedYears.length) note('info', `No annual dividend per share filed for ${derivedYears.join(', ')}.`);

  // ---- a split after the latest 10-K: shares on the cover page jump by a split ratio
  let postSplit = 1;
  if (x.cover?.shares && SHD[i0] && x.cover.asOf > lastEnd) {
    const k = snap(x.cover.shares / SHD[i0]);
    if (k && (k >= 1.2 || k <= 0.8)) {
      postSplit = k;
      note('warn', `Shares outstanding on ${x.cover.asOf} are ${round(k, 2)}× the last fiscal year's — a ${splitLabel(k)} after the 10-K; per-share figures converted.`);
      splits.push({ label: splitLabel(k), between: [lastEnd, x.cover.asOf] });
    }
  }
  const adj = v => v == null ? v : v / postSplit;

  // ---- dividend metrics
  const price = mkt?.price;
  let first = REG.findIndex(v => v > 0);
  const paying = first >= 0 && REG[i0] > 0;
  // a part-year initiation isn't growth
  if (first >= 0 && first < i0 && REG[first] < 0.6 * REG[first + 1]) first++;
  const dpsFY = adj(REG[i0]);
  let dpsCur = dpsFY, curBasis = 'last fiscal year', cutAfter = false;
  if (paying && dv.lastQ) {
    // quarters after a post-10-K split are already on the new basis
    const q = dv.lastQ.v, fyQ = dpsFY / 4;
    const v = Math.abs(q / fyQ - 1) < Math.abs(q / postSplit / fyQ - 1) ? q : q / postSplit;
    const r = v * 4 / dpsFY;
    if (r >= 0.9 && r <= 1.6) { dpsCur = v * 4; curBasis = `quarter to ${dv.lastQ.end} × 4`; }
    else if (r < 0.9 && dv.steadyBefore) {
      dpsCur = v * 4; curBasis = `quarter to ${dv.lastQ.end} × 4`; cutAfter = true;
      note('warn', `The dividend was cut after the last fiscal year: the quarter to ${dv.lastQ.end} paid ${round(v, 4)} against ${round(fyQ, 4)} a quarter in FY${yr(ends[i0])}.`);
    }
  }
  // a latest year far above the one before, with no quarter after it to say whether it lasted,
  // can't give a trustworthy yield
  const spikeYear = REG[i0 - 1] > 0 && REG[i0] > 1.6 * REG[i0 - 1] && curBasis === 'last fiscal year';
  let yieldPct = price > 0 && dpsCur > 0 ? dpsCur / price * 100 : paying ? null : 0;
  if (spikeYear || yieldPct > 15) {
    note('warn', `A ${round(yieldPct, 1)}% yield on the filed figures is implausible for a regular dividend (a special, a cut, or a filing error); the yield rule is left out.`);
    yieldPct = null;
  }

  let g5 = null, gYears = 0;
  // growth runs to the latest year, or to the year before when the latest is an unconfirmed spike
  const gEnd = spikeYear ? i0 - 1 : i0;
  if (paying && REG[gEnd] > 0) {
    let from = Math.max(first, gEnd - 5);
    // a base year depressed by a cut or suspension would flatter the rate; measure from before it
    while (from > first && REG[from - 1] > 0 && REG[from] < 0.97 * REG[from - 1]) from--;
    gYears = gEnd - from;
    if (gYears >= 3) g5 = cagr(REG[from], REG[gEnd], gYears);
  }
  let streak = 0;
  for (let i = i0; i > 0; i--) {
    if (REG[i] > 0 && REG[i - 1] > 0 && REG[i] > REG[i - 1] * 1.0005) streak++;
    else break;
  }
  const firstPaid = REG.findIndex(v => v > 0);
  const streakOpen = paying && streak > 0 && i0 - streak === 0 && firstPaid === 0;    // runs into the start of the data
  const cuts = [];
  for (let i = Math.max(1, firstPaid + 1); i <= i0; i++) if (REG[i] != null && REG[i - 1] > 0 && REG[i] < 0.97 * REG[i - 1]) cuts.push(yr(ends[i]));
  const idx = y => ends.findIndex(e => yr(e) === y);
  const i19 = idx(2019), i20 = idx(2020), i21 = idx(2021);
  const noCut2021 = paying && i20 >= 0 && i21 >= 0 && REG[i21] != null
    ? !(i19 >= 0 && REG[i19] > 0 && REG[i20] < 0.97 * REG[i19]) && !(REG[i20] > 0 && REG[i21] < 0.97 * REG[i20])
    : null;

  // payout on the regular dividend: the regular rate × shares, capped at the cash actually paid
  // (specials don't show in every company's per-share figures, so the cash total can't be
  // trusted to be regular)
  const regShare = i => TOT[i] > 0 ? Math.min(1, Math.max(0, REG[i] / TOT[i])) : 1;
  const DIVREG = DIVP.map((d, i) => d == null ? null : REG[i] > 0 && SHB[i] > 0 ? Math.min(d, REG[i] * SHB[i] * 1.02) : d * regShare(i));
  const last3 = [i0 - 2, i0 - 1, i0].filter(i => i >= 0);
  const sum = (arr, ix) => ix.every(i => arr[i] != null) ? ix.reduce((s, i) => s + arr[i], 0) : null;
  const divSum = sum(DIVREG, last3), fcfSum = sum(FCF, last3), niSum = sum(NI, last3);
  let payout = null, payoutBasis = null;
  const useEarnings = kind !== 'standard' || fcfSum == null;
  if (!useEarnings && divSum != null) {
    payout = fcfSum > 0 ? divSum / fcfSum * 100 : Infinity;
    payoutBasis = 'fcf';
  } else if (niSum != null && divSum != null) {
    payout = niSum > 0 ? divSum / niSum * 100 : Infinity;
    payoutBasis = kind === 'standard' ? 'earnings-fallback' : 'earnings';
  }
  const avg3 = (arr, end) => { const ix = [end - 2, end - 1, end]; return ix.every(i => i >= 0 && arr[i] != null) ? ix.reduce((s, i) => s + arr[i], 0) / 3 : null; };
  const base = useEarnings ? NI : FCF;
  const cover5 = (() => {
    const a = avg3(base, i0 - 5), b = avg3(base, i0);
    if (a == null || b == null) return null;
    return a > 0 && b > 0 ? cagr(a, b, 5) : b <= 0 ? -Infinity : Infinity;
  })();

  // ---- returns and leverage
  const EBIT = OPI.map((o, i) => o ?? (PRE[i] != null ? PRE[i] + (INT[i] || 0) : null));
  const EBITDA = EBIT.map((b, i) => b == null ? null : b + (DAv[i] || 0));
  const cashAll = i => (CASHv[i] || 0) + (STI[i] || 0);
  // no borrowing tagged at all while paying real interest: the debt is filed under tags this
  // doesn't read, so leverage and return on capital are left out rather than shown as net cash
  // (or interest above 20% of the debt found — most of it is filed elsewhere)
  const debtKnown = (DEBTx[i0]?.anyTag || !(INT[i0] > 0.01 * (R[i0] || Infinity))) && !(INT[i0] > 0.2 * DEBT[i0] && INT[i0] > 0.005 * (R[i0] || Infinity));
  if (!debtKnown) note('warn', 'Interest is paid but no borrowings are tagged in a form this reads, so leverage and return on capital are left out.');
  const nde = (() => {
    if (kind === 'insurer' || !debtKnown || EBITDA[i0] == null || EQ[i0] == null) return null;
    const nd = DEBT[i0] - cashAll(i0);
    if (nd <= 0) return EBITDA[i0] > 0 ? nd / EBITDA[i0] : -0.01;         // net cash reads as zero or below
    return EBITDA[i0] > 0 ? nd / EBITDA[i0] : Infinity;
  })();
  const taxRate = i => PRE[i] > 0 && TAX[i] != null ? Math.min(0.35, Math.max(0, TAX[i] / PRE[i])) : 0.21;
  const roicAt = i => {
    if (i < 1 || EBIT[i] == null) return null;
    const ic = j => EQ[j] != null ? EQ[j] + (DEBT[j] || 0) - (CASHv[j] || 0) : null;
    let a = ic(i), b = ic(i - 1);
    let avg = a != null && b != null ? (a + b) / 2 : a;
    if (!(avg > 0)) {
      const alt = j => EQ[j] != null ? EQ[j] + (DEBT[j] || 0) : null;
      a = alt(i); b = alt(i - 1);
      avg = a != null && b != null ? (a + b) / 2 : a;
    }
    // invested capital near zero or below (years of buybacks, or accumulated losses) makes the
    // ratio meaningless rather than high
    if (!(avg > 0.05 * (R[i] || 0)) || !(avg > 0)) return null;
    return EBIT[i] * (1 - taxRate(i)) / avg * 100;
  };
  const roeAt = i => {
    if (i < 1 || NI[i] == null || EQ[i] == null) return null;
    const avg = EQ[i - 1] != null ? (EQ[i] + EQ[i - 1]) / 2 : EQ[i];
    return avg > 0 ? NI[i] / avg * 100 : null;
  };
  const roic = kind === 'insurer' ? roeAt(i0) : debtKnown ? roicAt(i0) : null;
  if (kind !== 'insurer' && debtKnown && roic == null && EBIT[i0] != null) note('info', 'Invested capital is near zero or negative (buybacks or past losses), so return on capital is not meaningful and is left out.');

  // ---- growth metrics
  const revG3 = i0 >= 3 ? cagr(R[i0 - 3], R[i0], 3) : null;
  const revYoY = R[i0 - 1] > 0 && R[i0] != null ? (R[i0] / R[i0 - 1] - 1) * 100 : null;
  let revUp = 0, revSeen = 0;
  for (let i = i0; i > i0 - 4 && i > 0; i--) if (R[i] != null && R[i - 1] > 0) { revSeen++; if (R[i] > R[i - 1]) revUp++; }
  const margin = (arr, i) => i >= 0 && arr[i] != null && R[i] > 0 ? arr[i] / R[i] * 100 : null;
  const gm = margin(GP, i0), gm3 = margin(GP, i0 - 3);
  const opm = margin(OPI, i0), opm3 = margin(OPI, i0 - 3);
  const fcfm = margin(FCF, i0);
  const fcfPos3 = last3.filter(i => FCF[i] > 0).length;
  const dil3 = i0 >= 3 && SHD[i0 - 3] > 0 && SHD[i0] > 0 ? cagr(SHD[i0 - 3], SHD[i0], 3) : null;
  const epsNow = adj(EPS[i0]);
  const epsG3 = i0 >= 3 ? cagr(EPS[i0 - 3], EPS[i0], 3) : null;
  const pe = price > 0 && epsNow > 0 ? price / epsNow : null;
  const peg = pe != null && epsG3 > 0 ? pe / epsG3 : null;
  const r40 = revYoY != null && fcfm != null ? revYoY + fcfm : null;

  const ageDays = days(lastEnd, new Date().toISOString().slice(0, 10));
  if (ageDays > 470) note('warn', `The latest 10-K covers the year to ${lastEnd} — more than fifteen months old.`);

  const from = Math.max(0, N - keepYears);
  const cut = arr => arr.slice(from).map(v => fin(v) ? v : null);
  return {
    lastEnd, stale: ageDays > 470,
    div: {
      paying, dpsFY, dpsCur, curBasis, cutAfter, yield: yieldPct,
      g5, gYears, streak, streakOpen, yrs: firstPaid >= 0 ? i0 - firstPaid + 1 : 0, firstYear: firstPaid >= 0 ? yr(ends[firstPaid]) : null,
      cuts, noCut2021, payout, payoutBasis, cover5, roic, nde, specialYears, sources: [...dv.used],
    },
    gro: {
      rev: R[i0], revG3, revYoY, revUp, revSeen, gm, gmChg: gm != null && gm3 != null ? gm - gm3 : null,
      opm, opmChg: opm != null && opm3 != null ? opm - opm3 : null, fcfm, fcfPos3, fcfYears: last3.length,
      roic, nde, dil3, epsNow, epsG3, pe, peg, r40,
    },
    splits, notes,
    series: {
      fy: ends.slice(from).map(yr), end: ends.slice(from),
      rev: cut(R), gp: cut(GP), opi: cut(OPI), ni: cut(NI), cfo: cut(CFOv), capex: cut(CAPEXv), fcf: cut(FCF),
      div: cut(DIVP), buyback: cut(BUYB), dps: cut(REG.map(adj)), dpsSpecial: cut(SPEC.map(v => v ? adj(v) : 0)),
      dpsSource: dv.source.slice(from), dpsImplied: cut(IMPL.map(adj)), eps: cut(EPS.map(adj)),
      shares: cut(SHD.map(v => v == null ? v : v * postSplit)),
      debt: cut(DEBT), cash: cut(CASHv.map((c, i) => c == null && STI[i] == null ? null : cashAll(i))), equity: cut(EQ), ebitda: cut(EBITDA),
    },
  };
}
