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
  if (revenue <= 0) return illicit > 0 ? Infinity : 0;
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
  for (const [k, x] of Object.entries({ marketValue, bookEquity, revenue })) if (!known(x)) missing.push(k);
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
export function fundVerdict(holdings) {
  let badWeight = 0, unknownWeight = 0, listed = 0, purificationPct = 0, purificationUnknownWeight = 0, invalid = false;
  for (const h of holdings) {
    if (!known(h.weight) || h.weight < 0 || h.weight > 1) { invalid = true; continue; }
    listed += h.weight;
    if (h.state === 'غير جائز') badWeight += h.weight;
    else if (!PASSING.has(h.state)) unknownWeight += h.weight;
    if (amount(h.illicit) && known(h.marketValue) && h.marketValue > 0) purificationPct += h.weight * h.illicit / h.marketValue;
    else purificationUnknownWeight += h.weight;
  }
  if (listed > 1 + 0.005) invalid = true;
  unknownWeight += Math.max(0, 1 - listed);
  const state = invalid ? 'ما ينحكم' : badWeight >= ILLICIT_MAX - EPS ? 'غير جائز'
    : badWeight + unknownWeight >= ILLICIT_MAX - EPS ? 'ما ينحكم' : 'مختلط جائز';
  return { state, badWeight, unknownWeight, purificationPct, purificationUnknownWeight };
}

// R1 from the SEC industry (SIC) code and the reviewed table data/shariah/sic-activity.json.
export function activityFromSic(sic, table) {
  const n = Number(sic);
  if (sic == null || sic === '' || !Number.isInteger(n)) return null;
  const hit = list => list.some(([a, b]) => n >= a && n <= b);
  return hit(table.fail) ? 'fail' : hit(table.review) ? 'review' : 'ok';
}
