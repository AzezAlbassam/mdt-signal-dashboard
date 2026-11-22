// The stock page's Shariah wording (pages/stocks.app.js), cut out by name (external audit 2026-11-22)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageFns } from './lib/page-fns.js';

const P = pageFns(['illNote', 'shNoPeriod', 'loanWords', 'purOn', 'wd', 'purMissing', 'illRange'], { esc: (s) => String(s) });
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
test('fix review: loans read from a year of cash flows are not called the loan book (Rocket, Block, Deere)', () => {
  // (a year's flow can be collections, not loans made: Deere's 26.5B; verification 2026-11-22)
  assert.equal(P.loanWords({ loans: 136882, loansFlow: true }), 'قروض بحسب حركتها خلال سنة (ما عندنا رصيدها)');
  assert.equal(P.loanWords({ loans: 25453 }), 'قروضها اللي تقرضها للعملاء');
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
