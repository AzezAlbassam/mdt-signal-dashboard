// Study 12 — the run. PROTOCOL-harmonic.md §3, §4, §5, §6.
//
//   node scripts/harmonic-run.js [--search] [--confirm] [--quick]
//
// With no flag it does everything: the full tables (§6), family 1 (H1, H2, H4a-d) on all
// symbols, then the search half, then — only if reports/harmonic-shortlist.json already
// exists — the confirmation. The two halves are run as separate invocations in practice so
// the shortlist can be committed between them, which is the whole point of the split.

import fs from 'node:fs'
import zlib from 'node:zlib'
import { PATTERNS, HORIZON, scan, withConfluence } from '../engine/harmonic.js'
import { holm, mean, median, mulberry32 } from '../engine/study.js'
import { bootstrapMean, wilsonInterval } from '../engine/stats.js'

const TFS = ['4h', '1D', '1W', '1M'] // the pre-registered family; 1h is §6 only
const ALL_TFS = ['1h', ...TFS]
const MIN_BARS = 200
const SEED = 12
const M_SHAM = 20
const DRAWS = 10000

const args = new Set(process.argv.slice(2))
const QUICK = args.has('--quick')

// ---------------------------------------------------------------- data

const universe = JSON.parse(fs.readFileSync('data/harmonic/universe.json', 'utf8'))
const SYMBOLS = universe.symbols

function load(symbol, tf) {
  const f = `data/harmonic/bars/${symbol.replace(/[:/]/g, '_')}__${tf}.json.gz`
  if (!fs.existsSync(f)) return null
  const s = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)))
  const bars = s.close.map((c, i) => ({ o: s.open[i], h: s.high[i], l: s.low[i], c, date: s.date[i] }))
  return bars.length ? bars : null
}

// ---------------------------------------------------------------- the nulls §4

/** N1: every published window [min,max] becomes [min*f, max*f], f log-uniform in [0.7, 1/0.7]. */
function shamSpecs(rng) {
  const f = () => Math.exp((rng() * 2 - 1) * Math.log(1 / 0.7))
  const jit = (w) => {
    const k = f()
    return { ...w, min: w.min * k, max: w.max * k }
  }
  return PATTERNS.map((s) => ({
    ...s,
    ratios: s.ratios.map(jit),
    prz: s.prz.map(jit),
    confluence: undefined,
  }))
}

/**
 * N2: the same trade geometry entered at the close of a uniformly random bar.
 * Distances are carried as fractions of the entry price, so the sham is the real trade's
 * payoff shape moved to a random place in the same series.
 */
function shamTrade(bars, side, stopFrac, t1Frac, rng, horizon = HORIZON) {
  const last = bars.length - 1 - horizon
  if (last < 1) return null
  const j = 1 + Math.floor(rng() * last)
  const s = side === 'long' ? 1 : -1
  const vLow = (b) => (s === 1 ? b.l : -b.h)
  const vHigh = (b) => (s === 1 ? b.h : -b.l)
  const entry = s * bars[j].c
  const risk = Math.abs(entry) * stopFrac
  if (!(risk > 0)) return null
  const stop = entry - risk
  const t1 = entry + Math.abs(entry) * t1Frac
  for (let t = j + 1; t <= j + horizon; t += 1) {
    const b = bars[t]
    if (vLow(b) <= stop) return { r: -1, outcome: 'stop', bars: t - j }
    if (vHigh(b) >= t1) return { r: (t1 - entry) / risk, outcome: 't1', bars: t - j }
  }
  const b = bars[j + horizon]
  return { r: ((s * b.c) - entry) / risk, outcome: 'timeout', bars: horizon }
}

// ---------------------------------------------------------------- collect

const rngMain = mulberry32(SEED)
const real = [] // every real trade, tagged
const sham1 = [] // N1 trades
const skipped = []
const live = [] // patterns unfilled or open at the cutoff (§6 forward log)
const perCell = new Map()

const cellKey = (pattern, tf) => `${pattern}|${tf}`

