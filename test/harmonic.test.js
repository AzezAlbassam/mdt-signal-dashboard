import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PATTERNS,
  TOL,
  patternsAt,
  przOf,
  pt,
  runPattern,
  scan,
  structureOk,
  withConfluence,
} from '../engine/harmonic.js'

// PROTOCOL-harmonic.md §1.7 requires all of this to pass before any result is produced.

const spec = (name) => PATTERNS.find((p) => p.name === name)

// A pivot run, written the way the engine sees it. Prices are the pivot prices; `index` and
// `confirmedAt` only have to be increasing for the structural tests.
const run = (prices, firstKind) =>
  prices.map((price, i) => ({
    index: i * 10,
    price,
    kind: i % 2 === 0 ? firstKind : firstKind === 'low' ? 'high' : 'low',
    confirmedAt: i * 10 + 3,
  }))

// ---------------------------------------------------------------- the published numbers

test('a point ratio becomes a +/-5% window and a range is left alone', () => {
  assert.equal(TOL, 0.05)
  const [lo, hi] = pt(0.786)
  assert.ok(Math.abs(lo - 0.7467) < 1e-9 && Math.abs(hi - 0.8253) < 1e-9, `${lo}..${hi}`)
})

// The textbook bullish Gartley, built from the published ratios and NOT from the table, so
// that changing a number in the table breaks this test. X=100, A=200, B=0.618 of XA,
// C = 0.728 of AB (the depth at which the 1:1 AB=CD lands exactly on the 0.786 XA), and the
// completion at 0.786 of XA = 121.4.
const GARTLEY = { X: 100, A: 200, B: 200 - 0.618 * 100, C: 0, D: 200 - 0.786 * 100 }
GARTLEY.C = GARTLEY.B + 0.728 * (GARTLEY.A - GARTLEY.B)

test('the textbook Gartley is detected, and its PRZ brackets 0.786 of XA', () => {
  const pivots = run([GARTLEY.X, GARTLEY.A, GARTLEY.B, GARTLEY.C], 'low')
  const found = patternsAt(pivots).filter((p) => p.pattern === 'Gartley')
  assert.equal(found.length, 1, 'expected exactly one Gartley')
  const g = found[0]
  assert.equal(g.side, 'long')
  // v-space is price for a long, so the PRZ reads directly as prices here.
  assert.ok(g.przLo <= GARTLEY.D && GARTLEY.D <= g.przHi, `PRZ ${g.przLo}..${g.przHi} misses ${GARTLEY.D}`)
  assert.ok(g.przHi < GARTLEY.A, 'the zone must sit below A')
  assert.ok(g.przLo > GARTLEY.X, 'a Gartley completes inside XA, never through X')
})

test('the same Gartley also converges once the 1:1 AB=CD is required', () => {
  const pivots = run([GARTLEY.X, GARTLEY.A, GARTLEY.B, GARTLEY.C], 'low')
  const strict = withConfluence().filter((p) => p.name === 'Gartley')
  const found = patternsAt(pivots, strict)
  assert.equal(found.length, 1, 'C at 0.728 of AB is exactly where the three projections meet')
  assert.ok(found[0].przLo <= GARTLEY.D && GARTLEY.D <= found[0].przHi)
})

test('a B point outside tolerance is not a Gartley', () => {
  // B at 0.70 of XA: 13% away from 0.618, far outside the 5% window.
  const pivots = run([100, 200, 200 - 0.7 * 100, 176.4], 'low')
  assert.equal(patternsAt(pivots).filter((p) => p.pattern === 'Gartley').length, 0)
})

test('B just inside tolerance is still a Gartley, just outside is not', () => {
  const at = (b) => {
    const B = 200 - b * 100
    const C = B + 0.728 * (200 - B)
    return patternsAt(run([100, 200, B, C], 'low')).filter((p) => p.pattern === 'Gartley').length
  }
  assert.equal(at(0.618 * 1.04), 1, 'inside the window')
  assert.equal(at(0.618 * 1.06), 0, 'outside the window')
})

test('the bearish mirror of a pattern is found exactly as often as the bullish one', () => {
  const bull = run([GARTLEY.X, GARTLEY.A, GARTLEY.B, GARTLEY.C], 'low')
  const bear = run([-GARTLEY.X + 400, -GARTLEY.A + 400, -GARTLEY.B + 400, -GARTLEY.C + 400], 'high')
  const b1 = patternsAt(bull).filter((p) => p.pattern === 'Gartley')
  const b2 = patternsAt(bear).filter((p) => p.pattern === 'Gartley')
  assert.equal(b2.length, b1.length)
  assert.equal(b2[0].side, 'short')
  // Mirroring every price p to 400-p means v_bear = -(400-p) = v_bull - 400, so the whole
  // zone must shift by exactly that and not by anything else.
  assert.ok(Math.abs(b2[0].przHi - (b1[0].przHi - 400)) < 1e-9, `${b2[0].przHi} vs ${b1[0].przHi - 400}`)
  assert.ok(Math.abs(b2[0].przLo - (b1[0].przLo - 400)) < 1e-9)
})

