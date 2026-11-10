// Independent recomputation from the definitions (no engine import): raw TradingView arrays,
// newest first. Compared with out/page.json (the page pipeline). node handcheck.mjs → out/hand.json
import fs from 'node:fs'
const D = new URL('./', import.meta.url).pathname
const quotesAll = JSON.parse(fs.readFileSync(D + 'data/quotes.json', 'utf8')).data
const quotes = Object.fromEntries(Object.entries(quotesAll).filter(([s]) => fs.existsSync(`${D}data/px/${s.replace(':', '_')}.json`)))
const hist = JSON.parse(fs.readFileSync(D + 'data/hist.json', 'utf8')).data
const page = JSON.parse(fs.readFileSync(D + 'out/page.json', 'utf8'))
const TODAY = new Date()
const ym = (d) => d.getUTCFullYear() * 12 + d.getUTCMonth() // month number
const M0 = ym(TODAY)
const fin = Number.isFinite
const sum4 = (a, j) => (a && [0, 1, 2, 3].every((i) => fin(a[j + i])) ? a[j] + a[j + 1] + a[j + 2] + a[j + 3] : null)
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 }
const cagr3 = (oldestFirst) => { const v = oldestFirst.filter(fin); const n = Math.min(3, v.length - 1); if (n < 1) return null; const a = v[v.length - 1 - n], b = v[v.length - 1]; return a > 0 && b > 0 ? (b / a) ** (1 / n) - 1 : null }
const HEAVY = ['Energy Minerals', 'Non-Energy Minerals', 'Process Industries', 'Producer Manufacturing', 'Industrial Services', 'Transportation', 'Consumer Durables']
const TECH = ['Electronic Technology', 'Technology Services']
const W = { Mature: { pe: 0.3, dcf: 0.3, ev: 0.25 }, Growth: { pe: 0.2, peg: 0.3, dcf: 0.3, ps: 0.2 }, Heavy: { ev: 0.4, pen: 0.3 }, Financial: { pe: 0.5, pbj: 0.5 }, Unprofitable: { ps: 1 }, Pre: { cash: 1 } }
// (Mature also lists Graham 0.15 and Heavy P/B 0.3, which the live page never values: weight 0 / null.)