console.log(`universe ${SYMBOLS.length} symbols x ${ALL_TFS.length} timeframes`)
let cells = 0
for (const [si, meta] of SYMBOLS.entries()) {
  for (const tf of ALL_TFS) {
    const bars = load(meta.symbol, tf)
    if (!bars) { skipped.push({ symbol: meta.symbol, tf, bars: 0, why: 'no data' }); continue }
    if (bars.length < MIN_BARS) { skipped.push({ symbol: meta.symbol, tf, bars: bars.length, why: `< ${MIN_BARS} bars` }); continue }
    cells += 1

    const out = scan(bars)
    for (const t of out.trades) {
      const stopFrac = Math.abs(t.entry - t.stop) / t.entry
      const t1Frac = Math.abs(t.targets[0] - t.entry) / t.entry
      const n2 = shamTrade(bars, t.side, stopFrac, t1Frac, rngMain)
      real.push({
        symbol: meta.symbol, group: meta.group, si, tf,
        pattern: t.pattern, side: t.side,
        date: bars[t.entryAt].date, entryAt: t.entryAt,
        r: t.r, outcome: t.outcome, bars: t.bars, reached: t.reached, mfe: t.mfe, waited: t.waited,
        n2: n2 ? n2.r : null,
      })
    }
    for (const u of out.unfilled) if (u.reason === 'pending' || u.reason === 'open') live.push({ symbol: meta.symbol, tf, ...u })
    perCell.set(`${meta.symbol}|${tf}`, { registered: out.registered.length, filled: out.trades.length, bars: bars.length })

    if (!QUICK) {
      for (let m = 0; m < M_SHAM; m += 1) {
        const specs = shamSpecs(mulberry32(SEED + 1000 * m + si))
        for (const t of scan(bars, { specs }).trades) {
          sham1.push({ symbol: meta.symbol, si, tf, pattern: t.pattern, r: t.r, outcome: t.outcome, date: bars[t.entryAt].date })
        }
      }
    }
  }
  process.stdout.write(`\r  ${si + 1}/${SYMBOLS.length} symbols, ${real.length} trades, ${sham1.length} sham`)
}
console.log(`\n${cells} cells, ${real.length} real trades, ${sham1.length} N1 sham trades, ${skipped.length} cells skipped`)

// ---------------------------------------------------------------- statistics

// "hit" = the trade's target was reached before the stop. In the frozen rule that target is
// T1; the §6 variant that exits at T2 reports its own outcome, which must count too or the
// variant's row reads 0%.
const hit = (ts) => ts.filter((t) => t.outcome === 't1' || t.outcome === 't2').length
const timeouts = (ts) => ts.filter((t) => t.outcome === 'timeout').length

function describe(ts, rng) {
  if (!ts.length) return null
  const rs = ts.map((t) => t.r)
  const h = hit(ts)
  return {
    n: ts.length,
    hit: h / ts.length,
    hitCI: wilsonInterval(h, ts.length),
    r: mean(rs),
    // The median is carried beside the mean because the mean R of a stop/target rule is a
    // tail statistic: most trades are exactly -1 and a few are very large.
    medR: median(rs),
    rCI: bootstrapMean(rs, { draws: 2000, rng }),
    timeout: timeouts(ts) / ts.length,
    medBars: median(ts.map((t) => t.bars)),
    reached: mean(ts.map((t) => t.reached)),
  }
}

/**
 * Paired comparison of real against a matched null, with the permutation clustered by symbol:
 * each draw flips the label for every trade of a randomly chosen subset of symbols, so a
 * single symbol's run cannot carry the result (PROTOCOL §5).
 */
function pairedTest(ts, nullOf, rng, draws = DRAWS) {
  const rows = ts.map((t) => [t.r, nullOf(t)]).filter(([, b]) => b !== null && Number.isFinite(b))
  if (rows.length < 2) return null
  const bySym = new Map()
  ts.forEach((t, i) => {
    const b = nullOf(t)
    if (b === null || !Number.isFinite(b)) return
    if (!bySym.has(t.symbol)) bySym.set(t.symbol, [])
    bySym.get(t.symbol).push([t.r, b])
  })
  const syms = [...bySym.values()]
  const diff = (flip) => {
    let a = 0
    let b = 0
    let n = 0
    syms.forEach((rowsOfSym, k) => {
      const f = flip[k]
      for (const [x, y] of rowsOfSym) { a += f ? y : x; b += f ? x : y; n += 1 }
    })
    return (a - b) / n
  }
  const none = new Array(syms.length).fill(false)
  const obs = diff(none)
  let ge = 0
  for (let d = 0; d < draws; d += 1) {
    const flip = syms.map(() => rng() < 0.5)
    if (diff(flip) >= obs) ge += 1
  }
  return { effect: obs, p: (ge + 1) / (draws + 1), n: rows.length, symbols: syms.length }
}

