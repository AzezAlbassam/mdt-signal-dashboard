// Study 17 run (PROTOCOL-study17.md): tests §4 and the reported tables of §5, from
// data/caps/companies.json (built by scripts/caps-build.js). Writes reports/study17.txt + .json.
//   node scripts/study17-run.js
import fs from 'node:fs'
import { spearman, signFlipGreater, holm } from '../engine/fairvalue.js'
import { rules, rankByCap, transitions, BUCKETS, bucketOf } from '../engine/caps.js'
import { percentiles } from '../engine/ranks.js'

const D = JSON.parse(fs.readFileSync(process.env.CAPS ?? 'data/caps/companies.json', 'utf8'))
const ALL = D.companies
const YEARS = Array.from({ length: 11 }, (_, i) => 2015 + i) // December closes 2015–2025
const POINTS = [...YEARS, 2026] // + the 2026-10-23 snapshot (descriptive only)
const RULES = ['M', 'G', 'S', 'V']
const RULE_YEARS = { M: [2016, 2024], G: [2015, 2024], S: [2015, 2024], V: [2015, 2024] }
const MIN_N = 80 // addendum 2 (was 100)
const lines = []
const out = (s = '') => lines.push(s)
const pct = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${(100 * x).toFixed(d)}%`)
const f3 = (x) => (x == null || !Number.isFinite(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(3))
const median = (xs) => {
  const a = xs.filter(Number.isFinite).sort((p, q) => p - q)
  if (!a.length) return null
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

function run(companies, label) {
  const byKey = new Map(companies.map((c) => [c.key, c]))
  const usAt = (c, y) => !!c.us?.[y] && Number.isFinite(c.cap?.[y]) && c.cap[y] > 0
  const ranks = {}
  for (const y of POINTS) ranks[y] = rankByCap(companies.filter((c) => usAt(c, y)).map((c) => ({ key: c.key, cap: c.cap[y] })))
  const top = (y, n) => [...ranks[y]].filter(([, r]) => r <= n).map(([k]) => byKey.get(k))
  const dead = new Map(companies.filter((c) => c.dead != null).map((c) => [c.key, c.dead]))
  const funds = (c) => Object.entries(c.rev ?? {}).map(([y, rev]) => ({ year: Number(y), rev }))
  return { byKey, ranks, top, dead, funds, label }
}

const R = run(ALL, 'all')
const RS = run(ALL.filter((c) => c.dead == null), 'survivors only')

// ---------------------------------------------------------------- §4 tests
function ics(ctx, horizon) {
  const res = {}
  for (const k of RULES) {
    const [y0, y1] = RULE_YEARS[k]
    const yearly = []
    for (let y = y0; y <= Math.min(y1, 2025 - horizon); y += 1) {
      const U = ctx.top(y, 100) // addendum 2: top 100
      const rows = []
      const gone = []
      let deadNoValue = 0 // §1: dead companies have no revenue, so they are missing from G and V (counted)
      for (const c of U) {
        const later = c.cap?.[y + horizon]
        if (!(later > 0)) { gone.push(c.name ?? c.key); continue }
        const v = rules(c.cap, ctx.funds(c), y, c.sector)?.[k]
        if (v == null || !Number.isFinite(v)) { if (c.dead != null) deadNoValue += 1; continue }
        rows.push({ v, g: Math.log(later / c.cap[y]) })
      }
      const p = percentiles(rows.map((r) => r.v))
      const hi = rows.filter((_, i) => p[i] >= 0.8).map((r) => r.g)
      const lo = rows.filter((_, i) => p[i] <= 0.2).map((r) => r.g)
      yearly.push({ y, n: rows.length, counts: rows.length >= MIN_N, ic: rows.length >= 2 ? spearman(rows.map((r) => r.v), rows.map((r) => r.g)) : null, spread: hi.length && lo.length ? median(hi) - median(lo) : null, gone, deadNoValue })
    }
    const counted = yearly.filter((x) => x.counts)
    res[k] = { yearly, counted: counted.length, meanIC: counted.length ? mean(counted.map((x) => x.ic)) : null, p: counted.length >= 2 ? signFlipGreater(counted.map((x) => x.ic)) : null }
  }
  return res
}

const T1 = ics(R, 1)
const testable = RULES.filter((k) => T1[k].p != null)
const adj = holm(testable.map((k) => T1[k].p))
testable.forEach((k, i) => { T1[k].holm = adj[i]; T1[k].confirmed = T1[k].meanIC > 0 && adj[i] < 0.05 })

out('STUDY 17 — who climbs the top of the US market (PROTOCOL-study17.md)')
out(`companies in the file: ${ALL.length} (${ALL.filter((c) => c.dead != null).length} no longer trading); built ${D.asOf}`)
out()
out('§4 TESTS — one-year outcome g1 = ln(cap Y+1 ÷ cap Y), U(Y) = the 100 largest US companies (addendum 2)')
for (const k of RULES) {
  const r = T1[k]
  out(`  H_${k}: mean IC ${f3(r.meanIC)} over ${r.counted} counted years, sign-flip p ${r.p?.toFixed(4) ?? '—'}, Holm ${r.holm?.toFixed(4) ?? '—'} → ${r.confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}`)
  out(`        yearly IC: ${r.yearly.map((x) => `${x.y} ${f3(x.ic)}${x.counts ? '' : '*'} (n ${x.n}${x.deadNoValue ? `; ${x.deadNoValue} dead without revenue` : ''})`).join(', ')}`)
  out(`        top fifth − bottom fifth median g1: ${r.yearly.map((x) => `${x.y} ${pct(x.spread)}`).join(', ')}`)
}
out(`  * = fewer than ${MIN_N} companies with both values; not counted`)
out('  left out (stopped trading within the year): ' + T1.S.yearly.map((x) => `${x.y}: ${x.gone.length ? x.gone.join(', ') : 'none'}`).join(' | '))
out()

// ---------------------------------------------------------------- §5 reported
const T3 = ics(R, 3)
out('§5 the four rules on the 3-year outcome (overlapping years, no p-value)')
for (const k of RULES) out(`  ${k}: mean IC ${f3(T3[k].meanIC)} — ${T3[k].yearly.map((x) => `${x.y} ${f3(x.ic)}`).join(', ')}`)
out()

function baseRates(ctx) {
  const o = {}
  const dests = ['1–10', '11–20', '21–50', '51–100', 'below 100', 'no longer trading']
  for (const h of [1, 3, 5, 10]) {
    const tr = transitions(Object.fromEntries(POINTS.filter((y) => y <= 2025).map((y) => [y, ctx.ranks[y]])), ctx.dead, h)
    o[h] = Object.fromEntries(BUCKETS.map(([a, b]) => `${a}–${b}`).map((from) => {
      const row = tr[from] ?? {}
      const n = Object.values(row).reduce((p, q) => p + q, 0)
      return [from, { n, shares: Object.fromEntries(dests.map((d) => [d, n ? (row[d] ?? 0) / n : null])) }]
    }))
  }
  return o
}
const BR = baseRates(R)
const BRS = baseRates(RS)
for (const [name, br] of [['ALL companies (dead ones included)', BR], ['SURVIVORS ONLY (what survivorship would show)', BRS]]) {
  out(`§5 transition shares — ${name}`)
  for (const h of [1, 3, 5, 10]) {
    out(`  horizon ${h} year(s):`)
    for (const [from, { n, shares }] of Object.entries(br[h])) out(`    from ${from.padEnd(7)} (n ${String(n).padStart(4)}): ${Object.entries(shares).map(([d, s]) => `${d} ${pct(s, 0)}`).join(' · ')}`)
  }
  out()
}

const PAGE = { entrants: [], multi: [], still: {}, topdog: [], hindsight: {} } // the same tables, for the page
out('§5 top 10 at each date')
for (const y of POINTS) out(`  ${y === 2026 ? '2026-10-23' : `Dec ${y}`}: ${R.top(y, 10).sort((a, b) => R.ranks[y].get(a.key) - R.ranks[y].get(b.key)).map((c) => c.name ?? c.key).join(', ')}`)
for (const h of [5, 10]) {
  const rows = YEARS.filter((y) => y + h <= 2025).map((y) => {
    const t0 = new Set(R.top(y, 10).map((c) => c.key))
    const t1 = new Set(R.top(y + h, 10).map((c) => c.key))
    const kept = [...t0].filter((k) => t1.has(k)).length
    ;(PAGE.still[h] ??= []).push({ from: y, kept })
    return `${y}→${y + h}: ${kept}/10`
  })
  out(`  still in the top 10 after ${h} years: ${rows.join(', ')}`)
}
out()

out('§5 entrants to the top 10 and top 20: rank 1, 3 and 5 years earlier')
for (const n of [10, 20]) {
  const seen = new Set()
  for (const y of POINTS.slice(1)) {
    const prev = new Set(R.top(y - 1, n).map((c) => c.key))
    for (const c of R.top(y, n)) {
      if (prev.has(c.key) || seen.has(c.key)) continue
      seen.add(c.key)
      const back = (k) => {
        const yy = (y === 2026 ? 2025 : y) - k
        return R.ranks[yy]?.get(c.key) ?? (c.cap?.[yy] ? 'not a US company then' : 'not listed / no value')
      }
      PAGE.entrants.push({ n, y, key: c.key, rank: R.ranks[y].get(c.key), back1: back(1), back3: back(3), back5: back(5) })
      out(`  top ${n} from ${y === 2026 ? '2026-10' : y}: ${c.name ?? c.key} (rank ${R.ranks[y].get(c.key)}) — 1y before ${back(1)}, 3y ${back(3)}, 5y ${back(5)}`)
    }
  }
}
out()

out('§5 multi-baggers within 5 years (cap Y+5 ÷ cap Y), from the top 100 at Y')
const climbers = []
for (let y = 2015; y <= 2020; y += 1) {
  const U = R.top(y, 100)
  const x3 = U.filter((c) => c.cap?.[y + 5] / c.cap[y] >= 3)
  const x5 = x3.filter((c) => c.cap[y + 5] / c.cap[y] >= 5)
  for (const c of x3) climbers.push({ c, y })
  PAGE.multi.push({ y, n: U.length, x3: x3.length, x5: x5.length, list: x3.map((c) => ({ key: c.key, mult: c.cap[y + 5] / c.cap[y], from: R.ranks[y].get(c.key), to: R.ranks[y + 5].get(c.key) ?? null })) })
  out(`  ${y}→${y + 5}: ≥3× ${x3.length} of ${U.length}, ≥5× ${x5.length}; ${x3.sort((a, b) => b.cap[y + 5] / b.cap[y] - a.cap[y + 5] / a.cap[y]).map((c) => `${c.name ?? c.key} ${(c.cap[y + 5] / c.cap[y]).toFixed(1)}× (rank ${R.ranks[y].get(c.key)}→${R.ranks[y + 5].get(c.key) ?? '—'})`).join(', ')}`)
}
out()

out('§5 the largest company and the top 10 vs the rest (one-year g1)')
for (let y = 2015; y <= 2024; y += 1) {
  const g = (c) => (c.cap?.[y + 1] > 0 ? Math.log(c.cap[y + 1] / c.cap[y]) : null)
  const sorted = R.top(y, 100).sort((a, b) => R.ranks[y].get(a.key) - R.ranks[y].get(b.key))
  const first = sorted[0]
  PAGE.topdog.push({ y, key: first.key, g1: g(first), rest: median(sorted.slice(1).map(g)), top10: median(sorted.slice(0, 10).map(g)), others: median(sorted.slice(10).map(g)) })
  out(`  ${y}: #1 ${first.name ?? first.key} ${f3(g(first))} vs ranks 2–100 median ${f3(median(sorted.slice(1).map(g)))}; top-10 median ${f3(median(sorted.slice(0, 10).map(g)))} vs 11–100 ${f3(median(sorted.slice(10).map(g)))}`)
}
out()

