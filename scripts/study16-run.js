// Study 16 (PROTOCOL-study16.md): nine valuation choices of the stock page, each option's fair value
// scored against the price a year later (median |ln(V ÷ c1)| per year, sign-flip over years, Holm
// within a decision).
//   node scripts/study16-run.js → reports/study16.txt, reports/study16.json
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fairValuesAt, multiplesAt, profileOf, stateAt, blend, WEIGHTS, METHODS, dcf, PARAMS, MULT_MAX, HEAVY_SECTORS, TECH_SECTORS, addMonths, spearman, signFlipGreater, holm } from '../engine/fairvalue.js'
import { assetsByYear } from '../engine/ranks.js'
import { rdcf } from '../engine/rdcf.js'
import { seededRng } from '../engine/null-models.js'
import { loadUniverse } from './lib/universe.js'

const LAST = '2026-09'
const YEARS = Array.from({ length: 14 }, (_, i) => 2012 + i)
const MATURE = 'Mature / profitable'
const GROWTH = 'Growth / tech'
const HEAVY = 'Heavy / cyclical'
const FIN = 'Financial'
const UNPROF = 'Unprofitable growth'
const PRE = 'Pre-revenue'
const ROE_BIND = 0.285
const MIN_ROWS = 10
const MIN_YEARS = 8
const MIN_STOCKS = 8
const GUARD = 0.02
const pos = (x) => Number.isFinite(x) && x > 0
const fin = Number.isFinite
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
const f3 = (x) => (x == null || !fin(x) ? '–' : x.toFixed(3))
const f4 = (x) => (x == null || !fin(x) ? '–' : x.toFixed(4))
const pct = (x) => (x == null || !fin(x) ? '–' : `${(100 * x).toFixed(1)}%`)

// ---------------------------------------------------------------- data (§1)

const seen = new Set()
const stocks = [...loadUniverse('data/fv', LAST).stocks.map((s) => ({ ...s, dir: 'data/fv' })), ...loadUniverse('data/fv8', LAST).stocks.map((s) => ({ ...s, dir: 'data/fv8' }))].filter((s) => {
  const f = s.funds.at(-1)
  const key = `${f.year}|${f.rev}|${f.ni}`
  return seen.has(key) ? false : (seen.add(key), true)
})
const sectorsOf = { 'data/fv': JSON.parse(fs.readFileSync('data/fv/sectors.json', 'utf8')), 'data/fv8': JSON.parse(fs.readFileSync('data/fv8/sectors.json', 'utf8')) }
const PEERS = JSON.parse(fs.readFileSync('pages/peer-margins.json', 'utf8'))
const spyRaw = JSON.parse(zlib.gunzipSync(fs.readFileSync('data/harmonic/bars/AMEX_SPY__1M.json.gz')))
const spy = new Map(spyRaw.date.map((d, i) => [d.slice(0, 7), spyRaw.close[i]]))

let balFiles = 0
const cover = { equity: 0, cash: 0, oi: 0 }
const coverYears = { equity: 0, cash: 0, oi: 0 }
for (const s of stocks) {
  s.industry = sectorsOf[s.dir][s.sym]?.industry ?? null
  const f = path.join(s.dir, 'raw/bal', `${s.sym.replace(':', '_')}.json`)
  const b = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null
  if (b) balFiles += 1
  s.equity = assetsByYear(s.funds, b?.total_equity_fy_h, b?.total_revenue_fy_h)
  s.cash = assetsByYear(s.funds, b?.cash_n_short_term_invest_fy_h, b?.total_revenue_fy_h, fin)
  s.oi = assetsByYear(s.funds, b?.oper_income_fy_h, b?.total_revenue_fy_h, fin)
  for (const k of Object.keys(cover)) if (s[k].size) { cover[k] += 1; coverYears[k] += s[k].size }
  s.byYear = new Map(s.funds.map((r) => [r.year, r]))
  s.bvps = (y) => { const r = s.byYear.get(y); const e = s.equity.get(y); return r && pos(e) && pos(r.shares) ? e / r.shares : null }
}

