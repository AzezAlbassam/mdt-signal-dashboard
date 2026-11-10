// "Vortex Live" v1 — the causal, non-repainting version of the O → D vortex.
//
// engine/vortex.js reproduces the video's indicator, and it is hindsight-only: D, the walls
// and θ all need the end of the swing. This module keeps the same picture — a straight
// vector O → D, half-ellipse walls around it, position e between them, fade the wall — but
// builds every piece from what is known at the close of the bar being processed. The spec
// was fixed on 2026-10-03 before any per-timeframe result was seen, and is implemented here
// as written; nothing below is tuned.
//
//   1. pivots       ATR = Pine ta.atr(14). A zigzag whose reversal threshold is
//                   thr_t = 4·ATR_t / close_t, evaluated on the current bar, with the same
//                   state machine as zigzag() in engine/vortex.js. It starts on the first bar
//                   that has an ATR, so no pivot lies before that bar. A pivot exists from
//                   its CONFIRMATION bar onward, never earlier.
//   2. windows      when pivot k+1 is confirmed, window k → k+1 is complete: n bars,
//                   size |ln(P_k+1 / P_k)|, and for n ≥ 4 the wall ratios ru = Wup/|ΔP| and
//                   rd = Wdn/|ΔP| measured by buildVortex on that window.
//   3. projection   at the confirmation bar c of pivot O, from the last K = 5 windows:
//                   N = max(8, round(median n)), D = O·exp(∓ median size) against the swing
//                   that ended at O, Wup/Wdn = |D − O| × median ru/rd (over the windows that
//                   have them, at least 3), skip = round(3 % · N). It is live — for entries —
//                   until the next pivot is confirmed.
//   4. entry        on a bar close t ≥ c, flat, at most once per projection, with
//                   skip ≤ i ≤ N − skip (i = t − O's bar): 0.85 ≤ |e| < 1.25 → fade the wall at the
//                   close: long below the vector (e < 0), short above it (e > 0).
//   5. exit         on later closes, against the ENTRY projection: time once i > N − skip,
//                   else the stop at |e| ≥ 1.25 on the entry side, else the target, the vector
//                   (e back through 0). Filled at the close.
//   6. return       side·(exit − entry)/entry − cost. A win is a return above 0.
//   7.              one position at a time; an open trade keeps its own projection when a new
//                   one replaces it for entries.
//
// Everything is a single forward pass: createVortexLive() is a state machine fed one bar at a
// time, and runVortexLive() only feeds it. A bar is in no state the engine holds until it has
// been fed, so nothing computed at bar t can depend on a later bar — and nothing written at
// bar t is ever revised afterwards (test/vortex-live.test.js checks both on real data). This
// shape is deliberate: it is meant to be ported line for line to Pine v6, where the script
// body runs once per bar in the same way.
//
// Choices the spec leaves open, made once here and pinned by the tests:
//   - Order inside one bar: ATR → zigzag (pivot, window, projection) → exit of the open
//     trade → entry. So a trade can close and a new one open on the same close, and an entry
//     on the confirmation bar c already sees the new projection.
//   - The band's upper edge is the stop level (stopE), so an entry is never already stopped.
//   - Where a wall has zero width (shape 0 at the ends of a skip-0 projection, or a median
//     wall ratio of 0) e is ±∞ by the side of the vector, and 0 exactly on it. That never
//     makes an entry, and as an exit it reads as stop or target by which side price is on.
//   - A window whose two pivot prices are equal (only possible with ATR exactly 0) has no
//     wall ratios.
//   - A trade still open when the bars run out is reported as `open`, not as a trade.
//
// One consequence of keeping zigzag()'s state machine with a per-bar threshold: the next
// candidate starts on the CONFIRMING bar, and with a falling threshold an earlier bar since the
// pivot can have gone further without confirming it. So a pivot is not always the extreme
// between its neighbours (test: "the threshold is the CURRENT bar's").

import { ohlc4, buildVortex } from './vortex.js'

