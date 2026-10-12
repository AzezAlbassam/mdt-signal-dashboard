// Study 7, part B (PROTOCOL-study7.md §B2): gold's log regression band, descriptive only.
//   node scripts/study7-gold.js → reports/study7-gold.txt
// Same fit as pine/gold-log-regression.pine with its defaults: ln(close) on years since
// 1971-08, bands at ±1 and ±2 SD of the residuals.
import fs from 'node:fs'
import { monthKey } from '../engine/fairvalue.js'

const LAST_COMPLETE = '2026-09'
const START = '1971-08'
const MIN_YEARS = 20

const { bars } = JSON.parse(fs.readFileSync('data/fv/gold-monthly.json', 'utf8'))
const rows = bars.t
  .map((t, i) => ({ m: monthKey(t), c: bars.c[i] }))
  .filter((r) => r.m >= START && r.m <= LAST_COMPLETE && r.c > 0)
const yearsOf = (m) => {
  const [y, mo] = m.split('-').map(Number)
  const [y0, m0] = START.split('-').map(Number)
  return (y - y0) + (mo - m0) / 12
}

function fit(sub) {
  const n = sub.length
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (const r of sub) {
    const x = yearsOf(r.m)
    const y = Math.log(r.c)
    sx += x; sy += y; sxx += x * x; sxy += x * y
  }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx)
  const a = (sy - b * sx) / n
  let sse = 0
  for (const r of sub) sse += (Math.log(r.c) - a - b * yearsOf(r.m)) ** 2
  return { a, b, sd: Math.sqrt(sse / (n - 2)) }
}

// z of each month under the past-only fit (data up to and including that month).
const past = rows.map((r, i) => {
  if (yearsOf(r.m) < MIN_YEARS) return null
  const f = fit(rows.slice(0, i + 1))
  return { ...r, z: (Math.log(r.c) - f.a - f.b * yearsOf(r.m)) / f.sd, mid: Math.exp(f.a + f.b * yearsOf(r.m)), growth: Math.exp(f.b) - 1 }
})
const full = fit(rows)
const hind = rows.map((r) => ({ ...r, z: (Math.log(r.c) - full.a - full.b * yearsOf(r.m)) / full.sd }))

const idx = new Map(rows.map((r, i) => [r.m, i]))
const fwd = (m, k) => {
  const i = idx.get(m)
  return i + k < rows.length ? rows[i + k].c / rows[i].c - 1 : null
}
const pct = (x) => (x == null ? '      –' : `${x >= 0 ? '+' : ''}${(100 * x).toFixed(0)}%`.padStart(7))

function episodes(series, threshold) {
  const out = []
  let cur = null
  for (const r of series) {
    if (r && r.z < threshold) {
      if (!cur) cur = { start: r.m, end: r.m, minZ: r.z, minM: r.m, startPrice: r.c }
      cur.end = r.m
      if (r.z < cur.minZ) { cur.minZ = r.z; cur.minM = r.m }
    } else if (cur) { out.push(cur); cur = null }
  }
  if (cur) out.push(cur)
  return out
}

function table(title, series) {
  const L = [title, 'first month  last month  months  deepest (SD, month)   price   +12m    +36m    +60m']
  for (const e of episodes(series, -1)) {
    const len = idx.get(e.end) - idx.get(e.start) + 1
    L.push(`${e.start}      ${e.end}     ${String(len).padStart(4)}   ${e.minZ.toFixed(2).padStart(5)} (${e.minM})   ${e.startPrice.toFixed(0).padStart(6)}  ${pct(fwd(e.start, 12))} ${pct(fwd(e.start, 36))} ${pct(fwd(e.start, 60))}`)
  }
  const ms = series.filter(Boolean).map((r) => r.m)
  const avg = (k) => {
    const v = ms.map((m) => fwd(m, k)).filter((x) => x != null)
    return `${pct(v.reduce((a, b) => a + b, 0) / v.length)} (n=${v.length})`
  }
  L.push(`all months in this window, average: +12m ${avg(12)}, +36m ${avg(36)}, +60m ${avg(60)}`)
  return L
}

const last = past[past.length - 1]
const L = [
  'Study 7 part B — gold log regression band (TVC:GOLD monthly closes), descriptive only',
  `Fit: ln(close) on years since ${START}; data ${rows[0].m} to ${rows[rows.length - 1].m} (${rows.length} months).`,
  'Too few independent cycles for a test; nothing here is "confirmed". Returns are price only.',
  '',
  `Today (${last.m}): close ${last.c.toFixed(0)}, regression ${last.mid.toFixed(0)}, position ${last.z.toFixed(2)} SD; trend growth ${(100 * last.growth).toFixed(1)}%/yr; SD ${full.sd.toFixed(3)} (×${Math.exp(full.sd).toFixed(2)} per SD).`,
  `Bands today: −2 SD ${Math.exp(Math.log(last.mid) - 2 * full.sd).toFixed(0)}, −1 SD ${Math.exp(Math.log(last.mid) - full.sd).toFixed(0)}, +1 SD ${Math.exp(Math.log(last.mid) + full.sd).toFixed(0)}, +2 SD ${Math.exp(Math.log(last.mid) + 2 * full.sd).toFixed(0)}`,
  '',
  ...table(`Past-only fit (each month sees only data up to itself; from ${MIN_YEARS} years of data). Episodes below −1 SD:`, past),
  '',
  ...table('All-data fit — HINDSIGHT (the line is fitted through the future too). Episodes below −1 SD:', hind),
  '',
  'Position by year-end (past-only z; hindsight z):',
  ...rows.filter((r) => r.m.endsWith('-12') || r.m === rows[rows.length - 1].m).map((r) => {
    const p = past[idx.get(r.m)]
    return `${r.m}  ${String(r.c.toFixed(0)).padStart(5)}  ${p ? p.z.toFixed(2).padStart(6) : '     –'}  ${hind[idx.get(r.m)].z.toFixed(2).padStart(6)}`
  }),
]
fs.writeFileSync('reports/study7-gold.txt', L.join('\n') + '\n')
console.log(L.slice(0, 40).join('\n'))
