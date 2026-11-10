// "Vortex Live" v1 — the causal vortex, rule by rule.
//
// Hand-checkable cases for each rule of the pre-declared spec (pivots, windows, projection,
// entry band, exits, one position at a time, cost), Pine ta.atr parity, independent
// re-derivations of every rule on real data, and the property the whole module exists for:
// NO REPAINT. Run on any prefix bars[0..T], the indicator reports exactly what the full run
// reported up to T — pivots, projections, entries, exits and per-bar signals — and nothing
// written at bar T changes when later bars arrive or are altered.
//
// The real data is test/fixtures/us500-4h-pepperstone-2025-10-13_2026-10-02.json: the last
// 1500 PEPPERSTONE:US500 4h candles of /tmp/vortex/data/us500_4h_pepperstone.csv.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  DEFAULTS,
  median,
  createAtr,
  atr14,
  createZigzag,
  measureWindow,
  project,
  positionE,
  createTrader,
  createVortexLive,
  runVortexLive,
  tradeStats,
} from '../engine/vortex-live.js'
import { ohlc4, buildVortex, zigzag } from '../engine/vortex.js'
import { seededRng } from '../engine/null-models.js'

const load = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')).bars
const bars4h = load('us500-4h-pepperstone-2025-10-13_2026-10-02.json')
const bars2h = load('us500-2h-ny-2026-02-03_2026-03-30.json')

const close = (actual, expected, tolerance = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)

const DAY = 86400
/** A bar whose open, high, low and close are all `p` (so OHLC4 = close = p); t in days. */
const flat = (p, t = 0) => ({ t: t * DAY, o: p, h: p, l: p, c: p })

// ---------------------------------------------------------------- 1. ATR

/**
 * A literal transliteration of the reference code in the Pine v6 manual — pine_atr, pine_rma
 * and pine_sma, series semantics and all — kept independent of the engine's incremental form.
 */
function pineAtrReference(bars, length) {
  const tr = []
  const sum = []
  for (let b = 0; b < bars.length; b += 1) {
    const { h: high, l: low } = bars[b]
    // trueRange = na(high[1]) ? high-low : math.max(math.max(high - low, math.abs(high - close[1])), math.abs(low - close[1]))
    tr[b] =
      b === 0
        ? high - low
        : Math.max(Math.max(high - low, Math.abs(high - bars[b - 1].c)), Math.abs(low - bars[b - 1].c))
    // pine_sma: sum := sum + x[i] / y for i = 0 .. y−1; na while x[y−1] does not exist
    let sma = null
    if (b >= length - 1) {
      sma = 0
      for (let i = 0; i < length; i += 1) sma += tr[b - i] / length
    }
    // pine_rma: sum := na(sum[1]) ? ta.sma(src, length) : alpha * src + (1 - alpha) * nz(sum[1])
    const alpha = 1 / length
    sum[b] = b === 0 || sum[b - 1] === null ? sma : alpha * tr[b] + (1 - alpha) * sum[b - 1]
  }
  return sum
}

describe('rule 1a — ATR is Pine ta.atr', () => {
  // True ranges by hand:      2       3            4 (gap up)     2.5 (gap down)   3
  const hand = [
    { o: 9, h: 10, l: 8, c: 9 }, // first bar: high − low
    { o: 10, h: 12, l: 9, c: 11 }, // max(3, |12 − 9|, |9 − 9|)
    { o: 14, h: 15, l: 14, c: 14.5 }, // max(1, |15 − 11|, |14 − 11|)
    { o: 13, h: 13, l: 12, c: 12 }, // max(1, |13 − 14.5|, |12 − 14.5|)
    { o: 12, h: 14, l: 11, c: 13 }, // max(3, |14 − 12|, |11 − 12|)
  ]

  test('length 3 by hand: null, null, then the mean of the first 3 TRs, then Wilder', () => {
    const a = atr14(hand, 3)
    assert.equal(a[0], null)
    assert.equal(a[1], null)
    assert.equal(a[2], 3) // (2 + 3 + 4) / 3
    close(a[3], 17 / 6) // 2.5/3 + (2/3)·3
    close(a[4], 26 / 9) // 3/3 + (2/3)·17/6
  })

  test('length 14 on a hand series: seeded on bar 13 by the SMA of 14 TRs, RMA after', () => {
    // Every bar's range holds the previous close, so TR = high − low = 1, 2, 3, … exactly.
    const bars = Array.from({ length: 16 }, (_, i) => ({ o: 100, h: 100 + (i + 1) / 2, l: 100 - (i + 1) / 2, c: 100 }))
    const a = atr14(bars)
    for (let i = 0; i < 13; i += 1) assert.equal(a[i], null)
    assert.equal(a[13], 7.5) // (1 + … + 14) / 14
    close(a[14], (1 / 14) * 15 + (13 / 14) * 7.5)
    close(a[15], (1 / 14) * 16 + (13 / 14) * a[14])
  })

  test('matches the Pine reference code on 1500 real 4h bars to 1e-12 relative', () => {
    const ours = atr14(bars4h)
    const pine = pineAtrReference(bars4h, 14)
    assert.equal(ours.length, pine.length)
    for (let i = 0; i < ours.length; i += 1) {
      if (pine[i] === null) assert.equal(ours[i], null)
      else close(ours[i], pine[i], 1e-12 * pine[i])
    }
  })

  test('the incremental form and the whole-series form agree', () => {
    const atr = createAtr(14)
    assert.deepEqual(bars4h.map((b) => atr.step(b)), atr14(bars4h))
  })
})

// ---------------------------------------------------------------- 1. pivots

/** Feed the zigzag stepper, one threshold per bar. */
const runZigzag = (seq) => {
  const zz = createZigzag()
  return seq.map(([b, thr], t) => zz.step(t, { o: b.l, c: b.l, ...b }, thr)).filter(Boolean)
}