export const DEFAULTS = Object.freeze({
  atrLen: 14,
  atrMult: 4,
  K: 5,
  level: 0.85,
  stopE: 1.25,
  skipFrac: 0.03,
  minN: 8,
  cost: 0.0002,
})

/** A window shorter than this many bars gives n and size but no wall ratios. */
export const MIN_WALL_N = 4
/** A projection needs at least this many of its K windows to carry wall ratios. */
export const MIN_WALL_WINDOWS = 3

const SECONDS_PER_DAY = 86400

/** Median; for an even count, the mean of the two middle values. */
export function median(xs) {
  if (xs.length === 0) throw new RangeError('median of an empty list')
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---------------------------------------------------------------- 1. ATR and pivots

/**
 * Pine's ta.atr(length), one bar at a time: true range (high − low on the first bar, where
 * there is no previous close), then Wilder's RMA seeded by the simple mean of the first
 * `length` true ranges. `step` returns null until that seed exists (bar length − 1).
 */
export function createAtr(length = 14) {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError(`ATR length must be a positive integer, got ${length}`)
  }
  const alpha = 1 / length
  let prevClose = null
  let count = 0
  let sum = 0
  let value = null
  return {
    step(bar) {
      const tr =
        prevClose === null
          ? bar.h - bar.l
          : Math.max(Math.max(bar.h - bar.l, Math.abs(bar.h - prevClose)), Math.abs(bar.l - prevClose))
      prevClose = bar.c
      if (value === null) {
        sum += tr
        count += 1
        if (count === length) value = sum / length
      } else {
        value = alpha * tr + (1 - alpha) * value
      }
      return value
    },
  }
}

/** ta.atr(length) over a whole series: null before bar length − 1. */
export function atr14(bars, length = 14) {
  const atr = createAtr(length)
  return bars.map((b) => atr.step(b))
}

/**
 * The zigzag of engine/vortex.js, one bar at a time, with the threshold supplied per bar.
 * `step(t, bar, thr)` returns the pivot confirmed on bar t, or null. The first call only
 * starts the tracking (both extremes on that bar); confirmation is tested from the next bar.
 *
 *   initial phase   track the highest high and lowest low (first one on a tie); once the
 *                   later of the two has moved thr away from the earlier, the earlier is
 *                   the first pivot and the later becomes the candidate
 *   seeking a high  a higher high replaces the candidate; otherwise the candidate is
 *                   confirmed when low_t ≤ H·(1 − thr_t), and bar t becomes the low candidate
 *   seeking a low   a lower low replaces the candidate; otherwise it is confirmed when
 *                   high_t ≥ L·(1 + thr_t), and bar t becomes the high candidate
 */
export function createZigzag() {
  let started = false
  let dir = 0
  let hi = null
  let lo = null
  let cand = null
  const pivot = (p, kind, t) => ({ index: p.index, price: p.price, kind, confirmedAt: t })
  return {
    step(t, bar, thr) {
      if (!started) {
        started = true
        hi = { index: t, price: bar.h }
        lo = { index: t, price: bar.l }
        return null
      }
      if (dir === 0) {
        if (bar.h > hi.price) hi = { index: t, price: bar.h }
        if (bar.l < lo.price) lo = { index: t, price: bar.l }
        if (lo.index < hi.index && hi.price >= lo.price * (1 + thr)) {
          dir = 1
          cand = hi
          return pivot(lo, 'low', t)
        }
        if (hi.index < lo.index && lo.price <= hi.price * (1 - thr)) {
          dir = -1
          cand = lo
          return pivot(hi, 'high', t)
        }
        return null
      }
      if (dir === 1) {
        if (bar.h > cand.price) {
          cand = { index: t, price: bar.h }
        } else if (bar.l <= cand.price * (1 - thr)) {
          const p = pivot(cand, 'high', t)
          dir = -1
          cand = { index: t, price: bar.l }
          return p
        }
        return null
      }
      if (bar.l < cand.price) {
        cand = { index: t, price: bar.l }
      } else if (bar.h >= cand.price * (1 + thr)) {
        const p = pivot(cand, 'low', t)
        dir = 1
        cand = { index: t, price: bar.h }
        return p
      }
      return null
    },
  }
}

