// Study 17 (PROTOCOL-study17.md): market value at December closes, ranks, and the four rules.
// Every value at December Y reads only the December-Y close and fiscal years labelled ≤ Y
// (shares) or ≤ Y−1 (revenue).
import { monthKey } from './fairvalue.js'

const pos = (x) => Number.isFinite(x) && x > 0

/** December closes { year → close } from monthly bars { t, c }. */
export function decCloses(bars) {
  const out = {}
  bars.t.forEach((t, i) => {
    const m = monthKey(t)
    if (m.endsWith('-12') && pos(bars.c[i])) out[Number(m.slice(0, 4))] = bars.c[i]
  })
  return out
}

/**
 * §1: the share count of the fiscal year labelled `year`; if missing, the nearest labelled
 * year with a count, the earlier on a tie (flagged). funds = parseFundamentals output.
 */
export function sharesFor(funds, year) {
  const have = funds.filter((f) => pos(f.shares))
  if (!have.length) return null
  const exact = have.find((f) => f.year === year)
  if (exact) return { shares: exact.shares, year, flagged: false }
  let best = null
  for (const f of have) {
    const d = Math.abs(f.year - year)
    if (!best || d < best.d || (d === best.d && f.year < best.f.year)) best = { d, f }
  }
  return { shares: best.f.shares, year: best.f.year, flagged: true }
}

/** cap(Y) = December-Y close × shares(Y); null without a close or a count. */
export function capAt(dec, funds, year) {
  const c = dec[year]
  const s = sharesFor(funds, year)
  return pos(c) && s ? { cap: c * s.shares, close: c, sharesYear: s.year, flagged: s.flagged } : null
}

const revOf = (funds, year) => funds.find((f) => f.year === year)?.rev

/**
 * §3 rule values for one company at December Y. caps = { year → cap }.
 * M: ln(cap Y ÷ cap Y−1); G: ½ ln(rev FY Y−1 ÷ rev FY Y−3); S: −ln cap Y; V: rev FY Y−1 ÷ cap Y (not Finance).
 */
export function rules(caps, funds, year, sector) {
  const c = caps[year]
  if (!pos(c)) return null
  const c1 = caps[year - 1]
  const r1 = funds ? revOf(funds, year - 1) : null
  const r3 = funds ? revOf(funds, year - 3) : null
  return {
    M: pos(c1) ? Math.log(c / c1) : null,
    G: pos(r1) && pos(r3) ? 0.5 * Math.log(r1 / r3) : null,
    S: -Math.log(c),
    V: pos(r1) && sector !== 'Finance' ? r1 / c : null,
  }
}

/** Ranks 1..n by cap, largest first; input [{ key, cap }], output Map(key → rank). */
export function rankByCap(rows) {
  const out = new Map()
  ;[...rows].filter((r) => pos(r.cap)).sort((a, b) => b.cap - a.cap || (a.key < b.key ? -1 : 1)).forEach((r, i) => out.set(r.key, i + 1))
  return out
}

// addendum 2: the top 100 (was 200)
export const BUCKETS = [[1, 10], [11, 20], [21, 50], [51, 100]]
export const BELOW = 'below 100'
export const bucketOf = (rank) => {
  if (!rank) return null
  const i = BUCKETS.findIndex(([a, b]) => rank >= a && rank <= b)
  return i < 0 ? BELOW : `${BUCKETS[i][0]}–${BUCKETS[i][1]}`
}

/**
 * §5 transition shares from rank buckets at Y to Y+h (addendum 2: top-100 buckets). ranksByYear: { year → Map(key → rank) };
 * dead: Map(key → last year with a December value). Pooled over every start year with Y+h present.
 */
export function transitions(ranksByYear, dead, h) {
  const years = Object.keys(ranksByYear).map(Number).sort((a, b) => a - b)
  const out = {}
  for (const y of years) {
    const to = ranksByYear[y + h]
    if (!to) continue
    for (const [key, r] of ranksByYear[y]) {
      const from = bucketOf(r)
      if (from === BELOW) continue
      const r2 = to.get(key)
      const dest = r2 ? bucketOf(r2) : dead.has(key) && dead.get(key) < y + h ? 'no longer trading' : BELOW
      out[from] ??= {}
      out[from][dest] = (out[from][dest] ?? 0) + 1
    }
  }
  return out
}
