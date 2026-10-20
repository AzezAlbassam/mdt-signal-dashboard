// Study 13 (PROTOCOL-study13.md): which own-history zone best marks a profitable company's next
// 12 months? Eight candidates, buy zone minus sell zone each year, sign-flip over years, Holm.
//   node scripts/study13-run.js → reports/study13.txt
import fs from 'node:fs'
import { stateAt, spearman, signFlipGreater, holm, addMonths } from '../engine/fairvalue.js'
import { monthlyMultiples, ownPercentile, zoneOf, pegZone, ZONE } from '../engine/zones.js'
import { loadUniverse } from './lib/universe.js'

const LAST = '2026-09'
const YEARS = Array.from({ length: 12 }, (_, i) => 2014 + i)
const MIN_ZONE = 10
const MIN_YEARS = 10
const MIN_SECTOR = 5
const C = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7', 'Z8']
const NAME = { Z1: 'P/E history', Z2: 'P/S history', Z3: 'EV/EBITDA history', Z4: 'P/FCF history', Z5: 'Combined Z1–Z4', Z6: 'PEG rule (<1 / >2)', Z7: 'Price stretch (48 months)', Z8: 'P/E against its sector' }

const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  const n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const pct = (x, w = 7) => (x == null || !Number.isFinite(x) ? '–'.padStart(w) : `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`.padStart(w))

const wl = loadUniverse('data/fv', LAST)
const sp = loadUniverse('data/fv8', LAST)
// One symbol per set of identical accounts (GOOG/GOOGL, BRK.A/BRK.B, …): the first in load order
// (watchlist folder first) among stocks whose latest fiscal year has the same revenue and net income,
// as scripts/sector-pe.js does.
const seen = new Set()
const dupes = []
const stocks = [...wl.stocks.map((s) => ({ ...s, u: 'wl' })), ...sp.stocks.map((s) => ({ ...s, u: 'sp' }))].filter((s) => {
  const f = s.funds.at(-1)
  const key = `${f.year}|${f.rev}|${f.ni}`
  if (seen.has(key)) { dupes.push(s.sym); return false }
  seen.add(key)
  return true
})

// Profitable at m: the fiscal year known then has net income > 0 and EPS > 0.
const profitable = (s, m) => {
  const st = stateAt(s.funds, m)
  return st && st.eps > 0 && s.funds.find((f) => f.year === st.fiscalYear)?.ni > 0 ? st : null
}
for (const s of stocks) s.series = monthlyMultiples(s.funds, s.closes, s.sector)

// Z8: P/E ÷ that month's median P/E of the profitable stocks in the same sector (at least 5).
const sectorMedian = new Map()
{
  const pes = new Map()
  for (const s of stocks) {
    if (!s.sector) continue
    for (const [m, v] of s.series) {
      if (!(v.pe > 0) || !profitable(s, m)) continue
      const k = `${s.sector}|${m}`
      ;(pes.get(k) ?? pes.set(k, []).get(k)).push(v.pe)
    }
  }
  for (const [k, a] of pes) if (a.length >= MIN_SECTOR) sectorMedian.set(k, median(a))
}
for (const s of stocks) {
  s.rel = new Map()
  for (const [m, v] of s.series) {
    const md = sectorMedian.get(`${s.sector}|${m}`)
    if (v.pe > 0 && md > 0) s.rel.set(m, v.pe / md)
  }
}

// One row per stock and year: each candidate's value (a percentile, or PEG for Z6) and zone.
function rows(R, pool = stocks) {
  const d = `${R}-05`
  const out = []
  for (const s of pool) {
    const a = s.closes.get(d)
    const b = s.closes.get(`${R + 1}-05`)
    const st = a > 0 && b > 0 && profitable(s, d)
    if (!st) continue
    const p = (k) => ownPercentile(s.series, k, d)
    const v = { Z1: p('pe'), Z2: p('ps'), Z3: p('ev'), Z4: p('pfcf'), Z7: p('stretch'), Z8: ownPercentile(s.rel, null, d) }
    const four = [v.Z1, v.Z2, v.Z3, v.Z4].filter((x) => x != null)
    v.Z5 = four.length >= 2 ? mean(four) : null
    const pe = s.series.get(d)?.pe
    v.Z6 = pe > 0 && st.epsG > 0 ? pe / (100 * st.epsG) : null
    const c3 = s.closes.get(`${R + 3}-05`)
    out.push({ sym: s.sym, u: s.u, v, fwd: b / a - 1, fwd3: R <= 2023 && c3 > 0 ? c3 / a - 1 : null })
  }
  return out
}
const zone = (k, x, lo = ZONE.buy, hi = ZONE.sell) => (k === 'Z6' ? pegZone(x) : x == null ? null : x <= lo ? 'buy' : x >= hi ? 'sell' : null)

