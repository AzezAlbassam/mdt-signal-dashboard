// Shariah screen, Al Rajhi Capital method (progress/SHARIAH-PLAN.md parts A, M). Pure functions, no I/O.
const DEBT_MAX = 0.30, ILLICIT_MAX = 0.05, EPS = 1e-12;
const known = x => typeof x === 'number' && Number.isFinite(x);
const amount = x => known(x) && x >= 0; // debt, revenue items, balances: a negative value is bad data

// R2: interest-bearing debt / market value, or book equity when market value is below it.
export function debtRatio(debt, marketValue, bookEquity) {
  if (!amount(debt) || !known(marketValue) || !known(bookEquity)) return null;
  const denom = marketValue < bookEquity ? bookEquity : marketValue;
  return denom > 0 ? debt / denom : null;
}

// R3: illicit revenue / total revenue. No revenue: any illicit income fails (Infinity), none passes.
export function illicitShare(illicit, revenue) {
  if (!amount(illicit) || !known(revenue)) return null;
  if (revenue < 0) return null; // bad data (G6.6)
  if (revenue === 0) return illicit > 0 ? Infinity : 0;
  return illicit / revenue;
}

// R6: owed whether the company made a profit or not.
export function purificationPerShare(illicit, shares) {
  return amount(illicit) && known(shares) && shares > 0 ? illicit / shares : null;
}

// A8: cautious estimate of undisclosed interest income ("يراعى جانب الاحتياط"): the higher of the two balances.
// The caller passes every interest-earning balance: cash, deposits, marketable and debt securities.
export function estimateInterest({ cashStart, cashEnd, yieldPct, days }) {
  if (![cashStart, cashEnd, yieldPct, days].every(amount)) return null;
  return Math.max(cashStart, cashEnd) * yieldPct / 100 * days / 365;
}

export function shariahVerdict({ activity, debt, marketValue, bookEquity, illicit, illicitEstimated, revenue, shares }) {
  const missing = [], failed = [];
  if (activity === 'fail') failed.push('R1');
  else if (activity !== 'ok' && activity !== 'review') missing.push('activity'); // anything unexpected is unknown
  for (const [k, x] of Object.entries({ debt, illicit })) if (!amount(x)) missing.push(k);
  for (const [k, x] of Object.entries({ marketValue, bookEquity })) if (!known(x)) missing.push(k);
  if (!known(revenue) || revenue < 0) missing.push('revenue');
  const dr = debtRatio(debt, marketValue, bookEquity), is = illicitShare(illicit, revenue);
  if (dr == null && !missing.length) missing.push('marketValue'); // market value and book value both <= 0: bad data
  // Unknown book equity leaves R2 unknown: a larger book value could lower the ratio below 30%.
  if (dr != null && dr > DEBT_MAX + EPS) failed.push('R2');
  // A cautious estimate is an upper bound: below 5% it proves a pass; above, the true figure is unknown.
  if (is != null && is > ILLICIT_MAX + EPS) { if (illicitEstimated) missing.push('illicit'); else failed.push('R3') }
  const numbers = { debtRatio: dr, illicitShare: is, purificationPerShare: purificationPerShare(illicit, shares), illicitEstimated: !!illicitEstimated };
  let state;
  if (failed.length) state = 'غير جائز';
  else if (missing.length || activity === 'review') state = 'ما ينحكم';
  else if (debt === 0 && illicit === 0 && !illicitEstimated) state = 'حلال (نقي)';
  else state = 'مختلط جائز';
  return { state, failed, missing, numbers };
}

// Fund, the owner's proportional rule (A5), not Al Rajhi's: non-compliant weight below 5% passes.
// Weights are fractions of the fund. Unlisted weight, unknown states and bad weights count as unknown.
const PASSING = new Set(['حلال (نقي)', 'مختلط جائز']);
// listedTotal: the listed weights with their sign (fundSummary; a swap can be worth less than nothing), for the 100.5%
// check and the unlisted rest; by default the sum of the weights given.
export function fundVerdict(holdings, listedTotal) {
  let badWeight = 0, unknownWeight = 0, listed = 0, purificationPct = 0, purificationUnknownWeight = 0, invalid = false;
  for (const h of holdings) {
    if (!known(h.weight) || h.weight < 0 || h.weight > 1) { invalid = true; continue; }
    listed += h.weight;
    if (h.state === 'غير جائز') badWeight += h.weight;
    else if (!PASSING.has(h.state)) unknownWeight += h.weight;
    if (amount(h.illicit) && known(h.marketValue) && h.marketValue > 0) purificationPct += h.weight * h.illicit / h.marketValue;
    else purificationUnknownWeight += h.weight;
  }
  const total = known(listedTotal) ? listedTotal : listed;
  if (total > 1 + 0.005) invalid = true;
  unknownWeight += Math.max(0, 1 - total);
  purificationUnknownWeight += Math.max(0, 1 - total);
  const state = invalid ? 'ما ينحكم' : badWeight >= ILLICIT_MAX - EPS ? 'غير جائز'
    : badWeight + unknownWeight >= ILLICIT_MAX - EPS ? 'ما ينحكم' : 'مختلط جائز';
  return { state, badWeight, unknownWeight, purificationPct, purificationUnknownWeight };
}

