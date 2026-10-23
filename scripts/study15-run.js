// Study 15 run — PROTOCOL-study15.md §2-§4. Reads the chart measurement and the saved bars,
// writes reports/study15.txt and reports/study15.json.
//
//   node scripts/study15-run.js
import fs from 'node:fs'
import zlib from 'node:zlib'
import { sessionVwap, hlc3 } from '../engine/vwap.js'
import { exposures } from '../engine/gamma.js'

const meas = JSON.parse(fs.readFileSync('data/study15/chart-measure.json', 'utf8'))
const spxAll = JSON.parse(fs.readFileSync('data/study15/SP_SPX_1m.json', 'utf8')).bars
const spyAll = JSON.parse(fs.readFileSync('data/study15/AMEX_SPY_1m.json', 'utf8')).bars

// EDT (UTC-4) holds for every session here (DST ends 2026-11-01)
const etDate = (t) => new Date((t - 4 * 3600) * 1000).toISOString().slice(0, 10)
const etHM = (t) => new Date((t - 4 * 3600) * 1000).toISOString().slice(11, 16)
const sessionT = (day, hm) => Date.parse(`${day}T${hm}:00-04:00`) / 1000
const rth = (bars, day) => bars.filter((b) => etDate(b.t) === day && b.t >= sessionT(day, '09:30') && b.t < sessionT(day, '16:00'))

const DAY = '2026-10-12'
const spx = rth(spxAll, DAY)
const spy = new Map(rth(spyAll, DAY).map((b) => [b.t, b]))
if (spx.length !== 390) throw new Error(`expected 390 RTH minutes, got ${spx.length}`)

// ---- §2 candidates, one value per 1-minute bar ----
const M = meas.alignment.bar_minutes
const resampled = []
for (const b of spx) {
  const i = Math.floor((b.t - spx[0].t) / (60 * M))
  const r = resampled[i]
  if (!r) resampled[i] = { t: spx[0].t + i * 60 * M, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }
  else { r.h = Math.max(r.h, b.h); r.l = Math.min(r.l, b.l); r.c = b.c; r.v += b.v }
}
const minuteSeries = {
  V1: sessionVwap(spx),
  V2: sessionVwap(spx, { src: (b) => b.c }),
  V3: sessionVwap(spx, { weight: (b) => spy.get(b.t)?.v ?? 0 }),
  V0: sessionVwap(spx, { weight: () => 1 }),
}
const v4 = sessionVwap(resampled)
const CANDS = {
  V1: 'session VWAP of hlc3, SP:SPX volume (primary)',
  V2: 'session VWAP of close, SP:SPX volume',
  V3: 'session VWAP of hlc3, AMEX:SPY volume',
  V4: `session VWAP of hlc3 on ${M}-minute bars, SP:SPX volume`,
  V0: 'control: equal-weight mean of hlc3 (no volume)',
}
// value at chart candle = value after the last 1-minute bar inside it
const atCandle = (id, startHM) => {
  const t0 = sessionT(DAY, startHM)
  if (id === 'V4') return v4[(t0 - spx[0].t) / (60 * M)]
  const last = spx.findLastIndex((b) => b.t < t0 + 60 * M)
  return minuteSeries[id][last]
}

const candles = meas.candles.filter((c) => !c.flags.includes('last (forming)'))
const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * q; const f = Math.floor(i); return s[f] + (s[Math.min(f + 1, s.length - 1)] - s[f]) * (i - f) }
const label = (ad) => {
  const med = pct(ad, 0.5), p90 = pct(ad, 0.9)
  return { n: ad.length, median: med, p90, max: Math.max(...ad), label: med <= 0.25 && p90 <= 0.6 ? 'MATCH' : med <= 0.75 ? 'CLOSE' : 'NO MATCH' }
}
const compare = (measured, model) => {
  const rows = candles.filter((c) => c[measured] != null).map((c) => ({ k: c.k, t: c.bar_start_et, m: c[measured], v: model(c) }))
  const d = rows.map((r) => r.m - r.v)
  return { ...label(d.map(Math.abs)), meanSigned: d.reduce((a, b) => a + b, 0) / d.length, rows }
}

