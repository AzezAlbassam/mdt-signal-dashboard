// Build data/shariah/sec-inputs.json: SEC inputs for every US stock on the dashboard.
// Usage: SEC_USER_AGENT="Name email" node scripts/shariah/sec-load.js [TICKER ...]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { getter, companies, yieldAverager, inputsFor, newErrors, MAX_NEW_ERRORS } from './sec-lib.js';

const get = getter();
const tickers = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync('data/fq').map((f) => f.replace('.json', '')).filter((s) => !s.startsWith('TADAWUL_')).map((s) => s.split('_').slice(1).join('_'));
const cikOf = Object.fromEntries(companies(get).map((c) => [c.ticker, c.cik]));
const avgYield = yieldAverager(get);

const out = { built: new Date().toISOString(), source: 'SEC EDGAR companyfacts + submissions; FRED BAMLC0A0CMEY', stocks: {} };
for (const t of tickers) {
  const cik = cikOf[t] ?? cikOf[t.replace('.', '-')];
  out.stocks[t] = cik ? inputsFor(cik, get, avgYield) : { error: 'no CIK' };
  process.stderr.write('.');
}
// a fetch SEC refused looks like a company without numbers: more than a few new ones stop the run, the old file stays
const prev = existsSync('data/shariah/sec-inputs.json') ? JSON.parse(readFileSync('data/shariah/sec-inputs.json', 'utf8')).stocks : {};
const lost = newErrors(prev, out.stocks);
if (lost.length > MAX_NEW_ERRORS) { console.error(`\nSTOPPED: ${lost.length} stocks newly without SEC numbers (more than ${MAX_NEW_ERRORS}): ${lost.join(', ')}`); process.exit(1); }
writeFileSync('data/shariah/sec-inputs.json', JSON.stringify(out));
console.log('\nwrote', Object.keys(out.stocks).length, lost.length ? `(newly without SEC numbers: ${lost.join(', ')})` : '');
