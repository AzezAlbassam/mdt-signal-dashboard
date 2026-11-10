// Step 5 checks on the raw arrays (newest first).
import fs from 'node:fs'
const D = new URL('./', import.meta.url).pathname
const hist = JSON.parse(fs.readFileSync(D + 'data/hist.json', 'utf8')).data
const quotes = JSON.parse(fs.readFileSync(D + 'data/quotes.json', 'utf8')).data
const page = JSON.parse(fs.readFileSync(D + 'out/page.json', 'utf8'))
const fin = Number.isFinite
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 10)
const out = {}
console.log('A. fiscal-year sums: Σ of the 4 quarters ending at each fiscal year end vs the annual array (worst |diff| over the years covered), repeats and holes in the first 16 quarters')
for (const [sym, h] of Object.entries(hist)) {
  const e = new Date(h.fiscal_period_end_fq * 1000), y = new Date(h.fiscal_period_end_fy * 1000)
  const d = Math.round(((e.getUTCFullYear() - y.getUTCFullYear()) * 12 + e.getUTCMonth() - y.getUTCMonth()) / 3) // quarters since the last fiscal year end
  const res = {}
  for (const k of ['total_revenue', 'net_income', 'earnings_per_share_diluted', 'free_cash_flow', 'ebitda']) {
    const q = h[`${k}_fq_h`], a = h[`${k}_fy_h`]
    if (!q || !a) { res[k] = 'no array'; continue }
    let worst = 0, n = 0
    for (let i = 0; d + 4 * i + 3 < q.length && i < a.length; i += 1) { const s = q.slice(d + 4 * i, d + 4 * i + 4); if (s.every(fin) && fin(a[i]) && a[i] !== 0) { worst = Math.max(worst, Math.abs(s.reduce((x, z) => x + z, 0) / a[i] - 1)); n += 1 } }
    res[k] = `${(100 * worst).toFixed(1)}% (${n}y)`
  }
  const rep = [], holes = []
  for (const k of ['total_revenue', 'net_income', 'earnings_per_share_diluted', 'free_cash_flow', 'ebitda', 'total_debt']) {
    const q = (h[`${k}_fq_h`] ?? []).slice(0, 16)
    q.forEach((x, i) => { if (i && fin(x) && x === q[i - 1]) rep.push(`${k}[${i - 1},${i}]`); if (!fin(x) && q.length) holes.push(`${k}[${i}]`) })
  }
  out[sym] = { fy: h.fiscal_period_fy, fyEnd: iso(h.fiscal_period_end_fy), fqEnd: iso(h.fiscal_period_end_fq), quartersSinceFyEnd: d, ...res, repeats: rep, holes: holes.length > 6 ? `${holes.length} nulls` : holes }
  console.log(`${sym.padEnd(13)} FY ${h.fiscal_period_fy} ends ${iso(h.fiscal_period_end_fy)} fq ${iso(h.fiscal_period_end_fq)} d=${d} | rev ${res.total_revenue} ni ${res.net_income} eps ${res.earnings_per_share_diluted} fcf ${res.free_cash_flow} ebitda ${res.ebitda} | repeats ${rep.join(',') || 'none'} | holes ${Array.isArray(out[sym].holes) ? out[sym].holes.join(',') || 'none' : out[sym].holes}`)
}
console.log('\nB. share count implied by each quarter (net income ÷ diluted EPS, billions), newest first, 12 quarters; today reported')
for (const [sym, h] of Object.entries(hist)) {
  const s = h.net_income_fq_h.slice(0, 12).map((ni, i) => { const e = h.earnings_per_share_diluted_fq_h[i]; return fin(ni) && e ? (ni / e / 1e9).toFixed(2) : '—' })
  console.log(`${sym.padEnd(13)} ${s.join(' ')} | reported ${(quotes[sym].total_shares_outstanding / 1e9).toFixed(2)}`)
}
console.log('\nC. P/E by month around known splits / bonus issues (page series)')
const show = (sym, from, to) => console.log(sym, page[sym].perMonth.filter((m) => m.mk >= from && m.mk <= to).map((m) => `${m.mk}: ${m.c.toFixed(2)} ÷ ${fin(m.eps) ? m.eps.toFixed(3) : '—'} [${m.period}] = ${fin(m.pe) ? m.pe.toFixed(1) : '—'}`).join('\n   '))
show('NASDAQ:NVDA', '2024-02', '2024-09')
show('TADAWUL:1120', '2025-12', '2026-07')
show('TADAWUL:2222', '2025-06', '2026-11')
fs.writeFileSync(D + 'out/plumbing.json', JSON.stringify(out, null, 1))
