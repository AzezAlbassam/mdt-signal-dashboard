// The O → D vortex, given its fairest real-time chance.
//
// The video's indicator (engine/vortex.js) cannot be computed live: its D is the lowest low of
// ten months of data and its walls are sized from the window's own extremes, so every wall on
// screen was drawn with the "future" part already known. This script asks the only question
// with content: if D and the walls are FORECAST from completed history instead, does trading
// the wall contacts make money, and does it beat matched chance and a boring channel?
//
// The causal rule, applied at every confirmed zigzag pivot O (engine zigzag):
//
//   known at       the close of the bar that CONFIRMS O (the first bar whose zigzag run on
//                  bars[0..c] contains O) — not O's own bar, which is only known in hindsight
//   projected N    median duration (bars) of the previous K completed swings
//   projected D    O · exp(∓ median |ln size| of the previous K swings), direction opposite to
//                  the previous swing
//   walls          Wup = |D − O| · median(Wup/range), Wdn = |D − O| · median(Wdn/range) over the
//                  previous K completed windows, each measured with buildVortex on that window
//   e(j)           (OHLC4 − vector)/(W · shape) against that FIXED projected geometry
//   entry          first bar j with |e| ≥ contact level, inside the 3 %..97 % band of the
//                  projection, after O is confirmed and before the next pivot is confirmed
//                  (one projection is live at a time); fill at that bar's close; fade the wall:
//                  long at the lower wall (e < 0), short at the upper wall (e > 0)
//   exits          (i) e back to 0 (the vector), (ii) stop |e| ≥ 1.25 on the entry side,
//                  (iii) time stop at the projected D — all on bar closes
//
// Primary, declared before any trade was simulated: K = 5, contact level 0.85, and the middle
// zigzag threshold of each dataset (thresholds were picked from swing counts alone). Everything
// else is a sensitivity grid and is flagged for multiple comparisons. Grid B (skip entries that
// are already past the stop) and the variants were added after seeing grid A — exploratory.
//
// Data (defaults under VORTEX_DATA, each overridable): US500_1H_CSV → 2h NY buckets,
// US500_4H_CSV, SPX_1D_CSV = TVC:SPX daily, 5000 bars from 2006-11-15 (TradingView). Costs: 0.5
// index point round trip on US500, 0 on SPX daily.
//
// Nulls, each matched to the real trades:
//   (a) RANDOM DIRECTION  the same entries and exits, long/short by coin flip
//   (b) RANDOM BAR        one entry per traded window at a uniformly random bar of that window's
//                         search range, same fade-the-side rule and exits
//   (c) BOLLINGER         the same windows, search ranges and time stop, but the first close
//                         outside a 50-bar ±2σ channel, exits at the mid-band / 2.5σ
//
//   node scripts/vortex-forecast.js > reports/vortex-forecast.txt

import fs from 'node:fs'

import { ohlc4, buildVortex, zigzag } from '../engine/vortex.js'
import { seededRng } from '../engine/null-models.js'
import { wilsonInterval, bootstrapMean } from '../engine/stats.js'

const DATA_DIR = process.env.VORTEX_DATA ?? '/tmp/vortex/data'
const US500_1H = process.env.US500_1H_CSV ?? `${DATA_DIR}/us500_1h_pepperstone.csv`
const US500_4H = process.env.US500_4H_CSV ?? `${DATA_DIR}/us500_4h_pepperstone.csv`
const SPX_1D = process.env.SPX_1D_CSV ?? `${DATA_DIR}/tvc_spx_1d.csv`

const DRAWS = 5000
const SKIP_FRAC = 0.03 // "Ignore near O and D 3 %"
const STOP_E = 1.25
const KS = [3, 5, 8]
const LEVELS = [0.75, 0.85, 0.95]
const PRIMARY = { K: 5, level: 0.85 }
// 'literal' is the pre-declared entry: the first bar with |e| ≥ level, however far past it.
// 'in-band' (added after the first run showed many entries already past the stop) skips bars
// with |e| ≥ STOP_E. It is a post-hoc robustness check and is reported as one.
const RULES = ['literal', 'in-band']
const BB_PERIOD = 50
const BB_MULT = 2

// ---------------------------------------------------------------- data

function loadCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
  const idx = Object.fromEntries(lines[0].split(',').map((h, i) => [h.trim(), i]))
  return lines.slice(1).map((line) => {
    const f = line.split(',')
    return { t: Number(f[idx.t]), o: Number(f[idx.o]), h: Number(f[idx.h]), l: Number(f[idx.l]), c: Number(f[idx.c]) }
  })
}

const NY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** New York wall-clock time of a UTC epoch, encoded as if it were UTC. */
function nyLocal(t) {
  const p = Object.fromEntries(NY.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]))
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) / 1000
}

/**
 * 1h bars → 2h candles on New York even-hour boundaries, exactly as us500_2h_ny.json was built
 * for the reconstruction (t becomes the NY-local open time of the 2h candle).
 */
function bucket2hNY(h1) {
  const out = []
  for (const b of h1) {
    const d = new Date(nyLocal(b.t) * 1000)
    const hour = d.getUTCHours()
    const key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour - (hour % 2)) / 1000
    const last = out.at(-1)
    if (last && last.t === key) {
      last.h = Math.max(last.h, b.h)
      last.l = Math.min(last.l, b.l)
      last.c = b.c
    } else {
      out.push({ t: key, o: b.o, h: b.h, l: b.l, c: b.c })
    }
  }
  return out.map((b) => ({ ...b, ny: b.t }))
}

const withNy = (bars) => bars.map((b) => ({ ...b, ny: nyLocal(b.t) }))

const DATASETS = [
  {
    name: 'US500 2h',
    source: 'PEPPERSTONE:US500 1h → 2h NY buckets',
    bars: bucket2hNY(loadCsv(US500_1H)),
    intraday: true,
    cost: 0.5,
    thresholds: [0.015, 0.02, 0.03],
    primaryThr: 0.02,
  },
  {
    name: 'US500 4h',
    source: 'PEPPERSTONE:US500 4h',
    bars: withNy(loadCsv(US500_4H)),
    intraday: true,
    cost: 0.5,
    thresholds: [0.02, 0.03, 0.05],
    primaryThr: 0.03,
  },
  {
    name: 'SPX 1D',
    source: 'TVC:SPX daily (cash index)',
    bars: withNy(loadCsv(SPX_1D)),
    intraday: false,
    cost: 0,
    thresholds: [0.04, 0.06, 0.08],
    primaryThr: 0.06,
  },
]
for (const ds of DATASETS) {
  ds.label = (i) => {
    const s = new Date(ds.bars[i].ny * 1000).toISOString()
    return ds.intraday ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : s.slice(0, 10)
  }
}

