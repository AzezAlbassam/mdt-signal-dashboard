// Is "buy when MVRV is at zero" a real edge — on Bitcoin, and on stocks?
//
// Fixed before any forward return was computed:
//
//   SIGNALS (each evaluated on its own; nothing tuned on the results)
//     mvrv<1        Z < 0, i.e. price below holders' average cost basis. The zone the
//                   chart is famous for, and the primary test on every asset.
//     z<0.5         Bitcoin only: "near zero" as usually described, with σ known at the time.
//     zLow10        stocks only: Z in the lowest 10% of its own history so far.
//     <200wMA       baseline: price below its 200-week average. If the realized-price
//                   machinery cannot beat this, it is adding nothing.
//     z>=7          Bitcoin only, the opposite claim: the red zone marks tops.
//
//   ADDED AFTER THE FIRST RUN, and labelled as such wherever it is reported:
//     mvrvLow10     stocks: the MVRV RATIO in the lowest 10% of its own history so far.
//                   zLow10 turned out to be dominated by the earliest decades, because σ
//                   of an exponentially growing price grows with it — Boeing's flag fired
//                   in 2 weeks out of 2,800. The ratio has no σ and no such drift.
//     BTC eras      mvrv<1 re-run from 2013 and from 2017, because the 2011–12 weeks carry
//                   returns no later era can repeat and could manufacture an "edge".
//     pooled        one test per signal across stocks, averaging independent rotations.
//     wait rank     each episode's first-signal return ranked against buying in any of the
//                   104 weeks AFTER it instead. Weekly p-values count the 44 weeks of one
//                   episode as 44 observations; this counts it once, against its own era.
//                   Later weeks only: weeks before a dip have the dip inside their window, so
//                   ranking against them flatters any buy-low rule even on a random walk.
//     btcMemory     stocks: mvrv<1 with the cost basis given Bitcoin's memory — a fixed
//                   52-week half-life — instead of exchange turnover. Bitcoin's realized
//                   price fits a 42–60 week half-life (measured below on Bitcoin alone;
//                   no stock returns were looked at to choose it).
//
//   STOCK REALIZED PRICE   turnover model, scale k = 1 primary; k = 0.25, 0.5, 2 reported
//                          as sensitivity, never chosen between.
//   ELIGIBILITY            Bitcoin from week 52 (σ needs history; realized cap is observed).
//                          Stocks from week 104 (the modelled cost basis must forget its
//                          arbitrary starting value). Baseline comparison on weeks ≥ 200.
//   EXECUTION              act at the next week's open (engine/timing.js).
//   HORIZONS               26, 52, 104, 156 weeks.
//   NULL                   rotate the flag pattern round the sample, 2000 draws, seed 20261003.
//   DEEP DRAWDOWNS         falls of 50% or more from a running high.
//
//   node scripts/mvrv-backtest.js

import fs from 'node:fs'
import path from 'node:path'

import { costBasisFixedMemory, costBasisFromTurnover, expandingPercentRank, mvrvRatio, mvrvZ, sma } from '../engine/mvrv.js'
import {
  accumulate,
  accumulateNull,
  conditional,
  deepTroughs,
  episodes,
  forwardReturns,
  median,
  pooledRotation,
  rotationNull,
} from '../engine/timing.js'
import { seededRng } from '../engine/null-models.js'

const DATA = path.resolve('data/mvrv')
const HORIZONS = [26, 52, 104, 156]
const DRAWS = Number(process.env.DRAWS ?? 2000)
const SEED = 20261003
const SCALES = [0.25, 0.5, 1, 2]
const BTC_MEMORY = 52
const STOCKS = ['NVDA', 'MSFT', 'AAPL', 'META', 'AMZN', 'INTC', 'CSCO', 'C', 'BAC', 'BA', 'NKE', 'PYPL', 'DIS', 'VZ', 'KO']

const load = (name) => JSON.parse(fs.readFileSync(path.join(DATA, `${name}.json`), 'utf8'))
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 10)
const typical = (d) => d.c.map((c, i) => (d.h[i] + d.l[i] + c) / 3)

// ---------------------------------------------------------------- indicator series

