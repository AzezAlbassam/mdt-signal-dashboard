// Justified P/B (page: bvps × min(4, (ROE − 2.5%) ÷ (9% − 2.5%))) against the price, S&P 500 Finance sector (data/bench, 2026-11-08).
// ROE here = net income TTM ÷ equity (TradingView's return_on_equity is not in this file; it uses average equity).
import fs from 'node:fs'
import { R, median } from './lib.mjs'
import { P } from './page.mjs'
const rows = JSON.parse(fs.readFileSync(`${R}/data/bench/2026-11-08-sp500.json`)).rows.filter((r) => r.sector === 'Finance')
const by = {}
for (const r of rows) {
  const pb = r.price_book_fq; const roe = r.total_equity_fq > 0 ? r.net_income_ttm / r.total_equity_fq : null
  if (!(pb > 0) || roe == null) { (by[r.industry] ??= { n: 0, x: [], none: 0, cap: 0, ex: [] }).none++; continue }
  // the page's own function on a quote built from the row (price 100)
  const q = { close: 100, price_book_fq: pb, return_on_equity: 100 * roe, earnings_per_share_diluted_ttm: 100 / r.price_earnings_ttm, sector: 'Finance', currency: 'USD', description: '', market_cap_basic: r.market_cap_basic, total_shares_outstanding: r.market_cap_basic / 100 }
  const f = P.liveFairValues({ values: { pe: 100 }, profile: 'Financial' }, q, [], null) // P/E method set at the price itself
  const o = (by[r.industry] ??= { n: 0, x: [], none: 0, cap: 0, ex: [] })
  o.n++; o.x.push([f.values.pbj ?? 0, f.fair]); if ((roe - 0.025) / 0.065 > 4) o.cap++
  o.ex.push(`${r.symbol.split(':')[1]} P/B ${pb.toFixed(1)} ROE ${(100 * roe).toFixed(0)}% pbj ${(f.values.pbj ?? 0).toFixed(0)} fair ${f.fair.toFixed(0)}`)
}
console.log('price = 100, P/E method = 100 (neutral). industry: n, median pbj, median blended fair, how many have no pbj (ROE < 2.5% or no book), how many hit the 4× cap')
for (const [k, o] of Object.entries(by).sort((a, b) => b[1].n - a[1].n)) console.log(`${k.padEnd(32)} n=${String(o.n).padStart(2)} pbj ${median(o.x.map((v) => v[0]))?.toFixed(0).padStart(4)}  fair ${median(o.x.map((v) => v[1]))?.toFixed(0).padStart(4)}  none ${o.none} cap ${o.cap}   e.g. ${o.ex.slice(0, 2).join('; ')}`)
const all = Object.values(by).flatMap((o) => o.x)
console.log('all Finance:', all.length, 'median pbj/price', median(all.map((v) => v[0] / 100)).toFixed(2), 'median fair/price with a neutral P/E', median(all.map((v) => v[1] / 100)).toFixed(2), ' pbj < half the price:', all.filter((v) => v[0] < 50).length)
