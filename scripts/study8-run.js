// Study 8 (PROTOCOL-study8.md): below the green line AND above the 10-month average.
//   node scripts/study8-run.js → reports/study8.txt
// H1 and H2 on the fresh universe (data/fv8: S&P 500 minus the user's watchlists); the
// watchlist stocks (data/fv, study 7's universe) are reported alongside, not tested.
import fs from 'node:fs'
import path from 'node:path'
import { parseFundamentals, fairValuesAt, variantFair, monthKey, trendUp, signFlipGreater, holm } from '../engine/fairvalue.js'

const LAST_COMPLETE = '2026-09'
const FIRST_YEAR = 2012
const MIN_GROUP = 5

function loadUniverse(dir) {
  const symbols = JSON.parse(fs.readFileSync(path.join(dir, 'symbols.json'), 'utf8'))
  const sectors = JSON.parse(fs.readFileSync(path.join(dir, 'sectors.json'), 'utf8'))
  const file = (d, s) => path.join(dir, 'raw', d, `${s.replace(':', '_')}.json`)
  const stocks = []
  const excluded = {}
  const out = (why, s) => (excluded[why] ??= []).push(s)
  for (const sym of symbols) {
    if (!sectors[sym]) { out('no screener row', sym); continue }
    if (sectors[sym].type !== 'stock') { out(`type ${sectors[sym].type}`, sym); continue }
    if (!fs.existsSync(file('fin', sym))) { out('no annual fundamentals', sym); continue }
    const funds = parseFundamentals(JSON.parse(fs.readFileSync(file('fin', sym), 'utf8')))
    if (funds.filter((f) => f.rev != null && f.eps != null).length < 6) { out('under 6 fiscal years', sym); continue }
    if (!fs.existsSync(file('px', sym))) { out('no monthly prices', sym); continue }
    const b = JSON.parse(fs.readFileSync(file('px', sym), 'utf8')).bars
    const closes = new Map()
    b.t.forEach((t, i) => {
      const m = monthKey(t)
      if (m <= LAST_COMPLETE && Number.isFinite(b.c[i])) closes.set(m, b.c[i])
    })
    if (closes.size < 60) { out('under 60 months of prices', sym); continue }
    stocks.push({ sym, sector: sectors[sym].sector ?? null, funds, closes })
  }
  return { stocks, excluded, total: symbols.length }
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  const n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const pct = (x) => (x == null ? '      –' : `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`.padStart(7))

function yearly(stocks) {
  const rows = []
  for (let y = FIRST_YEAR; `${y + 1}-05` <= LAST_COMPLETE; y += 1) {
    const m = `${y}-05`
    const up = []
    const down = []
    const all = []
    for (const s of stocks) {
      const a = s.closes.get(m)
      const b = s.closes.get(`${y + 1}-05`)
      if (!(a > 0 && b > 0)) continue
      const fair = variantFair(fairValuesAt(s.funds, s.closes, s.sector, m), 'V0')
      if (fair == null) continue
      const fwd = b / a - 1
      all.push(fwd)
      if (a < 0.8 * fair) {
        const t = trendUp(s.closes, m)
        if (t === true) up.push(fwd)
        else if (t === false) down.push(fwd)
      }
    }
    rows.push({ y, up, down, all })
  }
  return rows
}

function section(title, stocks, test) {
  const rows = yearly(stocks)
  const L = [title, 'year   G-up median (mean, n)        G-down median (mean, n)      All median (mean, n)        d1       d2']
  const d1 = []
  const d2 = []
  for (const r of rows) {
    const cell = (a) => (a.length ? `${pct(median(a))} (${pct(mean(a)).trim()}, ${a.length})` : '      – (0)').padEnd(27)
    const ok1 = r.up.length >= MIN_GROUP && r.down.length >= MIN_GROUP
    const ok2 = r.up.length >= MIN_GROUP && r.all.length >= MIN_GROUP
    const v1 = ok1 ? median(r.up) - median(r.down) : null
    const v2 = ok2 ? median(r.up) - median(r.all) : null
    if (v1 != null) d1.push(v1)
    if (v2 != null) d2.push(v2)
    L.push(`${r.y}   ${cell(r.up)}  ${cell(r.down)}  ${cell(r.all)}  ${pct(v1)}  ${pct(v2)}`)
  }
  const p1 = d1.length ? signFlipGreater(d1) : null
  const p2 = d2.length ? signFlipGreater(d2) : null
  L.push(`d1 (G-up − G-down): mean ${pct(mean(d1)).trim()} over ${d1.length} years, positive in ${d1.filter((x) => x > 0).length}; sign-flip p = ${p1?.toFixed(4)}`)
  L.push(`d2 (G-up − All):    mean ${pct(mean(d2)).trim()} over ${d2.length} years, positive in ${d2.filter((x) => x > 0).length}; sign-flip p = ${p2?.toFixed(4)}`)
  if (test) {
    const [a1, a2] = holm([p1, p2])
    L.push(`Holm-adjusted: H1 p = ${a1.toFixed(4)} → ${mean(d1) > 0 && a1 < 0.05 ? 'CONFIRMED' : 'NOT CONFIRMED'}; H2 p = ${a2.toFixed(4)} → ${mean(d2) > 0 && a2 < 0.05 ? 'CONFIRMED' : 'NOT CONFIRMED'}`)
  }
  return L
}

const fresh = loadUniverse('data/fv8')
const watch = loadUniverse('data/fv')
const L = [
  'Study 8 — below the green line (price < 0.8 × fair) AND above the 10-month average (PROTOCOL-study8.md)',
  'One date per year: end of May; outcome: price return over the next 12 months. Medians; mean in brackets.',
  `Fresh universe: S&P 500 on 2026-10-12 minus the user's watchlists (MidCap 400 filter not supported by the screener): ${fresh.stocks.length} testable of ${fresh.total}.`,
  '',
  ...section('FRESH STOCKS — confirmatory (H1: d1 > 0, H2: d2 > 0)', fresh.stocks, true),
  '',
  ...section(`WATCHLIST STOCKS (${watch.stocks.length}) — not independent: the idea came from these stocks. Not tested.`, watch.stocks, false),
  '',
  'Fresh universe, left out:',
  ...Object.entries(fresh.excluded).map(([why, l]) => `- ${why}: ${l.length} — ${l.map((s) => s.split(':')[1]).join(' ')}`),
]
fs.writeFileSync('reports/study8.txt', L.join('\n') + '\n')
console.log(L.join('\n'))
