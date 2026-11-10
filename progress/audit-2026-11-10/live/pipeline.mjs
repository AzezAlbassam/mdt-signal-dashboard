// Page pipeline on real data: the engine modules imported as they are, and compute() /
// liveFairValues() / liveDcf() / analysts() / peNow() / peg() / rdcfFor() copied verbatim from
// pages/stocks.app.js (state.* replaced by local objects only).
//   node pipeline.mjs  → out/page.json
import fs from 'node:fs'
const REPO = '/home/user/mdt-signal-dashboard'
const { METHODS, WEIGHTS, PARAMS, MULT_MAX, parseFundamentals, histFromBatch, ttmFromQuarters, liveContext, quoteShares, allShares,
  fairValuesAt, multiplesAt, blendTrimmed, monthKey } = await import(`${REPO}/engine/fairvalue.js`)
const { scoreAt } = await import(`${REPO}/engine/score.js`)
const { rdcf, impliedInput } = await import(`${REPO}/engine/rdcf.js`)
const PEERS = JSON.parse(fs.readFileSync(`${REPO}/pages/peer-margins.json`, 'utf8'))
const D = new URL('./data/', import.meta.url).pathname
const quotesAll = JSON.parse(fs.readFileSync(D + 'quotes.json', 'utf8')).data
const quotes = Object.fromEntries(Object.entries(quotesAll).filter(([s]) => fs.existsSync(`${D}px/${s.replace(':', '_')}.json`)))
const hist = JSON.parse(fs.readFileSync(D + 'hist.json', 'utf8')).data

const state = { quotes, cache: {}, quarters: {}, scores: {}, fair: {}, rdcf: {} }
// loadFunds + loadPx, as the page saves them
for (const sym of Object.keys(quotes)) {
  const row = hist[sym]
  const fin = histFromBatch(row, 'fy')
  const fq = histFromBatch(row, 'fq')
  const px = JSON.parse(fs.readFileSync(`${D}px/${sym.replace(':', '_')}.json`, 'utf8')).bars
  state.cache[sym] = { sym, fin, px: { t: px.t, c: px.c } }
  if (fq) state.quarters[sym] = { sym, fq }
}

