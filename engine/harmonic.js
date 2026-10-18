// Harmonic XABCD patterns: detection, PRZ, entry, stop, targets, and the trade that follows.
//
// Every rule here is PROTOCOL-harmonic.md §1, which was frozen before any bar was
// downloaded. Nothing in this file may be tuned to make a result look better; a change
// after results exist is post-hoc and is labelled as such in the report.
//
// THE ONE IDEA THAT MAKES THE REST SIMPLE
// A bearish pattern is a bullish pattern in a mirror. So everything below works in
// "v-space": v = s · price, with s = +1 for a bullish setup and s = −1 for a bearish one.
// In v-space the completion point is always a LOW, every projection is always "down from a
// reference", and every rule is written once. Converting back is one multiply.
//
// WHAT IS KNOWN WHEN
// A pattern is registered on the bar that CONFIRMS its second-to-last pivot (C). At that
// moment X, A, B and C are all confirmed pivots and the PRZ, the entry, the stop and the
// four targets are fully determined — nothing about D is needed, because D is exactly what
// the PRZ predicts. Scanning for the entry starts on the NEXT bar. That is what makes this
// non-repainting, and it is also what real harmonic trading does: a limit order in the zone.

import { atr14, createZigzag } from './vortex-live.js'

// ------------------------------------------------------------------ frozen constants §1

export const K_PIVOT = 1.5 // zigzag threshold in ATR14 units
export const TOL = 0.05 // relative tolerance on a point ratio
export const STOP_ATR = 0.25 // stop buffer beyond the far edge of the PRZ
export const HORIZON = 60 // bars a trade may run before it is marked to the close
export const MIN_ENTRY_WINDOW = 10 // floor on the bars allowed for the PRZ to be touched
export const TARGETS = [0.382, 0.618] // T1, T2 as retracements of the AD leg

/** A point ratio r becomes the window [r(1−TOL), r(1+TOL)]; a published range is used as is. */
export const pt = (r) => [r * (1 - TOL), r * (1 + TOL)]

// ------------------------------------------------------------------ the pattern table §1.5
//
// points  how many consecutive confirmed pivots the pattern spans; index 0 is the first
//         point and the LAST index is the completion point D (the entry).
// ratios  structural constraints, all checkable once the second-to-last pivot is confirmed:
//         |P[a0]−P[a1]| / |P[b0]−P[b1]| must lie in [min, max].
// prz     the projections whose overlap IS the PRZ. Each is "from P[ref], a distance of
//         [min, max] × |P[b0]−P[b1]|, in the completion direction".
// breach  structural rules in v-space (where the completion point is always a low):
//         [i, 'gt'|'lt', j] means v[i] must be greater/less than v[j].
//
// Sources and the disagreements behind each number: PROTOCOL-harmonic.md §1.5.