/** Positive in both halves of the period, split at the median entry date (§5). */
function bothHalves(ts, nullOf) {
  if (ts.length < 4) return null
  const dates = ts.map((t) => t.date).sort()
  const mid = dates[dates.length >> 1]
  const d = (sub) => {
    const rows = sub.map((t) => [t.r, nullOf(t)]).filter(([, b]) => b !== null && Number.isFinite(b))
    return rows.length ? mean(rows.map(([a, b]) => a - b)) : NaN
  }
  const I = d(ts.filter((t) => t.date < mid))
  const II = d(ts.filter((t) => t.date >= mid))
  return { I, II, both: I > 0 && II > 0 }
}

// De-duplication for the pooled numbers (§3): one trade per symbol/tf/entry bar/direction.
function dedupe(ts) {
  const best = new Map()
  for (const t of [...ts].sort((a, b) => (a.pattern < b.pattern ? -1 : 1))) {
    const k = `${t.symbol}|${t.tf}|${t.entryAt}|${t.side}`
    if (!best.has(k)) best.set(k, t)
  }
  return [...best.values()]
}

const primary = real.filter((t) => TFS.includes(t.tf))
const pooled = dedupe(primary)

// N1 is a population, not a pairing: compare the real pool against the sham pool within the
// same symbol, by giving every real trade that symbol's mean sham R as its counterfactual.
const shamBySymTf = new Map()
for (const t of sham1) {
  const k = `${t.symbol}|${t.tf}`
  if (!shamBySymTf.has(k)) shamBySymTf.set(k, [])
  shamBySymTf.get(k).push(t.r)
}
const shamMean = (t) => {
  const v = shamBySymTf.get(`${t.symbol}|${t.tf}`)
  return v && v.length ? mean(v) : null
}

const rng = mulberry32(SEED)
const family1 = []
family1.push({ id: 'H1', what: 'real vs random entry (N2), pooled', ...pairedTest(pooled, (t) => t.n2, rng), halves: bothHalves(pooled, (t) => t.n2) })
family1.push({ id: 'H2', what: 'real vs random ratios (N1), pooled', ...pairedTest(pooled, shamMean, rng), halves: bothHalves(pooled, shamMean) })
for (const tf of TFS) {
  const ts = pooled.filter((t) => t.tf === tf)
  family1.push({ id: `H4${tf}`, what: `real vs random entry (N2), ${tf}`, ...pairedTest(ts, (t) => t.n2, rng), halves: bothHalves(ts, (t) => t.n2) })
}
const ps = family1.map((f) => (f.p == null ? 1 : f.p))
const adj = holm(ps)
family1.forEach((f, i) => {
  f.holm = adj[i]
  f.confirmed = f.effect > 0 && f.holm < 0.05 && f.halves?.both === true
})

// ---------------------------------------------------------------- tables §6

const cellRows = []
for (const spec of PATTERNS) {
  for (const tf of ALL_TFS) {
    const ts = real.filter((t) => t.pattern === spec.name && t.tf === tf)
    const d = describe(ts, rng)
    if (d) cellRows.push({ pattern: spec.name, tf, ...d, vsN2: ts.length ? mean(ts.filter((t) => t.n2 !== null).map((t) => t.r - t.n2)) : null })
  }
}

const groupRows = []
for (const g of ['top20', 'sector', 'named', 'crypto', 'index']) {
  for (const tf of ALL_TFS) {
    const ts = dedupe(real.filter((t) => t.group === g && t.tf === tf))
    const d = describe(ts, rng)
    if (d) groupRows.push({ group: g, tf, ...d })
  }
}

