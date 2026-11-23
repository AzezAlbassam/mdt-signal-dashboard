// The weekly Shariah refresh scripts (scripts/shariah): what they keep and what stops them (external audit 2026-11-22)
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync as fsCp, chmodSync as fsChmod, readdirSync as fsReaddir } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newErrors, uaFor, lostFunds, canFlip } from '../scripts/shariah/sec-lib.js';

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
test('fix review round 2: a fund that had its holdings last week and has none now stops the run (a refused N-PORT fetch published XLK as "no report")', () => {
  const prev = [{ sym: 'XLK', rows: [{}] }, { sym: 'SPUS', rows: [{}] }, { sym: 'GLD', kind: 'none' }, { sym: 'URNM', err: 'not in SEC fund list' }];
  const next = [{ sym: 'XLK', err: 'fetch failed: HTTP Error 403' }, { sym: 'SPUS', rows: [{}] }, { sym: 'GLD', kind: 'none' }, { sym: 'URNM', err: 'not in SEC fund list' }];
  assert.deepEqual(lostFunds(prev, next), ['XLK (fetch failed: HTTP Error 403)']);
});
test('final check: a stale entry keeps the newer 10-Q its submissions list (NextEra: SEC\'s figures stop at 2026-03-31, 10-Qs were filed after)', async () => {
  const { inputsFor } = await import('../scripts/shariah/sec-lib.js');
  const cf = { entityName: 'X', facts: { 'us-gaap': { Revenues: { units: { USD: [{ start: '2026-01-01', end: '2026-03-31', val: 10, form: '10-Q', filed: '2026-04-23' }] } } } } };
  const sub = { sic: '4911', filings: { recent: { form: ['10-Q', '8-K'], filingDate: ['2026-10-21', '2026-10-01'], reportDate: ['2026-09-30', '2026-10-01'] } } };
  const old = process.env.SEC_CACHE; delete process.env.SEC_CACHE;
  try {
    const r = inputsFor('0000753308', (u) => (u.includes('companyfacts') ? cf : sub), () => 5);
    assert.equal(r.stale, '2026-03-31'); assert.deepEqual(r.newerFiling, { f: '10-Q', d: '2026-10-21', p: '2026-09-30', inData: false });
    // a stale entry whose newer 10-Q SEC does carry (only its revenue is under tags we do not read: APA, TMC)
    const cf2 = { ...cf, facts: { 'us-gaap': { ...cf.facts['us-gaap'], Assets: { units: { USD: [{ end: '2026-09-30', val: 1, form: '10-Q', filed: '2026-10-21' }] } } } } };
    assert.equal(inputsFor('0000753308', (u) => (u.includes('companyfacts') ? cf2 : sub), () => 5).newerFiling.inData, true);
  } finally { if (old != null) process.env.SEC_CACHE = old; }
});

