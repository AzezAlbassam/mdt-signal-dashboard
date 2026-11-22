// Quarter-average closes from daily bars already in the repo (data/us/bars: TradingView 1D, split-adjusted, saved for the
// US study up to 2026-10-06) for the holdings near the debt line (data/shariah/band-needed.json), and with --all for
// every held company the bars cover (data/shariah/funds.json rows): the report-price band is no bound on the average
// (audit 2026-11-22: Snowflake, Moderna, Marathon fell outside it), so the exact average replaces it wherever it can.
// Same line format as the TradingView agents of SHARIAH-REFRESH.md step 4b; merge-quarter-prices.js checks every line.
//   node scripts/shariah/bars-quarter-prices.js [--all] > <scratchpad>/qp/part-bars.jsonl
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const need = JSON.parse(readFileSync('data/shariah/band-needed.json', 'utf8'));
if (process.argv.includes('--all')) {
  const seen = new Set(need.map((x) => x.t));
  for (const f of JSON.parse(readFileSync('data/shariah/funds.json', 'utf8')).funds)
    for (const x of f.rows ?? []) if (x.k === 'equity' && x.t && x.start && x.end && !seen.has(x.t)) { seen.add(x.t); need.push({ t: x.t, start: x.start, end: x.end }); }
}
// NYSE_BRK.B.json.gz -> BRK-B (SEC writes the class with a dash)
const files = new Map(readdirSync('data/us/bars').map((f) => [f.replace(/\.json\.gz$/, '').replace(/^[A-Z]+_/, '').replace(/\./g, '-'), f]));
for (const { t, start, end } of need) {
  const f = files.get(t);
  if (!f) continue;
  const b = JSON.parse(gunzipSync(readFileSync(`data/us/bars/${f}`)));
  if (!(b.date.at(-1) >= end)) continue;                       // the quarter is not fully in the saved bars
  const days = b.date.map((d, i) => [d, b.close[i]]).filter(([d, c]) => d >= start && d <= end && c > 0);
  if (!days.length) continue;
  const c = days.map(([, x]) => x);
  console.log(JSON.stringify({ t, start, end, n: c.length, avg: c.reduce((a, x) => a + x, 0) / c.length, first: days[0][0], last: days.at(-1)[0],
    min: Math.min(...c), max: Math.max(...c), source: `TradingView 1D saved in data/us/bars (last bar ${b.date.at(-1)})`, symbol: b.symbol }));
}
