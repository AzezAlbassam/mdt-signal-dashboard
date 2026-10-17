// Study 11 (PROTOCOL-study11.md §3–5): the two pre-registered tests, run once on all data.
//   node scripts/study11-run.js → reports/study11.txt, reports/study11.json
//
// Nothing here chooses a parameter. W, K, the period grid and H come from engine/hcp.js,
// which takes them from §1; the universe and the 1250-bar floor come from §2; the two
// hypotheses, their nulls, the seed and the confirmation rule come from §4.
import fs from 'node:fs'
import zlib from 'node:zlib'
import { hcpFit, W, H } from '../engine/hcp.js'
import { mulberry32, holm } from '../engine/study.js'

const DRAWS = 10000
const SEED = 11
const MIN_BARS = 1250 // §2
const SPACING = H // §3: evaluation dates are H apart, so realized windows never overlap
const MIN_PER_DATE = 10 // a rank correlation over fewer symbols is not worth computing
const EXTRA_H = [20, 60] // §5, reported only
const MAX_H = Math.max(H, ...EXTRA_H)
const CALENDAR = 'AMEX:SPY' // §2

const gz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
const fileFor = (sym) => {
  const n = sym.replace(/[:/]/g, '_')
  for (const p of [`data/study11/bars/${n}.json.gz`, `data/us/bars/${sym.replace(':', '_')}.json.gz`]) {
    if (fs.existsSync(p)) return p
  }
  return null
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000

// Average ranks, so ties do not invent an ordering.
function ranks(v) {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0])
  const r = new Float64Array(v.length)
  for (let i = 0; i < idx.length;) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k += 1) r[idx[k][1]] = avg
    i = j + 1
  }
  return r
}
const spearmanFromRanks = (ra, rb) => {
  const n = ra.length
  if (n < 2) return NaN
  const ma = (n + 1) / 2
  let sab = 0, saa = 0, sbb = 0
  for (let i = 0; i < n; i += 1) { const a = ra[i] - ma, b = rb[i] - ma; sab += a * b; saa += a * a; sbb += b * b }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN
}

// ── data ────────────────────────────────────────────────────────────────────────────────
const universe = JSON.parse(fs.readFileSync('data/study11/universe.json', 'utf8')).union
const loaded = []
const missing = []
const tooShort = []
for (const sym of universe) {
  const f = fileFor(sym)
  if (!f) { missing.push(sym); continue }
  const s = gz(f)
  if (s.date.length < MIN_BARS) { tooShort.push([sym, s.date.length]); continue }
  loaded.push({ symbol: sym, ...s, index: new Map(s.date.map((d, i) => [d, i])) })
}
const cal = loaded.find((s) => s.symbol === CALENDAR)
if (!cal) throw new Error(`master calendar ${CALENDAR} not available`)

// §3: the calendar's last completed session and every SPACING-th trading day before it.
const grid = []
for (let i = cal.date.length - 1; i >= 0; i -= SPACING) grid.push(cal.date[i])
grid.reverse()

// ── one fit per (symbol, evaluation date) ───────────────────────────────────────────────
const pairs = []
const noFit = []
for (const s of loaded) {
  for (const T of grid) {
    // the symbol's own last bar at or before T, which must be close to T and leave a future
    let j = s.index.get(T)
    if (j === undefined) {
      j = -1
      for (let k = s.date.length - 1; k >= 0; k -= 1) if (s.date[k] <= T) { j = k; break }
      if (j < 0 || days(s.date[j], T) > 5) continue
    }
    if (j < W - 1 || j + MAX_H >= s.date.length) continue
    const f = hcpFit(s.close, j)
    if (!f) { noFit.push([s.symbol, T]); continue }
    const base = Math.log(s.close[j])
    const m = new Float64Array(MAX_H) // projection as a shape relative to this symbol's close
    const real = new Float64Array(MAX_H) // what actually happened, same scale
    for (let h = 1; h <= MAX_H; h += 1) {
      m[h - 1] = Math.log(f.at(h)) - base
      real[h - 1] = Math.log(s.close[j + h]) - base
    }
    pairs.push({ symbol: s.symbol, date: T, at: s.date[j], m, real, periods: f.periods })
  }
}

// gapFlat − gapModel over the first `h` bars: positive means HCP beat a no-change line.
const dOf = (p, h, shape = p.m) => {
  let flat = 0, mod = 0
  for (let i = 0; i < h; i += 1) { flat += Math.abs(p.real[i]); mod += Math.abs(p.real[i] - shape[i]) }
  return (flat - mod) / h
}
const byDate = new Map()
for (const p of pairs) {
  if (!byDate.has(p.date)) byDate.set(p.date, [])
  byDate.get(p.date).push(p)
}
const dates = [...byDate.keys()].sort().filter((d) => byDate.get(d).length >= MIN_PER_DATE)
const used = dates.flatMap((d) => byDate.get(d))
const thinDates = [...byDate.keys()].length - dates.length