// ---- verbatim from pages/stocks.app.js
function analysts(q) {
  const rev = q.sector !== 'Finance' && !(q.gross_margin < 0 && q.net_income_ttm > 0) && q.revenue_forecast_next_fy > 0 && q.total_revenue_fy > 0 ? q.revenue_forecast_next_fy / q.total_revenue_fy - 1 : null
  const eps = Number.isFinite(q.earnings_per_share_forecast_next_fy) && q.earnings_per_share_fy > 0 ? q.earnings_per_share_forecast_next_fy / q.earnings_per_share_fy - 1 : null
  return { rev, eps, falling: (rev != null && rev < -0.02) || (eps != null && eps < -0.1) }
}
function liveFairValues(fv, q, funds, g = null) {
  const v = { ...fv.values }
  if (!(g >= 0.1)) v.peg = null
  const d = liveDcf(q, fv.values.dcf)
  if (d) v.dcf = d.value
  const close = q.close
  const bvps = q.price_book_fq > 0 ? close / q.price_book_fq : null
  const eps = q.earnings_per_share_diluted_ttm
  const roe = Number.isFinite(q.return_on_equity) ? q.return_on_equity / 100 : null
  const shares = allShares(q)
  if (eps > 0 && bvps > 0) v.graham = Math.sqrt(22.5 * eps * bvps)
  if (bvps > 0 && roe != null) {
    const x = bvps * Math.min(4, (roe - PARAMS.termGrowth) / (PARAMS.discount - PARAMS.termGrowth))
    v.pbj = x > 0 ? x : null
  }
  if (fv.profile !== 'Financial' && Number.isFinite(q.net_debt_fq) && shares) {
    const x = -q.net_debt_fq / shares
    v.cash = x > 0 ? x : null
  }
  const weights = WEIGHTS[fv.profile].map((w, i) => (METHODS[i] === 'graham' || (METHODS[i] === 'peg' && !(g >= 0.1)) ? 0 : w))
  const b = blendTrimmed(v, weights)
  const used = METHODS.filter((m, i) => weights[i] > 0 && v[m] > 0).map((m) => v[m])
  return { values: v, weights, profile: fv.profile, fair: b?.fair ?? null, dropped: b?.dropped ?? [], med: b?.med ?? null, coverage: b ? b.coverage / weights.reduce((a, w) => a + w, 0) : 0, dcf: d,
    low: used.length ? Math.min(...used) : null, high: used.length ? Math.max(...used) : null }
}
const beta5 = (q) => (Number.isFinite(q?.beta_5_year) ? q.beta_5_year : Number.isFinite(q?.beta) ? q.beta : null)
function liveDcf(q, fallback) {
  const shares = allShares(q)
  const fcf0 = shares && Number.isFinite(q.free_cash_flow_ttm) ? q.free_cash_flow_ttm / shares : null
  if (!(fcf0 > 0)) return null
  const a = analysts(q).rev
  const g1 = a != null ? Math.min(0.6, Math.max(-0.2, a)) : null
  if (g1 == null) return fallback > 0 ? { value: fallback, g1: null, r: PARAMS.discount, beta: null } : null
  const r = beta5(q) != null ? Math.min(0.13, Math.max(0.07, 0.045 + beta5(q) * 0.042)) : PARAMS.discount
  const gT = PARAMS.termGrowth
  const G = Math.min(g1, 0.25)
  let cf = fcf0 * (1 + g1)
  let pv = cf / (1 + r)
  for (let t = 2; t <= 10; t += 1) {
    cf *= 1 + G + ((gT - G) * (t - 2)) / 8
    pv += cf / (1 + r) ** t
  }
  pv += (cf * (1 + gT)) / (r - gT) / (1 + r) ** 10
  return { value: pv, g1, r, beta: beta5(q), fcf0 } // fcf0 added for the report only
}
function closesOf(sym) {
  const d = state.cache[sym]
  const closes = new Map()
  ;(d?.px?.t ?? []).forEach((t, i) => { if (Number.isFinite(d.px.c[i])) closes.set(monthKey(t), d.px.c[i]) })
  if (Number.isFinite(state.quotes[sym]?.close)) closes.set(monthKey(Math.floor(Date.now() / 1000)), state.quotes[sym].close)
  return closes
}
function preProfit(sym) {
  const eps = state.quotes[sym]?.earnings_per_share_diluted_ttm
  const fy = (state.scores[sym]?.known ?? []).slice(-3)
  return Number.isFinite(eps) && eps <= 0 && fy.length > 0 && fy.every((f) => !(f.ni > 0))
}
function rdcfFor(sym, funds) {
  const q = state.quotes[sym]
  const qq = { ...q, total_revenue_fy_h: funds.map((f) => f.rev).reverse(), net_income_fy_h: funds.map((f) => f.ni).reverse() }
  const o = { shares: allShares(q), peers: PEERS }
  const d = rdcf(qq, o)
  if (d.why) return d
  const m = impliedInput(qq, 'm', -0.1, 0.6, o)
  return { ...d, implied: m }
}
const extra = {}
function compute(sym) {
  const d = state.cache[sym]
  const q = state.quotes[sym]
  if (!d || !q) return
  if (!d.fin) return
  const funds = parseFundamentals(d.fin)
  const qShares = quoteShares(q)
  const last = funds[funds.length - 1]
  if (qShares && last && !(last.shares > qShares / 1.5 && last.shares < qShares * 1.5)) last.shares = qShares
  const closes = closesOf(sym)
  const month = monthKey(Math.floor(Date.now() / 1000))
  const ttm = ttmFromQuarters(state.quarters[sym]?.fq)
  const live = liveContext(funds, ttm, month, qShares)
  const s = scoreAt(funds, closes, q.sector, month, live)
  state.scores[sym] = { ...s, f0: live.f0 ?? last, period: live.period, known: funds }
  const fv = fairValuesAt(funds, closes, q.sector, month, live)
  const raw = fv ? { ...fv.values } : null
  const now = multiplesAt(live.state(month), q.close)
  const capped = fv ? ['pe', 'pen', 'ev'].filter((k) => fv.values[k] > 0 && !(now[k] <= MULT_MAX)) : []
  for (const k of capped) fv.values[k] = null
  state.fair[sym] = fv ? { ...liveFairValues(fv, q, funds, s.detail?.epsG ?? s.detail?.revG), capped } : null
  state.rdcf[sym] = (fv?.profile === 'Unprofitable growth' || preProfit(sym)) && !sym.startsWith('TADAWUL:') ? rdcfFor(sym, funds) : null
  // report only: the state the engine read this month, and the history of multiples behind the medians
  const st = live.state(month)
  const histM = { pe: [], pen: [], ps: [], ev: [] }
  const perMonth = []
  for (let k = PARAMS.windowMonths - 1; k >= 0; k -= 1) {
    const [y, m] = month.split('-').map(Number)
    const t = y * 12 + (m - 1) - k
    const mk = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
    const c = closes.get(mk)
    if (!(c > 0)) continue
    const stm = live.state(mk)
    const mult = multiplesAt(stm, c)
    perMonth.push({ mk, c, period: stm?.period ?? `FY${stm?.fiscalYear}`, eps: stm?.eps, shares: stm?.shares, ...mult })
    for (const key of Object.keys(histM)) if (mult[key] != null && mult[key] <= MULT_MAX) histM[key].push(mult[key])
  }
  const med = (a) => { const x = [...a].sort((p, r) => p - r); const n = x.length; return n < 12 ? null : n % 2 ? x[(n - 1) / 2] : (x[n / 2 - 1] + x[n / 2]) / 2 }
  extra[sym] = { month, qShares, allShares: allShares(q), st, now, medians: Object.fromEntries(Object.entries(histM).map(([k, a]) => [k, { n: a.length, med: med(a) }])),
    rawEngineValues: raw, ttmLast: ttm.at(-1) && { ...ttm.at(-1), prev: undefined }, ttmN: ttm.length, livePeriod: live.period, funds, perMonth,
    months: closes.size, firstMonth: [...closes.keys()].sort()[0] }
}
function peNow(sym) {
  const q = state.quotes[sym]
  if (!q || (Number.isFinite(q.earnings_per_share_diluted_ttm) && q.earnings_per_share_diluted_ttm <= 0)) return null
  const tv = q.price_earnings_ttm > 0 ? q.price_earnings_ttm : null
  const s = state.scores[sym]
  const ni = Number.isFinite(q.net_income_ttm) ? q.net_income_ttm : s?.period ? s.f0?.ni : null
  const own = quoteShares(q) > 0 && ni > 0 ? (q.close * quoteShares(q)) / ni : null
  return own && (!tv || (sym.startsWith('TADAWUL:') && own > 1.1 * tv)) ? own : tv
}
function peg(sym) {
  const q = state.quotes[sym]
  if (!q) return null
  const g = analysts(q).eps
  const fpe = q.non_gaap_price_to_earnings_per_share_forecast_next_fy
  if (g != null) return g > 0 && fpe > 0 ? { v: fpe / (100 * g), past: false, jump: g > 0.5 ? g : null } : null
  const h = state.scores[sym]?.detail?.epsG
  const pe = peNow(sym)
  return pe > 0 && h > 0 ? { v: pe / (100 * h), past: true } : null
}
const upside = (sym) => {
  const f = state.fair[sym]
  const q = state.quotes[sym]
  return f?.fair && q?.close && f.profile !== 'Pre-revenue' ? f.fair / q.close - 1 : null
}
function weakFair(sym) {
  const f = state.fair[sym]
  const up = upside(sym)
  if (!f?.fair) return null
  if (peNow(sym) > 100 && f.values.pe > 0) return 'P/E above 100'
  if (up != null && Math.abs(up) > 0.6) return 'more than 60% from the price'
  if (f.low > 0 && f.high / f.low > 3) return f.dropped?.length ? 'methods >3x apart, far ones dropped' : 'methods >3x apart'
  return null
}
// ---- end of copied code

