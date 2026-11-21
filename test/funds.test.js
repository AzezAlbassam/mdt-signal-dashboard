import test from 'node:test';
import assert from 'node:assert/strict';
import { normName, nameKeys, buildMaps, mapHolding, holdingKind, screenHolding, fundSummary } from '../engine/funds.js';
import { screenStock } from '../engine/shariah.js';

const SIC = { fail: [[6020, 6036, 'banks']], review: [[5400, 5499, 'food stores']] };

test('names normalise across SEC titles and fund reports', () => {
  assert.equal(normName('CORNING INC /NY'), normName('Corning Inc'));
  assert.equal(normName("Lowe's Cos Inc"), normName('LOWES COMPANIES INC'));
  assert.equal(normName('TJX COMPANIES INC /DE/'), normName('TJX Cos Inc/The'));
  assert.equal(normName('NVIDIA Corp.'), normName('NVIDIA CORP'));
  assert.ok(nameKeys('Exxon Mobil Corp').includes('EXXONMOBIL'));            // spaces dropped as a second key
  assert.ok(nameKeys('ExxonMobil Holdings Corp').includes('EXXONMOBIL'));
});

const maps = buildMaps(
  [{ cik: '0001045810', ticker: 'NVDA', title: 'NVIDIA CORP' }, { cik: '0002115436', ticker: 'XOM', title: 'ExxonMobil Holdings Corp' },
   { cik: '0000001', ticker: 'ABC', title: 'ABC Holdings Inc' }, { cik: '0000002', ticker: 'ABCX', title: 'ABC Group Ltd' }],
  [{ isin: 'US67066G1040', ticker: 'NVDA' }]);
test('holdings map by ticker, then ISIN, then a unique name; ambiguity is unmapped', () => {
  assert.deepEqual(mapHolding({ ticker: 'NVDA', name: 'x' }, maps), { cik: '0001045810', by: 'ticker' });
  assert.deepEqual(mapHolding({ isin: 'US67066G1040', name: 'NVIDIA' }, maps), { cik: '0001045810', by: 'isin' });
  assert.deepEqual(mapHolding({ name: 'Exxon Mobil Corp' }, maps), { cik: '0002115436', by: 'name' });
  assert.deepEqual(mapHolding({ name: 'ABC' }, maps), { cik: null, by: null });  // two companies normalise to "ABC"
  assert.deepEqual(mapHolding({ name: 'Unknown Co' }, maps), { cik: null, by: null });
});

test('holding kinds: collateral, equity, cash fund, debt, derivative, other', () => {
  assert.equal(holdingKind({ asset: 'STIV', collateral: true }), 'collateral');
  assert.equal(holdingKind({ asset: 'EC' }), 'equity');
  assert.equal(holdingKind({ asset: 'STIV' }), 'cash-fund');
  assert.equal(holdingKind({ asset: 'DBT' }), 'debt');
  assert.equal(holdingKind({ asset: 'DE' }), 'derivative');
  assert.equal(holdingKind({ asset: 'EP' }), 'other');
  assert.equal(holdingKind({ asset: '' }), 'other');
});

const co = (o = {}) => ({ period: { end: '2026-09-30' }, sic: '3674', debt: 100, debtUpperBound: null, bookEquity: 500, illicit: 10,
  illicitEstimated: false, revenue: 1000, shares: 100, sharesMV: 100, ...o });
test('screenStock: the liabilities upper bound decides only a pass', () => {
  assert.equal(screenStock(co({ debt: null, debtUpperBound: 200 }), 1000, SIC).state, 'مختلط جائز'); // 20% even counting all
  assert.equal(screenStock(co({ debt: null, debtUpperBound: 400 }), 1000, SIC).state, 'ما ينحكم');   // 40%: unknown, not a fail
  assert.equal(screenStock(co({ sic: '6022' }), 1000, SIC).state, 'غير جائز');
  assert.equal(screenStock(co({ sic: '5411' }), 1000, SIC).state, 'ما ينحكم');
  assert.equal(screenStock({ period: null }, 1000, SIC), null);
});