function betaAt(s, month) {
  const xs = []
  const ys = []
  for (let k = 59; k >= 0; k -= 1) {
    const m = addMonths(month, -k)
    const p = addMonths(m, -1)
    const [a, b, c, d] = [s.closes.get(p), s.closes.get(m), spy.get(p), spy.get(m)]
    if (pos(a) && pos(b) && pos(c) && pos(d)) { ys.push(b / a - 1); xs.push(d / c - 1) }
  }
  if (xs.length < 36) return null
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2 })
  return sxx > 0 ? sxy / sxx : null
}

// D3's rule (§3): the fiscal years F0−7 … F0, at least 5 with EPS; null (A's answer kept) with fewer.
function cyclical(s, F0) {
  const eps = (y) => s.byYear.get(y)?.eps ?? null
  const ys = Array.from({ length: 8 }, (_, i) => F0 - 7 + i)
  if (ys.filter((y) => eps(y) != null).length < 5) return null
  if (ys.some((y) => eps(y) != null && eps(y) <= 0)) return true
  return ys.slice(1).filter((y) => eps(y - 1) > 0 && eps(y) > 0 && eps(y) < 0.7 * eps(y - 1)).length >= 2
}

// §3.2: own-history P/B over the 60-month window, BVPS of the fiscal year each month uses.
function ownPb(s, month, bv0) {
  if (!pos(bv0)) return null
  const xs = []
  for (let k = PARAMS.windowMonths - 1; k >= 0; k -= 1) {
    const m = addMonths(month, -k)
    const c = s.closes.get(m)
    const st = stateAt(s.funds, m)
    const bv = st ? s.bvps(st.fiscalYear) : null
    if (pos(c) && pos(bv) && c / bv <= MULT_MAX) xs.push(c / bv)
  }
  return xs.length >= PARAMS.minSamples ? bv0 * median(xs) : null
}

// §3.1: the revenue DCF on F0's figures.
let rdcfZero = 0
function rdcfAt(s, st, c0, beta) {
  const F0 = st.fiscalYear
  const hist = s.funds.filter((r) => r.year <= F0).reverse()
  const r0 = s.byYear.get(F0)
  const cash = s.cash.get(F0)
  const q = {
    total_revenue_ttm: r0.rev, total_revenue_fy: r0.rev, total_revenue_fy_h: hist.map((r) => r.rev), net_income_fy_h: hist.map((r) => r.ni),
    net_income_ttm: r0.ni, oper_income_ttm: s.oi.get(F0) ?? null, total_debt_fq: st.debt, cash_n_short_term_invest_fq: fin(cash) ? cash : null,
    net_debt_fq: fin(cash) ? st.debt - cash : null, free_cash_flow_ttm: r0.fcf, beta_5_year: beta, close: c0,
    market_cap_basic: pos(r0.shares) ? c0 * r0.shares : null, sector: s.sector, industry: s.industry,
  }
  const out = rdcf(q, { shares: pos(r0.shares) ? r0.shares : undefined, peers: PEERS })
  if (out.value === 0) rdcfZero += 1
  return out.value > 0 ? out.value : null // a value of 0 (raw ≤ 0) counts as none (§3.1)
}

// ---------------------------------------------------------------- B0 and the options (§2, §3)

