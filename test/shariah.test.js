import test from 'node:test';
import assert from 'node:assert/strict';
import { verdict, purificationPerShare, estimateInterest, fundVerdict, debtRatio, illicitShare } from '../engine/shariah.js';

const base = { activity: 'ok', debt: 10, marketValue: 100, bookEquity: 50, illicit: 1, illicitEstimated: false, revenue: 100, shares: 10 };
const v = o => verdict({ ...base, ...o });

test('Al Rajhi example: 1,000 / 100,000 shares x 2,000 = 20', () => {
  assert.equal(purificationPerShare(1000, 100000) * 2000, 20);
});
test('purification still owed by a loss-making company; no shares -> null', () => {
  assert.equal(purificationPerShare(500, 100), 5);
  assert.equal(purificationPerShare(500, 0), null);
  assert.equal(purificationPerShare(null, 100), null);
});
test('R2 at 29.99 / 30 / 30.01 percent', () => {
  assert.equal(v({ debt: 29.99 }).state, 'مختلط جائز');
  assert.equal(v({ debt: 30 }).state, 'مختلط جائز');
  const f = v({ debt: 30.01 });
  assert.equal(f.state, 'غير جائز'); assert.deepEqual(f.failed, ['R2']);
});
test('R2 uses book equity when market value is below it', () => {
  assert.equal(debtRatio(40, 100, 50), 0.4);
  assert.equal(debtRatio(40, 100, 200), 0.2);
  assert.equal(v({ debt: 40, marketValue: 100, bookEquity: 200 }).state, 'مختلط جائز');
});
test('R3 at 4.99 / 5 / 5.01 percent', () => {
  assert.equal(v({ illicit: 4.99 }).state, 'مختلط جائز');
  assert.equal(v({ illicit: 5 }).state, 'مختلط جائز');
  assert.deepEqual(v({ illicit: 5.01 }).failed, ['R3']);
});
test('R3 with zero or negative revenue', () => {
  assert.deepEqual(v({ revenue: 0, illicit: 3 }).failed, ['R3']);
  assert.deepEqual(v({ revenue: -5, illicit: 3 }).failed, ['R3']);
  assert.equal(illicitShare(0, 0), 0);
  assert.equal(v({ revenue: 0, illicit: 0 }).state, 'مختلط جائز');
});
test('each missing input -> ما ينحكم, never a pass; zero is not missing', () => {
  for (const k of ['activity', 'debt', 'marketValue', 'illicit', 'revenue']) {
    for (const bad of [null, undefined, NaN]) {
      const r = v({ [k]: bad });
      assert.equal(r.state, 'ما ينحكم', `${k}=${bad}`); assert.ok(r.missing.includes(k));
    }
  }
  assert.equal(v({ activity: 'review' }).state, 'ما ينحكم');
  assert.equal(v({ activity: 'OK' }).state, 'ما ينحكم');
  assert.equal(v({ debt: '10' }).state, 'ما ينحكم'); // a string is not a number
});
test('book equity missing only matters when it could change R2', () => {
  assert.equal(v({ bookEquity: null }).state, 'ما ينحكم');
});
test('a certain failure beats a missing input', () => {
  const r = v({ debt: 90, illicit: null });
  assert.equal(r.state, 'غير جائز'); assert.deepEqual(r.failed, ['R2']);
  assert.equal(v({ activity: 'fail', debt: null }).state, 'غير جائز');
  assert.deepEqual(v({ activity: 'fail' }).failed, ['R1']);
});
test('pure only with zero debt, zero illicit, nothing estimated', () => {
  assert.equal(v({ debt: 0, illicit: 0 }).state, 'حلال (نقي)');
  assert.equal(v({ debt: 0, illicit: 0, illicitEstimated: true }).state, 'مختلط جائز');
  assert.equal(v({ debt: 1, illicit: 0 }).state, 'مختلط جائز');
});
test('numbers are returned with the verdict', () => {
  const r = v({});
  assert.equal(r.numbers.debtRatio, 0.1); assert.equal(r.numbers.illicitShare, 0.01); assert.equal(r.numbers.purificationPerShare, 0.1);
});
test('A8 estimate: average balance x yield x days/365', () => {
  assert.equal(estimateInterest({ cashStart: 100, cashEnd: 300, yieldPct: 5, days: 365 }), 10);
  assert.ok(Math.abs(estimateInterest({ cashStart: 1000, cashEnd: 1000, yieldPct: 4, days: 91 }) - 1000 * 0.04 * 91 / 365) < 1e-9);
  assert.equal(estimateInterest({ cashStart: null, cashEnd: 1, yieldPct: 4, days: 91 }), null);
});
test('fund rule (owner A5): non-compliant weight below 5% passes', () => {
  const ok = { state: 'مختلط جائز', illicit: 1, marketValue: 100 };
  const bad = { state: 'غير جائز', illicit: 50, marketValue: 100 };
  const r = fundVerdict([{ ...ok, weight: 0.97 }, { ...bad, weight: 0.03 }]);
  assert.equal(r.state, 'مختلط جائز'); assert.equal(r.badWeight, 0.03);
  assert.ok(Math.abs(r.purificationPct - (0.97 * 0.01 + 0.03 * 0.5)) < 1e-12);
  assert.equal(fundVerdict([{ ...ok, weight: 0.95 }, { ...bad, weight: 0.05 }]).state, 'غير جائز');
  const u = fundVerdict([{ ...ok, weight: 0.94 }, { state: 'ما ينحكم', illicit: null, marketValue: null, weight: 0.06 }]);
  assert.equal(u.state, 'ما ينحكم'); assert.equal(u.unknownWeight, 0.06);
  // 3% failing + 3% unknown could be 6% failing: not judged (cautious)
  assert.equal(fundVerdict([{ ...ok, weight: 0.94 }, { ...bad, weight: 0.03 }, { state: 'ما ينحكم', illicit: null, marketValue: null, weight: 0.03 }]).state, 'ما ينحكم');
  assert.equal(fundVerdict([{ ...ok, weight: 0.96 }, { state: 'ما ينحكم', illicit: null, marketValue: null, weight: 0.04 }]).state, 'مختلط جائز');
});
