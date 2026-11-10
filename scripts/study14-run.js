// Study 14 (PROTOCOL-study14.md): do four ranks from the research literature sort the next 12
// months? Top minus bottom fifth each May, exact sign-flip over years, Holm over four.
//   node scripts/study14-run.js → reports/study14.txt, reports/study14.json
import fs from 'node:fs'
import path from 'node:path'
import { stateAt, spearman, signFlipGreater, holm, addMonths, monthKey } from '../engine/fairvalue.js'
import { scoreAt } from '../engine/score.js'
import { percentiles, sectorPercentiles, nearHigh, momentum, residualMomentum, assetsByYear } from '../engine/ranks.js'
import { loadUniverse } from './lib/universe.js'

const LAST = '2026-09'
const MIN_POOL = 100
const MIN_YEARS = 10
const TESTED = ['T1', 'T2', 'T3', 'T4']
const ALL = ['T1', 'T2', 'T3', 'T4', 'R1', 'R2', 'R3', 'R4']
const NAME = { T1: 'Near 52-week high', T2: 'Gross profit ÷ assets', T3: 'Net share issuance', T4: 'Profitable value', R1: '12-1 momentum', R2: 'Residual momentum', R3: 'Value composite', R4: 'Value + momentum' }
const YEARS = { T1: [2001, 2025], T2: [2011, 2025], T3: [2012, 2025], T4: [2011, 2025], R1: [2001, 2025], R2: [2003, 2025], R3: [2011, 2025], R4: [2011, 2025] }
const HALVES = { T1: [2012, 2013], R1: [2012, 2013], R2: [2013, 2014], T2: [2017, 2018], T4: [2017, 2018], R3: [2017, 2018], R4: [2017, 2018], T3: [2018, 2019] }
const PRICE = ['T1', 'R1', 'R2']