/** zigzag() of engine/vortex.js, with each pivot's confirmation bar found by brute force. */
function zigzagWithConfirmations(bars, thr) {
  const full = zigzag(bars, thr)
  const conf = full.map(() => null)
  for (let T = 0; T < bars.length; T += 1) {
    const seen = zigzag(bars.slice(0, T + 1), thr)
    for (let k = 0; k < seen.length; k += 1) {
      assert.deepEqual(seen[k], full[k]) // zigzag() itself never revises a pivot
      if (conf[k] === null) conf[k] = T
    }
  }
  return full.map((p, k) => ({ ...p, confirmedAt: conf[k] }))
}

describe('rule 1b — pivots: the zigzag state machine with a per-bar threshold', () => {
  test('with a constant threshold it is zigzag() of engine/vortex.js, confirmed on the first bar that can know it', () => {
    for (const [bars, thresholds] of [
      [bars2h, [0.01, 0.02, 0.03]],
      [bars4h, [0.01, 0.02]],
    ]) {
      for (const thr of thresholds) {
        const zz = createZigzag()
        const live = bars.map((b, t) => zz.step(t, b, thr)).filter(Boolean)
        assert.deepEqual(live, zigzagWithConfirmations(bars, thr))
        assert.ok(live.length >= 4)
      }
    }
  })

  test('the threshold is the CURRENT bar\'s: a swing can be confirmed by a falling threshold alone', () => {
    const pivots = runZigzag([
      [{ h: 100, l: 100 }, 0.25], // 0: starts the tracking — both extremes on this bar
      [{ h: 120, l: 119 }, 0.25], // 1: 120 < 100 × 1.25 = 125, not yet
      [{ h: 119, l: 118 }, 0.125], // 2: no new extreme, but 120 ≥ 100 × 1.125 → low @0
      [{ h: 110, l: 95 }, 0.25], // 3: 95 > 120 × 0.75 = 90, not yet
      [{ h: 106, l: 105 }, 0.125], // 4: 105 ≤ 120 × 0.875 = 105 (equality confirms) → high @1
      [{ h: 104, l: 103 }, 0.125], // 5: a lower low replaces the candidate (no test this bar)
      [{ h: 128.75, l: 120 }, 0.25], // 6: 128.75 ≥ 103 × 1.25 = 128.75 → low @5
    ])
    assert.deepEqual(pivots, [
      { index: 0, price: 100, kind: 'low', confirmedAt: 2 },
      { index: 1, price: 120, kind: 'high', confirmedAt: 4 },
      // The low candidate restarts on the confirming bar 4, so bar 3's lower low of 95 —
      // which came before the confirmation — is never a pivot. A fixed threshold cannot do
      // this (the confirming bar is then always the lowest since the high); a per-bar one can.
      { index: 5, price: 103, kind: 'low', confirmedAt: 6 },
    ])
  })

  test('confirmation needs the reversal on bar t itself: just short of it is not enough', () => {
    const base = [
      [{ h: 100, l: 100 }, 0.25],
      [{ h: 130, l: 125 }, 0.25], // 130 ≥ 125 → low @0; the high candidate is bar 1
    ]
    assert.deepEqual(runZigzag([...base, [{ h: 98, l: 97.5 }, 0.25]]).at(-1), {
      index: 1, price: 130, kind: 'high', confirmedAt: 2, // 97.5 ≤ 130 × 0.75 = 97.5
    })
    assert.equal(runZigzag([...base, [{ h: 98, l: 97.51 }, 0.25]]).length, 1)
  })

  test('a higher high replaces the candidate and that bar is not tested, even if its low would confirm', () => {
    const pivots = runZigzag([
      [{ h: 100, l: 100 }, 0.25],
      [{ h: 130, l: 125 }, 0.25], // low @0 confirmed; high candidate 130
      [{ h: 131, l: 50 }, 0.25], // outside bar: new candidate 131; its low of 50 is not tested
      [{ h: 100, l: 98.25 }, 0.25], // 98.25 ≤ 131 × 0.75 → high @2
    ])
    assert.deepEqual(pivots.map((p) => [p.index, p.kind, p.confirmedAt]), [
      [0, 'low', 1],
      [2, 'high', 3],
    ])
  })

  test('initial phase: the earlier extreme is the first pivot; an equal high keeps the earlier bar', () => {
    const pivots = runZigzag([
      [{ h: 100, l: 100 }, 0.5],
      [{ h: 110, l: 105 }, 0.5], // 110 < 100 × 1.5: the low at bar 0 is not confirmed
      [{ h: 110, l: 106 }, 0.5], // a tie: the highest high stays bar 1
      [{ h: 60, l: 55 }, 0.5], // new lowest low after the high: 55 ≤ 110 × 0.5 → high @1
    ])
    assert.deepEqual(pivots, [{ index: 1, price: 110, kind: 'high', confirmedAt: 3 }])
  })

  test('no pivots before the ATR exists: the zigzag starts on bar atrLen − 1', () => {
    // ATR(3) exists from bar 2. Bar 0 is the highest price in the series; the fixed-threshold
    // zigzag would make it the first pivot, but it is never even a candidate here.
    const p = [200, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 104, 108, 112, 116, 120, 116, 112, 108, 104, 100, 101, 100]
    const bars = p.map((x) => flat(x))
    assert.deepEqual(zigzag(bars, 0.1)[0], { index: 0, price: 200, kind: 'high' })
    const r = runVortexLive(bars, { atrLen: 3 })
    // thr = 4·ATR/close: 0.1245 on bar 13 (112 < 100 × 1.1245) and 0.1261 on bar 14
    // (116 ≥ 112.6) → low @2; then 120 × (1 − 0.1588) = 100.9 ≥ 100 on bar 20 → high @15.
    assert.deepEqual(r.pivots, [
      { index: 2, price: 100, kind: 'low', confirmedAt: 14 },
      { index: 15, price: 120, kind: 'high', confirmedAt: 20 },
    ])
    assert.deepEqual(
      r.events.flatMap((e, t) => (e.pivot ? [[t, e.pivot]] : [])),
      [[14, 'low'], [20, 'high']],
    )
  })

  test('on real data every pivot obeys rule 1, re-derived from ta.atr and the bars alone', () => {
    const { pivots } = runVortexLive(bars4h)
    const thr = atr14(bars4h).map((a, t) => (a === null ? null : (4 * a) / bars4h[t].c))
    assert.ok(pivots.length >= 30)

    // The first pivot: both extremes tracked from bar 13 (the first ATR), the earlier one
    // confirmed on the first bar where the later one is 4·ATR_t/close_t away from it.
    const first = (from, to, high) => {
      let at = from
      for (let t = from + 1; t <= to; t += 1) if (high ? bars4h[t].h > bars4h[at].h : bars4h[t].l < bars4h[at].l) at = t
      return at
    }
    const p0 = pivots[0]
    for (let t = 14; t <= p0.confirmedAt; t += 1) {
      const [hi, lo] = [first(13, t, true), first(13, t, false)]
      const hit =
        (lo < hi && bars4h[hi].h >= bars4h[lo].l * (1 + thr[t])) || (hi < lo && bars4h[lo].l <= bars4h[hi].h * (1 - thr[t]))
      assert.equal(hit, t === p0.confirmedAt, `pivot 0: bar ${t}`)
    }
    assert.equal(p0.index, p0.kind === 'high' ? first(13, p0.confirmedAt, true) : first(13, p0.confirmedAt, false))

    for (let k = 1; k < pivots.length; k += 1) {
      const [prev, p] = [pivots[k - 1], pivots[k]]
      const high = p.kind === 'high'
      assert.notEqual(p.kind, prev.kind)
      // The candidate starts on the bar that confirmed the previous pivot (for the second
      // pivot: the opposite extreme of the initial phase), follows every new extreme (untested
      // on that bar), and is confirmed on the first other bar that reverses 4·ATR_t/close_t
      // from it.
      let at = k === 1 ? first(13, prev.confirmedAt, high) : prev.confirmedAt
      let run = high ? bars4h[at].h : bars4h[at].l
      for (let t = prev.confirmedAt + 1; t <= p.confirmedAt; t += 1) {
        const b = bars4h[t]
        if (high ? b.h > run : b.l < run) {
          assert.ok(t < p.confirmedAt, `bar ${t} both extends and confirms`)
          at = t
          run = high ? b.h : b.l
          continue
        }
        const hit = high ? b.l <= run * (1 - thr[t]) : b.h >= run * (1 + thr[t])
        assert.equal(hit, t === p.confirmedAt, `pivot ${k}: bar ${t}`)
      }
      assert.equal(p.index, at)
      assert.equal(p.price, run)
    }
  })
})

