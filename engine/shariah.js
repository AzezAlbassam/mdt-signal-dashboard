// Shariah screen, Al Rajhi Capital method (progress/SHARIAH-PLAN.md parts A, M). Pure functions, no I/O.
const DEBT_MAX = 0.30, ILLICIT_MAX = 0.05, EPS = 1e-12;
const known = x => typeof x === 'number' && Number.isFinite(x);

// R2: interest-bearing debt / market value, or book equity when market value is below it.
export function debtRatio(debt, marketValue, bookEquity) {
  if (!known(debt) || !known(marketValue) || !known(bookEquity)) return null;
  const denom = marketValue < bookEquity ? bookEquity : marketValue;
  return denom > 0 ? debt / denom : null;
}

// R3: illicit revenue / total revenue. No revenue: any illicit income fails (Infinity), none passes.
export function illicitShare(illicit, revenue) {
  if (!known(illicit) || !known(revenue)) return null;
  if (revenue <= 0) return illicit > 0 ? Infinity : 0;
  return illicit / revenue;
}

// R6: owed whether the company made a profit or not.
export function purificationPerShare(illicit, shares) {
  return known(illicit) && known(shares) && shares > 0 ? illicit / shares : null;
}

// A8: cautious estimate of undisclosed interest income.
export function estimateInterest({ cashStart, cashEnd, yieldPct, days }) {
  if (![cashStart, cashEnd, yieldPct, days].every(known)) return null;
  return (cashStart + cashEnd) / 2 * yieldPct / 100 * days / 365;
}

export function verdict({ activity, debt, marketValue, bookEquity, illicit, illicitEstimated, revenue, shares }) {
  const missing = [], failed = [];
  if (activity === 'fail') failed.push('R1');
  else if (activity !== 'ok' && activity !== 'review') missing.push('activity'); // anything unexpected is unknown
  for (const [k, x] of Object.entries({ debt, marketValue, bookEquity, illicit, revenue })) if (!known(x)) missing.push(k);
  const dr = debtRatio(debt, marketValue, bookEquity), is = illicitShare(illicit, revenue);
  // Unknown book equity leaves R2 unknown: a larger book value could lower the ratio below 30%.
  if (dr != null && dr > DEBT_MAX + EPS) failed.push('R2');
  if (is != null && is > ILLICIT_MAX + EPS) failed.push('R3');
  const numbers = { debtRatio: dr, illicitShare: is, purificationPerShare: purificationPerShare(illicit, shares), illicitEstimated: !!illicitEstimated };
  let state;
  if (failed.length) state = 'غير جائز';
  else if (missing.length || activity === 'review') state = 'ما ينحكم';
  else if (debt === 0 && illicit === 0 && !illicitEstimated) state = 'حلال (نقي)';
  else state = 'مختلط جائز';
  return { state, failed, missing, numbers };
}

// Fund, the owner's proportional rule (A5), not Al Rajhi's: non-compliant weight below 5% passes.
export function fundVerdict(holdings) {
  let badWeight = 0, unknownWeight = 0, purificationPct = 0;
  for (const h of holdings) {
    if (h.state === 'غير جائز') badWeight += h.weight;
    if (h.state === 'ما ينحكم') unknownWeight += h.weight;
    if (known(h.illicit) && known(h.marketValue) && h.marketValue > 0) purificationPct += h.weight * h.illicit / h.marketValue;
  }
  const state = badWeight >= ILLICIT_MAX - EPS ? 'غير جائز' : badWeight + unknownWeight >= ILLICIT_MAX - EPS ? 'ما ينحكم' : 'مختلط جائز';
  return { state, badWeight, unknownWeight, purificationPct };
}
