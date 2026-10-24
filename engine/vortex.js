// The "O → D" vortex — a reconstruction of the 3D indicator @dimitri41201857 posted as a
// 30-second screen video on US500 2h ("Price revolves around the vector · back wall = chart,
// floor = hidden depth"). We have five phone screenshots of it, and every readout on them is
// reproduced exactly from PEPPERSTONE:US500 data by the arithmetic below
// (see test/vortex.test.js).
//
// The construction, in full:
//
//   O, D        two anchor candles, N = D − O candles apart, priced at O's high and D's low
//               (for a falling leg; low and high for a rising one)
//   vector(i)   = O + (D − O)·i/N                     the straight line O → D
//   shape(i)    = √(1 − (2i/N − 1)²)                  half an ellipse: 0 at O and D, 1 mid-way
//   dev(i)      = price(i) − vector(i)                price = OHLC4
//   Wup, Wdn    = largest dev/shape above / below the vector, over i ∈ [skip, N − skip]
//   wall(i)     = W·shape(i)                          the ellipse drawn around the vector
//   e(i)        = dev/wall, signed                    "Position e": +1 on the upper wall
//   contacts    = runs with |e| ≥ contactLevel        "WALL CONTACTS · POTENTIAL TRADES"
//
// with skip = round(3% · N) ("Ignore near O and D 3%") and contactLevel 0.85 ("Contact level
// 85%"). Above the vector is "short", below is "long", whichever way O → D runs.
//
// The "Angle θ" readout and the hidden third dimension come from half-turns, not from e:
//
//   half-turns  sign runs of dev; a run whose largest |dev| is under 10% of |D − O| is
//               absorbed into its neighbours ("Minimum half-turn size 10%")
//   A_k, p_k    the largest |dev| in half-turn k, in points, and the candle it falls on
//   α(i)        = asin(√(|dev|/A_k))                   0 on the vector, 90° at the extreme
//   θ(i)        = 180k + α before p_k, 180k + 180 − α after it
//   trigX(i)    = sgn(cos θ) · min(|e|·√(1 − (|dev|/A_k)²), √(1 − e²))
//   depth(i)    = trigX · wall(i)                      the "floor = hidden depth" coordinate
//
// so O is 0°, the first low 90°, the crossing 180°, the largest deviation above 270° and D
// 360°. The trig-circle dot is drawn at (trigX, e), which is why its polar angle is not θ.
// A_k is the extreme of the WHOLE half-turn, so θ at a candle depends on candles up to
// ~300 later — the same hindsight as the walls, one level deeper.
//
// WHY IT LOOKS PERFECT, stated once here because it is the whole story: the walls are sized
// from the window's own largest deviations, measured over every candle from O to D. So e is
// exactly ±1 at those candles by construction, and at least one "contact" per side is
// guaranteed — whatever the market did. D is not a level anyone could know at the time either:
// on the video's chart it is the lowest low in the entire ten months of data. The replay's
// black "past" / grey "future" split hides that every wall on screen was drawn with the grey
// part already known. Live, with D still in the future, there is no N, no vector, no shape and
// no wall — nothing here can be computed. This module exists to make that concrete and
// testable, not to trade it.
//
// One thing is inference rather than reading: at the anchor candles themselves price is
// pinned to the anchor price. The candle-0 frame shows Price 7003.3 = O and Distance 0.0 %,
// not the OHLC4 of 6996.6. We pin D the same way by symmetry; no screenshot shows candle 475.
// θ reproduces all four readouts (206°, 212°, 241°, 238°) to within 0.42° with no fitted
// constant, and trigX lands on the red dot's measured pixel position to within 0.004 of the
// circle's radius.
//
// The video does not show how O and D were picked. zigzag() is our mechanical stand-in for
// that choice — a swing filter by fractional reversal — not a parameter of his.

/** On-screen "Price": the mean of open, high, low and close. */
export function ohlc4(bar) {
  return (bar.o + bar.h + bar.l + bar.c) / 4
}

/** Half an ellipse over 0..N: 0 at both ends, 1 in the middle. */
const ellipse = (i, N) => Math.sqrt(Math.max(0, 1 - (2 * i / N - 1) ** 2))

/**
 * Everything the indicator draws for one O → D leg.
 *
 * `o` and `d` are indices into `bars` (o < d). Arrays in the result run 0..N relative to `o`,
 * and so do contact indices. `wallUp` and `wallDn` are both positive distances from the
 * vector; `distancePct` is |dev| as a percentage of |D − O|. `theta` is in degrees and
 * unwrapped (180° per half-turn, so D reads 360° on a two-half-turn leg); `trigX` is the
 * trig-circle abscissa in wall units and `depth` the same in points.
 */