test('a Bat is a Bat and not a Gartley: the B point is what separates them', () => {
  // B at 0.45 of XA — inside the Bat's 0.382-0.50, nowhere near the Gartley's 0.618.
  const X = 100
  const A = 200
  const B = A - 0.45 * (A - X)
  const C = B + 0.6 * (A - B)
  const names = patternsAt(run([X, A, B, C], 'low')).map((p) => p.pattern)
  assert.ok(!names.includes('Gartley'), 'a 0.45 B is not a Gartley')
})

test('a Cypher requires C to break beyond A, which the other patterns forbid', () => {
  const s = spec('Cypher')
  const X = 100
  const A = 200
  const B = A - 0.5 * (A - X) // 0.382-0.618 of XA
  const C = X + 1.33 * (A - X) // 1.272-1.414 of XA, beyond A
  const v = [X, A, B, C]
  assert.ok(structureOk(s, v), 'the Cypher structure should hold')
  // ...and the same four points are not a Gartley or a Bat, both of which require C < A.
  for (const other of ['Gartley', 'Bat', 'Butterfly', 'Crab']) {
    assert.equal(structureOk(spec(other), v), false, `${other} must reject C beyond A`)
  }
})

test('projections that never meet are not a pattern', () => {
  // A PRZ built from two windows that cannot overlap must come back null, not be papered over.
  const fake = { prz: [{ ref: 1, b: [0, 1], min: 0.1, max: 0.2 }, { ref: 1, b: [0, 1], min: 0.9, max: 1.0 }] }
  assert.equal(przOf(fake, [100, 200]), null)
})

test('every pattern in the table is well formed', () => {
  const seen = new Set()
  for (const s of PATTERNS) {
    assert.ok(!seen.has(s.name), `duplicate pattern ${s.name}`)
    seen.add(s.name)
    assert.ok(s.pivots >= 3 && s.pivots <= 5, `${s.name}: odd pivot count`)
    assert.ok(s.prz.length >= 1, `${s.name}: a pattern needs at least one projection`)
    // Every index must address a CONFIRMED pivot. An index equal to s.pivots would be the
    // completion point D, which does not exist yet when the pattern is registered — that was
    // a real bug here, and this is the assertion that would have caught it.
    for (const w of [...s.prz, ...(s.confluence ? [s.confluence] : [])]) {
      assert.ok(w.min <= w.max, `${s.name}: inverted window`)
      assert.ok(w.ref >= 0 && w.ref < s.pivots, `${s.name}: ref out of range`)
      for (const i of w.b) assert.ok(i >= 0 && i < s.pivots, `${s.name}: base out of range`)
    }
    for (const r of s.ratios) {
      assert.ok(r.min <= r.max, `${s.name}: inverted ratio window`)
      for (const i of [...r.a, ...r.b]) assert.ok(i >= 0 && i < s.pivots, `${s.name}: index out of range`)
    }
  }
})

// ---------------------------------------------------------------- the trade

// Bars that walk a path of prices in small steps, so a pattern described by its pivot
// prices can be turned into a real series the scanner has to rediscover on its own.
function barsAlong(path, step = 1) {
  const out = []
  for (let k = 0; k < path.length - 1; k += 1) {
    const [from, to] = [path[k], path[k + 1]]
    const n = Math.max(2, Math.round(Math.abs(to - from) / step))
    for (let i = 1; i <= n; i += 1) {
      const c = from + ((to - from) * i) / n
      const p = from + ((to - from) * (i - 1)) / n
      out.push({ o: p, h: Math.max(p, c), l: Math.min(p, c), c })
    }
  }
  return out
}

// The pivot prices of one textbook bullish Gartley, scaled and shifted, ending with the move
// that completes it in the PRZ and then rallies.
const gartleyPath = (scale, base) => {
  const X = base
  const A = base + 100 * scale
  const B = A - 0.618 * (A - X)
  const C = B + 0.728 * (A - B)
  const D = A - 0.786 * (A - X)
  // The lead-in has to outlast the 14-bar ATR warmup, or the zigzag starts mid-leg and the
  // planted X is not the X the scanner sees.
  return [base + 40 * scale, base + 12 * scale, X, A, B, C, D, D + 0.55 * (A - D)]
}