const out = {}
for (const sym of Object.keys(quotes)) {
  const q = quotes[sym]
  const h = hist[sym]
  const px = JSON.parse(fs.readFileSync(`${D}data/px/${sym.replace(':', '_')}.json`, 'utf8')).bars
  const close = new Map(px.t.map((t, i) => [ym(new Date(t * 1000)), px.c[i]]))
  close.set(M0, q.close)
  const Q = (k) => h[`${k}_fq_h`]
  const Y = (k) => h[`${k}_fy_h`]
  const FY = Number(h.fiscal_period_fy)

  // ---- today
  const T = { eps: sum4(Q('earnings_per_share_diluted'), 0), rev: sum4(Q('total_revenue'), 0), ni: sum4(Q('net_income'), 0), fcf: sum4(Q('free_cash_flow'), 0), ebitda: sum4(Q('ebitda'), 0), debt: Q('total_debt')?.[0] ?? null }
  const prevClose = q.currency === 'SAR' ? q.close / (1 + q.change / 100) : q.close
  const sh = { reported: q.total_shares_outstanding, mcapOverPrice: q.market_cap_basic / q.close, mcapOverPrevClose: q.market_cap_basic / prevClose, niOverEps: T.ni / T.eps }
  const shares = sh.reported // the listed security's own count
  let eps0 = T.eps
  const epsNote = T.eps > 0 && T.ni > 0 && Math.abs(sh.niOverEps / shares - 1) > 0.1 && shares > sh.niOverEps ? (eps0 = T.ni / shares, `EPS restated on today's count: ${T.eps.toFixed(3)} → ${eps0.toFixed(3)}`) : null

  // ---- fiscal-year view per month (the rule the page states: FY label y usable from May of y+1, moved by `shift`)
  const lastUsable = (m) => { const y = Math.floor(m / 12), mo = (m % 12) + 1; return mo >= 5 ? y - 1 : y - 2 }
  const shift = Math.max(0, FY - lastUsable(M0))
  const fyIdx = (m) => { const i = FY - (lastUsable(m) + shift); return i < 0 ? 0 : i } // index into newest-first annual arrays
  const epsOldest = [...(Y('earnings_per_share_diluted') ?? [])].slice(0, 16).reverse()
  const revOldest = [...(Y('total_revenue') ?? [])].slice(0, 16).reverse()
  const fyAt = (m) => {
    const i = fyIdx(m)
    const e = Y('earnings_per_share_diluted')
    if (!e || i >= Math.min(16, e.length)) return null
    const eps = e[i], ni = Y('net_income')[i]
    const known = e.slice(i, 16).filter(fin) // newest first, from that year back
    const last5 = known.slice(0, 5)
    return { eps, rev: Y('total_revenue')[i], ebitda: Y('ebitda')?.[i] ?? null, debt: Y('total_debt')?.[i] ?? 0, shares: eps && ni && Math.sign(eps) === Math.sign(ni) ? ni / eps : null,
      epsNorm: last5.length ? last5.reduce((a, b) => a + b, 0) / last5.length : null,
      epsG: cagr3(epsOldest.slice(0, epsOldest.length - i)), revG: cagr3(revOldest.slice(0, revOldest.length - i)) }
  }
  const fy0 = fyAt(M0)

  // ---- 60 months of multiples
  const NQ = Math.min(16, Q('total_revenue')?.length ?? 0)
  const series = { pe: [], ps: [], ev: [], pen: [] }
  for (let k = 59; k >= 0; k -= 1) {
    const c = close.get(M0 - k)
    if (!(c > 0)) continue
    const f = fyAt(M0 - k)
    if (!f) continue
    const j = Math.ceil(k / 3) // quarters back: the newest counts as out this month, each earlier one 3 months before
    let s = f
    if (j + 3 < NQ) {
      const e = sum4(Q('earnings_per_share_diluted'), j), ni = sum4(Q('net_income'), j)
      // a quarter listed but not reported closes no twelve months
      let shj = e && ni && Math.sign(e) === Math.sign(ni) ? ni / e : f.shares
      let ej = e
      if (k === 0) { shj = shares; ej = eps0 }
      s = { ...f, eps: ej, rev: sum4(Q('total_revenue'), j), ebitda: sum4(Q('ebitda'), j), debt: Q('total_debt')?.[j] ?? f.debt, shares: shj }
    } else if (k === 0) s = { ...f, shares }
    const add = (key, v) => { if (fin(v) && v > 0 && v <= 100) series[key].push(v) }
    if (s.eps > 0) add('pe', c / s.eps)
    if (s.epsNorm > 0) add('pen', c / s.epsNorm)
    if (s.shares > 0 && s.rev > 0) add('ps', (c * s.shares) / s.rev)
    if (s.ebitda > 0 && s.shares > 0) add('ev', (c * s.shares + (s.debt ?? 0)) / s.ebitda)
  }
  const med = Object.fromEntries(Object.entries(series).map(([k, a]) => [k, a.length >= 12 ? median(a) : null]))

  // ---- today's multiples
  const debt0 = T.debt ?? fy0?.debt ?? 0
  const now = { pe: eps0 > 0 ? q.close / eps0 : null, ps: T.rev > 0 ? (q.close * shares) / T.rev : null, ev: T.ebitda > 0 ? (q.close * shares + debt0) / T.ebitda : null,
    evNetOfCash: T.ebitda > 0 && fin(q.net_debt_fq) ? (q.close * shares + q.net_debt_fq) / T.ebitda : null, pfcf: T.fcf > 0 ? (q.close * shares) / T.fcf : null, pen: fy0?.epsNorm > 0 ? q.close / fy0.epsNorm : null }

  // ---- profile
  const revG = fy0?.revG, epsG = fy0?.epsG
  const profile = !(T.rev > 0) || T.rev < 0.01 * q.close * shares ? 'Pre' : q.sector === 'Finance' ? 'Financial' : !(eps0 > 0) ? 'Unprofitable' : HEAVY.includes(q.sector) ? 'Heavy' : TECH.includes(q.sector) || revG > 0.15 ? 'Growth' : 'Mature'

  // ---- methods
  const v = {}
  const cap = (k) => now[k] != null && now[k] <= 100
  v.pe = eps0 > 0 && med.pe && cap('pe') ? eps0 * med.pe : null
  v.ps = T.rev > 0 && med.ps ? (T.rev / shares) * med.ps : null
  v.ev = T.ebitda > 0 && med.ev && cap('ev') ? (med.ev * T.ebitda - debt0) / shares : null
  v.pen = fy0?.epsNorm > 0 && med.pen && cap('pen') ? fy0.epsNorm * med.pen : null
  const gRaw = epsG ?? revG
  v.peg = eps0 > 0 && gRaw >= 0.1 ? eps0 * Math.min(0.25, gRaw) * 100 : null
  // DCF: FCF per share, year 1 at analysts' revenue growth (−20%…60%), fade from min(g1, 25%) to 2.5% by year 10, CAPM rate 7–13%
  const gA = q.sector !== 'Finance' && q.revenue_forecast_next_fy > 0 && q.total_revenue_fy > 0 ? q.revenue_forecast_next_fy / q.total_revenue_fy - 1 : null
  const beta = fin(q.beta_5_year) ? q.beta_5_year : q.beta
  const r = fin(beta) ? Math.min(0.13, Math.max(0.07, 0.045 + 0.042 * beta)) : 0.09
  const fcfPS = q.free_cash_flow_ttm / shares
  if (fcfPS > 0 && gA != null) {
    const g1 = Math.min(0.6, Math.max(-0.2, gA)), G = Math.min(g1, 0.25)
    let cf = fcfPS, pv = 0
    for (let t = 1; t <= 10; t += 1) { cf *= 1 + (t === 1 ? g1 : G + ((0.025 - G) * (t - 2)) / 8); pv += cf / (1 + r) ** t }
    v.dcf = pv + (cf * 1.025) / (r - 0.025) / (1 + r) ** 10
    v.dcfIn = { fcfPS, g1, r, beta }
  } else if (fcfPS > 0) {
    // no analysts' figure: the plain 10-year DCF at the 3-year growth (clamped −5%…25%), 9%
    const g = revG ?? epsG
    if (g != null) { const g1 = Math.max(-0.05, Math.min(0.25, g)); let cf = fcfPS, pv = 0; for (let i = 1; i <= 10; i += 1) { cf *= 1 + g1 + ((0.025 - g1) * (i - 1)) / 9; pv += cf / 1.09 ** i } v.dcf = pv + (cf * 1.025) / 0.065 / 1.09 ** 10; v.dcfIn = { fcfPS, g1, r: 0.09, beta: null } }
  }
  const bvps = q.price_book_fq > 0 ? q.close / q.price_book_fq : null
  if (bvps && fin(q.return_on_equity)) { const x = bvps * Math.min(4, (q.return_on_equity / 100 - 0.025) / 0.065); v.pbj = x > 0 ? x : null }
  if (profile !== 'Financial' && fin(q.net_debt_fq) && -q.net_debt_fq > 0) v.cash = -q.net_debt_fq / shares

  // ---- blend: weighted mean, after dropping methods > 3× or < ⅓ of the weighted median when 3+ are valued
  const w = W[profile]
  let used = Object.keys(w).filter((m) => v[m] > 0).map((m) => [m, v[m], w[m]])
  let dropped = []
  if (used.length >= 3) {
    const s = [...used].sort((a, b) => a[1] - b[1]); const half = s.reduce((a, p) => a + p[2], 0) / 2
    let c = 0; const wm = s.find((p) => (c += p[2]) >= half - 1e-12)[1]
    dropped = used.filter((p) => p[1] > 3 * wm || p[1] < wm / 3).map((p) => p[0]); used = used.filter((p) => !dropped.includes(p[0]))
  }
  const fair = used.length ? used.reduce((a, p) => a + p[1] * p[2], 0) / used.reduce((a, p) => a + p[2], 0) : null
  out[sym] = { T, eps0, epsNote, sh, shares, fy0, shift, med, n: Object.fromEntries(Object.entries(series).map(([k, a]) => [k, a.length])), now, profile, values: v, dropped, fair,
    tv: { pe: q.price_earnings_ttm, ps: q.price_sales_current, ev: q.enterprise_value_ebitda_ttm, pfcf: q.price_free_cash_flow_ttm, fcf_ttm: q.free_cash_flow_ttm, eps_ttm: q.earnings_per_share_diluted_ttm, rev_ttm: q.total_revenue_ttm, ni_ttm: q.net_income_ttm, ebitda_ttm: q.ebitda_ttm } }
}
fs.writeFileSync(D + 'out/hand.json', JSON.stringify(out, null, 1))

