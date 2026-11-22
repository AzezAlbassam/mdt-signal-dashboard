// The weekly Shariah refresh scripts (scripts/shariah): what they keep and what stops them (external audit 2026-11-22)
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newErrors } from '../scripts/shariah/sec-lib.js';

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