/** A long series with `n` planted Gartleys, alternating bullish and mirrored bearish. */
function planted(n) {
  let bars = []
  for (let k = 0; k < n; k += 1) {
    const scale = 1 + (k % 3) * 0.4
    const path = gartleyPath(scale, 100 + (k % 5) * 20)
    bars = bars.concat(barsAlong(k % 2 === 0 ? path : path.map((p) => 500 - p)))
  }
  return bars
}

test('a Gartley planted in real bars is rediscovered, entered in its PRZ, and pays T1', () => {
  const bars = barsAlong(gartleyPath(1, 100))
  const { registered, trades } = scan(bars)
  const g = registered.filter((p) => p.pattern === 'Gartley' && p.side === 'long')
  assert.equal(g.length, 1, `expected one planted Gartley, got ${registered.map((p) => p.pattern).join(',')}`)
  // Its PRZ must contain the 0.786 completion the pattern was built around.
  assert.ok(g[0].przLo <= 121.4 && 121.4 <= g[0].przHi, `PRZ ${g[0].przLo}..${g[0].przHi}`)

  const t = trades.find((x) => x.pattern === 'Gartley')
  assert.ok(t, 'the planted pattern should have filled')
  assert.equal(t.outcome, 't1')
  assert.ok(t.r > 0)
  assert.ok(t.entry <= g[0].przHi + 1e-9 && t.entry >= g[0].przLo - 1e-9, 'entry must be inside the zone')
  assert.ok(t.stop < g[0].przLo, 'the stop sits beyond the far edge')
})

test('a trade stops out rather than winning when one bar covers both exits', () => {
  // §1.6: intrabar order is unknown, so the stop is taken. Build a pattern, then a single
  // enormous bar after entry that reaches the target and the stop at once.
  const p = {
    s: 1,
    pattern: 'X',
    side: 'long',
    points: [{ index: 0, price: 100 }, { index: 10, price: 200 }],
    confirmedAt: 10,
    przLo: 119,
    przHi: 121,
    vA: 200,
    vC: 210,
  }
  const bars = [
    ...Array.from({ length: 11 }, () => ({ o: 150, h: 151, l: 149, c: 150 })),
    { o: 130, h: 131, l: 120, c: 125 }, // fills at 121
    { o: 125, h: 400, l: 10, c: 200 }, // reaches T1 and the stop in one bar
  ]
  const atr = bars.map(() => 2)
  const t = runPattern(p, bars, atr)
  assert.equal(t.filled, true)
  assert.equal(t.outcome, 'stop', 'the ambiguous bar must resolve against the trade')
  assert.ok(t.r < 0)
})

test('R is exactly -1 on a stop and the target pays what the geometry says', () => {
  const base = {
    s: 1, pattern: 'X', side: 'long',
    points: [{ index: 0, price: 100 }, { index: 10, price: 200 }],
    confirmedAt: 10, przLo: 110, przHi: 120, vA: 200, vC: 210,
  }
  const lead = Array.from({ length: 11 }, () => ({ o: 150, h: 151, l: 149, c: 150 }))
  const atr = Array.from({ length: 40 }, () => 4) // stop = 110 - 0.25*4 = 109

  const stopped = runPattern(base, [...lead, { o: 125, h: 126, l: 119, c: 120 }, { o: 120, h: 121, l: 100, c: 105 }], atr)
  assert.equal(stopped.outcome, 'stop')
  assert.ok(Math.abs(stopped.r + 1) < 1e-12, `R on a stop must be exactly -1, got ${stopped.r}`)

  // entry 120, stop 109, risk 11. T1 = 120 + 0.382*(200-120) = 150.56 -> R = 30.56/11 = 2.778
  const won = runPattern(base, [...lead, { o: 125, h: 126, l: 119, c: 120 }, { o: 120, h: 160, l: 119.5, c: 158 }], atr)
  assert.equal(won.outcome, 't1')
  assert.ok(Math.abs(won.r - (0.382 * 80) / 11) < 1e-9, `got ${won.r}`)
})

test('a pattern whose zone is never reached is not a trade', () => {
  const p = {
    s: 1, pattern: 'X', side: 'long',
    points: [{ index: 0, price: 100 }, { index: 10, price: 200 }],
    confirmedAt: 10, przLo: 110, przHi: 120, vA: 200, vC: 210,
  }
  const bars = [
    ...Array.from({ length: 11 }, () => ({ o: 150, h: 151, l: 149, c: 150 })),
    ...Array.from({ length: 60 }, () => ({ o: 150, h: 151, l: 149, c: 150 })),
  ]
  const t = runPattern(p, bars, bars.map(() => 2))
  assert.equal(t.filled, false)
  assert.equal(t.reason, 'expired')
})

