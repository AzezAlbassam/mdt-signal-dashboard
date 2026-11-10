// Target operating margins for the revenue DCF (engine/rdcf.js): per TradingView industry, the
// median operating margin (oper_income_ttm ÷ total_revenue_ttm) of US-listed companies with at
// least $1B of revenue and an operating profit — the survivors a young company would have to
// become. Share classes (same industry, revenue and operating income) count once. Groups with
// fewer than 5 companies are left out; the page then falls back to the sector, then 10%.
//   node scripts/build-peer-margins.js data/peer/2026-10-21.json   → pages/peer-margins.json
import fs from 'node:fs'

const src = process.argv[2] ?? 'data/peer/2026-10-21.json'
const { asOf, rows } = JSON.parse(fs.readFileSync(src, 'utf8'))
const seen = new Set()
const ok = rows.filter((r) => {
  if (!(r.total_revenue_ttm >= 1e9 && r.oper_income_ttm > 0 && r.industry && r.sector)) return false
  const k = `${r.industry}|${r.total_revenue_ttm}|${r.oper_income_ttm}`
  if (seen.has(k)) return false
  seen.add(k)
  return true
})
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const groups = (key) => {
  const by = {}
  for (const r of ok) (by[r[key]] ??= []).push(r.oper_income_ttm / r.total_revenue_ttm)
  return Object.fromEntries(Object.entries(by).filter(([, ms]) => ms.length >= 5).sort().map(([k, ms]) => [k, { m: Math.round(median(ms) * 1e4) / 1e4, n: ms.length }]))
}
const out = { asOf, companies: ok.length, industries: groups('industry'), sectors: groups('sector') }
fs.writeFileSync('pages/peer-margins.json', JSON.stringify(out))
console.log(`pages/peer-margins.json: ${ok.length} companies, ${Object.keys(out.industries).length} industries, ${Object.keys(out.sectors).length} sectors`)
