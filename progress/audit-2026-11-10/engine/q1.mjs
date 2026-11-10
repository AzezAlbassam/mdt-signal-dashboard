// per-profile medians of each method's value / price on the saved data (live path, month = last bar)
import { E, SC, load, files, median } from './lib.mjs'
const by = {}
let n = 0
for (const f of files()) {
  const d = load(f); if (!d || d.month < '2026-09' || d.type !== 'stock') continue
  const funds = E.parseFundamentals(d.fin)
  const ttm = d.fq ? E.ttmFromQuarters(d.fq) : null
  const live = E.liveContext(funds, ttm, d.month, null)
  const fv = E.fairValuesAt(funds, d.closes, d.sector, d.month, live)
  if (!fv) continue
  n++
  const st = live.state(d.month)
  const g = st.epsG ?? st.revG
  const w = E.WEIGHTS[fv.profile].map((x, i) => (E.METHODS[i] === 'graham' || (E.METHODS[i] === 'peg' && !(g >= 0.1)) ? 0 : x))
  const v = { ...fv.values }; if (!(g >= 0.1)) v.peg = null
  const b = E.blendTrimmed(v, w), b0 = E.blend(v, w)
  const o = (by[fv.profile] ??= { n: 0, m: {}, fair: [], fair0: [], drops: 0 })
  o.n++
  for (const m of E.METHODS) if (v[m] > 0) (o.m[m] ??= []).push(v[m] / fv.close)
  if (b) { o.fair.push(b.fair / fv.close); o.fair0.push(b0.fair / fv.close); if (b.dropped.length) o.drops++ }
}
console.log('stocks', n)
for (const [p, o] of Object.entries(by)) {
  console.log(`\n${p}: n=${o.n} fair/price median ${median(o.fair)?.toFixed(2)} (untrimmed ${median(o.fair0)?.toFixed(2)}) with fair ${o.fair.length}, trimmed something in ${o.drops}`)
  for (const [m, a] of Object.entries(o.m)) console.log(`   ${m.padEnd(6)} n=${String(a.length).padStart(3)} median value/price ${median(a).toFixed(2)}  share<0.5: ${(a.filter(x=>x<0.5).length/a.length*100).toFixed(0)}%  share>1.5: ${(a.filter(x=>x>1.5).length/a.length*100).toFixed(0)}%`)
}