export const PATTERNS = [
  {
    name: 'Gartley',
    pivots: 4, // X A B C confirmed; D is what the PRZ predicts
    ratios: [
      { a: [1, 2], b: [0, 1], min: pt(0.618)[0], max: pt(0.618)[1] }, // AB / XA
      { a: [2, 3], b: [1, 2], min: 0.382, max: 0.886 }, // BC / AB
    ],
    prz: [
      { ref: 1, b: [0, 1], min: pt(0.786)[0], max: pt(0.786)[1] }, // D = 0.786 XA from A
      { ref: 3, b: [2, 3], min: 1.13, max: 1.618 }, // BC projection from C
    ],
    confluence: { ref: 3, b: [1, 2], min: pt(1.0)[0], max: pt(1.0)[1] }, // AB=CD, 1:1
    breach: [[2, 'gt', 0], [3, 'lt', 1]], // B holds above X; C stays below A
  },
  {
    name: 'Bat',
    pivots: 4,
    ratios: [
      { a: [1, 2], b: [0, 1], min: 0.382, max: 0.5 },
      { a: [2, 3], b: [1, 2], min: 0.382, max: 0.886 },
    ],
    prz: [
      { ref: 1, b: [0, 1], min: pt(0.886)[0], max: pt(0.886)[1] },
      { ref: 3, b: [2, 3], min: 1.618, max: 2.618 },
    ],
    confluence: { ref: 3, b: [1, 2], min: pt(1.27)[0], max: pt(1.27)[1] }, // extended AB=CD
    breach: [[2, 'gt', 0], [3, 'lt', 1]],
  },
  {
    name: 'AltBat',
    pivots: 4,
    ratios: [
      { a: [1, 2], b: [0, 1], min: 0, max: 0.382 },
      { a: [2, 3], b: [1, 2], min: 0.382, max: 0.886 },
    ],
    prz: [
      { ref: 1, b: [0, 1], min: pt(1.13)[0], max: pt(1.13)[1] }, // D beyond X
      { ref: 3, b: [2, 3], min: 2.0, max: 3.618 }, // floor is sourced; the cap is ours
    ],
    confluence: { ref: 3, b: [1, 2], min: pt(1.618)[0], max: pt(1.618)[1] },
    breach: [[2, 'gt', 0], [3, 'lt', 1]],
  },
  {
    name: 'Butterfly',
    pivots: 4,
    ratios: [
      { a: [1, 2], b: [0, 1], min: pt(0.786)[0], max: pt(0.786)[1] },
      { a: [2, 3], b: [1, 2], min: 0.382, max: 0.886 },
    ],
    prz: [
      { ref: 1, b: [0, 1], min: pt(1.27)[0], max: pt(1.27)[1] },
      { ref: 3, b: [2, 3], min: 1.618, max: 2.24 },
    ],
    confluence: { ref: 3, b: [1, 2], min: pt(1.27)[0], max: pt(1.27)[1] },
    breach: [[2, 'gt', 0], [3, 'lt', 1]],
  },
  {
    name: 'Crab',
    pivots: 4,
    ratios: [
      { a: [1, 2], b: [0, 1], min: 0.382, max: 0.618 },
      { a: [2, 3], b: [1, 2], min: 0.382, max: 0.886 },
    ],
    prz: [
      { ref: 1, b: [0, 1], min: pt(1.618)[0], max: pt(1.618)[1] },
      { ref: 3, b: [2, 3], min: 2.618, max: 3.618 },
    ],
    confluence: { ref: 3, b: [1, 2], min: pt(1.27)[0], max: pt(1.618)[1] }, // 1.27 or 1.618
    breach: [[2, 'gt', 0], [3, 'lt', 1]],
  },
  {
    name: 'DeepCrab',
    pivots: 4,
    ratios: [
      { a: [1, 2], b: [0, 1], min: pt(0.886)[0], max: pt(0.886)[1] },
      { a: [2, 3], b: [1, 2], min: 0.382, max: 0.886 },
    ],
    prz: [
      { ref: 1, b: [0, 1], min: pt(1.618)[0], max: pt(1.618)[1] },
      { ref: 3, b: [2, 3], min: 2.24, max: 3.618 },
    ],
    // 1.272, never 1.0: the Deep Crab's embedded AB=CD is an extended one, and sources are
    // explicit that the 1.618 AB=CD is NOT required for it.
    confluence: { ref: 3, b: [1, 2], min: pt(1.272)[0], max: pt(1.272)[1] },
    breach: [[2, 'gt', 0], [3, 'lt', 1]],
  },
  {
    name: 'Cypher',
    pivots: 4,
    ratios: [
      { a: [1, 2], b: [0, 1], min: 0.382, max: 0.618 },
      // "C extends to 1.272-1.414 of the XA swing leg" is a statement about where C SITS,
      // measured from X — not about the length of the BC leg. Writing it as a leg ratio
      // (|BC|/|XA|) describes a different shape entirely and finds almost no Cyphers.
      { a: [0, 3], b: [0, 1], min: 1.272, max: 1.414 },
    ],
    prz: [
      { ref: 3, b: [0, 3], min: pt(0.786)[0], max: pt(0.786)[1] }, // D = 0.786 of XC
    ],
    breach: [[2, 'gt', 0], [3, 'gt', 1]], // C must break BEYOND A
  },
  {
    name: 'Shark',
    pivots: 4, // Carney's O X A B, with his C the completion the PRZ predicts
    ratios: [
      { a: [2, 3], b: [1, 2], min: 1.13, max: 1.618 }, // AB extends XA
    ],
    prz: [
      { ref: 3, b: [2, 3], min: 1.618, max: 2.24 }, // BC projection of AB
      { ref: 1, b: [0, 1], min: 0.886, max: 1.13 }, // the 0.886–1.13 OX band
    ],
    breach: [[3, 'gt', 1]], // B terminates beyond X: an impulse, not a retracement
  },
  {
    name: 'FiveZero',
    pivots: 4, // X A B C confirmed (Carney's leading 0 is unconstrained and is not required)
    ratios: [
      { a: [1, 2], b: [0, 1], min: 1.13, max: 1.618 },
      { a: [2, 3], b: [1, 2], min: 1.618, max: 2.24 },
    ],
    prz: [
      { ref: 3, b: [2, 3], min: pt(0.5)[0], max: pt(0.5)[1] }, // the 50% of BC
      { ref: 3, b: [1, 2], min: pt(1.0)[0], max: pt(1.0)[1] }, // reciprocal AB=CD
    ],
    // B breaks BEYOND X. In the bullish 5-0 the sequence is X low, A high, B low, C high, so
    // "beyond X" means below it — the opposite sense from the Shark, where X is a high.
    breach: [[2, 'lt', 0]],
  },
  {
    name: 'ABCD',
    pivots: 3, // A B C confirmed; D is the completion
    ratios: [
      { a: [1, 2], b: [0, 1], min: 0.382, max: 0.886 }, // C retraces AB
    ],
    prz: [
      { ref: 2, b: [0, 1], min: pt(1.0)[0], max: pt(1.0)[1] }, // CD = AB
      { ref: 2, b: [1, 2], min: 1.13, max: 2.618 }, // BC projection
    ],
    breach: [[2, 'lt', 0]], // C stays below A
  },
  {
    name: 'ThreeDrives',
    pivots: 5, // start, drive 1, retrace, drive 2, retrace; drive 3 is the completion
    ratios: [
      { a: [1, 2], b: [0, 1], min: 0.618, max: 0.786 },
      { a: [2, 3], b: [1, 2], min: 1.27, max: 1.618 },
      { a: [3, 4], b: [2, 3], min: 0.618, max: 0.786 },
    ],
    prz: [{ ref: 4, b: [3, 4], min: 1.27, max: 1.618 }],
    breach: [],
  },
]