const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`)
const pos = (x) => Number.isFinite(x) && x > 0
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

// Universe: study 13's dedupe.
const seen = new Set()
const stocks = [...loadUniverse('data/fv', LAST).stocks.map((s) => ({ ...s, u: 'wl', dir: 'data/fv' })), ...loadUniverse('data/fv8', LAST).stocks.map((s) => ({ ...s, u: 'sp', dir: 'data/fv8' }))].filter((s) => {
  const f = s.funds.at(-1)
  const key = `${f.year}|${f.rev}|${f.ni}`
  return seen.has(key) ? false : (seen.add(key), true)
})
let withAssets = 0
let assetYears = 0
let assetFiles = 0
for (const s of stocks) {
  const file = (d) => path.join(s.dir, 'raw', d, `${s.sym.replace(':', '_')}.json`)
  const b = JSON.parse(fs.readFileSync(file('px'), 'utf8')).bars
  s.highs = new Map()
  b.t.forEach((t, i) => { if (monthKey(t) <= LAST && Number.isFinite(b.h?.[i])) s.highs.set(monthKey(t), b.h[i]) })
  const a = fs.existsSync(file('assets')) ? JSON.parse(fs.readFileSync(file('assets'), 'utf8')) : null
  if (a) assetFiles += 1
  s.assets = assetsByYear(s.funds, a?.total_assets_fy_h, a?.total_revenue_fy_h)
  if (s.assets.size) { withAssets += 1; assetYears += s.assets.size }
}
// Equal-weighted mean monthly return of the universe stocks with closes at m−1 and m.
const market = new Map()
for (let m = '2000-04'; m <= LAST; m = addMonths(m, 1)) {
  const r = stocks.map((s) => [s.closes.get(addMonths(m, -1)), s.closes.get(m)]).filter(([a, b]) => pos(a) && pos(b)).map(([a, b]) => b / a - 1)
  if (r.length) market.set(m, mean(r))
}

const globalPct = (entries) => { // entries: [sym, x] → Map(sym → percentile)
  const ok = entries.filter(([, x]) => Number.isFinite(x))
  const p = percentiles(ok.map(([, x]) => x))
  return new Map(ok.map(([k], i) => [k, p[i]]))
}
const sectorThenGlobal = (rows) => globalPct([...sectorPercentiles(rows)]) // rows {key, sector, x}

/** Final percentiles of every candidate at month d over `group` (ranked set: a value and a close at d). */
function rankAt(d, group, withFundamentals = d.endsWith('-05')) {
  const ranked = group.filter((s) => pos(s.closes.get(d)))
  const out = Object.fromEntries(ALL.map((k) => [k, new Map()]))
  out.T1 = globalPct(ranked.map((s) => [s.sym, nearHigh(s.closes, s.highs, d)]))
  out.R1 = globalPct(ranked.map((s) => [s.sym, momentum(s.closes, d)]))
  out.R2 = globalPct(ranked.map((s) => [s.sym, residualMomentum(s.closes, market, d)]))
  if (!withFundamentals) return out
  const T2 = []; const T3 = []; const EY = []; const FY = []; const EBY = []
  for (const s of ranked) {
    const st = stateAt(s.funds, d)
    if (!st) continue
    const c = s.closes.get(d)
    const fin = s.sector === 'Finance'
    const f0 = s.funds.find((f) => f.year === st.fiscalYear)
    const f1 = s.funds.find((f) => f.year === st.fiscalYear - 1)
    const ta = s.assets.get(st.fiscalYear)
    if (!fin && pos(ta) && Number.isFinite(f0?.gp)) T2.push({ key: s.sym, sector: s.sector, x: f0.gp / ta })
    if (f0 && f1 && pos(f0.shares) && pos(f1.shares) && Math.abs(f0.eps) >= 0.25 && Math.abs(f1.eps) >= 0.25 && Math.sign(f0.eps) === Math.sign(f1.eps)) T3.push({ key: s.sym, sector: s.sector, x: -Math.log(f0.shares / f1.shares) })
    if (Number.isFinite(st.eps)) EY.push({ key: s.sym, sector: s.sector, x: st.eps / c })
    if (!fin && pos(st.shares)) {
      if (Number.isFinite(st.fcfPS)) FY.push({ key: s.sym, sector: s.sector, x: st.fcfPS / c })
      const ev = c * st.shares + st.debt
      if (Number.isFinite(st.ebitda) && pos(ev)) EBY.push({ key: s.sym, sector: s.sector, x: st.ebitda / ev })
    }
  }
  out.T2 = sectorThenGlobal(T2)
  out.T3 = sectorThenGlobal(T3)
  const [pEY, pFY, pEBY] = [EY, FY, EBY].map((r) => sectorPercentiles(r))
  const vRows = []
  for (const s of ranked) {
    const parts = s.sector === 'Finance' ? [pEY.get(s.sym)] : [pEY.get(s.sym), pFY.get(s.sym), pEBY.get(s.sym)]
    const have = parts.filter((x) => x != null)
    const score = s.sector === 'Finance' ? have[0] : have.length >= 2 ? mean(have) : null
    if (score != null) vRows.push({ key: s.sym, sector: s.sector, x: score })
  }
  out.R3 = sectorThenGlobal(vRows)
  out.T4 = globalPct(ranked.filter((s) => s.sector !== 'Finance' && out.R3.has(s.sym) && out.T2.has(s.sym)).map((s) => [s.sym, (out.R3.get(s.sym) + out.T2.get(s.sym)) / 2]))
  out.R4 = globalPct(ranked.filter((s) => out.R3.has(s.sym) && out.R1.has(s.sym)).map((s) => [s.sym, (out.R3.get(s.sym) + out.R1.get(s.sym)) / 2]))
  return out
}

const fwdOf = (s, d, k = 12) => { const a = s.closes.get(d); const b = s.closes.get(addMonths(d, k)); return pos(a) && pos(b) ? b / a - 1 : null }
/** D over a pool: [{ p, f }] (percentile, outcome); null below the pool floor. */
function spread(pool, floor = MIN_POOL, perSide = 0) {
  if (pool.length < floor) return null
  const buy = pool.filter((r) => r.p >= 0.8).map((r) => r.f)
  const sell = pool.filter((r) => r.p <= 0.2).map((r) => r.f)
  if (buy.length < Math.max(1, perSide) || sell.length < Math.max(1, perSide)) return null
  return { D: median(buy) - median(sell), buy, sell, med: median(pool.map((r) => r.f)) }
}

// Main May cross-sections.
const may = new Map()
for (let R = 2001; R <= 2025; R += 1) may.set(R, rankAt(`${R}-05`, stocks))
const res = {}
const out = [
  'Study 14 — ranks from the research literature (PROTOCOL-study14.md)',
  `US: ${stocks.length} stocks. Total assets: files for ${assetFiles}, an offset found for ${withAssets} stocks, ${assetYears} stock-years with total assets.`,
  'Sides: top fifth (final percentile ≥ 0.80) buy, bottom fifth (≤ 0.20) sell. D = median 12-month return of the buy side − the sell side; a year counts with a pool of ≥ 100.',
  '',
]
const score9 = new Map()
for (const k of ALL) {
  const [a, b] = YEARS[k]
  out.push(`${k} ${NAME[k]} (${a}–${b})`, 'year   pool  buy  sell        D       IC')
  const yrs = {}
  const hits = { buy: [0, 0], sell: [0, 0] }
  for (const R of range(a, b)) {
    const d = `${R}-05`
    const P = may.get(R)[k]
    const pool = stocks.filter((s) => P.has(s.sym) && fwdOf(s, d) != null).map((s) => ({ sym: s.sym, u: s.u, p: P.get(s.sym), f: fwdOf(s, d) }))
    const sp = spread(pool)
    const ic = pool.length >= MIN_POOL ? spearman(pool.map((r) => r.p), pool.map((r) => r.f)) : null
    if (sp) {
      yrs[R] = { D: sp.D, ic, n: pool.length, wl: spread(pool.filter((r) => r.u === 'wl'), 0, 10)?.D ?? null, sp: spread(pool.filter((r) => r.u === 'sp'), 0, 10)?.D ?? null }
      hits.buy[0] += sp.buy.filter((x) => x > sp.med).length; hits.buy[1] += sp.buy.length
      hits.sell[0] += sp.sell.filter((x) => x < sp.med).length; hits.sell[1] += sp.sell.length
    }
    out.push(`${R}  ${String(pool.length).padStart(5)}  ${String(pool.filter((r) => r.p >= 0.8).length).padStart(3)}  ${String(pool.filter((r) => r.p <= 0.2).length).padStart(4)}  ${pct(sp?.D).padStart(7)}  ${ic == null ? '     –' : ic.toFixed(3).padStart(7)}`)
  }
  const Ds = Object.entries(yrs).map(([R, v]) => [Number(R), v.D])
  const mD = (f) => mean(Ds.filter(([R]) => f(R)).map(([, x]) => x))
  const [h1, h2] = HALVES[k]
  res[k] = {
    years: Ds.length, meanD: mD(() => true), pos: Ds.filter(([, x]) => x > 0).length, byYear: Object.fromEntries(Ds),
    p: TESTED.includes(k) && Ds.length >= MIN_YEARS ? signFlipGreater(Ds.map(([, x]) => x)) : null,
    ic: mean(Object.values(yrs).map((v) => v.ic).filter((x) => x != null)),
    half1: mD((R) => R <= h1), half2: mD((R) => R >= h2), since2011: PRICE.includes(k) ? mD((R) => R >= 2011) : null,
    no0920: mD((R) => R !== 2009 && R !== 2020),
    wl: mean(Object.values(yrs).map((v) => v.wl).filter((x) => x != null)), sp: mean(Object.values(yrs).map((v) => v.sp).filter((x) => x != null)),
    hitBuy: hits.buy[1] ? hits.buy[0] / hits.buy[1] : null, hitSell: hits.sell[1] ? hits.sell[0] / hits.sell[1] : null,
  }
  const r = res[k]
  out.push(`mean D ${pct(r.meanD)} over ${r.years} years (positive ${r.pos}); mean IC ${r.ic == null ? '–' : r.ic.toFixed(3)}; halves ${a}–${h1} ${pct(r.half1)}, ${h2}–${b} ${pct(r.half2)}; without 2009 and 2020 ${pct(r.no0920)}${r.since2011 != null ? `; 2011–2025 ${pct(r.since2011)}` : ''}`)
  out.push(`watchlist ${pct(r.wl)}, S&P 500 ${pct(r.sp)}; hit rate: buy side above the pool median ${r.hitBuy == null ? '–' : Math.round(100 * r.hitBuy) + '%'}, sell side below it ${r.hitSell == null ? '–' : Math.round(100 * r.hitSell) + '%'}`, '')
}

// Hypotheses.
const testable = TESTED.filter((k) => res[k].p != null)
holm(testable.map((k) => res[k].p)).forEach((p, i) => { res[testable[i]].adj = p })
out.push('HYPOTHESES (mean D > 0; exact sign-flip over years, one-sided; Holm over the testable candidates)')
for (const k of TESTED) {
  const r = res[k]
  if (r.p == null) { out.push(`  H_${k} ${NAME[k].padEnd(22)} not testable (${r.years} years count)`); continue }
  r.ok = r.meanD > 0 && r.adj < 0.05
  out.push(`  H_${k} ${NAME[k].padEnd(22)} mean D ${pct(r.meanD).padStart(6)} over ${r.years} years  p ${r.p.toFixed(4)}  Holm ${r.adj.toFixed(4)} → ${r.ok ? 'CONFIRMED' : 'NOT CONFIRMED'}`)
}
const ok = TESTED.filter((k) => res[k].ok)
const both = range(2001, 2025).filter((R) => ok.every((k) => res[k].byYear[R] != null))
const onBoth = (k) => mean(both.map((R) => res[k].byYear[R]))
const best = ok.length ? ok.reduce((b, k) => (onBoth(k) > onBoth(b) ? k : b)) : null
out.push(best ? `Most useful: ${best} ${NAME[best]}${ok.length > 1 ? ` (${ok.map((k) => `${k} ${pct(onBoth(k))}`).join(', ')} over ${both.length} common years)` : ''}` : 'No candidate confirmed.', '')

// Reported: 6-month D and the 12 formation dates for the price ranks.
out.push('REPORTED — price ranks: 6-month D (May → November) and the mean over 12 monthly formation dates')
const monthly = new Map()
for (let m = '2000-06'; m <= '2025-05'; m = addMonths(m, 1)) monthly.set(m, rankAt(m, stocks, false))
for (const k of PRICE) {
  const [a, b] = YEARS[k]
  const d6 = []
  const d12 = []
  for (const R of range(a, b)) {
    const d = `${R}-05`
    const P = may.get(R)[k]
    const s6 = spread(stocks.filter((s) => P.has(s.sym) && fwdOf(s, d, 6) != null).map((s) => ({ p: P.get(s.sym), f: fwdOf(s, d, 6) })))
    if (s6) d6.push(s6.D)
    const ds = []
    for (let m = `${R - 1}-06`; m <= d; m = addMonths(m, 1)) {
      const Q = monthly.get(m)?.[k]
      const sm = Q && spread(stocks.filter((s) => Q.has(s.sym) && fwdOf(s, m) != null).map((s) => ({ p: Q.get(s.sym), f: fwdOf(s, m) })))
      if (sm) ds.push(sm.D)
    }
    if (ds.length) d12.push(mean(ds))
  }
  res[k].d6 = mean(d6)
  res[k].d12dates = mean(d12)
  out.push(`  ${k} ${NAME[k].padEnd(20)} 6-month D ${pct(res[k].d6)} (${d6.length} years); 12 formation dates ${pct(res[k].d12dates)} (${d12.length} years)`)
}

// Reported: large caps, re-ranked within the 300 largest.
out.push('', 'REPORTED — large caps (each year the 300 largest ranked stocks by c × shares of F0, re-ranked within them), mean D 2011–2025')
const big = Object.fromEntries(ALL.map((k) => [k, []]))
for (let R = 2011; R <= 2025; R += 1) {
  const d = `${R}-05`
  const caps = stocks.map((s) => { const st = stateAt(s.funds, d); const c = s.closes.get(d); return [s, pos(c) && pos(st?.shares) ? c * st.shares : null] }).filter(([, v]) => v != null).sort((x, y) => y[1] - x[1]).slice(0, 300).map(([s]) => s)
  const P = rankAt(d, caps)
  for (const k of ALL) {
    const sp = spread(caps.filter((s) => P[k].has(s.sym) && fwdOf(s, d) != null).map((s) => ({ p: P[k].get(s.sym), f: fwdOf(s, d) })))
    if (sp) big[k].push(sp.D)
  }
}
for (const k of ALL) { res[k].bigCaps = mean(big[k]); out.push(`  ${k} ${NAME[k].padEnd(22)} ${pct(res[k].bigCaps)} (${big[k].length} years)`) }

// Reported: correlations between candidates' final percentiles, and with study 9's score.
out.push('', 'REPORTED — mean yearly Spearman correlation of final percentiles (years both count)')
const S9 = 'S9'
// The years a candidate counts (its D exists); study 9's score over its own years 2012–2025.
const yearsOf = (k) => (k === S9 ? range(2012, 2025) : Object.keys(res[k].byYear).map(Number))
for (let R = 2011; R <= 2025; R += 1) {
  const m = new Map()
  for (const s of stocks) { const t = scoreAt(s.funds, s.closes, s.sector, `${R}-05`).total; if (t != null) m.set(s.sym, t) }
  score9.set(R, m)
}
const keys = [...ALL, S9]
out.push('      ' + keys.map((k) => k.padStart(6)).join(''))
for (const a of keys) {
  const row = keys.map((b) => {
    const rs = yearsOf(a).filter((R) => yearsOf(b).includes(R)).map((R) => {
      const A = a === S9 ? score9.get(R) : may.get(R)[a]
      const B = b === S9 ? score9.get(R) : may.get(R)[b]
      const both2 = [...(A ?? new Map()).keys()].filter((x) => B?.has(x))
      return both2.length >= 20 ? spearman(both2.map((x) => A.get(x)), both2.map((x) => B.get(x))) : null
    }).filter((x) => x != null)
    return rs.length ? mean(rs).toFixed(2).padStart(6) : '     –'
  })
  out.push(`${a.padEnd(6)}${row.join('')}`)
}
out.push('', 'Limits: survivorship (today\'s listed stocks; dead losers missing, which flatters the sell side of price-trend ranks and the cheap side of value); price return without dividends (high-yield value stocks lose 2–4 points a year here); TradingView\'s current, restated fundamentals; today\'s sectors; one date a year; EV without cash; share counts from net income ÷ EPS are distorted by preferred dividends, minority interests and SPAC years; the 52-week high from intraday highs.')

fs.writeFileSync(process.env.OUT ?? 'reports/study14.txt', out.join('\n') + '\n')
fs.writeFileSync(process.env.OUT_JSON ?? 'reports/study14.json', JSON.stringify(res, null, 1))
console.log(out.join('\n'))
