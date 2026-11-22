import test from 'node:test';
import assert from 'node:assert/strict';
import { normName, nameKeys, buildMaps, mapHolding, holdingKind, screenHolding, fundSummary, holdingWeight } from '../engine/funds.js';
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
   { cik: '0000001', ticker: 'ABC', title: 'ABC Holdings Inc' }, { cik: '0000002', ticker: 'ABCX', title: 'ABC Ltd' }],
  [{ isin: 'US67066G1040', ticker: 'NVDA' }]);
test('holdings map by ticker, then ISIN, then a unique name; ambiguity is unmapped', () => {
  assert.deepEqual(mapHolding({ ticker: 'NVDA', name: 'x', country: 'US' }, maps), { cik: '0001045810', by: 'ticker' }); // a US holding (review: country now matters)
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

// ---- Independent review of the funds tab, 2026-11-22 (post-hoc fixes; progress/SHARIAH-PLAN.md part M12) ----
test('review: a reported ticker or ISIN counts only for a US holding or when the SEC title shares a name word', () => {
  const m = buildMaps([
    { cik: '0000882835', ticker: 'ROP', title: 'ROPER TECHNOLOGIES INC' }, { cik: '0001814287', ticker: 'ABX', title: 'Abacus Global Management, Inc.' },
    { cik: '0000756894', ticker: 'B', title: 'BARRICK MINING CORP' }, { cik: '0001594805', ticker: 'SHOP', title: 'SHOPIFY INC.' },
    { cik: '0000731766', ticker: 'SNY', title: 'Sanofi' }, { cik: '0000891478', ticker: 'SAN', title: 'Banco Santander, S.A.' },
  ], [{ isin: 'CA06849F1080', ticker: 'ABX', name: 'Barrick Mining Corp', country: 'CA' }])   // UMMA's Toronto ticker
  assert.deepEqual(mapHolding({ name: 'Roche Holding AG', ticker: 'ROP', country: 'CH' }, m), { cik: null, by: null })
  assert.deepEqual(mapHolding({ name: 'Sanofi SA', ticker: 'SAN', country: 'FR' }, m), { cik: '0000731766', by: 'name' })
  assert.deepEqual(mapHolding({ name: 'Roper Technologies Inc', ticker: 'ROP', country: 'US' }, m), { cik: '0000882835', by: 'ticker' })
  assert.deepEqual(mapHolding({ name: 'Shopify Inc', ticker: 'SHOP', country: 'CA' }, m), { cik: '0001594805', by: 'ticker' })
  // GDX reports no ticker: the ISIN seeded from UMMA's "ABX" must not carry Barrick to Abacus; the name finds Barrick
  assert.deepEqual(mapHolding({ name: 'Barrick Mining Corp', isin: 'CA06849F1080', country: 'CA' }, m), { cik: '0000756894', by: 'name' })
})
test('review: names with backslash or spaced state suffixes, a place after the legal form, dotted legal forms, GROUP kept', () => {
  assert.equal(normName('US BANCORP \\DE\\'), normName('US Bancorp'))
  assert.equal(normName('MP Materials Corp. / DE'), normName('MP Materials Corp'))
  assert.equal(normName('Energy Fuels Inc/Canada'), normName('ENERGY FUELS INC'))
  assert.equal(normName('STMicroelectronics N.V.'), normName('STMicroelectronics NV'))
  assert.equal(normName('Bunge Global S.A.'), normName('Bunge Global SA'))
  assert.equal(normName('CULLEN/FROST BANKERS, INC.'), normName('Cullen/Frost Bankers Inc'))
  assert.equal(normName('Preferred Bank/Los Angeles CA'), 'PREFERRED BANK LOS ANGELES CA')   // a city is not a state code
  assert.notEqual(normName('Compass Group PLC'), normName('Compass, Inc.'))                   // the UK caterer is not the US broker
})
const co0 = (o = {}) => co({ bookEquity: 0, ...o })
test('review: unknown interest gives an unknown purification, never 0 (in JavaScript null >= 0 is true)', () => {
  assert.equal(screenHolding(co({ illicit: null }), 10, SIC).purification, null)
  assert.equal(screenHolding(co({ illicit: null }), 10, SIC, { avg: 10, n: 62 }).purification, null)
})
test('review: purification uses the price behind the weight; the quarter average decides only the debt test', () => {
  const r = screenHolding(co0({ debt: 270 }), 10, SIC, { avg: 8, n: 62 })      // 270 / 800 = 33.75%: fails on the average
  assert.equal(r.state, 'غير جائز'); assert.equal(r.purification, 10 / 1000)    // at the report price, 10 x 100 shares
})
test('review: reasons are only those that fail at both ends of the band (AXP: interest fails everywhere, debt only at 80%)', () => {
  // debt 280: 35% at 800, 28% at 1000, 22.4% at 1250; illicit 90 = 9% of revenue
  const r = screenHolding(co0({ debt: 280, illicit: 90 }), 10, SIC)
  assert.equal(r.state, 'غير جائز'); assert.deepEqual(r.failed, ['R3'])
  const b = screenHolding(co0({ debt: 280 }), 10, SIC)                          // fails at 800, passes at 1250
  assert.equal(b.state, 'ما ينحكم'); assert.deepEqual(b.failed, []); assert.ok(b.missing.includes('priceBand'))
})
test('review: one price range per company across every fund report (Southwest: 51.42 in one, 38.53 in another)', () => {
  // debt 200: 25% at 800 and 16% at 1250 on this report's price alone; another report's price of 7 gives 200/560 = 35.7%
  assert.equal(screenHolding(co0({ debt: 200 }), 10, SIC).state, 'مختلط جائز')
  const r = screenHolding(co0({ debt: 200 }), 10, SIC, null, [7, 10])
  assert.equal(r.state, 'ما ينحكم'); assert.equal(r.purification, 10 / 1000)  // purification stays at this fund's price
  assert.equal(screenHolding(co0({ debt: 100 }), 10, SIC, null, [7, 12]).state, 'مختلط جائز')  // 100/560 and 100/1500
})
test('review: a split between two quarters leaves the price basis open by its ratio (CrowdStrike 4:1)', () => {
  assert.equal(screenHolding(co0({ debt: 100 }), 10, SIC).state, 'مختلط جائز')                  // 10% at 1000
  // shares 4x the previous quarter: a report price from before the split makes market value 4x too high
  assert.equal(screenHolding(co0({ debt: 100, splitRatio: 4 }), 10, SIC).state, 'ما ينحكم')    // 100 / (1000 x 0.8 / 4) = 50%
  assert.equal(screenHolding(co0({ debt: 20, splitRatio: 4 }), 10, SIC).state, 'مختلط جائز')   // 20 / 200 = 10%
  // the quarter average too: 100 / (1000 / 4) = 40% at one basis, 10% at the other
  const q = screenHolding(co0({ debt: 100, splitRatio: 4 }), 10, SIC, { avg: 10, n: 62 })
  assert.equal(q.state, 'ما ينحكم'); assert.ok(q.missing.includes('split'))
  assert.equal(screenHolding(co0({ debt: 100, splitRatio: 0.25 }), 10, SIC).state, 'مختلط جائز') // reverse split: only higher
})
test('review: swaps count with their sign in the 100% check (MAGS: 65% bills and money funds is غير جائز)', () => {
  const r = fundSummary([
    { w: 0.5545, kind: 'debt' }, { w: 0.0941, kind: 'cash-fund' }, { w: 0.0683, kind: 'equity', state: 'ما ينحكم' },
    { w: 0.25, kind: 'equity', state: 'مختلط جائز', purification: 0 },
    { w: 0.0265, kind: 'derivative' }, { w: -0.0135, kind: 'derivative' }, { w: 0.03, kind: 'derivative' }, { w: -0.0139, kind: 'derivative' },
  ])
  assert.equal(r.state, 'غير جائز'); assert.ok(Math.abs(r.badWeight - 0.6486) < 1e-9)
  // still: signed weights above 100.5% are bad data
  assert.equal(fundSummary([{ w: 0.99, kind: 'equity', state: 'مختلط جائز', purification: 0 }, { w: 0.02, kind: 'derivative' }]).state, 'ما ينحكم')
})
test('review: purification coverage and the look-through share of illicit revenue', () => {
  const r = fundSummary([
    { w: 0.6, kind: 'equity', state: 'مختلط جائز', purification: 0.01, illicitShare: 0.02 },
    { w: 0.3, kind: 'equity', state: 'مختلط جائز', purification: null, illicitShare: null },
    { w: 0.05, kind: 'cash-fund' },
  ])
  assert.ok(Math.abs(r.purificationCoveredWeight - 0.6) < 1e-12)
  assert.ok(Math.abs(r.illicitLookThrough - 0.6 * 0.02) < 1e-12); assert.ok(Math.abs(r.illicitCoveredWeight - 0.6) < 1e-12)
})
test('review: a holding weight is its value over net assets when both are known (SPRE lists $0.03 lines at -1.41%)', () => {
  assert.equal(holdingWeight({ pct: -1.4148, usd: 0.03 }, 1e8), 0.03 / 1e8)
  assert.equal(holdingWeight({ pct: 2.5, usd: null }, 1e8), 0.025)
  assert.equal(holdingWeight({ pct: 2.5, usd: 5 }, null), 0.025)
})
