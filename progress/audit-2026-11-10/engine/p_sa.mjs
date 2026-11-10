import fs from 'node:fs'
import { R, E } from './lib.mjs'
// every Tadawul / US stock: FY share count (ni/eps) jumps >10% year over year in the last 6 fiscal years, while price history is adjusted
const dirs = [`${R}/data/sa-all/raw/fin`, `${R}/data/fv-sa/raw/fin`]
const seen = new Set(); let n = 0; const hits = []
for (const d of dirs) for (const f of fs.readdirSync(d)) {
  if (seen.has(f)) continue; seen.add(f)
  const funds = E.parseFundamentals(JSON.parse(fs.readFileSync(`${d}/${f}`))).filter((x) => x.shares > 0).slice(-6)
  if (funds.length < 3) continue
  n++
  const steps = funds.slice(1).map((x, i) => x.shares / funds[i].shares)
  const up = steps.filter((r) => r > 1.1)
  if (up.length) hits.push([f.replace('.json', ''), funds.map((x) => `${x.year}:${(x.shares / 1e6).toFixed(0)}`).join(' ')])
}
console.log(`Tadawul stocks with >=3 FY counts: ${n}; with a >10% count increase in the last 5 steps: ${hits.length}`)
for (const h of hits.slice(0, 25)) console.log(' ', h.join('  '))
