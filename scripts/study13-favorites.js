// POST-HOC (2026-10-20, after study 13's result): study 13's eight zone rules applied to the user's
// favourites (data/favorites/2026-10-20.json, the page's meta/favorites that day). Descriptive only:
// a few dozen stocks cannot confirm or reject anything, and study 13 already found no rule beating
// chance on 815 stocks. The yearly benchmark and Z8's sector medians come from the study 13 universe;
// the five ADRs that universe leaves out (type "dr") are added here as favourites only.
//   node scripts/study13-favorites.js → reports/study13-favorites-posthoc.txt
import fs from 'node:fs'
import path from 'node:path'
import { stateAt, parseFundamentals, monthKey } from '../engine/fairvalue.js'
import { monthlyMultiples, ownPercentile, pegZone, ZONE } from '../engine/zones.js'
import { loadUniverse } from './lib/universe.js'

const LAST = '2026-09'
const YEARS = Array.from({ length: 12 }, (_, i) => 2014 + i)
const C = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7', 'Z8']
const NAME = { Z1: 'P/E history', Z2: 'P/S history', Z3: 'EV/EBITDA history', Z4: 'P/FCF history', Z5: 'Combined Z1–Z4', Z6: 'PEG rule', Z7: 'Price stretch', Z8: 'P/E vs sector' }
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const pct = (x) => (x == null ? '–' : `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`)

// The study 13 universe, one symbol per set of identical accounts.
// A favourite that is the dropped twin (GOOGL) reads its kept twin's accounts under its own name.
const seen = new Map()
const loaded = [...loadUniverse('data/fv', LAST).stocks, ...loadUniverse('data/fv8', LAST).stocks]
const twin = new Map()
const stocks = loaded.filter((s) => {
  const f = s.funds.at(-1)
  const key = `${f.year}|${f.rev}|${f.ni}`
  if (seen.has(key)) { twin.set(s.sym, s); return false }
  seen.set(key, s)
  return true
})
const favs = JSON.parse(fs.readFileSync('data/favorites/2026-10-20.json', 'utf8'))
const bySym = new Map([...stocks, ...twin.values()].map((s) => [s.sym, s]))
// ADRs: loaded from the same raw files, bypassing only the type filter.
const sectors = JSON.parse(fs.readFileSync('data/fv/sectors.json', 'utf8'))
const adrs = []
for (const sym of favs) {
  if (bySym.has(sym) || sectors[sym]?.type !== 'dr') continue
  const f = (d) => path.join('data/fv/raw', d, `${sym.replace(':', '_')}.json`)
  if (!fs.existsSync(f('fin')) || !fs.existsSync(f('px'))) continue
  const b = JSON.parse(fs.readFileSync(f('px'), 'utf8')).bars
  const closes = new Map()
  b.t.forEach((t, i) => { if (monthKey(t) <= LAST && Number.isFinite(b.c[i])) closes.set(monthKey(t), b.c[i]) })
  adrs.push({ sym, sector: sectors[sym].sector ?? null, funds: parseFundamentals(JSON.parse(fs.readFileSync(f('fin'), 'utf8'))), closes, adr: true })
}
const all = [...stocks, ...twin.values(), ...adrs] // twins only as favourites; the medians below use stocks
const profitable = (s, m) => {
  const st = stateAt(s.funds, m)
  return st && st.eps > 0 && s.funds.find((f) => f.year === st.fiscalYear)?.ni > 0 ? st : null
}
for (const s of all) s.series = monthlyMultiples(s.funds, s.closes, s.sector)
const secMed = new Map()
{
  const pes = new Map()
  for (const s of stocks) for (const [m, v] of s.series) {
    if (!s.sector || !(v.pe > 0) || !profitable(s, m)) continue
    const k = `${s.sector}|${m}`
    ;(pes.get(k) ?? pes.set(k, []).get(k)).push(v.pe)
  }
  for (const [k, a] of pes) if (a.length >= 5) secMed.set(k, median(a))
}
for (const s of all) {
  s.rel = new Map()
  for (const [m, v] of s.series) { const md = secMed.get(`${s.sector}|${m}`); if (v.pe > 0 && md > 0) s.rel.set(m, v.pe / md) }
}
function values(s, d) {
  const st = profitable(s, d)
  if (!st) return null
  const p = (k) => ownPercentile(s.series, k, d)
  const v = { Z1: p('pe'), Z2: p('ps'), Z3: p('ev'), Z4: p('pfcf'), Z7: p('stretch'), Z8: ownPercentile(s.rel, null, d) }
  const four = [v.Z1, v.Z2, v.Z3, v.Z4].filter((x) => x != null)
  v.Z5 = four.length >= 2 ? mean(four) : null
  const pe = s.series.get(d)?.pe
  v.Z6 = pe > 0 && st.epsG > 0 ? pe / (100 * st.epsG) : null
  return v
}
const zone = (k, x) => (k === 'Z6' ? pegZone(x) : x == null ? null : x <= ZONE.buy ? 'buy' : x >= ZONE.sell ? 'sell' : null)