// ── H1: tracking ────────────────────────────────────────────────────────────────────────
const h1Effect = (ps, h = H) => mean(ps.map((p) => dOf(p, h)))
const rng = mulberry32(SEED)
function h1P(h = H) {
  const obs = h1Effect(used, h)
  let atLeast = 0
  for (let d = 0; d < DRAWS; d += 1) {
    let sum = 0, n = 0
    for (const date of dates) {
      const g = byDate.get(date)
      const order = g.map((_, i) => i)
      for (let i = order.length - 1; i > 0; i -= 1) { // Fisher-Yates on this date's symbols
        const k = Math.floor(rng() * (i + 1))
        const t = order[i]; order[i] = order[k]; order[k] = t
      }
      for (let i = 0; i < g.length; i += 1) { sum += dOf(g[i], h, g[order[i]].m); n += 1 }
    }
    if (sum / n >= obs) atLeast += 1
  }
  return { effect: obs, p: (atLeast + 1) / (DRAWS + 1) }
}

// ── H2: direction, ranked across symbols within each date ───────────────────────────────
const h2Per = (ds, h = H) => ds.map((date) => {
  const g = byDate.get(date)
  return spearmanFromRanks(ranks(g.map((p) => p.m[h - 1])), ranks(g.map((p) => p.real[h - 1])))
}).filter(Number.isFinite)
function h2P(h = H) {
  const obs = mean(h2Per(dates, h))
  const prep = dates.map((date) => {
    const g = byDate.get(date)
    return { rp: ranks(g.map((p) => p.m[h - 1])), rr: ranks(g.map((p) => p.real[h - 1])) }
  })
  let atLeast = 0
  for (let d = 0; d < DRAWS; d += 1) {
    let sum = 0
    for (const { rp, rr } of prep) {
      const sh = Float64Array.from(rp)
      for (let i = sh.length - 1; i > 0; i -= 1) { const k = Math.floor(rng() * (i + 1)); const t = sh[i]; sh[i] = sh[k]; sh[k] = t }
      sum += spearmanFromRanks(sh, rr)
    }
    if (sum / prep.length >= obs) atLeast += 1
  }
  return { effect: obs, p: (atLeast + 1) / (DRAWS + 1) }
}

const H1 = h1P()
const H2 = h2P()
const adj = holm([H1.p, H2.p])
// §4: positive, Holm p < 0.05, and positive in BOTH halves of the evaluation period.
const mid = dates[Math.floor(dates.length / 2)]
const early = used.filter((p) => p.date < mid)
const late = used.filter((p) => p.date >= mid)
H1.halves = [h1Effect(early), h1Effect(late)]
H2.halves = [mean(h2Per(dates.filter((d) => d < mid))), mean(h2Per(dates.filter((d) => d >= mid)))]
;[H1, H2].forEach((x, i) => {
  x.pHolm = adj[i]
  x.confirmed = x.effect > 0 && x.pHolm < 0.05 && x.halves[0] > 0 && x.halves[1] > 0
})

// ── §5 reported only ────────────────────────────────────────────────────────────────────
const maOf = (sym, T, n) => { // n-day average of the close at T, held flat over the horizon
  const s = loaded.find((x) => x.symbol === sym)
  let j = s.index.get(T)
  if (j === undefined) { j = -1; for (let k = s.date.length - 1; k >= 0; k -= 1) if (s.date[k] <= T) { j = k; break } }
  if (j < n) return null
  let t = 0
  for (let i = j - n + 1; i <= j; i += 1) t += s.close[i]
  return Math.log(t / n) - Math.log(s.close[j])
}
const benchGap = (n) => mean(used.map((p) => {
  const off = maOf(p.symbol, p.date, n)
  if (off == null) return NaN
  let g = 0
  for (let i = 0; i < H; i += 1) g += Math.abs(p.real[i] - off)
  return g / H
}).filter(Number.isFinite))
const gapModel = mean(used.map((p) => { let g = 0; for (let i = 0; i < H; i += 1) g += Math.abs(p.real[i] - p.m[i]); return g / H }))
const gapFlat = mean(used.map((p) => { let g = 0; for (let i = 0; i < H; i += 1) g += Math.abs(p.real[i]); return g / H }))
const anchored = mean(used.map((p) => dOf(p, H, p.m.map((v, i) => v - p.m[0] + p.m[0] * 0)))) // shape shifted to start at 0
const extra = Object.fromEntries(EXTRA_H.map((h) => [h, { h1: h1Effect(used, h), h2: mean(h2Per(dates, h)) }]))
const groups = JSON.parse(fs.readFileSync('data/study11/universe.json', 'utf8')).byType
const groupOf = (sym) => Object.entries(groups).find(([, v]) => v.includes(sym))?.[0] ?? 'other'
const byGroup = {}
for (const p of used) {
  const g = groupOf(p.symbol)
  ;(byGroup[g] ??= []).push(dOf(p, H))
}