test('screenHolding: a price band of -20%/+25% must agree, else not judged', () => {
  // debt 100; price 10 x 100 shares = 1000 -> 10%: passes at 800 and 1250
  assert.equal(screenHolding(co(), 10, SIC).state, 'مختلط جائز');
  // debt 330 -> 33% at 1000: fails at 800 (41%) and at 1250 (26.4% passes) -> band disagrees
  assert.equal(screenHolding(co({ debt: 330 }), 10, SIC).state, 'ما ينحكم');
  // debt 500 -> 50% at 1000, 40% at 1250: fails for sure
  assert.equal(screenHolding(co({ debt: 500, bookEquity: 0 }), 10, SIC).state, 'غير جائز');
  // purification share of the holding's value per quarter = illicit / market value at the report price
  assert.equal(screenHolding(co(), 10, SIC).purification, 10 / 1000);
  // no statements -> not judged; no price -> only what needs no price
  assert.equal(screenHolding({ period: null }, 10, SIC).state, 'ما ينحكم');
  assert.equal(screenHolding(co({ illicit: 90 }), null, SIC).state, 'غير جائز');  // R3 9% needs no price
  assert.equal(screenHolding(co(), null, SIC).state, 'ما ينحكم');
});

test('fundSummary: collateral is reported but left out; cash funds and debt count as non-compliant', () => {
  const r = fundSummary([
    { w: 0.966, kind: 'equity', state: 'مختلط جائز', purification: 0.01 },
    { w: 0.02, kind: 'equity', state: 'غير جائز', purification: 0.2 },
    { w: 0.01, kind: 'cash-fund' },
    { w: 0.30, kind: 'collateral' },
    { w: -0.001, kind: 'derivative' },
  ]);
  assert.equal(r.state, 'مختلط جائز');                    // non-compliant 2% + cash fund 1% = 3%; unknown 0.4%
  assert.ok(Math.abs(r.badWeight - 0.03) < 1e-12);
  assert.ok(Math.abs(r.collateralWeight - 0.30) < 1e-12);
  assert.ok(Math.abs(r.purificationPct - (0.966 * 0.01 + 0.02 * 0.2)) < 1e-12);
  // 55% Treasury bonds (MAGS-like) fails
  assert.equal(fundSummary([{ w: 0.55, kind: 'debt' }, { w: 0.45, kind: 'equity', state: 'مختلط جائز', purification: 0 }]).state, 'غير جائز');
  // an equity holding with no verdict counts as unknown
  assert.equal(fundSummary([{ w: 0.9, kind: 'equity', state: 'مختلط جائز', purification: 0 }, { w: 0.1, kind: 'equity', state: 'ما ينحكم' }]).state, 'ما ينحكم');
});

test('a prohibited activity decides even without statements (banks in the funds)', () => {
  const bank = { period: null, sic: '6021' };
  assert.equal(screenStock(bank, null, SIC).state, 'غير جائز');
  assert.deepEqual(screenStock(bank, null, SIC).failed, ['R1']);
  assert.equal(screenHolding(bank, 100, SIC).state, 'غير جائز');
  assert.equal(screenStock({ period: null, sic: '3674' }, null, SIC), null);  // permitted activity, no data: still nothing
});
test('names match in any word order when that is unique (SCHWAB CHARLES CORP = Charles Schwab Corp/The)', () => {
  const m = buildMaps([{ cik: '0000316709', ticker: 'SCHW', title: 'SCHWAB CHARLES CORP' }], []);
  assert.deepEqual(mapHolding({ name: 'Charles Schwab Corp/The' }, m), { cik: '0000316709', by: 'name' });
});
test('an exact quarter-average price replaces the band (Al Rajhi: quarter average)', () => {
  // debt 270 at 1000 -> 27%: the band (800..1250) disagrees, the exact quarter average decides
  assert.equal(screenHolding(co({ debt: 270 }), 10, SIC).state, 'ما ينحكم');
  const r = screenHolding(co({ debt: 270 }), 10, SIC, { avg: 10.2, n: 62 });   // 270 / 1020 = 26.5%
  assert.equal(r.state, 'مختلط جائز'); assert.equal(r.exact, true);
  assert.ok(Math.abs(r.numbers.debtRatio - 270 / 1020) < 1e-12);
  assert.equal(screenHolding(co({ debt: 270 }), 10, SIC, { avg: 8.5, n: 62 }).state, 'غير جائز'); // 270 / 850 = 31.8%
  // too few days of prices: not used
  assert.equal(screenHolding(co({ debt: 270 }), 10, SIC, { avg: 10.2, n: 12 }).state, 'ما ينحكم');
});
