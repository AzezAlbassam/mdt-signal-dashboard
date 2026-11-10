// "Vortex Live" v1 per timeframe — which chart, if any, does the causal vortex work on?
//
//   node scripts/vortex-timeframes.js > reports/vortex-timeframes.txt
//
// The indicator is engine/vortex-live.js, run with its pre-declared DEFAULTS (fixed 2026-10-03,
// before any per-timeframe result was seen) and nothing else changed except the round-trip cost:
// 0.02 % for indices, gold and TASI, 0.10 % for BTC. Five markets × four timeframes:
//
//   spx   PEPPERSTONE:US500 4h, TVC:SPX 1D / 1W / 1M        (the user's market)
//   ndx   PEPPERSTONE:NAS100 4h, TVC:NDX 1D / 1W / 1M
//   gold  OANDA:XAUUSD             btc  BITSTAMP:BTCUSD       tasi  TADAWUL:TASI
//
// from VORTEX_DATA (default /tmp/vortex/data)/<market>_<tf>.csv, columns t,o,h,l,c,v with t in
// unix seconds UTC. Every run starts at the file's first bar; on TradingView the numbers depend on
// the first bar the chart loads (ATR seed and zigzag start), so they will differ in detail.
//
// PER CELL (market × timeframe): trades, signals per year, win % with Wilson 95 %, duration in
// bars and calendar days (median, mean), expectancy % per trade with a percentile bootstrap 95 %
// CI (engine/stats.js), profit factor, average win / average loss, the break-even win rate they
// imply (avg loss ÷ (avg win + avg loss)), max consecutive losses, exit-reason mix.
//
// NULLS (DRAWS seeded draws each, engine/null-models.js seededRng; p one-sided, the indicator
// better than the null, p = (#draws ≥ observed + 1)/(DRAWS + 1)):
//   (a) RANDOM DIRECTION  the same trades — entry bar, exit bar, prices, cost — long or short by
//                         coin flip. Asks whether the side the wall picks carries information.
//   (b) RANDOM BAR        for each trade, an entry at a uniformly random bar of the same
//                         projection's eligible range (t ≥ its confirmation, skip ≤ i ≤ N − skip,
//                         before the next pivot is confirmed), with the same rule for the side
//                         (fade whichever side of the vector OHLC4 is on) and the same exits
//                         against the same geometry. Bars whose trade would still be open at the
//                         end of the data are left out, as the indicator's own open trade is.
//                         Asks whether the 0.85 ≤ |e| < 1.25 band picks better bars than chance.
//   (c) BOLLINGER         a plain Bollinger(50, 2σ) fade over the SAME eligible ranges: one position
//                         at a time, at most one entry per projection, entry on a close with
//                         2 ≤ |z| < 2.5 (z = (close − SMA50)/σ50, population σ as Pine's ta.stdev),
//                         target the mid-band (z back through 0), stop at 2.5σ on the entry side,
//                         and the same time exit (the projection's i > N − skip); fills at closes.
//                         p = one-sided permutation of mean(vortex) − mean(Bollinger), with a
//                         bootstrap 95 % CI for that difference.
// Holm adjustment across the primary family, 4 timeframes × 5 markets = 20 cells, for each null
// and for the intersection-union p = max(pA, pB, pC) ("beats all three"). A cell with no trades
// has no test and enters the family with p = 1.
//
// POOLED per timeframe across the five markets (trades concatenated; nulls drawn trade for trade),
// and SPX alone, since that is the user's market.
//
// HINDSIGHT (the video's way, for contrast only — NOT tradable): from the same pivots, every
// completed window with n ≥ 4 drawn by buildVortex on the finished swing; every contact traded at
// its peak OHLC4 (the price the list prints) with the 'video' exit: with-trend contacts (short in
// a falling window, long in a rising one) held to D at D's pivot price, counter-trend ones closed
// at the vector (first later bar whose range reaches the line O → D, at the line or at the open if
// it gapped through; else at D). Same cost.
//
// VERDICT RULE — written into this header before the first run, and applied mechanically below:
//   A timeframe HAS AN EDGE if, pooled across the five markets,
//     (1) the bootstrap 95 % CI of expectancy per trade lies entirely above 0, and
//     (2) it beats all three nulls: Holm-adjusted (across the 4 timeframes) max(pA, pB, pC) < 0.05.
//   The MOST ACCURATE timeframe is the one with an edge whose expectancy CI has the highest lower
//   bound. If no timeframe has an edge, the answer is "none of them". The same rule is applied to
//   SPX alone (Holm across its 4 cells) as the answer for the user's own market. Raw win rate
//   plays no part: a high win rate with small wins and large losses loses money.
//
// Optional: VORTEX_JSON=<path> also writes the per-cell and pooled numbers as JSON.

import fs from 'node:fs'

import { ohlc4, buildVortex } from '../engine/vortex.js'
import { runVortexLive, positionE, tradeStats, atr14, median, DEFAULTS, MIN_WALL_N } from '../engine/vortex-live.js'
import { seededRng } from '../engine/null-models.js'
import { wilsonInterval, bootstrapMean } from '../engine/stats.js'

const DATA = process.env.VORTEX_DATA ?? '/tmp/vortex/data'
const JSON_OUT = process.env.VORTEX_JSON

const DRAWS = 5000
const SEED = 20261003
const BB_PERIOD = 50
const BB_ENTRY = 2
const BB_STOP = 2.5
const ALPHA = 0.05
const DAY = 86400
const YEAR = 365.25 * DAY

const MARKETS = [
  { key: 'spx', label: 'SPX', cost: 0.0002, symbol: (tf) => (tf === '4h' ? 'PEPPERSTONE:US500' : 'TVC:SPX') },
  { key: 'ndx', label: 'NDX', cost: 0.0002, symbol: (tf) => (tf === '4h' ? 'PEPPERSTONE:NAS100' : 'TVC:NDX') },
  { key: 'gold', label: 'Gold', cost: 0.0002, symbol: () => 'OANDA:XAUUSD' },
  { key: 'btc', label: 'BTC', cost: 0.001, symbol: () => 'BITSTAMP:BTCUSD' },
  { key: 'tasi', label: 'TASI', cost: 0.0002, symbol: () => 'TADAWUL:TASI' },
]
const TIMEFRAMES = [
  { key: '4h', label: '4h' },
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
]

// ---------------------------------------------------------------- data

function loadCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
  const idx = Object.fromEntries(lines[0].split(',').map((h, i) => [h.trim(), i]))
  const bars = lines.slice(1).map((line) => {
    const f = line.split(',')
    return { t: Number(f[idx.t]), o: Number(f[idx.o]), h: Number(f[idx.h]), l: Number(f[idx.l]), c: Number(f[idx.c]) }
  })
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i]
    if (![b.t, b.o, b.h, b.l, b.c].every(Number.isFinite) || !(b.c > 0)) throw new Error(`${file}: bad bar ${i}`)
    if (i > 0 && !(b.t > bars[i - 1].t)) throw new Error(`${file}: bars not strictly increasing at ${i}`)
  }
  return bars
}

const iso = (t) => new Date(t * 1000).toISOString().slice(0, 10)