// ---------------------------------------------------------------- 2. completed windows

/**
 * The record of a completed swing a → b (two consecutive pivots): its length `n` in bars,
 * its size |ln(b/a)|, and — for n ≥ MIN_WALL_N — the walls buildVortex draws on it (price
 * pinned to the pivot prices at both ends, OHLC4 inside, skip = round(skipFrac·n)) as
 * fractions of |b − a|. Reads bars a.index..b.index only.
 */
export function measureWindow(bars, a, b, skipFrac = DEFAULTS.skipFrac) {
  const n = b.index - a.index
  const size = Math.abs(Math.log(b.price / a.price))
  let ru = null
  let rd = null
  if (n >= MIN_WALL_N && b.price !== a.price) {
    const v = buildVortex(bars, { o: a.index, d: b.index, oPrice: a.price, dPrice: b.price, skipFrac })
    const span = Math.abs(b.price - a.price)
    ru = v.Wup / span
    rd = v.Wdn / span
  }
  return { from: a.index, to: b.index, completedAt: b.confirmedAt, n, size, ru, rd }
}

// ---------------------------------------------------------------- 3. projection

/**
 * The geometry drawn at the confirmation bar of `pivot` (O) from `windows`, the swings
 * completed by then — the last one ends at O. Null when fewer than K windows exist or fewer
 * than MIN_WALL_WINDOWS of the last K carry wall ratios.
 */
export function project(pivot, windows, { K = DEFAULTS.K, minN = DEFAULTS.minN, skipFrac = DEFAULTS.skipFrac } = {}) {
  if (windows.length < K) return null
  const last = windows.slice(-K)
  const walled = last.filter((w) => w.ru !== null)
  if (walled.length < MIN_WALL_WINDOWS) return null

  const PO = pivot.price
  const falling = pivot.kind === 'high' // the swing that ended at O rose, so this one falls
  const N = Math.max(minN, Math.round(median(last.map((w) => w.n))))
  const m = median(last.map((w) => w.size))
  const PD = PO * Math.exp(falling ? -m : m)
  const span = Math.abs(PD - PO)
  return {
    confirmedAt: pivot.confirmedAt,
    iO: pivot.index,
    PO,
    N,
    PD,
    Wup: span * median(walled.map((w) => w.ru)),
    Wdn: span * median(walled.map((w) => w.rd)),
    skip: Math.round(skipFrac * N),
    falling,
  }
}

/**
 * Where `price` sits against projection `g` at i bars after O: the vector, the half-ellipse
 * shape, the deviation, the wall on that side (W·shape) and e = dev / wall.
 */
export function positionE(g, i, price) {
  const vector = g.PO + ((g.PD - g.PO) * i) / g.N
  const u = (2 * i) / g.N - 1
  const shape = Math.sqrt(Math.max(0, 1 - u * u))
  const dev = price - vector
  const W = dev > 0 ? g.Wup : g.Wdn
  const wall = W * shape
  let e
  if (wall > 0) e = dev / wall
  else e = dev > 0 ? Infinity : dev < 0 ? -Infinity : 0
  return { vector, shape, dev, wall, e }
}

// ---------------------------------------------------------------- 4–7. trades

/**
 * Entries and exits, one bar at a time. `step(t, bar, live)` takes the projection live for
 * entries at bar t (or null) and returns this bar's flags: `exit` (the reason, or null) for
 * the trade it closed, `buy` / `sell` for the one it opened, and `e`, the live projection's
 * position when i is inside [skip, N − skip] (else null). Projections are told apart by
 * identity, so "one entry per projection" needs no ids.
 */