// ---------------------------------------------------------------- small helpers

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length
const ellipse = (i, N) => Math.sqrt(Math.max(0, 1 - (2 * i / N - 1) ** 2))
const pValue = (nulls, actual) => (nulls.filter((x) => x >= actual - 1e-12).length + 1) / (nulls.length + 1)

// ---------------------------------------------------------------- swings, causally

/**
 * The bar at whose close each pivot is first known: the smallest c such that the engine's
 * zigzag run on bars[0..c] already contains pivot k. zigzag is online, so the pivot count of
 * a prefix never falls and a binary search finds c exactly.
 */
function confirmations(bars, pivots, threshold) {
  const count = (i) => zigzag(bars.slice(0, i + 1), threshold).length
  const conf = []
  let floor = 0
  for (let k = 0; k < pivots.length; k += 1) {
    let a = Math.max(floor, pivots[k].index + 1)
    let b = bars.length - 1
    while (a < b) {
      const m = (a + b) >> 1
      if (count(m) >= k + 1) b = m
      else a = m + 1
    }
    const seen = zigzag(bars.slice(0, a + 1), threshold)
    if (seen.length !== k + 1 || seen[k].index !== pivots[k].index || count(a - 1) !== k) {
      throw new Error(`confirmation of pivot ${k} is not where the engine says it is`)
    }
    conf.push(a)
    floor = a + 1
  }
  return conf
}

/** One record per completed swing pivots[j] → pivots[j+1], measured with the engine. */
function swingHistory(bars, pivots) {
  return pivots.slice(0, -1).map((a, j) => {
    const b = pivots[j + 1]
    const v = buildVortex(bars, { o: a.index, d: b.index, oPrice: a.price, dPrice: b.price, skipFrac: SKIP_FRAC })
    const range = Math.abs(b.price - a.price)
    const falling = b.price < a.price
    return {
      dur: b.index - a.index,
      logSize: Math.abs(Math.log(b.price / a.price)),
      up: v.Wup / range,
      dn: v.Wdn / range,
      lead: (falling ? v.Wdn : v.Wup) / range, // price running ahead of the vector
      lag: (falling ? v.Wup : v.Wdn) / range, // price lagging behind it
    }
  })
}

/**
 * The geometry a trader could draw at the close of the bar confirming pivot k, from the K
 * swings completed by then (pivots k−K … k). `orient` 'up-dn' is the literal rule (median
 * Wup/range and Wdn/range); 'lead-lag' pools by direction of travel instead.
 */
function project(ctx, k, K, orient = 'up-dn') {
  const { bars, pivots, conf, hist } = ctx
  const prev = hist.slice(k - K, k)
  const p = pivots[k].index
  const O = pivots[k].price
  const falling = pivots[k].kind === 'high'
  const Np = Math.max(2, Math.round(median(prev.map((s) => s.dur))))
  const Dp = O * Math.exp((falling ? -1 : 1) * median(prev.map((s) => s.logSize)))
  const range = Math.abs(Dp - O)
  let Wup
  let Wdn
  if (orient === 'lead-lag') {
    const lead = median(prev.map((s) => s.lead)) * range
    const lag = median(prev.map((s) => s.lag)) * range
    Wup = falling ? lag : lead
    Wdn = falling ? lead : lag
  } else {
    Wup = median(prev.map((s) => s.up)) * range
    Wdn = median(prev.map((s) => s.dn)) * range
  }
  const skip = Math.round(SKIP_FRAC * Np)
  const c = conf[k]
  const nextConf = k + 1 < conf.length ? conf[k + 1] : Infinity
  return {
    k,
    p,
    O,
    falling,
    Np,
    Dp,
    Wup,
    Wdn,
    skip,
    c,
    end: p + Np, // the projected D: the time stop
    from: Math.max(c, p + skip),
    to: Math.min(nextConf - 1, p + Np - Math.max(skip, 1), bars.length - 1),
  }
}

/** Position e at bar j against a fixed projected geometry — uses nothing after bar j. */
function eAt(bars, g, j) {
  const i = j - g.p
  const s = ellipse(i, g.Np)
  const dev = ohlc4(bars[j]) - (g.O + ((g.Dp - g.O) * i) / g.Np)
  const W = dev > 0 ? g.Wup : g.Wdn
  return s === 0 || W === 0 ? 0 : dev / s / W
}

// ---------------------------------------------------------------- trades

/**
 * Walk a position from its entry close. `sig(j)` is the signed wall coordinate (e, or the
 * Bollinger analogue). Exits on closes: back to 0, stop beyond STOP_E on the entry side, or
 * the time stop at `timeEnd`. A position still open when the data ends is closed at the last
 * bar and marked 'open'.
 */
function simulate(bars, entry, side, sig, timeEnd, cost) {
  const last = bars.length - 1
  let exit = Math.min(timeEnd, last)
  let reason = timeEnd <= last ? 'time' : 'open'
  for (let j = entry + 1; j <= Math.min(timeEnd, last); j += 1) {
    if (j === timeEnd) break
    const x = sig(j)
    if (side > 0 ? x >= 0 : x <= 0) {
      exit = j
      reason = 'vector'
      break
    }
    if (side > 0 ? x <= -STOP_E : x >= STOP_E) {
      exit = j
      reason = 'stop'
      break
    }
  }
  return trade(bars, entry, side, bars[exit].c, exit, reason, cost)
}

/**
 * Sensitivity: resting orders instead of closes — a limit at the vector and a stop at the
 * 1.25 wall, re-placed every bar from the fixed geometry. Gaps fill at the open; when one bar
 * spans both, the stop is taken (engine/trade.js's convention).
 */
function simulateIntrabar(bars, g, entry, side, cost) {
  const last = bars.length - 1
  for (let j = entry + 1; j <= Math.min(g.end, last); j += 1) {
    const b = bars[j]
    if (j === g.end) return trade(bars, entry, side, b.c, j, 'time', cost)
    const i = j - g.p
    const s = ellipse(i, g.Np)
    const vec = g.O + ((g.Dp - g.O) * i) / g.Np
    if (side > 0) {
      const stop = vec - STOP_E * g.Wdn * s
      if (b.l <= stop) return trade(bars, entry, side, Math.min(b.o, stop), j, 'stop', cost)
      if (b.h >= vec) return trade(bars, entry, side, Math.max(b.o, vec), j, 'vector', cost)
    } else {
      const stop = vec + STOP_E * g.Wup * s
      if (b.h >= stop) return trade(bars, entry, side, Math.max(b.o, stop), j, 'stop', cost)
      if (b.l <= vec) return trade(bars, entry, side, Math.min(b.o, vec), j, 'vector', cost)
    }
  }
  return trade(bars, entry, side, bars[last].c, last, 'open', cost)
}