// ── report ──────────────────────────────────────────────────────────────────────────────
const pc = (v) => `${v >= 0 ? '+' : ''}${(100 * v).toFixed(3)}%`
const L = []
L.push('Study 11 — HCP, a forward-projected model line (PROTOCOL-study11.md)')
L.push('HCP is an OPEN look-alike of the SHAPE of an undisclosed vendor model. It is not that')
L.push('model, not a reconstruction of it, and nothing here describes the vendor\'s product.')
L.push('')
L.push(`Universe ${universe.length}; usable ${loaded.length} (>= ${MIN_BARS} bars); too short ${tooShort.length}; no bars ${missing.length}.`)
L.push(`W ${W} bars, K 3 harmonics, H ${H} bars. Evaluation dates ${dates.length} (${dates[0]} .. ${dates[dates.length - 1]}), spacing ${SPACING}.`)
L.push(`Observations (symbol x date): ${used.length}. Dates dropped for < ${MIN_PER_DATE} symbols: ${thinDates}. Fits refused: ${noFit.length}.`)
L.push('')
L.push('CONFIRMED needs all three: effect > 0, Holm p < 0.05, and effect > 0 in BOTH halves.')
L.push('')
for (const [name, x, what] of [['H1', H1, 'tracking: mean (gap of a no-change line - gap of HCP), per bar'], ['H2', H2, 'direction: mean across dates of the cross-sectional Spearman']]) {
  L.push(`${name}  ${x.confirmed ? 'CONFIRMED    ' : 'NOT CONFIRMED'}  ${what}`)
  const v = name === 'H1' ? pc(x.effect) : x.effect.toFixed(4)
  const hv = name === 'H1' ? x.halves.map(pc) : x.halves.map((q) => q.toFixed(4))
  L.push(`    effect ${v}   p ${x.p.toFixed(4)}   Holm ${x.pHolm.toFixed(4)}   halves ${hv[0]} / ${hv[1]}`)
}
L.push('')
L.push('── Reported only (§5), no claim made from any of it ' + '─'.repeat(28))
L.push(`  mean |gap| over ${H} bars:  HCP ${(100 * gapModel).toFixed(2)}%   no-change line ${(100 * gapFlat).toFixed(2)}%   10-day MA ${(100 * benchGap(10)).toFixed(2)}%   20-day MA ${(100 * benchGap(20)).toFixed(2)}%`)
for (const h of EXTRA_H) L.push(`  H=${h}: H1 effect ${pc(extra[h].h1)}   H2 effect ${extra[h].h2.toFixed(4)}  (grid spacing stays ${SPACING}, so H=60 windows overlap)`)
L.push(`  anchored variant (projection shifted to start at the close): H1 effect ${pc(anchored)}`)
L.push('  by group (H1 effect per bar):')
for (const [g, v] of Object.entries(byGroup).sort((a, b) => b[1].length - a[1].length)) L.push(`    ${g.padEnd(18)} n ${String(v.length).padStart(5)}  ${pc(mean(v))}`)
if (tooShort.length) L.push('', `  below ${MIN_BARS} bars, excluded: ${tooShort.map(([s, n]) => `${s} (${n})`).join(', ')}`)
if (missing.length) L.push('', `  no bars on disk: ${missing.join(', ')}`)

fs.mkdirSync('reports', { recursive: true })
fs.writeFileSync('reports/study11.txt', `${L.join('\n')}\n`)
fs.writeFileSync('reports/study11.json', JSON.stringify({
  run: new Date().toISOString(), W, K: 3, H, draws: DRAWS, seed: SEED,
  counts: { universe: universe.length, usable: loaded.length, tooShort, missing, observations: used.length, dates: dates.length, noFit: noFit.length, thinDates },
  H1: { ...H1, m: undefined }, H2: { ...H2, m: undefined },
  reported: { gapModel, gapFlat, ma10: benchGap(10), ma20: benchGap(20), anchored, extra, byGroup: Object.fromEntries(Object.entries(byGroup).map(([g, v]) => [g, { n: v.length, effect: mean(v) }])) },
}, null, 1))
console.log(L.join('\n'))