/**
 * The §6 variant: put each pattern's AB=CD projection back INTO the PRZ overlap.
 *
 * Why it is a variant and not the default. Carney requires the AB=CD to converge with the
 * other projections, but the sources that state a number say the extension patterns "usually"
 * use theirs, and taking "usually" as a hard filter has a geometric consequence that is easy
 * to miss: a Bat with B at 0.382 of XA cannot satisfy a 1.27 AB=CD and an 0.886 XA at the
 * same time at any C whatever, so that whole half of the Bat's own B window would vanish.
 * Filtering some patterns harder than others would also bias the one comparison this study
 * exists to make. So the default PRZ is the overlap of the projections every pattern has, and
 * the stricter reading is reported beside it.
 */
export const withConfluence = (specs = PATTERNS) =>
  specs.map((s) => (s.confluence ? { ...s, prz: [...s.prz, s.confluence] } : s))

// ------------------------------------------------------------------ geometry

const leg = (v, [i, j]) => Math.abs(v[i] - v[j])

/**
 * The PRZ in v-space as [lo, hi], or null when the projections do not overlap.
 * Overlap is the convergence requirement that defines a harmonic pattern (§1.4.4) — a set of
 * projections that never meet is not a pattern, however pretty the legs look.
 */
export function przOf(spec, v) {
  let lo = -Infinity
  let hi = Infinity
  for (const p of spec.prz) {
    const base = leg(v, p.b)
    const l = v[p.ref] - p.max * base
    const h = v[p.ref] - p.min * base
    if (l > lo) lo = l
    if (h < hi) hi = h
  }
  return lo <= hi ? [lo, hi] : null
}

/** Does this run of pivots satisfy every structural rule of `spec`? */
export function structureOk(spec, v) {
  for (const r of spec.ratios) {
    const den = leg(v, r.b)
    if (!(den > 0)) return false
    const ratio = leg(v, r.a) / den
    if (ratio < r.min || ratio > r.max) return false
  }
  for (const [i, cmp, j] of spec.breach) {
    if (cmp === 'gt' ? !(v[i] > v[j]) : !(v[i] < v[j])) return false
  }
  return true
}

/**
 * Every pattern completed by the pivot run ending at `pivots.at(-1)`, which must be the pivot
 * just confirmed. `pivots` are in confirmation order with alternating kinds.
 *
 * The run's first pivot decides the direction and there is nothing to choose: pivots alternate,
 * so a run starting at a low can only be a bullish setup and one starting at a high only a
 * bearish one.
 */