function trade(bars, entry, side, exitPrice, exit, reason, cost) {
  const entryPrice = bars[entry].c
  const gross = side * (exitPrice - entryPrice)
  return { entry, exit, side, reason, entryPrice, exitPrice, gross, cost, net: gross - cost, ret: ((gross - cost) / entryPrice) * 100 }
}

/**
 * First contact of a projection: |e| ≥ level inside its search range. Variants (sensitivity
 * only): `inBand` skips bars already past the stop (|e| ≥ STOP_E); `fresh` additionally needs
 * the previous bar to have been inside the level.
 */
function firstContact(bars, g, level, { fresh = false, inBand = false } = {}) {
  for (let j = g.from; j <= g.to; j += 1) {
    const e = eAt(bars, g, j)
    if (Math.abs(e) < level) continue
    if (!fresh && !inBand) return { j, e }
    if (Math.abs(e) >= STOP_E) continue
    if (inBand) return { j, e }
    if (j > g.from && Math.abs(eAt(bars, g, j - 1)) < level) return { j, e }
  }
  return null
}

/** Bollinger coordinate b = (close − SMA)/(2σ) on a trailing 50-bar window, close-based. */
function bollinger(bars) {
  const b = new Array(bars.length).fill(null)
  for (let j = BB_PERIOD - 1; j < bars.length; j += 1) {
    let s = 0
    let s2 = 0
    for (let q = j - BB_PERIOD + 1; q <= j; q += 1) {
      s += bars[q].c
      s2 += bars[q].c ** 2
    }
    const m = s / BB_PERIOD
    const sd = Math.sqrt(Math.max(0, s2 / BB_PERIOD - m * m))
    b[j] = sd === 0 ? 0 : (bars[j].c - m) / (BB_MULT * sd)
  }
  return b
}

// ---------------------------------------------------------------- one configuration

function makeContext(ds, threshold) {
  const pivots = zigzag(ds.bars, threshold)
  const conf = confirmations(ds.bars, pivots, threshold)
  return { ds, threshold, bars: ds.bars, pivots, conf, hist: swingHistory(ds.bars, pivots) }
}

function projections(ctx, K, orient) {
  const out = []
  for (let k = K; k < ctx.pivots.length; k += 1) out.push(project(ctx, k, K, orient))
  return out
}

function runVortex(ctx, projs, level, { mode = 'close', fresh = false, inBand = false } = {}) {
  const { bars, ds } = ctx
  const trades = []
  for (const g of projs) {
    const hit = firstContact(bars, g, level, { fresh, inBand })
    if (!hit) continue
    const side = hit.e > 0 ? -1 : 1
    const t =
      mode === 'intrabar'
        ? simulateIntrabar(bars, g, hit.j, side, ds.cost)
        : simulate(bars, hit.j, side, (j) => eAt(bars, g, j), g.end, ds.cost)
    trades.push({ ...t, window: g, eEntry: hit.e })
  }
  return trades
}

/** Null (b)'s menu: the outcome of entering at every bar of each window's search range. */
function windowMenus(ctx, projs, mode = 'close') {
  const { bars, ds } = ctx
  const menus = new Map()
  for (const g of projs) {
    const rets = []
    for (let j = g.from; j <= g.to; j += 1) {
      const e = eAt(bars, g, j)
      if (e === 0) continue
      const side = e > 0 ? -1 : 1
      const t =
        mode === 'intrabar'
          ? simulateIntrabar(bars, g, j, side, ds.cost)
          : simulate(bars, j, side, (q) => eAt(bars, g, q), g.end, ds.cost)
      rets.push(t.ret)
    }
    menus.set(g.k, rets)
  }
  return menus
}

function runBollingerMatched(ctx, projs, b) {
  const { bars, ds } = ctx
  const trades = []
  for (const g of projs) {
    for (let j = g.from; j <= g.to; j += 1) {
      if (b[j] === null || Math.abs(b[j]) < 1) continue
      trades.push({ ...simulate(bars, j, b[j] > 0 ? -1 : 1, (q) => b[q] ?? 0, g.end, ds.cost), window: g })
      break
    }
  }
  return trades
}

/** Context only: every ±2σ close, one position at a time, time cap `hold` bars. */
function runBollingerStandalone(ctx, b, hold) {
  const { bars, ds } = ctx
  const trades = []
  for (let j = BB_PERIOD - 1; j < bars.length - 1; j += 1) {
    if (b[j] === null || Math.abs(b[j]) < 1) continue
    const t = simulate(bars, j, b[j] > 0 ? -1 : 1, (q) => b[q] ?? 0, j + hold, ds.cost)
    trades.push(t)
    j = t.exit
  }
  return trades
}

/** The video's version on the same swings: real D and walls from the window itself. NOT tradable. */
function runHindsight(ctx, K, level) {
  const { bars, ds, pivots } = ctx
  const trades = []
  for (let k = K; k + 1 < pivots.length; k += 1) {
    const a = pivots[k]
    const z = pivots[k + 1]
    const v = buildVortex(bars, { o: a.index, d: z.index, oPrice: a.price, dPrice: z.price, skipFrac: SKIP_FRAC, contactLevel: level })
    if (v.contacts.length === 0) continue
    const first = v.contacts[0]
    const side = first.side === 'short' ? -1 : 1
    trades.push({
      ...simulate(bars, a.index + first.start, side, (j) => v.e[j - a.index], z.index, ds.cost),
      falling: z.price < a.price,
    })
  }
  return trades
}

/**
 * A fade is of a LEAD when price had run ahead of the vector in the leg's own direction (below
 * it on a falling leg, above it on a rising one), of a LAG otherwise. The vector keeps moving
 * toward D, so a LEAD fade's target comes to meet it at a worse price.
 */
function splitLeadLag(trades) {
  const lead = []
  const lag = []
  for (const t of trades) {
    const falling = t.falling ?? t.window.falling
    ;((falling && t.side > 0) || (!falling && t.side < 0) ? lead : lag).push(t.ret)
  }
  return { lead, lag }
}

function leadLag(trades) {
  const { lead, lag } = splitLeadLag(trades)
  const fmt = (xs) => (xs.length ? `n ${xs.length}, mean ${sg(mean(xs))}%` : 'n 0')
  return `fades of a LEAD ${fmt(lead)};  fades of a LAG ${fmt(lag)}`
}

// ---------------------------------------------------------------- statistics