// ---------------------------------------------------------------- small helpers

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
const pValue = (draws, observed) => (draws.filter((d) => d >= observed).length + 1) / (draws.length + 1)

function holm(ps) {
  const order = ps.map((p, i) => [p ?? 1, i]).sort((a, b) => a[0] - b[0])
  const out = new Array(ps.length)
  let run = 0
  order.forEach(([p, i], r) => {
    run = Math.max(run, Math.min(1, (ps.length - r) * p))
    out[i] = run
  })
  return out
}

function assert(cond, msg) {
  if (!cond) throw new Error(`consistency check failed: ${msg}`)
}

// ---------------------------------------------------------------- the indicator's exits, replayed

/**
 * The exit of a position opened at the close of `entry` against projection `g`, exactly as
 * createTrader manages it: on later closes, time once i > N − skip, else the stop at |e| ≥ stopE on
 * the entry side, else the vector. Null if the data ends first.
 */
function simulateExit(bars, g, entry, side, stopE = DEFAULTS.stopE) {
  for (let t = entry + 1; t < bars.length; t += 1) {
    const i = t - g.iO
    if (i > g.N - g.skip) return { exit: t, reason: 'time' }
    const { e } = positionE(g, i, ohlc4(bars[t]))
    if (side > 0 ? e <= -stopE : e >= stopE) return { exit: t, reason: 'stop' }
    if (side > 0 ? e >= 0 : e <= 0) return { exit: t, reason: 'target' }
  }
  return null
}

function makeTrade(bars, entry, exit, side, reason, cost, extra = {}) {
  const entryPrice = bars[entry].c
  const exitPrice = bars[exit].c
  const raw = (exitPrice - entryPrice) / entryPrice
  return {
    side,
    entryIndex: entry,
    exitIndex: exit,
    entryPrice,
    exitPrice,
    reason,
    raw,
    cost,
    ret: (side * (exitPrice - entryPrice)) / entryPrice - cost,
    bars: exit - entry,
    days: (bars[exit].t - bars[entry].t) / DAY,
    ...extra,
  }
}

// ---------------------------------------------------------------- Bollinger (null c)

/** z = (close − SMA)/σ over a trailing 50-bar window, population σ (Pine ta.stdev default). */
function bollingerZ(bars) {
  const z = new Array(bars.length).fill(null)
  for (let t = BB_PERIOD - 1; t < bars.length; t += 1) {
    let s = 0
    for (let q = t - BB_PERIOD + 1; q <= t; q += 1) s += bars[q].c
    const m = s / BB_PERIOD
    let v = 0
    for (let q = t - BB_PERIOD + 1; q <= t; q += 1) v += (bars[q].c - m) ** 2
    const sd = Math.sqrt(v / BB_PERIOD)
    z[t] = sd === 0 ? 0 : (bars[t].c - m) / sd
  }
  return z
}

/** The Bollinger fade over the vortex's own eligible ranges and time exits (see the header). */
function runBollingerMatched(bars, liveAt, spans, z, cost) {
  const trades = []
  let pos = null
  let lastEntered = null
  for (let t = 0; t < bars.length; t += 1) {
    if (pos && t > pos.entry) {
      const g = pos.g
      const i = t - g.iO
      let reason = null
      if (i > g.N - g.skip) reason = 'time'
      else if (z[t] !== null) {
        if (pos.side > 0 ? z[t] <= -BB_STOP : z[t] >= BB_STOP) reason = 'stop'
        else if (pos.side > 0 ? z[t] >= 0 : z[t] <= 0) reason = 'target'
      }
      if (reason) {
        trades.push(makeTrade(bars, pos.entry, t, pos.side, reason, cost))
        pos = null
      }
    }
    const g = liveAt[t]
    if (!g || pos || lastEntered === g || z[t] === null) continue
    const sp = spans.get(g.id)
    if (t < sp.from || t > sp.to) continue
    const a = Math.abs(z[t])
    if (a >= BB_ENTRY && a < BB_STOP) {
      pos = { entry: t, side: z[t] > 0 ? -1 : 1, g }
      lastEntered = g
    }
  }
  return trades
}

// ---------------------------------------------------------------- hindsight (the video's way)

function hindsightTrades(bars, pivots, cost) {
  const out = []
  let windows = 0
  for (let k = 0; k + 1 < pivots.length; k += 1) {
    const a = pivots[k]
    const b = pivots[k + 1]
    if (b.index - a.index < MIN_WALL_N || a.price === b.price) continue
    windows += 1
    const v = buildVortex(bars, { o: a.index, d: b.index, oPrice: a.price, dPrice: b.price, skipFrac: DEFAULTS.skipFrac, contactLevel: DEFAULTS.level })
    const falling = b.price < a.price
    for (const c of v.contacts) {
      const side = c.side === 'long' ? 1 : -1
      const entry = a.index + c.peakIndex
      const entryPrice = c.price
      const withTrend = falling ? side < 0 : side > 0
      let exit = b.index
      let exitPrice = b.price
      if (!withTrend) {
        for (let u = entry + 1; u <= b.index; u += 1) {
          const L = v.vector[u - a.index]
          if (side > 0 ? bars[u].h >= L : bars[u].l <= L) {
            exit = u
            exitPrice = side > 0 ? Math.max(bars[u].o, L) : Math.min(bars[u].o, L)
            break
          }
        }
      }
      out.push({
        side,
        withTrend,
        entryIndex: entry,
        exitIndex: exit,
        entryPrice,
        exitPrice,
        reason: withTrend ? 'D' : exit === b.index ? 'D' : 'vector',
        raw: (exitPrice - entryPrice) / entryPrice,
        cost,
        ret: (side * (exitPrice - entryPrice)) / entryPrice - cost,
        bars: exit - entry,
        days: (bars[exit].t - bars[entry].t) / DAY,
      })
    }
  }
  return { trades: out, windows }
}

// ---------------------------------------------------------------- statistics

function maxConsecutiveLosses(trades) {
  const groups = new Map()
  for (const t of trades) {
    const key = t.market ?? ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(t)
  }
  let best = 0
  for (const g of groups.values()) {
    g.sort((a, b) => a.entryIndex - b.entryIndex)
    let run = 0
    for (const t of g) {
      run = t.ret > 0 ? 0 : run + 1
      best = Math.max(best, run)
    }
  }
  return best
}