const symbolRows = []
for (const meta of SYMBOLS) {
  const ts = dedupe(real.filter((t) => t.symbol === meta.symbol && TFS.includes(t.tf)))
  const d = describe(ts, rng)
  if (d) symbolRows.push({ symbol: meta.symbol, group: meta.group, ...d })
}

const tfRows = []
for (const tf of ALL_TFS) {
  const ts = dedupe(real.filter((t) => t.tf === tf))
  const d = describe(ts, rng)
  if (d) tfRows.push({ tf, ...d, vsN2: mean(ts.filter((t) => t.n2 !== null).map((t) => t.r - t.n2)) })
}

// Direction flip (§4, reported): what the same patterns pay traded the other way.
const flipped = { n: pooled.length, r: -mean(pooled.map((t) => t.r)) }

// ---------------------------------------------------------------- §6 variants
//
// Reported only. Each is one re-scan of every cell under one changed rule, pooled over the
// four primary timeframes. None of these is Holm-corrected and none is ever a verdict; they
// exist so that "the result depends on a choice no source fixes" is visible rather than
// hidden in the engine's defaults.

const VARIANTS = QUICK ? [] : [
  ['K_PIVOT 1.0 (more, smaller swings)', { kPivot: 1.0 }],
  ['K_PIVOT 3.0 (fewer, larger swings)', { kPivot: 3.0 }],
  ['+ AB=CD required in the PRZ', { specs: withConfluence() }],
  ['stop beyond X instead of the PRZ', { stopAt: 'x' }],
  ['targets on the CD leg instead of AD', { targetLeg: 'CD' }],
  ['entry window 0.5 pattern lengths', { windowMult: 0.5 }],
  ['confirmation entry instead of a limit', { entryMode: 'confirm' }],
  ['exit at T2 instead of T1', { exitTarget: 't2' }],
]

const variantRows = []
for (const [label, opts] of VARIANTS) {
  const ts = []
  for (const meta of SYMBOLS) {
    for (const tf of TFS) {
      const bars = load(meta.symbol, tf)
      if (!bars || bars.length < MIN_BARS) continue
      for (const t of scan(bars, opts).trades) {
        ts.push({ symbol: meta.symbol, tf, entryAt: t.entryAt, side: t.side, pattern: t.pattern, date: bars[t.entryAt].date, r: t.r, outcome: t.outcome, bars: t.bars, reached: t.reached })
      }
    }
  }
  const d = describe(dedupe(ts), rng)
  if (d) variantRows.push({ label, ...d })
  process.stdout.write(`\r  variant: ${label.padEnd(44)}`)
}
if (VARIANTS.length) console.log('')

// ---------------------------------------------------------------- family 2 §5

const EVEN = new Set(SYMBOLS.filter((_, i) => i % 2 === 0).map((s) => s.symbol))
const searchTrades = primary.filter((t) => EVEN.has(t.symbol))
const confirmTrades = primary.filter((t) => !EVEN.has(t.symbol))

const searchCells = []
for (const spec of PATTERNS) {
  for (const tf of TFS) {
    const ts = searchTrades.filter((t) => t.pattern === spec.name && t.tf === tf)
    const d = describe(ts, rng)
    if (d) searchCells.push({ pattern: spec.name, tf, ...d })
  }
}
const qualify = searchCells
  .filter((c) => c.n >= 30 && c.hit >= 0.5 && c.r > 0)
  .sort((a, b) => b.r - a.r)
  .slice(0, 8)

const SHORTLIST = 'reports/harmonic-shortlist.json'
let confirm = null
if (args.has('--confirm') && fs.existsSync(SHORTLIST)) {
  const list = JSON.parse(fs.readFileSync(SHORTLIST, 'utf8')).shortlist
  const rows = list.map((c) => {
    const ts = confirmTrades.filter((t) => t.pattern === c.pattern && t.tf === c.tf)
    return { ...c, confirmN: ts.length, ...describe(ts, rng), test: pairedTest(ts, (t) => t.n2, rng), halves: bothHalves(ts, (t) => t.n2) }
  })
  const cps = rows.map((r) => r.test?.p ?? 1)
  const cadj = holm(cps)
  rows.forEach((r, i) => {
    r.holm = cadj[i]
    r.confirmed = (r.test?.effect ?? -1) > 0 && r.holm < 0.05 && r.halves?.both === true
  })
  confirm = rows
} else if (!args.has('--confirm')) {
  fs.mkdirSync('reports', { recursive: true })
  fs.writeFileSync(SHORTLIST, `${JSON.stringify({
    frozenAt: universe.takenAt,
    rule: 'PROTOCOL-harmonic.md §5 family 2: n>=30, T1 hit>=50%, mean R>0, top 8 by mean R, search half = even-index symbols',
    searchSymbols: [...EVEN],
    searchCells,
    shortlist: qualify.map((c) => ({ pattern: c.pattern, tf: c.tf, n: c.n, hit: c.hit, r: c.r })),
  }, null, 2)}\n`)
}

