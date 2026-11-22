// Fund look-through (progress/SHARIAH-PLAN.md part E): holdings from the fund's N-PORT report, each matched to its SEC
// company and screened with Al Rajhi's stock rules; the fund verdict is the OWNER's proportional rule (fundVerdict).
import { screenStock, fundVerdict, purificationIllicit } from './shariah.js'

// GROUP stays: "Compass Group PLC" (the UK caterer) is not "Compass, Inc." (review 2026-11-22).
// Foreign legal forms too (Nokia Oyj, Merck KGaA, Equinor ASA, Eni SpA; audit 2026-11-22), and "public limited company".
const SUFFIX = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COS|COMPANY|COMPANIES|LTD|LIMITED|PLC|PL|NV|SA|AG|SE|LLC|LP|OYJ|KGAA|ASA|SPA|HOLDINGS?|THE|CLASS [A-Z]|CL [A-Z]|COM|NEW|ADR|SPONSORED|ORD|SHS|REG)\b/g
// a place or a state after the legal form: "ENERGY FUELS INC/CANADA", "TJX COS INC/THE", "US BANCORP /DE/"
const QUALIFIER = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COS|COMPANY|COMPANIES|LTD|LIMITED|PLC|LLC|LP|NV|SA|AG|SE|BANCORP)\.?\/.*$/
export function normName(s) {
  return String(s ?? '').toUpperCase().replace(/&/g, ' AND ').replace(/'/g, '')
    .replace(/\\/g, '/').replace(/\s*\/\s*/g, '/')                 // SEC also writes "US BANCORP \DE\" and "CORP. / DE"
    .replace(/\b(?:N\.V|S\.A|A\.G|S\.E|L\.P|P\.L\.C|L\.L\.C|S\.P\.A)\.?(?![A-Z0-9])/g, (m) => m.replace(/\./g, '')) // N.V. = NV
    .replace(QUALIFIER, '$1')
    .replace(/\/[A-Z]{2,3}(?=\/|$)\/?/g, ' ')    // a state suffix at the end: CORNING INC /NY (not "/Los Angeles CA")
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\bPUBLIC (LTD|LIMITED)( CO| COMPANY)?\b/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim()
}
// the US state after the legal form, when there is one: "INDEPENDENT BANK CORP /MI/" (IBCP) is not "INDEPENDENT BANK CORP" (INDB)
const stateOf = (s) => String(s ?? '').toUpperCase().replace(/\\/g, '/').match(/\/\s*([A-Z]{2})\s*\/?\s*$/)?.[1] ?? null
// The second key drops spaces: "Exxon Mobil Corp" and "ExxonMobil Holdings Corp" are the same company.
// The third key sorts the words: SEC writes "SCHWAB CHARLES CORP", funds write "Charles Schwab Corp". A key that two
// companies share is never used (mapHolding needs a unique match).
export const nameKeys = (s) => { const k = normName(s), st = stateOf(s); return k ? [k, k.replace(/ /g, ''), k.split(' ').sort().join(' '), ...(st ? [`${k} /${st}`] : [])] : [] }

// A reported ticker or an ISIN seed counts for a US holding, or when the SEC title and the holding's name agree (a name
// key in common): funds abroad report home-market tickers, and Zurich's "ROP" (Roche) is Roper Technologies at SEC
// (review 2026-11-22). One shared word was not enough: Xetra's MRK (Merck KGaA) is Merck & Co. (audit 2026-11-22).
function agrees(h, title) {
  if (h.country === 'US') return true
  const b = new Set(nameKeys(title))
  return nameKeys(h.name).some((k) => b.has(k))
}

// companies: [{cik, ticker, title}] (SEC company_tickers.json); seed: [{isin, ticker, name, country}] from funds that
// report tickers.
export function buildMaps(companies, seed = []) {
  const byTicker = new Map(), byName = new Map(), byIsin = new Map(), titleOf = new Map()
  for (const c of companies) {
    byTicker.set(c.ticker, c.cik); titleOf.set(c.cik, c.title)
    for (const k of nameKeys(c.title)) { if (!byName.has(k)) byName.set(k, new Set()); byName.get(k).add(c.cik) }
  }
  for (const s of seed) {
    const cik = byTicker.get(s.ticker)
    if (s.isin && cik && (s.name == null || agrees(s, titleOf.get(cik)))) byIsin.set(s.isin, cik)
  }
  return { byTicker, byName, byIsin, titleOf }
}

export function mapHolding(h, { byTicker, byName, byIsin, titleOf }) {
  const ok = (cik) => cik && agrees(h, titleOf?.get(cik) ?? '')
  if (h.ticker && ok(byTicker.get(h.ticker))) return { cik: byTicker.get(h.ticker), by: 'ticker' }
  if (h.isin && ok(byIsin.get(h.isin))) return { cik: byIsin.get(h.isin), by: 'isin' }
  for (const k of nameKeys(h.name)) { const s = byName.get(k); if (s?.size === 1) return { cik: [...s][0], by: 'name' } }
  return { cik: null, by: null }
}

// A holding's weight: its value over the fund's net assets when both are known (SPRE lists two $0.03 lines at -1.41%),
// else the report's percentage.
export const holdingWeight = (h, netAssets) => (netAssets > 0 && Number.isFinite(h.usd) ? h.usd / netAssets : h.pct / 100)

const DEBT = new Set(['DBT', 'LON', 'ABS-MBS', 'ABS-O', 'ABS-CBDO', 'ABS-APCP', 'SN'])
const DERIV = new Set(['DE', 'DIR', 'DFE', 'DCR', 'DCO', 'DO'])
export function holdingKind(h) {
  if (h.collateral) return 'collateral'                     // cash collateral from lending the fund's shares
  if (h.asset === 'EC') return 'equity'
  // money-market fund: interest-bearing; a spot currency trade filed under the same code is not (audit 2026-11-22)
  if (h.asset === 'STIV') return h.units === 'NC' && /\bFX\b|currenc/i.test(h.name ?? '') ? 'derivative' : 'cash-fund'
  if (DEBT.has(h.asset)) return 'debt'                       // bonds, bills, loans: interest-bearing
  if (DERIV.has(h.asset)) return 'derivative'
  return 'other'                                             // preferred shares, real estate, unclassified
}

// The report's price (value / shares held) is a point, not the quarter average Al Rajhi uses, so the debt test must
// agree from 20% below the lowest report price of the company to 25% above the highest (fund-load.js gives that range:
// the prices dated in the company's own quarter, or all of them when none is); otherwise the holding is not judged.
const LOW = 0.8, HIGH = 1.25
const both = (a, b) => (a.failed ?? []).filter((x) => (b.failed ?? []).includes(x))
const union = (a, b, ...more) => [...new Set([...(a.missing ?? []), ...(b.missing ?? []), ...more.filter(Boolean)])]

// A split (engine/sec-facts.js: splitRatio k, splitWindow [after, until]) puts a report price on the share count's basis
// or not. The saved daily bars (split-adjusted) settle it when they cover the report's date; else the dates: on or before
// the filing the split restated came later, after the restating filing it was done; between, unknown (null).
export function splitBasis({ price, asOf, bar = null, splitRatio = null, splitWindow = null }) {
  if (!(splitRatio > 0) || !(price > 0)) return 'post'
  if (bar > 0) { const q = price / bar; if (Math.abs(q - 1) < 0.15) return 'post'; if (Math.abs(q / splitRatio - 1) < 0.15) return 'pre' }
  if (splitWindow && asOf <= splitWindow[0]) return 'pre'
  if (splitWindow && asOf > splitWindow[1]) return 'post'
  return null
}
// the price on the share count's basis; both candidates when the basis is unknown
export const onShares = (price, basis, k) => (basis === 'pre' ? [price / k] : basis === 'post' || !(k > 0) ? [price] : [Math.min(price, price / k), Math.max(price, price / k)])

// quarter: {avg, n, alt?} = the average daily close over the company's own quarter (as the stock page computes); with 40+
// trading days it replaces the band and the test is exactly Al Rajhi's. alt: the same average on the other side of a
// split, when the bars it came from may predate it. price: the report price on the share basis (purification uses it,
// the price behind the weight); range: [lowest, highest] on that basis for the band.
export function screenHolding(r, price, sicTable, quarter = null, range = null) {
  // no quarter to judge: say why (audit 2026-11-22: one «no statements at SEC» was false for renamed and stale US filers)
  const none = !r ? 'unmatched' : r.error ? 'unreadable' : r.stale ? 'stale' : 'statements'
  if (!r?.period) return screenStock(r, null, sicTable) ? { ...screenStock(r, null, sicTable), purification: null } : { state: 'ما ينحكم', missing: [none], purification: null }
  const shares = r.sharesMV ?? r.shares
  const pmv = shares > 0 ? (price > 0 ? price : quarter?.avg > 0 ? quarter.avg : NaN) * shares : NaN
  const ill = purificationIllicit(r), purification = ill != null && pmv > 0 ? ill / pmv : null
  const judge = (lo, hi, extra) => (lo.state !== hi.state
    ? { ...lo, state: 'ما ينحكم', failed: both(lo, hi), missing: union(lo, hi, extra) }
    : { ...lo, failed: both(lo, hi), missing: union(lo, hi) })
  if (quarter?.avg > 0 && quarter.n >= 40 && shares > 0) {
    const [a, b] = quarter.alt > 0 ? [Math.min(quarter.avg, quarter.alt), Math.max(quarter.avg, quarter.alt)] : [quarter.avg, quarter.avg]
    return { ...judge(screenStock(r, a * shares, sicTable), screenStock(r, b * shares, sicTable), quarter.alt > 0 && 'split'), exact: true, band: false, purification }
  }
  if (!(price > 0 && shares > 0)) { const v = screenStock(r, null, sicTable); return { ...v, purification: null } }
  const [pLo, pHi] = range ?? [price, price]
  const point = screenStock(r, price * shares, sicTable)
  const v = judge(screenStock(r, pLo * shares * LOW, sicTable), screenStock(r, pHi * shares * HIGH, sicTable), 'priceBand')
  return { ...point, state: v.state, failed: v.failed, missing: v.missing, band: v.state === 'ما ينحكم' && v.missing.includes('priceBand'), purification }
}

// rows: [{w (fraction of net assets; negative for some derivatives), kind, state, purification, illicitShare}]
export function fundSummary(rows) {
  let collateralWeight = 0, net = 0, purificationCoveredWeight = 0, illicitLookThrough = 0, illicitCoveredWeight = 0
  const judged = []
  for (const r of rows) {
    const w = Math.abs(r.w ?? NaN)
    if (r.kind === 'collateral') { collateralWeight += Number.isFinite(w) ? w : 0; continue }
    net += r.w ?? NaN                                  // with its sign: a swap can be worth less than nothing (MAGS)
    // a short equity position is not compliant weight, whatever the company (audit 2026-11-22: plan M2 #4)
    const state = r.kind === 'equity' ? (r.w < 0 ? 'ما ينحكم' : r.state) : r.kind === 'cash-fund' || r.kind === 'debt' ? 'غير جائز' : 'ما ينحكم'
    // bills, bonds and money funds carry their own interest as purification (audit 2026-11-22: MAGS)
    const pur = r.kind === 'equity' || r.kind === 'debt' || r.kind === 'cash-fund' ? r.purification : null
    judged.push({ weight: w, state, illicit: pur, marketValue: 1 })
    if (!(r.w > 0)) continue
    if (Number.isFinite(pur)) purificationCoveredWeight += r.w
    if (r.kind === 'equity' && Number.isFinite(r.illicitShare)) { illicitLookThrough += r.w * r.illicitShare; illicitCoveredWeight += r.w }
  }
  return { ...fundVerdict(judged, net), collateralWeight, purificationCoveredWeight, illicitLookThrough, illicitCoveredWeight }
}