export function createTrader({ level = DEFAULTS.level, stopE = DEFAULTS.stopE, cost = DEFAULTS.cost } = {}) {
  const trades = []
  let position = null
  let lastEntered = null

  return {
    trades,
    get open() {
      if (!position) return null
      const { side, entryIndex, entryPrice, eEntry, projection } = position
      return { side, entryIndex, entryPrice, eEntry, projection }
    },
    step(t, bar, live) {
      const ev = { buy: false, sell: false, exit: null, e: null }
      const price = ohlc4(bar)

      // 5. Exit, on closes after the entry bar, against the entry projection.
      if (position && t > position.entryIndex) {
        const g = position.g
        const i = t - g.iO
        let reason = null
        if (i > g.N - g.skip) {
          reason = 'time'
        } else {
          const { e } = positionE(g, i, price)
          if (position.side > 0 ? e <= -stopE : e >= stopE) reason = 'stop'
          else if (position.side > 0 ? e >= 0 : e <= 0) reason = 'target'
        }
        if (reason) {
          const exitPrice = bar.c
          const ret = (position.side * (exitPrice - position.entryPrice)) / position.entryPrice - cost
          const days =
            Number.isFinite(position.entryT) && Number.isFinite(bar.t) ? (bar.t - position.entryT) / SECONDS_PER_DAY : null
          trades.push({
            side: position.side,
            entryIndex: position.entryIndex,
            entryPrice: position.entryPrice,
            exitIndex: t,
            exitPrice,
            reason,
            ret,
            bars: t - position.entryIndex,
            days,
            eEntry: position.eEntry,
            projection: position.projection,
          })
          ev.exit = reason
          position = null
        }
      }

      // 4. Entry, against the live projection.
      if (live && t >= live.confirmedAt) {
        const i = t - live.iO
        if (i >= live.skip && i <= live.N - live.skip) {
          const { e } = positionE(live, i, price)
          ev.e = e
          const a = Math.abs(e)
          if (!position && lastEntered !== live && a >= level && a < stopE) {
            const side = e < 0 ? 1 : -1
            position = { side, entryIndex: t, entryPrice: bar.c, entryT: bar.t, eEntry: e, projection: live.id, g: live }
            lastEntered = live
            if (side > 0) ev.buy = true
            else ev.sell = true
          }
        }
      }
      return ev
    },
  }
}

// ---------------------------------------------------------------- the whole indicator

function checkOptions(o) {
  const posInt = (x) => Number.isInteger(x) && x >= 1
  if (!posInt(o.atrLen)) throw new RangeError(`atrLen must be a positive integer, got ${o.atrLen}`)
  if (!(o.atrMult > 0) || !Number.isFinite(o.atrMult)) throw new RangeError(`atrMult must be positive, got ${o.atrMult}`)
  if (!posInt(o.K) || o.K < MIN_WALL_WINDOWS) {
    throw new RangeError(`K must be an integer ≥ ${MIN_WALL_WINDOWS}, got ${o.K}`)
  }
  if (!(o.level > 0 && o.level < o.stopE) || !Number.isFinite(o.stopE)) {
    throw new RangeError(`need 0 < level < stopE, got level=${o.level} stopE=${o.stopE}`)
  }
  if (!(o.skipFrac >= 0 && o.skipFrac < 0.5)) throw new RangeError(`skipFrac must be in [0, 0.5), got ${o.skipFrac}`)
  if (!posInt(o.minN) || o.minN < 2) throw new RangeError(`minN must be an integer ≥ 2, got ${o.minN}`)
  if (!(o.cost >= 0) || !Number.isFinite(o.cost)) throw new RangeError(`cost must be ≥ 0, got ${o.cost}`)
}

/**
 * The indicator as a state machine. `step(bar)` processes the next bar (bars are {t, o, h,
 * l, c}; t in epoch seconds if calendar days are wanted) and returns its event:
 *
 *   { pivot: 'high' | 'low' | null,   a pivot was confirmed on this bar (pivots.at(-1))
 *     projection: boolean,            a new projection was drawn on this bar
 *     buy, sell: boolean,             an entry at this close
 *     exit: 'target' | 'stop' | 'time' | null,
 *     e: number | null }              the live projection's e, inside [skip, N − skip]
 *
 * `pivots`, `windows`, `projections`, `trades` and `events` only ever grow; `open` is the
 * position still running, if any.
 */