test('price breaking beyond C kills the pattern before it can fill', () => {
  const p = {
    s: 1, pattern: 'X', side: 'long',
    points: [{ index: 0, price: 100 }, { index: 10, price: 200 }],
    confirmedAt: 10, przLo: 110, przHi: 120, vA: 200, vC: 210,
  }
  const bars = [
    ...Array.from({ length: 11 }, () => ({ o: 150, h: 151, l: 149, c: 150 })),
    { o: 150, h: 215, l: 149, c: 214 }, // through C
    { o: 214, h: 215, l: 100, c: 115 }, // would have filled, but the structure is gone
  ]
  const t = runPattern(p, bars, bars.map(() => 2))
  assert.equal(t.filled, false)
  assert.equal(t.reason, 'broke-C')
})

// ---------------------------------------------------------------- no look-ahead §1.7

test('truncating the series changes nothing that was already known', () => {
  const bars = planted(40)
  const T = Math.floor(bars.length * 0.62)
  const full = scan(bars)
  const cut = scan(bars.slice(0, T + 1))

  const early = (list) => list.filter((p) => p.confirmedAt <= T)
  const fullEarly = early(full.registered)
  const cutEarly = early(cut.registered)
  assert.ok(fullEarly.length > 20, `too few patterns to be a real test: ${fullEarly.length}`)
  assert.equal(cutEarly.length, fullEarly.length, 'the number of patterns known by T must not depend on later bars')
  for (let i = 0; i < fullEarly.length; i += 1) {
    const a = fullEarly[i]
    const b = cutEarly[i]
    assert.equal(b.pattern, a.pattern)
    assert.equal(b.side, a.side)
    assert.equal(b.confirmedAt, a.confirmedAt)
    assert.equal(b.przLo, a.przLo, `${a.pattern}@${a.confirmedAt}: PRZ moved when later bars were removed`)
    assert.equal(b.przHi, a.przHi)
  }
})

test('a trade that already closed reads the same when the future is truncated away', () => {
  const bars = planted(40)
  const T = Math.floor(bars.length * 0.75)
  const full = scan(bars)
  const cut = scan(bars.slice(0, T + 1))
  const done = full.trades.filter((t) => t.exitAt <= T)
  assert.ok(done.length > 10, `too few closed trades to be a real test: ${done.length}`)
  for (const t of done) {
    const m = cut.trades.find((u) => u.confirmedAt === t.confirmedAt && u.pattern === t.pattern && u.side === t.side)
    assert.ok(m, `${t.pattern}@${t.confirmedAt} vanished when the series was cut`)
    assert.equal(m.entryAt, t.entryAt)
    assert.equal(m.outcome, t.outcome)
    assert.equal(m.r, t.r)
  }
})

test('mutating a later bar cannot change anything at or before T', () => {
  const bars = planted(40)
  const T = Math.floor(bars.length * 0.62)
  const tampered = bars.map((b, i) => (i > T ? { o: b.o * 3, h: b.h * 3.4, l: b.l * 2.5, c: b.c * 3 } : b))
  const a = scan(bars).registered.filter((p) => p.confirmedAt <= T)
  const b = scan(tampered).registered.filter((p) => p.confirmedAt <= T)
  assert.equal(b.length, a.length)
  for (let i = 0; i < a.length; i += 1) {
    assert.equal(b[i].pattern, a[i].pattern)
    assert.equal(b[i].confirmedAt, a[i].confirmedAt)
    assert.equal(b[i].przLo, a[i].przLo)
    assert.equal(b[i].przHi, a[i].przHi)
  }
})

test('a pattern is never registered before its last pivot is confirmed', () => {
  const bars = planted(12)
  const { registered } = scan(bars)
  assert.ok(registered.length > 0)
  for (const p of registered) {
    const last = p.points[p.points.length - 1]
    assert.ok(p.confirmedAt > last.index, `${p.pattern}: confirmed at ${p.confirmedAt} but its last pivot is at ${last.index}`)
  }
})

test('entry never happens before the confirmation bar has closed', () => {
  const bars = planted(40)
  for (const t of scan(bars).trades) {
    assert.ok(t.entryAt > t.confirmedAt, `${t.pattern}: entered at ${t.entryAt}, confirmed at ${t.confirmedAt}`)
  }
})
