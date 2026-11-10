// Run study 2 (PROTOCOL-us.md) over data/us/, or — with --study1 — rerun study 1 through the
// same scalable path to check it reproduces reports/swing-*.txt.
//
//   node scripts/us-backtest.js            → reports/us-*.txt, reports/us-results.json
//   node scripts/us-backtest.js --study1   → prints study 1's tables for comparison

import fs from 'node:fs'
import zlib from 'node:zlib'

import { summarizeSymbol, runTradeTrack, runRegimeTrack, testOne, PERIODS } from '../engine/study.js'

const STUDY1 = process.argv.includes('--study1')
const SPLIT = '2018-01-01'
const CUTOFF = STUDY1 ? '2026-10-05' : '2026-10-06'

async function universe() {
  if (STUDY1) {
    const { UNIVERSE } = await import('../engine/swing-universe.js')
    return UNIVERSE.map((u) => ({ ...u, sector: u.group, file: `data/swing/${u.symbol.replace(':', '_')}.json` }))
  }
  const u = JSON.parse(fs.readFileSync('data/us/universe.json', 'utf8'))
  return u.symbols.map((x) => ({ ...x, file: `data/us/bars/${x.symbol.replace(':', '_')}.json.gz` }))
}

function load(file) {
  const buf = fs.readFileSync(file)
  return JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8'))
}

