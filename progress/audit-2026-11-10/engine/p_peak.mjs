// Earnings far above their own 5-year average (a cycle peak or a one-off): Growth and Mature weigh only methods on the
// newest twelve months (P/E × own median, Lynch, DCF, P/S, EV/EBITDA); the 5-year-average method (pen) has weight 0 there.
import { E, load, files, median } from './lib.mjs'
const g = { peak: [], rest: [] }; const ex = []
for (const f of files()) {
  const d = load(f); if (!d || d.month < '2026-09' || d.type !== 'stock') continue
  const funds = E.parseFundamentals(d.fin); const ttm = d.fq ? E.ttmFromQuarters(d.fq) : null
  const live = E.liveContext(funds, ttm, d.month, null)
  const fv = E.fairValuesAt(funds, d.closes, d.sector, d.month, live); if (!fv || !['Growth / tech', 'Mature / profitable'].includes(fv.profile)) continue
  const st = live.state(d.month); if (!(st.eps > 0) || !(st.epsNorm > 0)) continue
  const gr = st.epsG ?? st.revG
  const w = E.WEIGHTS[fv.profile].map((x, i) => (E.METHODS[i] === 'graham' || (E.METHODS[i] === 'peg' && !(gr >= 0.1)) ? 0 : x))
  const v = { ...fv.values }; if (!(gr >= 0.1)) v.peg = null
  const b = E.blendTrimmed(v, w); if (!b) continue
  const r = { sym: d.sym, ratio: st.eps / st.epsNorm, fair: b.fair / fv.close, pe: v.pe ? v.pe / fv.close : null, pen: v.pen ? v.pen / fv.close : null, peNow: fv.close / st.eps }
  ;(r.ratio > 2 ? g.peak : g.rest).push(r)
}
for (const [k, a] of Object.entries(g)) console.log(`${k}: n=${a.length}  fair/price median ${median(a.map((r) => r.fair)).toFixed(2)}  share with fair > 1.3× price ${(100 * a.filter((r) => r.fair > 1.3).length / a.length).toFixed(0)}%  P/E-method/price ${median(a.filter((r) => r.pe).map((r) => r.pe)).toFixed(2)}  5y-average-EPS method/price ${median(a.filter((r) => r.pen).map((r) => r.pen)).toFixed(2)}  P/E now ${median(a.map((r) => r.peNow)).toFixed(1)}`)
console.log(g.peak.sort((a, b) => b.ratio - a.ratio).slice(0, 12).map((r) => `${r.sym.split(':')[1]} EPS ${r.ratio.toFixed(1)}× its 5y avg, fair/price ${r.fair.toFixed(2)}, pen/price ${r.pen?.toFixed(2) ?? '—'}`).join('\n'))
