// Study 9 (PROTOCOL-study9.md): does the 0–10 score rank stocks by their next 12 months?
//   node scripts/study9-run.js → reports/study9.txt
import fs from 'node:fs'
import { scoreAt } from '../engine/score.js'
import { spearman, signFlipGreater, holm, tTestGreater } from '../engine/fairvalue.js'
import { seededRng } from '../engine/null-models.js'
import { loadUniverse } from './lib/universe.js'

const LAST = '2026-09'
const FIRST = 2012
const MIN_STOCKS = 20

const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  const n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const pct = (x) => (x == null ? '      –' : `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`.padStart(7))
const f3 = (x) => (x == null ? '   n/a' : (x >= 0 ? ' ' : '') + x.toFixed(3))

function panel(stocks) {
  const byYear = new Map()
  for (let y = FIRST; `${y + 1}-05` <= LAST; y += 1) {
    const rows = []
    for (const s of stocks) {
      const a = s.closes.get(`${y}-05`)
      const b = s.closes.get(`${y + 1}-05`)
      if (!(a > 0 && b > 0)) continue
      const sc = scoreAt(s.funds, s.closes, s.sector, `${y}-05`)
      if (sc.total == null) continue
      rows.push({ sym: s.sym, score: sc.total, parts: sc.parts, fwd: b / a - 1 })
    }
    if (rows.length >= MIN_STOCKS) byYear.set(y, rows)
  }
  return byYear
}

function quintiles(rows) {
  const s = [...rows].sort((p, q) => p.score - q.score)
  const n = s.length
  return [0, 1, 2, 3, 4].map((q) => s.slice(Math.floor((q * n) / 5), Math.floor(((q + 1) * n) / 5)))
}

function table(title, byYear, key = (r) => r.score) {
  const L = [title, 'year  stocks     IC   bottom 5th   2nd    3rd    4th   top 5th   top−bottom']
  const ics = []
  const spreads = []
  for (const [y, rows] of byYear) {
    const ic = spearman(rows.map(key), rows.map((r) => r.fwd))
    const qs = quintiles(rows.map((r) => ({ ...r, score: key(r) }))).map((q) => median(q.map((r) => r.fwd)))
    ics.push(ic)
    spreads.push(qs[4] - qs[0])
    L.push(`${y}  ${String(rows.length).padStart(6)}  ${f3(ic)}  ${qs.map(pct).join(' ')}   ${pct(qs[4] - qs[0])}`)
  }
  L.push(`mean IC ${f3(mean(ics))}, positive in ${ics.filter((x) => x > 0).length} of ${ics.length} years; mean top−bottom ${pct(mean(spreads)).trim()}, positive in ${spreads.filter((x) => x > 0).length}`)
  return { L, ics, spreads }
}

const wl = loadUniverse('data/fv', LAST)
const sp = loadUniverse('data/fv8', LAST)
const us = [...wl.stocks, ...sp.stocks]
const usP = panel(us)

const out = [
  'Study 9 — the 0–10 score (PROTOCOL-study9.md): price + quality + growth + safety + direction',
  `US: ${us.length} stocks (watchlist ${wl.stocks.length} + S&P 500 outside watchlists ${sp.stocks.length}). One date per year, end of May; outcome: next 12-month price return.`,
  '',
]

// H1, H2
const main = table('ALL US — confirmatory', usP)
out.push(...main.L)
const prepared = [...usP.values()].map((rows) => ({ s: rows.map((r) => r.score), f: rows.map((r) => r.fwd) }))
const obs = mean(main.ics)
const rng = seededRng(9)
let ge = 0
const N = 10000
for (let k = 0; k < N; k += 1) {
  let acc = 0
  for (const { s, f } of prepared) {
    const sh = [...s]
    for (let i = sh.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      ;[sh[i], sh[j]] = [sh[j], sh[i]]
    }
    acc += spearman(sh, f)
  }
  if (acc / prepared.length >= obs - 1e-12) ge += 1
}
const p1 = (ge + 1) / (N + 1)
const p2 = signFlipGreater(main.spreads)
const [a1, a2] = holm([p1, p2])
const tt = tTestGreater(main.ics)
out.push(`H1 (mean IC > 0): permutation p = ${p1.toFixed(4)}, Holm ${a1.toFixed(4)} → ${obs > 0 && a1 < 0.05 ? 'CONFIRMED' : 'NOT CONFIRMED'}   (t-test of yearly ICs, for reference: t = ${tt.t.toFixed(2)}, p = ${tt.p.toFixed(4)})`)
out.push(`H2 (top − bottom fifth > 0): sign-flip p = ${p2.toFixed(4)}, Holm ${a2.toFixed(4)} → ${mean(main.spreads) > 0 && a2 < 0.05 ? 'CONFIRMED' : 'NOT CONFIRMED'}`)
out.push('')

// Reported, not tested
out.push(...table('Watchlist stocks only — reported', panel(wl.stocks)).L, '')
out.push(...table('S&P 500 outside watchlists only — reported', panel(sp.stocks)).L, '')
out.push('Each part alone, all US — reported (mean IC, years positive)')
for (const part of ['A', 'B', 'C', 'D', 'E']) {
  const t = table('', usP, (r) => r.parts[part])
  const names = { A: 'Price', B: 'Quality', C: 'Growth', D: 'Safety', E: 'Direction' }
  out.push(`  ${part} ${names[part].padEnd(10)} mean IC ${f3(mean(t.ics))}, positive ${t.ics.filter((x) => x > 0).length}/${t.ics.length}; top−bottom ${pct(mean(t.spreads)).trim()}`)
}
out.push('')
const cover = [...usP].map(([y, r]) => `${y}:${r.length}`).join(' ')
out.push(`Coverage (stocks with a score each year): ${cover}`)

if (fs.existsSync('data/fv-sa/sectors.json')) {
  const sa = loadUniverse('data/fv-sa', LAST)
  out.push('', `SAUDI (${sa.stocks.length} testable of ${sa.total}) — reported only; years need ≥ ${MIN_STOCKS} scored stocks`)
  const saP = panel(sa.stocks)
  if (saP.size) out.push(...table('', saP).L)
  else out.push('  No year reaches the minimum; per-year counts below.')
  const counts = []
  for (let y = FIRST; `${y + 1}-05` <= LAST; y += 1) counts.push(`${y}:${sa.stocks.filter((s) => s.closes.get(`${y + 1}-05`) && scoreAt(s.funds, s.closes, s.sector, `${y}-05`).total != null).length}`)
  out.push(`  scored stocks per year: ${counts.join(' ')}`)
  out.push(`  left out: ${Object.entries(sa.excluded).map(([w, l]) => `${w} ${l.length}`).join(', ') || 'none'}`)
}
fs.writeFileSync('reports/study9.txt', out.join('\n') + '\n')
console.log(out.join('\n'))