// ---------------------------------------------------------------- 2. windows

// A straight leg 200 → 100 over 100 bars with chosen bumps, so dev = bump (as in vortex.test.js).
const leg = (N, from, to, bumps = {}) => Array.from({ length: N + 1 }, (_, i) => flat(from + ((to - from) * i) / N + (bumps[i] ?? 0)))

describe('rule 2 — completed windows', () => {
  const H = { index: 0, price: 200, kind: 'high', confirmedAt: 3 }
  const L = { index: 100, price: 100, kind: 'low', confirmedAt: 104 }

  test('n, size = |ln(P1/P0)|, and the walls as fractions of |P1 − P0|', () => {
    const w = measureWindow(leg(100, 200, 100, { 50: 5, 30: -8 }), H, L)
    assert.equal(w.n, 100)
    close(w.size, Math.log(2))
    close(w.ru, 0.05) // Wup = dev/shape = 5/1 at the middle of the ellipse, over |ΔP| = 100
    close(w.rd, 8 / Math.sqrt(0.84) / 100) // Wdn = 8/shape(30), shape(30) = √(1 − 0.4²)
    assert.equal(w.completedAt, 104)
  })

  test('the walls are buildVortex\'s, with skip = round(3 % · n)', () => {
    // A spike inside the first 3 bars of 100 is ignored, exactly as in buildVortex.
    const bars = leg(100, 200, 100, { 2: 10, 30: -8, 50: 5 })
    const w = measureWindow(bars, H, L)
    const v = buildVortex(bars, { o: 0, d: 100, oPrice: 200, dPrice: 100 })
    assert.equal(w.ru, v.Wup / 100)
    assert.equal(w.rd, v.Wdn / 100)
    assert.equal(w.ru, 0.05)
  })

  test('n < 4 gives n and size but no wall ratios; n = 4 has them', () => {
    const bars = leg(4, 200, 100, { 2: 3 })
    const short = measureWindow(bars, H, { index: 3, price: 125, kind: 'low', confirmedAt: 5 })
    assert.deepEqual([short.n, short.ru, short.rd], [3, null, null])
    close(short.size, Math.log(200 / 125))
    const four = measureWindow(bars, H, { index: 4, price: 100, kind: 'low', confirmedAt: 5 })
    assert.equal(four.n, 4)
    close(four.ru, 3 / 100) // dev 3 at the middle bar, shape 1
    assert.equal(four.rd, 0)
  })

  test('indices are global and the window is stamped with the bar that completed it', () => {
    const bars = [flat(999), flat(999), ...leg(100, 200, 100, { 50: 5, 30: -8 })]
    const w = measureWindow(bars, { ...H, index: 2 }, { ...L, index: 102 })
    assert.deepEqual([w.from, w.to, w.completedAt], [2, 102, 104])
    close(w.ru, 0.05)
  })

  test('on real data, window k is measureWindow(pivot k, pivot k+1), completed when k+1 is confirmed', () => {
    const { pivots, windows } = runVortexLive(bars4h)
    assert.equal(windows.length, pivots.length - 1)
    windows.forEach((w, k) => assert.deepEqual(w, measureWindow(bars4h, pivots[k], pivots[k + 1])))
    assert.ok(windows.every((w, k) => w.completedAt === pivots[k + 1].confirmedAt))
  })
})