// §1 outcome: the price later with SPY's move over the same span taken out.
const adj = (s, R, h) => { const c = s.closes.get(`${R + h}-05`); const a = spy.get(`${R}-05`); const b = spy.get(`${R + h}-05`); return pos(c) && pos(a) && pos(b) ? (c * a) / b : null }
const rows = []
const syWith = { equity: 0, cash: 0, oi: 0 } // B0 stock-years whose F0 has the column
for (const s of stocks) for (const R of YEARS) {
  const month = `${R}-05`
  const fv = fairValuesAt(s.funds, s.closes, s.sector, month)
  if (!fv || fv.profile === PRE) continue
  const st = stateAt(s.funds, month)
  const c0 = fv.close
  const r0 = s.byYear.get(st.fiscalYear)
  const beta = betaAt(s, month)
  const v = { ...fv.values }
  const raw = { ...fv.values }
  const rate = beta != null ? clamp(0.045 + beta * 0.042, 0.07, 0.13) : PARAMS.discount
  const gDcf = st.revG ?? st.epsG
  const d = dcf(st.fcfPS, gDcf == null ? null : clamp(gDcf, -0.05, PARAMS.maxGrowth), rate, PARAMS.termGrowth)
  v.dcf = pos(d) ? d : null
  const mult = multiplesAt(st, c0)
  const capped = ['pe', 'pen', 'ev'].filter((k) => v[k] > 0 && !(mult[k] <= MULT_MAX))
  for (const k of capped) v[k] = null
  const g = st.epsG ?? st.revG
  if (!(g >= 0.1)) v.peg = null
  const bv = s.bvps(st.fiscalYear)
  const eq0 = s.equity.get(st.fiscalYear)
  const eq1 = s.equity.get(st.fiscalYear - 1)
  const roe = pos(eq0) && fin(r0?.ni) ? r0.ni / (pos(eq1) ? (eq0 + eq1) / 2 : eq0) : null
  const k = roe != null ? (roe - PARAMS.termGrowth) / (PARAMS.discount - PARAMS.termGrowth) : null
  const pbj = (cap) => (pos(bv) && k != null && bv * Math.min(cap, k) > 0 ? bv * Math.min(cap, k) : null)
  v.pbj = pbj(4)
  v.graham = pos(st.eps) && pos(bv) ? Math.sqrt(22.5 * st.eps * bv) : null
  const big = pos(r0?.shares) ? c0 * r0.shares : null
  for (const k of Object.keys(syWith)) if (s[k].has(st.fiscalYear)) syWith[k] += 1
  rows.push({
    sym: s.sym, R, sector: s.sector, c0, c1: adj(s, R, 1), c2: adj(s, R, 2), big,
    profile: fv.profile, st, v, raw, capped, roe, pbj8: pbj(8), pbjInf: pbj(Infinity),
    cyc: cyclical(s, st.fiscalYear),
    pb: ownPb(s, month, bv), rd: fv.profile === UNPROF ? rdcfAt(s, st, c0, beta) : null,
  })
}

function wmedian(pairs) { // [value, weight], weights > 0
  const s = [...pairs].sort((a, b) => a[0] - b[0])
  const half = s.reduce((a, p) => a + p[1], 0) / 2
  let c = 0
  for (const [x, w] of s) { c += w; if (c >= half - 1e-12) return x }
  return s.at(-1)[0]
}