function bitcoinSeries(d) {
  const mv = d.c.map((c, i) => c * d.supply[i])
  const rv = d.realizedCap
  return {
    rp: rv.map((r, i) => r / d.supply[i]),
    ratio: mvrvRatio(mv, rv),
    z: mvrvZ(mv, rv),
    zFull: mvrvZ(mv, rv, { std: 'full' }),
  }
}

/** With one share count for all history, shares cancel out of Z: (P − RP) / σ(P). */
function stockSeries(d, scale) {
  const rp = costBasisFromTurnover(typical(d), d.v, d.shares, { scale })
  return {
    rp,
    ratio: mvrvRatio(d.c, rp),
    z: mvrvZ(d.c, rp),
    zFull: mvrvZ(d.c, rp, { std: 'full' }),
  }
}

// ---------------------------------------------------------------- evaluation

// Null draws per (asset, signal, horizon), kept out of results.json for the pooled test.
const NULLS = new Map()

function evaluate(d, mask, eligible, rngSeed, poolKey = null) {
  const byH = {}
  for (const h of HORIZONS) {
    const fwd = forwardReturns(d.o, d.c, h)
    const cond = conditional(mask, fwd, eligible)
    const rot = rotationNull(mask, fwd, eligible, { draws: DRAWS, rng: seededRng(rngSeed + h), keepNulls: Boolean(poolKey) })
    byH[h] = { ...cond, p: rot.p, null05: rot.null05, null95: rot.null95 }
    if (poolKey) NULLS.set(`${poolKey}|${h}`, { observed: rot.observed, nulls: rot.nulls })
  }
  const from = eligible.indexOf(true)
  const acc = accumulate(d.o, d.c, mask, { from })
  const accNull = accumulateNull(d.o, d.c, mask, { from, draws: DRAWS, rng: seededRng(rngSeed + 999) })
  const share = mask.filter((m, i) => m && eligible[i]).length / eligible.filter(Boolean).length
  return { share, byH, acc: { ...acc, p: accNull.p, null05: accNull.null05, null50: accNull.null50, null95: accNull.null95 } }
}

/** Where x falls among xs, as the share of xs strictly below it plus half the ties. */
function rankAmong(x, xs) {
  if (!Number.isFinite(x) || xs.length === 0) return null
  let below = 0
  let ties = 0
  for (const v of xs) {
    if (v < x) below += 1
    else if (v === x) ties += 1
  }
  return (below + ties / 2) / xs.length
}

/** What happened after each time the zone switched on. */
function episodeTable(d, mask, eligible) {
  const on = mask.map((m, i) => m && eligible[i])
  const fwd = Object.fromEntries([52, 104, 156].map((h) => [h, forwardReturns(d.o, d.c, h)]))
  // The episode's own forward return, ranked against entering in any of the next 104 weeks.
  const eraRank = (start, h) => {
    const peers = []
    for (let j = start + 1; j <= Math.min(d.c.length - 1, start + 104); j += 1) {
      if (eligible[j] && Number.isFinite(fwd[h][j])) peers.push(fwd[h][j])
    }
    return rankAmong(fwd[h][start], peers)
  }
  return episodes(on, { mergeGap: 4 }).map(({ start, end }) => {
    const entry = d.o[start + 1] ?? d.c[start]
    const after = (h) => (start + h < d.c.length ? d.c[start + h] / entry - 1 : null)
    let low = Infinity
    for (let j = start + 1; j <= Math.min(d.c.length - 1, end + 52); j += 1) low = Math.min(low, d.l[j])
    return {
      start: iso(d.t[start]),
      end: iso(d.t[end]),
      weeks: end - start + 1,
      entry,
      worstAfter: Number.isFinite(low) ? low / entry - 1 : null,
      r52: after(52),
      r104: after(104),
      r156: after(156),
      rank52: eraRank(start, 52),
      rank104: eraRank(start, 104),
      rank156: eraRank(start, 156),
    }
  })
}

/** Episodes summarised: how many beat the median later entry, with an exact one-sided sign-test p. */
function eraSummary(eps, h) {
  const ranks = eps.map((e) => e[`rank${h}`]).filter((r) => r != null)
  const above = ranks.filter((r) => r > 0.5).length
  const n = ranks.length
  let p = 0
  const choose = (a, b) => { let c = 1; for (let i = 1; i <= b; i += 1) c = (c * (a - b + i)) / i; return c }
  for (let x = above; x <= n; x += 1) p += choose(n, x) / 2 ** n
  return { n, above, meanRank: ranks.length ? ranks.reduce((a, b) => a + b, 0) / n : null, p: n ? p : null }
}