// ---------------------------------------------------------------- 3. projection

const win = (n, size, ru, rd) => ({ n, size, ru, rd })

describe('rule 3 — the projection drawn at a pivot\'s confirmation', () => {
  const O = { index: 500, price: 100, kind: 'high', confirmedAt: 510 }
  const windows = [
    win(1000, 5, 9, 9), // older than the last 5: ignored
    win(1000, 5, 9, 9),
    win(10, 0.1, 0.5, 0.4),
    win(3, 0.3, null, null), // n < 4: counts for n and size, not for the walls
    win(20, 0.2, 0.1, 0.2),
    win(50, 0.05, 0.3, 0.6),
    win(40, 0.4, 0.2, 0.1),
  ]

  test('medians of the last K = 5 windows; even-count wall medians average the two middle values', () => {
    const g = project(O, windows)
    // n: [3, 10, 20, 40, 50] → 20;  size: [0.05, 0.1, 0.2, 0.3, 0.4] → 0.2
    // ru over the 4 windows that have one: [0.1, 0.2, 0.3, 0.5] → (0.2 + 0.3)/2 = 0.25
    // rd: [0.1, 0.2, 0.4, 0.6] → (0.2 + 0.4)/2 = 0.3
    assert.equal(g.N, 20)
    assert.equal(g.skip, 1) // round(0.6)
    assert.equal(g.falling, true) // O is a high: the swing that ended there rose
    close(g.PD, 100 * Math.exp(-0.2))
    const span = 100 - 100 * Math.exp(-0.2)
    close(g.Wup, span * 0.25)
    close(g.Wdn, span * 0.3)
    assert.deepEqual([g.confirmedAt, g.iO, g.PO], [510, 500, 100])
  })

  test('a projection from a low rises: D = O · exp(+median size)', () => {
    const g = project({ ...O, kind: 'low' }, windows)
    assert.equal(g.falling, false)
    close(g.PD, 100 * Math.exp(0.2))
    close(g.Wup, (100 * Math.exp(0.2) - 100) * 0.25)
  })

  test('N is at least minN = 8, and rounds half up', () => {
    const tiny = [4, 5, 6, 5, 4].map((n) => win(n, 0.01, 0.1, 0.1))
    const g = project(O, tiny)
    assert.equal(g.N, 8) // median 5 → floor of 8
    assert.equal(g.skip, 0) // round(0.24)
    const even = [10, 13, 20, 40].map((n) => win(n, 0.01, 0.1, 0.1))
    assert.equal(project(O, even, { K: 4 }).N, 17) // median 16.5 → 17
  })

  test('skip = round(3 % · N): N = 50 → 1.5 → 2', () => {
    const g = project(O, [50, 50, 50, 50, 50].map((n) => win(n, 0.01, 0.1, 0.1)))
    assert.deepEqual([g.N, g.skip], [50, 2])
  })

  test('no projection with fewer than K windows, or fewer than 3 of the last K with walls', () => {
    assert.equal(project(O, windows.slice(-4)), null)
    const thin = [win(10, 0.1, 0.1, 0.1), win(3, 0.1, null, null), win(10, 0.1, 0.1, 0.1), win(2, 0.1, null, null), win(3, 0.1, null, null)]
    assert.equal(project(O, thin), null)
    thin[4] = win(10, 0.1, 0.1, 0.1)
    assert.ok(project(O, thin) !== null)
  })

  test('median: odd → the middle value, even → the mean of the two middle values', () => {
    assert.equal(median([3, 1, 2]), 2)
    assert.equal(median([4, 1, 3, 2]), 2.5)
    assert.equal(median([7]), 7)
    assert.throws(() => median([]), /empty/)
  })

  test('on real data, every projection is project() at a pivot from the windows completed by then', () => {
    for (const options of [{}, { K: 3 }]) {
      const r = runVortexLive(bars4h, options)
      const expected = []
      r.pivots.forEach((p, k) => {
        const g = project(p, r.windows.slice(0, k), { ...DEFAULTS, ...options })
        if (g) expected.push({ id: expected.length, ...g })
      })
      assert.deepEqual(r.projections, expected)
      assert.ok(r.projections.length >= 20)
    }
  })
})

// ---------------------------------------------------------------- 4–7. entries and exits

// A projection by hand: 200 → 100 over N = 100 bars from O at bar 0, walls 10 either side.
// vector(i) = 200 − i, shape(50) = 1, so at i = 50 a price of 150 + 10·e sits at exactly e.
const G = Object.freeze({ id: 7, confirmedAt: 10, iO: 0, PO: 200, PD: 100, N: 100, Wup: 10, Wdn: 10, skip: 3, falling: true })

/** The price at position e of projection g, i bars after O — the inverse of the definition. */
const priceAt = (g, i, e) => {
  const vector = g.PO + ((g.PD - g.PO) * i) / g.N
  const shape = Math.sqrt(1 - ((2 * i) / g.N - 1) ** 2)
  return vector + e * (e > 0 ? g.Wup : g.Wdn) * shape
}

/** Feed a trader [t, bar, live] steps; returns the trader and each step's event. */
const trade = (steps, options) => {
  const trader = createTrader(options)
  const events = steps.map(([t, bar, live]) => trader.step(t, bar, live))
  return { trader, events, trades: trader.trades }
}

