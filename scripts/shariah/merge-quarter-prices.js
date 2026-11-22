// Merge quarter-average closes (FMP or TradingView, fetched by agents into part-*.jsonl) into data/shariah/quarter-prices.json.
//   node scripts/shariah/merge-quarter-prices.js <part.jsonl ...>
// Checks each entry: at least 40 trading days, dates inside the quarter, min <= avg <= max, and the average within 40%
// of the price in the fund's own N-PORT report (a larger gap usually means a share split after the quarter, which
// would distort market value). Entries that fail stay out: those holdings keep a saved average of the same quarter if
// there is one, else the price band.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

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
// start from the averages already saved: a week without their part file must not drop them (audit 2026-11-22); fund-load
// uses an entry only while its dates are the company's current quarter, and a newer one for the ticker replaces it
// Each entry keeps asOf, the date its prices were split-adjusted to (fund-load divides it by a split that came later):
// its own, else its old file's date; a new one its line's asOf, else today (the merge runs on the day of the fetch).
const old = existsSync('data/shariah/quarter-prices.json') ? JSON.parse(readFileSync('data/shariah/quarter-prices.json', 'utf8')) : {};
const prices = Object.fromEntries(Object.entries(old.prices ?? {}).map(([t, e]) => [t, { ...e, asOf: e.asOf ?? old.built?.slice(0, 10) }]));
const fresh = new Set(), rejected = [], today = new Date().toISOString().slice(0, 10);
const dayDiff = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
for (const file of process.argv.slice(2)) {
  for (const line of readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)) {
    const q = JSON.parse(line);
    const why = q.error ? `${q.source ?? 'FMP'}: ${q.error}` : !(q.n >= 40) ? `only ${q.n} days`
      : !(q.first >= q.start && q.last <= q.end) ? 'dates outside the quarter'
      // the whole quarter, give or take a long weekend (verification 2026-11-22: 47 of 64 days to 09-04 was accepted)
      : !(dayDiff(q.start, q.first) <= 5 && dayDiff(q.last, q.end) <= 5) ? `covers only ${q.first}..${q.last} of the quarter`
      : !(q.min <= q.avg && q.avg <= q.max && q.avg > 0) ? 'average outside min..max'
      // (not for the saved bars: fund-load puts them on the share basis from their last bar's date; the fund's raw report
      // price may be on another one: APH, CRWD, MNST and MRNA were thrown out, fix review 2026-11-22)
      : !/saved in data\/us\/bars/.test(q.source ?? '') && nportPrice.has(q.t) && Math.abs(q.avg / nportPrice.get(q.t) - 1) > 0.4 ? `average ${q.avg.toFixed(2)} vs fund-report price ${nportPrice.get(q.t).toFixed(2)}`
      : null;
    if (why) rejected.push({ t: q.t, why });
    else { prices[q.t] = { start: q.start, end: q.end, avg: q.avg, n: q.n, first: q.first, last: q.last, source: q.source ?? 'FMP', asOf: q.asOf ?? today }; fresh.add(q.t); }
  }
}
// a ticker that one source refused and another delivered is not a rejection
const rejectedFinal = rejected.filter((r) => !fresh.has(r.t));
writeFileSync('data/shariah/quarter-prices.json', JSON.stringify({ built: new Date().toISOString(), source: 'daily closes, split-adjusted, averaged over the company\'s own latest quarter: FMP historical-price-eod-light or TradingView 1D bars (per entry)', prices, rejected: rejectedFinal }, null, 1));
console.log(`quarter prices: ${fresh.size} accepted now, ${Object.keys(prices).length} kept in all, ${rejectedFinal.length} rejected`);
for (const r of rejectedFinal) console.log('  rejected', r.t, '-', r.why);
