// Study 7 — POST-HOC, written after reports/study7.txt existed. Not evidence; it explains
// that result and suggests what a next pre-registered study could test.
//   node scripts/study7-posthoc.js → reports/study7-posthoc.txt
// 1. Zone table with medians: a few stocks gained 50–140× in a year (APLD 2020, WOLF and
//    AXTI 2025), so the protocol's means are driven by single names.
// 2. For scale: the same yearly rank correlation for plain 12-month price momentum on the
//    same stocks and dates.
import fs from 'node:fs'

import { parseFundamentals, fairValuesAt, variantFair, monthKey, spearman } from '../engine/fairvalue.js'

const LAST = '2026-09'
const symbols = JSON.parse(fs.readFileSync('data/fv/symbols.json', 'utf8'))
const sectors = JSON.parse(fs.readFileSync('data/fv/sectors.json', 'utf8'))
const f = (d, s) => `data/fv/raw/${d}/${s.replace(':', '_')}.json`
const stocks = []
for (const sym of symbols) {
  if (sectors[sym]?.type !== 'stock' || !fs.existsSync(f('fin', sym)) || !fs.existsSync(f('px', sym))) continue
  const funds = parseFundamentals(JSON.parse(fs.readFileSync(f('fin', sym), 'utf8')))
  if (funds.filter((x) => x.rev != null && x.eps != null).length < 6) continue
  const b = JSON.parse(fs.readFileSync(f('px', sym), 'utf8')).bars
  const closes = new Map()
  b.t.forEach((t, i) => { const m = monthKey(t); if (m <= LAST && Number.isFinite(b.c[i])) closes.set(m, b.c[i]) })
  if (closes.size < 60) continue
  stocks.push({ sym, sector: sectors[sym].sector, funds, closes })
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null }
const pct = (x) => (x == null ? '     –' : `${x >= 0 ? '+' : ''}${(100 * x).toFixed(0)}%`.padStart(6))
const L = ['Study 7 — POST-HOC (after the results). Not evidence.', `Stocks: ${stocks.length} (same rule as the main run).`, '',
  'Median 12-month return by zone (V0)        below green   between   above red    all     IC value   IC momentum']
const icV = [], icM = []
for (let y = 2012; `${y + 1}-05` <= LAST; y += 1) {
  const rows = []
  for (const s of stocks) {
    const a = s.closes.get(`${y}-05`), b = s.closes.get(`${y + 1}-05`), p = s.closes.get(`${y - 1}-05`)
    if (!(a > 0 && b > 0)) continue
    const fv = fairValuesAt(s.funds, s.closes, s.sector, `${y}-05`)
    const fair = variantFair(fv, 'V0')
    if (fair == null) continue
    rows.push({ u: fair / a - 1, fwd: b / a - 1, mom: p > 0 ? a / p - 1 : null })
  }
  const z = (fn) => med(rows.filter(fn).map((r) => r.fwd))
  const withMom = rows.filter((r) => r.mom != null)
  const iv = spearman(rows.map((r) => r.u), rows.map((r) => r.fwd))
  const im = spearman(withMom.map((r) => r.mom), withMom.map((r) => r.fwd))
  icV.push(iv); icM.push(im)
  L.push(`${y}  n=${String(rows.length).padStart(3)}                                ${pct(z((r) => r.u > 0.25))}    ${pct(z((r) => r.u <= 0.25 && r.u >= -1 / 6))}    ${pct(z((r) => r.u < -1 / 6))}   ${pct(z(() => true))}    ${iv.toFixed(3).padStart(6)}     ${im.toFixed(3).padStart(6)}`)
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
L.push('', `mean IC: value (V0) ${mean(icV).toFixed(3)}, 12-month momentum ${mean(icM).toFixed(3)} (momentum = price change over the 12 months before the date; nothing tested)`)
fs.writeFileSync('reports/study7-posthoc.txt', L.join('\n') + '\n')
console.log(L.join('\n'))
