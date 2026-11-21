// Build data/shariah/funds.json: every fund in data/shariah/funds-list.json screened through its holdings.
// Run after scripts/shariah/nport.py has written data/shariah/nport-latest.jsonl and sec-load.js has written sec-inputs.json:
//   SEC_USER_AGENT="Name email" node scripts/shariah/fund-load.js
// It fetches SEC inputs for held companies that are not on the dashboard (saved in data/shariah/fund-companies.json),
// and fails (exit 1) when its own checks fail: holdings weights outside 97-103% without collateral, or fewer funds written.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { getter, companies, yieldAverager, inputsFor } from './sec-lib.js';
import { buildMaps, mapHolding, holdingKind, screenHolding, fundSummary } from '../../engine/funds.js';

const MAX_AGE_DAYS = 150; // A7: holdings up to 150 days old (owner, 2026-11-21)
const list = JSON.parse(readFileSync('data/shariah/funds-list.json', 'utf8')).funds;
const reports = Object.fromEntries(readFileSync('data/shariah/nport-latest.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((r) => [r.fund, r]));
const sic = JSON.parse(readFileSync('data/shariah/sic-activity.json', 'utf8'));
const stocks = JSON.parse(readFileSync('data/shariah/sec-inputs.json', 'utf8')).stocks;
// Quarter-average closes for holdings near the debt line (data/shariah/quarter-prices.json, from FMP; see SHARIAH-REFRESH.md)
const QP = existsSync('data/shariah/quarter-prices.json') ? JSON.parse(readFileSync('data/shariah/quarter-prices.json', 'utf8')).prices ?? {} : {};

const get = getter();
const cos = companies(get);
const tickerOf = new Map();
for (const c of cos) if (!tickerOf.has(c.cik)) tickerOf.set(c.cik, c.ticker); // SEC lists the common stock first (not JPM-PM)
const seed = Object.values(reports).flatMap((r) => r.holdings ?? []).filter((h) => h.ticker && h.isin).map((h) => ({ isin: h.isin, ticker: h.ticker }));
const maps = buildMaps(cos, seed);

// company inputs by CIK: the dashboard's first, then fetched
const byCik = new Map(Object.values(stocks).filter((r) => r.cik).map((r) => [r.cik, r]));
const need = new Set();
for (const r of Object.values(reports)) for (const h of r.holdings ?? []) {
  if (holdingKind(h) !== 'equity') continue;
  const m = mapHolding(h, maps);
  if (m.cik && !byCik.has(m.cik)) need.add(m.cik);
}
const avgYield = yieldAverager(get);
const extra = {};
for (const cik of need) { extra[cik] = inputsFor(cik, get, avgYield); byCik.set(cik, extra[cik]); process.stderr.write('.'); }
writeFileSync('data/shariah/fund-companies.json', JSON.stringify({ built: new Date().toISOString(), companies: extra }));

const today = new Date().toISOString().slice(0, 10);
const ageDays = (d) => Math.round((Date.parse(today) - Date.parse(d)) / 864e5);
const problems = [];
const out = { built: new Date().toISOString(), source: 'SEC N-PORT (holdings), SEC EDGAR companyfacts (companies)', maxAgeDays: MAX_AGE_DAYS, funds: [] };
for (const f of list) {
  if (f.kind === 'none') { out.funds.push({ sym: f.sym, from: f.from, kind: 'none', why: f.why }); continue; }
  const r = reports[f.sym];
  if (!r || r.err) { out.funds.push({ sym: f.sym, from: f.from, err: r?.err ?? 'no report' }); continue; }
  const rows = r.holdings.map((h) => {
    const kind = holdingKind(h);
    const row = { n: h.name.slice(0, 48), w: h.pct / 100, k: kind };
    if (kind !== 'equity') return row;
    const m = mapHolding(h, maps);
    const c = m.cik ? byCik.get(m.cik) : null;
    const price = h.units === 'NS' && h.balance > 0 && h.usd > 0 ? h.usd / h.balance : null;
    const t = m.cik ? tickerOf.get(m.cik) ?? null : null;
    const q = t ? QP[t] : null;
    const s = screenHolding(c, price, sic, q && q.start === c?.period?.start && q.end === c?.period?.end ? q : null);
    return { ...row, t, by: m.by, s: s.state, exact: !!s.exact, why: [...(s.failed ?? []), ...(s.missing ?? [])],
      dr: s.numbers?.debtRatio ?? null, is: s.numbers?.illicitShare ?? null, est: !!c?.illicitEstimated, pur: s.purification ?? null,
      end: c?.period?.end ?? null, foreign: h.country && h.country !== 'US' };
  });
  const sum = fundSummary(rows.map((x) => ({ w: x.w, kind: x.k, state: x.s, purification: x.pur })));
  // with their sign (a swap can be worth less than nothing); cash the report does not list stays outside
  const held = rows.filter((x) => x.k !== 'collateral').reduce((a, x) => a + x.w, 0);
  if (held < 0.95 || held > 1.05) problems.push(`${f.sym}: holdings add up to ${(100 * held).toFixed(2)}% without collateral`);
  const old = ageDays(r.as_of) > MAX_AGE_DAYS;
  const kinds = {};
  for (const x of rows) kinds[x.k] = (kinds[x.k] ?? 0) + Math.abs(x.w);
  out.funds.push({ sym: f.sym, from: f.from, as_of: r.as_of, filed: r.filed, accession: r.accession, ageDays: ageDays(r.as_of), n: rows.length,
    state: old ? 'ما ينحكم' : sum.state, old, badWeight: sum.badWeight, unknownWeight: sum.unknownWeight, collateralWeight: sum.collateralWeight,
    purificationPct: sum.purificationPct, purificationUnknownWeight: sum.purificationUnknownWeight, kinds,
    rows: rows.sort((a, b) => Math.abs(b.w) - Math.abs(a.w)) });
}
// Holdings the band could not decide: the next step fetches their quarter-average close
const band = new Map();
for (const f of out.funds) for (const x of f.rows ?? []) if (x.why?.includes('priceBand') && x.t) {
  const c = byCik.get(cos.find((k) => k.ticker === x.t)?.cik);
  if (c?.period) band.set(x.t, { t: x.t, start: c.period.start, end: c.period.end });
}
writeFileSync('data/shariah/band-needed.json', JSON.stringify([...band.values()], null, 1));
const written = out.funds.filter((f) => f.rows).length;
if (written < 35) problems.push(`only ${written} funds with holdings`);
writeFileSync('data/shariah/funds.json', JSON.stringify(out));
console.log(`\nfunds ${out.funds.length} (with holdings ${written}); companies fetched ${need.size}; near the debt line ${band.size} (band-needed.json)`);
for (const f of out.funds) console.log(f.sym.padEnd(5), f.state ?? f.why ?? f.err, f.rows ? `bad ${(100 * f.badWeight).toFixed(1)}% unknown ${(100 * f.unknownWeight).toFixed(1)}% collateral ${(100 * f.collateralWeight).toFixed(1)}% purif/qtr ${(100 * f.purificationPct).toFixed(3)}% age ${f.ageDays}d` : '');
if (problems.length) { console.log('PROBLEMS', problems); process.exitCode = 1; }