// The interest income purification is paid on: the figure that decided R3 — the higher reading when it passes (the
// cautious figure), the exact one when it fails — and none while R3 is open, because a loose bound is no amount to pay
// (audit 2026-11-22: Ford's loan book at the lending rate came to 40% of the holding a quarter). R3 does not depend on
// the market value, so a fund holding's band gives the same answer at both ends.
export function purificationIllicit(r) {
  if (r?.illicitOpen || !amount(r?.illicit)) return null
  const high = Math.max(r.illicit, r.illicitHigh ?? 0), hi = illicitShare(high, r.revenue), lo = illicitShare(r.illicit, r.revenue)
  if (hi != null && hi <= ILLICIT_MAX + EPS) return high
  if (!r.illicitEstimated && lo != null && lo > ILLICIT_MAX + EPS) return r.illicit
  return null
}

// R1 from the SEC industry (SIC) code and the reviewed table data/shariah/sic-activity.json; a company listed there by CIK
// takes its own entry (SEC files Brown-Forman's whiskey under 2080 Beverages with Coca-Cola: audit 2026-11-22).
export function activityFromSic(sic, table, cik = null) {
  const own = cik != null ? table.companies?.[cik] : null;
  if (own) return own[0];
  const n = Number(sic);
  if (sic == null || sic === '' || !Number.isInteger(n)) return null;
  const hit = list => list.some(([a, b]) => n >= a && n <= b);
  return hit(table.fail) ? 'fail' : hit(table.review) ? 'review' : 'ok';
}

// One stock from its SEC inputs (engine/sec-facts.js) and a market value (the quarter-average price x shares on the page;
// a band around the fund report's price for fund holdings). When the debt figure is incomplete, total liabilities minus
// leases bound it from above: that bound can prove a pass (30% even counting all of it), never a fail.
export function screenStock(r, marketValue, sicTable) {
  // A prohibited activity needs no numbers (banks whose statements we cannot read are still غير جائز)
  if (!r?.period) return r && activityFromSic(r.sic, sicTable, r.cik) === 'fail'
    ? { state: 'غير جائز', failed: ['R1'], missing: [], numbers: {}, debtUpper: false, activity: 'fail', marketValue } : null
  let debt = r.debt, debtUpper = false, debtRange = null, open = false
  if (debt == null && r.debtUpperBound > 0 && marketValue > 0) {
    const dr = debtRatio(r.debtUpperBound, marketValue, r.bookEquity ?? 0)
    if (dr != null && dr <= DEBT_MAX + EPS) { debt = r.debtUpperBound; debtUpper = true }
  }
  // Two readings of the debt when lines may be the same money (engine/sec-facts.js): a pass needs the higher one under
  // 30%, a fail the lower one above it; in between the debt test is open (audit 2026-11-22).
  if (debt != null && r.debtHigh > debt) {
    const lo = debtRatio(debt, marketValue, r.bookEquity), hi = debtRatio(r.debtHigh, marketValue, r.bookEquity)
    if (lo != null && hi != null) debtRange = [lo, hi]
    if (hi != null && hi <= DEBT_MAX + EPS) debt = r.debtHigh
    else if (lo != null && !(lo > DEBT_MAX + EPS)) { debt = null; open = true }
  }
  // Interest readings the same way: a pass needs the higher one under 5%, a fail the exact lower one above it; a lender
  // whose loan interest no tag shows has no higher reading and cannot pass (engine/sec-facts.js, audit 2026-11-22)
  let illicit = r.illicit, illOpen = false
  if (known(r.illicit) && (r.illicitOpen || r.illicitHigh > r.illicit)) {
    const hi = r.illicitOpen ? Infinity : illicitShare(r.illicitHigh, r.revenue), lo = illicitShare(r.illicit, r.revenue)
    if (hi != null && hi <= ILLICIT_MAX + EPS) illicit = r.illicitHigh
    else if (r.illicitEstimated || !(lo > ILLICIT_MAX + EPS)) { illicit = null; illOpen = true }
  }
  const activity = activityFromSic(r.sic, sicTable, r.cik)
  const v = shariahVerdict({ activity, debt, marketValue, bookEquity: r.bookEquity, illicit, illicitEstimated: r.illicitEstimated, revenue: r.revenue, shares: r.shares })
  if (open) v.missing = v.missing.map(x => (x === 'debt' ? 'debtRange' : x))
  if (illOpen) v.missing = v.missing.map(x => (x === 'illicit' ? 'illicitRange' : x))
  v.numbers.purificationPerShare = purificationPerShare(purificationIllicit(r), r.shares)
  return { ...v, debtUpper, debtRange, activity, marketValue }
}
