// Sector and industry P/E history for the stock page's sectors tab. Descriptive, NOT a study:
// where a group's P/E sits in its own history says nothing tested about what comes next.
//   node scripts/sector-pe.js → pages/sector-pe.json
// A group's P/E = total market value ÷ total net income of its profitable members, which equals
// the earnings-weighted average of their P/E (price ÷ EPS), so share counts are not needed.
// Each month uses the fiscal year public then (study 7's rule), moved forward a year for a
// company whose latest fiscal year is already out today (mid-year fiscal years), as the page
// does. Members are today's stocks (survivorship: companies that left the market are missing).
import fs from 'node:fs'
import { stateAt, addMonths, lastUsableFiscalYear, liveShift } from '../engine/fairvalue.js'
import { loadUniverse } from './lib/universe.js'

const FIRST = '2011-05'
const LAST = '2026-10'
const MIN_PROFITABLE = 5
const MIN_INDUSTRY = 8

const months = []
for (let m = FIRST; m <= LAST; m = addMonths(m, 1)) months.push(m)

const stocks = []
const seen = new Set()
for (const dir of ['data/fv', 'data/fv8']) {
  const industries = JSON.parse(fs.readFileSync(`${dir}/sectors.json`, 'utf8'))
  for (const s of loadUniverse(dir, LAST).stocks) {
    // Two share classes of one company (GOOG/GOOGL) carry the same accounts: keep one.
    const f = s.funds.at(-1)
    const key = `${f.year}|${f.rev}|${f.ni}`
    if (seen.has(s.sym) || seen.has(key)) continue
    seen.add(s.sym)
    seen.add(key)
    stocks.push({ ...s, industry: industries[s.sym]?.industry ?? null, shift: liveShift(s.funds, LAST) })
  }
}

// P/E of one group per month, with the members counted in the latest month.
function series(members) {
  const pe = months.map((m) => {
    let value = 0
    let income = 0
    let n = 0
    for (const s of members) {
      const c = s.closes.get(m)
      const st = c > 0 && stateAt(s.funds, m, lastUsableFiscalYear(m) + s.shift)
      const ni = st && s.funds.find((f) => f.year === st.fiscalYear)?.ni
      if (!(st?.eps > 0 && ni > 0)) continue
      value += (c / st.eps) * ni
      income += ni
      n += 1
    }
    return n >= MIN_PROFITABLE ? Math.round((value / income) * 10) / 10 : null
  })
  return pe
}

const pctile = (a, p) => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}

function group(kind, key, members) {
  const pe = series(members)
  const hist = pe.filter((x) => x != null)
  const now = pe.at(-1)
  if (hist.length < 36 || now == null) return null
  return {
    kind, key, n: members.length,
    top: [...members].sort((a, b) => (b.closes.get(LAST) ?? 0) * (b.funds.at(-1).shares ?? 0) - (a.closes.get(LAST) ?? 0) * (a.funds.at(-1).shares ?? 0)).slice(0, 5).map((s) => s.sym),
    pe,
    p10: pctile(hist, 0.1), p50: pctile(hist, 0.5), p90: pctile(hist, 0.9),
    // Share of past months with a lower P/E than now.
    rank: hist.filter((x) => x < now).length / hist.length,
  }
}

const by = (field) => {
  const out = new Map()
  for (const s of stocks) if (s[field]) (out.get(s[field]) ?? out.set(s[field], []).get(s[field])).push(s)
  return out
}
const groups = []
for (const [key, members] of by('sector')) groups.push(group('sector', key, members))
for (const [key, members] of by('industry')) if (members.length >= MIN_INDUSTRY) groups.push(group('industry', key, members))
const kept = groups.filter(Boolean)
fs.writeFileSync('pages/sector-pe.json', JSON.stringify({ asOf: LAST, first: FIRST, stocks: stocks.length, months, groups: kept }))
console.log(`stocks ${stocks.length}; sectors ${kept.filter((g) => g.kind === 'sector').length}, industries ${kept.filter((g) => g.kind === 'industry').length}`)
for (const g of kept.filter((x) => x.kind === 'sector').sort((a, b) => a.rank - b.rank)) {
  console.log(`${g.key.padEnd(24)} n ${String(g.n).padStart(3)}  now ${String(g.pe.at(-1)).padStart(6)}  p10 ${g.p10}  p50 ${g.p50}  p90 ${g.p90}  rank ${(100 * g.rank).toFixed(0)}%`)
}