// ---- compare with the page
const rel = (a, b) => (fin(a) && fin(b) && b !== 0 ? a / b - 1 : a == null && b == null ? 0 : NaN)
const bad = (x) => !(Math.abs(x) <= 0.01)
const p2 = (x) => (fin(x) ? (Math.abs(x) >= 1e6 ? (x / 1e9).toFixed(3) + 'B' : x.toFixed(3)) : String(x))
const PROF = { 'Mature / profitable': 'Mature', 'Growth / tech': 'Growth', 'Heavy / cyclical': 'Heavy', Financial: 'Financial', 'Unprofitable growth': 'Unprofitable', 'Pre-revenue': 'Pre' }
console.log('=== A. page vs hand (mismatch > 1%)')
for (const [sym, hnd] of Object.entries(out)) {
  const p = page[sym]
  const rows = []
  const cmp = (name, a, b) => { const d = rel(a, b); if (bad(d)) rows.push(`${name}: page ${p2(a)} hand ${p2(b)} (${fin(d) ? (100 * d).toFixed(1) + '%' : 'n/a'})`) }
  cmp('shares', p.st?.shares, hnd.shares)
  cmp('eps', p.st?.eps, hnd.eps0); cmp('rev', p.st?.rev, hnd.T.rev); cmp('ebitda', p.st?.ebitda, hnd.T.ebitda); cmp('debt', p.st?.debt, hnd.T.debt ?? hnd.fy0?.debt)
  cmp('fcfPS(engine)', p.st?.fcfPS, hnd.T.fcf / hnd.shares)
  cmp('epsNorm', p.st?.epsNorm, hnd.fy0?.epsNorm); cmp('epsG', p.st?.epsG, hnd.fy0?.epsG); cmp('revG', p.st?.revG, hnd.fy0?.revG)
  for (const k of ['pe', 'ps', 'ev', 'pen']) { cmp(`now.${k}`, p.now?.[k], hnd.now[k]); cmp(`median.${k}`, p.medians?.[k]?.med, hnd.med[k]); if (p.medians?.[k]?.n !== hnd.n[k]) rows.push(`n.${k}: page ${p.medians?.[k]?.n} hand ${hnd.n[k]}`) }
  if (PROF[p.profile] !== hnd.profile) rows.push(`profile: page ${p.profile} hand ${hnd.profile}`)
  for (const m of Object.keys(W[hnd.profile] ?? {})) cmp(`value.${m}`, p.values?.[m] ?? null, hnd.values[m] ?? null)
  if (p.dcf && hnd.values.dcfIn) { cmp('dcf.g1', p.dcf.g1, hnd.values.dcfIn.g1); cmp('dcf.r', p.dcf.r, hnd.values.dcfIn.r); cmp('dcf.fcf0', p.dcf.fcf0, hnd.values.dcfIn.fcfPS) }
  if (String(p.dropped) !== String(hnd.dropped)) rows.push(`dropped: page [${p.dropped}] hand [${hnd.dropped}]`)
  cmp('FAIR', p.fair, hnd.fair)
  console.log(`${sym}: ${rows.length ? '\n   ' + rows.join('\n   ') : 'all within 1%'}`)
}
console.log('\n=== B. TradingView ratios vs the page’s own (diff > 5% flagged *)')
for (const [sym, hnd] of Object.entries(out)) {
  const p = page[sym]
  const q = quotes[sym]
  const f = (name, own, tv) => `${name} ${fin(own) ? own.toFixed(2) : '—'}/${fin(tv) ? tv.toFixed(2) : '—'}${fin(own) && fin(tv) && Math.abs(own / tv - 1) > 0.05 ? '*' : ''}`
  const pfcfPage = p.dcf?.fcf0 > 0 ? q.close / p.dcf.fcf0 : null
  console.log(`${sym.padEnd(13)} ${f('P/E', p.now?.pe, q.price_earnings_ttm)} | peNow ${fin(p.peNow) ? p.peNow.toFixed(2) : '—'} | ${f('P/S', p.now?.ps, q.price_sales_current)} | ${f('EV/EBITDA', p.now?.ev, q.enterprise_value_ebitda_ttm)} (net of cash ${fin(hnd.now.evNetOfCash) ? hnd.now.evNetOfCash.toFixed(2) : '—'}) | ${f('P/FCF', pfcfPage, q.price_free_cash_flow_ttm)}`)
}
console.log('\n=== C. plumbing: quote TTM vs sum of the last four quarters; shares')
for (const [sym, hnd] of Object.entries(out)) {
  const t = hnd.tv
  const d = (a, b) => (fin(a) && fin(b) ? (100 * (a / b - 1)).toFixed(1) + '%' : 'n/a')
  console.log(`${sym.padEnd(13)} fcf ${d(t.fcf_ttm, hnd.T.fcf)} eps ${d(t.eps_ttm, hnd.T.eps)} rev ${d(t.rev_ttm, hnd.T.rev)} ni ${d(t.ni_ttm, hnd.T.ni)} ebitda ${d(t.ebitda_ttm, hnd.T.ebitda)} | shares: reported ${p2(hnd.sh.reported)} mcap/px ${p2(hnd.sh.mcapOverPrice)} mcap/prev ${p2(hnd.sh.mcapOverPrevClose)} ni/eps ${p2(hnd.sh.niOverEps)} page ${p2(page[sym].qShares)} ${hnd.epsNote ?? ''}`)
}
