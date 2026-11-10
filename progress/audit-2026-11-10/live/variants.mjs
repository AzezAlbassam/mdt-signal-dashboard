// Sensitivity of the history medians (and so the fair value) to the page's shortcuts. Own code,
// same definitions as handcheck.mjs; DCF / PEG / P/B-ROE values are taken from the page run.
//   base     the page's rule (newest quarter out this month, each earlier one 3 months before; 16 quarters, then fiscal years)
//   next     the same data one calendar month later (what the page shows on the 1st of next month if nothing else changes)
//   dated    each quarter out when it really was: quarter end + this stock's own lag (earnings_release_date − fiscal_period_end_fq)
//   dated32  dated, with all 32 quarters TradingView gives (no fiscal-year months in the window)
//   shares   base, with today's share count for today's per-share values (no 10% tolerance)
import fs from 'node:fs'
const D = new URL('./', import.meta.url).pathname
const quotes = JSON.parse(fs.readFileSync(D + 'data/quotes.json', 'utf8')).data
const hist = JSON.parse(fs.readFileSync(D + 'data/hist.json', 'utf8')).data
const page = JSON.parse(fs.readFileSync(D + 'out/page.json', 'utf8'))
const NOW = Date.now() / 1000
const ym = (t) => { const d = new Date(t * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth() }
const M0 = ym(NOW)
const fin = Number.isFinite
const sum4 = (a, j) => (a && [0, 1, 2, 3].every((i) => fin(a[j + i])) ? a[j] + a[j + 1] + a[j + 2] + a[j + 3] : null)
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 }
const W = { 'Mature / profitable': { pe: 0.3, dcf: 0.3, ev: 0.25 }, 'Growth / tech': { pe: 0.2, peg: 0.3, dcf: 0.3, ps: 0.2 }, 'Heavy / cyclical': { ev: 0.4, pen: 0.3 }, Financial: { pe: 0.5, pbj: 0.5 }, 'Unprofitable growth': { ps: 1 }, 'Pre-revenue': { cash: 1 } }

