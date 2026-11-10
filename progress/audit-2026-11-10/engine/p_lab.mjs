import { E, load, files } from './lib.mjs'
// stocks whose newest quarter label year is below the last fiscal-year label: liveContext then drops the quarters entirely
let n = 0; const hit = []; const gap = []
for (const f of files()) {
  const d = load(f); if (!d || !d.fq || d.type !== 'stock') continue
  const funds = E.parseFundamentals(d.fin); const ttm = E.ttmFromQuarters(d.fq); if (!ttm.length || !funds.length) continue
  n++
  const qy = Number(ttm.at(-1).label.slice(-4)); const fy = funds.at(-1).year
  if (qy < fy) hit.push(`${d.sym} last quarter ${ttm.at(-1).label}, last FY ${fy}, raw quarter labels ${d.fq.labels.slice(-3).join('/')}`)
  // gaps: twelve-month records not three months apart, which liveContext still spaces three months apart
  const ns = ttm.map((t) => t.n); if (ns.some((x, i) => i && x - ns[i - 1] !== 1)) gap.push(`${d.sym} ${ttm.map((t) => t.label).join(',')}`)
}
console.log('with quarters', n, 'dropped by the label rule', hit.length); console.log(hit.slice(0, 15).join('\n'))
console.log('twelve-month series with a gap:', gap.length); console.log(gap.slice(0, 6).join('\n'))
for (const s of ['NASDAQ_NVDA', 'NASDAQ_MSFT', 'NASDAQ_COST', 'NYSE_WMT', 'NYSE_CRM', 'NASDAQ_AVGO']) { const d = load(s + '.json'); if (!d) continue; console.log(s, 'FY labels', d.fin.labels.slice(-2), 'fq labels', d.fq?.labels.slice(-2)) }
