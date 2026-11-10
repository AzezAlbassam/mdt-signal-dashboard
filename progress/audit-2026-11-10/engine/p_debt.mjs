// A missing total debt is read as zero debt: stateAt (debt ?? 0) for EV, scoreAt part D (f0.debt ?? 0 → d1 = 1, "no debt").
import { E, SC, load, files } from './lib.mjs'
let n = 0, nullFy = 0, nullTtm = 0; const ex = []
for (const f of files()) {
  const d = load(f); if (!d || d.month < '2026-09' || d.type !== 'stock' || d.sector === 'Finance') continue
  const funds = E.parseFundamentals(d.fin); if (!funds.length) continue
  n++
  const last = funds.at(-1)
  const ttm = d.fq ? E.ttmFromQuarters(d.fq) : []
  const t = ttm.at(-1)
  if (last.debt == null) nullFy++
  if (t && t.debt == null) { nullTtm++; const s = SC.scoreAt(funds, d.closes, d.sector, d.month, E.liveContext(funds, ttm, d.month, null)); if (ex.length < 8) ex.push(`${d.sym}: last FY debt ${last.debt}, 12-month debt null → d1 ${s.detail?.d1}, FY debts ${funds.slice(-4).map((x) => x.debt == null ? 'null' : (x.debt / 1e6).toFixed(0) + 'M').join(',')}`) }
}
console.log(`non-financial stocks ${n}: last fiscal year without a debt figure ${nullFy}; newest twelve months without one ${nullTtm}`)
console.log(ex.join('\n'))
// synthetic: identical company, debt 5× EBITDA vs debt missing
const funds = [2021, 2022, 2023, 2024, 2025].map((y, i) => ({ year: y, eps: 1 + 0.1 * i, rev: 100 + 10 * i, ni: 10 + i, fcf: 9 + i, ebitda: 20 + i, debt: 120, shares: 10, gp: 40 + 4 * i }))
const closes = new Map(); for (let k = 0; k < 70; k++) closes.set(E.addMonths('2026-10', -k), 15)
const a = SC.scoreAt(funds, closes, 'Retail Trade', '2026-10', true)
const b = SC.scoreAt(funds.map((f) => ({ ...f, debt: null })), closes, 'Retail Trade', '2026-10', true)
console.log(`debt 120 (5× EBITDA): D=${a.parts.D} total ${a.total.toFixed(2)}; debt missing: D=${b.parts.D} total ${b.total.toFixed(2)}`)
