// Apply PROTOCOL-us.md §2 as amended by addenda 2–3 (stage 1) → data/us/universe.json.
//   node scripts/us-universe.js       (after scripts/us-ingest.js has stored the bars)

import fs from 'node:fs'
import zlib from 'node:zlib'

import { ETFS } from './us-universe-lists.js'

const page = JSON.parse(fs.readFileSync('data/us/screener-page1.json', 'utf8'))
const file = (s) => `data/us/bars/${s.replace(':', '_')}.json.gz`
const load = (s) => JSON.parse(zlib.gunzipSync(fs.readFileSync(file(s))).toString('utf8'))
const steps = { page: page.rows.length }
const excluded = []
const drop = (x, why) => (excluded.push({ symbol: x.symbol, why }), false)

// 1. listing
let r = page.rows.filter((x) => /^(NYSE|NASDAQ|AMEX):[A-Z.]+$/.test(x.symbol))
steps.listing = r.length

// 2. alternate issues: identical market cap shared with another row → all dropped
const capCount = new Map()
for (const x of r) capCount.set(x.market_cap_basic, (capCount.get(x.market_cap_basic) ?? 0) + 1)
r = r.filter((x) => capCount.get(x.market_cap_basic) === 1 || drop(x, 'shares an identical market cap (alternate issue)'))
steps.alternateIssues = r.length

// 6. history
r = r.filter((x) => {
  if (!fs.existsSync(file(x.symbol))) return drop(x, 'not stored (history returned inline / short listing)')
  return true
})
const bars = new Map(r.map((x) => [x.symbol, load(x.symbol)]))
r = r.filter((x) => bars.get(x.symbol).close.length >= 300 || drop(x, `too new (${bars.get(x.symbol).close.length} bars)`))
steps.history = r.length

// 3. fixed-income screen: annualised vol of the last 504 sessions < 8%
const rets = (s, n) => {
  const c = s.close.slice(-n - 1)
  return c.slice(1).map((v, i) => Math.log(v / c[i]))
}
const sd = (a) => {
  const m = a.reduce((p, q) => p + q, 0) / a.length
  return Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / (a.length - 1))
}
r = r.filter((x) => {
  const vol = sd(rets(bars.get(x.symbol), 504)) * Math.sqrt(252)
  return vol >= 0.08 || drop(x, `fixed-income-like (vol ${(100 * vol).toFixed(1)}%)`)
})
steps.fixedIncome = r.length

// 4. one class per issuer: return correlation ≥ 0.98 over the last 500 common sessions
const series = new Map(r.map((x) => {
  const s = bars.get(x.symbol)
  const m = new Map()
  for (let i = 1; i < s.close.length; i += 1) m.set(s.date[i], Math.log(s.close[i] / s.close[i - 1]))
  return [x.symbol, m]
}))
function corr(a, b) {
  const da = [...series.get(a).keys()].filter((d) => series.get(b).has(d)).slice(-500)
  if (da.length < 100) return 0
  const xa = da.map((d) => series.get(a).get(d))
  const xb = da.map((d) => series.get(b).get(d))
  const ma = xa.reduce((p, q) => p + q, 0) / xa.length
  const mb = xb.reduce((p, q) => p + q, 0) / xb.length
  let sab = 0, saa = 0, sbb = 0
  for (let i = 0; i < xa.length; i += 1) {
    sab += (xa[i] - ma) * (xb[i] - mb); saa += (xa[i] - ma) ** 2; sbb += (xb[i] - mb) ** 2
  }
  return sab / Math.sqrt(saa * sbb)
}
const gone = new Set()
const vol10 = (x) => x.average_volume_10d_calc ?? 0
for (let i = 0; i < r.length; i += 1) {
  for (let j = i + 1; j < r.length; j += 1) {
    if (gone.has(r[i].symbol) || gone.has(r[j].symbol)) continue
    const c = corr(r[i].symbol, r[j].symbol)
    if (c >= 0.98) {
      const [keep, lose] = vol10(r[i]) >= vol10(r[j]) ? [r[i], r[j]] : [r[j], r[i]]
      gone.add(lose.symbol)
      excluded.push({ symbol: lose.symbol, why: `share class of ${keep.symbol} (corr ${c.toFixed(3)})` })
    }
  }
}
r = r.filter((x) => !gone.has(x.symbol))
steps.oneClass = r.length

r.sort((a, b) => b.market_cap_basic - a.market_cap_basic)
const etfSyms = new Set(ETFS.map(([s]) => s))
const etfs = ETFS.filter(([s]) => fs.existsSync(file(s)) || drop({ symbol: s }, 'ETF not stored'))
const symbols = [
  ...etfs.map(([symbol, name]) => ({ symbol, name: `${name} ETF`, group: 'etf', sector: 'ETF', industry: name, stage: 1 })),
  ...r.filter((x) => !etfSyms.has(x.symbol)).map((x) => ({
    symbol: x.symbol, name: x.symbol.split(':')[1], group: 'stock', sector: x.sector, industry: x.industry,
    cap: Math.round(x.market_cap_basic), stage: 1,
  })),
]
fs.writeFileSync('data/us/universe.json', JSON.stringify({ rule: 'PROTOCOL-us.md §2 + addenda 2–3, stage 1', steps, count: symbols.length, excluded, symbols }, null, 1))
console.log(steps, 'universe', symbols.length)
const sectors = {}
for (const x of symbols) sectors[x.sector] = (sectors[x.sector] ?? 0) + 1
console.log(Object.entries(sectors).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${String(v).padStart(4)} ${k}`).join('\n'))
console.log('\nexcluded:\n' + excluded.map((e) => `  ${e.symbol}: ${e.why}`).join('\n'))