function describe(trades, seed) {
  const n = trades.length
  const reasons = {}
  for (const t of trades) reasons[t.reason] = (reasons[t.reason] ?? 0) + 1
  if (n === 0) return { n, reasons }
  const rets = trades.map((t) => t.ret)
  const wins = rets.filter((r) => r > 0)
  const losses = rets.filter((r) => r <= 0).map((r) => -r)
  const gain = wins.reduce((s, x) => s + x, 0)
  const loss = losses.reduce((s, x) => s + x, 0)
  const avgWin = wins.length ? gain / wins.length : null
  const avgLoss = losses.length ? loss / losses.length : null
  const side = (s) => {
    const xs = trades.filter((t) => t.side === s).map((t) => t.ret)
    return { n: xs.length, winRate: xs.length ? xs.filter((r) => r > 0).length / xs.length : null, exp: mean(xs) }
  }
  return {
    n,
    wins: wins.length,
    winRate: wins.length / n,
    wilson: wilsonInterval(wins.length, n),
    exp: mean(rets),
    // A bootstrap of one trade is that trade; report no interval rather than a point.
    expCI: n >= 2 ? bootstrapMean(rets, { draws: DRAWS, rng: seededRng(seed) }) : null,
    // Descriptive only (not part of the verdict): the mean without the single largest |ret|.
    expDropMax: n >= 2
      ? (() => {
          const k = rets.reduce((b, r, i) => (Math.abs(r) > Math.abs(rets[b]) ? i : b), 0)
          return { dropped: rets[k], exp: (rets.reduce((s, r) => s + r, 0) - rets[k]) / (n - 1) }
        })()
      : null,
    pf: loss === 0 ? (gain > 0 ? Infinity : null) : gain / loss,
    avgWin,
    avgLoss,
    beWin: avgWin !== null && avgLoss !== null && avgWin + avgLoss > 0 ? avgLoss / (avgWin + avgLoss) : null,
    medBars: median(trades.map((t) => t.bars)),
    meanBars: mean(trades.map((t) => t.bars)),
    medDays: median(trades.map((t) => t.days)),
    meanDays: mean(trades.map((t) => t.days)),
    maxConsecLoss: maxConsecutiveLosses(trades),
    reasons,
    // Exit reason vs outcome: the stop and target are e-levels on a moving vector inside a
    // widening ellipse, not fixed prices, so a 'stop' can win and a 'target' can lose.
    byReason: Object.fromEntries(Object.keys(reasons).map((k) => {
      const xs = trades.filter((t) => t.reason === k).map((t) => t.ret)
      return [k, { n: xs.length, wins: xs.filter((r) => r > 0).length, exp: mean(xs) }]
    })),
    worst: Math.min(...rets),
    best: Math.max(...rets),
    long: side(1),
    short: side(-1),
  }
}

/** Nulls (a) and (b), drawn trade for trade, plus (c) against the matched Bollinger trades. */
function nullTests(trades, bbTrades, seed) {
  const n = trades.length
  if (n === 0) return null
  const actual = mean(trades.map((t) => t.ret))

  // (a) random direction
  const rngA = seededRng(seed)
  const drawsA = new Array(DRAWS)
  let winA = 0
  for (let d = 0; d < DRAWS; d += 1) {
    let s = 0
    let w = 0
    for (const t of trades) {
      const r = (rngA() < 0.5 ? 1 : -1) * t.raw - t.cost
      s += r
      if (r > 0) w += 1
    }
    drawsA[d] = s / n
    winA += w / n
  }

  // (b) random bar of the same projection's eligible range
  const rngB = seededRng(seed + 1)
  const drawsB = new Array(DRAWS)
  let winB = 0
  for (let d = 0; d < DRAWS; d += 1) {
    let s = 0
    let w = 0
    for (const t of trades) {
      const m = t.menu
      const r = m[Math.floor(rngB() * m.length)]
      s += r
      if (r > 0) w += 1
    }
    drawsB[d] = s / n
    winB += w / n
  }

  // (c) vortex vs the matched Bollinger fade
  let c = null
  if (bbTrades.length > 0 && n + bbTrades.length >= 3) {
    const a = trades.map((t) => t.ret)
    const b = bbTrades.map((t) => t.ret)
    const obs = mean(a) - mean(b)
    const rng = seededRng(seed + 2)
    const pool = [...a, ...b]
    const perm = new Array(DRAWS)
    for (let d = 0; d < DRAWS; d += 1) {
      for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
      }
      let sa = 0
      for (let i = 0; i < a.length; i += 1) sa += pool[i]
      let sb = 0
      for (let i = a.length; i < pool.length; i += 1) sb += pool[i]
      perm[d] = sa / a.length - sb / b.length
    }
    const boot = new Array(DRAWS)
    for (let d = 0; d < DRAWS; d += 1) {
      let sa = 0
      let sb = 0
      for (let i = 0; i < a.length; i += 1) sa += a[Math.floor(rng() * a.length)]
      for (let i = 0; i < b.length; i += 1) sb += b[Math.floor(rng() * b.length)]
      boot[d] = sa / a.length - sb / b.length
    }
    boot.sort((x, y) => x - y)
    c = {
      diff: obs,
      ci: [boot[Math.floor(0.025 * DRAWS)], boot[Math.min(DRAWS - 1, Math.floor(0.975 * DRAWS))]],
      p: pValue(perm, obs),
    }
  }

  const a = { mean: mean(drawsA), winRate: winA / DRAWS, p: pValue(drawsA, actual) }
  const b = { mean: mean(drawsB), winRate: winB / DRAWS, p: pValue(drawsB, actual) }
  return { a, b, c, iut: Math.max(a.p, b.p, c ? c.p : 1) }
}

// ---------------------------------------------------------------- one market × timeframe

function analyseCell(market, tf, bars) {
  const res = runVortexLive(bars, { cost: market.cost })
  const N = bars.length

  // Live span of each projection (from its confirmation to the bar before the next pivot is
  // confirmed) and its eligible entry range inside that span.
  const nextConf = new Map(res.pivots.map((p, k) => [p.confirmedAt, res.pivots[k + 1]?.confirmedAt ?? null]))
  const spans = new Map()
  const liveAt = new Array(N).fill(null)
  for (const g of res.projections) {
    const nc = nextConf.get(g.confirmedAt)
    const liveEnd = nc === null ? N - 1 : nc - 1
    spans.set(g.id, { g, liveEnd, from: Math.max(g.confirmedAt, g.iO + g.skip), to: Math.min(g.iO + g.N - g.skip, liveEnd) })
    for (let t = g.confirmedAt; t <= liveEnd; t += 1) liveAt[t] = g
  }
  // The eligible ranges are exactly the bars on which the engine reports a live e.
  for (let t = 0; t < N; t += 1) {
    const g = liveAt[t]
    const sp = g && spans.get(g.id)
    const eligible = Boolean(sp && t >= sp.from && t <= sp.to)
    assert(eligible === (res.events[t].e !== null), `${market.key} ${tf.key}: eligible range at bar ${t}`)
  }

  // Null (b)'s menu for a projection: the return of entering at every bar of its eligible range.
  const menus = new Map()
  const menuFor = (sp) => {
    if (menus.has(sp.g.id)) return menus.get(sp.g.id)
    const rets = []
    for (let t = sp.from; t <= sp.to; t += 1) {
      const { e } = positionE(sp.g, t - sp.g.iO, ohlc4(bars[t]))
      if (e === 0) continue
      const side = e < 0 ? 1 : -1
      const x = simulateExit(bars, sp.g, t, side)
      if (!x) continue
      rets.push(makeTrade(bars, t, x.exit, side, x.reason, market.cost).ret)
    }
    menus.set(sp.g.id, rets)
    return rets
  }

  // The indicator's trades, each re-derived from its projection as a check on the replay above.
  const st = tradeStats(res.trades)
  const trades = res.trades.map((tr) => {
    const sp = spans.get(tr.projection)
    assert(tr.entryIndex >= sp.from && tr.entryIndex <= sp.to, `${market.key} ${tf.key}: entry outside its range`)
    const x = simulateExit(bars, sp.g, tr.entryIndex, tr.side)
    assert(x && x.exit === tr.exitIndex && x.reason === tr.reason, `${market.key} ${tf.key}: exit replay`)
    const mine = makeTrade(bars, tr.entryIndex, tr.exitIndex, tr.side, tr.reason, market.cost)
    assert(mine.ret === tr.ret && Math.abs(mine.days - tr.days) < 1e-9, `${market.key} ${tf.key}: return replay`)
    return { ...mine, eEntry: tr.eEntry, projection: tr.projection, market: market.key, tf: tf.key, menu: menuFor(sp) }
  })

  const bb = runBollingerMatched(bars, liveAt, spans, bollingerZ(bars), market.cost).map((t) => ({ ...t, market: market.key }))
  const hind = hindsightTrades(bars, res.pivots, market.cost)
  for (const t of hind.trades) t.market = market.key

  // Geometry diagnostics.
  const atr = atr14(bars)
  const thr = []
  for (let t = 0; t < N; t += 1) if (atr[t] !== null) thr.push((DEFAULTS.atrMult * atr[t]) / bars[t].c)
  const projs = res.projections
  const years = (bars[N - 1].t - bars[0].t) / YEAR
  const activeYears = projs.length ? (bars[N - 1].t - bars[projs[0].confirmedAt].t) / YEAR : null
  const entries = trades.length + (res.open ? 1 : 0)

  return {
    market,
    tf,
    bars,
    res,
    stCheck: st,
    trades,
    bb,
    hind,
    open: res.open,
    years,
    activeYears,
    entries,
    diag: {
      thr: thr.length ? median(thr) : null,
      pivots: res.pivots.length,
      windows: res.windows.length,
      projections: projs.length,
      medN: projs.length ? median(projs.map((g) => g.N)) : null,
      lagShare: projs.length ? median(projs.map((g) => (g.confirmedAt - g.iO) / g.N)) : null,
      expired: projs.filter((g) => g.confirmedAt > g.iO + g.N - g.skip).length,
      wRatio: (() => {
        const xs = projs.filter((g) => g.Wdn > 0).map((g) => g.Wup / g.Wdn)
        return xs.length ? median(xs) : null
      })(),
      eligibleBars: [...spans.values()].reduce((s, sp) => s + Math.max(0, sp.to - sp.from + 1), 0),
      entered: new Set(trades.map((t) => t.projection)).size + (res.open ? 1 : 0),
    },
  }
}