export function patternsAt(pivots, specs = PATTERNS) {
  const out = []
  for (const spec of specs) {
    const n = spec.pivots
    if (pivots.length < n) continue
    const run = pivots.slice(-n)
    // Direction is fixed by the LAST confirmed pivot, not the first. The completion point is
    // always a low in the bullish form, so the pivot before it must be a high. Keying off the
    // first pivot gives the same answer only when the run has an even length — it silently
    // inverts the three-pivot AB=CD and the five-pivot Three Drives, which is why those two
    // found nothing at all until a detection count was checked.
    const s = run[run.length - 1].kind === 'high' ? 1 : -1
    const v = run.map((p) => s * p.price)
    if (!structureOk(spec, v)) continue
    const prz = przOf(spec, v)
    if (!prz) continue
    out.push({
      pattern: spec.name,
      side: s === 1 ? 'long' : 'short',
      s,
      points: run.map((p) => ({ index: p.index, price: p.price })),
      confirmedAt: run[run.length - 1].confirmedAt,
      przLo: prz[0], // v-space, far edge
      przHi: prz[1], // v-space, near edge — the one price meets first
      // The targets are retracements of the AD leg, so the anchor is the point the retraced
      // move started from: A, which is the run's second pivot in an XABCD and its first in
      // the three-pivot ABCD.
      vA: v[n === 3 ? 0 : 1],
      vC: v[n - 1], // the pivot just confirmed: price through it kills the structure
      vX: v[0], // only used by the §6 "stop beyond X" variant
    })
  }
  return out
}

/** The pivot stream of a series: confirmed, alternating, never revised. §1.1 */
export function pivotStream(bars, kPivot = K_PIVOT) {
  const atr = atr14(bars)
  const zz = createZigzag()
  const pivots = []
  for (let t = 0; t < bars.length; t += 1) {
    const a = atr[t]
    const thr = a === null ? null : (kPivot * a) / bars[t].c
    const p = thr === null || !(thr > 0) ? null : zz.step(t, bars[t], thr)
    if (p) pivots.push(p)
  }
  return { pivots, atr }
}

// ------------------------------------------------------------------ the trade §1.6

/**
 * Follow one registered pattern forward: wait for the PRZ, then run the trade.
 * Returns the trade, or {filled:false, reason} when the pattern never traded.
 *
 * Reads bars strictly after `confirmedAt`, so nothing here can see the bar that registered it.
 */
