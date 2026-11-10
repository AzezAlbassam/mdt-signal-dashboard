// How much do noisy history share counts (net income ÷ EPS) move the P/S and EV/EBITDA fair values?
// Variant: counts that fail svr.js steady() are replaced by the nearest kept count (FY and TTM), nothing else changes.
import fs from 'node:fs'
import { R, E, median } from './lib.mjs'
const { steady } = await import(`${R}/engine/svr.js`)
const pos = (x) => Number.isFinite(x) && x > 0
function clean(counts) { // oldest first in, cleaned out
  // pass 1 of steady() only: an isolated count more than 1.5x away from at least half of its neighbours (two either side)
  const near = (a, b) => pos(a) && pos(b) && a > b / 1.5 && a < b * 1.5
  const k = counts.map((c, i) => { if (!pos(c)) return null; const nb = [...counts.slice(Math.max(0, i - 2), i), ...counts.slice(i + 1, i + 3)].filter(pos); return !nb.length || nb.filter((x) => near(c, x)).length >= Math.ceil(nb.length / 2) ? c : null })
  return counts.map((c, i) => { if (k[i] != null) return k[i]; let best = null; for (let j = 0; j < k.length; j++) if (k[j] != null && (best == null || Math.abs(j - i) < Math.abs(best - i))) best = j; return best == null ? c : k[best] })
}
function run(sets, label) {
  const ch = { ps: [], ev: [] }; let n = 0, noisy = 0
  const ex = []
  for (const { fin, px, fq, sector, sym } of sets) {
    const closes = new Map(); px.bars.t.forEach((t, i) => { if (Number.isFinite(px.bars.c[i])) closes.set(E.monthKey(t), px.bars.c[i]) })
    const month = E.monthKey(px.bars.t.at(-1)); if (month < '2026-09') continue
    const funds = E.parseFundamentals(fin); const ttm = fq ? E.ttmFromQuarters(fq) : null
    const a = E.fairValuesAt(funds, closes, sector, month, E.liveContext(funds, ttm, month, null)); if (!a) continue
    const funds2 = funds.map((f) => ({ ...f })); const c = clean(funds2.map((f) => f.shares)); funds2.forEach((f, i) => { f.shares = c[i] })
    const ttm2 = ttm?.map((t) => ({ ...t })) ?? null
    if (ttm2) { const raw = ttm2.map((t) => (t.eps && t.ni && Math.sign(t.eps) === Math.sign(t.ni) ? t.ni / t.eps : null)); const cc = clean(raw); ttm2.forEach((t, i) => { if (raw[i] != null && cc[i] != null && cc[i] !== raw[i]) t.eps = t.ni / cc[i] }) ; for (const t of ttm2) t.prev = ttm2.find((x) => x.n === t.n - 4) ?? null }
    const b = E.fairValuesAt(funds2, closes, sector, month, E.liveContext(funds2, ttm2, month, null)); if (!b) continue
    n++
    let moved = false
    for (const m of ['ps', 'ev']) if (pos(a.values[m]) && pos(b.values[m])) { const r = a.values[m] / b.values[m] - 1; ch[m].push(r); if (Math.abs(r) > 0.25) { moved = true; ex.push(`${sym} ${m}: ${a.values[m].toFixed(2)} vs cleaned ${b.values[m].toFixed(2)} (price ${a.close})`) } }
    if (moved) noisy++
  }
  console.log(`\n${label}: ${n} stocks`)
  for (const m of ['ps', 'ev']) { const x = ch[m]; console.log(`  ${m}: n=${x.length}  |change|>10%: ${x.filter((r) => Math.abs(r) > 0.1).length}  >25%: ${x.filter((r) => Math.abs(r) > 0.25).length}  >50%: ${x.filter((r) => Math.abs(r) > 0.5).length}  median signed change of those >10%: ${median(x.filter((r) => Math.abs(r) > 0.1))?.toFixed(2)}`) }
  console.log('  examples:', ex.slice(0, 14).join(' | '))
}
const rd = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : null)
const sectors = { ...rd(`${R}/data/fv/sectors.json`), ...rd(`${R}/data/fv8/sectors.json`) }
const us = []
for (const f of new Set([...fs.readdirSync(`${R}/data/fv/raw/fin`), ...fs.readdirSync(`${R}/data/fv8/raw/fin`)])) {
  const fin = rd(`${R}/data/fv/raw/fin/${f}`) ?? rd(`${R}/data/fv8/raw/fin/${f}`); const px = rd(`${R}/data/fv/raw/px/${f}`) ?? rd(`${R}/data/fv8/raw/px/${f}`)
  if (fin && px && sectors[fin.symbol]?.type === 'stock') us.push({ fin, px, fq: rd(`${R}/data/fq/${f}`), sector: sectors[fin.symbol].sector, sym: fin.symbol })
}
run(us, 'US (data/fv, fv8, fq)')
const saS = { ...rd(`${R}/data/fv-sa/sectors.json`) }
const sa = []
for (const f of fs.readdirSync(`${R}/data/sa-all/raw/fin`)) { const fin = rd(`${R}/data/sa-all/raw/fin/${f}`); const px = rd(`${R}/data/sa-all/raw/px/${f}`); if (fin && px) sa.push({ fin, px, fq: rd(`${R}/data/fq/${f}`), sector: saS[fin.symbol]?.sector ?? 'Unknown', sym: fin.symbol }) }
run(sa, 'Tadawul (data/sa-all, fq)')
