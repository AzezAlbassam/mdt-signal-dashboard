// Fund look-through (progress/SHARIAH-PLAN.md part E): holdings from the fund's N-PORT report, each matched to its SEC
// company and screened with Al Rajhi's stock rules; the fund verdict is the OWNER's proportional rule (fundVerdict).
import { screenStock, fundVerdict } from './shariah.js'

const SUFFIX = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COS|COMPANY|COMPANIES|LTD|LIMITED|PLC|PL|NV|SA|AG|SE|LLC|LP|HOLDINGS?|GROUP|THE|CLASS [A-Z]|CL [A-Z]|COM|NEW|ADR|SPONSORED|ORD|SHS|REG)\b/g
export function normName(s) {
  return String(s ?? '').toUpperCase().replace(/&/g, ' AND ').replace(/'/g, '')
    .replace(/\/[A-Z]{2,3}\/?/g, ' ')          // SEC state suffixes: CORNING INC /NY, TJX COMPANIES INC /DE/
    .replace(/[^A-Z0-9 ]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim()
}
// The second key drops spaces: "Exxon Mobil Corp" and "ExxonMobil Holdings Corp" are the same company.
export const nameKeys = (s) => { const k = normName(s); return k ? [k, k.replace(/ /g, '')] : [] }

// companies: [{cik, ticker, title}] (SEC company_tickers.json); seed: [{isin, ticker}] from funds that report tickers.
export function buildMaps(companies, seed = []) {
  const byTicker = new Map(), byName = new Map(), byIsin = new Map()
  for (const c of companies) {
    byTicker.set(c.ticker, c.cik)
    for (const k of nameKeys(c.title)) { if (!byName.has(k)) byName.set(k, new Set()); byName.get(k).add(c.cik) }
  }
  for (const s of seed) if (s.isin && byTicker.has(s.ticker)) byIsin.set(s.isin, byTicker.get(s.ticker))
  return { byTicker, byName, byIsin }
}

export function mapHolding(h, { byTicker, byName, byIsin }) {
  if (h.ticker && byTicker.has(h.ticker)) return { cik: byTicker.get(h.ticker), by: 'ticker' }
  if (h.isin && byIsin.has(h.isin)) return { cik: byIsin.get(h.isin), by: 'isin' }
  for (const k of nameKeys(h.name)) { const s = byName.get(k); if (s?.size === 1) return { cik: [...s][0], by: 'name' } }
  return { cik: null, by: null }
}

const DEBT = new Set(['DBT', 'LON', 'ABS-MBS', 'ABS-O', 'ABS-CBDO', 'ABS-APCP', 'SN'])
const DERIV = new Set(['DE', 'DIR', 'DFE', 'DCR', 'DCO', 'DO'])
export function holdingKind(h) {
  if (h.collateral) return 'collateral'                     // cash collateral from lending the fund's shares
  if (h.asset === 'EC') return 'equity'
  if (h.asset === 'STIV') return 'cash-fund'                // money-market fund: interest-bearing
  if (DEBT.has(h.asset)) return 'debt'                       // bonds, bills, loans: interest-bearing
  if (DERIV.has(h.asset)) return 'derivative'
  return 'other'                                             // preferred shares, real estate, unclassified
}

// The report's price (value / shares held) is a point, not the quarter average Al Rajhi uses, so the debt test must
// agree from 20% below to 25% above it; otherwise the holding is not judged.
const LOW = 0.8, HIGH = 1.25
export function screenHolding(r, price, sicTable) {
  if (!r?.period) return { state: 'ما ينحكم', missing: ['statements'], purification: null }
  const shares = r.sharesMV ?? r.shares
  if (!(price > 0 && shares > 0)) { const v = screenStock(r, null, sicTable); return { ...v, purification: null } }
  const mv = price * shares
  const point = screenStock(r, mv, sicTable), lo = screenStock(r, mv * LOW, sicTable), hi = screenStock(r, mv * HIGH, sicTable)
  const purification = r.illicit >= 0 && mv > 0 ? r.illicit / mv : null
  if (lo.state !== hi.state) return { ...point, state: 'ما ينحكم', missing: [...point.missing, 'priceBand'], band: true, purification }
  return { ...point, state: lo.state, failed: lo.failed, missing: lo.missing, band: false, purification }
}

// rows: [{w (fraction of net assets; negative for some derivatives), kind, state, purification}]
export function fundSummary(rows) {
  let collateralWeight = 0
  const judged = []
  for (const r of rows) {
    const w = Math.abs(r.w ?? NaN)
    if (r.kind === 'collateral') { collateralWeight += Number.isFinite(w) ? w : 0; continue }
    const state = r.kind === 'equity' ? r.state : r.kind === 'cash-fund' || r.kind === 'debt' ? 'غير جائز' : 'ما ينحكم'
    judged.push({ weight: w, state, illicit: r.kind === 'equity' ? r.purification : null, marketValue: 1 })
  }
  return { ...fundVerdict(judged), collateralWeight }
}
