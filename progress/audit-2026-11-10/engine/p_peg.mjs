// Lynch rule (value = EPS × 100 × min(g, 25%), counted when g ≥ 10%): the P/E it implies against the stock's own P/E, Growth / tech profile
import { E, load, files, median } from './lib.mjs'
const rows = []
for (const f of files()) {
  const d = load(f); if (!d || d.month < '2026-09' || d.type !== 'stock') continue
  const funds = E.parseFundamentals(d.fin); const ttm = d.fq ? E.ttmFromQuarters(d.fq) : null
  const live = E.liveContext(funds, ttm, d.month, null)
  const fv = E.fairValuesAt(funds, d.closes, d.sector, d.month, live); if (!fv || fv.profile !== 'Growth / tech') continue
  const st = live.state(d.month); const g = st.epsG ?? st.revG
  const gate = g >= 0.1
  const w = E.WEIGHTS[fv.profile].map((x, i) => (E.METHODS[i] === 'graham' || (E.METHODS[i] === 'peg' && !gate) ? 0 : x))
  const v = { ...fv.values }; if (!gate) v.peg = null
  const withPeg = E.blendTrimmed(v, w); const noPeg = E.blendTrimmed({ ...v, peg: null }, w)
  if (!withPeg) continue
  rows.push({ sym: d.sym, gate, g, pe: fv.close / st.eps, pegPE: v.peg ? v.peg / st.eps : null, a: withPeg.fair / fv.close, b: noPeg ? noPeg.fair / fv.close : null, dropped: withPeg.dropped.includes('peg'), capped: g > 0.25 })
}
const G = rows.filter((r) => r.gate && r.pegPE)
console.log(`Growth / tech with a fair value: ${rows.length}; Lynch rule counted (g >= 10%): ${G.length}; of those g above the 25% cap: ${G.filter((r) => r.capped).length}`)
console.log(`  the rule's P/E: median ${median(G.map((r) => r.pegPE)).toFixed(1)}; the stocks' own P/E: median ${median(G.map((r) => r.pe)).toFixed(1)}`)
console.log(`  rule value below half the price: ${G.filter((r) => r.pegPE / r.pe < 0.5).length}; trimmed away (below a third of the weighted median): ${G.filter((r) => r.dropped).length}`)
const kept = G.filter((r) => !r.dropped && r.b)
console.log(`  where it stays in the blend (${kept.length}): fair/price median ${median(kept.map((r) => r.a)).toFixed(2)} with it, ${median(kept.map((r) => r.b)).toFixed(2)} without; median change ${(100 * median(kept.map((r) => r.a / r.b - 1))).toFixed(0)}%`)
console.log('  examples:', kept.sort((x, y) => x.a / x.b - y.a / y.b).slice(0, 8).map((r) => `${r.sym} g ${(100 * r.g).toFixed(0)}% P/E ${r.pe.toFixed(0)} rule P/E ${r.pegPE.toFixed(0)} fair/price ${r.a.toFixed(2)} vs ${r.b.toFixed(2)}`).join(' | '))
// the tie rule of the weighted median with the four Growth methods
console.log('tie:', JSON.stringify(E.blendTrimmed({ pe: 10, peg: 20, dcf: 61, ps: 70 }, E.WEIGHTS['Growth / tech'])), JSON.stringify(E.blendTrimmed({ pe: 10, peg: 20, dcf: 59, ps: 70 }, E.WEIGHTS['Growth / tech'])))