/** Fair value of one row under options opt ({ D1: 'B', … }; missing = A). Decisions apply in order D1 … D9. */
function fair(r, opt = {}) {
  const o = (d) => opt[d] ?? 'A'
  const v = { ...r.v }
  let profile = r.profile
  if (o('D1') === 'B') v.pbj = r.pbj8
  if (o('D1') === 'C') v.pbj = r.pbjInf
  if ((o('D1') === 'D' || o('D1') === 'E') && profile === FIN && r.roe > ROE_BIND) {
    v.pbj = null
    if (o('D1') === 'E') profile = profileOf(r.st, r.c0, 'Not Finance')
  }
  if (o('D3') !== 'A' && r.cyc != null && r.sector !== 'Finance' && (profile === HEAVY || profile === GROWTH || profile === MATURE)) {
    const heavy = o('D3') === 'B' ? r.cyc : HEAVY_SECTORS.includes(r.sector) && r.cyc
    profile = heavy ? HEAVY : TECH_SECTORS.includes(r.sector) || r.st.revG > 0.15 ? GROWTH : MATURE
  }
  if (o('D5') === 'B') for (const k of r.capped) v[k] = r.raw[k]
  if (o('D6') === 'B') v.peg = r.raw.peg
  if (o('D6') === 'C') v.peg = null
  if (o('D8') === 'B') v.dcf = r.raw.dcf
  if (o('D9') === 'B') v.pb = r.pb
  const w = WEIGHTS[profile].map((x, i) => (METHODS[i] === 'graham' && o('D7') === 'A' ? 0 : x))
  let V
  const valued = METHODS.map((m, i) => [v[m], w[i]]).filter(([x, wi]) => wi > 0 && pos(x))
  if (o('D2') === 'B' && valued.length >= 2) V = wmedian(valued)
  else if (o('D2') === 'D' && valued.length >= 2) V = Math.exp(valued.reduce((a, [x, wi]) => a + wi * Math.log(x), 0) / valued.reduce((a, [, wi]) => a + wi, 0))
  else if (o('D2') === 'C' && valued.length >= 3) {
    const med = wmedian(valued)
    const kept = valued.filter(([x]) => x <= 3 * med && x >= med / 3)
    V = kept.reduce((a, [x, wi]) => a + x * wi, 0) / kept.reduce((a, [, wi]) => a + wi, 0)
  } else V = blend(v, w)?.fair ?? null
  if (profile === UNPROF && o('D4') !== 'A') {
    const ps = V
    if (o('D4') === 'B') V = r.rd ?? ps
    else V = ps != null && r.rd != null ? (ps + r.rd) / 2 : ps ?? r.rd
  }
  return V
}

// ---------------------------------------------------------------- scoring (§4)

const err = (V, c) => Math.abs(Math.log(V / c))
const OPTIONS = { D1: 'ABCDE', D2: 'ABCD', D3: 'ABC', D4: 'ABC', D5: 'AB', D6: 'ABC', D7: 'AB', D8: 'AB', D9: 'AB' }
const NAME = { D1: 'P/B from ROE, very profitable financials', D2: 'How methods are combined', D3: 'Which companies count as cyclical', D4: "Loss-makers' fair value", D5: 'Methods on a multiple above 100', D6: "Lynch's rule for PEG", D7: "Graham's number", D8: 'DCF discount rate', D9: 'Own-history P/B for Heavy' }

// Price-closeness control (§4): A moved toward (or away from) c0 by as much as X is, over the rows xs.
const kOf = (xs, X) => {
  const den = median(xs.map((x) => Math.abs(Math.log(x.V.A / x.r.c0))))
  return den > 0 ? median(xs.map((x) => Math.abs(Math.log(x.V[X] / x.r.c0)))) / den : 1
}
const shrunk = (x, k) => x.r.c0 * (x.V.A / x.r.c0) ** k

/** Yearly M (and M of A↓X), IC and naive baseline over years with ≥ MIN_ROWS rows of set; cKey c1 or c2. */
function byYears(opts, set, cKey = 'c1') {
  const byY = new Map()
  for (const x of set) (byY.get(x.r.R) ?? byY.set(x.r.R, []).get(x.r.R)).push(x)
  const counted = [...byY].filter(([, xs]) => xs.length >= MIN_ROWS).sort((a, b) => a[0] - b[0])
  const M = (xs, X) => median(xs.map((x) => err(x.V[X], x.r[cKey])))
  const IC = (xs, X) => spearman(xs.map((x) => Math.log(x.V[X] / x.r.c0)), xs.map((x) => x.r[cKey] / x.r.c0 - 1))
  return counted.map(([y, xs]) => ({
    y, n: xs.length,
    M: Object.fromEntries(opts.map((X) => [X, M(xs, X)])),
    Mshrunk: Object.fromEntries(opts.slice(1).map((X) => { const k = kOf(xs, X); return [X, median(xs.map((x) => err(shrunk(x, k), x.r[cKey])))] })),
    IC: Object.fromEntries(opts.map((X) => [X, IC(xs, X)])),
    naive: median(xs.map((x) => Math.abs(Math.log(x.r.c0 / x.r[cKey])))),
  }))
}

