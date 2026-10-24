// Study 7, part A (PROTOCOL-study7.md).
//   node scripts/study7-run.js search   → search half only: reports/study7-search.txt, reports/study7-pick.json
//   node scripts/study7-run.js check    → H1 on all testable stocks, H2 on the check half, §A7 tables: reports/study7.txt
// The pick file must be committed before "check" is run (it refuses to run without it).
import fs from 'node:fs'
import path from 'node:path'
import { parseFundamentals, fairValuesAt, variantFair, VARIANTS, METHODS, monthKey, spearman, tTestGreater } from '../engine/fairvalue.js'
import { seededRng } from '../engine/null-models.js'

const stage = process.argv[2]
if (!['search', 'check'].includes(stage)) throw new Error('usage: study7-run.js search|check')

const LAST_COMPLETE = '2026-09' // October 2026 is still forming on the fetch date
const FIRST_YEAR = 2012
const MIN_STOCKS = 10 // a year counts when at least this many stocks have a signal and a return

// ---------------------------------------------------------------- universe (§A1)

const symbols = JSON.parse(fs.readFileSync('data/fv/symbols.json', 'utf8'))
const sectors = JSON.parse(fs.readFileSync('data/fv/sectors.json', 'utf8'))
const file = (dir, sym) => path.join('data/fv/raw', dir, `${sym.replace(':', '_')}.json`)

const excluded = []
const stocks = []
for (const sym of symbols) {
  const info = sectors[sym]
  if (!info) {
    excluded.push([sym, 'no screener row'])
    continue
  }
  if (info.type !== 'stock') {
    excluded.push([sym, `type ${info.type}`])
    continue
  }
  if (!fs.existsSync(file('fin', sym))) {
    excluded.push([sym, 'no annual fundamentals'])
    continue
  }
  const funds = parseFundamentals(JSON.parse(fs.readFileSync(file('fin', sym), 'utf8')))
  const full = funds.filter((f) => f.rev != null && f.eps != null).length
  if (full < 6) {
    excluded.push([sym, `${full} fiscal years with revenue and EPS`])
    continue
  }
  if (!fs.existsSync(file('px', sym))) {
    excluded.push([sym, 'no monthly prices'])
    continue
  }
  const bars = JSON.parse(fs.readFileSync(file('px', sym), 'utf8')).bars
  const closes = new Map()
  bars.t.forEach((t, i) => {
    const m = monthKey(t)
    if (m <= LAST_COMPLETE && Number.isFinite(bars.c[i])) closes.set(m, bars.c[i])
  })
  if (closes.size < 60) {
    excluded.push([sym, `${closes.size} months of prices`])
    continue
  }
  stocks.push({ sym, sector: info.sector ?? null, funds, closes })
}
stocks.sort((a, b) => (a.sym < b.sym ? -1 : 1))
const half = (parity) => stocks.filter((_, i) => i % 2 === parity)
const searchHalf = half(0)
const checkHalf = half(1)

// ---------------------------------------------------------------- signals

const years = []
for (let y = FIRST_YEAR; `${y + 1}-05` <= LAST_COMPLETE; y += 1) years.push(y)

const fvCache = new Map()
function fvOf(s, y) {
  const key = `${s.sym}|${y}`
  if (!fvCache.has(key)) fvCache.set(key, fairValuesAt(s.funds, s.closes, s.sector, `${y}-05`))
  return fvCache.get(key)
}
function fwdOf(s, y) {
  const a = s.closes.get(`${y}-05`)
  const b = s.closes.get(`${y + 1}-05`)
  return a > 0 && b > 0 ? b / a - 1 : null
}

/** Per year: [{ sym, u, fwd, fv }] for stocks where the variant gives a value. */
function panel(group, variant) {
  const out = new Map()
  let stockYears = 0
  for (const y of years) {
    const rows = []
    for (const s of group) {
      const fv = fvOf(s, y)
      const fair = variantFair(fv, variant)
      const fwd = fwdOf(s, y)
      if (fair == null || fwd == null) continue
      rows.push({ sym: s.sym, u: fair / fv.close - 1, fwd, fv })
    }
    stockYears += rows.length
    if (rows.length >= MIN_STOCKS) out.set(y, rows)
  }
  return { byYear: out, stockYears }
}