function spread(rs, k, f = (r) => r.fwd, lo, hi) {
  const buy = rs.filter((r) => zone(k, r.v[k], lo, hi) === 'buy' && f(r) != null).map(f)
  const sell = rs.filter((r) => zone(k, r.v[k], lo, hi) === 'sell' && f(r) != null).map(f)
  return { D: buy.length >= MIN_ZONE && sell.length >= MIN_ZONE ? median(buy) - median(sell) : null, nb: buy.length, ns: sell.length }
}

const byYear = new Map(YEARS.map((R) => [R, rows(R)]))
const out = [
  'Study 13 — buy and sell zones for profitable companies (PROTOCOL-study13.md)',
  `US: ${stocks.length} stocks (watchlist ${wl.stocks.length} + S&P 500 outside watchlists ${sp.stocks.length}, less ${dupes.length} second share classes: ${dupes.join(' ')}). End of May ${YEARS[0]}–${YEARS.at(-1)}; outcome: next 12-month price return.`,
  `Zones: own-history percentile ≤ ${ZONE.buy} buy, ≥ ${ZONE.sell} sell (≥ ${ZONE.minMonths} earlier months); Z6 PEG < 1 buy, > 2 sell. D = median buy − median sell; a year counts with ≥ ${MIN_ZONE} stocks per zone.`,
  '',
]

const res = {}
for (const k of C) {
  out.push(`${k} ${NAME[k]}`, 'year  profitable  buy  sell        D    36m D       IC')
  const Ds = []
  const D3 = []
  const ics = []
  const hits = { buy: [0, 0], sell: [0, 0] }
  for (const [R, rs] of byYear) {
    const s = spread(rs, k)
    const s3 = spread(rs, k, (r) => r.fwd3)
    const has = rs.filter((r) => r.v[k] != null)
    const sign = (x) => -x // cheaper (lower percentile, lower PEG) = higher
    const ic = has.length >= 20 ? spearman(has.map((r) => sign(r.v[k])), has.map((r) => r.fwd)) : null
    if (s.D != null) Ds.push([R, s.D])
    if (s3.D != null) D3.push(s3.D)
    if (ic != null) ics.push(ic)
    const med = median(rs.map((r) => r.fwd))
    for (const r of rs) {
      const z = zone(k, r.v[k])
      if (z) { hits[z][1] += 1; if (z === 'buy' ? r.fwd > med : r.fwd < med) hits[z][0] += 1 }
    }
    out.push(`${R}  ${String(rs.length).padStart(10)}  ${String(s.nb).padStart(3)}  ${String(s.ns).padStart(4)}  ${pct(s.D)}  ${pct(s3.D)}  ${ic == null ? '      –' : (ic >= 0 ? ' ' : '') + ic.toFixed(3).padStart(6)}`)
  }
  const d = Ds.map(([, x]) => x)
  const half = (a, b) => { const x = Ds.filter(([R]) => R >= a && R <= b).map(([, v]) => v); return x.length ? mean(x) : null }
  res[k] = { byYear: Object.fromEntries(Ds), years: d.length, meanD: d.length ? mean(d) : null, pos: d.filter((x) => x > 0).length, p: d.length >= MIN_YEARS ? signFlipGreater(d) : null, D3: D3.length ? mean(D3) : null, ic: ics.length ? mean(ics) : null, h1: half(2014, 2019), h2: half(2020, 2025), hits }
  const r = res[k]
  out.push(`mean D ${pct(r.meanD).trim()} over ${r.years} years (positive ${r.pos}); 36-month D ${pct(r.D3).trim()}; mean IC ${r.ic == null ? '–' : r.ic.toFixed(3)}; halves 2014–19 ${pct(r.h1).trim()}, 2020–25 ${pct(r.h2).trim()}`)
  out.push(`hit rate: buy zone beat the year's median ${hits.buy[1] ? ((100 * hits.buy[0]) / hits.buy[1]).toFixed(0) : '–'}% of ${hits.buy[1]}; sell zone below it ${hits.sell[1] ? ((100 * hits.sell[0]) / hits.sell[1]).toFixed(0) : '–'}% of ${hits.sell[1]}`, '')
}