/** Per-stock means of f(x) over set, stocks in first-appearance order. */
function perStock(set, f) {
  const per = new Map()
  for (const x of set) (per.get(x.r.sym) ?? per.set(x.r.sym, []).get(x.r.sym)).push(f(x))
  return [...per.values()].map(mean)
}

function signFlipMC(xs, draws, rng) {
  const obs = mean(xs)
  let ge = 0
  for (let k = 0; k < draws; k += 1) {
    let s = 0
    for (const x of xs) s += rng() < 0.5 ? -x : x
    if (s / xs.length >= obs - 1e-12) ge += 1
  }
  return (1 + ge) / (draws + 1)
}

const notTestable = new Set([...(cover.equity ? [] : ['D1', 'D7', 'D9']), ...(cover.cash || cover.oi ? [] : ['D4'])])
const report = { decisions: {}, coverage: { stocks: stocks.length, balFiles, stocksWith: cover, fiscalYearsWith: coverYears, b0StockYearsWith: syWith, rows: rows.length, rdcfZero, notTestable: [...notTestable] } }
const L = []
L.push("Study 16 — the stock page's untested valuation choices (PROTOCOL-study16.md)")
L.push(`Universe ${stocks.length} stocks; balance-sheet files ${balFiles}.`)
L.push(`With a value — stocks / stored fiscal years / B0 stock-years whose F0 has it: equity ${cover.equity} / ${coverYears.equity} / ${syWith.equity}, cash ${cover.cash} / ${coverYears.cash} / ${syWith.cash}, operating income ${cover.oi} / ${coverYears.oi} / ${syWith.oi}.`)
L.push(`B0 stock-years (May 2012–2025, pre-revenue left out): ${rows.length}; with an outcome: ${rows.filter((r) => pos(r.c1)).length}.`)
L.push("Error e = |ln(V ÷ c1)|, c1 = the price 12 months later × SPY then ÷ SPY at the end; M = the year's median e; δ = M_A − M_X (positive: X closer);")
L.push('δ* = M of A moved as close to the price as X − M_X (positive: X carries information beyond closeness to the price).')
L.push('')