describe('rule 4 — entry: 0.85 ≤ |e| < 1.25 inside [skip, N − skip], fading the wall', () => {
  test('e is (OHLC4 − vector) / (W_side · shape)', () => {
    const p = positionE(G, 50, 141)
    assert.deepEqual([p.vector, p.shape, p.dev, p.wall, p.e], [150, 1, -9, 10, -0.9])
    close(positionE(G, 20, priceAt(G, 20, 0.7)).e, 0.7)
    close(positionE({ ...G, Wup: 4 }, 50, 152).e, 0.5) // the upper wall is Wup
  })

  const band = [
    [141.5, 'buy', -0.85], // the lower edge is in the band
    [141.6, null, -0.84],
    [138, 'buy', -1.2],
    [137.5, null, -1.25], // the upper edge is the stop: out
    [137, null, -1.3],
    [158.5, 'sell', 0.85],
    [159, 'sell', 0.9],
    [162.5, null, 1.25],
    [150, null, 0],
  ]
  for (const [price, want, e] of band) {
    test(`price ${price} at i = 50 → e = ${e} → ${want ?? 'no entry'}`, () => {
      const { events, trader } = trade([[50, flat(price, 50), G]])
      close(events[0].e, e, 1e-9)
      assert.equal(events[0].buy, want === 'buy')
      assert.equal(events[0].sell, want === 'sell')
      if (want) {
        assert.deepEqual(trader.open, { side: want === 'buy' ? 1 : -1, entryIndex: 50, entryPrice: price, eEntry: events[0].e, projection: 7 })
      } else {
        assert.equal(trader.open, null)
      }
    })
  }

  test('only inside skip ≤ i ≤ N − skip, and only from the confirmation bar on', () => {
    const live = { ...G, confirmedAt: 0 }
    const at = (t) => trade([[t, flat(priceAt(live, t, -0.9), t), live]]).events[0]
    assert.equal(at(2).e, null) // i = 2 < skip = 3: not evaluated
    assert.equal(at(2).buy, false)
    assert.equal(at(3).buy, true) // i = skip
    assert.equal(at(97).buy, true) // i = N − skip
    assert.equal(at(98).e, null)
    assert.equal(at(98).buy, false)
    // G is confirmed at bar 10: a bar before that cannot enter even with e in the band.
    assert.equal(trade([[5, flat(priceAt(G, 5, -0.9), 5), G]]).events[0].buy, false)
  })

  test('no live projection, no entry and no e', () => {
    assert.deepEqual(trade([[50, flat(141, 50), null]]).events[0], { buy: false, sell: false, exit: null, e: null })
  })
})

describe('rule 5 — exits on later closes, against the entry projection: time, then stop, then target', () => {
  test('long: the vector is the target, and e = 0 exactly is enough', () => {
    const { trades, events } = trade([
      [49, flat(priceAt(G, 49, -0.9), 49), G],
      [50, flat(150, 50), G],
    ])
    assert.equal(events[0].buy, true)
    assert.equal(events[1].exit, 'target')
    const entry = priceAt(G, 49, -0.9)
    assert.deepEqual(trades, [
      {
        side: 1, entryIndex: 49, entryPrice: entry, exitIndex: 50, exitPrice: 150, reason: 'target',
        ret: (150 - entry) / entry - 0.0002, bars: 1, days: 1, eEntry: events[0].e, projection: 7,
      },
    ])
  })

  test('long: the stop is e ≤ −1.25, inclusive', () => {
    const { trades } = trade([
      [49, flat(priceAt(G, 49, -0.9), 49), G],
      [50, flat(137.5, 50), G], // e = −1.25 exactly
    ])
    assert.equal(trades[0].reason, 'stop')
    assert.equal(trades[0].exitPrice, 137.5)
  })

  test('short: target at e ≤ 0, stop at e ≥ +1.25', () => {
    const target = trade([[49, flat(priceAt(G, 49, 0.9), 49), G], [50, flat(150, 50), G]]).trades[0]
    assert.deepEqual([target.side, target.reason], [-1, 'target'])
    close(target.ret, (target.entryPrice - 150) / target.entryPrice - 0.0002)
    const stop = trade([[49, flat(priceAt(G, 49, 0.9), 49), G], [50, flat(162.5, 50), G]]).trades[0]
    assert.deepEqual([stop.side, stop.reason, stop.exitPrice], [-1, 'stop', 162.5])
  })

  test('between the stop and the vector the trade is held', () => {
    const { trades, events } = trade([
      [49, flat(priceAt(G, 49, -0.9), 49), G],
      [50, flat(145, 50), G], // e = −0.5
      [51, flat(priceAt(G, 51, -1.2), 51), G], // deeper, still inside the stop
      [52, flat(priceAt(G, 52, 0.2), 52), G], // through the vector
    ])
    assert.deepEqual(events.map((e) => e.exit), [null, null, null, 'target'])
    assert.deepEqual([trades[0].exitIndex, trades[0].bars, trades[0].days], [52, 3, 3])
  })

  test('time exit on the first close with i > N − skip, checked before the stop', () => {
    const steps = [
      [96, flat(priceAt(G, 96, -0.9), 96), G],
      [97, flat(priceAt(G, 97, -0.5), 97), G], // i = N − skip: still managed by e
      [98, flat(50, 98), G], // far below the stop — but i = 98 > 97 comes first
    ]
    const t = trade(steps).trades[0]
    assert.deepEqual([t.reason, t.exitIndex, t.exitPrice], ['time', 98, 50])
    // One bar earlier the same price is a stop.
    const s = trade([steps[0], [97, flat(50, 97), G]]).trades[0]
    assert.deepEqual([s.reason, s.exitIndex], ['stop', 97])
  })

  test('e is read from OHLC4, the fill is the close', () => {
    // OHLC4 = (157 + 157 + 141 + 141)/4 = 149 = vector(51): a target. The close is 141.
    const { trades } = trade([
      [50, flat(141, 50), G],
      [51, { t: 51 * DAY, o: 157, h: 157, l: 141, c: 141 }, G],
    ])
    assert.equal(ohlc4({ o: 157, h: 157, l: 141, c: 141 }), 149)
    assert.deepEqual([trades[0].reason, trades[0].exitPrice], ['target', 141])
  })

  test('zero-width walls read as ±∞ by the side of the vector', () => {
    assert.equal(positionE({ ...G, Wup: 0 }, 50, 151).e, Infinity)
    assert.equal(positionE({ ...G, Wup: 0 }, 50, 150).e, 0)
    assert.equal(positionE(G, 100, 99).e, -Infinity) // shape(N) = 0
    assert.equal(positionE(G, 0, 201).e, Infinity) // shape(0) = 0
    // A wall of zero width never makes an entry …
    assert.equal(trade([[50, flat(151, 50), { ...G, Wup: 0 }]]).events[0].sell, false)
    // … and with skip = 0 a trade still open at i = N exits by the side of the vector.
    const g0 = { ...G, skip: 0, N: 20, PD: 180 } // vector(i) = 200 − i
    const below = trade([[15, flat(priceAt(g0, 15, -0.9), 15), g0], [20, flat(179, 20), g0]]).trades[0]
    assert.deepEqual([below.reason, below.exitIndex], ['stop', 20])
    const above = trade([[15, flat(priceAt(g0, 15, -0.9), 15), g0], [20, flat(181, 20), g0]]).trades[0]
    assert.deepEqual([above.reason, above.exitIndex], ['target', 20])
  })
})