test('final check: SEC still refusing after about 15 minutes stops the run instead of reading as no data; a server error still reads as none (SEC\'s block lasts ten minutes)', async () => {
  const { createServer } = await import('node:http');
  const srv = createServer((req, res) => { res.statusCode = req.url === '/down' ? 503 : 429; res.end('no'); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { execFile } = await import('node:child_process');
  const run = (path) => new Promise((ok) => {
    const code = `import { getter } from ${JSON.stringify(new URL('../scripts/shariah/sec-lib.js', import.meta.url).href)}; console.log(JSON.stringify(getter()(${JSON.stringify(base + path)})))`;
    execFile('node', ['--input-type=module', '-e', code], { env: { ...process.env, SEC_USER_AGENT: 'test', SEC_BACKOFF_MS: '5', NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' } }, (e, out, err) => ok({ e, out: out.trim(), err }));
  });
  try {
    const refused = await run('/x');
    assert.ok(refused.e, 'exits non-zero'); assert.match(refused.err, /SEC refused/);
    const down = await run('/down');
    assert.equal(down.e, null); assert.equal(down.out, 'null');
  } finally { srv.close(); }
});
test('final check: the N-PORT download waits out SEC\'s refusals like the companyfacts one and stops when they last (a refused fund had read as "no report")', async () => {
  const { createServer } = await import('node:http');
  let hits = 0;
  const srv = createServer((req, res) => { hits++; if (req.url === '/ok' && hits > 2) return res.end('<x/>'); res.statusCode = 429; res.end('no'); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { execFile } = await import('node:child_process');
  const dir = new URL('../scripts/shariah/', import.meta.url).pathname;
  const run = (path) => new Promise((ok) => execFile('python3', ['-I', '-B', '-c', `import sys; sys.path.insert(0, ${JSON.stringify(dir)}); import nport; print(nport.get(${JSON.stringify(base + path)}).decode())`],
    { env: { ...process.env, SEC_USER_AGENT: 'test', SEC_BACKOFF_MS: '5', NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' } }, (e, out, err) => ok({ e, out: out.trim(), err })));
  try {
    const ok2 = await run('/ok');
    assert.equal(ok2.e, null, ok2.err); assert.equal(ok2.out, '<x/>');      // two 429s, then the report
    const refused = await run('/x');
    assert.ok(refused.e); assert.match(refused.err, /Refused/);
  } finally { srv.close(); }
});
test('final check: the weekly report keeps a bank without numbers a sure fail and names companies that lost their industry code', () => {
  const d = mkdtempSync(join(tmpdir(), 'di-'));
  const a = { stocks: { BAC: { cik: '1', sic: '6021', period: { end: '2026-09-30' }, illicit: 1, revenue: 10 }, GM: { cik: '2', sic: '3711', period: { end: '2026-09-30' }, illicit: 0, revenue: 10 } } };
  const b = { stocks: { BAC: { cik: '1', sic: '6021', error: 'no XBRL facts' }, GM: { cik: '2', sic: null, period: { end: '2026-09-30' }, illicit: 0, revenue: 10 } } };
  writeFileSync(join(d, 'a.json'), JSON.stringify(a)); writeFileSync(join(d, 'b.json'), JSON.stringify(b));
  const out = JSON.parse(execFileSync('node', [new URL('../scripts/shariah/diff-inputs.mjs', import.meta.url).pathname, join(d, 'a.json'), join(d, 'b.json')]).toString());
  assert.deepEqual(out.noLongerFails, []);      // BAC still fails R1 on its industry alone
  assert.deepEqual(out.lostSic, ['GM']);
});
test('final check: in a passing fund an unknown row gets priority only when its fail would cross 5% (DHI in SPUS: its 0.103% was counted twice)', () => {
  const spus = { state: 'مختلط جائز', badWeight: 0.00795, unknownWeight: 0.04118 };
  assert.equal(canFlip(spus, { s: 'ما ينحكم', w: 0.00103 }), false);     // DHI
  assert.equal(canFlip(spus, { s: 'مختلط جائز', w: 0.00103 }), true);    // a pass that would turn unknown crosses 5%
  assert.equal(canFlip(spus, { s: 'ما ينحكم', w: 0.045 }), true);        // a fail this large crosses on its own
  assert.equal(canFlip({ ...spus, old: true }, { s: 'مختلط جائز', w: 0.01 }), false);
  // an unjudged fund under 5% non-compliant: an unknown that would pass it, or a fail that would cross
  const unj = { state: 'ما ينحكم', badWeight: 0.01, unknownWeight: 0.05 };
  assert.equal(canFlip(unj, { s: 'ما ينحكم', w: 0.02 }), true); assert.equal(canFlip(unj, { s: 'مختلط جائز', w: 0.02 }), false);
});
test('final check: a non-reliance notice (8-K item 4.02) after the report in use is kept until SEC carries the quarter again, refiled or newer (Datavault AI)', async () => {
  const { inputsFor } = await import('../scripts/shariah/sec-lib.js');
  // (review of the final check: any later 10-Q or 10-K had cleared it, a 10-K/A of the withdrawn year too, while the
  // figures judged were still the withdrawn ones)
  const cf = (filed) => ({ entityName: 'X', facts: { 'us-gaap': { Revenues: { units: { USD: [{ start: '2026-04-01', end: '2026-06-30', val: 6.7, form: '10-Q', filed }] } } } } });
  const sub = (forms, dates, items) => ({ sic: '7372', filings: { recent: { form: forms, filingDate: dates, reportDate: dates, items } } });
  const old = process.env.SEC_CACHE; delete process.env.SEC_CACHE;
  try {
    const run = (filed, s) => inputsFor('0001682149', (u) => (u.includes('companyfacts') ? cf(filed) : s), () => 5);
    assert.equal(run('2026-08-19', sub(['NT 10-Q', '8-K', '10-Q'], ['2026-11-17', '2026-10-26', '2026-08-19'], ['', '4.02,9.01', ''])).nonReliance, '2026-10-26');
    // a 10-K/A of the withdrawn year does not replace the quarter in use
    assert.equal(run('2026-08-19', sub(['10-K/A', '8-K', '10-Q'], ['2026-12-01', '2026-10-26', '2026-08-19'], ['', '4.02', ''])).nonReliance, '2026-10-26');
    // the quarter refiled (a 10-Q/A that companyfacts carries) clears it
    assert.equal(run('2026-12-01', sub(['10-Q/A', '8-K', '10-Q'], ['2026-12-01', '2026-10-26', '2026-08-19'], ['', '4.02', ''])).nonReliance, undefined);
    assert.equal(run('2026-08-19', sub(['8-K', '10-Q'], ['2026-10-26', '2026-08-19'], ['2.02,9.01', ''])).nonReliance, undefined);   // another item
  } finally { if (old != null) process.env.SEC_CACHE = old; }
});
test('final check: the fund loader runs end to end on saved data, offline (a missing import had crashed it after an hour of fetching)', () => {
  const { cpSync, chmodSync, readdirSync } = require_fs();
  const root = new URL('..', import.meta.url).pathname, d = mkdtempSync(join(tmpdir(), 'fl-'));
  for (const p of ['engine', 'scripts/shariah', 'data/shariah']) cpSync(join(root, p), join(d, p), { recursive: true });
  // --reuse takes fund-companies.json only up to 36 hours old: the copy is dated now
  const fc = JSON.parse(readFileSync(join(d, 'data/shariah/fund-companies.json'), 'utf8')); fc.built = new Date().toISOString();
  writeFileSync(join(d, 'data/shariah/fund-companies.json'), JSON.stringify(fc));
  // a stand-in for curl: SEC's company list (the dashboard's companies, padded to SEC's size) and FRED's bill yield
  const stocks = JSON.parse(readFileSync(join(d, 'data/shariah/sec-inputs.json'), 'utf8')).stocks;
  const list = Object.entries(stocks).filter(([, r]) => r.cik).map(([t, r], i) => [i, { cik_str: +r.cik, ticker: t, title: r.name ?? t }]);
  for (let i = list.length; i < 6000; i++) list.push([i, { cik_str: 9000000 + i, ticker: `ZZ${i}`, title: `Pad ${i}` }]);
  const bin = join(d, 'bin'); mkdirSync(bin);
  writeFileSync(join(d, 'tickers.json'), JSON.stringify(Object.fromEntries(list)));
  const days = []; for (let t = Date.parse('2025-06-01'); t <= Date.now(); t += 864e5) days.push(`${new Date(t).toISOString().slice(0, 10)},4.0`);
  writeFileSync(join(d, 'dtb3.csv'), ['observation_date,DTB3', ...days].join('\n'));
  writeFileSync(join(bin, 'curl'), `#!/bin/sh\nfor a; do u="$a"; done\ncase "$u" in *company_tickers.json) cat "${d}/tickers.json";; *fred*) cat "${d}/dtb3.csv";; *) printf 'no'; printf '\\n404'; exit 0;; esac\nprintf '\\n200'\n`);
  chmodSync(join(bin, 'curl'), 0o755);
  let out = '', err = '', code = 0;
  try { out = execFileSync('node', ['scripts/shariah/fund-load.js', '--reuse'], { cwd: d, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SEC_USER_AGENT: 'test', SEC_BACKOFF_MS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] }).toString(); }
  catch (e) { code = e.status; out = String(e.stdout); err = String(e.stderr); }
  assert.doesNotMatch(err, /ReferenceError|TypeError|SyntaxError/, err.slice(-600));
  assert.match(out, /^funds \d+ \(with holdings \d+\)/m, out.slice(-600) + err.slice(-600));
  assert.ok(readdirSync(join(d, 'data/shariah')).includes('band-needed.json'));
  void code;
});
function require_fs() { return { cpSync: fsCp, chmodSync: fsChmod, readdirSync: fsReaddir }; }

test('review of the final check: a refusal anywhere in the six tries stops the run, whatever the last try gets (five 429s, then a server error)', async () => {
  const { createServer } = await import('node:http');
  let hits = 0;
  const srv = createServer((req, res) => { hits++; res.statusCode = hits <= 5 ? 429 : 503; res.end('no'); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { execFile } = await import('node:child_process');
  const code = `import { getter } from ${JSON.stringify(new URL('../scripts/shariah/sec-lib.js', import.meta.url).href)}; console.log(JSON.stringify(getter()(${JSON.stringify(base + '/x')})))`;
  try {
    const r = await new Promise((ok) => execFile('node', ['--input-type=module', '-e', code], { env: { ...process.env, SEC_USER_AGENT: 'test', SEC_BACKOFF_MS: '5', NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' } }, (e, out, err) => ok({ e, err })));
    assert.ok(r.e, 'exits non-zero'); assert.match(r.err, /SEC refused/);
  } finally { srv.close(); }
});
test('review of the final check: the weekly report judges withdrawn statements on the activity alone, and lists zero-coupon entries a newer quarter has left behind', () => {
  const d = mkdtempSync(join(tmpdir(), 'di-'));
  const q = { end: '2026-06-30' }, q3 = { end: '2026-09-30' };
  const a = { stocks: { DVLT: { cik: '1', sic: '7372', period: q, illicit: 0.1, revenue: 10 }, AKAM: { cik: '0001086222', sic: '7389', period: q, illicit: 0, revenue: 10 } } };
  const b = { stocks: { DVLT: { cik: '1', sic: '7372', period: q, illicit: 1.5, illicitEstimated: false, revenue: 10, nonReliance: '2026-10-26' },
    AKAM: { cik: '0001086222', sic: '7389', period: { end: '2026-12-31' }, illicit: 0, revenue: 10 } } };
  writeFileSync(join(d, 'a.json'), JSON.stringify(a)); writeFileSync(join(d, 'b.json'), JSON.stringify(b));
  const out = JSON.parse(execFileSync('node', [new URL('../scripts/shariah/diff-inputs.mjs', import.meta.url).pathname, join(d, 'a.json'), join(d, 'b.json')]).toString());
  assert.deepEqual(out.nowFails, []);                 // 15% of exact interest, but on statements the company withdrew
  assert.deepEqual(out.zeroCouponStale, ['AKAM (2026-09-30 → 2026-12-31)']);
  void q3;
});
test('review of the final check: the fund loader writes nothing when a fund lost its holdings, so a rerun still sees the loss', () => {
  const root = new URL('..', import.meta.url).pathname, d = mkdtempSync(join(tmpdir(), 'fl2-'));
  for (const p of ['engine', 'scripts/shariah', 'data/shariah']) fsCp(join(root, p), join(d, p), { recursive: true });
  const fc = JSON.parse(readFileSync(join(d, 'data/shariah/fund-companies.json'), 'utf8')); fc.built = new Date().toISOString();
  writeFileSync(join(d, 'data/shariah/fund-companies.json'), JSON.stringify(fc));
  // XLK's report line refused this week
  const lines = readFileSync(join(d, 'data/shariah/nport-latest.jsonl'), 'utf8').trim().split('\n').map((l) => (JSON.parse(l).fund === 'XLK' ? JSON.stringify({ fund: 'XLK', err: 'fetch failed: HTTP Error 503' }) : l));
  writeFileSync(join(d, 'data/shariah/nport-latest.jsonl'), lines.join('\n') + '\n');
  const stocks = JSON.parse(readFileSync(join(d, 'data/shariah/sec-inputs.json'), 'utf8')).stocks;
  const list = Object.entries(stocks).filter(([, r]) => r.cik).map(([t, r], i) => [i, { cik_str: +r.cik, ticker: t, title: r.name ?? t }]);
  for (let i = list.length; i < 6000; i++) list.push([i, { cik_str: 9000000 + i, ticker: `ZZ${i}`, title: `Pad ${i}` }]);
  const bin = join(d, 'bin'); mkdirSync(bin);
  writeFileSync(join(d, 'tickers.json'), JSON.stringify(Object.fromEntries(list)));
  const days = []; for (let t = Date.parse('2025-06-01'); t <= Date.now(); t += 864e5) days.push(`${new Date(t).toISOString().slice(0, 10)},4.0`);
  writeFileSync(join(d, 'dtb3.csv'), ['observation_date,DTB3', ...days].join('\n'));
  writeFileSync(join(bin, 'curl'), `#!/bin/sh\nfor a; do u="$a"; done\ncase "$u" in *company_tickers.json) cat "${d}/tickers.json";; *fred*) cat "${d}/dtb3.csv";; *) printf 'no'; printf '\\n404'; exit 0;; esac\nprintf '\\n200'\n`);
  fsChmod(join(bin, 'curl'), 0o755);
  const before = readFileSync(join(d, 'data/shariah/funds.json'), 'utf8');
  let failed = false, err = '';
  try { execFileSync('node', ['scripts/shariah/fund-load.js', '--reuse'], { cwd: d, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SEC_USER_AGENT: 'test', SEC_BACKOFF_MS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { failed = true; err = String(e.stderr) + String(e.stdout); }
  assert.ok(failed, 'the run stops'); assert.match(err, /XLK/);
  assert.equal(readFileSync(join(d, 'data/shariah/funds.json'), 'utf8'), before);   // last week's file stays, so a rerun stops too
});
test('review of the final check: a company on the zero-coupon list gets its 0.00% notes out of the fail-proving reading (Akamai)', async () => {
  const { inputsFor } = await import('../scripts/shariah/sec-lib.js');
  const cf = { entityName: 'AKAMAI', facts: { 'us-gaap': { Revenues: { units: { USD: [{ start: '2026-07-01', end: '2026-09-30', val: 1000e6, form: '10-Q', filed: '2026-11-06' }] } },
    ConvertibleLongTermNotesPayable: { units: { USD: [{ end: '2026-09-30', val: 7567.687e6, form: '10-Q', filed: '2026-11-06' }] } },
    Liabilities: { units: { USD: [{ end: '2026-09-30', val: 10398.3e6, form: '10-Q', filed: '2026-11-06' }] } } } } };
  const old = process.env.SEC_CACHE; delete process.env.SEC_CACHE;
  try {
    const r = inputsFor('0001086222', (u) => (u.includes('companyfacts') ? cf : { sic: '7389', filings: { recent: {} } }), () => 5);
    assert.ok(Math.abs(r.debt - (7567.687e6 - 3455.562e6)) < 1, String(r.debt));
  } finally { if (old != null) process.env.SEC_CACHE = old; }
});
test('2026-11-23: a quarter average from saved daily bars needs the whole quarter (the page shows it when TradingView does not answer)', async () => {
  const { barsQuarterAvg } = await import('../scripts/shariah/sec-lib.js');
  const days = (a, b) => { const out = []; for (let t = Date.parse(a); t <= Date.parse(b); t += 864e5) if (![0, 6].includes(new Date(t).getUTCDay())) out.push(new Date(t).toISOString().slice(0, 10)); return out; };
  const bars = (a, b) => { const date = days(a, b); return { date, close: date.map((_, i) => 100 + (i % 2)) }; };
  const full = barsQuarterAvg(bars('2026-06-01', '2026-10-06'), '2026-07-01', '2026-09-30');
  assert.equal(full.n, 66); assert.ok(Math.abs(full.a - 100.5) < 1e-9); assert.equal(full.last, '2026-10-06');
  assert.equal(barsQuarterAvg(bars('2026-06-01', '2026-09-04'), '2026-07-01', '2026-09-30'), null);   // the bars end inside the quarter
  assert.equal(barsQuarterAvg(bars('2026-07-20', '2026-10-06'), '2026-07-01', '2026-09-30'), null);   // they start inside it
  assert.equal(barsQuarterAvg(bars('2026-06-01', '2026-10-06'), '2026-09-01', '2026-09-30'), null);   // under 40 trading days
});