const H1 = {}
for (const id of Object.keys(CANDS)) H1[id] = compare('line', (c) => atCandle(id, c.bar_start_et).vwap)
const h1Confirmed = H1.V1.label === 'MATCH' && H1.V0.label !== 'MATCH'
const vStar = ['V1', 'V2', 'V3', 'V4'].reduce((a, b) => (H1[b].median < H1[a].median ? b : a))

const EDGES = { E1: 2, E2: 1, E3: -1, E4: -2 }
const H2 = {}
for (const [e, k] of Object.entries(EDGES)) {
  const r = compare(e, (c) => { const x = atCandle(vStar, c.bar_start_et); return x.vwap + k * x.sd })
  // descriptive: the multiple of sigma that fits this edge best (least squares)
  let num = 0, den = 0
  for (const c of candles.filter((c) => c[e] != null)) { const x = atCandle(vStar, c.bar_start_et); num += (c[e] - x.vwap) * x.sd; den += x.sd * x.sd }
  H2[e] = { ...r, k, kFit: num / den }
}
const h2Confirmed = Object.values(H2).every((r) => r.label === 'MATCH')

// ---- POST-HOC (chosen after the §3 result: the equal-weight control matched, V1-V4 did not) ----
// Not tests. P1 puts the §2 band rule on V0 (its own equal-weight sigma); P2 tries three
// near variants of V0. All are reported, whatever they show; none is confirmed by this chart.
const v0 = minuteSeries.V0
const v0At = (hm) => v0[spx.findLastIndex((b) => b.t < sessionT(DAY, hm) + 60 * M)]
const P1 = {}
for (const [e, k] of Object.entries(EDGES)) {
  const r = compare(e, (c) => { const x = v0At(c.bar_start_et); return x.vwap + k * x.sd })
  let num = 0, den = 0
  for (const c of candles.filter((c) => c[e] != null)) { const x = v0At(c.bar_start_et); num += (c[e] - x.vwap) * x.sd; den += x.sd * x.sd }
  P1[e] = { ...r, k, kFit: num / den }
}
const twap3 = sessionVwap(resampled, { weight: () => 1 })
const P2series = {
  'equal-weight close, 1-minute': sessionVwap(spx, { src: (b) => b.c, weight: () => 1 }),
  'equal-weight ohlc4, 1-minute': sessionVwap(spx, { src: (b) => (b.o + b.h + b.l + b.c) / 4, weight: () => 1 }),
}
const P2 = {}
for (const [name, ser] of Object.entries(P2series)) P2[name] = compare('line', (c) => ser[spx.findLastIndex((b) => b.t < sessionT(DAY, c.bar_start_et) + 60 * M)].vwap)
P2[`equal-weight hlc3, ${M}-minute bars`] = compare('line', (c) => twap3[(sessionT(DAY, c.bar_start_et) - spx[0].t) / (60 * M)].vwap)

// P3 — found by the independent skeptic review (a 31-anchor search), reproduced here: the same
// standard VWAP (hlc3, SP:SPX volume) and its own volume-weighted sigma bands, anchored later than
// 09:30. Why it matters: the 09:30 bar carries the constituents' opening-auction volume.
const anchorScan = []
for (let a = 0; a <= 30; a += 1) {
  const sub = spx.slice(a)
  const ser = sessionVwap(sub)
  const at = (hm) => ser[sub.findLastIndex((b) => b.t < sessionT(DAY, hm) + 60 * M)]
  const row = { anchor: etHM(sub[0].t), line: compare('line', (c) => at(c.bar_start_et).vwap) }
  for (const [e, k] of Object.entries(EDGES)) {
    let num = 0, den = 0
    for (const c of candles.filter((c) => c[e] != null)) { const x = at(c.bar_start_et); num += (c[e] - x.vwap) * x.sd; den += x.sd * x.sd }
    row[e] = { ...compare(e, (c) => { const x = at(c.bar_start_et); return x.vwap + k * x.sd }), kFit: num / den }
  }
  anchorScan.push(row)
}
const vol930 = spx[0].v, medVol = [...spx.slice(1, 30).map((b) => b.v)].sort((x, y) => x - y)[14]