// H_Z1 … H_Z8, Holm over the testable candidates.
const testable = C.filter((k) => res[k].p != null)
const adj = holm(testable.map((k) => res[k].p))
testable.forEach((k, i) => { res[k].adj = adj[i] })
out.push('HYPOTHESES (mean D > 0; exact sign-flip over years, one-sided; Holm over the testable candidates)')
for (const k of C) {
  const r = res[k]
  if (r.p == null) { out.push(`  H_${k} ${NAME[k].padEnd(26)} not testable (${r.years} years with ≥ ${MIN_ZONE} stocks per zone)`); continue }
  r.ok = r.meanD > 0 && r.adj < 0.05
  out.push(`  H_${k} ${NAME[k].padEnd(26)} mean D ${pct(r.meanD)}  p ${r.p.toFixed(4)}  Holm ${r.adj.toFixed(4)} → ${r.ok ? 'CONFIRMED' : 'NOT CONFIRMED'}`)
}
// Most accurate: the largest mean D over the years in which every confirmed candidate counts; tie → lower k.
const ok = C.filter((k) => res[k].ok)
const both = YEARS.filter((R) => ok.every((k) => res[k].byYear[R] != null))
const onBoth = (k) => mean(both.map((R) => res[k].byYear[R]))
const best = ok.length ? ok.reduce((b, k) => (onBoth(k) > onBoth(b) ? k : b)) : null
out.push(best ? `Most accurate (confirmed; mean D over the ${both.length} years all ${ok.length} confirmed count): ${best} ${NAME[best]}${ok.length > 1 ? ` — ${ok.map((k) => `${k} ${pct(onBoth(k)).trim()}`).join(', ')}` : ''}` : 'No candidate confirmed: no zone rule beat chance in this test.', '')

// Reported, not tested.
out.push('REPORTED — mean D by universe, on the common set (Z1–Z4 all present), and with 10% / 90% zones')
const sub = (u) => new Map(YEARS.map((R) => [R, byYear.get(R).filter((r) => r.u === u)]))
const common = new Map(YEARS.map((R) => [R, byYear.get(R).filter((r) => ['Z1', 'Z2', 'Z3', 'Z4'].every((k) => r.v[k] != null))]))
const meanSpread = (by, k, lo, hi) => { const d = [...by.values()].map((rs) => spread(rs, k, (r) => r.fwd, lo, hi).D).filter((x) => x != null); return d.length ? `${pct(mean(d)).trim()} (${d.length}y)` : '–' }
out.push('cand  watchlist        S&P 500          common set       10/90 zones')
for (const k of C) out.push(`${k}    ${meanSpread(sub('wl'), k).padEnd(16)} ${meanSpread(sub('sp'), k).padEnd(16)} ${k <= 'Z5' ? meanSpread(common, k).padEnd(16) : '–'.padEnd(16)} ${k === 'Z6' ? '–' : meanSpread(byYear, k, 0.1, 0.9)}`)
out.push('', 'Limits: survivorship (today\'s listed stocks only); price return without dividends; annual fundamentals only (the live page reads the last twelve months from quarters); one date a year.')

fs.writeFileSync(process.env.OUT ?? 'reports/study13.txt', out.join('\n') + '\n')
fs.writeFileSync(process.env.OUT_JSON ?? 'reports/study13.json', JSON.stringify(res, null, 1))
console.log(out.join('\n'))