const out = {}
for (const sym of Object.keys(quotes)) {
  compute(sym)
  const f = state.fair[sym]
  const q = quotes[sym]
  const s = state.scores[sym]
  out[sym] = { price: q.close, currency: q.currency, sector: q.sector, industry: q.industry, profile: f?.profile, fair: f?.fair, upside: upside(sym), weak: weakFair(sym), target: q.price_target_1y,
    values: f?.values, weights: f && Object.fromEntries(METHODS.map((m, i) => [m, f.weights[i]]).filter(([, w]) => w > 0)), dropped: f?.dropped, capped: f?.capped, med: f?.med, coverage: f?.coverage,
    dcf: f?.dcf, analysts: analysts(q), peNow: peNow(sym), peg: peg(sym), score: s.total, scoreParts: s.parts, scoreReason: s.reason, scoreDetail: s.detail, period: s.period,
    rdcf: state.rdcf[sym] && { ...state.rdcf[sym], mFrom: state.rdcf[sym].mFrom }, ...extra[sym] }
}
fs.mkdirSync(new URL('./out/', import.meta.url).pathname, { recursive: true })
fs.writeFileSync(new URL('./out/page.json', import.meta.url).pathname, JSON.stringify(out, null, 1))
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—')
for (const [sym, o] of Object.entries(out)) {
  console.log(`${sym.padEnd(13)} ${f2(o.price).padStart(8)} fair ${f2(o.fair).padStart(8)} up ${o.upside == null ? '—' : (100 * o.upside).toFixed(0) + '%'} tgt ${f2(o.target)} | ${o.profile} | ${Object.entries(o.weights ?? {}).map(([m, w]) => `${m}:${f2(o.values[m])}×${w}`).join(' ')} | dropped ${o.dropped} capped ${o.capped} | score ${f2(o.score)} ${o.scoreReason ?? ''} | weak: ${o.weak}`)
}