// ---- descriptive: bubble rows and trades ----
const barAt = (hm) => resampled[(sessionT(DAY, hm) - spx[0].t) / (60 * M)]
const strikes = meas.bubble_rows.map((r) => r.strike)
const trades = meas.trade_marks.map((m) => {
  const b = barAt(m.bar_start_et)
  const nearest = strikes.reduce((a, s) => (Math.abs(s - m.tip_price) < Math.abs(a - m.tip_price) ? s : a))
  return { ...m, spx: { h: b.h, l: b.l }, nearestRow: nearest, dist: m.tip_price - nearest }
})

// ---- §4 OGL for 2026-10-22 (example only, no vendor chart) ----
const OGL_DAY = '2026-10-22'
const ogSpot = rth(spxAll, OGL_DAY)
const optDir = 'data/study15/opt'
const chain = fs.readdirSync(optDir).filter((f) => f.includes('SPXW261022')).map((f) => {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(`${optDir}/${f}`)))
  const m = j.symbol.match(/SPXW\d{6}([CP])(\d+)\.0$/)
  const bars = j.t.map((t, i) => ({ t, c: j.c[i], v: j.v[i] })).filter((b) => etDate(b.t) === OGL_DAY && b.t >= sessionT(OGL_DAY, '09:30') && b.t < sessionT(OGL_DAY, '16:00'))
  return { strike: Number(m[2]), call: m[1] === 'C', bars }
})
const lowD = Math.min(...ogSpot.map((b) => b.l)), highD = Math.max(...ogSpot.map((b) => b.h))
const want = []
for (let k = Math.ceil((lowD - 50) / 5) * 5; k <= highD + 50; k += 5) want.push(k)
const have = new Set(chain.map((c) => c.strike))
const ogl = exposures(ogSpot, chain.filter((c) => want.includes(c.strike)), sessionT(OGL_DAY, '16:00'))
const SNAP = ['10:30', '12:00', '14:00', '15:30', '15:59']
const oglSnaps = SNAP.map((hm) => {
  const i = ogl.times.indexOf(sessionT(OGL_DAY, hm))
  const row = ogl.E[i]
  const top = ogl.strikes.map((k, j) => ({ strike: k, E: row[j] })).sort((a, b) => Math.abs(b.E) - Math.abs(a.E)).slice(0, 5)
  return { hm, spot: ogSpot[i].c, top }
})

// ---- POST-HOC, descriptive: is options flow flat enough through the day to look like equal weights? ----
const flowAt = new Map(), premAt = new Map()
for (const c of chain) for (const bb of c.bars) { flowAt.set(bb.t, (flowAt.get(bb.t) ?? 0) + bb.v); premAt.set(bb.t, (premAt.get(bb.t) ?? 0) + bb.v * bb.c * 100) }
const WIN = [0, 30, 60, 120, 240, 390]
const shares = (w) => { const x = ogSpot.map(w); const tot = x.reduce((p, q) => p + q, 0); return WIN.slice(1).map((h, i) => (100 * x.slice(WIN[i], h).reduce((p, q) => p + q, 0)) / tot) }
const flowProfile = {
  'equal weights': shares(() => 1), 'SP:SPX volume': shares((bb) => bb.v),
  '0DTE contracts': shares((bb) => flowAt.get(bb.t) ?? 0), '0DTE premium': shares((bb) => premAt.get(bb.t) ?? 0),
}
const eq22 = sessionVwap(ogSpot, { weight: () => 1 })
const gapTo = (ser) => { const d = ser.slice(30).map((x, i) => Math.abs(x.vwap - eq22[i + 30].vwap)).sort((p, q) => p - q); return { median: d[Math.floor(d.length / 2)], max: d.at(-1) } }
const flowGap = {
  'SP:SPX volume': gapTo(sessionVwap(ogSpot)),
  '0DTE contracts': gapTo(sessionVwap(ogSpot, { weight: (bb) => flowAt.get(bb.t) ?? 0 })),
  '0DTE premium': gapTo(sessionVwap(ogSpot, { weight: (bb) => premAt.get(bb.t) ?? 0 })),
}

