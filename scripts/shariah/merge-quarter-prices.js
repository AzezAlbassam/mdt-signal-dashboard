// Merge quarter-average closes (FMP, fetched by agents into part-*.jsonl) into data/shariah/quarter-prices.json.
//   node scripts/shariah/merge-quarter-prices.js <part.jsonl ...>
// Checks each entry: at least 40 trading days, dates inside the quarter, min <= avg <= max, and the average within 40%
// of the price in the fund's own N-PORT report (a larger gap usually means a share split after the quarter, which
// would distort market value). Entries that fail stay out: those holdings keep the price band.
import { readFileSync, writeFileSync } from 'node:fs';

const reports = readFileSync('data/shariah/nport-latest.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => !r.err);
const funds = JSON.parse(readFileSync('data/shariah/funds.json', 'utf8')).funds;
// N-PORT price per ticker (value / shares), from the fund rows matched to that ticker
const nportPrice = new Map();
for (const f of funds) {
  const rep = reports.find((r) => r.fund === f.sym);
  for (const x of f.rows ?? []) {
    if (!x.t || nportPrice.has(x.t)) continue;
    const h = rep?.holdings.find((h) => h.name.slice(0, 48) === x.n && h.units === 'NS' && h.balance > 0 && h.usd > 0);
    if (h) nportPrice.set(x.t, h.usd / h.balance);
  }
}
const prices = {}, rejected = [];
for (const file of process.argv.slice(2)) {
  for (const line of readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)) {
    const q = JSON.parse(line);
    const why = q.error ? `FMP: ${q.error}` : !(q.n >= 40) ? `only ${q.n} days`
      : !(q.first >= q.start && q.last <= q.end) ? 'dates outside the quarter'
      : !(q.min <= q.avg && q.avg <= q.max && q.avg > 0) ? 'average outside min..max'
      : nportPrice.has(q.t) && Math.abs(q.avg / nportPrice.get(q.t) - 1) > 0.4 ? `average ${q.avg.toFixed(2)} vs fund-report price ${nportPrice.get(q.t).toFixed(2)}`
      : null;
    if (why) rejected.push({ t: q.t, why });
    else prices[q.t] = { start: q.start, end: q.end, avg: q.avg, n: q.n, first: q.first, last: q.last };
  }
}
writeFileSync('data/shariah/quarter-prices.json', JSON.stringify({ built: new Date().toISOString(), source: 'FMP historical-price-eod-light: daily close, split-adjusted; average over the company\'s own latest quarter', prices, rejected }, null, 1));
console.log(`quarter prices: ${Object.keys(prices).length} accepted, ${rejected.length} rejected`);
for (const r of rejected) console.log('  rejected', r.t, '-', r.why);