// ---------------------------------------------------------------- report

const pct = (x) => (x == null || Number.isNaN(x) ? '    -' : `${(x * 100).toFixed(1)}%`)
const num = (x, d = 3) => (x == null || Number.isNaN(x) ? '    -' : x.toFixed(d))
const ci = (c) => (c ? `[${(c[0] * 100).toFixed(0)}, ${(c[1] * 100).toFixed(0)}]` : '-')
const L = []
const say = (s = '') => L.push(s)

say('STUDY 12 — HARMONIC PATTERNS (XABCD)')
say('PROTOCOL-harmonic.md, frozen before any bar was downloaded.')
say(`universe ${SYMBOLS.length} symbols; ${cells} (symbol, timeframe) cells with >= ${MIN_BARS} bars; cutoff 2026-10-17`)
say(`${real.length} trades from the real ratio table; ${sham1.length} from ${M_SHAM} random-ratio draws`)
say('')
say('=== FAMILY 1 — the pre-registered tests (Holm over all six) ===')
say('effect = mean R of the real trade minus mean R of its matched null, per trade.')
say('')
say('  id        comparison                              n     effect     p      Holm   halves  verdict')
for (const f of family1) {
  const h = f.halves ? `${f.halves.I > 0 ? '+' : '-'}${f.halves.II > 0 ? '+' : '-'}` : ' -- '
  say(`  ${f.id.padEnd(9)} ${f.what.padEnd(38)} ${String(f.n ?? 0).padStart(5)} ${num(f.effect).padStart(9)} ${num(f.p, 4).padStart(7)} ${num(f.holm, 4).padStart(7)}  ${h.padEnd(6)}  ${f.confirmed ? 'CONFIRMED' : 'not confirmed'}`)
}
say('')
say('=== WHICH TIMEFRAME (pooled over patterns, de-duplicated) ===')
say('  tf     n      T1 hit    95% CI      mean R   median R  timeout  med bars  vs random entry')
for (const r of tfRows) {
  say(`  ${r.tf.padEnd(5)} ${String(r.n).padStart(6)}  ${pct(r.hit)}  ${ci(r.hitCI).padEnd(11)} ${num(r.r).padStart(8)} ${num(r.medR).padStart(9)}  ${pct(r.timeout)}  ${String(r.medBars).padStart(7)}   ${num(r.vsN2)}`)
}
say('')
say('=== WHICH PATTERN x TIMEFRAME (every trade, not de-duplicated) ===')
say('  pattern       tf      n     T1 hit    95% CI       mean R      95% CI         median R  timeout  vs N2')
for (const r of cellRows) {
  const rci = r.rCI ? `[${r.rCI[0].toFixed(2)}, ${r.rCI[1].toFixed(2)}]` : '-'
  say(`  ${r.pattern.padEnd(13)} ${r.tf.padEnd(4)} ${String(r.n).padStart(6)}  ${pct(r.hit)}  ${ci(r.hitCI).padEnd(11)} ${num(r.r).padStart(8)}  ${rci.padEnd(15)} ${num(r.medR).padStart(8)}  ${pct(r.timeout)}  ${num(r.vsN2)}`)
}
say('')
say('=== BY SYMBOL GROUP ===')
say('  group    tf      n     T1 hit    mean R   timeout')
for (const r of groupRows) say(`  ${r.group.padEnd(8)} ${r.tf.padEnd(4)} ${String(r.n).padStart(6)}  ${pct(r.hit)}  ${num(r.r).padStart(8)}  ${pct(r.timeout)}`)
say('')
say('=== BY SYMBOL (four primary timeframes pooled) ===')
say('  symbol             group     n     T1 hit    mean R   timeout')
for (const r of symbolRows) say(`  ${r.symbol.padEnd(18)} ${r.group.padEnd(8)} ${String(r.n).padStart(5)}  ${pct(r.hit)}  ${num(r.r).padStart(8)}  ${pct(r.timeout)}`)
say('')
say('=== REPORTED, NOT A VERDICT: §6 variants (pooled, four primary timeframes) ===')
say('  variant                                        n     T1 hit    mean R   timeout')
say(`  ${'the frozen §1 rule'.padEnd(44)} ${String(pooled.length).padStart(6)}  ${pct(hit(pooled) / pooled.length)}  ${num(mean(pooled.map((t) => t.r))).padStart(8)}  ${pct(timeouts(pooled) / pooled.length)}`)
for (const v of variantRows) say(`  ${v.label.padEnd(44)} ${String(v.n).padStart(6)}  ${pct(v.hit)}  ${num(v.r).padStart(8)}  ${pct(v.timeout)}`)
say('')
say(`  direction flipped: mean R ${num(flipped.r)} on the same ${flipped.n} setups traded the other way`)
say(`  patterns live at the cutoff: ${live.length} (frozen into forward-log/)`)
say('')
say('=== CELLS EXCLUDED FOR TOO LITTLE HISTORY ===')
for (const s of skipped) say(`  ${s.symbol.padEnd(18)} ${s.tf.padEnd(4)} ${String(s.bars).padStart(5)} bars — ${s.why}`)
say('')
if (confirm) {
  say('=== FAMILY 2 — CONFIRMATION on symbols never looked at (Holm over the shortlist) ===')
  say('  pattern       tf     search n/hit/R      confirm n   T1 hit    mean R    effect     p      Holm  halves  verdict')
  for (const r of confirm) {
    const h = r.halves ? `${r.halves.I > 0 ? '+' : '-'}${r.halves.II > 0 ? '+' : '-'}` : ' -- '
    say(`  ${r.pattern.padEnd(13)} ${r.tf.padEnd(4)} ${String(r.n).padStart(5)}/${pct(r.hit)}/${num(r.r)}  ${String(r.confirmN).padStart(9)}  ${pct(r.hit)}  ${num(r.r).padStart(7)}  ${num(r.test?.effect).padStart(8)} ${num(r.test?.p, 4).padStart(7)} ${num(r.holm, 4).padStart(7)}  ${h}  ${r.confirmed ? 'CONFIRMED' : 'not confirmed'}`)
  }
} else {
  say('=== FAMILY 2 — SEARCH HALF (shortlist frozen to reports/harmonic-shortlist.json) ===')
  say(`  ${searchCells.length} cells on the even-index symbols; ${qualify.length} qualify (n>=30, hit>=50%, mean R>0)`)
  for (const c of qualify) say(`  ${c.pattern.padEnd(13)} ${c.tf.padEnd(4)} n ${String(c.n).padStart(5)}  hit ${pct(c.hit)}  R ${num(c.r)}`)
  if (!qualify.length) say('  NOTHING QUALIFIES. Per §5 that is the answer; no cell is promoted.')
}

fs.mkdirSync('reports', { recursive: true })
fs.writeFileSync('reports/harmonic.txt', `${L.join('\n')}\n`)
fs.writeFileSync('reports/harmonic.json', `${JSON.stringify({ family1, variantRows, tfRows, cellRows, groupRows, symbolRows, searchCells, qualify, confirm, skipped, flipped, counts: { cells, real: real.length, sham: sham1.length, live: live.length } }, null, 2)}\n`)
fs.mkdirSync('forward-log', { recursive: true })
fs.writeFileSync('forward-log/harmonic-2026-10-18.json', `${JSON.stringify({ cutoff: '2026-10-17', note: 'Patterns unfilled or open at the cutoff, frozen per PROTOCOL-harmonic.md §6 before any outcome is knowable.', live }, null, 2)}\n`)
console.log(L.join('\n'))