// Benchmark: the median 12-month return of the universe's profitable stocks each year.
const bench = new Map(YEARS.map((R) => [R, median(stocks.filter((s) => s.closes.get(`${R}-05`) > 0 && s.closes.get(`${R + 1}-05`) > 0 && profitable(s, `${R}-05`)).map((s) => s.closes.get(`${R + 1}-05`) / s.closes.get(`${R}-05`) - 1))]))
const favStocks = favs.map((sym) => bySym.get(sym) ?? adrs.find((a) => a.sym === sym)).filter(Boolean)
const obs = []
for (const s of favStocks) for (const R of YEARS) {
  const a = s.closes.get(`${R}-05`)
  const b = s.closes.get(`${R + 1}-05`)
  const v = a > 0 && b > 0 && values(s, `${R}-05`)
  if (v) obs.push({ sym: s.sym, R, v, fwd: b / a - 1, beat: b / a - 1 > bench.get(R) })
}

const out = [
  'POST-HOC — study 13 zone rules on the user\'s favourites (descriptive; not a test)',
  `Favourites: ${favs.length}. Included: ${favStocks.length} (${favStocks.filter((s) => s.adr).map((s) => s.sym).join(' ')} added as ADRs). Not included (under 6 fiscal years or 60 months of prices): ${favs.filter((x) => !favStocks.some((s) => s.sym === x)).join(' ')}.`,
  `Stock-years where a favourite was profitable at the end of May 2014–2025 with a 12-month return: ${obs.length}. "Beat" = above that year's median return of the 815-stock universe's profitable stocks.`,
  '',
  'cand  rule                     buy: n  median 12m  beat    sell: n  median 12m  below   buy − sell',
]
for (const k of C) {
  const buy = obs.filter((o) => zone(k, o.v[k]) === 'buy')
  const sell = obs.filter((o) => zone(k, o.v[k]) === 'sell')
  const share = (a, f) => (a.length ? `${Math.round((100 * a.filter(f).length) / a.length)}%` : '–')
  out.push(`${k}    ${NAME[k].padEnd(22)} ${String(buy.length).padStart(6)}  ${pct(median(buy.map((o) => o.fwd))).padStart(10)}  ${share(buy, (o) => o.beat).padStart(4)}   ${String(sell.length).padStart(6)}  ${pct(median(sell.map((o) => o.fwd))).padStart(10)}  ${share(sell, (o) => !o.beat).padStart(5)}   ${buy.length && sell.length ? pct(median(buy.map((o) => o.fwd)) - median(sell.map((o) => o.fwd))) : '–'}`)
}
out.push('', `Where each favourite sits now (${LAST}, fiscal years known by the backtest rule; B = buy zone, S = sell zone, · = between, blank = no value or not profitable):`)
out.push(`stock        ${C.join('  ')}   P/E pctile  combined`)
for (const s of favStocks) {
  const v = values(s, LAST)
  const cell = (k) => (!v || v[k] == null ? '  ' : zone(k, v[k]) === 'buy' ? 'B ' : zone(k, v[k]) === 'sell' ? 'S ' : '· ')
  out.push(`${s.sym.split(':')[1].padEnd(12)} ${C.map(cell).join('  ')}   ${v?.Z1 == null ? '   –' : `${Math.round(100 * v.Z1)}%`.padStart(4)}        ${v?.Z5 == null ? '–' : `${Math.round(100 * v.Z5)}%`}`)
}
out.push('', 'Read with study 13: on 815 stocks no rule beat chance (reports/study13.txt). These favourites are mostly fast growers that rose a lot, so a sell zone often meant "kept rising".')
fs.writeFileSync('reports/study13-favorites-posthoc.txt', out.join('\n') + '\n')
console.log(out.join('\n'))