function icByYear(p) {
  return [...p.byYear].map(([y, rows]) => ({ y, n: rows.length, ic: spearman(rows.map((r) => r.u), rows.map((r) => r.fwd)) }))
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const pct = (x) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`
const f3 = (x) => (x >= 0 ? ' ' : '') + x.toFixed(3)

// ---------------------------------------------------------------- search (§A6)

if (stage === 'search') {
  const lines = [`Study 7 — search half (${searchHalf.length} stocks, even positions). Check half not read.`, '']
  const v0 = panel(searchHalf, 'V0')
  const rows = []
  for (const v of Object.keys(VARIANTS)) {
    const p = v === 'V0' ? v0 : panel(searchHalf, v)
    const ics = icByYear(p)
    rows.push({ v, meanIC: ics.length ? mean(ics.map((r) => r.ic)) : null, years: ics.length, stockYears: p.stockYears })
  }
  lines.push('variant  mean IC  years  stock-years  eligible (≥ half of V0 stock-years)')
  for (const r of rows) lines.push(`${r.v.padEnd(8)} ${r.meanIC == null ? '   n/a' : f3(r.meanIC)}  ${String(r.years).padStart(5)}  ${String(r.stockYears).padStart(11)}  ${r.stockYears >= v0.stockYears / 2 ? 'yes' : 'no'}`)
  const eligible = rows.filter((r) => r.meanIC != null && r.stockYears >= v0.stockYears / 2)
  const pick = eligible.reduce((best, r) => (best == null || r.meanIC > best.meanIC ? r : best), null)
  lines.push('', `pick: ${pick.v} (mean IC ${f3(pick.meanIC)} on the search half)`)
  fs.writeFileSync('reports/study7-search.txt', lines.join('\n') + '\n')
  fs.writeFileSync('reports/study7-pick.json', JSON.stringify({ pick: pick.v, searchMeanIC: pick.meanIC, searchStocks: searchHalf.map((s) => s.sym), table: rows }, null, 1) + '\n')
  console.log(lines.join('\n'))
  process.exit(0)
}

// ---------------------------------------------------------------- check: H1, H2, §A7

const pickFile = 'reports/study7-pick.json'
if (!fs.existsSync(pickFile)) throw new Error('run "search" and commit reports/study7-pick.json first')
const { pick } = JSON.parse(fs.readFileSync(pickFile, 'utf8'))

const L = []
L.push('Study 7 — fair value indicator on the user\'s watchlist stocks (PROTOCOL-study7.md)')
L.push(`Testable stocks: ${stocks.length} of ${symbols.length} watchlist symbols. Rebalance: end of May ${years[0]}–${years[years.length - 1]}, 12-month price return.`)
L.push(`Data cutoff: last completed month ${LAST_COMPLETE}. Search half ${searchHalf.length}, check half ${checkHalf.length}.`)
L.push('')

// H1
const all0 = panel(stocks, 'V0')
const ics = icByYear(all0)
const obs = mean(ics.map((r) => r.ic))
const rng = seededRng(7)
const prepared = [...all0.byYear.values()].map((rows) => ({ u: rows.map((r) => r.u), fwd: rows.map((r) => r.fwd) }))
let ge = 0
const N = 10000
for (let k = 0; k < N; k += 1) {
  let s = 0
  for (const { u, fwd } of prepared) {
    const sh = [...u]
    for (let i = sh.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      ;[sh[i], sh[j]] = [sh[j], sh[i]]
    }
    s += spearman(sh, fwd)
  }
  if (s / prepared.length >= obs - 1e-12) ge += 1
}
const pPerm = (ge + 1) / (N + 1)
const tt = tTestGreater(ics.map((r) => r.ic))
const h1 = obs > 0 && pPerm < 0.05 && tt.p < 0.05
L.push('H1 — does the published indicator (V0) rank stocks by their next 12 months? (all testable stocks)')
L.push('year  stocks     IC')
for (const r of ics) L.push(`${r.y}  ${String(r.n).padStart(6)}  ${f3(r.ic)}`)
L.push(`mean IC ${f3(obs)} over ${ics.length} years, ${all0.stockYears} stock-years`)
L.push(`permutation (within year, ${N} shuffles, seed 7): one-sided p = ${pPerm.toFixed(4)}`)
L.push(`t-test of yearly ICs: t = ${tt.t.toFixed(2)}, df = ${tt.df}, one-sided p = ${tt.p.toFixed(4)}`)
L.push(`H1: ${h1 ? 'CONFIRMED' : 'NOT CONFIRMED'}`)
L.push('')

// H2
L.push(`H2 — the pick from the search half (${pick}) against V0, on the check half only`)
if (pick === 'V0') {
  L.push('The search picked V0 itself: no improvement found.')
} else {
  const icA = new Map(icByYear(panel(checkHalf, pick)).map((r) => [r.y, r.ic]))
  const icB = new Map(icByYear(panel(checkHalf, 'V0')).map((r) => [r.y, r.ic]))
  const common = [...icA.keys()].filter((y) => icB.has(y))
  const diffs = common.map((y) => icA.get(y) - icB.get(y))
  const d = mean(diffs)
  let geq = 0
  let total = 0
  const n = diffs.length
  if (n <= 20) {
    for (let mask = 0; mask < 1 << n; mask += 1) {
      const s = diffs.reduce((a, x, i) => a + (mask & (1 << i) ? -x : x), 0) / n
      if (s >= d - 1e-12) geq += 1
      total += 1
    }
  }
  const p2 = geq / total
  L.push('year  IC pick   IC V0    diff')
  common.forEach((y, i) => L.push(`${y}  ${f3(icA.get(y))}  ${f3(icB.get(y))}  ${f3(diffs[i])}`))
  L.push(`mean difference ${f3(d)} over ${n} years; sign-flip (all ${total} flips) one-sided p = ${p2.toFixed(4)}`)
  L.push(`H2: ${d > 0 && p2 < 0.05 ? 'CONFIRMED — the pick beats the published blend on unseen stocks' : 'NOT CONFIRMED'}`)
}
L.push('')

// §A7 zones
L.push('Reported, not tested — mean 12-month return by zone (V0, all testable stocks)')
L.push('year   below green (<0.8×fair)   between      above red (>1.2×fair)   all')
for (const [y, rows] of all0.byYear) {
  const z = (f) => {
    const r = rows.filter(f)
    return r.length ? `${pct(mean(r.map((x) => x.fwd))).padStart(7)} (n=${String(r.length).padStart(3)})` : '      – (n=  0)'
  }
  L.push(`${y}   ${z((r) => r.u > 0.25)}        ${z((r) => r.u <= 0.25 && r.u >= -1 / 6)}   ${z((r) => r.u < -1 / 6)}        ${z(() => true)}`)
}
L.push('(price < 0.8×fair ⇔ upside > +25%; price > 1.2×fair ⇔ upside < −16.7%)')
L.push('')

// §A7 per method and per company type
L.push('Reported, not tested — every candidate on all testable stocks (mean IC, years, stock-years)')
for (const v of Object.keys(VARIANTS)) {
  const p = panel(stocks, v)
  const r = icByYear(p)
  L.push(`${v.padEnd(4)} ${r.length ? f3(mean(r.map((x) => x.ic))) : '   n/a'}  ${String(r.length).padStart(3)}  ${String(p.stockYears).padStart(5)}`)
}
L.push('  V1 P/E own · V2 PEG · V3 DCF · V4 EV/EBITDA own · V5 P/S own · V6 P/E on 5y EPS · V7 all equal · V8 own-history · V9 PEG+DCF')
L.push('')
L.push('Per company type (V0, all testable stocks): mean IC over years with ≥ 10 stocks of that type')
const types = [...new Set([...all0.byYear.values()].flat().map((r) => r.fv.profile))]
for (const t of types) {
  const r = []
  let sy = 0
  for (const [y, rows] of all0.byYear) {
    const sub = rows.filter((x) => x.fv.profile === t)
    sy += sub.length
    if (sub.length >= MIN_STOCKS) r.push(spearman(sub.map((x) => x.u), sub.map((x) => x.fwd)))
  }
  L.push(`${t.padEnd(22)} ${r.length ? f3(mean(r)) : '   n/a'}  years ${r.length}  stock-years ${sy}`)
}
L.push('')
L.push(`Methods with a value in V0 stock-years: ${METHODS.map((m) => `${m} ${[...all0.byYear.values()].flat().filter((x) => x.fv.values[m] > 0).length}`).join(', ')}`)
L.push('')
L.push(`Left out (${excluded.length}):`)
const reasons = {}
for (const [s, why] of excluded) (reasons[why.replace(/^\d+ /, 'N ')] ??= []).push(s.split(':')[1])
for (const [why, list] of Object.entries(reasons)) L.push(`- ${why}: ${list.length} — ${list.join(' ')}`)

fs.writeFileSync(process.env.OUT ?? 'reports/study7.txt', L.join('\n') + '\n')
console.log(L.slice(0, 40).join('\n'))