/** Each 50%+ drawdown: did the zone fire before the low, and how much further did price fall? */
function troughTable(d, mask, eligible) {
  return deepTroughs(d.c, { depth: 0.5 })
    .filter(({ troughIdx }) => eligible[troughIdx])
    .map(({ peakIdx, troughIdx, unrecovered }) => {
      let first = -1
      for (let j = peakIdx; j <= troughIdx; j += 1) {
        if (mask[j] && eligible[j]) { first = j; break }
      }
      let near = false
      for (let j = Math.max(0, troughIdx - 13); j <= Math.min(d.c.length - 1, troughIdx + 13); j += 1) {
        if (mask[j] && eligible[j]) near = true
      }
      return {
        peak: iso(d.t[peakIdx]),
        trough: iso(d.t[troughIdx]),
        depth: d.c[troughIdx] / d.c[peakIdx] - 1,
        unrecovered: Boolean(unrecovered),
        firedBeforeLow: first >= 0,
        firstSignal: first >= 0 ? iso(d.t[first]) : null,
        fallAfterFirst: first >= 0 ? d.c[troughIdx] / d.c[first] - 1 : null,
        within13w: near,
      }
    })
}

// ---------------------------------------------------------------- run

const results = { generated: new Date().toISOString().slice(0, 10), draws: DRAWS, horizons: HORIZONS, assets: {} }
const series = {}

{
  const d = load('BTC')
  const s = bitcoinSeries(d)
  const n = d.c.length
  const elig = d.c.map((_, i) => i >= 52)
  const eligCommon = d.c.map((_, i) => i >= 200)
  const ma200 = sma(d.c, 200)
  const masks = {
    'mvrv<1': s.ratio.map((r) => r < 1),
    'z<0.5': s.z.map((z) => z < 0.5),
    'z>=7': s.z.map((z) => z >= 7),
  }
  const common = {
    'mvrv<1': masks['mvrv<1'],
    '<200wMA': d.c.map((c, i) => c < ma200[i]),
  }
  const out = { group: 'bitcoin', weeks: n, from: iso(d.t[0]), to: iso(d.t[n - 1]), signals: {}, common: {}, episodes: {}, troughs: {} }
  let k = 0
  for (const [name, m] of Object.entries(masks)) {
    out.signals[name] = evaluate(d, m, elig, SEED + 100 * k++)
    out.episodes[name] = episodeTable(d, m, elig)
    out.troughs[name] = troughTable(d, m, elig)
  }
  for (const [name, m] of Object.entries(common)) {
    out.common[name] = evaluate(d, m, eligCommon, SEED + 100 * k++)
    out.troughs[name] ??= troughTable(d, m, eligCommon)
  }
  // How long Bitcoin's realized price remembers: the fixed-memory cost basis that tracks it best.
  out.memoryFit = {}
  for (const from of ['2010-07-19', '2013-01-01', '2017-01-01']) {
    let best = null
    for (let hl = 4; hl <= 300; hl += 2) {
      const e = costBasisFixedMemory(typical(d), hl)
      let ss = 0
      let cnt = 0
      for (let i = 0; i < n; i += 1) {
        if (iso(d.t[i]) < from) continue
        ss += Math.log(e[i] / s.rp[i]) ** 2
        cnt += 1
      }
      const rmse = Math.sqrt(ss / cnt)
      if (!best || rmse < best.rmse) best = { halfLife: hl, rmse }
    }
    out.memoryFit[from] = best
  }
  out.eras = {}
  for (const from of ['2013-01-01', '2017-01-01']) {
    const e = d.t.map((t, i) => i >= 52 && iso(t) >= from)
    out.eras[from] = evaluate(d, masks['mvrv<1'], e, SEED + 100 * k++)
  }
  out.now = { date: iso(d.t[n - 1]), price: d.c[n - 1], rp: s.rp[n - 1], ratio: s.ratio[n - 1], z: s.z[n - 1], zFull: s.zFull[n - 1] }
  results.assets.BTC = out
  series.BTC = { t: d.t, c: d.c, rp: s.rp, z: s.z, zFull: s.zFull, ratio: s.ratio }
}