const U = await universe()
const syms = []
const dropped = []
const t0 = Date.now()
for (const [k, u] of U.entries()) {
  if (!fs.existsSync(u.file)) {
    dropped.push({ symbol: u.symbol, reason: 'no data file' })
    continue
  }
  const s = load(u.file)
  if (s.close.length < 300) {
    dropped.push({ symbol: u.symbol, reason: `only ${s.close.length} daily bars` })
    continue
  }
  syms.push(summarizeSymbol({ symbol: u.symbol, name: u.name, group: u.group, sector: u.sector ?? u.group }, s, { cutoff: CUTOFF, split: SPLIT }))
  if ((k + 1) % 100 === 0) console.error(`summarized ${k + 1}/${U.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
}
console.error(`${syms.length} symbols, ${dropped.length} dropped`)

const A = runTradeTrack(syms, 'A', 20261006, 'sector')
console.error('track A done')
const B = runTradeTrack(syms, 'B', 20261007, 'sector')
console.error('track B done')
const C = runRegimeTrack(syms, 20261008, SPLIT, 'sector')
console.error('track C done')

// ── reports ────────────────────────────────────────────────────────────────────

const f = (x, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d))
const pct = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${(100 * x).toFixed(d)}%`)

function reportAB(res, title) {
  const L = []
  const t = res.track
  L.push(`${title} Track ${res.key} — ${t.tf} bars; stop ${t.stopAtr}×ATR14, target ${t.targetAtr}×ATR14, time exit ${t.horizon} bars; cost 0.10%/side`)
  L.push(`${syms.length} symbols. R = 1 stop distance. Edge = mean R − random-entry mean R.`)
  L.push('')
  for (const p of PERIODS) L.push(`Random entry, period ${p}: ${res.baseline[p].n} eligible bars, mean R ${f(res.baseline[p].meanR)}, win rate ${pct(res.baseline[p].win)}`)
  L.push('')
  L.push('PERIOD II (2018 → end) — headline ranking')
  L.push('rank id              verdict             n     win%   rand%   meanR   [95% CI]          edgeR   PF    hold  p      pHolm  breadth  | I: n    edgeR')
  res.rows.forEach((r, k) => {
    const a = r.II
    const b = r.I
    L.push(`${String(k + 1).padStart(3)}  ${r.id.padEnd(15)} ${r.verdict.padEnd(18)} ${String(a.n).padStart(6)} ${pct(a.win).padStart(6)} ${pct(a.baseWin).padStart(6)} ${f(a.meanR).padStart(7)} [${f(a.ci?.[0])}, ${f(a.ci?.[1])}] ${f(a.edge).padStart(7)} ${f(a.pf, 2).padStart(5)} ${f(a.hold, 1).padStart(5)} ${f(a.p, 4)} ${f(a.pHolm, 4)} ${pct(a.breadth, 0).padStart(5)}/${a.breadthN} | ${String(b.n).padStart(6)} ${f(b.edge).padStart(7)}`)
  })
  L.push('')
  L.push('Selection test — five best by period I edge, and where they finished in period II:')
  for (const id of res.selection) {
    const k = res.rows.findIndex((r) => r.id === id)
    const r = res.rows[k]
    L.push(`  ${id.padEnd(15)} I edge ${f(r.I.edge)} → II edge ${f(r.II.edge)}, rank ${k + 1} of ${res.rows.length}, ${r.verdict}`)
  }
  return L.join('\n')
}

function reportC(res, title) {
  const L = []
  L.push(`${title} Track C — weekly in/out rules vs buy-and-hold; cost 0.10% per switch; medians across symbols`)
  L.push('')
  L.push('rank id              verdict    ΔSharpe  p      pHolm  beat%  ΔCAGR    ΔMaxDD   ruleDD   b&hDD    expo  sw/yr trades  win%   | I: ΔSharpe')
  res.rows.forEach((r, k) => {
    const a = r.II
    L.push(`${String(k + 1).padStart(3)}  ${r.id.padEnd(15)} ${r.verdict.padEnd(9)} ${f(a.dSharpe).padStart(7)} ${f(a.p, 4)} ${f(a.pHolm, 4)} ${pct(a.beatShare, 0).padStart(5)} ${pct(a.dCagr).padStart(7)} ${pct(a.dMaxDD).padStart(7)} ${pct(a.maxDD).padStart(7)} ${pct(a.bhMaxDD).padStart(7)} ${pct(a.exposure, 0).padStart(5)} ${f(a.switchesPerYear, 1).padStart(5)} ${String(a.trades).padStart(7)} ${pct(a.win).padStart(6)} | ${f(r.I.dSharpe).padStart(7)} (${r.I.symbols} sym)`)
  })
  L.push('')
  L.push(`Buy & hold, period II: median Sharpe ${f(res.rows[0].II.bhSharpe)}, median CAGR ${pct(res.rows[0].II.bhCagr)}, median max drawdown ${pct(res.rows[0].II.bhMaxDD)} over ${res.rows[0].II.symbols} symbols`)
  L.push('')
  L.push('Selection test — five best by period I ΔSharpe:')
  for (const id of res.selection) {
    const k = res.rows.findIndex((r) => r.id === id)
    L.push(`  ${id.padEnd(15)} I ${f(res.rows[k].I.dSharpe)} → II ${f(res.rows[k].II.dSharpe)}, rank ${k + 1}, ${res.rows[k].verdict}`)
  }
  return L.join('\n')
}

function reportSectors() {
  const L = ['Edge by sector, period II — DESCRIPTIVE ONLY (protocol H3: ~660 cells, ~33 look significant by chance)', '']
  for (const res of [A, B]) {
    L.push(`Track ${res.key}: edge R (trades)`)
    const sectors = [...new Set(syms.map((x) => x.sector))].sort()
    for (const r of res.rows) {
      L.push(`  ${r.id}`)
      for (const s of sectors) {
        const g = r.II.groups[s]
        if (g && g.n) L.push(`      ${s.padEnd(26)} ${f(g.edge).padStart(7)}  win ${pct(g.win).padStart(6)}  n ${g.n}`)
      }
    }
    L.push('')
  }
  L.push('Track C: median ΔSharpe by sector')
  for (const r of C.rows) {
    L.push(`  ${r.id}`)
    for (const [s, g] of Object.entries(r.II.groups).sort()) L.push(`      ${s.padEnd(26)} ${f(g.dSharpe).padStart(7)}  (${g.symbols} sym)`)
  }
  return L.join('\n')
}

if (STUDY1) {
  console.log(reportAB(A, 'STUDY 1 via engine/study.js'))
  console.log('\n' + reportAB(B, 'STUDY 1 via engine/study.js'))
  console.log('\n' + reportC(C, 'STUDY 1 via engine/study.js'))
  process.exit(0)
}

// H1 — confirmatory: Keltner breakout, Track A, period II, on symbols study 1 never used.
const { UNIVERSE: S1 } = await import('../engine/swing-universe.js')
const seen = new Set(S1.map((u) => u.symbol.split(':')[1]))
const fresh = syms.filter((x) => !seen.has(x.symbol.split(':')[1]))
const h1 = testOne(fresh, 'A', 'keltner_break', 'II', 20261009)
const h1i = testOne(fresh, 'A', 'keltner_break', 'I', 20261010)
const h1Text = [
  'H1 — confirmatory test (PROTOCOL-us.md §1)',
  `Rule: keltner_break, Track A. Sample: ${fresh.length} symbols not used in study 1 (${syms.length - fresh.length} excluded).`,
  `Period II: n ${h1.n}, win ${pct(h1.win)} vs random ${pct(h1.baseWin)}, mean R ${f(h1.meanR)} vs random ${f(h1.baseR)}, edge ${f(h1.edge)} R, one-sided p ${f(h1.p, 4)}, 95% CI of mean R [${f(h1.ci?.[0])}, ${f(h1.ci?.[1])}]`,
  `Period I (context only): n ${h1i.n}, edge ${f(h1i.edge)} R, p ${f(h1i.p, 4)}`,
  `Verdict: ${h1.edge > 0 && h1.p < 0.05 ? 'CONFIRMED' : 'NOT CONFIRMED'}`,
].join('\n')

// Watchlist (PROTOCOL-addendum-1.md §A): a separate group, never part of H1/H2/H3.
const wl = JSON.parse(fs.readFileSync('data/us/watchlist.json', 'utf8')).tickers
const inMain = new Map(syms.map((x) => [x.symbol, x]))
const watch = []
for (const w of wl) {
  const row = { ticker: w.ticker, symbol: w.symbol, inUniverse: inMain.has(w.symbol), note: w.note }
  let x = inMain.get(w.symbol)
  const file = w.symbol && `data/us/bars/${w.symbol.replace(':', '_')}.json.gz`
  if (!x && file && fs.existsSync(file)) {
    const s = load(file)
    row.bars = s.close.length
    if (s.close.length >= 300) x = summarizeSymbol({ symbol: w.symbol, name: w.ticker, group: 'watchlist', sector: 'watchlist' }, s, { cutoff: CUTOFF, split: SPLIT })
    else row.note ??= `too new (${s.close.length} bars)`
  } else if (!x && !row.note) row.note = 'no data'
  if (x) {
    row.rules = {}
    for (const key of ['A', 'B']) {
      for (const [id, t] of Object.entries(x.tracks[key].trades)) {
        const all = [...t.I.r, ...t.II.r]
        const base = [...x.tracks[key].base.I.r, ...x.tracks[key].base.II.r]
        const wins = [...t.I.ret, ...t.II.ret].filter((v) => v > 0).length
        ;(row.rules[key] ??= {})[id] = { n: all.length, win: all.length ? wins / all.length : null, edge: all.length ? all.reduce((a, b) => a + b, 0) / all.length - base.reduce((a, b) => a + b, 0) / base.length : null }
      }
    }
    row.current = x.current
  }
  watch.push(row)
}
const wlText = ['Watchlist — separate group (addendum 1 §A). Per-stock numbers over both periods; n next to every figure.',
  'A few dozen trades per stock is noise: use these to see how a rule behaved, not to pick rules.', '']
for (const w of watch) {
  if (!w.rules) { wlText.push(`${w.ticker.padEnd(6)} ${w.note ?? ''}`); continue }
  const top = ['keltner_break', 'trix', 'macd_zero', 'ichimoku', 'supertrend'].map((id) => { const q = w.rules.A[id]; return `${id} n${q.n} win ${pct(q.win, 0)} edge ${f(q.edge, 2)}` })
  wlText.push(`${w.ticker.padEnd(6)} ${w.inUniverse ? 'main' : 'extra'}  A: ${top.join(' | ')}`)
}
fs.writeFileSync('reports/us-watchlist.txt', wlText.join('\n') + '\n')

fs.writeFileSync('reports/us-A.txt', reportAB(A, 'STUDY 2 (US)') + '\n')
fs.writeFileSync('reports/us-B.txt', reportAB(B, 'STUDY 2 (US)') + '\n')
fs.writeFileSync('reports/us-C.txt', reportC(C, 'STUDY 2 (US)') + '\n')
fs.writeFileSync('reports/us-H1.txt', h1Text + '\n')
fs.writeFileSync('reports/us-sectors.txt', reportSectors() + '\n')
const current = { A: [], B: [], C: [] }
for (const x of syms) for (const k of ['A', 'B', 'C']) for (const c of x.current[k]) current[k].push({ symbol: x.symbol, name: x.name, sector: x.sector, ...c })
const strip = (res) => ({ ...res, rows: res.rows.map((r) => ({ ...r })) })
fs.writeFileSync('reports/us-results.json', JSON.stringify({ cutoff: CUTOFF, split: SPLIT, symbols: syms.length, dropped, watch, A: strip(A), B: strip(B), C: strip(C), h1, h1i, freshN: fresh.length, current }))
console.log(h1Text)
console.log(`\nwrote reports/us-*.txt (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