function describe(trades, seed) {
  const n = trades.length
  if (n === 0) return { n }
  const wins = trades.filter((t) => t.net > 0).length
  const rets = trades.map((t) => t.ret)
  const pts = trades.map((t) => t.net)
  const exits = { vector: 0, stop: 0, time: 0, open: 0 }
  for (const t of trades) exits[t.reason] += 1
  return {
    n,
    wins,
    winRate: wins / n,
    wilson: wilsonInterval(wins, n),
    exp: mean(rets),
    expCI: bootstrapMean(rets, { draws: DRAWS, rng: seededRng(seed) }),
    pts: mean(pts),
    ptsCI: bootstrapMean(pts, { draws: DRAWS, rng: seededRng(seed + 1) }),
    exits,
    hold: median(trades.map((t) => t.exit - t.entry)),
  }
}

/** (a) the same trades, direction by coin flip. Exits depend on e alone, so a flip negates the gross. */
function nullDirection(trades, actual, seed) {
  const rng = seededRng(seed)
  const draws = []
  for (let d = 0; d < DRAWS; d += 1) {
    let s = 0
    for (const t of trades) s += (((rng() < 0.5 ? 1 : -1) * t.gross - t.cost) / t.entryPrice) * 100
    draws.push(s / trades.length)
  }
  return { mean: mean(draws), p: pValue(draws, actual) }
}

/** (b) one random bar per traded window, same fade rule and exits. */
function nullRandomBar(trades, menus, actual, seed) {
  const rng = seededRng(seed)
  const lists = trades.map((t) => menus.get(t.window.k))
  const draws = []
  for (let d = 0; d < DRAWS; d += 1) {
    let s = 0
    for (const m of lists) s += m[Math.floor(rng() * m.length)]
    draws.push(s / lists.length)
  }
  return { mean: mean(draws), p: pValue(draws, actual) }
}

/** (c) vortex vs Bollinger: one-sided permutation p for mean(vortex) − mean(BB), plus a bootstrap CI. */
function compareMeans(a, b, seed) {
  if (a.length === 0 || b.length === 0) return null
  const rng = seededRng(seed)
  const obs = mean(a) - mean(b)
  const pool = [...a, ...b]
  const diffs = []
  for (let d = 0; d < DRAWS; d += 1) {
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    diffs.push(mean(pool.slice(0, a.length)) - mean(pool.slice(a.length)))
  }
  const boot = []
  for (let d = 0; d < DRAWS; d += 1) {
    let sa = 0
    let sb = 0
    for (let i = 0; i < a.length; i += 1) sa += a[Math.floor(rng() * a.length)]
    for (let i = 0; i < b.length; i += 1) sb += b[Math.floor(rng() * b.length)]
    boot.push(sa / a.length - sb / b.length)
  }
  boot.sort((x, y) => x - y)
  return { diff: obs, ci: [boot[Math.floor(0.025 * DRAWS)], boot[Math.floor(0.975 * DRAWS)]], p: pValue(diffs, obs) }
}

function holm(ps) {
  const order = ps.map((p, i) => [p, i]).filter(([p]) => p != null).sort((x, y) => x[0] - y[0])
  const out = ps.map(() => null)
  let run = 0
  order.forEach(([p, i], r) => {
    run = Math.max(run, Math.min(1, (order.length - r) * p))
    out[i] = run
  })
  return out
}

function benjaminiHochberg(ps) {
  const order = ps.map((p, i) => [p, i]).filter(([p]) => p != null).sort((x, y) => y[0] - x[0])
  const m = order.length
  const out = ps.map(() => null)
  let run = 1
  order.forEach(([p, i], r) => {
    run = Math.min(run, (p * m) / (m - r))
    out[i] = run
  })
  return out
}

// ---------------------------------------------------------------- formatting

