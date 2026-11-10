// Study 17 addenda 3–4: TradingView price basis and the V2/V4 cross-checks, from the research journals.
//   data/caps/basis.json     — symbol → { Y: { s, src } }, S = TradingView December close ÷ actual close
//   data/caps/basis-log.json — segments, rejected measurements, leftovers (addendum 4 rules 1–3)
//   data/caps/v4.json        — independent year-end values for the 2015 and 2021 top 100 (addendum 1, V4)
//   data/caps/v2.json        — published year-end top-10 lists (protocol, V2)
// Run on the uncorrected build's closes (closes do not depend on the basis, so a rerun is safe).
//   node scripts/caps-basis.js <journal.jsonl> [...]
import fs from 'node:fs'

const files = process.argv.slice(2)
if (!files.length) throw new Error('usage: caps-basis.js <journal.jsonl> ...')
const results = [] // { label, r }
for (const f of files) {
  const label = new Map()
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const j = JSON.parse(line)
    if (j.type === 'started') label.set(j.key, j.label)
    if (j.type === 'result' && j.result != null) results.push({ label: label.get(j.key) ?? '', r: j.result })
  }
}
const D = JSON.parse(fs.readFileSync('data/caps/companies.json', 'utf8'))
const byKey = new Map(D.companies.map((c) => [c.key, c]))
const YEARS = Array.from({ length: 11 }, (_, i) => 2015 + i)
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }

// splits after which the journals' closes are still as printed: [date, new shares per old share]
const SPLITS = { 'NASDAQ:HON': [['2026-06-29', 0.5]] } // 1-for-2 reverse split with the Aerospace spin-off
const splitAdj = (key, year, raw) => raw / (SPLITS[key] ?? []).filter(([d]) => d > `${year}-12-31`).reduce((p, [, r]) => p * r, 1)

// ---------------------------------------------------------------- inputs
const events = results.flatMap(({ r }) => r.events ?? [])
const meas = [] // { key, year, actual, src }
const rejected = []
for (const { label, r } of results) {
  for (const c of r.companies ?? []) {
    for (const x of c.closes ?? []) {
      const raw = x.actualDecClose ?? x.close
      if (!(raw > 0)) continue
      // addendum 4 rule 2: the second pass takes only as-traded or split-only closes (the first pass has no basis field)
      if (x.basis && !['as-traded', 'split-adjusted'].includes(x.basis)) { rejected.push({ key: c.key, year: x.year, raw, why: `source basis ${x.basis}`, src: x.source }); continue }
      meas.push({ key: c.key, year: x.year, actual: splitAdj(c.key, x.year, raw), raw, src: `${label}: ${x.source}${x.quote ? ` — "${x.quote}"` : ''}` })
    }
  }
}
// addendum 4: the basis changes only at a distribution of shares
const bounds = {}
for (const e of events) if (e.kind === 'spin-off' || /warrant/i.test(e.detail)) (bounds[e.key] ??= []).push(e.date)
for (const k in bounds) bounds[k] = [...new Set(bounds[k])].sort()
const segOf = (k, y) => bounds[k].filter((d) => d <= `${y}-12-31`).length

// ---------------------------------------------------------------- V4
const v4 = {}
const v2 = {} // year → { top, source, note }: published year-end top-10 lists (PROTOCOL-study17.md, V2)
for (const { label, r } of results) {
  const y = label.match(/^v4:(\d{4})$/)?.[1]
  if (y) v4[y] = { rows: r.rows, missing: r.missingFromOurList, searchesUsed: r.searchesUsed ?? null }
  if (label.startsWith('v2:')) for (const x of r.years ?? []) if (x.top?.length) v2[x.year] = { top: x.top, source: x.source, note: x.note ?? '' }
}
const v4Of = (k, y) => [...(v4[y]?.rows ?? []), ...(v4[y]?.missing ?? [])].find((x) => x.ticker === k.split(':')[1])?.yearEndMcapBn
// companies.json may already carry a basis: undo it so a rerun sees the uncorrected value
const prev = fs.existsSync('data/caps/basis.json') ? JSON.parse(fs.readFileSync('data/caps/basis.json', 'utf8')) : {}
const appliedS = (k, y) => { const s = prev[k]?.[y]?.s; return s > 0 && Math.abs(s - 1) > 0.02 ? s : 1 }

