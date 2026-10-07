// Audit every snapshot: is the data sane, and do the published numbers follow from it?
//
//   node options/validate.js <dataDir> [--write]
//
// Two kinds of check:
//   1. Integrity — each contract row is internally consistent (symbol matches its fields,
//      bid ≤ ask, delta has the right sign, nothing expired, nothing negative).
//   2. Recalculation — every contract's size and every watchlist figure is recomputed here
//      by a separate, deliberately plain implementation of the method and compared to what
//      the engine published. Any difference is a bug in one of them.
// --write saves validation.json next to the snapshots so the page can show the result.

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { contractMetrics, parseOccSymbol } from './engine.js'

// The method, written out again without reusing the engine.
const REF = { pctAdv: 0.10, pctOi: 0.05, maxSpread: 0.15, minSessions: 5, prior: 0.02, legs: 6, dMin: 0.2, dMax: 0.85 }
const REF_BUCKETS = [[20, 90], [90, 180], [180, 365], [365, 730], [730, 1300]]

function refContract(c) {
  if (!(c.bid > 0) || !(c.ask >= c.bid)) return { contracts: 0, dollars: 0, grade: 'D' }
  const mid = (c.bid + c.ask) / 2
  const spread = (c.ask - c.bid) / mid
  if (spread > REF.maxSpread) return { contracts: 0, dollars: 0, grade: 'D' }
  const s = c.sessions ?? 0
  const adv = s >= REF.minSessions ? c.adv : ((s > 0 ? c.adv : 0) * s + REF.prior * c.oi * (REF.minSessions - s)) / REF.minSessions
  const contracts = Math.max(0, Math.min(Math.floor(REF.pctOi * c.oi), Math.max(Math.floor(REF.pctAdv * adv), Math.floor(Math.min(c.bidSize, adv)))))
  let grade = 'D'
  if (spread <= 0.03 && c.oi >= 2000) grade = 'A'
  else if (spread <= 0.06 && c.oi >= 500) grade = 'B'
  else if (spread <= 0.10 && c.oi >= 100) grade = 'C'
  return { contracts, dollars: contracts * c.ask * 100, grade }
}

const days = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000)

function refBucket(contracts, today, type, [lo, hi]) {
  const sized = contracts
    .filter((c) => c.type === type && c.delta != null && Math.abs(c.delta) >= REF.dMin && Math.abs(c.delta) <= REF.dMax)
    .filter((c) => { const d = days(c.expiry, today); return d >= lo && d < hi })
    .map((c) => refContract(c))
    .filter((r) => r.contracts > 0)
  const order = { A: 0, B: 1, C: 2, D: 3 }
  sized.sort((x, y) => order[x.grade] - order[y.grade] || y.dollars - x.dollars)
  return Math.round(sized.slice(0, REF.legs).reduce((s, r) => s + r.dollars, 0))
}

export function auditSnapshot(snap, entry) {
  const errors = []
  const err = (msg) => { if (errors.length < 20) errors.push(msg) }
  const ci = Object.fromEntries(snap.cols.map((c, i) => [c, i]))
  const today = snap.fetchedAt.slice(0, 10)
  if (!(snap.price > 0)) err(`underlying price missing (${snap.price})`)

  const contracts = []
  for (const r of snap.rows) {
    const c = {
      sym: r[ci.sym], expiry: snap.expiries[r[ci.exp]], type: r[ci.type], strike: r[ci.strike], bid: r[ci.bid], ask: r[ci.ask],
      bidSize: r[ci.bidSize], volume: r[ci.volume], oi: r[ci.oi], delta: r[ci.delta], adv: r[ci.adv], sessions: r[ci.sessions],
    }
    contracts.push(c)
    const p = parseOccSymbol(c.sym)
    if (!p) { err(`${c.sym}: unparseable symbol`); continue }
    if (p.expiry !== c.expiry || p.type !== c.type || Math.abs(p.strike - c.strike) > 1e-9) err(`${c.sym}: fields do not match symbol`)
    if (days(c.expiry, today) < 1) err(`${c.sym}: expired at fetch time`)
    for (const k of ['bid', 'ask', 'bidSize', 'volume', 'oi', 'adv']) {
      if (!Number.isFinite(c[k]) || c[k] < 0) err(`${c.sym}: ${k} = ${c[k]}`)
    }
    if (c.bid > 0 && c.ask > 0 && c.bid > c.ask) err(`${c.sym}: bid ${c.bid} > ask ${c.ask}`)
    if (c.delta != null && (Math.abs(c.delta) > 1 || (c.type === 'C' && c.delta < -1e-9) || (c.type === 'P' && c.delta > 1e-9))) err(`${c.sym}: delta ${c.delta} for a ${c.type}`)
    if (c.sessions > (snap.historySessions ?? 0)) err(`${c.sym}: ${c.sessions} sessions but history has ${snap.historySessions}`)

    const mine = refContract(c)
    const eng = contractMetrics(c)
    if (eng.capContracts !== mine.contracts || Math.abs(eng.capDollars - mine.dollars) > 1e-6 || eng.grade !== mine.grade) {
      err(`${c.sym}: engine says ${eng.capContracts} (${eng.grade}), check says ${mine.contracts} (${mine.grade})`)
    }
  }

  if (entry?.caps) {
    for (const type of ['C', 'P']) {
      REF_BUCKETS.forEach((b, i) => {
        const mine = refBucket(contracts, today, type, b)
        if (entry.caps[type][i] !== mine) err(`${type} ${b[0]}–${b[1]} days: published $${entry.caps[type][i]}, check says $${mine}`)
      })
    }
  } else {
    err('watchlist entry has no capacities')
  }
  return { errors, contracts: contracts.length }
}

async function main() {
  const [dataDir, ...rest] = process.argv.slice(2)
  if (!dataDir) throw new Error('usage: node options/validate.js <dataDir> [--write]')
  const index = JSON.parse(await readFile(join(dataDir, 'index.json'), 'utf8'))
  const out = { checkedAt: new Date().toISOString(), tickers: 0, contracts: 0, noOptions: 0, fetchErrors: [], failed: {}, oldestQuotes: null }
  for (const [t, entry] of Object.entries(index.tickers)) {
    if (entry.noOptions) { out.noOptions += 1; continue }
    if (entry.error) { out.fetchErrors.push(`${t}: ${entry.error}`); continue }
    let snap
    try {
      snap = JSON.parse(await readFile(join(dataDir, `${t}.json`), 'utf8'))
    } catch {
      out.failed[t] = ['snapshot file missing']
      continue
    }
    const r = auditSnapshot(snap, entry)
    out.tickers += 1
    out.contracts += r.contracts
    if (r.errors.length) out.failed[t] = r.errors
    const q = snap.quotesFrom ?? snap.fetchedAt
    if (!out.oldestQuotes || q < out.oldestQuotes) out.oldestQuotes = q
  }
  const nFailed = Object.keys(out.failed).length
  out.ok = nFailed === 0 && out.fetchErrors.length === 0
  console.log(`checked ${out.tickers} tickers, ${out.contracts} contracts; ${out.noOptions} without options; ${out.fetchErrors.length} fetch errors; ${nFailed} with problems`)
  for (const [t, e] of Object.entries(out.failed).slice(0, 30)) console.log(`  ${t}: ${e.slice(0, 3).join(' | ')}`)
  for (const e of out.fetchErrors.slice(0, 30)) console.log(`  fetch: ${e}`)
  if (rest.includes('--write')) await writeFile(join(dataDir, 'validation.json'), JSON.stringify(out))
  if (!out.ok) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