const rng = seededRng(16)
const adopted = {}
const top = new Map(YEARS.map((R) => [R, new Set(rows.filter((r) => r.R === R && pos(r.big)).sort((a, b) => b.big - a.big).slice(0, 300).map((r) => r.sym))]))
for (const d of Object.keys(OPTIONS)) {
  const opts = [...OPTIONS[d]]
  const ch = opts.slice(1)
  if (notTestable.has(d)) {
    report.decisions[d] = { name: NAME[d], notTestable: true, adopted: 'A' }
    L.push(`${d} ${NAME[d]}: not testable — a column it needs is empty for every symbol (§1); A stays.`, '')
    continue
  }
  const all = rows.map((r) => ({ r, V: Object.fromEntries(opts.map((X) => [X, fair(r, { [d]: X })])) }))
  const differ = (x) => opts.some((X) => x.V[X] != null && x.V.A != null && Math.abs(x.V[X] / x.V.A - 1) > 0.005)
  const someNone = all.filter((x) => opts.some((X) => x.V[X] == null) && opts.some((X) => x.V[X] != null))
  const U = all.filter((x) => opts.every((X) => x.V[X] != null) && pos(x.r.c1) && differ(x))
  const counted = byYears(opts, U)
  const res = { name: NAME[d], U: U.length, stocks: new Set(U.map((x) => x.r.sym)).size, coverageDisagree: someNone.length, countedYears: counted.length, yearly: counted, by: counted.length >= MIN_YEARS ? 'years' : 'stocks', challengers: {} }
  if (res.by === 'years') {
    const ps = ch.map((X) => signFlipGreater(counted.map((c) => c.M.A - c.M[X])))
    const adjP = holm(ps)
    ch.forEach((X, i) => {
      const dl = counted.map((c) => c.M.A - c.M[X])
      const icA = mean(counted.map((c) => c.IC.A))
      const icX = mean(counted.map((c) => c.IC[X]))
      res.challengers[X] = { meanDelta: mean(dl), meanDeltaStar: mean(counted.map((c) => c.Mshrunk[X] - c.M[X])), wins: dl.filter((x) => x > 0).length, p: ps[i], pHolm: adjP[i], icA, icX, guard: icX >= icA - GUARD }
    })
  } else {
    res.byStocks = new Set(U.map((x) => x.r.sym)).size
    res.guardSkipped = true
    if (res.byStocks >= MIN_STOCKS) {
      const diffs = Object.fromEntries(ch.map((X) => [X, perStock(U, (x) => err(x.V.A, x.r.c1) - err(x.V[X], x.r.c1))]))
      const ps = ch.map((X) => (diffs[X].length <= 24 ? signFlipGreater(diffs[X]) : signFlipMC(diffs[X], 200000, rng)))
      const adjP = holm(ps)
      ch.forEach((X, i) => {
        const k = kOf(U, X)
        const star = perStock(U, (x) => err(shrunk(x, k), x.r.c1) - err(x.V[X], x.r.c1))
        res.challengers[X] = { meanDelta: mean(diffs[X]), meanDeltaStar: mean(star), k, wins: diffs[X].filter((x) => x > 0).length, p: ps[i], pHolm: adjP[i], guard: true }
      })
    } else res.undecidable = true
  }
  const ok = ch.filter((X) => { const c = res.challengers[X]; return c && c.meanDelta > 0 && c.pHolm < 0.05 && c.meanDeltaStar > 0 && c.guard })
  ok.sort((a, b) => res.challengers[b].meanDelta - res.challengers[a].meanDelta || a.localeCompare(b))
  res.adopted = ok[0] ?? 'A'
  if (res.adopted !== 'A') adopted[d] = res.adopted

  // §6 reported
  res.pooled = Object.fromEntries(opts.map((X) => {
    const es = U.map((x) => err(x.V[X], x.r.c1))
    return [X, { medianE: median(es), within25: es.length ? es.filter((e) => e < Math.log(1.25)).length / es.length : null, signed: median(U.map((x) => Math.log(x.V[X] / x.r.c1))) }]
  }))
  res.pooled.naive = { medianE: median(U.map((x) => Math.abs(Math.log(x.r.c0 / x.r.c1)))) }
  const U2 = all.filter((x) => x.r.R <= 2024 && opts.every((X) => x.V[X] != null) && pos(x.r.c2) && differ(x))
  const h2 = byYears(opts, U2, 'c2')
  res.horizon24 = res.by === 'years'
    ? { by: 'years', U: U2.length, countedYears: h2.length, meanDelta: Object.fromEntries(ch.map((X) => [X, mean(h2.map((c) => c.M.A - c.M[X]))])), p: Object.fromEntries(ch.map((X) => [X, h2.length ? signFlipGreater(h2.map((c) => c.M.A - c.M[X])) : null])) }
    : { by: 'stocks', U: U2.length, ...Object.fromEntries(['meanDelta', 'better'].map((key) => [key, Object.fromEntries(ch.map((X) => { const dd = perStock(U2, (x) => err(x.V.A, x.r.c2) - err(x.V[X], x.r.c2)); return [X, key === 'meanDelta' ? mean(dd) : dd.filter((v) => v > 0).length] }))])) }
  const UL = U.filter((x) => top.get(x.r.R).has(x.r.sym))
  res.largeCaps = { U: UL.length, medianE: Object.fromEntries(opts.map((X) => [X, median(UL.map((x) => err(x.V[X], x.r.c1)))])) }
  res.largeCapFlag = res.adopted !== 'A' && UL.length > 0 && res.largeCaps.medianE[res.adopted] > res.largeCaps.medianE.A
  if (d === 'D1') res.named = all.filter((x) => ['NYSE:V', 'NYSE:MA'].includes(x.r.sym)).map((x) => ({ sym: x.r.sym, R: x.r.R, c0: x.r.c0, c1: x.r.c1, roe: x.r.roe, profile: x.r.profile, V: x.V }))
  report.decisions[d] = res

  L.push(`${d} ${NAME[d]} — options ${opts.join(' ')}; comparison set ${U.length} stock-years on ${res.stocks} stocks; ${counted.length} counted years; test by ${res.by}${res.undecidable ? ' (fewer than 8 stocks: not decidable)' : ''}`)
  // the yearly δ* uses each year's own k; a test by stocks adopts on the single k printed below (§4)
  L.push(`   year     n  ${opts.map((X) => `  M_${X}`).join('')}   naive  ${ch.map((X) => `  δ_${X}`).join('')}  ${ch.map((X) => ` δ*_${X}`).join('')}  ${opts.map((X) => ` IC_${X}`).join('')}${res.by === 'stocks' ? '   (δ* with k per year)' : ''}`)
  for (const c of counted) L.push(`   ${c.y}  ${String(c.n).padStart(4)}  ${opts.map((X) => f3(c.M[X]).padStart(6)).join('')}  ${f3(c.naive).padStart(6)}  ${ch.map((X) => f3(c.M.A - c.M[X]).padStart(6)).join('')}  ${ch.map((X) => f3(c.Mshrunk[X] - c.M[X]).padStart(7)).join('')}  ${opts.map((X) => f3(c.IC[X]).padStart(6)).join('')}`)
  for (const X of ch) {
    const c = res.challengers[X]
    if (!c) continue
    L.push(`   ${X} vs A: mean δ ${f4(c.meanDelta)}, mean δ* ${f4(c.meanDeltaStar)}, better in ${c.wins} of ${res.by === 'years' ? counted.length : res.byStocks} ${res.by}, p ${f4(c.p)}, Holm ${f4(c.pHolm)}${res.by === 'years' ? `, mean IC ${f3(c.icX)} vs A ${f3(c.icA)}${c.guard ? '' : ' (fails the ranking guard)'}` : `, k ${f3(c.k)}`}`)
  }
  if (res.guardSkipped && !res.undecidable) L.push('   Ranking guard skipped: test by stocks, too few stocks per year for an IC (§4).')
  L.push(`   Pooled median e: ${opts.map((X) => `${X} ${f3(res.pooled[X].medianE)}`).join(', ')}, naive ${f3(res.pooled.naive.medianE)}; within 25%: ${opts.map((X) => `${X} ${pct(res.pooled[X].within25)}`).join(', ')}; median signed: ${opts.map((X) => `${X} ${f3(res.pooled[X].signed)}`).join(', ')}`)
  const h = res.horizon24
  L.push(`   24 months (reported only, by ${h.by}): ${h.U} stock-years${h.by === 'years' ? `, ${h.countedYears} counted years; mean δ ${ch.map((X) => `${X} ${f4(h.meanDelta[X])} (p ${f4(h.p[X])})`).join(', ')}` : `; per-stock mean δ ${ch.map((X) => `${X} ${f4(h.meanDelta[X])} (better on ${h.better[X]} stocks)`).join(', ')}`}`)
  L.push(`   Large caps (top 300 a year): ${UL.length} stock-years; median e ${opts.map((X) => `${X} ${f3(res.largeCaps.medianE[X])}`).join(', ')}${res.largeCapFlag ? ' — FLAG: the adopted option is worse than A on large caps' : ''}`)
  L.push(`   Stock-years where options disagree on whether a value exists: ${someNone.length}${d === 'D4' ? `; Unprofitable stock-years whose revenue DCF is 0 (counted as none): ${rdcfZero}` : ''}`)
  if (d === 'D1') for (const n of res.named) L.push(`   ${n.sym} ${n.R} ${n.profile} ROE ${f3(n.roe)} c0 ${f3(n.c0)} c1 ${f3(n.c1)}  ${opts.map((X) => `${X} ${f3(n.V[X])}`).join('  ')}`)
  L.push(`   → adopted: ${res.adopted}`)
  L.push('')
}