describe('rules 6–7 — return, cost, one position at a time, one entry per projection', () => {
  test('return = side·(exit − entry)/entry − cost; a trade that only pays the cost is a loss', () => {
    const { trades } = trade([
      [50, flat(141, 50), G],
      [51, { t: 51 * DAY, o: 157, h: 157, l: 141, c: 141 }, G], // target, filled at the entry price
    ])
    assert.equal(trades[0].ret, -0.0002)
    assert.equal(tradeStats(trades).wins, 0)
    const crypto = trade([[50, flat(141, 50), G], [51, flat(149, 51), G]], { cost: 0.001 }).trades[0]
    close(crypto.ret, 8 / 141 - 0.001)
  })

  test('one entry per projection, even after its trade has closed', () => {
    const { events, trades } = trade([
      [50, flat(141, 50), G], // buy
      [51, flat(149, 51), G], // target
      [52, flat(priceAt(G, 52, -0.9), 52), G], // in the band again — same projection, no entry
      [53, flat(priceAt(G, 53, -0.9), 53), { ...G, id: 8 }], // a new projection may enter
    ])
    assert.deepEqual(events.map((e) => [e.buy, e.exit]), [[true, null], [false, 'target'], [false, null], [true, null]])
    assert.equal(trades.length, 1)
  })

  test('a new projection cannot enter while a trade is open; the open trade keeps its own geometry', () => {
    // G2 is drawn at bar 51: vector2(i) = 168 − i from O at bar 40, walls 10.
    const G2 = { id: 8, confirmedAt: 51, iO: 40, PO: 168, PD: 128, N: 40, Wup: 10, Wdn: 10, skip: 1, falling: true }
    const { events, trades, trader } = trade([
      [50, flat(141, 50), G], // long under G, e = −0.9
      // 148: under G e = −0.10 (hold); under G2 e = −9/(10·0.893) = −1.01, in the band — but not flat.
      [51, flat(148, 51), G2],
      // 148: under G e = 0 → target. Under G2 e = −8/(10·0.917) = −0.87, which would only be a hold
      // for G2 — the exit proves the trade is still managed by G. Flat again, G2 enters on the same close.
      [52, flat(148, 52), G2],
    ])
    close(events[1].e, -9 / (10 * Math.sqrt(1 - (22 / 40 - 1) ** 2)), 1e-12)
    assert.deepEqual(events.map((e) => [e.buy, e.exit]), [[true, null], [false, null], [true, 'target']])
    assert.deepEqual(trades.map((t) => [t.projection, t.reason, t.entryIndex, t.exitIndex]), [[7, 'target', 50, 52]])
    assert.deepEqual([trader.open.projection, trader.open.entryIndex, trader.open.side], [8, 52, 1])
  })

  test('tradeStats: win rate, durations (even-count median), expectancy, profit factor', () => {
    const t = (ret, bars, reason) => ({ ret, bars, days: bars / 6, reason })
    const s = tradeStats([t(0.02, 1, 'target'), t(-0.01, 4, 'stop'), t(0.03, 2, 'target'), t(-0.0002, 3, 'time')])
    assert.deepEqual([s.n, s.wins, s.winRate, s.medianBars, s.meanBars], [4, 2, 0.5, 2.5, 2.5])
    close(s.expectancy, (0.02 - 0.01 + 0.03 - 0.0002) / 4)
    close(s.profitFactor, 0.05 / 0.0102)
    close(s.medianDays, 2.5 / 6)
    assert.deepEqual(s.reasons, { target: 2, stop: 1, time: 1 })
    assert.equal(tradeStats([]).winRate, null)
  })
})

// ---------------------------------------------------------------- the whole engine on real data

/** The projection live for entries at each bar: the one drawn at the latest confirmed pivot. */
function liveByBar(r, n) {
  const byConfirm = new Map(r.projections.map((g) => [g.confirmedAt, g]))
  const live = new Array(n).fill(null)
  let k = -1
  for (let t = 0; t < n; t += 1) {
    while (k + 1 < r.pivots.length && r.pivots[k + 1].confirmedAt <= t) k += 1
    live[t] = k >= 0 ? (byConfirm.get(r.pivots[k].confirmedAt) ?? null) : null
  }
  return live
}

