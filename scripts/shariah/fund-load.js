// Build data/shariah/funds.json: every fund in data/shariah/funds-list.json screened through its holdings.
// Run after scripts/shariah/nport.py has written data/shariah/nport-latest.jsonl and sec-load.js has written sec-inputs.json:
//   SEC_USER_AGENT="Name email" node scripts/shariah/fund-load.js
// It fetches SEC inputs for held companies that are not on the dashboard (saved in data/shariah/fund-companies.json),
// and fails (exit 1) when its own checks fail: holdings (with their sign, without collateral) outside 95-105% of net assets,
// or fewer than 35 funds written.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { getter, companies, yieldAverager, inputsFor, newErrors, MAX_NEW_ERRORS } from './sec-lib.js';
import { buildMaps, mapHolding, holdingKind, screenHolding, fundSummary, holdingWeight, splitBasis, onShares, needsQuarterAverage, billQuarter } from '../../engine/funds.js';

const MAX_AGE_DAYS = 150; // A7: holdings up to 150 days old (owner, 2026-11-21)
const list = JSON.parse(readFileSync('data/shariah/funds-list.json', 'utf8')).funds;
const reports = Object.fromEntries(readFileSync('data/shariah/nport-latest.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((r) => [r.fund, r]));
const sic = JSON.parse(readFileSync('data/shariah/sic-activity.json', 'utf8'));
const stocks = JSON.parse(readFileSync('data/shariah/sec-inputs.json', 'utf8')).stocks;
// Quarter-average closes for holdings near the debt line (data/shariah/quarter-prices.json; each entry names its source)
const QPF = existsSync('data/shariah/quarter-prices.json') ? JSON.parse(readFileSync('data/shariah/quarter-prices.json', 'utf8')) : {};
const QP = QPF.prices ?? {};
// Saved daily bars (TradingView 1D, split-adjusted as of their last bar), by ticker as SEC writes it (BRK.B -> BRK-B):
// they settle which side of a split a report price is on
const BARS = existsSync('data/us/bars') ? new Map(readdirSync('data/us/bars').map((f) => [f.replace(/\.json\.gz$/, '').replace(/^[A-Z]+_/, '').replace(/\./g, '-'), f])) : new Map();
const barData = new Map();
function barsOf(t) {
  if (!t || !BARS.has(t)) return null;
  if (!barData.has(t)) barData.set(t, JSON.parse(gunzipSync(readFileSync(`data/us/bars/${BARS.get(t)}`))));
  return barData.get(t);
}
function barClose(t, date) {
  const b = barsOf(t);
  if (!b) return null;
  let i = b.date.length - 1;
  while (i >= 0 && b.date[i] > date) i--;
  return i >= 0 && (Date.parse(date) - Date.parse(b.date[i])) / 864e5 <= 5 ? b.close[i] : null;   // that day or the last trading day before
}

const get = getter();
const cos = companies(get);
const tickerOf = new Map();
for (const c of cos) if (!tickerOf.has(c.cik)) tickerOf.set(c.cik, c.ticker); // SEC lists the common stock first (not JPM-PM)
const seed = Object.values(reports).flatMap((r) => r.holdings ?? []).filter((h) => h.ticker && h.isin).map((h) => ({ isin: h.isin, ticker: h.ticker, name: h.name, country: h.country }));
const maps = buildMaps(cos, seed);

// company inputs by CIK: the dashboard's first, then fetched
const byCik = new Map(Object.values(stocks).filter((r) => r.cik).map((r) => [r.cik, r]));
const need = new Set();
for (const r of Object.values(reports)) for (const h of r.holdings ?? []) {
  if (holdingKind(h) !== 'equity') continue;
  const m = mapHolding(h, maps);
  if (m.cik && !byCik.has(m.cik)) need.add(m.cik);
}
// --reuse: take fund-companies.json (up to 36 hours old) instead of fetching again (a rerun after new prices)
const reuse = process.argv.includes('--reuse') && existsSync('data/shariah/fund-companies.json')
  ? JSON.parse(readFileSync('data/shariah/fund-companies.json', 'utf8')) : null;
if (reuse && Date.now() - Date.parse(reuse.built) > 36 * 3600e3) throw new Error('fund-companies.json is older than 36 hours: run without --reuse');
const avgYield = reuse ? null : yieldAverager(get);
// the interest a fund earns on its own bills, bonds and money funds, per quarter per unit of value: the 3-month bill
// yield averaged over the quarter before the report (audit 2026-11-22: MAGS holds 65% in bills and money funds)
const billYield = yieldAverager(get, 'DTB3');
const ownInterest = (asOf) => billQuarter(billYield(new Date(Date.parse(asOf) - 91 * 864e5).toISOString().slice(0, 10), asOf));
const extra = {};
for (const cik of need) { extra[cik] = reuse?.companies?.[cik] ?? inputsFor(cik, get, avgYield ?? yieldAverager(get)); byCik.set(cik, extra[cik]); process.stderr.write('.'); }
// a fetch SEC refused looks like a company without numbers: more than a few new ones stop the run before anything is written
const prevCos = reuse ? null : existsSync('data/shariah/fund-companies.json') ? JSON.parse(readFileSync('data/shariah/fund-companies.json', 'utf8')).companies : null;
const lost = prevCos ? newErrors(prevCos, extra) : [];
if (lost.length > MAX_NEW_ERRORS) throw new Error(`${lost.length} held companies newly without SEC numbers (more than ${MAX_NEW_ERRORS}): ${lost.join(', ')}`);
// a rerun with --reuse keeps the fetch's own time, so the 36-hour limit counts from the fetch, not from the last rerun
writeFileSync('data/shariah/fund-companies.json', JSON.stringify({ built: reuse?.built ?? new Date().toISOString(), companies: extra }));

// Riyadh's date (UTC+3, no daylight saving): the weekly run starts Saturday 01:17 Riyadh, still Friday in UTC
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const nsPrice = (h) => (h.units === 'NS' && h.balance > 0 && h.usd > 0 ? h.usd / h.balance : null);
// A report price on the share count's basis: after a split (engine/sec-facts.js), prices from before it are divided by
// its ratio; when the side is unknown both stand (audit 2026-11-22: CrowdStrike's post-split prices were divided too).
// The saved bars include a split when it falls before their last bar, or when some report price of the company sits at
// k times its bar; else a bar at the price proves nothing (a split after 2026-10-06; fix review 2026-11-22)
const adjusted = new Map();
function barsAdjusted(c, t) {
  if (adjusted.has(c.cik)) return adjusted.get(c.cik);
  const b = barsOf(t), k = c.splitRatio;
  let v = !!(b && c.splitWindow && c.splitWindow[1] <= b.date.at(-1)) || null;
  if (!v && b) for (const r of Object.values(reports)) for (const h of r.holdings ?? []) {
    const p = holdingKind(h) === 'equity' ? nsPrice(h) : null, bar = p ? barClose(t, r.as_of) : null;
    if (bar > 0 && mapHolding(h, maps).cik === c.cik && Math.abs(p / bar / k - 1) < 0.15) v = true;
  }
  adjusted.set(c.cik, v);
  return v;
}
const shareBasis = (c, t, price, asOf) => (c?.splitRatio ? splitBasis({ price, asOf, bar: barClose(t, asOf), splitRatio: c.splitRatio, splitWindow: c.splitWindow, barsAdjusted: barsAdjusted(c, t) }) : 'post');
// Every report price of each company, across all funds, with its date: one band per company, so a fund whose report
// date happened to fall on a high price does not pass a company another fund's report puts under the line (review
// 2026-11-22: LUV, HONA). The band uses the prices dated in the company's own quarter when there are any (audit
// 2026-11-22: a 06-30 price kept Martin Marietta's Jul-Sep fail open), else all of them.
const prices = new Map();
for (const r of Object.values(reports)) for (const h of r.holdings ?? []) {
  const p = holdingKind(h) === 'equity' ? nsPrice(h) : null, cik = p && mapHolding(h, maps).cik;
  if (!cik) continue;
  const c = byCik.get(cik), t = tickerOf.get(cik) ?? null;
  for (const x of onShares(p, shareBasis(c, t, p, r.as_of), c?.splitRatio)) prices.set(cik, [...(prices.get(cik) ?? []), { p: x, date: r.as_of }]);
}
const rangeOf = (cik, period) => {
  const all = prices.get(cik) ?? [], inq = period ? all.filter((x) => x.date >= period.start && x.date <= period.end) : [];
  const use = (inq.length ? inq : all).map((x) => x.p);
  return use.length ? [Math.min(...use), Math.max(...use)] : null;
};
// A quarter average from data dated before a split may be on the other basis: divided by the ratio when the split
// came after the data, open both ways when it may have (the source names the last bar's date; else the entry's asOf,
// kept across weekly merges; else the file's date).
const QP_DATE = (QPF.built ?? '').slice(0, 10);
function quarterOn(q, c) {
  if (!q || !c?.splitRatio || !c.splitWindow) return q;
  const asOf = q.source?.match(/last bar (\d{4}-\d{2}-\d{2})/)?.[1] ?? q.asOf ?? QP_DATE;
  if (asOf && c.splitWindow[0] >= asOf) return { ...q, avg: q.avg / c.splitRatio };
  if (asOf && c.splitWindow[1] <= asOf) return q;
  return { ...q, alt: q.avg / c.splitRatio };
}
const ageDays = (d) => Math.round((Date.parse(today) - Date.parse(d)) / 864e5);
const problems = [];
const out = { built: new Date().toISOString(), source: 'SEC N-PORT (holdings), SEC EDGAR companyfacts (companies)', maxAgeDays: MAX_AGE_DAYS, funds: [] };
for (const f of list) {
  if (f.kind === 'none') { out.funds.push({ sym: f.sym, from: f.from, kind: 'none', why: f.why }); continue; }
  const r = reports[f.sym];
  if (!r || r.err) { out.funds.push({ sym: f.sym, from: f.from, err: r?.err ?? 'no report' }); continue; }
  const rows = r.holdings.map((h) => {
    const kind = holdingKind(h);
    const row = { n: h.name.slice(0, 48), w: holdingWeight(h, r.net_assets), k: kind };
    if (kind === 'debt' || kind === 'cash-fund') return { ...row, pur: ownInterest(r.as_of) };
    if (kind !== 'equity') return row;
    const m = mapHolding(h, maps);
    const c = m.cik ? byCik.get(m.cik) : null;
    const t = m.cik ? tickerOf.get(m.cik) ?? null : null;
    const raw = nsPrice(h), basis = raw ? shareBasis(c, t, raw, r.as_of) : 'post';
    const price = raw ? onShares(raw, basis, c?.splitRatio)[0] : null;        // the lower one when the side is unknown: more purification
    const qp = t ? QP[t] : null;
    const q = quarterOn(qp && qp.start === c?.period?.start && qp.end === c?.period?.end ? qp : null, c);
    const s = screenHolding(c, price, sic, q, m.cik ? rangeOf(m.cik, c?.period) : null);
    const is = s.numbers?.illicitShare ?? null;
    // reasons: an interest bound above 5% is not "missing interest" (an estimate, or a combined figure the company
    // publishes); an activity under review says so (review 2026-11-22). A fail lists only what fails (audit 2026-11-22).
    const bound = (x) => (x === 'illicit' && c?.illicitEstimated && is > 0.05 ? (c?.estimate != null ? 'illicitHigh' : 'illicitBound') : x);
    const why = [...(s.failed ?? []), ...(s.state === 'غير جائز' ? [] : (s.missing ?? []).map(bound)),
      ...(basis == null && s.state === 'ما ينحكم' && !(s.missing ?? []).includes('split') ? ['split'] : []), ...(s.activity === 'review' ? ['activity'] : [])];
    return { ...row, t, by: m.by, s: s.state, exact: !!s.exact, why,
      // revenue 0 with interest: an infinite share, written as 100% with a flag (JSON has no Infinity)
      dr: s.numbers?.debtRatio ?? null, is: is === Infinity ? 1 : is, ...(is === Infinity ? { noRev: true } : {}),
      est: !!c?.illicitEstimated && c?.estimate != null, ub: !!c?.illicitEstimated && c?.estimate == null,
      pur: s.purification ?? null, start: c?.period?.start ?? null, end: c?.period?.end ?? null, foreign: h.country && h.country !== 'US',
      // a 10-Q or 10-K newer than these numbers (companyfacts lags some filings; plan R5 wants the latest)
      ...(c?.newerFiling?.p ? { newer: c.newerFiling.p } : {}) };
  });
  // look-through share of illicit revenue (plan E3): a share above 100% means the revenue tag leaves interest out (lenders
  // with fee-only revenue, review 2026-11-22), so it counts as 100%
  const sum = fundSummary(rows.map((x) => ({ w: x.w, kind: x.k, state: x.s, purification: x.pur, illicitShare: x.is == null ? null : Math.min(1, x.is) })));
  // with their sign (a swap can be worth less than nothing); cash the report does not list stays outside
  const held = rows.filter((x) => x.k !== 'collateral').reduce((a, x) => a + x.w, 0);
  if (held < 0.95 || held > 1.05) problems.push(`${f.sym}: holdings add up to ${(100 * held).toFixed(2)}% without collateral`);
  const old = ageDays(r.as_of) > MAX_AGE_DAYS;
  const kinds = {};
  for (const x of rows) kinds[x.k] = (kinds[x.k] ?? 0) + Math.abs(x.w);
  out.funds.push({ sym: f.sym, from: f.from, as_of: r.as_of, filed: r.filed, accession: r.accession, ageDays: ageDays(r.as_of), n: rows.length,
    state: old ? 'ما ينحكم' : sum.state, old, badWeight: sum.badWeight, unknownWeight: sum.unknownWeight, collateralWeight: sum.collateralWeight,
    purificationPct: sum.purificationPct, purificationUnknownWeight: sum.purificationUnknownWeight, purificationCoveredWeight: sum.purificationCoveredWeight,
    illicitLookThrough: sum.illicitLookThrough, illicitCoveredWeight: sum.illicitCoveredWeight, kinds,
    rows: rows.sort((a, b) => Math.abs(b.w) - Math.abs(a.w)) });
}
// Holdings the band could not decide, or passed near the debt line: the next step fetches their quarter-average close,
// first those whose answer can change a fund's verdict, largest weight first (verification 2026-11-22: 8 of the first
// 10 could change none). In a passing fund, a pass that would turn unknown; in an unjudged fund under 5% non-compliant,
// an unknown that would pass, or any row whose fail would cross 5%; never a fund past its 150 days.
const canFlip = (f, x) => {
  if (f.old || !(f.badWeight < 0.05)) return false;
  const w = Math.abs(x.w), sum = f.badWeight + f.unknownWeight;
  if (f.state === 'مختلط جائز') return sum + w >= 0.05;
  return (x.s === 'ما ينحكم' && sum - w < 0.05) || f.badWeight + w >= 0.05;
};
const band = new Map();
for (const f of out.funds) for (const x of f.rows ?? []) if (needsQuarterAverage(x)) {
  const c = byCik.get(cos.find((k) => k.ticker === x.t)?.cik);
  const pri = canFlip(f, x) ? Math.abs(x.w) : 0;
  if (c?.period) band.set(x.t, { t: x.t, start: c.period.start, end: c.period.end, pri: Math.max(pri, band.get(x.t)?.pri ?? 0) });
}
writeFileSync('data/shariah/band-needed.json', JSON.stringify([...band.values()].sort((a, b) => b.pri - a.pri).map(({ pri, ...e }) => e), null, 1));
const written = out.funds.filter((f) => f.rows).length;
if (written < 35) problems.push(`only ${written} funds with holdings`);
writeFileSync('data/shariah/funds.json', JSON.stringify(out));
console.log(`\nfunds ${out.funds.length} (with holdings ${written}); companies fetched ${need.size}; near the debt line ${band.size} (band-needed.json)`);
for (const f of out.funds) console.log(f.sym.padEnd(5), f.state ?? f.why ?? f.err, f.rows ? `bad ${(100 * f.badWeight).toFixed(1)}% unknown ${(100 * f.unknownWeight).toFixed(1)}% collateral ${(100 * f.collateralWeight).toFixed(1)}% purif/qtr ${(100 * f.purificationPct).toFixed(3)}% age ${f.ageDays}d` : '');
if (problems.length) { console.log('PROBLEMS', problems); process.exitCode = 1; }