for (const ticker of STOCKS) {
  const d = load(ticker)
  const n = d.c.length
  const elig = d.c.map((_, i) => i >= 104)
  const eligCommon = d.c.map((_, i) => i >= 200)
  const ma200 = sma(d.c, 200)
  const out = { group: d.group, weeks: n, from: iso(d.t[0]), to: iso(d.t[n - 1]), signals: {}, common: {}, episodes: {}, troughs: {}, scales: {} }

  let k = 0
  const primary = stockSeries(d, 1)
  const zRank = expandingPercentRank(primary.z.map((z, i) => (i >= 1 ? z : Number.NaN)), { minHistory: 104 })
  const ratioRank = expandingPercentRank(primary.ratio, { minHistory: 104 })
  const slow = costBasisFixedMemory(typical(d), BTC_MEMORY)
  const masks = {
    'mvrv<1': primary.ratio.map((r) => r < 1),
    zLow10: zRank.map((r) => r <= 0.1),
    mvrvLow10: ratioRank.map((r) => r <= 0.1),
    btcMemory: d.c.map((c, i) => c < slow[i]),
  }
  for (const [name, m] of Object.entries(masks)) {
    out.signals[name] = evaluate(d, m, elig, SEED + 100 * k++, `${ticker}|${name}`)
    out.episodes[name] = episodeTable(d, m, elig)
    out.troughs[name] = troughTable(d, m, elig)
  }
  const common = { 'mvrv<1': masks['mvrv<1'], '<200wMA': d.c.map((c, i) => c < ma200[i]) }
  for (const [name, m] of Object.entries(common)) {
    out.common[name] = evaluate(d, m, eligCommon, SEED + 100 * k++, `${ticker}|common:${name}`)
    out.troughs[name] ??= troughTable(d, m, eligCommon)
  }
  // How long the modelled cost basis remembers: half-life at the median weekly turnover of the last ten years.
  const recent = d.v.slice(-520).map((v) => v / d.shares)
  const tau = median(recent)
  out.turnover = { weeklyMedian: tau, halfLifeWeeks: Math.log(0.5) / Math.log(1 - tau) }
  for (const scale of SCALES) {
    const s = scale === 1 ? primary : stockSeries(d, scale)
    out.scales[scale] = evaluate(d, s.ratio.map((r) => r < 1), elig, SEED + 100 * k++)
  }
  out.now = { date: iso(d.t[n - 1]), price: d.c[n - 1], rp: primary.rp[n - 1], ratio: primary.ratio[n - 1], z: primary.z[n - 1], zRank: zRank[n - 1], ratioRank: ratioRank[n - 1] }
  results.assets[ticker] = out
  series[ticker] = { t: d.t, c: d.c, rp: primary.rp, z: primary.z, zFull: primary.zFull, ratio: primary.ratio }
}

// ---------------------------------------------------------------- pooled across stocks

const GROUPS = {
  requested: STOCKS.filter((t) => results.assets[t].group === 'requested'),
  control: STOCKS.filter((t) => results.assets[t].group === 'control'),
  all: STOCKS,
}
results.pooled = {}
for (const sigName of ['mvrv<1', 'mvrvLow10', 'zLow10', 'btcMemory', 'common:mvrv<1', 'common:<200wMA']) {
  results.pooled[sigName] = {}
  for (const [group, tickers] of Object.entries(GROUPS)) {
    results.pooled[sigName][group] = {}
    for (const h of HORIZONS) {
      results.pooled[sigName][group][h] = pooledRotation(tickers.map((t) => NULLS.get(`${t}|${sigName}|${h}`)))
    }
  }
}

// ---------------------------------------------------------------- report