const exitReason = (g, side, t, bar, stopE = 1.25) => {
  const i = t - g.iO
  if (i > g.N - g.skip) return 'time'
  const { e } = positionE(g, i, ohlc4(bar))
  if (side > 0 ? e <= -stopE : e >= stopE) return 'stop'
  if (side > 0 ? e >= 0 : e <= 0) return 'target'
  return null
}

describe('the indicator on 1500 real 4h bars — rules 4–7 re-derived from the projections', () => {
  for (const options of [{}, { K: 3 }]) {
    test(`trades, open position and per-bar flags follow the rules (${JSON.stringify(options)})`, () => {
      const bars = bars4h
      const r = runVortexLive(bars, options)
      const live = liveByBar(r, bars.length)
      const all = [...r.trades, ...(r.open ? [r.open] : [])]
      assert.ok(r.trades.length >= 20, `only ${r.trades.length} trades`)

      // One position at a time, one entry per projection.
      for (let j = 1; j < all.length; j += 1) assert.ok(all[j].entryIndex >= all[j - 1].exitIndex)
      assert.equal(new Set(all.map((x) => x.projection)).size, all.length)

      for (const x of all) {
        const g = r.projections[x.projection]
        assert.equal(live[x.entryIndex], g, 'entered on the projection live at that bar')
        const i = x.entryIndex - g.iO
        assert.ok(i >= g.skip && i <= g.N - g.skip)
        const { e } = positionE(g, i, ohlc4(bars[x.entryIndex]))
        assert.equal(x.eEntry, e)
        assert.ok(Math.abs(e) >= 0.85 && Math.abs(e) < 1.25)
        assert.equal(x.side, e < 0 ? 1 : -1)
        assert.equal(x.entryPrice, bars[x.entryIndex].c)
        // No exit condition before the exit bar; the right one on it.
        const last = x.exitIndex ?? bars.length
        for (let t = x.entryIndex + 1; t < last; t += 1) assert.equal(exitReason(g, x.side, t, bars[t]), null)
        if (x.exitIndex === undefined) continue
        assert.equal(exitReason(g, x.side, x.exitIndex, bars[x.exitIndex]), x.reason)
        assert.equal(x.exitPrice, bars[x.exitIndex].c)
        assert.equal(x.ret, (x.side * (x.exitPrice - x.entryPrice)) / x.entryPrice - 0.0002)
        assert.equal(x.bars, x.exitIndex - x.entryIndex)
        assert.equal(x.days, (bars[x.exitIndex].t - bars[x.entryIndex].t) / DAY)
      }

      // No missed entries: whenever flat, with an unused live projection whose e is in the band
      // inside [skip, N − skip], the indicator entered.
      const entryAt = new Map(all.map((x) => [x.entryIndex, x]))
      const used = new Set()
      for (let t = 0; t < bars.length; t += 1) {
        const g = live[t]
        const flatNow = !all.some((x) => x.entryIndex < t && (x.exitIndex === undefined || x.exitIndex > t))
        let shouldEnter = false
        let e = null
        if (g) {
          const i = t - g.iO
          if (i >= g.skip && i <= g.N - g.skip) {
            e = positionE(g, i, ohlc4(bars[t])).e
            shouldEnter = flatNow && !used.has(g.id) && Math.abs(e) >= 0.85 && Math.abs(e) < 1.25
          }
        }
        assert.equal(entryAt.has(t), shouldEnter, `bar ${t}`)
        if (shouldEnter) used.add(g.id)

        // The per-bar flags say the same thing.
        const ev = r.events[t]
        assert.equal(ev.e, e)
        assert.equal(ev.buy, shouldEnter && entryAt.get(t).side === 1)
        assert.equal(ev.sell, shouldEnter && entryAt.get(t).side === -1)
        assert.equal(ev.exit, r.trades.find((x) => x.exitIndex === t)?.reason ?? null)
        assert.equal(ev.pivot, r.pivots.find((p) => p.confirmedAt === t)?.kind ?? null)
        assert.equal(ev.projection, r.projections.some((p) => p.confirmedAt === t))
      }
    })
  }

  test('a pivot that cannot be projected ends the old projection\'s life for entries', () => {
    // Eight half-cosine legs 100 ↔ 110 of 20 flat bars each: every turn is a pivot, and every
    // window has the same n = 20 and walls. The last leg ends at a low on bar 160. Then a jump
    // to 104 confirms that low on bar 161 (projection P rises from it), and a spike to 108
    // followed by a drop to 99 confirms a high at bar 162 on bar 163 — a 2-bar window, so with
    // K = 3 no projection can be drawn there.
    const legs = []
    for (let k = 0; k < 8; k += 1) {
      const [from, to] = k % 2 ? [110, 100] : [100, 110]
      for (let i = k === 0 ? 0 : 1; i <= 20; i += 1) legs.push(from + ((to - from) * (1 - Math.cos((Math.PI * i) / 20))) / 2)
    }
    const r = runVortexLive([...legs, 104, 108, 99, 100.9, 100.9].map((p) => flat(p)), { K: 3 })
    assert.deepEqual(r.pivots.slice(-2), [
      { index: 160, price: 100, kind: 'low', confirmedAt: 161 },
      { index: 162, price: 108, kind: 'high', confirmedAt: 163 },
    ])
    assert.equal(r.windows.at(-1).n, 2)
    const P = r.projections.at(-1)
    assert.deepEqual([P.confirmedAt, P.iO, P.N, P.skip, P.falling], [161, 160, 20, 1, false])
    // Bar 164 sits in P's lower band: P would buy it …
    const { e } = positionE(P, 164 - P.iO, 100.9)
    assert.ok(e <= -0.85 && e > -1.25, `e = ${e}`)
    // … but P stopped being live on bar 163, and nothing replaced it.
    assert.deepEqual(
      r.events.slice(161).map((x) => [x.pivot, x.projection, x.e === null, x.buy]),
      [['low', true, false, false], [null, false, false, false], ['high', false, true, false], [null, false, true, false], [null, false, true, false]],
    )
    assert.equal(r.open, null)
    assert.ok(r.trades.every((x) => x.entryIndex < 161))
  })

  test('with K = 3 on real data, unprojectable pivots never trade until the next pivot', () => {
    // The fixture's one window shorter than 4 bars leaves pivots with no projection under K = 3.
    const r = runVortexLive(bars4h, { K: 3 })
    const projected = new Set(r.projections.map((g) => g.confirmedAt))
    const orphans = r.pivots.filter((p, k) => k >= 3 && !projected.has(p.confirmedAt))
    assert.ok(orphans.length >= 1)
    const live = liveByBar(r, bars4h.length)
    for (const p of orphans) assert.equal(live[p.confirmedAt], null)
    const all = [...r.trades, ...(r.open ? [r.open] : [])]
    for (const p of orphans) {
      const next = r.pivots.find((q) => q.confirmedAt > p.confirmedAt)?.confirmedAt ?? bars4h.length
      assert.ok(!all.some((x) => x.entryIndex >= p.confirmedAt && x.entryIndex < next))
    }
  })

  test('options are validated', () => {
    assert.throws(() => runVortexLive(bars4h, { K: 2 }), /K must/)
    assert.throws(() => runVortexLive(bars4h, { level: 1.3 }), /level/)
    assert.throws(() => runVortexLive(bars4h, { skipFrac: 0.5 }), /skipFrac/)
    assert.throws(() => runVortexLive(bars4h, { atrLen: 0 }), /atrLen/)
    assert.throws(() => runVortexLive([{ o: 1, h: 1, l: 1, c: 0 }]), /positive close/)
  })
})

