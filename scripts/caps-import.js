// Study 17: turn the research agents' structured results (workflow journals) into
//   data/caps/dead.json       — companies that no longer trade: December values with sources and
//                               the independent check (PROTOCOL-study17.md §1, V3)
//   data/caps/overrides.json  — addendum 1 resolutions of flagged company-years
// The numbers here are the study's only hand-copied ones (by the agents, from cited sources).
//   RAW=1 node scripts/caps-build.js && node scripts/caps-import.js <journal.jsonl> [...]
// (overrides are decided against the raw build: a build that already applies them would drop them)
import fs from 'node:fs'

const files = process.argv.slice(2)
if (!files.length) throw new Error('usage: caps-import.js <journal.jsonl> ...')
const results = []
for (const f of files) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const j = JSON.parse(line)
    if (j.type !== 'result' || j.result == null) continue
    let r = j.result
    if (typeof r === 'string') { try { r = JSON.parse(r) } catch { continue } }
    results.push(r)
  }
}

// ---------------------------------------------------------------- dead companies
const research = new Map() // id → firm
const checks = new Map() // id → Map(date → check)
// addendum 2 names the dead non-members researched as US companies (VMware also in §1); their finder
// journal is not among the imported ones, so they are listed here. POST-HOC: missing in the first run.
const nonSp = new Set(['VMW', 'LNKD', 'S', 'AABA'])
const addChecks = (id, cs) => {
  const m = checks.get(id) ?? new Map()
  for (const c of cs ?? []) m.set(c.date.slice(0, 4), c)
  checks.set(id, m)
}
const normId = (t) => t.replace(/^(NYSE|NASDAQ|AMEX):/, '')
for (const r of results) {
  // several batches may cover one company: merge their year-ends, a later number filling a gap
  if (Array.isArray(r.firms) && r.firms.some((f) => f.yearEnds)) {
    for (const f of r.firms) {
      const id = normId(f.ticker)
      const prev = research.get(id)
      if (!prev) { research.set(id, { ...f, yearEnds: [...(f.yearEnds ?? [])] }); continue }
      for (const y of f.yearEnds ?? []) {
        const i = prev.yearEnds.findIndex((p) => p.date.slice(0, 4) === y.date.slice(0, 4))
        const has = (x) => x && (x.marketCapBn > 0 || (x.closePrice > 0 && x.sharesOutstanding > 0))
        if (i < 0) prev.yearEnds.push(y)
        else if (!has(prev.yearEnds[i]) && has(y)) prev.yearEnds[i] = y
      }
      prev.note = [prev.note, f.note].filter(Boolean).join(' | ')
    }
  }
  if (Array.isArray(r.firms) && r.firms.some((f) => f.checks)) for (const f of r.firms) addChecks(normId(f.ticker), f.checks)
  if (r.ticker && r.checks) addChecks(normId(r.ticker), r.checks)
  if (Array.isArray(r.companies) && r.companies.some((c) => c.yearsAboveThresholdOutsideSP || c.years)) {
    for (const c of r.companies) if (c.status === 'dead') nonSp.add(normId(c.symbol))
  }
}
const dead = {}
const v3 = []
for (const [id, f] of research) {
  const yearEnds = {}
  for (const y of f.yearEnds ?? []) {
    const year = y.date.slice(0, 4)
    const base = y.marketCapBn ?? (y.closePrice > 0 && y.sharesOutstanding > 0 ? (y.closePrice * y.sharesOutstanding) / 1e9 : null)
    const c = checks.get(id)?.get(year)
    let capBn = base
    let how = !c ? 'research, no check returned' : c.agreeWithin10pct === true ? 'research, confirmed by the check' : 'research, check found no independent number'
    if (c && c.agreeWithin10pct === false) {
      const fix = c.correctMcapBn ?? c.myMcapBn
      if (fix > 0) { capBn = fix; how = `checker's value (research had ${base?.toFixed(1) ?? 'none'})` }
      v3.push(`${id} ${year}: research ${base?.toFixed(1) ?? '—'} vs check ${c.myMcapBn?.toFixed(1) ?? '—'} → used ${capBn?.toFixed(1) ?? '—'} (${c.note ?? c.source ?? ''})`.slice(0, 300))
    } else if (base == null && c?.myMcapBn > 0) { capBn = c.myMcapBn; how = 'checker only' }
    if (!(capBn > 0)) continue
    yearEnds[year] = { cap: capBn * 1e9, close: y.closePrice ?? null, shares: y.sharesOutstanding ?? null, how, priceSource: y.priceSource, sharesSource: y.sharesSource, checkSource: c?.source ?? null }
  }
  const years = Object.keys(yearEnds).map(Number)
  if (!years.length) continue
  dead[id] = { name: f.company, tvSymbol: f.tvSymbol ?? null, lastYear: Math.max(...years), us: nonSp.has(id), yearEnds, note: f.note ?? '' }
}

// ---------------------------------------------------------------- overrides (addendum 1)
const companies = JSON.parse(fs.readFileSync('data/caps/companies.json', 'utf8')).companies
const byKey = new Map(companies.map((c) => [c.key, c]))
const overrides = {}
const log = []
let looked = 0
for (const r of results) {
  if (!Array.isArray(r.companies) || !r.companies.some((c) => c.rows)) continue
  for (const c of r.companies) {
    const co = byKey.get(c.key)
    for (const row of c.rows ?? []) {
      looked += 1
      const y = String(row.year)
      if (!(row.actualShares > 0)) { log.push(`${c.key} ${y}: no count found`); continue }
      const factor = (row.splitsAfter ?? []).reduce((p, s) => p * (s.ratio > 0 ? s.ratio : 1), 1)
      const storedCap = co?.cap?.[y]
      const storedClose = co?.close?.[y]
      let o = null
      if (row.actualDecClose > 0) {
        const cap = row.actualDecClose * row.actualShares
        if (!(storedCap > 0) || Math.abs(cap / storedCap - 1) > 0.1) o = { cap, src: `${row.sharesSource}; close ${row.closeSource ?? ''}`.slice(0, 300) }
      } else if (storedClose > 0) {
        const shares = row.actualShares * factor
        const cap = storedClose * shares
        if (!(storedCap > 0) || Math.abs(cap / storedCap - 1) > 0.1) o = { shares, src: String(row.sharesSource).slice(0, 300) }
      }
      if (o) {
        ;(overrides[c.key] ??= {})[y] = { ...o, note: String(row.note ?? '').slice(0, 200) }
        log.push(`${c.key} ${y}: override (${storedCap ? `stored ${(storedCap / 1e9).toFixed(1)}B → ${((o.cap ?? storedClose * o.shares) / 1e9).toFixed(1)}B` : 'no stored value'})`)
      }
    }
  }
}
fs.writeFileSync('data/caps/dead.json', JSON.stringify(dead, null, 1))
fs.writeFileSync('data/caps/overrides.json', JSON.stringify(overrides, null, 1))
fs.writeFileSync('data/caps/import-log.json', JSON.stringify({ v3, overrides: log }, null, 1))
console.log(`dead companies ${Object.keys(dead).length} (${Object.values(dead).reduce((n, d) => n + Object.keys(d.yearEnds).length, 0)} year-ends; ${v3.length} disagreements resolved); looked-up rows ${looked}, overrides ${Object.values(overrides).reduce((n, o) => n + Object.keys(o).length, 0)}`)
