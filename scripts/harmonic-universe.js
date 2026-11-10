// Build data/harmonic/universe.json from one TradingView screener snapshot.
//
//   node scripts/harmonic-universe.js <screener-response.json>
//
// Every rule here is mechanical and is stated in PROTOCOL-harmonic.md §2. Nothing is
// hand-picked except the four symbols the user named (RKLB, BE, HIMS, BTC) and the index
// ETFs, which are listed explicitly below rather than chosen by a rule.
import fs from 'node:fs'

const src = process.argv[2]
if (!src) throw new Error('usage: harmonic-universe.js <screener-response.json>')
const rows = JSON.parse(fs.readFileSync(src, 'utf8')).data.rows

// 1. Primary US common listings only. OTC drops foreign ordinaries (ASMLF, TCTZF, ...);
//    the name/description filters drop preferred and depositary shares, which carry the
//    issuer's whole market cap in this screener and would otherwise crowd out real companies.
const isCommon = (r) =>
  (r.exchange === 'NASDAQ' || r.exchange === 'NYSE') &&
  !r.name.includes('/') &&
  !/depositary|preferred|mandatory convertible/i.test(r.description)

// 2. One listing per issuer. In this screener every share class of one issuer reports the
//    SAME market_cap_basic to the dollar (GOOG/GOOGL = 4145076335693, BRK.A/BRK.B =
//    1138886007729), so the rounded cap is the issuer key. Keep the most liquid class.
const byIssuer = new Map()
for (const r of rows.filter(isCommon)) {
  const key = Math.round(r.market_cap_basic)
  const prev = byIssuer.get(key)
  if (!prev || (r.average_volume_10d_calc ?? 0) > (prev.average_volume_10d_calc ?? 0)) byIssuer.set(key, r)
}
const clean = [...byIssuer.values()].sort((a, b) => b.market_cap_basic - a.market_cap_basic)

const pick = (r, group) => ({
  symbol: r.symbol,
  name: r.name,
  description: r.description,
  sector: r.sector,
  marketCap: Math.round(r.market_cap_basic),
  group,
})

// 3. Group A — the twenty largest.
const A = clean.slice(0, 20).map((r) => pick(r, 'top20'))

// 4. Group B — sector diversification: the largest listing in every sector the top twenty
//    does not already cover. The user asked not to have the test be mega-cap tech only.
const covered = new Set(A.map((r) => r.sector))
const B = []
for (const r of clean) {
  if (covered.has(r.sector)) continue
  covered.add(r.sector)
  B.push(pick(r, 'sector'))
}

// 5. Groups C, D, E — named by the user, plus the index ETFs they said were welcome.
const C = [
  { symbol: 'NASDAQ:RKLB', name: 'RKLB', description: 'Rocket Lab Corporation', sector: 'Electronic Technology', group: 'named' },
  { symbol: 'NYSE:BE', name: 'BE', description: 'Bloom Energy Corporation', sector: 'Producer Manufacturing', group: 'named' },
  { symbol: 'NYSE:HIMS', name: 'HIMS', description: 'Hims & Hers Health, Inc.', sector: 'Health Services', group: 'named' },
]
const D = [
  { symbol: 'BINANCE:BTCUSDT', name: 'BTCUSDT', description: 'Bitcoin / TetherUS', sector: 'Crypto', group: 'crypto' },
  { symbol: 'BITSTAMP:BTCUSD', name: 'BTCUSD', description: 'Bitcoin / U.S. Dollar (long history)', sector: 'Crypto', group: 'crypto' },
]
const E = [
  { symbol: 'AMEX:SPY', name: 'SPY', description: 'SPDR S&P 500 ETF Trust', sector: 'Index ETF', group: 'index' },
  { symbol: 'NASDAQ:QQQ', name: 'QQQ', description: 'Invesco QQQ Trust', sector: 'Index ETF', group: 'index' },
  { symbol: 'AMEX:IWM', name: 'IWM', description: 'iShares Russell 2000 ETF', sector: 'Index ETF', group: 'index' },
  { symbol: 'AMEX:DIA', name: 'DIA', description: 'SPDR Dow Jones Industrial Average ETF', sector: 'Index ETF', group: 'index' },
]

const seen = new Set()
const symbols = [...A, ...B, ...C, ...D, ...E].filter((s) => !seen.has(s.symbol) && seen.add(s.symbol))

const out = {
  takenAt: '2026-10-18',
  source: 'TradingView screener: market america, symbol_types [stock], market_cap_basic >= 50e9, sorted by market cap desc, limit 300 (534 matched)',
  rules: 'PROTOCOL-harmonic.md §2',
  counts: { top20: A.length, sector: B.length, named: C.length, crypto: D.length, index: E.length, total: symbols.length },
  symbols,
}
fs.mkdirSync('data/harmonic', { recursive: true })
fs.writeFileSync('data/harmonic/universe.json', `${JSON.stringify(out, null, 2)}\n`)

console.log(`${symbols.length} symbols`)
for (const s of symbols) {
  const cap = s.marketCap ? `$${(s.marketCap / 1e9).toFixed(0)}B` : ''
  console.log(`  ${s.group.padEnd(7)} ${s.symbol.padEnd(18)} ${s.sector.padEnd(24)} ${cap}`)
}
