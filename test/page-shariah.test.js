// The stock page's Shariah wording (pages/stocks.app.js), cut out by name (external audit 2026-11-22)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageFns } from './lib/page-fns.js';
import { readFileSync } from 'node:fs';

const P = pageFns(['illNote', 'shNoPeriod', 'loanWords', 'purOn', 'wd', 'purMissing', 'illRange', 'shareMismatch', 'fullQuarter', 'purFloor', 'debtWords', 'mvMissing', 'leaseWords', 'mvBounds'], { esc: (s) => String(s) });
test('audit: a combined interest figure is called an upper bound, not an estimate (CSCO, BKNG)', () => {
  assert.equal(P.illNote({ illicitEstimated: true, illicitTag: 'InvestmentIncomeInterestAndDividend' }), 'رقم مدموج (حد أعلى)');
  assert.equal(P.illNote({ illicitEstimated: true, illicitTag: null }), 'تقدير');
  assert.equal(P.illNote({ illicitEstimated: false, illicitTag: 'InvestmentIncomeInterest' }), '');
});
test('audit: a company SEC gave no numbers for is not called a foreign annual filer (a refused fetch read that way)', () => {
  assert.match(P.shNoPeriod({ error: 'no XBRL facts' }), /ما لقينا أرقامها في SEC/);
  assert.match(P.shNoPeriod({ error: 'no CIK' }), /ما لقينا الشركة في SEC/);
  assert.match(P.shNoPeriod({ stale: '2026-03-31' }), /2026-03-31/);
  // (verification 2026-11-22: 33 such companies do file 10-Qs, with revenue under their own or year-to-date tags)
  assert.match(P.shNoPeriod({}), /ما لقينا إيرادات ربعية بالأسماء المعتادة/);
  assert.doesNotMatch(P.shNoPeriod({}), /ما تقدم تقارير ربعية/);
});
test('fix review: loans read from cash flows are not called the loan book (Rocket, Block, Deere)', () => {
  // (a year's flow can be collections, not loans made: Deere's 26.5B; verification 2026-11-22). Since the final check of
  // 2026-11-22 the flow's own period, and whether a smaller balance is tagged: Block tags 2.35B, Rocket's flow is 9 months
  assert.equal(P.loanWords({ loans: 32145.2, loansFlow: true, loansFlowDays: 365, loansBalance: 2352.2 }), 'قروض بحسب حركتها النقدية خلال سنة');
  assert.equal(P.loanWords({ loans: 136882, loansFlow: true, loansFlowDays: 273 }), 'قروض بحسب حركتها النقدية خلال 9 شهور (ما لقينا رصيدها في بيانات SEC اللي نقرأها)');
  assert.equal(P.loanWords({ loans: 136882, loansFlow: true }), 'قروض بحسب حركتها النقدية (ما لقينا رصيدها في بيانات SEC اللي نقرأها)');
  assert.equal(P.loanWords({ loans: 25453 }), 'قروضها اللي تقرضها للعملاء');
  // the smaller tagged balance is printed beside the flow, and every code the screen gives has its reason on both tabs
  const src = readFileSync(new URL('../pages/stocks.app.js', import.meta.url), 'utf8');

  assert.equal((src.match(/illicitBook: '/g) ?? []).length, 2);
});
test('fix review: the purification row names the interest figure it is computed on when that is not the one shown (Wells Fargo, Cisco)', () => {
  const big = (x) => 'USD ' + x;
  assert.match(P.purOn(23908, 1400, big), /USD 23908/);    // a fail on the published total
  assert.equal(P.purOn(1400, 1400, big), '');              // the shown figure itself: nothing to add
  assert.equal(P.purOn(null, 1400, big), '');
});
test('fix review: weights near the 5% line get two decimals, so the parts never seem to add up to 5% (SPUS 0.755 + 4.217)', () => {
  assert.equal(P.wd({ badWeight: 0.00755, unknownWeight: 0.04217 }), 2);
  assert.equal(P.wd({ badWeight: 0.10, unknownWeight: 0.20 }), 1);
});
test('fix review: an unknown purification says what is missing (the share count for Tempus, Berkshire; the interest figure otherwise)', () => {
  assert.match(P.purMissing({ illicit: 5, revenue: 100 }), /عدد الأسهم/);
  assert.match(P.purMissing({ illicit: 5, shares: 10 }), /الإيرادات/);
  assert.match(P.purMissing({ illicit: 5, revenue: 100, shares: 10 }), /رقم الفوائد/);
});
test('fix review: the interest row shows the figure its ratio uses when that is the high reading (Cisco 234.0 to 673.4)', () => {
  const big = (x) => 'USD ' + x;
  assert.equal(P.illRange(234, 673.4, big), 'USD 234 إلى USD 673.4');
  assert.equal(P.illRange(234, 234, big), 'USD 234');
  assert.equal(P.illRange(234, null, big), 'USD 234');
});
test('audit round 2: a share count that does not match the market value today is not judged (a reverse split after the filing passed at 5% instead of failing at 50%)', () => {
  assert.equal(P.shareMismatch(30, 1e8, 3e8), true);        // 1:10 reverse split after the 10-Q: 10x the market value
  assert.equal(P.shareMismatch(3, 1e8, 3e9), true);         // a 10:1 split: a tenth
  assert.equal(P.shareMismatch(30, 1e8, 2.9e9), false);     // buybacks and issues move it a little
  assert.equal(P.shareMismatch(30, 1e8, null), false);      // no market value to compare: nothing to say
});
test('audit round 2: a quarter average needs bars from the quarter\'s start to its end, give or take a long weekend (47 days to 09-04 was judged)', () => {
  const day = (iso) => Date.parse(iso) / 1000;
  assert.equal(P.fullQuarter([day('2026-07-01'), day('2026-09-30')], '2026-07-01', '2026-09-30'), true);
  assert.equal(P.fullQuarter([day('2026-07-01'), day('2026-09-04')], '2026-07-01', '2026-09-30'), false);
  assert.equal(P.fullQuarter([day('2026-07-20'), day('2026-09-30')], '2026-07-01', '2026-09-30'), false);
});
test('audit round 2: a panel without a score still has the Shariah block (VKTX, DJT, RGTI showed none)', () => {
  const src = readFileSync(new URL('../pages/stocks.app.js', import.meta.url), 'utf8');
  const noScore = src.split('\n').find((l) => l.includes('if (!s || !s.detail) return'));
  assert.ok(noScore, 'the no-score branch');
  assert.match(noScore, /shBlock\(sym\)/);
});
test('final check: the debt row says what each figure is: the liabilities bound is no reading of debt lines (Ironwood, Dropbox), a range is lines we cannot confirm (Waste Management, Super Micro)', () => {
  const big = (x) => 'USD ' + x;
  assert.equal(P.debtWords({ debt: 325, debtHigh: 376.6, debtPartial: true }, {}, big), 'USD 325، وأعلى حد USD 376.6 (كل الالتزامات ناقص الإيجارات)');
  const range = P.debtWords({ debt: 21740, debtHigh: 23370 }, {}, big);
  assert.match(range, /^USD 21740 إلى USD 23370 \(.*بالطريقتين\)$/);
  assert.doesNotMatch(range, /مكتوب مرتين/);   // not only double counts any more: convertibles, credit lines, a lease line
  assert.equal(P.debtWords({ debt: null, debtUpperBound: 8517.7 }, { debtUpper: true }, big), 'USD 8517.7 (أعلى حد: كل الالتزامات ناقص الإيجارات)');
  assert.equal(P.debtWords({ debt: 100 }, {}, big), 'USD 100');
  // the page data keeps the flag
  const src = readFileSync(new URL('../scripts/build-stocks-page.js', import.meta.url), 'utf8');
  assert.match(src.match(/const KEEP = (\[[^\]]*\])/)[1], /'debtPartial'/);
});
test('final check: an open interest reading purifies its exact figure as a floor, and says so (Ford, ADP)', () => {
  assert.match(P.purFloor({ missing: ['illicitRange'] }), /على الأقل/);
  assert.equal(P.purFloor({ missing: ['debt'] }), '');
  assert.equal(P.purFloor({ missing: [] }), '');
});
test('final check: the method and reason sentences say only what the data shows (Deere, Cisco, NextEra, Tempus)', () => {
  // NextEra: SEC's figures stop at a quarter while newer 10-Qs are filed: SEC has not published them, not "changed its reporting"
  const nee = P.shNoPeriod({ stale: '2026-03-31', newerFiling: { f: '10-Q', p: '2026-09-30', d: '2026-10-21' } });
  assert.match(nee, /2026-03-31/); assert.match(nee, /2026-09-30/); assert.doesNotMatch(nee, /غيّرت/);
  assert.doesNotMatch(P.shNoPeriod({ stale: '2026-03-31' }), /غيّرت/);
  // Tempus: the share count is what is missing, beside a printed average price
  assert.match(P.mvMissing({ shares: null }), /عدد الأسهم/); assert.equal(P.mvMissing({ shares: 5 }), 'متوسط سعر الربع');
  const src = readFileSync(new URL('../pages/stocks.app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /الشركة ما تعلن إيراد الفوائد/);          // Deere publishes 1,353 of finance income: we cannot read it
  assert.doesNotMatch(src, /فهو حد أعلى: يثبت الجواز إذا كان تحت 5٪/);   // Cisco passed on a higher reading than the tag
});
test('review of the final check: a lease line another filing contradicts is named as one that may hold other debt, counted in the high reading (Waste Management)', () => {
  const big = (x) => 'USD ' + x;
  assert.equal(P.leaseWords({ debtParts: { leases: 1630, leaseDoubt: 1630 } }, big), ' · إيجارات USD 1630 (منها بند USD 1630 ممكن فيه ديون ثانية، فمحسوب في القراءة الأعلى)');
  assert.equal(P.leaseWords({ debtParts: { leases: 719 } }, big), ' · إيجارات USD 719 ما تنحسب');
  assert.equal(P.leaseWords({ debtParts: { leases: 0 } }, big), '');
});
test('review of the final check: the share box says «على الأقل» for an open interest floor, like the row above it (Ford, ADP)', () => {
  const src = readFileSync(new URL('../pages/stocks.app.js', import.meta.url), 'utf8');
  assert.match(src, /data-shq="\$\{esc\(sym\)\}" data-pps="\$\{pps\}" data-floor="\$\{purFloor\(s\) \? 1 : 0\}"/);
  assert.match(src, /عليك \$\{i\.dataset\.floor === '1' \? 'على الأقل ' : ''\}<bdi>\$\$\{fmt\(n \* pps, 2\)\}<\/bdi> عن هالربع/);
});
test('review of the final check: reasons say what is known: an estimate at a company SEC codes as finance, a partial debt bound, an activity under review beside what is missing (HIVE, Shoals, Ameriprise)', () => {
  const src = readFileSync(new URL('../pages/stocks.app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /دفاتر فوائدها بأسماء خاصة ما نقرأها/);   // HIVE and Upexi mine crypto: no hidden interest books
  assert.equal((src.match(/illicitBook: '/g) ?? []).length, 2);
  assert.equal((src.match(/debtBound: '/g) ?? []).length, 2);
  assert.match(src, /\.join\('، '\) \+ \(s\.activity === 'review' \? '، ونشاط الشركة يحتاج مراجعة' : ''\) : 'نشاط الشركة يحتاج مراجعة/);
  // NextEra: SEC has not published the newer 10-Q; APA: SEC has it, only its revenue is under tags we do not read
  assert.match(P.shNoPeriod({ stale: '2026-03-31', newerFiling: { f: '10-Q', p: '2026-09-30', inData: false } }), /ما نشرت SEC أرقامه/);
  const apa = P.shNoPeriod({ stale: '2021-06-30', newerFiling: { f: '10-Q', p: '2026-09-30', inData: true } });
  assert.doesNotMatch(apa, /ما نشرت SEC/); assert.match(apa, /بأسماء ما نقرأها/);
  // Deere: no loan balance at the quarter's end under the tags we read (its 42.9B sit under its own tag)
  assert.equal(P.loanWords({ loans: 26480, loansFlow: true, loansFlowDays: 371 }), 'قروض بحسب حركتها النقدية خلال سنة (ما لقينا رصيدها في بيانات SEC اللي نقرأها)');
  assert.match(src, /أكبر رصيد قروض نقرأه لها في نهاية الربع \$\{big\(r\.estimate\.loansBalance\)\}، أصغر من حركتها/);
});
test('review of the final check: the list chip judges withdrawn statements on the activity alone (an exact interest line above 5% on a withdrawn quarter)', () => {
  const src = readFileSync(new URL('../pages/stocks.app.js', import.meta.url), 'utf8');
  const chip = src.slice(src.indexOf('  function shChip(sym) {'), src.indexOf('\n  }\n', src.indexOf('  function shChip(sym) {')));
  assert.match(chip, /if \(r && \(!r\.period \|\| r\.nonReliance\) && activityFromSic\(r\.sic, SHARIAH\.sic, r\.cik\) === 'fail'\)/);
  assert.match(chip, /const pre = r\.nonReliance \? null : shariahVerdict/);
});
test('2026-11-23: the block judges from a saved quarter average, or from the 52-week range of a quote that covers the quarter (it showed no verdict while TradingView was refusing)', () => {
  const r = { period: { start: '2026-07-01', end: '2026-09-30' }, shares: 10, sharesMV: 8 };
  const at = Date.parse('2026-11-23');
  assert.deepEqual(P.mvBounds({ price_52_week_low: 50, price_52_week_high: 90 }, at, r), [400, 720]);   // on the smaller share count
  assert.equal(P.mvBounds({ price_52_week_low: 50, price_52_week_high: 90 }, Date.parse('2026-09-01'), r), null);   // a quote from inside the quarter
  assert.equal(P.mvBounds({ price_52_week_low: 50, price_52_week_high: 90 }, Date.parse('2027-07-15'), r), null);   // the quarter has left the 52 weeks
  assert.equal(P.mvBounds({ price_52_week_low: null, price_52_week_high: 90 }, at, r), null);
  assert.equal(P.mvBounds(undefined, at, r), null);
  // the saved average is used for its own quarter only: the db's (an earlier visit) first, then the page's saved bars
  const S = pageFns(['savedAvg'], { state: { sh: { 'NYSE:A': { period: { end: '2026-09-30' }, avgClose: 12, days: 64 }, 'NYSE:B': { period: { end: '2026-06-30' }, avgClose: 9 } } },
    SHARIAH: { avg: { A: { a: 11, n: 64, s: '2026-07-01', e: '2026-09-30' }, B: { a: 10, n: 64, s: '2026-07-01', e: '2026-09-30' }, C: { a: 7, n: 63, s: '2026-04-01', e: '2026-06-30' } } } });
  assert.deepEqual(S.savedAvg('NYSE:A', r), { avg: 12, n: 64, src: 'db' });
  assert.deepEqual(S.savedAvg('NYSE:B', r), { avg: 10, n: 64, src: 'bars' });
  assert.equal(S.savedAvg('NYSE:C', r), null);
  assert.equal(S.savedAvg('NYSE:D', r), null);
});
test('2026-11-23: the Shariah block is a verdict banner over stacked rows, not a table (on a phone the table squeezed every value into a few letters a line)', () => {
  const src = readFileSync(new URL('../pages/stocks.app.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('  function shBlock(sym) {'), src.indexOf('\n  // 7c. Funds'));
  assert.doesNotMatch(block, /<table|shrows/);
  assert.match(block, /class="shv /); assert.match(block, /class="shi"/);
  // a failed price fetch says so instead of "computing…" for ever
  assert.match(block, /TradingView ما رد/);
});
test('2026-11-23: a stock whose TradingView data did not arrive gets no earnings grade (it showed "D 0/15" over empty cells)', async () => {
  const { EHS_METRICS } = await import('../engine/ehs.js');
  const G = pageFns(['ehsHasData'], { EHS_METRICS });
  const parts = (v) => Object.fromEntries(EHS_METRICS.map((m, i) => [m.key, { value: v(i), points: 0 }]));
  assert.equal(G.ehsHasData({ total: 0, parts: parts(() => null) }), false);      // nothing arrived: no grade
  assert.equal(G.ehsHasData({ total: 0, parts: parts((i) => (i ? null : -3)) }), true);   // a real zero is a grade
  assert.equal(G.ehsHasData(null), false);
  const src = readFileSync(new URL('../pages/stocks.app.js', import.meta.url), 'utf8');
  assert.match(src, /ehsHasData\(e\) \? \{ \.\.\.e, letter:/);
  assert.match(src, /ما وصلت بيانات هذا السهم من TradingView/);
});