// ---- report ----
const f2 = (x) => (x == null ? '   —   ' : x.toFixed(2).padStart(7))
const L = []
L.push('Study 15 — "Flow VWAP x Gamma" (@t38p_flow), 2026-10-12 chart. PROTOCOL-study15.md')
L.push('='.repeat(86))
L.push(`H1 the line is a standard session VWAP ............ ${h1Confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}  (V1 median |d| ${H1.V1.median.toFixed(2)}; equal-weight control ${H1.V0.median.toFixed(2)} = ${H1.V0.label})`)
L.push(`H2 the zone is VWAP ± 1σ / ± 2σ ................... ${h2Confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}  (on ${vStar}; ${Object.entries(H2).map(([e, r]) => `${e} ${r.label}`).join(', ')})`)
L.push('H3 the gamma bubbles of 10-12 ...................... NOT TESTABLE (0DTE contracts no longer served)')
{
  const a35 = anchorScan.find((r) => r.anchor === '09:35')
  L.push(`POST-HOC (P3, independent review): standard VWAP + its σ bands anchored 09:35 instead of 09:30 — line ${a35.line.median.toFixed(2)} ${a35.line.label},`)
  L.push(`  edges ${['E1', 'E2', 'E3', 'E4'].filter((e) => a35[e].label === 'MATCH').length}/4 MATCH, k ${['E1', 'E2', 'E3', 'E4'].map((e) => a35[e].kFit.toFixed(2)).join(' ')}. Found by searching anchors on this chart; tested next chart (addendum 2).`)
}
L.push('')
L.push('§1 MEASUREMENT')
L.push(`  price axis: ${meas.axis.labels.length} labels, ${meas.axis.px_per_point.toFixed(2)} px/point, worst residual ${Math.max(...meas.axis.residual_px.map(Math.abs)).toFixed(2)} px;`)
L.push(`    dashed last-price line reads ${meas.axis.dashed_price_line_price} (chart header: 7801.75)`)
const al = meas.alignment
L.push(`  time axis: ${al.bar_minutes}-minute bars, first visible candle ${meas.candles[0].bar_start_et} ET (cut by the edge), last (forming) ${meas.candles.at(-1).bar_start_et}`)
L.push(`    ${al.used_candles} unobstructed candles: mean |high/low error| ${al.mae_points.toFixed(3)} points (gate 0.35: ${al.gate_0_35 ? 'passed' : 'FAILED'}); runner-up ${al.runner_up.bar_minutes}m start ${al.runner_up.start_bar}: ${al.runner_up.mae_points.toFixed(3)}`)
L.push(`    best per bar size: ${Object.entries(al.best_per_bar_size).map(([m, v]) => `${m}m ${typeof v === 'string' ? '—' : v.mae.toFixed(2)}`).join(', ')}`)
L.push(`  line measured on ${candles.filter((c) => c.line != null).length} candles (hidden inside the 7810 bubble row from ~12:51 to ~13:57)`)
L.push(`  edge dots: ${Object.entries(meas.dots).map(([e, n]) => `${e} ${n}`).join(', ')}`)
L.push('')
L.push('§3 H1 — is the yellow line a standard session VWAP?   d = measured − candidate (points)')
L.push('  id   median|d|  p90|d|   max|d|  mean d    n   label      candidate')
for (const [id, desc] of Object.entries(CANDS)) {
  const r = H1[id]
  L.push(`  ${id}  ${f2(r.median)}  ${f2(r.p90)}  ${f2(r.max)}  ${f2(r.meanSigned)}  ${String(r.n).padStart(3)}   ${r.label.padEnd(9)}  ${desc}`)
}
L.push(`  H1: ${h1Confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'} (V1 ${H1.V1.label}, control V0 ${H1.V0.label})`)
L.push('')
L.push(`§3 H2 — is the shaded zone VWAP ± 1σ / ± 2σ?   on V* = ${vStar}`)
L.push('  edge  model     median|d|  p90|d|   max|d|  mean d    n   label      best-fit k')
for (const [e, r] of Object.entries(H2)) {
  L.push(`  ${e}    ${(r.k > 0 ? '+' : '−') + Math.abs(r.k) + 'σ'}     ${f2(r.median)}  ${f2(r.p90)}  ${f2(r.max)}  ${f2(r.meanSigned)}  ${String(r.n).padStart(3)}   ${r.label.padEnd(9)}  ${r.kFit.toFixed(3)}`)
}
L.push(`  H2: ${h2Confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}`)
L.push('')
L.push('  per candle (points): time  line  V1  V0 |  E1 E2 E3 E4 measured vs model')
for (const c of candles) {
  const x = atCandle(vStar, c.bar_start_et)
  const v1 = atCandle('V1', c.bar_start_et).vwap, v0 = atCandle('V0', c.bar_start_et).vwap
  const ed = Object.entries(EDGES).map(([e, k]) => (c[e] == null ? '      —       ' : `${c[e].toFixed(2)}/${(x.vwap + k * x.sd).toFixed(2)}`)).join(' ')
  L.push(`    ${c.bar_start_et}  ${f2(c.line)} ${f2(v1)} ${f2(v0)} | ${ed}`)
}
L.push('')
L.push('POST-HOC — chosen after seeing H1/H2 (not tests; this chart cannot confirm what was fitted on it)')
L.push('  P1: the zone as V0 ± 1σ / ± 2σ, σ = equal-weight deviation of hlc3 around V0')
L.push('  edge  model     median|d|  p90|d|   max|d|  mean d    n   label      best-fit k')
for (const [e, r] of Object.entries(P1)) {
  L.push(`  ${e}    ${(r.k > 0 ? '+' : '−') + Math.abs(r.k) + 'σ'}     ${f2(r.median)}  ${f2(r.p90)}  ${f2(r.max)}  ${f2(r.meanSigned)}  ${String(r.n).padStart(3)}   ${r.label.padEnd(9)}  ${r.kFit.toFixed(3)}`)
}
L.push('  P2: near variants of V0 for the line')
for (const [name, r] of Object.entries(P2)) L.push(`  ${f2(r.median)}  ${f2(r.p90)}  ${f2(r.max)}  ${f2(r.meanSigned)}  ${String(r.n).padStart(3)}   ${r.label.padEnd(9)}  ${name}`)
L.push('')
L.push(`  P3: standard VWAP (hlc3, SP:SPX volume) and its own ±1σ/±2σ, anchored later — from the independent skeptic review`)
L.push(`      (09:30 bar volume ${(vol930 / 1e6).toFixed(1)}M = ${(vol930 / medVol).toFixed(1)}× the 09:31-09:59 median; it holds the opening-auction prints)`)
L.push('  anchor  line med/p90   E1 +2σ       E2 +1σ       E3 −1σ       E4 −2σ      edges MATCH   best-fit k (E1..E4)')
for (const r of anchorScan.filter((r, i) => i <= 10 || i % 5 === 0)) {
  const ed = ['E1', 'E2', 'E3', 'E4'].map((e) => `${r[e].median.toFixed(2)}/${r[e].p90.toFixed(2)}`.padEnd(11))
  L.push(`  ${r.anchor}   ${r.line.median.toFixed(2)}/${r.line.p90.toFixed(2)} ${r.line.label === 'MATCH' ? 'M' : r.line.label === 'CLOSE' ? 'c' : '-'}  ${ed.join('  ')}  ${['E1', 'E2', 'E3', 'E4'].filter((e) => r[e].label === 'MATCH').length}/4          ${['E1', 'E2', 'E3', 'E4'].map((e) => r[e].kFit.toFixed(2)).join(' ')}`)
}
L.push('  (M = MATCH, c = CLOSE.) Chosen by searching anchors on this one chart: a hypothesis for the next chart, not a result.')
L.push('  Note: V3 is not a real SPY-volume test — the AMEX:SPY 1-minute volume served here totals 2.5M shares for the')
L.push('  session (a partial, non-consolidated feed; consolidated is ~50-80M).')
L.push('')
L.push('§3 H3 — gamma bubbles of 10-12: NOT TESTABLE (0DTE contracts no longer served). Described only:')
for (const r of meas.bubble_rows) {
  L.push(`  ${r.strike} ${r.colour.padEnd(6)} row centre ${r.price_center.toFixed(2)}; height px first ${r.height_first_px}, at the screenshot ${r.height_at_end_px}, max ${r.height_max_px} (x ${r.x_of_max}, ~${meas.candles.reduce((a, c) => (Math.abs(c.cx - r.x_of_max) < Math.abs(a.cx - r.x_of_max) ? c : a)).bar_start_et})`)
}
L.push('')
L.push('Trades (descriptive; three trades are not evidence of anything):')
for (const t of trades) {
  L.push(`  ${t.kind.padEnd(13)} ${t.bar_start_et}  mark tip ${t.tip_price.toFixed(2)}  SPX bar ${t.spx.l.toFixed(2)}–${t.spx.h.toFixed(2)}  nearest bubble row ${t.nearestRow} (${t.dist >= 0 ? '+' : ''}${t.dist.toFixed(2)})`)
}
L.push('  short entries within 1 point of a bubble-row strike: ' + trades.filter((t) => t.kind.startsWith('down')).map((t) => `${t.bar_start_et} ${Math.abs(t.dist) <= 1 ? 'yes' : 'no'}`).join(', '))
L.push('')
L.push(`§4 OGL on ${OGL_DAY} (example only; no vendor chart for this session). Strikes ${want[0]}–${want.at(-1)}, ${chain.filter((c) => want.includes(c.strike)).length} contracts${want.every((k) => have.has(k)) ? '' : ' (some strikes missing)'}`)
L.push('  E in $ millions per 1% move; + yellow (calls dominate), − purple (puts dominate)')
for (const s of oglSnaps) {
  L.push(`  ${s.hm}  SPX ${s.spot.toFixed(2)}  top: ${s.top.map((x) => `${x.strike} ${(x.E / 1e6 >= 0 ? '+' : '')}${(x.E / 1e6).toFixed(0)}`).join('  ')}`)
}
L.push('')
L.push(`POST-HOC, descriptive, ${OGL_DAY} only: share of the session's weight per window`)
L.push('  window:            09:30-10:00  10:00-10:30  10:30-11:30  11:30-13:30  13:30-16:00')
for (const [name, sh] of Object.entries(flowProfile)) L.push(`  ${name.padEnd(17)} ${sh.map((x) => x.toFixed(1).padStart(11)).join('  ')}`)
L.push('  |weighted average − equal-weight average| from 10:00, median / max points:')
for (const [name, g] of Object.entries(flowGap)) L.push(`  ${name.padEnd(17)} ${g.median.toFixed(2)} / ${g.max.toFixed(2)}`)
L.push('  Same-day option volume is spread over the session far more evenly than share volume, so a price')
L.push('  weighted by options flow would sit near the equal-weight line. One day; a hypothesis, not a finding.')
fs.writeFileSync('reports/study15.txt', L.join('\n') + '\n')
fs.writeFileSync('reports/study15.json', JSON.stringify({ H1, h1Confirmed, vStar, H2, h2Confirmed, posthoc: { P1, P2, anchorScan, flowProfile, flowGap }, trades, ogl: { day: OGL_DAY, strikes: ogl.strikes, snaps: oglSnaps } }, null, 1))
console.log(L.join('\n'))