out('§5 "obvious in hindsight": percentiles at the start of the companies that tripled within 5 years vs everybody else in U(Y)')
for (const k of RULES) {
  const tri = []
  const rest = []
  for (let y = 2015; y <= 2020; y += 1) {
    const U = R.top(y, 100)
    const vals = U.map((c) => rules(c.cap, R.funds(c), y, c.sector)?.[k])
    const ok = U.map((c, i) => [c, vals[i]]).filter(([, v]) => v != null && Number.isFinite(v))
    const p = percentiles(ok.map(([, v]) => v))
    ok.forEach(([c], i) => (c.cap?.[y + 5] / c.cap[y] >= 3 ? tri : rest).push(p[i]))
  }
  const share = (xs) => (xs.length ? xs.filter((p) => p >= 0.8).length / xs.length : null)
  PAGE.hindsight[k] = { tripled: tri.length, tripledMedian: median(tri), tripledTopFifth: share(tri), rest: rest.length, restMedian: median(rest), topFifthHitRate: tri.filter((p) => p >= 0.8).length / Math.max(1, [...tri, ...rest].filter((p) => p >= 0.8).length) }
  out(`  ${k}: tripled (n ${tri.length}) median percentile ${tri.length ? median(tri).toFixed(2) : '—'}, in the rule's top fifth ${pct(share(tri), 0)}; the rest (n ${rest.length}) median ${rest.length ? median(rest).toFixed(2) : '—'}; of all companies in the rule's top fifth, ${pct(tri.filter((p) => p >= 0.8).length / Math.max(1, [...tri, ...rest].filter((p) => p >= 0.8).length), 0)} tripled`)
}
out()

// ---------------------------------------------------------------- data checks
out('§5 data checks')
const v1 = ALL.filter((c) => c.v1?.model > 0 && c.v1?.tv > 0).map((c) => ({ c, gap: c.v1.model / c.v1.tv - 1 }))
out(`  V1: ${v1.length} trading companies; median |gap| ${pct(median(v1.map((x) => Math.abs(x.gap))))}; above 15%: ${v1.filter((x) => Math.abs(x.gap) > 0.15).map((x) => `${x.c.name ?? x.c.key} ${pct(x.gap, 0)}`).join(', ') || 'none'}`)
if (D.v2) for (const l of D.v2) out(`  V2: ${l}`)
if (D.v3) for (const l of D.v3) out(`  V3: ${l}`)
if (D.v4) for (const l of D.v4) out(`  V4: ${l}`)

fs.mkdirSync('reports', { recursive: true })
fs.writeFileSync('reports/study17.txt', lines.join('\n') + '\n')
fs.writeFileSync('reports/study17.json', JSON.stringify({ tests: T1, threeYear: T3, baseRates: BR, baseRatesSurvivors: BRS, page: PAGE }, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v), 1))
console.log(lines.join('\n'))
