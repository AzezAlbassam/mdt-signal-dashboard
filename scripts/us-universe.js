// Apply PROTOCOL-us.md §2 (as amended by PROTOCOL-addendum-2.md) → data/us/universe.json.
//
//   node scripts/us-universe.js
//
// Stage 1 inputs: data/us/screener-page1.json (the screener page taken before HTTP 429) and
// data/us/classify.jsonl (TradingView search-symbols type/description/logoid per symbol).

import fs from 'node:fs'

export const ETFS = [
  ['AMEX:SPY', 'S&P 500'], ['NASDAQ:QQQ', 'Nasdaq 100'], ['AMEX:IWM', 'Russell 2000'], ['AMEX:DIA', 'Dow Jones'],
  ['AMEX:XLK', 'Technology'], ['AMEX:XLF', 'Financials'], ['AMEX:XLE', 'Energy'], ['AMEX:XLV', 'Health care'],
  ['AMEX:XLI', 'Industrials'], ['AMEX:XLY', 'Consumer discretionary'], ['AMEX:XLP', 'Consumer staples'],
  ['AMEX:XLU', 'Utilities'], ['AMEX:XLB', 'Materials'], ['AMEX:XLRE', 'Real estate'], ['AMEX:XLC', 'Communication'],
  ['AMEX:ITA', 'Aerospace & defense'], ['NASDAQ:UFO', 'Space'], ['NASDAQ:SMH', 'Semiconductors'],
  ['AMEX:XBI', 'Biotech'], ['AMEX:XOP', 'Oil & gas producers'],
]
const NON_COMMON = /Notes|Debentures|Preferred|Depositary Shares|%/i

const page = JSON.parse(fs.readFileSync('data/us/screener-page1.json', 'utf8'))
const meta = new Map(
  fs.readFileSync('data/us/classify.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((x) => [x.symbol, x]),
)

const steps = { page: page.rows.length }
const excluded = []
let r = page.rows.filter((x) => /^(NYSE|NASDAQ|AMEX):[A-Z.]+$/.test(x.symbol))
steps.listedTicker = r.length

r = r.filter((x) => {
  const m = meta.get(x.symbol)
  if (!m || !m.type) return excluded.push({ symbol: x.symbol, why: 'no search-symbols match' }), false
  if (m.type !== 'stock') return excluded.push({ symbol: x.symbol, why: `type ${m.type}`, description: m.description }), false
  if (NON_COMMON.test(m.description ?? '')) return excluded.push({ symbol: x.symbol, why: 'non-common issue', description: m.description }), false
  return true
})
steps.commonUS = r.length

const byIssuer = new Map()
for (const x of r) {
  const key = meta.get(x.symbol).logoid || x.symbol
  const prev = byIssuer.get(key)
  if (!prev || (x.average_volume_10d_calc ?? 0) > (prev.average_volume_10d_calc ?? 0)) byIssuer.set(key, x)
}
r = r.filter((x) => {
  const keep = byIssuer.get(meta.get(x.symbol).logoid || x.symbol) === x
  if (!keep) excluded.push({ symbol: x.symbol, why: `second class of ${byIssuer.get(meta.get(x.symbol).logoid).symbol}` })
  return keep
})
steps.oneClass = r.length

r.sort((a, b) => b.market_cap_basic - a.market_cap_basic)
const etfSyms = new Set(ETFS.map(([s]) => s))
const symbols = [
  ...ETFS.map(([symbol, name]) => ({ symbol, name: `${name} ETF`, group: 'etf', sector: 'ETF', industry: name, stage: 1 })),
  ...r.filter((x) => !etfSyms.has(x.symbol)).map((x) => ({
    symbol: x.symbol, name: meta.get(x.symbol).description, group: 'stock', sector: x.sector, industry: x.industry,
    cap: Math.round(x.market_cap_basic), stage: 1,
  })),
]
fs.writeFileSync('data/us/universe.json', JSON.stringify({ rule: 'PROTOCOL-us.md §2 + PROTOCOL-addendum-2.md stage 1', steps, count: symbols.length, excluded, symbols }, null, 1))
console.log(steps, 'universe', symbols.length)
const sectors = {}
for (const x of symbols) sectors[x.sector] = (sectors[x.sector] ?? 0) + 1
console.log(Object.entries(sectors).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${String(v).padStart(4)} ${k}`).join('\n'))
console.log('excluded:', excluded.map((e) => `${e.symbol} (${e.why})`).join(', '))