export function createVortexLive(options = {}) {
  const opts = { ...DEFAULTS, ...options }
  checkOptions(opts)

  const atr = createAtr(opts.atrLen)
  const zz = createZigzag()
  const trader = createTrader(opts)
  const seen = []
  const pivots = []
  const windows = []
  const projections = []
  const events = []
  let live = null

  return {
    options: opts,
    pivots,
    windows,
    projections,
    trades: trader.trades,
    events,
    get open() {
      return trader.open
    },
    step(bar) {
      if (![bar.o, bar.h, bar.l, bar.c].every(Number.isFinite) || !(bar.c > 0)) {
        throw new RangeError(`bar ${seen.length} needs finite o/h/l/c and a positive close`)
      }
      const t = seen.length
      seen.push(bar)
      const ev = { pivot: null, projection: false }

      // 1–3. Pivots, the window they complete, and the projection from the new pivot.
      const a = atr.step(bar)
      if (a !== null) {
        const thr = (opts.atrMult * a) / bar.c
        const p = zz.step(t, bar, thr)
        if (p) {
          pivots.push(p)
          ev.pivot = p.kind
          if (pivots.length >= 2) windows.push(measureWindow(seen, pivots.at(-2), p, opts.skipFrac))
          live = null // a new pivot ends the old projection's life for entries
          const g = project(p, windows, opts)
          if (g) {
            live = { id: projections.length, ...g }
            projections.push(live)
            ev.projection = true
          }
        }
      }

      // 4–7. Exit, then entry.
      Object.assign(ev, trader.step(t, bar, live))
      events.push(ev)
      return ev
    },
  }
}

/**
 * Run the indicator over `bars` in one forward pass. Returns the state after the last bar:
 * pivots [{index, price, kind, confirmedAt}], windows, projections [{id, confirmedAt, iO, PO,
 * N, PD, Wup, Wdn, skip, falling}], trades [{side, entryIndex, entryPrice, exitIndex,
 * exitPrice, reason, ret, bars, days, eEntry, projection}], open, and one event per bar.
 */
export function runVortexLive(bars, options = {}) {
  const vl = createVortexLive(options)
  for (const bar of bars) vl.step(bar)
  return {
    pivots: vl.pivots,
    windows: vl.windows,
    projections: vl.projections,
    trades: vl.trades,
    open: vl.open,
    events: vl.events,
  }
}

/**
 * The numbers the indicator's table shows for a list of closed trades: win rate (a win is
 * ret > 0), duration in bars and calendar days (median and mean), expectancy (mean ret) and
 * profit factor (gross wins ÷ gross losses; Infinity with no losses).
 */
export function tradeStats(trades) {
  const n = trades.length
  const reasons = { target: 0, stop: 0, time: 0 }
  if (n === 0) {
    return {
      n,
      wins: 0,
      winRate: null,
      expectancy: null,
      profitFactor: null,
      medianBars: null,
      meanBars: null,
      medianDays: null,
      meanDays: null,
      reasons,
    }
  }
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length
  const wins = trades.filter((x) => x.ret > 0).length
  const gain = trades.reduce((s, x) => s + Math.max(0, x.ret), 0)
  const loss = trades.reduce((s, x) => s + Math.max(0, -x.ret), 0)
  const days = trades.map((x) => x.days).filter((d) => d !== null)
  for (const x of trades) reasons[x.reason] += 1
  return {
    n,
    wins,
    winRate: wins / n,
    expectancy: mean(trades.map((x) => x.ret)),
    profitFactor: loss === 0 ? (gain > 0 ? Infinity : null) : gain / loss,
    medianBars: median(trades.map((x) => x.bars)),
    meanBars: mean(trades.map((x) => x.bars)),
    medianDays: days.length ? median(days) : null,
    meanDays: days.length ? mean(days) : null,
    reasons,
  }
}
