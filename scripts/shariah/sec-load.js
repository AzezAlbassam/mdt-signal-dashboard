// Build data/shariah/sec-inputs.json: SEC inputs for every US stock on the dashboard.
// Usage: SEC_USER_AGENT="Name email" node scripts/shariah/sec-load.js [TICKER ...]
import { readdirSync, writeFileSync } from 'node:fs';
import { getter, companies, yieldAverager, inputsFor } from './sec-lib.js';

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
writeFileSync('data/shariah/sec-inputs.json', JSON.stringify(out));
console.log('\nwrote', Object.keys(out.stocks).length);