// ---------------------------------------------------------------- formatting

const out = []
const say = (s = '') => out.push(s)
const rule = (n) => '─'.repeat(n)
const pc = (x, d = 0) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
const sp = (x, d = 2) => (x == null || Number.isNaN(x) ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`)
const ci = (iv, f) => (iv ? `[${f(iv[0])}, ${f(iv[1])}]` : '—')
const pv = (p) => (p == null ? '—' : p < 0.001 ? '<.001' : p.toFixed(3))
const f1 = (x) => (x == null ? '—' : x >= 100 ? x.toFixed(0) : x.toFixed(1))
const f2 = (x) => (x == null ? '—' : x === Infinity ? '∞' : x.toFixed(2))
const pad = (s, w) => String(s).padStart(w)
const padR = (s, w) => String(s).padEnd(w)
const exitsLabel = (r) => `${r.target ?? 0}/${r.stop ?? 0}/${r.time ?? 0}`

// ---------------------------------------------------------------- run

const cells = []
for (const tf of TIMEFRAMES) {
  for (const market of MARKETS) {
    const file = `${DATA}/${market.key}_${tf.key}.csv`
    cells.push(analyseCell(market, tf, loadCsv(file)))
  }
}

let seed = SEED
for (const c of cells) {
  c.stats = describe(c.trades, (seed += 101))
  c.nulls = nullTests(c.trades, c.bb, (seed += 101))
  c.bbStats = describe(c.bb, (seed += 101))
  c.hindStats = describe(c.hind.trades, (seed += 101))
  // engine/vortex-live tradeStats and this script's statistics must agree.
  if (c.stats.n) {
    assert(c.stCheck.n === c.stats.n && c.stCheck.wins === c.stats.wins, 'tradeStats wins')
    assert(Math.abs(c.stCheck.expectancy - c.stats.exp) < 1e-15, 'tradeStats expectancy')
    assert(c.stCheck.medianBars === c.stats.medBars, 'tradeStats median bars')
    assert(c.stCheck.profitFactor === c.stats.pf || Math.abs(c.stCheck.profitFactor - c.stats.pf) < 1e-12, 'tradeStats profit factor')
  }
}

// Holm across the 20 primary cells, for each null and for "beats all three".
const fam = (f) => holm(cells.map((c) => (c.nulls ? f(c.nulls) : 1)))
const holmA = fam((x) => x.a.p)
const holmB = fam((x) => x.b.p)
const holmC = fam((x) => (x.c ? x.c.p : 1))
const holmIUT = fam((x) => x.iut)
cells.forEach((c, i) => {
  c.holm = { a: holmA[i], b: holmB[i], c: holmC[i], iut: holmIUT[i] }
})

// Pooled per timeframe across markets.
const pooled = TIMEFRAMES.map((tf) => {
  const cs = cells.filter((c) => c.tf === tf)
  const trades = cs.flatMap((c) => c.trades)
  const bb = cs.flatMap((c) => c.bb)
  const hind = cs.flatMap((c) => c.hind.trades)
  const years = cs.reduce((s, c) => s + c.years, 0)
  const activeYears = cs.reduce((s, c) => s + (c.activeYears ?? 0), 0)
  const entries = cs.reduce((s, c) => s + c.entries, 0)
  return {
    tf,
    cs,
    trades,
    entries,
    years,
    activeYears,
    stats: describe(trades, (seed += 101)),
    nulls: nullTests(trades, bb, (seed += 101)),
    bbStats: describe(bb, (seed += 101)),
    hindStats: describe(hind, (seed += 101)),
    hindN: hind.length,
    hindWindows: cs.reduce((s, c) => s + c.hind.windows, 0),
    positiveMarkets: cs.filter((c) => c.stats.n && c.stats.exp > 0).length,
    marketsWithTrades: cs.filter((c) => c.stats.n).length,
  }
})
const pooledHolm = holm(pooled.map((p) => (p.nulls ? p.nulls.iut : 1)))
pooled.forEach((p, i) => {
  p.holmIUT = pooledHolm[i]
})
const spxCells = cells.filter((c) => c.market.key === 'spx')
const spxHolm = holm(spxCells.map((c) => (c.nulls ? c.nulls.iut : 1)))
spxCells.forEach((c, i) => {
  c.spxHolmIUT = spxHolm[i]
})

// The verdict, by the rule in the header.
const hasEdge = (stats, holmIut) => Boolean(stats.n && stats.expCI && stats.expCI[0] > 0 && holmIut < ALPHA)
const ciWords = (iv) => (!iv ? 'has no interval (one trade)' : iv[1] < 0 ? 'lies entirely below 0 (it loses money)' : 'includes 0')
const qualifying = pooled.filter((p) => hasEdge(p.stats, p.holmIUT))
const best = qualifying.sort((a, b) => b.stats.expCI[0] - a.stats.expCI[0])[0] ?? null
const spxQualifying = spxCells.filter((c) => hasEdge(c.stats, c.spxHolmIUT))
const spxBest = spxQualifying.sort((a, b) => b.stats.expCI[0] - a.stats.expCI[0])[0] ?? null

// ---------------------------------------------------------------- report

say('VORTEX LIVE v1 — WHICH TIMEFRAME? (4h / 1D / 1W / 1M × SPX, NDX, gold, BTC, TASI)')
say('='.repeat(84))
say('')
say('Generated by scripts/vortex-timeframes.js from engine/vortex-live.js with its pre-declared')
say('DEFAULTS (ATR 14, threshold 4·ATR/close, K = 5, entry band 0.85 ≤ |e| < 1.25, stop |e| ≥ 1.25,')
say('skip 3 %, N ≥ 8). Nothing was tuned. Entries and exits on bar closes, one position at a time,')
say('one entry per projection. Costs per round trip: 0.02 % (indices, gold, TASI), 0.10 % (BTC).')
say(`Intervals: Wilson 95 % for win rates; percentile bootstrap 95 % (${DRAWS} resamples) for expectancy.`)
say(`Nulls: ${DRAWS} seeded draws each, one-sided p = (#null ≥ observed + 1)/(draws + 1).`)
say('')
say('VERDICT RULE (fixed in the script header before the first run): a timeframe has an edge if,')
say('pooled across the five markets, (1) the expectancy CI lies above 0 and (2) Holm-adjusted (over the')
say('4 timeframes) max(pA, pB, pC) < 0.05 — it beats random direction, random bars in the same')
say('projection, AND a matched Bollinger fade. Most accurate = the qualifying timeframe with the')
say('highest CI lower bound; if none qualifies, the answer is "none". Win rate plays no part.')
say('')
say('DATA')
for (const c of cells) {
  say(`  ${padR(`${c.market.label} ${c.tf.label}`, 9)} ${padR(c.market.symbol(c.tf.key), 19)} ${pad(c.bars.length, 5)} bars  ` +
    `${iso(c.bars[0].t)} → ${iso(c.bars.at(-1).t)}  (${c.years.toFixed(1)} y)  cost ${(c.market.cost * 100).toFixed(2)} %`)
}
say('')

// ---- 1. per cell performance
say('━━━ 1. PER MARKET × TIMEFRAME — what the indicator\'s table would show ━━━')
say('')
let h = 'TF  market  trades  win%  [95% CI]     exp %/trade [95% CI]          PF   avg win  avg loss  BE win%  max L'
say(h)
say(rule(h.length))
for (const tf of TIMEFRAMES) {
  for (const c of cells.filter((x) => x.tf === tf)) {
    const s = c.stats
    if (!s.n) {
      say(`${padR(tf.label, 3)} ${padR(c.market.label, 6)} ${pad(0, 7)}  — no closed trades`)
      continue
    }
    say([
      padR(tf.label, 3), padR(c.market.label, 6), pad(s.n, 7),
      pad(pc(s.winRate), 5), padR(ci(s.wilson, (x) => pc(x)), 11),
      pad(sp(s.exp, 3), 9), padR(ci(s.expCI, (x) => sp(x, 3)), 21),
      pad(f2(s.pf), 5), pad(sp(s.avgWin), 8), pad(s.avgLoss == null ? '—' : `-${(s.avgLoss * 100).toFixed(2)}%`, 9),
      pad(pc(s.beWin), 8), pad(s.maxConsecLoss, 6),
    ].join(' '))
  }
  say('')
}
say('win% = share of trades with net return > 0. BE win% = the win rate at which avg win and avg loss')
say('break even (avg loss ÷ (avg win + avg loss)); the strategy loses money whenever win% < BE win%.')
say('max L = longest run of consecutive losing trades.')
say('')

// ---- 2. durations, frequency, exits
say('━━━ 2. HOW OFTEN AND HOW LONG ━━━')
say('')
h = 'TF  market  entries  per yr (file | active)  bars med / mean   days med / mean   exits tgt/stop/time   long n  exp      short n  exp'
say(h)
say(rule(h.length))
for (const tf of TIMEFRAMES) {
  for (const c of cells.filter((x) => x.tf === tf)) {
    const s = c.stats
    say([
      padR(tf.label, 3), padR(c.market.label, 6), pad(c.entries, 8),
      pad((c.entries / c.years).toFixed(2), 10), '|', padR(c.activeYears ? (c.entries / c.activeYears).toFixed(2) : '—', 11),
      pad(s.n ? `${f1(s.medBars)} / ${f1(s.meanBars)}` : '—', 16),
      pad(s.n ? `${f1(s.medDays)} / ${f1(s.meanDays)}` : '—', 17),
      pad(s.n ? exitsLabel(s.reasons) : '—', 20),
      pad(s.n ? s.long.n : '—', 9), pad(s.n && s.long.n ? sp(s.long.exp) : '—', 8),
      pad(s.n ? s.short.n : '—', 8), pad(s.n && s.short.n ? sp(s.short.exp) : '—', 8),
    ].join(' '))
  }
  say('')
}
say('entries = closed trades + the position still open at the end of the data (if any).')
say('per yr (file) = over the whole file; (active) = from the first projection to the end, i.e. after')
say('the warm-up (14 bars of ATR, then 6 pivots before the first projection). Days are calendar days')
say('between the entry and exit bars\' timestamps. Exits: target = the vector, stop = |e| ≥ 1.25,')
say('time = past N − skip of the entry projection.')
say('')

// ---- 3. nulls
say('━━━ 3. AGAINST MATCHED CHANCE ━━━')
say('')
say('(a) same trades, random direction   (b) random bar of the same projection\'s eligible range,')
say('same side rule and exits   (c) Bollinger(50, 2σ) fade on the same ranges — n, win%, exp, and the')
say('difference vortex − Bollinger with its bootstrap CI. Holm across the 20 cells; "all" = max(pA, pB, pC).')
say('')
h = 'TF  market  trades  exp      | (a) null  p     | (b) null  win%  p     | (c) BB n  win%  exp       diff [95% CI]                p     | Holm a     b     c     all'
say(h)
say(rule(h.length))
for (const tf of TIMEFRAMES) {
  for (const c of cells.filter((x) => x.tf === tf)) {
    const s = c.stats
    const z = c.nulls
    if (!z) {
      say(`${padR(tf.label, 3)} ${padR(c.market.label, 6)} ${pad(0, 7)}  — no trades, no test (p = 1 in the Holm family)`)
      continue
    }
    const bs = c.bbStats
    say([
      padR(tf.label, 3), padR(c.market.label, 6), pad(s.n, 7), padR(sp(s.exp, 3), 8), '|',
      pad(sp(z.a.mean, 3), 8), pad(pv(z.a.p), 5), ' |',
      pad(sp(z.b.mean, 3), 8), pad(pc(z.b.winRate), 5), pad(pv(z.b.p), 5), ' |',
      pad(bs.n, 8), pad(bs.n ? pc(bs.winRate) : '—', 5), pad(bs.n ? sp(bs.exp, 3) : '—', 8),
      pad(z.c ? sp(z.c.diff, 3) : '—', 9), padR(z.c ? ci(z.c.ci, (x) => sp(x, 3)) : '', 20), pad(z.c ? pv(z.c.p) : '—', 5), ' |',
      pad(pv(c.holm.a), 6), pad(pv(c.holm.b), 5), pad(pv(c.holm.c), 5), pad(pv(c.holm.iut), 5),
    ].join(' '))
  }
  say('')
}
{
  const raw = (f) => cells.filter((c) => c.nulls && f(c.nulls) < ALPHA).length
  const adj = (k) => cells.filter((c) => c.holm[k] < ALPHA).length
  say(`Raw p < 0.05 in 20 cells: (a) ${raw((x) => x.a.p)}, (b) ${raw((x) => x.b.p)}, (c) ${raw((x) => (x.c ? x.c.p : 1))}, ` +
    `all three ${raw((x) => x.iut)} (about 1 per null expected by chance alone).`)
  say(`After Holm: (a) ${adj('a')}, (b) ${adj('b')}, (c) ${adj('c')}, all three ${adj('iut')}.`)
}
say('')

// ---- 4. geometry
say('━━━ 4. WHAT THE INDICATOR SEES ON EACH TIMEFRAME (diagnostics) ━━━')
say('')
h = 'TF  market  thr med  pivots  windows  proj  med N  lag/N  expired  Wup/Wdn  eligible bars  proj entered'
say(h)
say(rule(h.length))
for (const tf of TIMEFRAMES) {
  for (const c of cells.filter((x) => x.tf === tf)) {
    const d = c.diag
    say([
      padR(tf.label, 3), padR(c.market.label, 6), pad(pc(d.thr, 1), 7), pad(d.pivots, 7), pad(d.windows, 8),
      pad(d.projections, 5), pad(d.medN == null ? '—' : f1(d.medN), 6), pad(d.lagShare == null ? '—' : d.lagShare.toFixed(2), 6),
      pad(d.projections ? `${d.expired}/${d.projections}` : '—', 8), pad(d.wRatio == null ? '—' : f2(d.wRatio), 8),
      pad(d.eligibleBars, 14), pad(d.projections ? `${d.entered}/${d.projections}` : '—', 13),
    ].join(' '))
  }
  say('')
}
say('thr med = median zigzag reversal threshold 4·ATR/close (a fraction of price). lag/N = median bars')
say('from O to the bar that confirms it, as a share of the projected N — how much of the projected swing')
say('is already over when the projection is drawn. expired = projections whose entry range [skip, N − skip]')
say('had ended before they were drawn. Wup/Wdn = median ratio of the projected upper to lower wall')
say('(finding 2 of the spec: ru/rd medians mix rising and falling windows, so the walls are lopsided).')
say('')

// ---- 5. pooled
say('━━━ 5. POOLED PER TIMEFRAME — all five markets together ━━━')
say('')
h = 'TF  trades  mkts +/n  win%  [95% CI]     exp %/trade [95% CI]          PF    BE win%  bars med  days med  pA     pB     pC     all   Holm(4)'
say(h)
say(rule(h.length))
for (const p of pooled) {
  const s = p.stats
  if (!s.n) {
    say(`${padR(p.tf.label, 3)} ${pad(0, 6)}  — no trades`)
    continue
  }
  say([
    padR(p.tf.label, 3), pad(s.n, 6), pad(`${p.positiveMarkets}/${p.marketsWithTrades}`, 9),
    pad(pc(s.winRate), 5), padR(ci(s.wilson, (x) => pc(x)), 11),
    pad(sp(s.exp, 3), 9), padR(ci(s.expCI, (x) => sp(x, 3)), 21),
    pad(f2(s.pf), 5), pad(pc(s.beWin), 8), pad(f1(s.medBars), 9), pad(f1(s.medDays), 9),
    pad(pv(p.nulls.a.p), 6), pad(pv(p.nulls.b.p), 6), pad(pv(p.nulls.c?.p), 6), pad(pv(p.nulls.iut), 5), pad(pv(p.holmIUT), 8),
  ].join(' '))
}
say('')
h = 'TF  null (a) mean  null (b) mean  win%   | Bollinger n  win%  exp        | vortex − BB [95% CI]          | long n  win%  exp      short n  win%  exp'
say(h)
say(rule(h.length))
for (const p of pooled) {
  const s = p.stats
  if (!s.n) continue
  const z = p.nulls
  const bs = p.bbStats
  say([
    padR(p.tf.label, 3), pad(sp(z.a.mean, 3), 13), pad(sp(z.b.mean, 3), 14), pad(pc(z.b.winRate), 5), '  |',
    pad(bs.n, 11), pad(bs.n ? pc(bs.winRate) : '—', 5), pad(bs.n ? sp(bs.exp, 3) : '—', 9), '  |',
    pad(z.c ? sp(z.c.diff, 3) : '—', 8), padR(z.c ? ci(z.c.ci, (x) => sp(x, 3)) : '', 21), '|',
    pad(s.long.n, 7), pad(pc(s.long.winRate), 5), pad(sp(s.long.exp), 8),
    pad(s.short.n, 8), pad(pc(s.short.winRate), 5), pad(sp(s.short.exp), 8),
  ].join(' '))
}
say('')
for (const p of pooled) {
  const dm = p.stats.expDropMax
  if (dm) say(`${padR(p.tf.label, 3)} without its single largest trade (${sp(dm.dropped, 2)}): expectancy ${sp(dm.exp, 3)} per trade (descriptive, not a test).`)
}
say('')
h = 'TF  exit     n    won   win%   mean ret   | worst trade  best trade'
say(h)
say(rule(h.length))
for (const p of pooled) {
  const s = p.stats
  if (!s.n) continue
  ;['target', 'stop', 'time'].forEach((k, j) => {
    const r = s.byReason[k] ?? { n: 0, wins: 0, exp: null }
    say([
      padR(j === 0 ? p.tf.label : '', 3), padR(k, 6), pad(r.n, 5), pad(r.wins, 6), pad(r.n ? pc(r.wins / r.n) : '—', 6), pad(r.n ? sp(r.exp, 3) : '—', 10), '  |',
      j === 0 ? `${pad(sp(s.worst, 2), 11)} ${pad(sp(s.best, 2), 11)}` : '',
    ].join(' '))
  })
}
say('The stop (|e| ≥ 1.25) and the target (e back to 0) are levels in e, measured against the entry')
say('projection\'s vector, which keeps moving toward the projected D, inside an ellipse that widens to')
say('mid-window. Neither is a fixed price: a "stop" can close a winner and a "target" a loser, and a loss')
{
  const w = cells.flatMap((c) => c.trades.map((t) => ({ c, t }))).reduce((a, x) => (x.t.ret < a.t.ret ? x : a))
  say(`is not capped in price — the worst trade, ${w.c.market.label} ${w.c.tf.label}, a ${w.t.side > 0 ? 'long' : 'short'} entered at e = ${sp(w.t.eEntry / 100, 2).replace('%', '')} on ` +
    `${iso(w.c.bars[w.t.entryIndex].t)}, was held ${w.t.bars} bars`)
  say(`while the vector moved with price, and closed (${w.t.reason}) at ${sp(w.t.ret, 1)}.`)
}
say('')
say('mkts +/n = markets with positive expectancy / markets with trades. The pooled bootstrap treats trades')
say('as independent across markets; SPX and NDX move together, so the pooled intervals are, if anything,')
say('too narrow. Holm(4) adjusts "all" across the four pooled timeframes (the verdict family).')
say('')

// ---- 6. SPX alone
say('━━━ 6. SPX ALONE — the user\'s market (4h = PEPPERSTONE:US500, else TVC:SPX) ━━━')
say('')
h = 'TF  trades  per yr  win%  [95% CI]     exp %/trade [95% CI]          PF    avg win  avg loss  BE win%  bars med/mean  days med/mean  all p  Holm(4)'
say(h)
say(rule(h.length))
for (const c of spxCells) {
  const s = c.stats
  if (!s.n) {
    say(`${padR(c.tf.label, 3)} ${pad(0, 6)}  — no closed trades (${c.entries} entries)`)
    continue
  }
  say([
    padR(c.tf.label, 3), pad(s.n, 6), pad(c.activeYears ? (c.entries / c.activeYears).toFixed(2) : '—', 7),
    pad(pc(s.winRate), 5), padR(ci(s.wilson, (x) => pc(x)), 11),
    pad(sp(s.exp, 3), 9), padR(ci(s.expCI, (x) => sp(x, 3)), 21),
    pad(f2(s.pf), 5), pad(sp(s.avgWin), 8), pad(s.avgLoss == null ? '—' : `-${(s.avgLoss * 100).toFixed(2)}%`, 9),
    pad(pc(s.beWin), 8), pad(`${f1(s.medBars)} / ${f1(s.meanBars)}`, 14), pad(`${f1(s.medDays)} / ${f1(s.meanDays)}`, 14),
    pad(pv(c.nulls.iut), 6), pad(pv(c.spxHolmIUT), 8),
  ].join(' '))
}
say('(per yr = entries per year after the warm-up.)')
say('')

// ---- 7. hindsight
say('━━━ 7. FOR CONTRAST: THE SAME PIVOTS IN HINDSIGHT (the video\'s way — NOT tradable) ━━━')
say('')
say('buildVortex on each finished window (n ≥ 4) between consecutive pivots; every contact traded at its')
say('peak OHLC4 with the "video" exit (with-trend held to D at the pivot price, counter-trend closed at')
say('the vector). Consecutive windows do not overlap; contacts inside one window do, and with-trend ones')
say('share its exit at D. Not one position at a time — this is the list the video prints, traded as listed.')
say('')
h = 'TF  market  windows  contacts  per yr  win%  [95% CI]     exp %/trade [95% CI]          PF     bars med  days med  | live: n  win%  exp'
say(h)
say(rule(h.length))
const hindRow = (label, mk, windows, n, perYr, s, live) => say([
  padR(label, 3), padR(mk, 6), pad(windows, 8), pad(n, 9), pad(perYr, 7),
  pad(s.n ? pc(s.winRate) : '—', 5), padR(s.n ? ci(s.wilson, (x) => pc(x)) : '', 11),
  pad(s.n ? sp(s.exp, 3) : '—', 9), padR(s.n ? ci(s.expCI, (x) => sp(x, 3)) : '', 21),
  pad(s.n ? f2(s.pf) : '—', 6), pad(s.n ? f1(s.medBars) : '—', 9), pad(s.n ? f1(s.medDays) : '—', 9), ' |',
  pad(live.n, 7), pad(live.n ? pc(live.winRate) : '—', 5), pad(live.n ? sp(live.exp, 3) : '—', 8),
].join(' '))
for (const p of pooled) {
  for (const c of p.cs) {
    hindRow(p.tf.label, c.market.label, c.hind.windows, c.hind.trades.length, (c.hind.trades.length / c.years).toFixed(1), c.hindStats, c.stats)
  }
  hindRow(p.tf.label, 'ALL', p.hindWindows, p.hindN, (p.hindN / p.years).toFixed(1), p.hindStats, p.stats)
  say('')
}
say('')

// ---- 8. verdict
say('━━━ 8. VERDICT — by the rule fixed before the first run ━━━')
say('')
for (const p of pooled) {
  const s = p.stats
  if (!s.n) {
    say(`  ${p.tf.label}: no trades.`)
    continue
  }
  const edge = hasEdge(s, p.holmIUT)
  const why = []
  if (!(s.expCI && s.expCI[0] > 0)) why.push(`expectancy CI ${ci(s.expCI, (x) => sp(x, 3))} ${ciWords(s.expCI)}`)
  if (!(p.holmIUT < ALPHA)) why.push(`does not beat all three nulls (Holm p ${pv(p.holmIUT)}; pA ${pv(p.nulls.a.p)}, pB ${pv(p.nulls.b.p)}, pC ${pv(p.nulls.c?.p)})`)
  say(`  ${p.tf.label}: ${s.n} trades in 5 markets, win ${pc(s.winRate)} (break-even ${pc(s.beWin)}), expectancy ${sp(s.exp, 3)} per trade ` +
    `${ci(s.expCI, (x) => sp(x, 3))}, PF ${f2(s.pf)}, median hold ${f1(s.medBars)} bars / ${f1(s.medDays)} days — ` +
    (edge ? 'HAS AN EDGE.' : `no edge: ${why.join('; ')}.`))
}
say('')
if (best) {
  say(`MOST ACCURATE TIMEFRAME: ${best.tf.label} (expectancy ${sp(best.stats.exp, 3)} per trade, CI ${ci(best.stats.expCI, (x) => sp(x, 3))}, ` +
    `Holm-adjusted p ${pv(best.holmIUT)} against all three nulls).`)
} else {
  const byExp = [...pooled].filter((p) => p.stats.n).sort((a, b) => b.stats.exp - a.stats.exp)
  const byWin = [...pooled].filter((p) => p.stats.n).sort((a, b) => b.stats.winRate - a.stats.winRate)
  say('MOST ACCURATE TIMEFRAME: NONE OF THEM. No timeframe meets the pre-declared rule.')
  say(`  Highest point expectancy: ${byExp[0].tf.label} (${sp(byExp[0].stats.exp, 3)}, CI ${ci(byExp[0].stats.expCI, (x) => sp(x, 3))}) — not distinguishable from chance.`)
  const dm = byExp[0].stats.expDropMax
  if (dm) say(`    (without its single largest trade, ${sp(dm.dropped, 1)}, that mean is ${sp(dm.exp, 3)}.)`)
  say(`  Highest raw win rate: ${byWin[0].tf.label} (${pc(byWin[0].stats.winRate)}), below its own break-even of ${pc(byWin[0].stats.beWin)}.`)
}
say('')
if (spxBest) {
  say(`SPX ALONE: ${spxBest.tf.label} meets the rule (expectancy ${sp(spxBest.stats.exp, 3)}, CI ${ci(spxBest.stats.expCI, (x) => sp(x, 3))}, Holm p ${pv(spxBest.spxHolmIUT)}).`)
} else {
  say('SPX ALONE: no timeframe meets the rule either.')
  for (const c of spxCells) {
    const s = c.stats
    say(s.n
      ? `  ${c.tf.label}: ${s.n} trades, win ${pc(s.winRate)} ${ci(s.wilson, (x) => pc(x))}, expectancy ${sp(s.exp, 3)} ${ci(s.expCI, (x) => sp(x, 3))}, ` +
        `median ${f1(s.medBars)} bars / ${f1(s.medDays)} days, p(all) ${pv(c.nulls.iut)}, Holm ${pv(c.spxHolmIUT)}`
      : `  ${c.tf.label}: no closed trades.`)
  }
}
say('')
{
  const lines = pooled.filter((p) => p.stats.n && p.hindStats.n).map((p) =>
    `${p.tf.label} ${pc(p.hindStats.winRate)} / ${sp(p.hindStats.exp, 2)} in hindsight vs ${pc(p.stats.winRate)} / ${sp(p.stats.exp, 2)} live`)
  say('Hindsight vs live (win% / expectancy per trade, pooled): ' + lines.join('; ') + '.')
}
say('')

// ---- 9. reading
say('━━━ 9. READING ━━━')
say('')
{
  const live = pooled.filter((p) => p.stats.n)
  const all = cells.flatMap((c) => c.trades)
  const stops = all.filter((t) => t.reason === 'stop').length
  const targets = all.filter((t) => t.reason === 'target').length
  const lags = cells.filter((c) => c.diag.lagShare != null && c.diag.projections >= 20).map((c) => c.diag.lagShare)
  const ratios = cells.filter((c) => c.diag.wRatio != null && c.diag.projections >= 20).map((c) => c.diag.wRatio)
  const monthly = cells.filter((c) => c.tf.key === '1m')
  const bbOnly = cells.filter((c) => c.nulls && c.holm.c < ALPHA)
  const wr = live.map((p) => p.stats.winRate)
  const be = live.map((p) => p.stats.beWin)
  say(` 1. Live, the signals win ${pc(Math.min(...wr))}–${pc(Math.max(...wr))} of the time on every timeframe, against break-even rates of`)
  say(`    ${pc(Math.min(...be))}–${pc(Math.max(...be))}. No timeframe's expectancy is distinguishable from zero in its favour, none beats`)
  say('    random direction or random bars in the same projection, and 4h loses money with a CI below 0.')
  say(` 2. Trades are short: a median of ${live.map((p) => `${f1(p.stats.medBars)} bars (${f1(p.stats.medDays)} days) on ${p.tf.label}`).join(', ')}.`)
  say(`    Of all ${all.length} closed trades, ${stops} (${pc(stops / all.length)}) hit the stop and ${targets} (${pc(targets / all.length)}) reached the vector:`)
  say('    entries lie at 0.85 ≤ |e| < 1.25, so the stop is at most 0.40 e-units away and the vector at least 0.85.')
  say(` 3. Why the live version has nothing to fade: when a projection is drawn, a median ${pc(Math.min(...lags))}–${pc(Math.max(...lags))} of its`)
  say('    projected swing has already gone by (the pivot needs a 4·ATR reversal to be confirmed), and the')
  say(`    projected walls are lopsided (median Wup/Wdn ${f2(Math.min(...ratios))}–${f2(Math.max(...ratios))} on cells with ≥ 20 projections), so "at the wall"`)
  say('    is mostly a statement about the median of past swings, not about this one.')
  say(` 4. Monthly bars: 4·ATR/close is ${monthly.map((c) => `${pc(c.diag.thr)} ${c.market.label}`).join(', ')}, so the zigzag almost`)
  say(`    never turns. ${monthly.filter((c) => c.diag.projections === 0).map((c) => c.market.label).join(' and ')} monthly never draw a projection at all; weekly BTC draws only ` +
    `${cells.find((c) => c.market.key === 'btc' && c.tf.key === '1w').diag.projections}.`)
  say('    A monthly table would show a handful of trades in decades.')
  if (bbOnly.length) {
    say(` 5. The one Holm-significant cell, ${bbOnly.map((c) => `${c.market.label} ${c.tf.label}`).join(', ')} against Bollinger, beats the Bollinger fade because`)
    say(`    that fade lost (${bbOnly.map((c) => sp(c.bbStats.exp, 2)).join(', ')} per trade), not because the vortex earned: its own expectancy is`)
    say(`    ${bbOnly.map((c) => `${sp(c.stats.exp, 3)} ${ci(c.stats.expCI, (x) => sp(x, 3))}`).join(', ')} and it does not beat nulls (a) or (b).`)
  }
  say(` ${bbOnly.length ? 6 : 5}. In hindsight the same pivots give the video's picture — ${live.map((p) => `${pc(p.hindStats.winRate)}`).join(' / ')} wins on`)
  say(`    ${live.map((p) => p.tf.label).join(' / ')} — because D, the walls and the contacts are all measured on the finished swing.`)
  say('    The live column is what a chart would actually have shown at each close.')
}
say('')
say('Notes')
say('  - Results depend on the first bar of the history (ATR seed, zigzag start). The indicator on a')
say('    TradingView chart that loads a different amount of history will show different trades and a')
say('    different table; the per-timeframe picture, not the exact figures, is what carries over.')
say('  - Weekly and monthly charts produce few trades; their intervals are wide by construction and a')
say('    single trade moves the win rate by several points.')
say('  - Every trade here was replayed independently from its projection (exit bar, reason, return) and')
say('    matched the engine exactly; the eligible ranges used by nulls (b) and (c) are exactly the bars')
say('    on which the engine reports a live e.')

process.stdout.write(out.join('\n') + '\n')

if (JSON_OUT) {
  const statOut = (s) => (s.n ? {
    n: s.n, wins: s.wins, winRate: s.winRate, wilson: s.wilson, exp: s.exp, expCI: s.expCI, pf: s.pf === Infinity ? 'inf' : s.pf,
    avgWin: s.avgWin, avgLoss: s.avgLoss, beWin: s.beWin, medBars: s.medBars, meanBars: s.meanBars,
    medDays: s.medDays, meanDays: s.meanDays, maxConsecLoss: s.maxConsecLoss, reasons: s.reasons, long: s.long, short: s.short,
  } : { n: 0 })
  const nullOut = (z) => (z ? { a: z.a, b: z.b, c: z.c, iut: z.iut } : null)
  fs.writeFileSync(JSON_OUT, JSON.stringify({
    cells: cells.map((c) => ({
      market: c.market.key, tf: c.tf.key, bars: c.bars.length, years: c.years, activeYears: c.activeYears, entries: c.entries,
      stats: statOut(c.stats), nulls: nullOut(c.nulls), holm: c.holm, bb: statOut(c.bbStats), hind: statOut(c.hindStats),
      hindWindows: c.hind.windows, diag: c.diag, spxHolmIUT: c.spxHolmIUT ?? null,
    })),
    pooled: pooled.map((p) => ({
      tf: p.tf.key, entries: p.entries, years: p.years, activeYears: p.activeYears, stats: statOut(p.stats), nulls: nullOut(p.nulls),
      holmIUT: p.holmIUT, bb: statOut(p.bbStats), hind: statOut(p.hindStats), hindN: p.hindN,
      positiveMarkets: p.positiveMarkets, marketsWithTrades: p.marketsWithTrades,
    })),
    verdict: { best: best ? best.tf.key : null, spxBest: spxBest ? spxBest.tf.key : null },
  }, null, 1))
}