export function buildVortex(
  bars,
  { o, d, oPrice, dPrice, skipFrac = 0.03, contactLevel = 0.85, minHalfTurn = 0.1 } = {},
) {
  if (!Number.isInteger(o) || !Number.isInteger(d) || o < 0 || d >= bars.length || o >= d) {
    throw new RangeError(`need integer anchors 0 <= o < d < ${bars.length}, got o=${o} d=${d}`)
  }
  if (!(skipFrac >= 0 && skipFrac < 0.5)) {
    throw new RangeError(`skipFrac must be in [0, 0.5), got ${skipFrac}`)
  }
  if (!(contactLevel > 0) || !Number.isFinite(contactLevel)) {
    throw new RangeError(`contactLevel must be positive, got ${contactLevel}`)
  }

  // Direction: from whichever anchor prices were given, falling back to the closes.
  const falling = (dPrice ?? bars[d].c) < (oPrice ?? bars[o].c)
  const O = oPrice ?? (falling ? bars[o].h : bars[o].l)
  const D = dPrice ?? (falling ? bars[d].l : bars[d].h)
  if (!Number.isFinite(O) || !Number.isFinite(D) || O === D) {
    throw new RangeError(`O and D need distinct finite prices, got ${O} and ${D}`)
  }

  const N = d - o
  const skip = Math.round(skipFrac * N)
  const span = Math.abs(D - O)

  const vector = []
  const shape = []
  const price = []
  const dev = []
  for (let i = 0; i <= N; i += 1) {
    vector.push(O + ((D - O) * i) / N)
    shape.push(ellipse(i, N))
    price.push(i === 0 ? O : i === N ? D : ohlc4(bars[o + i]))
    dev.push(price[i] - vector[i])
  }

  // The walls: the largest normalised deviation either side, over the whole window at once —
  // the step that uses the future relative to every candle before the extreme.
  let Wup = 0
  let Wdn = 0
  for (let i = skip; i <= N - skip; i += 1) {
    if (shape[i] === 0) continue
    Wup = Math.max(Wup, dev[i] / shape[i])
    Wdn = Math.max(Wdn, -dev[i] / shape[i])
  }

  const wallUp = shape.map((s) => Wup * s)
  const wallDn = shape.map((s) => Wdn * s)
  // Written as (dev/shape)/W rather than dev/(W·shape) so the extreme candle lands on ±1
  // exactly, not one rounding error away from it. A zero wall (at O and D, or on a side price
  // never visited inside the window) reads as 0.
  const e = dev.map((x, i) => {
    const W = x > 0 ? Wup : Wdn
    return shape[i] === 0 || W === 0 ? 0 : x / shape[i] / W
  })
  const distancePct = dev.map((x) => (100 * Math.abs(x)) / span)

  // Contacts: maximal same-side runs with |e| >= contactLevel inside [skip, N − skip],
  // each reported at its peak |e| (first one on a tie).
  const contacts = []
  let run = null
  const close = (end) => {
    let peakIndex = run.start
    for (let j = run.start + 1; j <= end; j += 1) {
      if (Math.abs(e[j]) > Math.abs(e[peakIndex])) peakIndex = j
    }
    contacts.push({
      start: run.start,
      end,
      candles: end - run.start + 1,
      side: run.sign > 0 ? 'short' : 'long',
      peakIndex,
      peakE: e[peakIndex],
      price: price[peakIndex],
    })
    run = null
  }
  for (let i = skip; i <= N - skip; i += 1) {
    const sign = Math.abs(e[i]) >= contactLevel ? Math.sign(e[i]) : 0
    if (run && sign !== run.sign) close(i - 1)
    if (sign !== 0 && !run) run = { start: i, sign }
  }
  if (run) close(N - skip)

  const halves = halfTurns(dev, minHalfTurn * span)
  const theta = []
  const trigX = []
  for (const [k, h] of halves.entries()) {
    for (let i = h.start; i <= h.end; i += 1) {
      const u = h.amp === 0 ? 0 : Math.min(1, Math.abs(dev[i]) / h.amp)
      const alpha = (Math.asin(Math.sqrt(u)) * 180) / Math.PI
      theta[i] = 180 * k + (i <= h.peakIndex ? alpha : 180 - alpha)
      // The min() keeps the dot inside the unit circle; it only bites near |e| = 1.
      const r = Math.min(Math.abs(e[i]) * Math.sqrt(1 - u * u), Math.sqrt(Math.max(0, 1 - e[i] * e[i])))
      trigX[i] = Math.sign(Math.round(Math.cos((theta[i] * Math.PI) / 180) * 1e12)) * r
    }
  }
  const depth = trigX.map((x, i) => x * (dev[i] > 0 ? wallUp[i] : wallDn[i]))

  return {
    N,
    oPrice: O,
    dPrice: D,
    skip,
    Wup,
    Wdn,
    vector,
    shape,
    price,
    dev,
    wallUp,
    wallDn,
    e,
    distancePct,
    contacts,
    halves,
    theta,
    trigX,
    depth,
  }
}

