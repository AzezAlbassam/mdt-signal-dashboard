// Build data/shariah/sec-inputs.json: SEC inputs for every US stock on the dashboard.
// Usage: SEC_USER_AGENT="Name email" node scripts/shariah/sec-load.js [TICKER ...]
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { secInputs } from '../../engine/sec-facts.js';

const UA = process.env.SEC_USER_AGENT;
if (!UA) throw new Error('SEC_USER_AGENT is not set');
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const get = (url, json = true) => {
  for (let i = 0; i < 3; i++) {
    try { sleep(150); const t = execFileSync('curl', ['-sf', '--max-time', '60', '-H', `User-Agent: ${UA}`, url], { maxBuffer: 1 << 28 }).toString(); return json ? JSON.parse(t) : t; }
    catch (e) { if (e.status === 22) return null; sleep(2000 * (i + 1)); }
  }
  return null;
};

const tickers = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync('data/fq').map(f => f.replace('.json', '')).filter(s => !s.startsWith('TADAWUL_')).map(s => s.split('_').slice(1).join('_'));
const cikOf = Object.fromEntries(Object.values(get('https://www.sec.gov/files/company_tickers.json')).map(r => [r.ticker, String(r.cik_str).padStart(10, '0')]));
// ICE BofA US Corporate Index effective yield (A8), daily, percent
const yields = get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLC0A0CMEY', false).trim().split('\n').slice(1)
  .map(l => l.split(',')).filter(([, v]) => v && v !== '.').map(([d, v]) => [d, +v]);
const avgYield = (a, b) => { const v = yields.filter(([d]) => d >= a && d <= b).map(([, y]) => y); return v.length ? v.reduce((s, y) => s + y, 0) / v.length : null; };

const out = { built: new Date().toISOString(), source: 'SEC EDGAR companyfacts + submissions; FRED BAMLC0A0CMEY', stocks: {} };
for (const t of tickers) {
  const cik = cikOf[t] ?? cikOf[t.replace('.', '-')];
  if (!cik) { out.stocks[t] = { error: 'no CIK' }; continue; }
  const cf = get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
  const sub = get(`https://data.sec.gov/submissions/CIK${cik}.json`);
  if (!cf) { out.stocks[t] = { cik, error: 'no XBRL facts', sic: sub?.sic ?? null }; continue; }
  const probe = secInputs(cf, { yieldPct: 0 });
  const y = probe.period ? avgYield(probe.period.start, probe.period.end) : null;
  const r = probe.period ? secInputs(cf, { yieldPct: y }) : probe;
  // T4 freshness: is there a 10-Q/10-K newer than the period we used?
  const rec = sub?.filings?.recent ?? {};
  const latest = (rec.form ?? []).map((f, i) => ({ f, d: rec.filingDate[i], p: rec.reportDate[i] })).find(x => /^10-[QK]/.test(x.f));
  out.stocks[t] = { cik, sic: sub?.sic ?? null, sicDescription: sub?.sicDescription ?? null, yieldPct: y, ...r,
    newerFiling: latest && r.period && latest.p > r.period.end ? latest : null };
  process.stderr.write('.');
}
writeFileSync('data/shariah/sec-inputs.json', JSON.stringify(out));
console.log('\nwrote', Object.keys(out.stocks).length);