// ---------------------------------------------------------------- segments
const basis = {}
const log = { segments: [], rejected, leftovers: [] }
for (const k of Object.keys(bounds).sort()) {
  const c = byKey.get(k)
  if (!c) { log.leftovers.push({ key: k, why: 'not in the build' }); continue }
  const segs = bounds[k].map((d, i) => ({ i, until: d, years: YEARS.filter((y) => segOf(k, y) === i && c.close?.[y] > 0) })).filter((s) => s.years.length)
  for (const s of segs) {
    const ms = meas.filter((m) => m.key === k && s.years.includes(m.year)).map((m) => ({ ...m, s: c.close[m.year] / m.actual }))
    const med = ms.length ? median(ms.map((m) => m.s)) : null
    const ok = ms.filter((m) => Math.abs(m.s / med - 1) <= 0.02)
    for (const m of ms.filter((x) => !ok.includes(x))) rejected.push({ key: k, year: m.year, raw: m.raw, s: +m.s.toFixed(4), why: `more than 2% from the segment median ${med.toFixed(4)}`, src: m.src })
    s.s = ok.length ? median(ok.map((m) => m.s)) : null
    s.measured = ok.map((m) => ({ year: m.year, actual: m.actual, s: +m.s.toFixed(4), src: m.src }))
  }
  for (const s of segs) {
    let src = s.s != null ? `measured ${s.measured.map((m) => m.year).join(', ')}` : null
    let v = s.s
    if (v == null) { // rule 3: nearest measured segment, a later one first
      const later = segs.find((t) => t.i > s.i && t.s != null)
      const earlier = [...segs].reverse().find((t) => t.i < s.i && t.s != null)
      const t = later ?? earlier
      if (t) { v = t.s; src = `leftover: S of the ${later ? 'later' : 'earlier'} segment ${t.years[0]}–${t.years.at(-1)}` }
      // no measured segment: our uncorrected value ÷ V4 in the segment's 2015/2021 (median when both)
      const vs = t ? [] : s.years.filter((y) => v4Of(k, y) > 0).map((y) => c.cap[y] * appliedS(k, y) / 1e9 / v4Of(k, y))
      if (vs.length) { v = median(vs); src = `leftover: our value ÷ V4 (${s.years.filter((y) => v4Of(k, y) > 0).join(', ')})` }
      log.leftovers.push({ key: k, years: s.years, s: v, rule: src ?? 'no measured segment: S stays 1' })
    }
    log.segments.push({ key: k, years: s.years, until: s.until, s: v == null ? null : +v.toFixed(4), src, measured: s.measured })
    if (v != null) for (const y of s.years) (basis[k] ??= {})[y] = { s: +v.toFixed(4), src: `${src} (distribution ${s.until})` }
  }
}

fs.writeFileSync('data/caps/basis.json', JSON.stringify(basis, null, 1))
fs.writeFileSync('data/caps/basis-log.json', JSON.stringify(log, null, 1))
if (Object.keys(v4).length) fs.writeFileSync('data/caps/v4.json', JSON.stringify(v4, null, 1))
if (Object.keys(v2).length) fs.writeFileSync('data/caps/v2.json', JSON.stringify(v2, null, 1))
const applied = log.segments.filter((s) => s.s != null && Math.abs(s.s - 1) > 0.02)
console.log(`measurements ${meas.length}, rejected ${rejected.length}; segments ${log.segments.length}, corrected (|S−1| > 2%) ${applied.length}, leftovers ${log.leftovers.length}`)
for (const s of log.segments) console.log(`  ${s.key} ${s.years[0]}–${s.years.at(-1)} (until ${s.until}): ${s.s ?? '—'}  ${s.src ?? 'unmeasured, S = 1'}`)
for (const r of rejected) console.log(`  rejected ${r.key} ${r.year} ${r.raw}: ${r.why}`)
console.log(`V4 years: ${Object.keys(v4).join(', ') || 'none'}; V2 years: ${Object.keys(v2).join(', ') || 'none'}`)
