// profileOf: any stock with EPS (twelve months) ≤ 0 outside Finance is "Unprofitable growth" → 100% own-history P/S.
import { E, load, files, median } from './lib.mjs'
const rows = []; const heavyLoss = []; const techSlow = []
for (const f of files()) {
  const d = load(f); if (!d || d.month < '2026-09' || d.type !== 'stock') continue
  const funds = E.parseFundamentals(d.fin); const ttm = d.fq ? E.ttmFromQuarters(d.fq) : null
  const live = E.liveContext(funds, ttm, d.month, null)
  const fv = E.fairValuesAt(funds, d.closes, d.sector, d.month, live); if (!fv) continue
  const st = live.state(d.month)
  if (fv.profile === 'Unprofitable growth') {
    const last5 = funds.slice(-5); const profYears = last5.filter((x) => x.ni > 0).length
    rows.push({ sym: d.sym, profYears, n5: last5.length, revG: st.revG, ps: fv.values.ps ? fv.values.ps / fv.close : null, sector: d.sector })
  }
  if (fv.profile === 'Growth / tech' && E.TECH_SECTORS.includes(d.sector) && !(st.revG > 0.15)) techSlow.push(d.sym)
}
const was = rows.filter((r) => r.profYears >= 3)
const shrinking = rows.filter((r) => r.revG != null && r.revG <= 0.05)
console.log(`"Unprofitable growth": ${rows.length}; profitable in at least 3 of the last 5 fiscal years: ${was.length}; revenue growth (3y) at or under 5% a year: ${shrinking.length}`)
console.log(`  own-history P/S value ÷ price, median: all ${median(rows.filter((r) => r.ps).map((r) => r.ps)).toFixed(2)}; formerly profitable ${median(was.filter((r) => r.ps).map((r) => r.ps)).toFixed(2)} (n=${was.filter((r) => r.ps).length}); above 1.5× the price: ${was.filter((r) => r.ps > 1.5).length}`)
console.log('  e.g.', was.slice(0, 14).map((r) => `${r.sym.split(':')[1]} ${r.profYears}/${r.n5} ${r.ps?.toFixed(2)}`).join(', '))
console.log(`tech-sector stocks classed Growth with 3-year revenue growth ≤ 15%: ${techSlow.length}`)