export function runPattern(p, bars, atr, {
  horizon = HORIZON,
  stopAtr = STOP_ATR,
  // Everything below defaults to the frozen §1 rule. The other settings exist only to
  // produce the §6 variants, which are reported and are never a verdict.
  stopAt = 'prz', // 'prz' = beyond the far edge | 'x' = beyond X, whichever is further
  targetLeg = 'AD', // 'AD' = retracements of A->entry | 'CD' = of C->entry
  windowMult = 1, // multiples of the pattern's own length allowed for the PRZ to be touched
  entryMode = 'limit', // 'limit' = fill on touch | 'confirm' = wait for a bar closing against the trend
  exitTarget = 't1', // which target ends the trade
} = {}) {
  const s = p.s
  const vLow = (b) => (s === 1 ? s * b.l : -b.h)
  const vHigh = (b) => (s === 1 ? s * b.h : -b.l)
  const vOpen = (b) => s * b.o
  const vClose = (b) => s * b.c

  const start = p.confirmedAt + 1
  const xIndex = p.points[0].index
  const cIndex = p.points[p.points.length - 1].index
  // No source fixes how long a PRZ may wait to be touched (PROTOCOL §1.6). The rule: the
  // structure gets as many bars as it took to build, floored at MIN_ENTRY_WINDOW.
  const window = Math.max(MIN_ENTRY_WINDOW, Math.round(windowMult * (cIndex - xIndex)))

  let entryAt = null
  let entryV = null
  let t = start
  let touched = false
  for (; t < bars.length && t <= start + window; t += 1) {
    const b = bars[t]
    if (vHigh(b) > p.vC) return { filled: false, reason: 'broke-C', at: t } // structure gone
    if (vLow(b) <= p.przHi) touched = true
    if (!touched) continue
    if (entryMode === 'limit') {
      entryAt = t
      entryV = Math.min(p.przHi, vOpen(b)) // a gap through the limit fills at the open
      break
    }
    // Carney's confirmation: once the zone is reached, wait for a bar that closes against
    // the trend that brought price here, and take its close.
    if (vClose(b) > vOpen(b)) {
      entryAt = t
      entryV = vClose(b)
      break
    }
  }
  // Running out of bars is not the same as running out of time: a pattern whose window is
  // still open at the last bar is live, and belongs in the forward log rather than the bin.
  if (entryAt === null) return { filled: false, reason: t >= bars.length ? 'pending' : 'expired' }

  // ATR of the last CLOSED bar before entry: nothing from inside the entry bar is used.
  const a = atr[entryAt - 1] ?? atr[entryAt]
  if (!(a > 0)) return { filled: false, reason: 'no-atr' }

  // 'x' takes whichever of the far edge and X is further away — for a Butterfly or a Crab
  // the completion is already beyond X, so X alone would be the tighter stop, not the wider.
  const stopBase = stopAt === 'x' ? Math.min(p.przLo, p.vX) : p.przLo
  const stopV = stopBase - stopAtr * a
  const risk = entryV - stopV
  if (!(risk > 0)) return { filled: false, reason: 'no-risk' }

  const legTop = targetLeg === 'CD' ? p.vC : p.vA
  const span = legTop - entryV // positive: the leg's origin is above the completion
  const t1V = entryV + TARGETS[0] * span
  const t2V = entryV + TARGETS[1] * span
  const levels = { t1: t1V, t2: t2V, t3: p.vC, t4: p.vA }
  const goalV = exitTarget === 't2' ? t2V : t1V

  let exitV = null
  let exitAt = null
  let outcome = null
  let best = entryV
  for (let t = entryAt; t < bars.length && t <= entryAt + horizon; t += 1) {
    const b = bars[t]
    if (vHigh(b) > best) best = vHigh(b)
    // Intrabar order is unknown, so the stop is taken when one bar covers both. §1.6
    if (vLow(b) <= stopV) { exitV = stopV; exitAt = t; outcome = 'stop'; break }
    if (vHigh(b) >= goalV) { exitV = goalV; exitAt = t; outcome = exitTarget === 't2' ? 't2' : 't1'; break }
    if (t === entryAt + horizon) { exitV = vClose(b); exitAt = t; outcome = 'timeout' }
  }
  // Still running when the data ended: not a result, but a live trade for the forward log.
  if (exitV === null) return { filled: false, reason: 'open', entryAt, entry: s * entryV, stop: s * stopV, targets: [s * t1V, s * t2V, s * p.vC, s * p.vA] }

  const reached = ['t1', 't2', 't3', 't4'].filter((k) => best >= levels[k]).length

  return {
    filled: true,
    pattern: p.pattern,
    side: p.side,
    entryAt,
    exitAt,
    outcome,
    bars: exitAt - entryAt,
    r: (exitV - entryV) / risk,
    mfe: (best - entryV) / risk,
    reached, // how far up the T1..T4 ladder price got
    entry: s * entryV,
    stop: s * stopV,
    targets: [s * t1V, s * t2V, s * p.vC, s * p.vA],
    waited: entryAt - p.confirmedAt,
  }
}

/**
 * Scan a whole series once, exactly as a live scanner would: step the pivots, register every
 * pattern the moment its structure confirms, then follow each one.
 */
export function scan(bars, { specs = PATTERNS, kPivot = K_PIVOT, ...trade } = {}) {
  const { pivots, atr } = pivotStream(bars, kPivot)
  const registered = []
  // Re-walk the pivot list: pivot k became known at pivots[k].confirmedAt, so the run ending
  // at k is testable from that bar on.
  const widest = specs.reduce((m, s) => Math.max(m, s.pivots), 0)
  for (let k = 0; k < pivots.length; k += 1) {
    // Only the last `widest` pivots can close a pattern at k, so the window is bounded and
    // the whole scan stays linear in the number of pivots.
    const run = pivots.slice(Math.max(0, k + 1 - widest), k + 1)
    for (const p of patternsAt(run, specs)) registered.push(p)
  }
  const trades = []
  const unfilled = []
  for (const p of registered) {
    const t = runPattern(p, bars, atr, trade)
    if (t.filled) trades.push({ ...t, confirmedAt: p.confirmedAt, points: p.points })
    else unfilled.push({ pattern: p.pattern, side: p.side, confirmedAt: p.confirmedAt, reason: t.reason })
  }
  return { pivots, registered, trades, unfilled }
}
