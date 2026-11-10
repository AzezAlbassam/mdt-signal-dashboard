// Study 10 (PROTOCOL-study10.md): RED and GREEN expectation flags against next-year returns.
//   node scripts/study10-run.js → reports/study10.txt
import fs from 'node:fs'
import { expectationsAt } from '../engine/expectations.js'
import { scoreAt } from '../engine/score.js'
import { signFlipGreater, holm } from '../engine/fairvalue.js'
import { loadUniverse } from './lib/universe.js'

const LAST = '2026-09'
const FIRST = 2012
const MIN = 5

const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  const n = s.length
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const pct = (x) => (x == null ? '     –' : `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`.padStart(7))

function rowsByYear(stocks) {
  const out = new Map()
  for (let y = FIRST; `${y + 1}-05` <= LAST; y += 1) {
    const rows = []
    for (const s of stocks) {
      const a = s.closes.get(`${y}-05`)
      const b = s.closes.get(`${y + 1}-05`)
      if (!(a > 0 && b > 0)) continue
      const e = expectationsAt(s.funds, s.closes, `${y}-05`)
      if (!e) continue
      const sc = scoreAt(s.funds, s.closes, s.sector, `${y}-05`)
      rows.push({ sym: s.sym, flag: e.flag, gap: e.gap, fwd: b / a - 1, score: sc.total })
    }
    out.set(y, rows)
  }
  return out
}

function section(title, byYear, test) {
  const L = [title, 'year   RED median (mean, n)       GREEN median (mean, n)     neutral median (n)     d1 RED−rest   d2 GREEN−rest']
  const d1 = []
  const d2 = []
  for (const [y, rows] of byYear) {
    const red = rows.filter((r) => r.flag === 'red').map((r) => r.fwd)
    const green = rows.filter((r) => r.flag === 'green').map((r) => r.fwd)
    const notRed = rows.filter((r) => r.flag !== 'red').map((r) => r.fwd)
    const notGreen = rows.filter((r) => r.flag !== 'green').map((r) => r.fwd)
    const neutral = rows.filter((r) => r.flag === 'neutral').map((r) => r.fwd)
    const v1 = red.length >= MIN ? median(red) - median(notRed) : null
    const v2 = green.length >= MIN ? median(green) - median(notGreen) : null
    if (v1 != null) d1.push(v1)
    if (v2 != null) d2.push(v2)
    const cell = (a) => `${pct(median(a))} (${pct(mean(a)).trim()}, ${a.length})`.padEnd(27)
    L.push(`${y}   ${cell(red)}${cell(green)}${pct(median(neutral))} (${neutral.length})`.padEnd(100) + `${pct(v1)}       ${pct(v2)}`)
  }
  const p1 = d1.length ? signFlipGreater(d1.map((x) => -x)) : null
  const p2 = d2.length ? signFlipGreater(d2) : null
  L.push(`d1: mean ${pct(mean(d1)).trim()} over ${d1.length} years, below zero in ${d1.filter((x) => x < 0).length}; one-sided p = ${p1?.toFixed(4)}`)
  L.push(`d2: mean ${pct(mean(d2)).trim()} over ${d2.length} years, above zero in ${d2.filter((x) => x > 0).length}; one-sided p = ${p2?.toFixed(4)}`)
  if (test) {
    const [a1, a2] = holm([p1, p2])
    L.push(`Holm: H1 (RED worse) p = ${a1.toFixed(4)} → ${mean(d1) < 0 && a1 < 0.05 ? 'CONFIRMED' : 'NOT CONFIRMED'}; H2 (GREEN better) p = ${a2.toFixed(4)} → ${mean(d2) > 0 && a2 < 0.05 ? 'CONFIRMED' : 'NOT CONFIRMED'}`)
  }
  return L
}

const wl = loadUniverse('data/fv', LAST)
const sp = loadUniverse('data/fv8', LAST)
const all = rowsByYear([...wl.stocks, ...sp.stocks])
const out = [
  'Study 10 — expectation flags (PROTOCOL-study10.md)',
  `RED: implied FCF growth ≥ delivered growth + 10 points, and last year's revenue growth below the 3-year CAGR.`,
  `GREEN: implied ≤ delivered − 10 points, not slowing, revenue still growing. ${wl.stocks.length + sp.stocks.length} US stocks; one date per year (end of May); next-12-month price return.`,
  '',
  ...section('ALL US — confirmatory', all, true),
  '',
  ...section('Watchlist stocks — reported', rowsByYear(wl.stocks), false),
  '',
  ...section('S&P 500 outside watchlists — reported', rowsByYear(sp.stocks), false),
  '',
  'Does RED catch the score\'s blind spot? Stocks with a study 9 score ≥ 7 (all US) — reported',
  'year   score≥7 & RED median (n)    score≥7 not RED median (n)',
]
const hiRed = []
const hiNot = []
for (const [y, rows] of all) {
  const hi = rows.filter((r) => r.score >= 7)
  const a = hi.filter((r) => r.flag === 'red').map((r) => r.fwd)
  const b = hi.filter((r) => r.flag !== 'red').map((r) => r.fwd)
  hiRed.push(...a)
  hiNot.push(...b)
  out.push(`${y}   ${pct(median(a))} (${a.length})`.padEnd(32) + `${pct(median(b))} (${b.length})`)
}
out.push(`pooled: score≥7 & RED median ${pct(median(hiRed)).trim()} (n=${hiRed.length}); score≥7 not RED ${pct(median(hiNot)).trim()} (n=${hiNot.length})`)
out.push('')
out.push('TTD year by year — the example that prompted the study, not evidence')
const ttd = [...wl.stocks, ...sp.stocks].find((s) => s.sym === 'NASDAQ:TTD')
for (let y = 2016; y <= 2026; y += 1) {
  const e = ttd && expectationsAt(ttd.funds, ttd.closes, `${y}-05`)
  const a = ttd?.closes.get(`${y}-05`)
  const b = ttd?.closes.get(`${y + 1}-05`)
  if (e) out.push(`${y}-05  implied ${pct(e.gStar)}  delivered ${pct(e.gReal)}  last year ${pct(e.yoy)}  gap ${pct(e.gap)}  ${e.flag.toUpperCase().padEnd(7)}  next 12m ${b ? pct(b / a - 1) : '   –'}`)
}
fs.writeFileSync(process.env.OUT ?? 'reports/study10.txt', out.join('\n') + '\n')
console.log(out.join('\n'))