// ---------------------------------------------------------------- no repaint

/** What a run has said about bars 0..T. */
function asOf(r, T) {
  const entries = [...r.trades, ...(r.open ? [r.open] : [])]
    .filter((x) => x.entryIndex <= T)
    .map(({ side, entryIndex, entryPrice, eEntry, projection }) => ({ side, entryIndex, entryPrice, eEntry, projection }))
  return {
    pivots: r.pivots.filter((p) => p.confirmedAt <= T),
    windows: r.windows.filter((w) => w.completedAt <= T),
    projections: r.projections.filter((g) => g.confirmedAt <= T),
    entries,
    exits: r.trades.filter((x) => x.exitIndex <= T),
    events: r.events.slice(0, T + 1),
  }
}

describe('NO REPAINT — every prefix reports exactly what the full run reported up to it', () => {
  const full = runVortexLive(bars4h)
  const n = bars4h.length

  // 120 seeded random cut points, plus every bar where something happens and the bar before it.
  const rng = seededRng(20261003)
  const cuts = new Set(Array.from({ length: 120 }, () => Math.floor(rng() * n)))
  for (const t of [
    ...full.pivots.map((p) => p.confirmedAt),
    ...full.trades.flatMap((x) => [x.entryIndex, x.exitIndex]),
    ...(full.open ? [full.open.entryIndex] : []),
  ]) {
    cuts.add(t)
    cuts.add(t - 1)
  }
  cuts.add(0)
  cuts.add(n - 1)
  const sorted = [...cuts].filter((t) => t >= 0 && t < n).sort((a, b) => a - b)

  test(`${sorted.length} cut points: pivots, windows, projections, entries, exits and flags agree`, () => {
    assert.ok(full.trades.length >= 20 && full.pivots.length >= 30)
    for (const T of sorted) {
      const prefix = runVortexLive(bars4h.slice(0, T + 1))
      assert.deepEqual(asOf(prefix, T), asOf(full, T), `cut at ${T}`)
      // And the position the prefix still holds is the one the full run held at T.
      const holding = [...full.trades, ...(full.open ? [full.open] : [])].find(
        (x) => x.entryIndex <= T && (x.exitIndex === undefined || x.exitIndex > T),
      )
      assert.equal(prefix.open?.entryIndex, holding?.entryIndex, `open position at ${T}`)
    }
  })

  test('rewriting every bar after T changes nothing up to T', () => {
    const rng2 = seededRng(7)
    for (const T of [200, 517, 900, 1234, 1400]) {
      // Replace the future with a random walk of a different volatility.
      let p = bars4h[T].c
      const altered = bars4h.map((b, t) => {
        if (t <= T) return b
        const o = p
        p *= Math.exp((rng2() - 0.5) * 0.04)
        return { t: b.t, o, h: Math.max(o, p) * 1.003, l: Math.min(o, p) * 0.997, c: p }
      })
      const other = runVortexLive(altered)
      assert.deepEqual(asOf(other, T), asOf(full, T), `cut at ${T}`)
      assert.notDeepEqual(other.trades, full.trades) // the future did change
    }
  })

  test('streamed one bar at a time, no event or record is revised after it is written', () => {
    const vl = createVortexLive()
    const snapshots = []
    let pivotsSeen = 0
    let tradesSeen = 0
    const frozen = []
    for (const bar of bars4h) {
      snapshots.push(structuredClone(vl.step(bar)))
      // Everything recorded so far is snapshotted the moment it first appears.
      for (; pivotsSeen < vl.pivots.length; pivotsSeen += 1) frozen.push(['pivot', pivotsSeen, structuredClone(vl.pivots[pivotsSeen])])
      for (; tradesSeen < vl.trades.length; tradesSeen += 1) frozen.push(['trade', tradesSeen, structuredClone(vl.trades[tradesSeen])])
    }
    assert.deepEqual(vl.events, snapshots)
    for (const [kind, k, record] of frozen) assert.deepEqual(kind === 'pivot' ? vl.pivots[k] : vl.trades[k], record)
    assert.deepEqual(vl.trades, full.trades)
  })
})