// ---------------------------------------------------------------- combination (§5)

// removal order (§5): smallest mean δ first; on a tie, the higher decision number
const order = Object.keys(adopted).sort((a, b) => report.decisions[a].challengers[adopted[a]].meanDelta - report.decisions[b].challengers[adopted[b]].meanDelta || b.localeCompare(a))
const combo = { ...adopted }
const pooledE = (opt) => {
  const xs = rows.filter((r) => pos(r.c1)).map((r) => ({ r, a: fair(r), b: fair(r, opt) })).filter((x) => x.a != null && x.b != null)
  return { n: xs.length, A: median(xs.map((x) => err(x.a, x.r.c1))), B: median(xs.map((x) => err(x.b, x.r.c1))), naive: median(xs.map((x) => Math.abs(Math.log(x.r.c0 / x.r.c1)))), xs }
}
let pc = pooledE(combo)
const steps = [{ applied: { ...combo }, n: pc.n, B0: pc.A, Bstar: pc.B }]
while (Object.keys(combo).length && pc.B > pc.A) {
  delete combo[order.find((k) => combo[k])]
  pc = pooledE(combo)
  steps.push({ applied: { ...combo }, n: pc.n, B0: pc.A, Bstar: pc.B })
}
const yr = YEARS.map((y) => pc.xs.filter((x) => x.r.R === y)).filter((g) => g.length >= MIN_ROWS)
report.combination = {
  adopted, applied: combo, steps, n: pc.n, pooledB0: pc.A, pooledBstar: pc.B, naive: pc.naive,
  yearly: yr.map((g) => ({ y: g[0].r.R, n: g.length, B0: median(g.map((x) => err(x.a, x.r.c1))), Bstar: median(g.map((x) => err(x.b, x.r.c1))), naive: median(g.map((x) => Math.abs(Math.log(x.r.c0 / x.r.c1)))) })),
  icB0: mean(yr.map((g) => spearman(g.map((x) => Math.log(x.a / x.r.c0)), g.map((x) => x.r.c1 / x.r.c0 - 1)))),
  icBstar: mean(yr.map((g) => spearman(g.map((x) => Math.log(x.b / x.r.c0)), g.map((x) => x.r.c1 / x.r.c0 - 1)))),
}
L.push(`Combination: adopted ${JSON.stringify(adopted)}; applied ${JSON.stringify(combo)}`)
for (const st of steps) L.push(`   step ${JSON.stringify(st.applied)}: ${st.n} stock-years, pooled median e B0 ${f3(st.B0)}, B* ${f3(st.Bstar)}`)
L.push(`   ${pc.n} stock-years; pooled median e B0 ${f3(pc.A)}, B* ${f3(pc.B)}, naive (today's price) ${f3(pc.naive)}; mean IC B0 ${f3(report.combination.icB0)}, B* ${f3(report.combination.icBstar)}`)
for (const y of report.combination.yearly) L.push(`   ${y.y}  n ${String(y.n).padStart(4)}  B0 ${f3(y.B0)}  B* ${f3(y.Bstar)}  naive ${f3(y.naive)}`)
L.push('')
L.push("Known limits (§7): survivorship; price returns without dividends; today's restated fundamentals, sectors and peer margins; no analysts' forecast history; annual figures only; one date a year; total equity vs common equity; buybacks; US stocks only; the same stocks every year; closeness to the price; Holm within decisions only.")

fs.mkdirSync('reports', { recursive: true })
fs.writeFileSync('reports/study16.txt', L.join('\n') + '\n')
fs.writeFileSync('reports/study16.json', JSON.stringify(report, null, 1))
console.log(L.join('\n'))