const f2 = (x) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(2))
const sg = (x, d = 3) => (x == null || Number.isNaN(x) ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(d)}`)
const pc = (x, d = 0) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
const civ = (iv, f) => (iv ? `[${f(iv[0])}, ${f(iv[1])}]` : '—')
const pv = (p) => (p == null ? '—' : p < 0.001 ? '<.001' : p.toFixed(3))
const thrLabel = (x) => `${+(x * 100).toFixed(1)}%`
const exitsLabel = (x) => `${x.vector}/${x.stop}/${x.time}${x.open ? `+${x.open}o` : ''}`
const out = []
const say = (s = '') => out.push(s)

// ---------------------------------------------------------------- run

say('VORTEX — FORECAST-D CAUSAL VARIANT')
say('==================================')
say('')
say('Question: with D and the walls FORECAST from completed swings (nothing the screen could not')
say('have known at the time), does fading the wall contacts make money, beat matched chance, and')
say('beat a plain Bollinger channel? Generated by scripts/vortex-forecast.js.')
say('')
say('DATA')
for (const ds of DATASETS) {
  say(
    `  ${ds.name.padEnd(9)} ${ds.source.padEnd(40)} ${String(ds.bars.length).padStart(5)} bars  ` +
      `${ds.label(0)} → ${ds.label(ds.bars.length - 1)}   cost ${ds.cost} pt round trip`,
  )
}
say('  (2h = 1h bars bucketed on NY wall-clock even hours, identical to the reconstruction file.)')
say('')
say('PRE-DECLARED PRIMARY: K = 5 swings of history, contact level 0.85, zigzag threshold')
say(
  '  ' +
    DATASETS.map((ds) => `${ds.name} ${thrLabel(ds.primaryThr)} (grid ${ds.thresholds.map(thrLabel).join(' / ')})`).join(', '),
)
say('  Thresholds were chosen from swing counts alone, before any trade was simulated.')
say('  Grid A: K ∈ {3, 5, 8} × level ∈ {0.75, 0.85, 0.95} × 3 thresholds × 3 datasets = 81 cells.')
say('  Grid B: the same 81 cells with entries past the stop skipped — added AFTER seeing grid A (exploratory).')
say(`  Exits: e back to 0 | stop |e| ≥ ${STOP_E} | time stop at projected D. Fills at bar closes.`)
say(`  Every rate: Wilson 95 %. Every expectancy: percentile bootstrap 95 %, ${DRAWS} resamples.`)
say(`  Every p: one-sided (vortex better than the null), ${DRAWS} seeded draws, p = (#null ≥ obs + 1)/(draws + 1).`)
say('')

const results = []
const contexts = new Map()
const bbCache = new Map()

for (const ds of DATASETS) {
  const b = bollinger(ds.bars)
  bbCache.set(ds.name, b)
  for (const thr of ds.thresholds) {
    const ctx = makeContext(ds, thr)
    contexts.set(`${ds.name}|${thr}`, ctx)
    for (const K of KS) {
      const projs = projections(ctx, K)
      const menus = windowMenus(ctx, projs)
      const bbTrades = runBollingerMatched(ctx, projs, b)
      for (const level of LEVELS) {
        for (const rule of RULES) {
          const seed = Math.round(thr * 1e4) * 1000 + K * 100 + Math.round(level * 100) + (rule === 'literal' ? 0 : 7)
          const trades = runVortex(ctx, projs, level, { inBand: rule === 'in-band' })
          const d = describe(trades, seed)
          const row = { ds, thr, K, level, rule, projs, trades, d, bbTrades, menus }
          if (d.n > 0) {
            row.nullA = nullDirection(trades, d.exp, seed + 11)
            row.nullB = nullRandomBar(trades, menus, d.exp, seed + 13)
            row.bb = describe(bbTrades, seed + 17)
            row.cmp = compareMeans(trades.map((t) => t.ret), bbTrades.map((t) => t.ret), seed + 19)
          }
          row.primary = rule === 'literal' && K === PRIMARY.K && level === PRIMARY.level && thr === ds.primaryThr
          results.push(row)
        }
      }
    }
  }
}

// ---- swings and projection quality

const quality = []
const primaryNotes = []
say('SWINGS AND HOW GOOD THE FORECAST OF D WAS (K = 5)')
say('  "confirm lag" = bars from the pivot to the bar that confirms it, as a share of the projected N.')
say('  "N off ×" / "size off ×" = median factor by which the projection missed the real swing (1.00 = exact).')
say('  "expired" = projections whose 3 %..97 % band was over before O was even confirmed.')
const h0 = 'data       thr  swings  windows  med N  confirm lag   N off ×  within±25%   size off ×  within±25%  expired'
say(h0)
say('─'.repeat(h0.length))
for (const ds of DATASETS) {
  for (const thr of ds.thresholds) {
    const ctx = contexts.get(`${ds.name}|${thr}`)
    const projs = projections(ctx, 5)
    const lag = []
    const nErr = []
    const sErr = []
    let expired = 0
    for (const g of projs) {
      lag.push((g.c - g.p) / g.Np)
      if (g.from > g.to) expired += 1
      const nx = ctx.pivots[g.k + 1]
      if (!nx) continue
      nErr.push(Math.abs(Math.log(g.Np / (nx.index - g.p))))
      sErr.push(Math.abs(Math.log(Math.abs(Math.log(g.Dp / g.O)) / Math.abs(Math.log(nx.price / g.O)))))
    }
    const within = (xs) => xs.filter((x) => x <= Math.log(1.25)).length / xs.length
    quality.push({ ds, thr, nFactor: Math.exp(median(nErr)), sFactor: Math.exp(median(sErr)), nWithin: within(nErr) })
    say(
      [
        ds.name.padEnd(9),
        thrLabel(thr).padStart(5),
        String(ctx.pivots.length - 1).padStart(7),
        String(projs.length).padStart(8),
        String(median(ctx.hist.map((s) => s.dur))).padStart(6),
        pc(median(lag)).padStart(12),
        f2(Math.exp(median(nErr))).padStart(9),
        pc(within(nErr)).padStart(11),
        f2(Math.exp(median(sErr))).padStart(12),
        pc(within(sErr)).padStart(11),
        `${expired}/${projs.length}`.padStart(8),
      ].join(' '),
    )
  }
}
say('')

// ---- primary

const primaries = results.filter((r) => r.primary)
const holmA = holm(primaries.map((r) => r.nullA?.p ?? null))
const holmB = holm(primaries.map((r) => r.nullB?.p ?? null))
const holmC = holm(primaries.map((r) => r.cmp?.p ?? null))

say('PRIMARY RESULT (K = 5, level 0.85, middle threshold) — one row per dataset')
say('')
primaries.forEach((r, i) => {
  const { ds, d } = r
  const windows = r.projs.length
  const live = r.projs.filter((g) => g.from <= g.to).length
  say(`── ${ds.name}, zigzag ${thrLabel(r.thr)}: ${windows} projections (${live} with a live search range)`)
  if (d.n === 0) {
    say('   no contacts — nothing to test')
    say('')
    return
  }
  const beyond = r.trades.filter((t) => Math.abs(t.eEntry) >= STOP_E).length
  const atFirst = r.trades.filter((t) => t.entry === t.window.from).length
  say(
    `   contacts   ${d.n} of ${live} live windows = ${pc(d.n / live)} ${civ(wilsonInterval(d.n, live), (x) => pc(x))}` +
      `   (long ${r.trades.filter((t) => t.side > 0).length} / short ${r.trades.filter((t) => t.side < 0).length})`,
  )
  const stopsInProfit = r.trades.filter((t) => t.reason === 'stop' && t.net > 0).length
  say(
    `   entered at the first eligible bar: ${atFirst}/${d.n};  entered already past the ${STOP_E} stop: ${beyond}/${d.n}`,
  )
  say(
    `   win rate   ${d.wins}/${d.n} = ${pc(d.winRate, 1)} ${civ(d.wilson, (x) => pc(x, 1))}` +
      `   exits vector/stop/time = ${exitsLabel(d.exits)}   median hold ${d.hold} bars`,
  )
  say(`   e-stops that closed in profit: ${stopsInProfit}/${d.exits.stop}  (e is relative to a moving vector and wall)`)
  say(`   ${leadLag(r.trades)}`)
  say(
    `   expectancy ${sg(d.exp)}% per trade ${civ(d.expCI, (x) => sg(x))}` +
      `   = ${sg(d.pts, 1)} pts ${civ(d.ptsCI, (x) => sg(x, 1))} net of ${ds.cost} pt cost`,
  )
  say(`   (a) random direction   null mean ${sg(r.nullA.mean)}%   p = ${pv(r.nullA.p)}   Holm(3) ${pv(holmA[i])}`)
  say(`   (b) random bar         null mean ${sg(r.nullB.mean)}%   p = ${pv(r.nullB.p)}   Holm(3) ${pv(holmB[i])}`)
  say(
    `   (c) Bollinger matched  ${r.bb.n} trades, win ${pc(r.bb.winRate, 1)} ${civ(r.bb.wilson, (x) => pc(x, 1))}, ` +
      `exp ${sg(r.bb.exp)}% ${civ(r.bb.expCI, (x) => sg(x))}`,
  )
  say(
    `                          vortex − BB = ${sg(r.cmp.diff)}% ${civ(r.cmp.ci, (x) => sg(x))}   ` +
      `permutation p = ${pv(r.cmp.p)}   Holm(3) ${pv(holmC[i])}`,
  )

  // variants at the primary settings — sensitivity, not the pre-declared test
  const ctx = contexts.get(`${ds.name}|${r.thr}`)
  const seed = 900 + i * 10
  const llProjs = projections(ctx, PRIMARY.K, 'lead-lag')
  const hindsight = runHindsight(ctx, PRIMARY.K, PRIMARY.level)
  const ib = results.find((x) => x.rule === 'in-band' && x.ds === ds && x.thr === r.thr && x.K === r.K && x.level === r.level)
  const variants = [
    {
      name: 'fresh crosses only (previous bar inside 0.85, |e| < 1.25)',
      trades: runVortex(ctx, r.projs, PRIMARY.level, { fresh: true }),
      menus: r.menus,
      flip: true,
    },
    {
      name: 'intrabar orders (limit at vector, stop at the 1.25 wall)',
      trades: runVortex(ctx, r.projs, PRIMARY.level, { mode: 'intrabar' }),
      menus: windowMenus(ctx, r.projs, 'intrabar'),
      flip: false, // a flipped intrabar order set is not the mirror image, so no (a)
    },
    {
      name: 'lead/lag walls (wall ratios pooled by direction of travel)',
      trades: runVortex(ctx, llProjs, PRIMARY.level),
      menus: windowMenus(ctx, llProjs),
      flip: true,
    },
    {
      name: 'Bollinger standalone: every ±2σ close, cap = median N',
      trades: runBollingerStandalone(ctx, bbCache.get(ds.name), median(r.projs.map((g) => g.Np))),
    },
    { name: 'HINDSIGHT: real D + own walls (the video) — NOT tradable', trades: hindsight },
  ]
  say('   variants at these settings (sensitivity; p-values are NOT multiplicity-adjusted):')
  if (ib.d.n > 0) {
    say(
      `     ${'in-band contacts only (0.85 ≤ |e| < 1.25) — grid B row'.padEnd(58)} n ${String(ib.d.n).padStart(4)}  ` +
        `win ${pc(ib.d.winRate, 1).padStart(6)} ${civ(ib.d.wilson, (x) => pc(x)).padEnd(11)} exp ${sg(ib.d.exp).padStart(7)}% ` +
        `${civ(ib.d.expCI, (x) => sg(x)).padEnd(18)} pA ${pv(ib.nullA.p).padStart(5)} pB ${pv(ib.nullB.p).padStart(5)} ` +
        `pC ${pv(ib.cmp?.p)}`,
    )
  }
  for (const [vi, v] of variants.entries()) {
    const s = describe(v.trades, seed + vi)
    if (s.n === 0) {
      say(`     ${v.name.padEnd(58)} no trades`)
      continue
    }
    const pa = v.flip ? nullDirection(v.trades, s.exp, seed + vi + 50).p : null
    const pb = v.menus ? nullRandomBar(v.trades, v.menus, s.exp, seed + vi + 70).p : null
    say(
      `     ${v.name.padEnd(58)} n ${String(s.n).padStart(4)}  win ${pc(s.winRate, 1).padStart(6)} ` +
        `${civ(s.wilson, (x) => pc(x)).padEnd(11)} exp ${sg(s.exp).padStart(7)}% ${civ(s.expCI, (x) => sg(x)).padEnd(18)}` +
        (v.menus ? ` pA ${pv(pa).padStart(5)} pB ${pv(pb).padStart(5)}` : ''),
    )
  }
  say(`     hindsight: ${leadLag(hindsight)}`)
  say('')
  // same seed as its variant row above, so the two intervals print identically
  const hind = describe(hindsight, seed + variants.findIndex((v) => v.trades === hindsight))
  primaryNotes.push({ r, beyond, hind, hindLL: splitLeadLag(hindsight) })
})

// ---- grids: A = the pre-declared literal entry, B = the post-hoc in-band entry

const gridStats = {}

function printGrid(rule, title) {
  const rows = results.filter((r) => r.rule === rule)
  const qA = benjaminiHochberg(rows.map((r) => r.nullA?.p ?? null))
  const qB = benjaminiHochberg(rows.map((r) => r.nullB?.p ?? null))
  const qC = benjaminiHochberg(rows.map((r) => r.cmp?.p ?? null))

  say(title)
  say('  pA = random direction, pB = random bar in the same windows, pC = vortex vs matched Bollinger.')
  say(`  q = Benjamini–Hochberg across the ${rows.length} cells of this grid, per null. Expectancy is net % per trade.`)
  const h =
    'data       thr  K  lvl  trades  win%  [95% CI]        exp%     [95% CI]             pA     pB    BBexp%    pC  |  qA    qB    qC'
  say(h)
  say('─'.repeat(h.length))
  rows.forEach((r, i) => {
    const d = r.d
    const head = [
      `${r.ds.name.padEnd(9)}${r.primary ? '*' : ' '}`,
      thrLabel(r.thr).padStart(4),
      String(r.K).padStart(2),
      r.level.toFixed(2).padStart(4),
      String(d.n).padStart(6),
    ].join(' ')
    if (d.n === 0) {
      say(`${head}   no contacts`)
      return
    }
    say(
      [
        head,
        pc(d.winRate).padStart(5),
        civ(d.wilson, (x) => pc(x)).padEnd(11),
        sg(d.exp).padStart(9),
        civ(d.expCI, (x) => sg(x)).padEnd(18),
        pv(r.nullA.p).padStart(6),
        pv(r.nullB.p).padStart(6),
        (r.bb.n ? sg(r.bb.exp) : '—').padStart(8),
        pv(r.cmp?.p).padStart(6),
        ' |',
        pv(qA[i]).padStart(5),
        pv(qB[i]).padStart(5),
        pv(qC[i]).padStart(5),
      ].join(' '),
    )
  })

  const tested = rows.filter((r) => r.d.n > 0)
  const below = (get) => tested.filter((r) => (get(r) ?? 1) < 0.05).length
  const countQ = (qs) => qs.filter((q) => q != null && q < 0.05).length
  const s = {
    cells: tested.length,
    pA: below((r) => r.nullA.p),
    pB: below((r) => r.nullB.p),
    pC: below((r) => r.cmp?.p),
    qA: countQ(qA),
    qB: countQ(qB),
    qC: countQ(qC),
    positive: tested.filter((r) => r.d.exp > 0).length,
    ciAbove: tested.filter((r) => r.d.expCI[0] > 0).length,
    ciBelow: tested.filter((r) => r.d.expCI[1] < 0).length,
    beatRandomBar: tested.filter((r) => r.d.exp > r.nullB.mean).length,
    beatBB: tested.filter((r) => r.cmp && r.cmp.diff > 0).length,
  }
  gridStats[rule] = s
  say('')
  say(`  multiple comparisons: ${s.cells} cells with trades; p < 0.05 expected by chance alone ≈ ${(0.05 * s.cells).toFixed(1)} per null`)
  say(`    p < 0.05:    (a) ${s.pA}   (b) ${s.pB}   (c) ${s.pC}`)
  say(`    BH q < 0.05: (a) ${s.qA}   (b) ${s.qB}   (c) ${s.qC}`)
  say(
    `    positive net expectancy in ${s.positive}/${s.cells} cells; whole 95 % CI above 0 in ${s.ciAbove}, below 0 in ${s.ciBelow}; ` +
      `beats the random-bar null mean in ${s.beatRandomBar}/${s.cells}; beats matched Bollinger in ${s.beatBB}/${s.cells}`,
  )
  say('    Cells share data and overlap, so they are not independent; BH is valid under positive dependence.')
  say('')
}

printGrid('literal', 'GRID A — PRE-DECLARED ENTRY (first bar with |e| ≥ level), 81 cells; * = the primary')
printGrid(
  'in-band',
  'GRID B — POST-HOC ENTRY (first bar with level ≤ |e| < 1.25), 81 cells. Added after seeing grid A; treat as exploratory.',
)

// ---- the video's window, replayed causally

const ds2h = DATASETS[0]
const t0 = Date.UTC(2026, 1, 3, 2) / 1000
const t1 = Date.UTC(2026, 2, 30, 20) / 1000
const iO = ds2h.bars.findIndex((b) => b.ny === t0)
const iD = ds2h.bars.findIndex((b) => b.ny === t1)
say('THE VIDEO\'S WINDOW, REPLAYED IN REAL TIME — US500 2h, 2026-02-03 02:00 → 2026-03-30 20:00 NY')
say(`  video: O = ${ds2h.bars[iO].h} (bar ${iO}), D = ${ds2h.bars[iD].l} (bar ${iD}), N = ${iD - iO}; walls 428.76 / 397.41`)

function replay(ds, thr, K) {
  const ctx = contexts.get(`${ds.name}|${thr}`) ?? makeContext(ds, thr)
  const a = ds.bars.findIndex((b) => b.ny >= t0)
  const z = ds.bars.findIndex((b) => b.ny >= t1)
  say('')
  say(`  ── ${ds.name}, zigzag ${thrLabel(thr)}, K = ${K}`)
  // every pivot that is the latest confirmed one at some bar of [a, z]
  const near = ctx.pivots
    .map((pv2, k) => ({ ...pv2, k, conf: ctx.conf[k] }))
    .filter((x) => x.conf <= z && (x.k + 1 >= ctx.pivots.length || ctx.conf[x.k + 1] > a))
  const isO = ctx.pivots.find((x) => x.index === (ds === ds2h ? iO : -1))
  if (ds === ds2h) say(`     video's O (2026-02-03 02:00 high) is ${isO ? '' : 'NOT '}a zigzag pivot at this threshold`)
  const touches = []
  let expired = 0
  let noHistory = 0
  for (const x of near) {
    const where = `${x.kind.padEnd(4)} ${x.price.toFixed(1)} at ${ds.label(x.index)}, known ${ds.label(x.conf)}`
    if (x.k < K) {
      say(`     pivot ${where}: only ${x.k} completed swings of history → no projection possible`)
      noHistory += 1
      continue
    }
    const g = project(ctx, x.k, K)
    if (g.from > g.to) expired += 1
    const nx = ctx.pivots[x.k + 1]
    const dLabel = g.end < ds.bars.length ? ds.label(g.end) : `bar +${g.Np} (past data end)`
    say(`     pivot ${where}`)
    say(
      `        projects N ${g.Np} → D ${g.Dp.toFixed(1)} at ${dLabel}; walls up ${g.Wup.toFixed(1)} / down ${g.Wdn.toFixed(1)} pts` +
        (nx ? `;  actual: ${nx.price.toFixed(1)} at ${ds.label(nx.index)} (N ${nx.index - g.p})` : ';  actual: still forming'),
    )
    if (ds === ds2h && x.index === iO) {
      say(
        `        ↳ the video's own O. Drawn live it would show D ${g.Dp.toFixed(1)} at N ${g.Np} and walls ` +
          `${g.Wup.toFixed(1)} / ${g.Wdn.toFixed(1)}; the video shows D 6311.6 at N 475 and walls 428.76 / 397.41`,
      )
    }
    if (g.from > g.to) {
      say('        search range empty (band over, or next pivot confirmed first) → no trade')
      continue
    }
    say(`        live from ${ds.label(g.from)} to ${ds.label(g.to)}`)
    const hit = firstContact(ds.bars, g, PRIMARY.level)
    if (!hit) {
      say(`        no |e| ≥ ${PRIMARY.level} contact → no trade`)
      continue
    }
    const side = hit.e > 0 ? -1 : 1
    const t = simulate(ds.bars, hit.j, side, (j) => eAt(ds.bars, g, j), g.end, ds.cost)
    touches.push(t)
    say(
      `        CONTACT ${ds.label(hit.j)} e ${sg(hit.e, 2)} → ${side > 0 ? 'LONG' : 'SHORT'} at ${t.entryPrice.toFixed(1)}; ` +
        `exit ${ds.label(t.exit)} at ${t.exitPrice.toFixed(1)} (${t.reason}) → ${sg(t.net, 1)} pts net`,
    )
  }
  const inWin = touches.filter((t) => t.entry >= a && t.entry <= z)
  const net = inWin.reduce((s, t) => s + t.net, 0)
  say(
    `     trades entered inside the window: ${inWin.length}, net ${sg(net, 1)} pts ` +
      `(${sg(inWin.reduce((s, t) => s + t.ret, 0), 2)}% summed)`,
  )
  return { label: `${ds.name} ${thrLabel(thr)}`, n: inWin.length, net, projections: near.length, expired, noHistory }
}

const replays = [
  ...ds2h.thresholds.map((thr) => replay(ds2h, thr, PRIMARY.K)),
  replay(DATASETS[1], DATASETS[1].primaryThr, PRIMARY.K),
  replay(DATASETS[1], 0.05, PRIMARY.K), // the grid's largest 4h swings, nearest the video's scale
]
say('')

// ---- reading, computed from the numbers above

const spanOf = (xs, f) => `${f(Math.min(...xs))} to ${f(Math.max(...xs))}`
const primQ = quality.filter((q) => q.thr === q.ds.primaryThr)
const prim = primaries.map((r, i) => ({ r, hA: holmA[i], hB: holmB[i], hC: holmC[i] }))
const rawSig = prim.filter((x) => Math.min(x.r.nullA?.p ?? 1, x.r.nullB?.p ?? 1, x.r.cmp?.p ?? 1) < 0.05).length
const holmSig = prim.filter((x) => Math.min(x.hA ?? 1, x.hB ?? 1, x.hC ?? 1) < 0.05).length
const ciPos = prim.filter((x) => x.r.d.n > 0 && x.r.d.expCI[0] > 0).length
const gA = gridStats.literal
const gB = gridStats['in-band']

say('READING')
say(
  `  1. Pre-declared primary (K 5, level 0.85): ${ciPos}/3 datasets have a net expectancy whose 95 % CI is above 0; ` +
    `${rawSig}/3 have any raw p < 0.05 against nulls (a)/(b)/(c); ${holmSig}/3 survive Holm.`,
)
for (const x of prim) {
  const d = x.r.d
  say(
    `       ${x.r.ds.name.padEnd(9)} n ${String(d.n).padStart(3)}  exp ${sg(d.exp)}% ${civ(d.expCI, (v) => sg(v))}  ` +
      `pA ${pv(x.r.nullA?.p)}  pB ${pv(x.r.nullB?.p)} (random-bar mean ${sg(x.r.nullB?.mean)}%)  pC ${pv(x.r.cmp?.p)}`,
  )
}
say(
  `  2. Grid A (pre-declared entry): raw p < 0.05 in ${gA.pA}/${gA.pB}/${gA.pC} of ${gA.cells} cells for nulls a/b/c ` +
    `(≈ ${(0.05 * gA.cells).toFixed(1)} expected by chance); BH survivors ${gA.qA}/${gA.qB}/${gA.qC}. ` +
    `Positive expectancy in ${gA.positive}/${gA.cells}; beats the random-bar null in ${gA.beatRandomBar}/${gA.cells}.`,
)
say(
  `     Grid B (post-hoc in-band entry): raw p < 0.05 in ${gB.pA}/${gB.pB}/${gB.pC} of ${gB.cells}; BH survivors ` +
    `${gB.qA}/${gB.qB}/${gB.qC}. Positive expectancy in ${gB.positive}/${gB.cells}; beats the random-bar null in ` +
    `${gB.beatRandomBar}/${gB.cells}; beats matched Bollinger in ${gB.beatBB}/${gB.cells}.`,
)
const pocket = results.filter((r) => r.rule === 'in-band' && r.d.n > 0 && Math.min(r.nullA.p, r.nullB.p, r.cmp?.p ?? 1) < 0.05)
if (pocket.length) {
  say(
    `     Its raw p < 0.05 cells: ` +
      pocket.map((r) => `${r.ds.name} ${thrLabel(r.thr)} K${r.K} ${r.level} (pA ${pv(r.nullA.p)}, pB ${pv(r.nullB.p)}, pC ${pv(r.cmp?.p)})`).join('; ') +
      `. Adjacent cells reuse most of the same trades, so a cluster is one finding, not ${pocket.length}.`,
  )
}
say(
  `  3. The forecast of D is the weak link: at the primary thresholds the projected N misses the real swing by a median ` +
    `factor of ${spanOf(primQ.map((q) => q.nFactor), f2)} (within ±25 % only ${spanOf(primQ.map((q) => q.nWithin), (v) => pc(v))} ` +
    `of the time) and the size by ${spanOf(primQ.map((q) => q.sFactor), f2)}.`,
)
say(
  `     So the projected walls are often nowhere near price: ` +
    prim.map((x) => `${x.r.ds.name} ${primaryNotes.find((p) => p.r === x.r)?.beyond ?? 0}/${x.r.d.n}`).join(', ') +
    ` primary entries were already past the ${STOP_E} stop when the first contact fired.`,
)
const hindAllNeg = primaryNotes.every((p) => p.hind.n > 0 && p.hind.exp < 0)
const leadN = primaryNotes.reduce((s, p) => s + p.hindLL.lead.length, 0)
const allN = primaryNotes.reduce((s, p) => s + p.hind.n, 0)
const leadMeans = primaryNotes.filter((p) => p.hindLL.lead.length).map((p) => mean(p.hindLL.lead))
const lagMeans = primaryNotes.filter((p) => p.hindLL.lag.length).map((p) => mean(p.hindLL.lag))
const hindCiNeg = primaryNotes.filter((p) => p.hind.n > 0 && p.hind.expCI[1] < 0).map((p) => p.r.ds.name)
say(
  `  4. The HINDSIGHT version (real D, walls from the window itself — what the video draws), same entry and exits, ` +
    `${hindAllNeg ? 'has a NEGATIVE mean on all three datasets' : 'does not win reliably'} ` +
    `(95 % CI wholly below 0 on ${hindCiNeg.length ? hindCiNeg.join(', ') : 'none'}): ` +
    primaryNotes.map((p) => `${p.r.ds.name} ${sg(p.hind.exp)}% ${civ(p.hind.expCI, (v) => sg(v))}`).join('; ') +
    '.',
)
say(
  `     ${leadN}/${allN} of its first contacts fade price running AHEAD of the vector in the leg's own direction ` +
    `(mean ${spanOf(leadMeans, (v) => `${sg(v)}%`)} by dataset); the rarer LAG fades average ${spanOf(lagMeans, (v) => `${sg(v)}%`)}.`,
)
say('     The vector keeps moving toward D, so a LEAD fade\'s "return to the vector" exit meets it at a worse price. On screen')
say('     the contacts look like trades because the replay shows the extremes the walls were sized from.')
say('  5. The video\'s window, live (2026-02-03 → 2026-03-30), K 5, level 0.85, literal entry:')
for (const x of replays) {
  say(
    `       ${x.label.padEnd(14)} ${String(x.projections).padStart(2)} projections live in the window ` +
      `(${x.expired} with no live search range, ${x.noHistory} without enough history); ` +
      `${x.n} trades entered, net ${sg(x.net, 1)} pts`,
  )
}
const big = contexts.get(`${DATASETS[1].name}|0.05`)
const kLow = big.pivots.findIndex((x) => x.kind === 'low' && x.price === ds2h.bars[iD].l)
if (kLow >= PRIMARY.K + 1) {
  const hi = big.pivots[kLow - 1]
  const g = project(big, kLow - 1, PRIMARY.K)
  const L = (i) => DATASETS[1].label(i)
  say(
    `     At 4h 5 % the zigzag swing IS the video's leg: ${hi.price} (${L(hi.index)}) → ${big.pivots[kLow].price} ` +
      `(${L(big.pivots[kLow].index)}). Its high is confirmed only at ${L(g.c)}; the projection drawn then ` +
      `(N ${g.Np}, D ${g.Dp.toFixed(1)}) had already ended at ${L(g.end)}, so live there was nothing to trade.`,
  )
}
say('')

process.stdout.write(`${out.join('\n')}\n`)
