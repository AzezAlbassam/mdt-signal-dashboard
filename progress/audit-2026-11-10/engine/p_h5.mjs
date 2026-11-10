import { E, load, files } from './lib.mjs'
let n = 0, hit = 0; const by = {}
for (const f of files()) {
  const d = load(f); if (!d || !d.fq || d.type !== 'stock' || d.sector === 'Finance') continue
  const funds = E.parseFundamentals(d.fin); const t = E.ttmFromQuarters(d.fq).at(-1); if (!t || t.ni == null || t.fcf == null) continue
  n++
  const avgNi = funds.slice(-3).reduce((a, x) => a + (x.ni ?? 0), 0)
  if (t.ni > 0 && avgNi > 0 && t.fcf < 0) { hit++; by[d.sector] = (by[d.sector] ?? 0) + 1 }
}
console.log(`non-financial stocks with saved quarters: ${n}; profitable now and over the last 3 fiscal years, free cash flow negative: ${hit} (${(100 * hit / n).toFixed(0)}%)`, by)
