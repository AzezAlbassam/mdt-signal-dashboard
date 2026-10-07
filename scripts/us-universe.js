// Apply PROTOCOL-us.md §2 to the committed screener snapshot → data/us/universe.json.
//
//   node scripts/us-universe.js

import fs from 'node:fs'

const snap = JSON.parse(fs.readFileSync('data/us/universe-snapshot.json', 'utf8'))
const ETFS = [
  ['AMEX:SPY', 'S&P 500'], ['NASDAQ:QQQ', 'Nasdaq 100'], ['AMEX:IWM', 'Russell 2000'], ['AMEX:DIA', 'Dow Jones'],
  ['AMEX:XLK', 'Technology'], ['AMEX:XLF', 'Financials'], ['AMEX:XLE', 'Energy'], ['AMEX:XLV', 'Health care'],
  ['AMEX:XLI', 'Industrials'], ['AMEX:XLY', 'Consumer discretionary'], ['AMEX:XLP', 'Consumer staples'],
  ['AMEX:XLU', 'Utilities'], ['AMEX:XLB', 'Materials'], ['AMEX:XLRE', 'Real estate'], ['AMEX:XLC', 'Communication'],
  ['AMEX:ITA', 'Aerospace & defense'], ['AMEX:UFO', 'Space'], ['NASDAQ:SMH', 'Semiconductors'],
  ['AMEX:XBI', 'Biotech'], ['AMEX:XOP', 'Oil & gas producers'],
]

const rows = snap.rows
const steps = { snapshot: rows.length }
let r = rows.filter((x) => /^(NYSE|NASDAQ|AMEX):[A-Z.]+$/.test(x.symbol))
steps.listedCommon = r.length
if (snap.countryFiltered) steps.countryUS = r.length
else {
  r = r.filter((x) => !x.country || x.country === 'United States')
  steps.countryUS = r.length
}
r = r.filter((x) => x.market_cap_basic >= 2e9)
steps.cap2B = r.length

// One class per company: same description → keep the larger 10-day average volume.
const byName = new Map()
for (const x of r) {
  const key = (x.description || x.symbol).toLowerCase()
  const prev = byName.get(key)
  if (!prev || (x.average_volume_10d_calc ?? 0) > (prev.average_volume_10d_calc ?? 0)) byName.set(key, x)
}
r = r.filter((x) => byName.get((x.description || x.symbol).toLowerCase()) === x)
steps.oneClass = r.length

r.sort((a, b) => b.market_cap_basic - a.market_cap_basic)
const stocks = r.map((x) => ({ symbol: x.symbol, name: x.description || x.symbol.split(':')[1], group: 'stock', sector: x.sector, industry: x.industry, cap: Math.round(x.market_cap_basic) }))
const etfSyms = new Set(ETFS.map(([s]) => s))
const symbols = [...ETFS.map(([symbol, name]) => ({ symbol, name: `${name} ETF`, group: 'etf', sector: 'ETF', industry: name })),
  ...stocks.filter((x) => !etfSyms.has(x.symbol))]
fs.writeFileSync('data/us/universe.json', JSON.stringify({ rule: 'PROTOCOL-us.md §2', snapshot: snap.taken, steps, count: symbols.length, symbols }, null, 1))
console.log(steps, 'universe', symbols.length)
const sectors = {}
for (const x of stocks) sectors[x.sector] = (sectors[x.sector] ?? 0) + 1
console.log(Object.entries(sectors).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join('\n'))
