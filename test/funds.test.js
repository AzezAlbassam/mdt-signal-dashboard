import test from 'node:test';
import assert from 'node:assert/strict';
import { normName, nameKeys, buildMaps, mapHolding, holdingKind, screenHolding, fundSummary, holdingWeight, splitBasis, onShares, needsQuarterAverage, billQuarter } from '../engine/funds.js';
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
test('review: a split puts each report price on the basis of the share count (CrowdStrike 4:1); unknown basis opens both', () => {
  // This test was "a split between two quarters leaves the price basis open by its ratio" until the audit of
  // 2026-11-22: prices after the split were divided by 4 too, so purification came out 4x too high.
  const k = 1016 / 254, win = ['2025-08-14', '2026-08-15'];
  // the saved bars (split-adjusted) settle it: 763.14 against a bar of 190.785 is before the split; 231.00 against 231.00 after
  assert.equal(splitBasis({ price: 763.14, asOf: '2026-03-31', bar: 190.785, splitRatio: k, splitWindow: win }), 'pre');
  assert.equal(splitBasis({ price: 231.0, asOf: '2026-09-30', bar: 231.0, splitRatio: k, splitWindow: win }), 'post');
  // without bars the dates do: on or before the old filing, before; after the restating filing, after; between, unknown
  assert.equal(splitBasis({ price: 760, asOf: '2025-06-30', splitRatio: k, splitWindow: win }), 'pre');
  assert.equal(splitBasis({ price: 230, asOf: '2026-09-30', splitRatio: k, splitWindow: win }), 'post');
  assert.equal(splitBasis({ price: 500, asOf: '2026-03-31', splitRatio: k, splitWindow: win }), null);
  assert.equal(splitBasis({ price: 500, asOf: '2026-03-31' }), 'post');                 // no split
  // prices on the count's basis: before the split divided by the ratio, unknown both
  assert.deepEqual(onShares(763.14, 'pre', 4), [763.14 / 4]);
  assert.deepEqual(onShares(231, 'post', 4), [231]);
  assert.deepEqual(onShares(500, null, 4), [125, 500]);
  // purification follows the price on the share basis: a pre-split 40 is 10 a share now, so 10 x 100 shares = 1000
  assert.equal(screenHolding(co0(), onShares(40, 'pre', 4)[0], SIC).purification, 10 / 1000);
  assert.equal(screenHolding(co0(), onShares(10, 'post', 4)[0], SIC).purification, 10 / 1000);
  // a quarter average from bars saved before the split is open by the ratio (alt): 100 / (1000 / 4) = 40% or 10%
  const q = screenHolding(co0({ debt: 100 }), 10, SIC, { avg: 10, n: 62, alt: 2.5 });
  assert.equal(q.state, 'ما ينحكم'); assert.ok(q.missing.includes('split'));
  assert.equal(screenHolding(co0({ debt: 20 }), 10, SIC, { avg: 10, n: 62, alt: 2.5 }).state, 'مختلط جائز'); // 8% and 2%
})
test('audit: the band is the range given (report prices of the company own quarter, on its share basis); the own price only buys purification', () => {
  // MLM: an in-quarter price of 518.70 gives a sure fail; a price from before its quarter (576.70) must not open the band
  const r = screenHolding(co0({ debt: 330 }), 11, SIC, null, [10, 10])        // 330 / 800 = 41%, 330 / 1250 = 26%: open
  assert.equal(r.state, 'ما ينحكم')
  const s2 = screenHolding(co0({ debt: 330 }), 13, SIC, null, [7, 7])         // 330/560 and 330/875: fails at both
  assert.equal(s2.state, 'غير جائز'); assert.equal(s2.purification, 10 / 1300)  // purification at its own price 13
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

// ---- External audit, 2026-11-22 (post-hoc fixes; progress/SHARIAH-PLAN.md part M13) ----
test('audit: two debt readings decide only together: a pass needs the high one under 30%, a fail the low one over', () => {
  // debt 100 or 130 (lines that may be the same money, engine/sec-facts.js); book equity 0, so market value decides
  const c2 = co({ debt: 100, debtHigh: 130, bookEquity: 0 });
  const pass = screenStock(c2, 500, SIC);                                   // 20% and 26%
  assert.equal(pass.state, 'مختلط جائز'); assert.equal(pass.numbers.debtRatio, 130 / 500); // the cautious reading is shown
  const open = screenStock(c2, 400, SIC);                                   // 25% and 32.5%
  assert.equal(open.state, 'ما ينحكم'); assert.ok(open.missing.includes('debtRange')); assert.ok(!open.missing.includes('debt'));
  assert.deepEqual(open.debtRange, [100 / 400, 130 / 400]);
  const fail = screenStock(c2, 300, SIC);                                   // 33% and 43%
  assert.equal(fail.state, 'غير جائز'); assert.deepEqual(fail.failed, ['R2']);
  // one reading: as before
  assert.equal(screenStock(co({ debt: 100, bookEquity: 0 }), 400, SIC).state, 'مختلط جائز');
  // in a fund the readings meet both ends of the price band: 400 is open, 625 passes
  assert.equal(screenHolding(c2, 5, SIC).state, 'ما ينحكم');
  assert.ok(screenHolding(c2, 5, SIC).missing.includes('debtRange'));
});
test('audit: interest readings decide R3 only together; a lender with unread loan interest cannot pass', () => {
  const open = screenStock(co({ illicit: 20, illicitHigh: 80 }), 1000, SIC);          // 2% and 8%
  assert.equal(open.state, 'ما ينحكم'); assert.ok(open.missing.includes('illicitRange')); assert.ok(!open.missing.includes('illicit'));
  const pass = screenStock(co({ illicit: 20, illicitHigh: 40 }), 1000, SIC);          // 2% and 4%: passes on the high one
  assert.equal(pass.state, 'مختلط جائز'); assert.equal(pass.numbers.illicitShare, 0.04); assert.equal(pass.numbers.purificationPerShare, 40 / 100);
  assert.equal(screenStock(co({ illicit: 60, illicitHigh: 90 }), 1000, SIC).state, 'غير جائز');   // 6% exact fails
  assert.equal(screenStock(co({ illicit: 10, illicitOpen: true }), 1000, SIC).state, 'ما ينحكم');
  assert.equal(screenStock(co({ illicit: 60, illicitOpen: true }), 1000, SIC).state, 'غير جائز');
  // an estimate (upper bound) with unread loan interest is open too
  assert.equal(screenStock(co({ illicit: 10, illicitEstimated: true, illicitOpen: true }), 1000, SIC).state, 'ما ينحكم');
  // purification is the figure that decided R3: the high one when it passes, the exact one when it fails, and none
  // while R3 is open (a loose bound is no amount to pay: Ford came out at 40% of the holding a quarter; audit 2026-11-22)
  assert.equal(screenHolding(co({ illicit: 20, illicitHigh: 40 }), 10, SIC).purification, 40 / 1000);
  // (this was "null while open" until the fix review of 2026-11-22: an exact tagged figure is a certain minimum, so an
  // open R3 purifies at least it; GM's and Ford's rows in XLY had dropped out)
  assert.equal(screenHolding(co({ illicit: 20, illicitHigh: 80 }), 10, SIC).purification, 20 / 1000);
  assert.equal(screenHolding(co({ illicit: 60, illicitHigh: 90 }), 10, SIC).purification, 60 / 1000);
  assert.equal(screenHolding(co({ illicit: 10, illicitOpen: true }), 10, SIC).purification, null);
  // an estimate (an upper bound) above 5% leaves R3 open: no purification amount either
  assert.equal(screenHolding(co({ illicit: 90, illicitEstimated: true }), 10, SIC).purification, null);
  assert.equal(screenHolding(co({ illicit: 30, illicitEstimated: true }), 10, SIC).purification, 30 / 1000);
  // the stock page gives the same per share
  assert.equal(screenStock(co({ illicit: 20, illicitHigh: 80 }), 1000, SIC).numbers.purificationPerShare, 20 / 100);
  // fix review 2026-11-22: a fail is purified on the company's own published total interest, not the largest single line
  // (KeyCorp's 107 of short-term investment interest against its total interest income of 2,133)
  assert.equal(screenHolding(co({ illicit: 60, illicitPublished: 900, illicitHigh: 950 }), 10, SIC).purification, 900 / 1000);
  assert.equal(screenHolding(co({ illicit: 20, illicitPublished: 900, illicitHigh: 40 }), 10, SIC).purification, 40 / 1000);   // a pass keeps its high reading
});
test('audit: a short position in equities is not compliant weight (a 130/30 fund cannot pass on its shorts)', () => {
  const longs = Array.from({ length: 13 }, () => ({ w: 0.10, kind: 'equity', state: 'مختلط جائز', purification: 0.001 }));
  const shorts = Array.from({ length: 3 }, () => ({ w: -0.10, kind: 'equity', state: 'مختلط جائز', purification: 0.001 }));
  const r = fundSummary([...longs, ...shorts]);
  assert.equal(r.state, 'ما ينحكم'); assert.ok(r.unknownWeight >= 0.30 - 1e-12, String(r.unknownWeight));
});
test('audit: spot currency contracts are not money-market funds (URA, COPX, LIT)', () => {
  assert.equal(holdingKind({ asset: 'STIV', units: 'NC', name: 'Spot FX Contract' }), 'derivative');
  assert.equal(holdingKind({ asset: 'STIV', units: 'NS', name: 'State Street Institutional US Government Money Market Fund' }), 'cash-fund');
});
test('audit: a foreign holding takes a reported ticker or ISIN only when the names agree, not just share a word (Merck KGaA, Prudential, 3i)', () => {
  const m = buildMaps([
    { cik: '0000310158', ticker: 'MRK', title: 'Merck & Co., Inc.' }, { cik: '0001137774', ticker: 'PRU', title: 'PRUDENTIAL FINANCIAL INC' },
    { cik: '0001062047', ticker: 'III', title: 'Information Services Group Inc.' }, { cik: '0000849395', ticker: 'CRH', title: 'CRH PUBLIC LTD CO' },
    { cik: '0000924613', ticker: 'NOK', title: 'NOKIA CORP' }, { cik: '0001046179', ticker: 'TSM', title: 'TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD' },
  ], []);
  assert.deepEqual(mapHolding({ name: 'Merck KGaA', ticker: 'MRK', country: 'DE' }, m), { cik: null, by: null });
  assert.deepEqual(mapHolding({ name: 'Prudential PLC', ticker: 'PRU', country: 'GB' }, m), { cik: null, by: null });
  assert.deepEqual(mapHolding({ name: '3i Group PLC', ticker: 'III', country: 'GB' }, m), { cik: null, by: null });
  // the same company under its foreign legal form still matches
  assert.deepEqual(mapHolding({ name: 'CRH PLC', ticker: 'CRH', country: 'IE' }, m), { cik: '0000849395', by: 'ticker' });
  assert.equal(mapHolding({ name: 'Nokia Oyj', ticker: 'NOKIA', country: 'FI' }, m).cik, '0000924613');
  assert.deepEqual(mapHolding({ name: 'Taiwan Semiconductor Manufacturing Co Ltd', ticker: 'TSM', country: 'TW' }, m), { cik: '0001046179', by: 'ticker' });
});
test('audit: a state suffix tells two same-named companies apart (Independent Bank Corp/MI is IBCP, not INDB)', () => {
  const m = buildMaps([{ cik: '0000776901', ticker: 'INDB', title: 'INDEPENDENT BANK CORP' }, { cik: '0000039311', ticker: 'IBCP', title: 'INDEPENDENT BANK CORP /MI/' }], []);
  assert.deepEqual(mapHolding({ name: 'Independent Bank Corp/MI', country: 'US' }, m), { cik: '0000039311', by: 'name' });
  assert.deepEqual(mapHolding({ name: 'Independent Bank Corp', country: 'US' }, m), { cik: null, by: null });   // still two candidates
});
test('audit: the interest a fund earns on its own bills, bonds and money funds is purified too (MAGS: 65% of the fund)', () => {
  // purification of a bill or money-fund row = its quarter's interest per unit of value (fund-load: 3-month bill yield)
  const r = fundSummary([{ w: 0.5545, kind: 'debt', purification: 0.0084 }, { w: 0.0941, kind: 'cash-fund', purification: 0.0084 },
    { w: 0.225, kind: 'equity', state: 'مختلط جائز', purification: 0.0004 }]);
  assert.ok(Math.abs(r.purificationPct - (0.5545 * 0.0084 + 0.0941 * 0.0084 + 0.225 * 0.0004)) < 1e-12, String(r.purificationPct));
  assert.ok(Math.abs(r.purificationCoveredWeight - (0.5545 + 0.0941 + 0.225)) < 1e-12);
  assert.equal(r.state, 'غير جائز');
});
test('audit: an unjudged holding says why: not matched to a company, no numbers at SEC, stale numbers, or no quarterly filings', () => {
  assert.deepEqual(screenHolding(null, 10, SIC).missing, ['unmatched']);
  assert.deepEqual(screenHolding({ cik: '1', error: 'no XBRL facts' }, 10, SIC).missing, ['unreadable']);
  assert.deepEqual(screenHolding({ cik: '1', period: null, stale: '2026-03-31' }, 10, SIC).missing, ['stale']);
  assert.deepEqual(screenHolding({ cik: '1', period: null }, 10, SIC).missing, ['statements']);
});
test('fix review: a pass on report prices near the debt line also needs the quarter average (Snowflake fell below the band floor; SPUS rests on ten such passes)', () => {
  assert.equal(needsQuarterAverage({ k: 'equity', t: 'X', why: ['priceBand'], s: 'ما ينحكم' }), true);
  assert.equal(needsQuarterAverage({ k: 'equity', t: 'HUBB', why: [], s: 'مختلط جائز', exact: false, dr: 0.2396 }), true);
  assert.equal(needsQuarterAverage({ k: 'equity', t: 'AAPL', why: [], s: 'مختلط جائز', exact: false, dr: 0.05 }), false);
  assert.equal(needsQuarterAverage({ k: 'equity', t: 'IBM', why: [], s: 'مختلط جائز', exact: true, dr: 0.28 }), false);   // already exact
  assert.equal(needsQuarterAverage({ k: 'equity', t: null, why: ['priceBand'], s: 'ما ينحكم' }), false);                // nothing to fetch
});
test('fix review: spot currency lines named by their bank are found by their title (URA, COPX, LIT)', () => {
  assert.equal(holdingKind({ asset: 'STIV', units: 'NC', name: 'BANK OF NEW YORK (THE)', title: 'Spot FX Contract: USD/CAD' }), 'derivative');
  assert.equal(holdingKind({ asset: 'STIV', units: 'NS', name: 'State Street Institutional US Government Money Market Fund', title: 'State Street Inst US Gov MMF' }), 'cash-fund');
});
test('fix review: a fund\'s own bills earn their investment yield, not the discount rate (DTB3 3.624% -> 0.9245% a quarter, not 0.9035%)', () => {
  const q = billQuarter(3.624);
  assert.ok(Math.abs(q - (0.03624 * 91 / 360) / (1 - 0.03624 * 91 / 360)) < 1e-12, String(q));
  assert.ok(q > 0.03624 * 91 / 365);
  assert.equal(billQuarter(null), null);
});
test('fix review: a saved bar confirms a post-split price only when the bars are known to include the split (a split after the last bar)', () => {
  // the bars end 2026-10-06; a split between the 10-Q of 08-07 and the restating one of 11-06 may be after them
  const w = ['2026-08-07', '2026-11-06'];
  assert.equal(splitBasis({ price: 100, asOf: '2026-09-30', bar: 100, splitRatio: 2, splitWindow: w, barsAdjusted: null }), null);
  assert.equal(splitBasis({ price: 100, asOf: '2026-09-30', bar: 100, splitRatio: 2, splitWindow: w, barsAdjusted: true }), 'post');
  assert.equal(splitBasis({ price: 100, asOf: '2026-09-30', bar: 50, splitRatio: 2, splitWindow: w, barsAdjusted: null }), 'pre');   // the bar's half price proves it
});
test('fix review: a company\'s combined interest figure above 5% reads as a bound, not as "the confirmed part is under 5%" (Circle 76%)', () => {
  const v = screenStock(co({ illicit: 60, illicitEstimated: true, illicitHigh: 90 }), 1000, SIC);
  assert.equal(v.state, 'ما ينحكم'); assert.ok(v.missing.includes('illicit'), JSON.stringify(v.missing)); assert.ok(!v.missing.includes('illicitRange'));
});
test('audit round 2: cash collateral from lending the fund\'s shares earns interest the fund keeps part of: purified at the bill yield, an upper bound (TAN: 34% of the fund)', () => {
  const r = fundSummary([{ w: 0.9, kind: 'equity', state: 'مختلط جائز', purification: 0.001 }, { w: 0.1, kind: 'equity', state: 'مختلط جائز', purification: 0.002 },
    { w: 0.34, kind: 'collateral', purification: 0.0092 }]);
  assert.ok(Math.abs(r.purificationPct - (0.9 * 0.001 + 0.1 * 0.002 + 0.34 * 0.0092)) < 1e-12, String(r.purificationPct));
  assert.equal(r.state, 'مختلط جائز'); assert.ok(Math.abs(r.purificationCoveredWeight - 1) < 1e-12);   // weights and coverage as before
});