const pct = (x, digits = 0) => (x == null || !Number.isFinite(x) ? '   —' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`)
const num = (x, digits = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(digits))
const pval = (p) => (p == null || !Number.isFinite(p) ? '—' : p < 0.001 ? '<0.001' : p.toFixed(3))
const lines = []
const say = (s = '') => lines.push(s)

say('MVRV zone backtest — generated by scripts/mvrv-backtest.js')
say(`Weekly data. Act at next week's open. Rotation null ${DRAWS} draws. Forward returns are price only (no dividends).`)
say()

function signalBlock(name, ev) {
  say(`  ${name.padEnd(8)} on ${pct(ev.share)} of eligible weeks`)
  say('            horizon   median(zone)  median(all)  hit(zone)  hit(all)  worst(zone)  log-edge  p(rotation)')
  for (const h of HORIZONS) {
    const r = ev.byH[h]
    say(`            ${String(h).padStart(4)}w   ${pct(r.medianSignal).padStart(11)}  ${pct(r.medianAll).padStart(11)}  ${pct(r.hitSignal).padStart(9)}  ${pct(r.hitAll).padStart(8)}  ${pct(r.worstSignal).padStart(11)}  ${num(r.logEdge, 3).padStart(8)}  ${pval(r.p).padStart(10)}   (n=${r.nSignal}/${r.nAll})`)
  }
  const a = ev.acc
  say(`            zone-only buying vs weekly DCA: ${num(a.ratio, 2)}× (random-timing 90% band ${num(a.null05, 2)}–${num(a.null95, 2)}, p=${pval(a.p)}), ${a.buys} buy weeks, ${num(a.cashLeft, 0)} of ${a.paidIn} units still in cash`)
}

for (const [ticker, a] of Object.entries(results.assets)) {
  say('='.repeat(100))
  say(`${ticker}  (${a.group})  ${a.from} → ${a.to}, ${a.weeks} weeks`)
  const now = a.now
  say(`  now: price ${num(now.price, 2)}, realized/cost-basis price ${num(now.rp, 2)}, MVRV ${num(now.ratio, 2)}, Z ${num(now.z, 2)}${now.zFull != null ? ` (full-sample σ: ${num(now.zFull, 2)})` : ''}`)
  for (const [name, ev] of Object.entries(a.signals)) signalBlock(name, ev)
  say('  -- same weeks (≥ 200), realized-price zone vs plain 200-week average:')
  for (const [name, ev] of Object.entries(a.common)) signalBlock(name, ev)
  if (a.memoryFit) {
    say(`  -- realized price behaves like a fixed-memory cost basis with half-life: ${Object.entries(a.memoryFit).map(([f, b]) => `from ${f} ${b.halfLife}w (log rmse ${num(b.rmse, 2)})`).join(', ')}`)
  }
  if (a.eras) {
    say('  -- era check (added after first run): mvrv<1 counted only from…')
    for (const [from, ev] of Object.entries(a.eras)) {
      say(`     ${from}: on ${pct(ev.share)}  52w edge ${num(ev.byH[52].logEdge, 3)} p=${pval(ev.byH[52].p)}  104w edge ${num(ev.byH[104].logEdge, 3)} p=${pval(ev.byH[104].p)}  156w edge ${num(ev.byH[156].logEdge, 3)} p=${pval(ev.byH[156].p)}  (n=${ev.byH[104].nSignal}/${ev.byH[104].nAll} at 104w)  zone/DCA ${num(ev.acc.ratio, 2)} p=${pval(ev.acc.p)}`)
    }
  }
  if (a.turnover) {
    say(`  -- modelled cost basis memory: median weekly turnover ${pct(a.turnover.weeklyMedian, 1)} → half-life ${num(a.turnover.halfLifeWeeks, 0)} weeks at k=1`)
  }
  if (a.scales && Object.keys(a.scales).length) {
    say('  -- turnover-scale sensitivity, mvrv<1:')
    for (const [scale, ev] of Object.entries(a.scales)) {
      say(`     k=${String(scale).padEnd(4)} on ${pct(ev.share)}  52w edge ${num(ev.byH[52].logEdge, 3)} p=${pval(ev.byH[52].p)}  104w edge ${num(ev.byH[104].logEdge, 3)} p=${pval(ev.byH[104].p)}  zone/DCA ${num(ev.acc.ratio, 2)} p=${pval(ev.acc.p)}`)
    }
  }
  say('  -- 50%+ drawdowns, mvrv<1:')
  for (const t of a.troughs['mvrv<1']) {
    say(`     peak ${t.peak} → low ${t.trough} (${pct(t.depth)})${t.unrecovered ? ' not recovered' : ''}: ${t.firedBeforeLow ? `zone first on ${t.firstSignal}, then fell a further ${pct(t.fallAfterFirst)}` : 'zone never fired before the low'}; within ±13w of low: ${t.within13w ? 'yes' : 'no'}`)
  }
  if (ticker === 'BTC') {
    say('  -- each mvrv<1 episode:')
    for (const e of a.episodes['mvrv<1']) {
      say(`     ${e.start} → ${e.end} (${e.weeks}w) entry ${num(e.entry, 2)}  worst after ${pct(e.worstAfter)}  1y ${pct(e.r52)}  2y ${pct(e.r104)}  3y ${pct(e.r156)}   wait rank 1y ${pct(e.rank52)} 2y ${pct(e.rank104)} 3y ${pct(e.rank156)}`)
    }
  }
  for (const [name, eps] of Object.entries(a.episodes)) {
    const parts = [52, 104, 156].map((h) => { const r = eraSummary(eps, h); return `${h}w ${r.above}/${r.n} beat waiting (mean rank ${pct(r.meanRank)}, sign p=${num(r.p, 3)})` })
    say(`  -- episodes of ${name}: ${parts.join('; ')}`)
  }
}

// Pooled view across stocks.
say('='.repeat(100))
say('EPISODES vs WAITING — each zone entry counted once, ranked against buying in any of the next 104 weeks instead')
for (const [ticker, a] of Object.entries(results.assets)) {
  for (const name of Object.keys(a.episodes)) {
    const r = [52, 104, 156].map((h) => eraSummary(a.episodes[name], h))
    say(`  ${ticker.padEnd(5)} ${name.padEnd(10)} ${r.map((x, j) => `${[52, 104, 156][j]}w ${String(x.above).padStart(3)}/${String(x.n).padEnd(3)} mean rank ${pct(x.meanRank)} p=${pval(x.p)}`).join('   ')}`)
  }
}
say()
say('STOCKS POOLED — average log-edge across stocks vs averaged independent rotations (optimistic: stocks are not independent)')
for (const [sigName, byGroup] of Object.entries(results.pooled)) {
  for (const [group, byH] of Object.entries(byGroup)) {
    say(`  ${sigName.padEnd(15)} ${group.padEnd(9)} ${HORIZONS.map((h) => `${h}w ${num(byH[h].observed, 3).padStart(6)} p=${pval(byH[h].p)}`).join('   ')}`)
  }
}
say()
say('STOCKS POOLED — mvrv<1 (k=1), how many show a positive edge, and how many beat random timing at p<0.05')
for (const group of ['requested', 'control']) {
  const tick = Object.entries(results.assets).filter(([, a]) => a.group === group)
  for (const h of [52, 104, 156]) {
    const edges = tick.map(([, a]) => a.signals['mvrv<1'].byH[h])
    say(`  ${group.padEnd(9)} ${String(h).padStart(3)}w: edge>0 in ${edges.filter((r) => r.logEdge > 0).length}/${edges.length}, p<0.05 in ${edges.filter((r) => r.p < 0.05).length}/${edges.length}`)
  }
  const acc = tick.map(([, a]) => a.signals['mvrv<1'].acc)
  say(`  ${group.padEnd(9)} zone/DCA > 1 in ${acc.filter((x) => x.ratio > 1).length}/${acc.length}, beats random timing at p<0.05 in ${acc.filter((x) => x.p < 0.05).length}/${acc.length}`)
}

fs.mkdirSync('reports', { recursive: true })
fs.writeFileSync('reports/mvrv-backtest.txt', `${lines.join('\n')}\n`)
fs.writeFileSync(path.join(DATA, 'results.json'), `${JSON.stringify(results, null, 1)}\n`)

// Compact chart series for the page: 4 significant figures.
const r4 = (x) => (Number.isFinite(x) ? Number(x.toPrecision(4)) : null)
const compact = Object.fromEntries(Object.entries(series).map(([k, s]) => [k, {
  t0: s.t[0],
  c: s.c.map(r4),
  rp: s.rp.map(r4),
  z: s.z.map(r4),
  zFull: s.zFull.map(r4),
}]))
fs.writeFileSync(path.join(DATA, 'series.json'), `${JSON.stringify(compact)}\n`)

console.log(lines.join('\n'))
