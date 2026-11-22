// The stock page's Shariah wording (pages/stocks.app.js), cut out by name (external audit 2026-11-22)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageFns } from './lib/page-fns.js';

const P = pageFns(['illNote', 'shNoPeriod'], { esc: (s) => String(s) });
test('audit: a combined interest figure is called an upper bound, not an estimate (CSCO, BKNG)', () => {
  assert.equal(P.illNote({ illicitEstimated: true, illicitTag: 'InvestmentIncomeInterestAndDividend' }), 'رقم مدموج (حد أعلى)');
  assert.equal(P.illNote({ illicitEstimated: true, illicitTag: null }), 'تقدير');
  assert.equal(P.illNote({ illicitEstimated: false, illicitTag: 'InvestmentIncomeInterest' }), '');
});
test('audit: a company SEC gave no numbers for is not called a foreign annual filer (a refused fetch read that way)', () => {
  assert.match(P.shNoPeriod({ error: 'no XBRL facts' }), /ما لقينا أرقامها في SEC/);
  assert.match(P.shNoPeriod({ error: 'no CIK' }), /ما لقينا الشركة في SEC/);
  assert.match(P.shNoPeriod({ stale: '2026-03-31' }), /2026-03-31/);
  assert.match(P.shNoPeriod({}), /ما تقدم تقارير ربعية/);
});
