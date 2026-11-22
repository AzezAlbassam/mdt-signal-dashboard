// The weekly Shariah refresh scripts (scripts/shariah): what they keep and what stops them (external audit 2026-11-22)
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newErrors, uaFor } from '../scripts/shariah/sec-lib.js';

test('fix review: a throttled fetch (403/429) is waited out and retried; only a 404 means no data (a refused fetch read as "no SIC" stopped the reload)', async () => {
  const { createServer } = await import('node:http');
  let hits = 0;
  const srv = createServer((req, res) => { hits++; if (req.url === '/gone') { res.statusCode = 404; return res.end('no'); }
    if (hits <= 2) { res.statusCode = 429; return res.end('slow down'); } res.end(JSON.stringify({ ok: 1 })); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { execFileSync } = await import('node:child_process');
  // the getter runs synchronously (curl), so it runs in a child process while this one serves
  const run = (path) => new Promise((ok) => {
    const code = `import { getter } from ${JSON.stringify(new URL('../scripts/shariah/sec-lib.js', import.meta.url).href)}; console.log(JSON.stringify(getter()(${JSON.stringify(base + path)})))`;
    import('node:child_process').then(({ execFile }) => execFile('node', ['--input-type=module', '-e', code], { env: { ...process.env, SEC_USER_AGENT: 'test', SEC_BACKOFF_MS: '20', NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' } }, (e, out) => ok(out.trim())));
  });
  try {
    assert.equal(await run('/data'), JSON.stringify({ ok: 1 }));   // two 429s, then the data
    assert.equal(await run('/gone'), 'null');
  } finally { srv.close(); void execFileSync; }
});
test('fix review: the SEC contact header goes to SEC hosts only, never to FRED or any other site', () => {
  assert.equal(uaFor('https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json', 'Name contact'), 'Name contact');
  assert.equal(uaFor('https://www.sec.gov/files/company_tickers.json', 'Name contact'), 'Name contact');
  assert.equal(uaFor('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTB3', 'Name contact'), null);   // curl's own name
  assert.equal(uaFor('https://www.sec.gov.example.com/x', 'Name contact'), null);
});

const MERGE = new URL('../scripts/shariah/merge-quarter-prices.js', import.meta.url).pathname;
test('audit: merging new quarter averages keeps the ones already saved (a week without their part file lost 18 exact averages)', () => {
  const d = mkdtempSync(join(tmpdir(), 'qp-'));
  mkdirSync(join(d, 'data/shariah'), { recursive: true });
  writeFileSync(join(d, 'data/shariah/nport-latest.jsonl'), JSON.stringify({ fund: 'X', holdings: [] }) + '\n');
  writeFileSync(join(d, 'data/shariah/funds.json'), JSON.stringify({ funds: [] }));
  const old = { start: '2026-04-01', end: '2026-06-30', avg: 10, n: 62, first: '2026-04-01', last: '2026-06-30', source: 'bars' };
  writeFileSync(join(d, 'data/shariah/quarter-prices.json'), JSON.stringify({ built: '2026-10-03T22:30:00.000Z', prices: { AAA: old, BBB: old }, rejected: [] }));
  const q = (t, o) => JSON.stringify({ t, start: '2026-07-01', end: '2026-09-30', avg: 12, n: 63, first: '2026-07-01', last: '2026-09-30', min: 11, max: 13, source: 'TradingView', asOf: '2026-11-28', ...o });
  writeFileSync(join(d, 'part.jsonl'), [q('BBB'), q('CCC'), q('AAA', { n: 10 })].join('\n'));
  execFileSync('node', [MERGE, 'part.jsonl'], { cwd: d });
  const out = JSON.parse(readFileSync(join(d, 'data/shariah/quarter-prices.json'), 'utf8'));
  assert.equal(out.prices.AAA.end, '2026-06-30');            // this week's AAA was refused: the saved one stays (fund-load checks its period)
  assert.equal(out.prices.BBB.end, '2026-09-30');            // replaced by the newer quarter
  assert.equal(out.prices.CCC.avg, 12);                      // added
  assert.deepEqual(out.rejected.map((r) => r.t), ['AAA']);   // and this week's refusal is still reported
  // each average keeps the date its prices were adjusted to (a split after it divides it in fund-load): a kept one its
  // own, else its old file's date, not the date of a later merge
  assert.equal(out.prices.AAA.asOf, '2026-10-03');
  assert.equal(out.prices.BBB.asOf, '2026-11-28');
});
test('audit: companies SEC newly gives no numbers for are counted (a refused fetch looked like "no XBRL facts" and passed every gate)', () => {
  const prev = { A: { period: {} }, B: { error: 'no CIK' }, C: { period: {} }, E: { period: {}, sic: '6022' } };
  assert.deepEqual(newErrors(prev, { A: { error: 'no XBRL facts' }, B: { error: 'no CIK' }, C: { period: {} }, D: { error: 'no CIK' }, E: { period: {}, sic: null } }),
    ['A (no XBRL facts)', 'E (no SIC)']);   // a refused submissions fetch loses the industry code: a bank would no longer fail R1
});
test('fix review: an average from the saved bars is not checked against a report price on another share basis (APH, CRWD, MNST, MRNA were thrown out)', () => {
  const d = mkdtempSync(join(tmpdir(), 'qp-'));
  mkdirSync(join(d, 'data/shariah'), { recursive: true });
  // one fund holds AAA at a pre-split report price of 200; its quarter average in today's split-adjusted bars is 90
  writeFileSync(join(d, 'data/shariah/nport-latest.jsonl'), JSON.stringify({ fund: 'X', holdings: [{ name: 'AAA Corp', units: 'NS', balance: 10, usd: 2000 },
    { name: 'BBB Corp', units: 'NS', balance: 10, usd: 2000 }] }) + '\n');
  writeFileSync(join(d, 'data/shariah/funds.json'), JSON.stringify({ funds: [{ sym: 'X', rows: [{ n: 'AAA Corp', t: 'AAA' }, { n: 'BBB Corp', t: 'BBB' }] }] }));
  const q = (t, source) => JSON.stringify({ t, start: '2026-07-01', end: '2026-09-30', avg: 90, n: 63, first: '2026-07-01', last: '2026-09-30', min: 80, max: 100, source });
  writeFileSync(join(d, 'part.jsonl'), [q('AAA', 'TradingView 1D saved in data/us/bars (last bar 2026-10-06)'), q('BBB', 'TradingView')].join('\n'));
  execFileSync('node', [MERGE, 'part.jsonl'], { cwd: d });
  const out = JSON.parse(readFileSync(join(d, 'data/shariah/quarter-prices.json'), 'utf8'));
  assert.equal(out.prices.AAA.avg, 90);                          // fund-load puts it on the share basis (quarterOn)
  assert.equal(out.prices.BBB, undefined);                       // a fetched average still gets the 40% check
  assert.deepEqual(out.rejected.map((r) => r.t), ['BBB']);
});
test('fix review: the page keeps every input field the engine reads (dropping debtHigh or illicitHigh from the page data changed verdicts unnoticed)', async () => {
  const src = readFileSync(new URL('../scripts/build-stocks-page.js', import.meta.url), 'utf8');
  const keep = JSON.parse(src.match(/const KEEP = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const { screenStock, purificationIllicit } = await import('../engine/shariah.js');
  const sic = JSON.parse(readFileSync(new URL('../data/shariah/sic-activity.json', import.meta.url), 'utf8'));
  const stocks = JSON.parse(readFileSync(new URL('../data/shariah/sec-inputs.json', import.meta.url), 'utf8')).stocks;
  let n = 0;
  for (const r of Object.values(stocks)) {
    if (!r.period) continue;
    const kept = Object.fromEntries(keep.filter((k) => r[k] != null).map((k) => [k, r[k]]));
    for (const mv of [1e9, 1e10, 1e11]) assert.deepEqual(screenStock(kept, mv, sic), screenStock(r, mv, sic), r.name);
    assert.equal(purificationIllicit(kept), purificationIllicit(r)); n++;
  }
  assert.ok(n > 300);
});
test('verification: an average that covers only part of the quarter is rejected (EFX: 47 of 64 days, to 09-04)', () => {
  const d = mkdtempSync(join(tmpdir(), 'qp-'));
  mkdirSync(join(d, 'data/shariah'), { recursive: true });
  writeFileSync(join(d, 'data/shariah/nport-latest.jsonl'), JSON.stringify({ fund: 'X', holdings: [] }) + '\n');
  writeFileSync(join(d, 'data/shariah/funds.json'), JSON.stringify({ funds: [] }));
  const q = (t, o) => JSON.stringify({ t, start: '2026-07-01', end: '2026-09-30', avg: 164, n: 63, first: '2026-07-01', last: '2026-09-30', min: 150, max: 180, source: 'TradingView', ...o });
  writeFileSync(join(d, 'part.jsonl'), [q('EFX', { n: 47, last: '2026-09-04' }), q('OK1'), q('LATE', { first: '2026-07-20' })].join('\n'));
  execFileSync('node', [MERGE, 'part.jsonl'], { cwd: d });
  const out = JSON.parse(readFileSync(join(d, 'data/shariah/quarter-prices.json'), 'utf8'));
  assert.deepEqual(Object.keys(out.prices), ['OK1']);
  assert.deepEqual(out.rejected.map((r) => r.t).sort(), ['EFX', 'LATE']);
});