function calc(sym, o) {
  const q = quotes[sym], h = hist[sym], p = page[sym]
  const px = JSON.parse(fs.readFileSync(`${D}data/px/${sym.replace(':', '_')}.json`, 'utf8')).bars
  const close = new Map(px.t.map((t, i) => [ym(t), px.c[i]]))
  close.set(M0, q.close)
  const Q = (k) => h[`${k}_fq_h`], Y = (k) => h[`${k}_fy_h`]
  const FY = Number(h.fiscal_period_fy)
  const lastUsable = (m) => { const y = Math.floor(m / 12), mo = (m % 12) + 1; return mo >= 5 ? y - 1 : y - 2 }
  const shift = Math.max(0, FY - lastUsable(M0))
  const fyAt = (m) => {
    const i = Math.max(0, FY - (lastUsable(m) + shift)); const e = Y('earnings_per_share_diluted')
    if (!e || i >= Math.min(16, e.length)) return null
    const ni = Y('net_income')[i], last5 = e.slice(i, 16).filter(fin).slice(0, 5)
    return { eps: e[i], rev: Y('total_revenue')[i], ebitda: Y('ebitda')?.[i] ?? null, debt: Y('total_debt')?.[i] ?? 0, shares: e[i] && ni && Math.sign(e[i]) === Math.sign(ni) ? ni / e[i] : null, epsNorm: last5.length ? last5.reduce((a, b) => a + b, 0) / last5.length : null }
  }
  const NQ = Math.min(o.nq ?? 16, Q('total_revenue')?.length ?? 0)
  const lag = Math.max(20, Math.min(100, ((q.earnings_release_date ?? q.fiscal_period_end_fq + 45 * 86400) - q.fiscal_period_end_fq) / 86400)) // days
  const qEnd = (j) => { const d = new Date(q.fiscal_period_end_fq * 1000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 3 * j + 1); return d.getTime() / 1000 - 86400 } // last day of that quarter's month
  const monthEnd = (m) => Date.UTC(Math.floor((m + 1) / 12), (m + 1) % 12, 1) / 1000 - 1
  const jFor = (k) => {
    if (o.avail !== 'dated') return k === 0 ? 0 : Math.ceil((k + (o.off ?? 0)) / 3)
    const at = k === 0 ? NOW : monthEnd(M0 - k)
    for (let j = 0; j < 40; j += 1) if (qEnd(j) + lag * 86400 <= at) return j
    return 99
  }
  const qShares = p.qShares
  const series = { pe: [], ps: [], ev: [], pen: [] }
  let today = null
  for (let k = 59; k >= 0; k -= 1) {
    const c = close.get(M0 - k)
    if (!(c > 0)) continue
    const f = fyAt(M0 - k)
    if (!f) continue
    const j = jFor(k)
    let s = f
    if (j + 3 < NQ) {
      const e = sum4(Q('earnings_per_share_diluted'), j), ni = sum4(Q('net_income'), j)
      const own = e && ni && Math.sign(e) === Math.sign(ni) ? ni / e : null
      let sh = own ?? f.shares, ej = e
      if (k === 0 && (o.shares === 'today' || !(sh > 0 && Math.abs(sh / qShares - 1) <= 0.1))) { sh = qShares; if (own && qShares > own) ej = ni / qShares }
      s = { ...f, eps: ej, rev: sum4(Q('total_revenue'), j), ebitda: sum4(Q('ebitda'), j), debt: Q('total_debt')?.[j] ?? f.debt, shares: sh }
    }
    if (k === 0) today = s
    const add = (key, v) => { if (fin(v) && v > 0 && v <= 100) series[key].push(v) }
    if (s.eps > 0) add('pe', c / s.eps)
    if (s.epsNorm > 0) add('pen', c / s.epsNorm)
    if (s.shares > 0 && s.rev > 0) add('ps', (c * s.shares) / s.rev)
    if (s.ebitda > 0 && s.shares > 0) add('ev', (c * s.shares + (s.debt ?? 0)) / s.ebitda)
  }
  const med = Object.fromEntries(Object.entries(series).map(([k, a]) => [k, a.length >= 12 ? median(a) : null]))
  const t = today, c = q.close
  const cap = (x) => x > 0 && x <= 100
  const v = { ...p.values }
  v.pe = t.eps > 0 && med.pe && cap(c / t.eps) ? t.eps * med.pe : null
  v.ps = t.rev > 0 && t.shares > 0 && med.ps ? (t.rev / t.shares) * med.ps : null
  v.ev = t.ebitda > 0 && med.ev && cap((c * t.shares + t.debt) / t.ebitda) ? (med.ev * t.ebitda - t.debt) / t.shares : null
  v.pen = t.epsNorm > 0 && med.pen && cap(c / t.epsNorm) ? t.epsNorm * med.pen : null
  const w = Object.fromEntries(Object.entries(W[p.profile]).filter(([m]) => !(m === 'peg' && !(p.weights?.peg > 0))))
  let used = Object.keys(w).filter((m) => v[m] > 0).map((m) => [m, v[m], w[m]])
  if (used.length >= 3) { const s = [...used].sort((a, b) => a[1] - b[1]); const half = s.reduce((a, x) => a + x[2], 0) / 2; let cu = 0; const wm = s.find((x) => (cu += x[2]) >= half - 1e-12)[1]; used = used.filter((x) => x[1] <= 3 * wm && x[1] >= wm / 3) }
  return { fair: used.length ? used.reduce((a, x) => a + x[1] * x[2], 0) / used.reduce((a, x) => a + x[2], 0) : null, med, v, lag }
}
const f = (x, d = 2) => (fin(x) ? x.toFixed(d) : '—')
const pc = (a, b) => (fin(a) && fin(b) ? `${a >= b ? '+' : ''}${(100 * (a / b - 1)).toFixed(0)}%` : '—')
const out = {}
console.log('symbol         page    base    next(Δ)        dated(Δ)       dated32(Δ)     shares(Δ)   | lag d | median P/E base→dated→dated32 | P/S | EV')
for (const sym of Object.keys(page)) {
  const b = calc(sym, {}), n = calc(sym, { off: 1 }), d = calc(sym, { avail: 'dated' }), d32 = calc(sym, { avail: 'dated', nq: 32 }), s = calc(sym, { shares: 'today' })
  out[sym] = { page: page[sym].fair, base: b.fair, nextMonth: n.fair, dated: d.fair, dated32: d32.fair, todayShares: s.fair, lagDays: b.lag, medians: { base: b.med, nextMonth: n.med, dated: d.med, dated32: d32.med }, values: { base: b.v, dated32: d32.v } }
  console.log(`${sym.padEnd(13)} ${f(page[sym].fair).padStart(7)} ${f(b.fair).padStart(7)} ${f(n.fair).padStart(8)}(${pc(n.fair, b.fair)}) ${f(d.fair).padStart(8)}(${pc(d.fair, b.fair)}) ${f(d32.fair).padStart(8)}(${pc(d32.fair, b.fair)}) ${f(s.fair).padStart(8)}(${pc(s.fair, b.fair)}) | ${f(b.lag, 0).padStart(3)} | ${f(b.med.pe, 1)}→${f(d.med.pe, 1)}→${f(d32.med.pe, 1)} | ${f(b.med.ps, 2)}→${f(d.med.ps, 2)}→${f(d32.med.ps, 2)} | ${f(b.med.ev, 1)}→${f(d.med.ev, 1)}→${f(d32.med.ev, 1)}`)
}
fs.writeFileSync(D + 'out/variants.json', JSON.stringify(out, null, 1))