/**
 * Split 0..N into half-turns: same-sign runs of `dev`, where a run whose largest |dev| is
 * under `minAmp` points does not start a half-turn of its own and stays inside whichever
 * half-turn it falls in. Each half-turn carries its largest |dev| (`amp`) and where it falls.
 */
export function halfTurns(dev, minAmp) {
  const N = dev.length - 1
  const runs = []
  let a = 0
  for (let i = 1; i <= N + 1; i += 1) {
    if (i > N || (Math.sign(dev[i]) !== Math.sign(dev[a]) && dev[i] !== 0)) {
      let peakIndex = a
      for (let j = a; j < i; j += 1) if (Math.abs(dev[j]) > Math.abs(dev[peakIndex])) peakIndex = j
      runs.push({ start: a, end: i - 1, sign: Math.sign(dev[peakIndex]), amp: Math.abs(dev[peakIndex]), peakIndex })
      a = i
    }
  }

  const halves = []
  for (const r of runs.filter((x) => x.amp >= minAmp && x.amp > 0)) {
    const last = halves.at(-1)
    if (last && last.sign === r.sign) {
      if (r.amp > last.amp) Object.assign(last, { amp: r.amp, peakIndex: r.peakIndex })
      last.end = r.end
    } else {
      halves.push({ ...r })
    }
  }
  if (halves.length === 0) {
    const peakIndex = dev.reduce((p, x, i) => (Math.abs(x) > Math.abs(dev[p]) ? i : p), 0)
    return [{ start: 0, end: N, sign: Math.sign(dev[peakIndex]), amp: Math.abs(dev[peakIndex]), peakIndex }]
  }
  // Small runs before a new half-turn belong to the one before it.
  halves[0].start = 0
  for (let k = 1; k < halves.length; k += 1) halves[k - 1].end = halves[k].start - 1
  halves.at(-1).end = N
  return halves
}

/**
 * Alternating swing pivots on highs and lows: a high is confirmed once a later low sits
 * `threshold` (a fraction, e.g. 0.03) below it, a low once a later high sits that far above.
 *
 * Only confirmed pivots are returned, so the still-forming last swing never appears — the
 * no-hindsight rule the vortex itself does not follow. Indices are into `bars`.
 */
export function zigzag(bars, threshold) {
  if (!(threshold > 0 && threshold < 1)) {
    throw new RangeError(`threshold must be a fraction in (0, 1), got ${threshold}`)
  }

  const pivots = []
  if (bars.length === 0) return pivots

  // Until the first swing is big enough, track both extremes; whichever came first is
  // the first pivot.
  let dir = 0
  let hi = 0
  let lo = 0
  let cand = 0
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i]
    if (dir === 0) {
      if (b.h > bars[hi].h) hi = i
      if (b.l < bars[lo].l) lo = i
      if (lo < hi && bars[hi].h >= bars[lo].l * (1 + threshold)) {
        pivots.push({ index: lo, price: bars[lo].l, kind: 'low' })
        dir = 1
        cand = hi
      } else if (hi < lo && bars[lo].l <= bars[hi].h * (1 - threshold)) {
        pivots.push({ index: hi, price: bars[hi].h, kind: 'high' })
        dir = -1
        cand = lo
      }
    } else if (dir === 1) {
      if (b.h > bars[cand].h) {
        cand = i
      } else if (b.l <= bars[cand].h * (1 - threshold)) {
        pivots.push({ index: cand, price: bars[cand].h, kind: 'high' })
        dir = -1
        cand = i
      }
    } else if (b.l < bars[cand].l) {
      cand = i
    } else if (b.h >= bars[cand].l * (1 + threshold)) {
      pivots.push({ index: cand, price: bars[cand].l, kind: 'low' })
      dir = 1
      cand = i
    }
  }
  return pivots
}
