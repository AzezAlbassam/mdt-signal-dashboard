// blendTrimmed's weighted median at an exact half takes the lower value (study 16 D2 B, as registered). With Growth's weights
// (.2 .3 .3 .2) the two lowest methods carry exactly half in 4 of 6 orderings, so the anchor is the second-lowest value.
import { E, load, files, median } from './lib.mjs'
const W = E.WEIGHTS['Growth / tech']
let four = 0, tie = 0, dropHigh = 0, dropLow = 0; const ex = []; const ch = []
for (const f of files()) {
  const d = load(f); if (!d || d.month < '2026-09' || d.type !== 'stock') continue
  const funds = E.parseFundamentals(d.fin); const ttm = d.fq ? E.ttmFromQuarters(d.fq) : null
  const live = E.liveContext(funds, ttm, d.month, null)
  const fv = E.fairValuesAt(funds, d.closes, d.sector, d.month, live); if (!fv || fv.profile !== 'Growth / tech') continue
  const st = live.state(d.month); const g = st.epsG ?? st.revG; if (!(g >= 0.1)) continue
  const vals = E.METHODS.map((m, i) => [m, fv.values[m], W[i]]).filter(([, x, w]) => w > 0 && x > 0); if (vals.length < 4) continue
  four++
  const s = [...vals].sort((a, b) => a[1] - b[1])
  const isTie = Math.abs(s[0][2] + s[1][2] - 0.5) < 1e-9
  if (!isTie) continue
  tie++
  const b = E.blendTrimmed(fv.values, W)
  // the conventional median at a tie: midway between the two middle values
  const mid = (s[1][1] + s[2][1]) / 2
  const kept = vals.filter(([, x]) => x <= 3 * mid && x >= mid / 3)
  const alt = kept.reduce((a, [, x, w]) => a + x * w, 0) / kept.reduce((a, [, , w]) => a + w, 0)
  ch.push(b.fair / alt - 1)
  if (b.dropped.some((m) => m === s[3][0] || m === s[2][0])) dropHigh++
  if (Math.abs(b.fair / alt - 1) > 0.2) ex.push(`${d.sym} ${s.map(([m, x]) => `${m} ${x.toFixed(0)}`).join(', ')} → fair ${b.fair.toFixed(1)} (dropped ${b.dropped.join('+') || '-'}); midpoint median → ${alt.toFixed(1)}; price ${fv.close}`)
}
console.log(`Growth with all four methods valued: ${four}; exact tie: ${tie}; a high method dropped: ${dropHigh}`)
console.log(`fair (lower value at the tie) ÷ fair (midpoint) − 1: median ${(100 * median(ch)).toFixed(1)}%, lower by >10% in ${ch.filter((x) => x < -0.1).length}, higher by >10% in ${ch.filter((x) => x > 0.1).length}`)
console.log(ex.slice(0, 10).join('\n'))
