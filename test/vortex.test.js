// Golden cases for the "US500 · 2h · O → D" vortex — the 3D indicator @dimitri41201857 posted
// as a 30-second screen video. We have five screenshots of it, at candles 0, 77, 140, 195 and
// 231 of 475. Panel title, verbatim:
//
//   "US500 · 2h · O → D — Price revolves around the vector · back wall = chart,
//    floor = hidden depth"
//
// with settings "Contact level 85 %", "Ignore near O and D 3 %", "Minimum half-turn size 10 %".
//
// Every expected string in the frames block is a readout copied off those screenshots, at
// the precision the screen shows it; the anchors block derives the constants behind them
// and says where each comes from. The data is the fixture next to this
// file: PEPPERSTONE:US500 1h from TradingView, bucketed into 2h candles on New York wall-clock
// time. These tests are the contract: engine/vortex.js is correct only when it reproduces
// what the video shows. The remaining blocks pin the properties that explain WHY it shows it.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { ohlc4, buildVortex, zigzag } from '../engine/vortex.js'

const { bars } = JSON.parse(
  fs.readFileSync(new URL('./fixtures/us500-2h-ny-2026-02-03_2026-03-30.json', import.meta.url), 'utf8'),
)

// The screen's number formats: "6,939.8", "+421.8", "+0.52", "25 Feb 2026 · 12:00".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const grouped = (n, digits = 1) => n.toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const signed = (n, digits) => (n >= 0 ? '+' : '-') + Math.abs(n).toFixed(digits)
const day = (t) => `${t.slice(8, 10)} ${MONTHS[Number(t.slice(5, 7)) - 1]}`
const stamp = (t) => `${day(t)} ${t.slice(0, 4)} · ${t.slice(11, 16)}`

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)

const vortex = buildVortex(bars, { o: 0, d: 475 })

describe('US500 2h O → D — the anchors and walls behind the screenshots', () => {
  test('O is 03 Feb 02:00 at its high 7003.3, D is 30 Mar 20:00 at its low 6311.6, 475 candles apart', () => {
    // Screen: "O · 0°" at 7,003.3 on the price axis, "D · 360°", and "Candle … / 475".
    assert.equal(bars[0].t, '2026-02-03T02:00')
    assert.equal(bars[475].t, '2026-03-30T20:00')
    assert.equal(vortex.oPrice, 7003.3)
    assert.equal(vortex.dPrice, 6311.6)
    assert.equal(vortex.N, 475)
  })

  test('"Ignore near O and D 3 %" is 14 candles at each end', () => {
    assert.equal(vortex.skip, 14) // round(0.03 × 475)
  })

  test('the walls: 428.76 above the vector, 397.41 below', () => {
    // Not printed on screen as such — it is the one constant that turns all four
    // "Wall at this time" readouts into W·shape, and the extremes it comes from are
    // the two contact peaks below.
    assert.equal(vortex.Wup.toFixed(2), '428.76')
    assert.equal(vortex.Wdn.toFixed(2), '397.41')
    for (const i of [77, 140, 195, 231]) {
      close(vortex.wallUp[i] / vortex.shape[i], vortex.Wup)
    }
  })
})

describe('US500 2h O → D — every readout on the five frames', () => {
  // Readout panel, top to bottom: Date, Price, Vector, Distance, Wall at this time,
  // Position e, Angle θ, Candle.
  const frames = [
    // candle 0 — the first frame. Price shows O itself (7,003.3), not the candle's OHLC4.
    { i: 0, date: '03 Feb 2026 · 02:00', price: '7,003.3', vector: '7,003.3', distance: '0.0 % · 0.0 pts', wall: '+0.0 pts', e: '+0.00', theta: '0°' },
    { i: 77, date: '11 Feb 2026 · 12:00', price: '6,946.0', vector: '6,891.2', distance: '7.9 % · 54.8 pts', wall: '+316.0 pts', e: '+0.17', theta: '206°' },
    { i: 140, date: '18 Feb 2026 · 22:00', price: '6,880.5', vector: '6,799.4', distance: '11.7 % · 81.1 pts', wall: '+391.0 pts', e: '+0.21', theta: '212°' },
    { i: 195, date: '25 Feb 2026 · 12:00', price: '6,939.8', vector: '6,719.3', distance: '31.9 % · 220.4 pts', wall: '+421.8 pts', e: '+0.52', theta: '241°' },
    { i: 231, date: '02 Mar 2026 · 12:00', price: '6,876.0', vector: '6,666.9', distance: '30.2 % · 209.1 pts', wall: '+428.6 pts', e: '+0.49', theta: '238°' },
  ]

  for (const f of frames) {
    test(`candle ${f.i} / 475 — ${f.date}`, () => {
      const i = f.i
      assert.equal(stamp(bars[i].t), f.date)
      assert.equal(grouped(vortex.price[i]), f.price)
      assert.equal(grouped(vortex.vector[i]), f.vector)
      assert.equal(
        `${vortex.distancePct[i].toFixed(1)} % · ${Math.abs(vortex.dev[i]).toFixed(1)} pts`,
        f.distance,
      )
      assert.equal(`${signed(vortex.wallUp[i], 1)} pts`, f.wall)
      assert.equal(signed(vortex.e[i], 2), f.e)
      assert.equal(`${Math.round(vortex.theta[i]) % 360}°`, f.theta)
    })
  }

  test('away from the anchors, Price is the candle OHLC4', () => {
    for (const i of [77, 140, 195, 231]) {
      assert.equal(vortex.price[i], ohlc4(bars[i]))
    }
    // ...but at candle 0 the screen shows O, where OHLC4 would read 6,996.6.
    assert.equal(grouped(ohlc4(bars[0])), '6,996.6')
    assert.equal(vortex.price[0], 7003.3)
  })

  test('"WALL CONTACTS · POTENTIAL TRADES" — exactly the three on screen', () => {
    // Screen, verbatim:
    //   05 Feb           long  · 6,757.5 · 4 candles    -1.00
    //   24 Mar → 26 Mar  short · 6,586.6 · 20 candles   +1.00
    //   27 Mar           short · 6,507.4 · 2 candles    +0.94
    const shown = vortex.contacts.map((c) => {
      const from = day(bars[c.start].t)
      const to = day(bars[c.end].t)
      return {
        when: from === to ? from : `${from} → ${to}`,
        detail: `${c.side} · ${grouped(c.price)} · ${c.candles} candles`,
        e: signed(c.peakE, 2),
      }
    })
    assert.deepEqual(shown, [
      { when: '05 Feb', detail: 'long · 6,757.5 · 4 candles', e: '-1.00' },
      { when: '24 Mar → 26 Mar', detail: 'short · 6,586.6 · 20 candles', e: '+1.00' },
      { when: '27 Mar', detail: 'short · 6,507.4 · 2 candles', e: '+0.94' },
    ])
  })

  test('contact spans and peaks, to the candle', () => {
    const spans = vortex.contacts.map((c) => [bars[c.start].t, bars[c.end].t, bars[c.peakIndex].t])
    assert.deepEqual(spans, [
      ['2026-02-05T16:00', '2026-02-05T22:00', '2026-02-05T18:00'],
      ['2026-03-24T20:00', '2026-03-26T10:00', '2026-03-25T22:00'],
      ['2026-03-27T00:00', '2026-03-27T02:00', '2026-03-27T02:00'],
    ])
  })
})

describe('Angle θ and the hidden depth — half-turns', () => {
  test('two half-turns: below the vector to candle 51, above it from 52 to D', () => {
    // "Minimum half-turn size 10 %" = 69.17 pts here, which absorbs the −45 pt dip at
    // candles 89–122. The 3D panel's "180°" marker sits on the vector at candle ≈52.
    const h = vortex.halves.map((x) => [x.start, x.end, x.sign, x.amp.toFixed(2), x.peakIndex])
    assert.deepEqual(h, [
      [0, 51, -1, '199.23', 32],
      [52, 475, 1, '290.55', 371],
    ])
  })

  test('θ at the landmarks: O 0°, first low 90°, largest rise 270°, D 360°', () => {
    assert.equal(vortex.theta[0], 0)
    assert.equal(vortex.theta[32], 90)
    assert.equal(vortex.theta[371], 270)
    assert.equal(vortex.theta[475], 360)
  })

  test('θ within half a degree of every readout, unrounded', () => {
    // On screen: 206°, 212°, 241°, 238°. No constant is fitted anywhere.
    const want = { 77: 206, 140: 212, 195: 241, 231: 238 }
    for (const [i, deg] of Object.entries(want)) close(vortex.theta[i], deg, 0.5)
  })

  test('the red dot sits at (trigX, e), measured off the screenshots to ±0.005 of the radius', () => {
    // Pixel positions of the red dot, as a fraction of the circle's radius (left = negative).
    const measured = { 77: -0.168, 140: -0.199, 195: -0.341, 231: -0.337 }
    for (const [i, x] of Object.entries(measured)) close(vortex.trigX[i], x, 0.005)
  })

  test('the dot is not drawn at θ: its polar angle differs by up to 20°', () => {
    // So "Angle θ" and the dot are two different quantities sharing one circle.
    const polar = (i) => (Math.atan2(vortex.e[i], vortex.trigX[i]) * -180) / Math.PI + 360
    assert.ok(Math.abs(polar(77) - vortex.theta[77]) > 15)
    assert.ok(Math.abs(polar(195) - vortex.theta[195]) < 5)
  })

  test('θ at candle 195 depends on candle 371, 176 candles later', () => {
    // A_1 = 290.55 is the largest rise of the whole half-turn, printed on 18 Mar. Lift that one
    // future candle by 100 points and the 25 Feb readout moves from 241° to 229°.
    const lifted = bars.map((b, i) => (i === 371 ? { ...b, o: b.o + 100, h: b.h + 100, l: b.l + 100, c: b.c + 100 } : b))
    const moved = buildVortex(lifted, { o: 0, d: 475 })
    assert.equal(Math.round(vortex.theta[195]), 241)
    assert.equal(Math.round(moved.theta[195]), 229)
  })
})

describe('hindsight — why the replay looks perfect', () => {
  test('e is exactly +1 and −1 at the window\'s own largest deviations', () => {
    // The walls are sized FROM these two candles, so they touch the walls by definition.
    // The "-1.00" and "+1.00" contacts on screen are this identity, not a prediction.
    const inside = vortex.e.slice(vortex.skip, vortex.N - vortex.skip + 1)
    assert.equal(Math.max(...inside), 1)
    assert.equal(Math.min(...inside), -1)
    assert.equal(vortex.e[440], 1) // 25 Mar 22:00, the "+1.00" contact
    assert.equal(vortex.e[32], -1) // 05 Feb 18:00, the "-1.00" contact
  })

  test('O is the highest high and D the lowest low of the whole window', () => {
    // And D, 6311.6, is the lowest low in the full ten months of source data
    // (2025-11-27 to 2026-10-02) — a point only knowable afterwards.
    assert.equal(Math.max(...bars.map((b) => b.h)), vortex.oPrice)
    assert.equal(Math.min(...bars.map((b) => b.l)), vortex.dPrice)
  })

  test('the reading at candle 195 changes when candle 440 — 245 candles later — changes', () => {
    // The black "past" / grey "future" split in the animation suggests e at a candle
    // uses only the black part. It does not: lift the future peak by 100 points and the
    // reading on the 25 Feb frame drops from +0.52 to +0.36.
    const altered = bars.map((b, i) => (i === 440 ? { ...b, o: b.o + 100, h: b.h + 100, l: b.l + 100, c: b.c + 100 } : b))
    const moved = buildVortex(altered, { o: 0, d: 475 })
    assert.equal(signed(vortex.e[195], 2), '+0.52')
    assert.equal(signed(moved.e[195], 2), '+0.36')
    assert.equal(moved.e[440], 1)
  })

  test('the first 3 % swing low is the −1 candle', () => {
    // The screen labels a point near the first low "90°" — the bottom of the trig circle,
    // where e = −1 puts it.
    const [first, second] = zigzag(bars, 0.03)
    assert.deepEqual(first, { index: 0, price: 7003.3, kind: 'high' })
    assert.equal(second.kind, 'low')
    assert.equal(bars[second.index].t, '2026-02-05T18:00')
    assert.equal(vortex.e[second.index], -1)
  })
})

// --- synthetic legs: a straight line O → D with chosen bumps, so dev = bump ---

const flat = (p) => ({ t: '', o: p, h: p, l: p, c: p })
const leg = (N, from, to, bumps = {}) =>
  Array.from({ length: N + 1 }, (_, i) => flat(from + ((to - from) * i) / N + (bumps[i] ?? 0)))

describe('ohlc4', () => {
  test('is the mean of open, high, low and close', () => {
    assert.equal(ohlc4({ t: '', o: 1, h: 4, l: 0, c: 3 }), 2)
  })
})

describe('the ellipse — shape(i) = √(1 − (2i/N − 1)²)', () => {
  const { shape, N } = buildVortex(leg(100, 200, 100, { 50: 1 }), { o: 0, d: 100 })

  test('is 0 at O and D and 1 mid-way', () => {
    assert.equal(shape[0], 0)
    assert.equal(shape[N], 0)
    assert.equal(shape[N / 2], 1)
  })

  test('is symmetric and never exceeds 1', () => {
    for (let i = 0; i <= N; i += 1) {
      close(shape[i], shape[N - i], 1e-12)
      assert.ok(shape[i] >= 0 && shape[i] <= 1)
    }
  })

  test('the walls pinch to nothing at the anchors', () => {
    const v = buildVortex(leg(100, 200, 100, { 50: 5, 30: -8 }), { o: 0, d: 100 })
    assert.equal(v.wallUp[0], 0)
    assert.equal(v.wallDn[100], 0)
    assert.equal(v.e[0], 0)
    assert.equal(v.e[100], 0)
  })
})

describe('e — position between the walls', () => {
  test('is ±1 exactly at the largest deviation on each side, whatever its size', () => {
    for (const size of [0.5, 5, 500]) {
      const v = buildVortex(leg(100, 200, 100, { 50: size, 30: -1.6 * size, 70: 0.3 * size }), { o: 0, d: 100 })
      assert.equal(v.e[50], 1)
      assert.equal(v.e[30], -1)
      close(v.e[70], (0.3 / v.shape[70]), 1e-9) // Wup = size/shape(50) = size
    }
  })

  test('above the vector is "short", below is "long"', () => {
    const v = buildVortex(leg(100, 200, 100, { 50: 5, 30: -8 }), { o: 0, d: 100 })
    assert.deepEqual(
      v.contacts.map((c) => [c.peakIndex, c.side, c.peakE]),
      [
        [30, 'long', -1],
        [50, 'short', 1],
      ],
    )
  })

  test('distancePct is |dev| as a percentage of the O → D span', () => {
    const v = buildVortex(leg(100, 200, 100, { 50: 5 }), { o: 0, d: 100 })
    close(v.distancePct[50], 5)
  })
})

describe('contacts', () => {
  test('consecutive candles over the level are one contact, reported at its peak', () => {
    const v = buildVortex(leg(100, 200, 100, { 40: 4.6, 41: 5, 42: 4.5, 60: 3, 70: -2 }), { o: 0, d: 100 })
    assert.deepEqual(v.contacts, [
      { start: 40, end: 42, candles: 3, side: 'short', peakIndex: 41, peakE: 1, price: v.price[41] },
      { start: 70, end: 70, candles: 1, side: 'long', peakIndex: 70, peakE: -1, price: v.price[70] },
    ])
  })

  test('contactLevel sets the threshold', () => {
    const bumps = { 40: 4.6, 41: 5, 42: 4.5, 70: -2 }
    const tight = buildVortex(leg(100, 200, 100, bumps), { o: 0, d: 100, contactLevel: 0.95 })
    assert.deepEqual(tight.contacts.map((c) => [c.start, c.end]), [[41, 41], [70, 70]])
  })

  test('honour skipFrac: nothing inside the ignored ends counts, nor sizes the walls', () => {
    // A huge spike at candle 2 of 100 sits inside the 3 % skip zone (3 candles).
    const bars100 = leg(100, 200, 100, { 2: 10, 30: -8, 50: 5 })
    const v = buildVortex(bars100, { o: 0, d: 100 })
    assert.equal(v.skip, 3)
    assert.equal(v.Wup, 5) // from candle 50, not the spike
    assert.ok(v.e[2] > 7) // off the chart, but ignored
    assert.deepEqual(v.contacts.map((c) => c.peakIndex), [30, 50])

    // With no skip the spike sizes the upper wall and swallows the candle-50 contact.
    const all = buildVortex(bars100, { o: 0, d: 100, skipFrac: 0 })
    assert.equal(all.skip, 0)
    assert.equal(all.e[2], 1)
    assert.deepEqual(all.contacts.map((c) => [c.peakIndex, c.side]), [[2, 'short'], [30, 'long']])
  })

  test('indices are relative to o', () => {
    const padded = [flat(999), flat(999), ...leg(100, 200, 100, { 50: 5, 30: -8 }), flat(1)]
    const v = buildVortex(padded, { o: 2, d: 102 })
    assert.equal(v.N, 100)
    assert.deepEqual(v.contacts.map((c) => c.peakIndex), [30, 50])
  })
})

describe('direction — falling and rising O → D', () => {
  test('a rising leg anchors on O\'s low and D\'s high, and reads the same way', () => {
    const rising = leg(100, 100, 200, { 50: 5, 30: -8 })
    rising[0] = { t: '', o: 101, h: 102, l: 100, c: 101 }
    rising[100] = { t: '', o: 199, h: 200, l: 198, c: 199 }
    const v = buildVortex(rising, { o: 0, d: 100 })
    assert.equal(v.oPrice, 100)
    assert.equal(v.dPrice, 200)
    assert.deepEqual(v.contacts.map((c) => [c.peakIndex, c.side, c.peakE]), [[30, 'long', -1], [50, 'short', 1]])
  })

  test('the US500 leg mirrored into a rising one gives the mirrored reading', () => {
    // Reflect every price through 7000: highs become lows and the leg rises from 6996.7 to
    // 7688.4. Above and below swap, so e flips sign and the walls trade places.
    const K = 14000
    const mirrored = bars.map((b) => ({ t: b.t, o: K - b.o, h: K - b.l, l: K - b.h, c: K - b.c }))
    const m = buildVortex(mirrored, { o: 0, d: 475 })
    close(m.oPrice, K - vortex.oPrice)
    close(m.dPrice, K - vortex.dPrice)
    close(m.Wup, vortex.Wdn)
    close(m.Wdn, vortex.Wup)
    for (let i = 0; i <= 475; i += 1) close(m.e[i], -vortex.e[i])
    assert.deepEqual(
      m.contacts.map((c) => [c.start, c.end, c.side]),
      vortex.contacts.map((c) => [c.start, c.end, c.side === 'long' ? 'short' : 'long']),
    )
  })

  test('direction is inferred from the closes when no anchor price is given', () => {
    const v = buildVortex(bars, { o: 0, d: 475 })
    assert.equal(v.oPrice, bars[0].h)
    assert.equal(v.dPrice, bars[475].l)
  })

  test('explicit anchor prices override the defaults', () => {
    const same = buildVortex(bars, { o: 0, d: 475, oPrice: 7003.3, dPrice: 6311.6 })
    assert.deepEqual(same, vortex)
    const closes = buildVortex(bars, { o: 0, d: 475, oPrice: bars[0].c, dPrice: bars[475].c })
    assert.equal(closes.oPrice, 6993.4)
    assert.equal(closes.dPrice, 6397.7)
  })

  test('rejects anchors that do not make a leg', () => {
    assert.throws(() => buildVortex(bars, { o: 10, d: 10 }), /o < d/)
    assert.throws(() => buildVortex(bars, { o: 0, d: 476 }), /o < d/)
    assert.throws(() => buildVortex(leg(10, 100, 100), { o: 0, d: 10 }), /distinct/)
    assert.throws(() => buildVortex(bars, { o: 0, d: 475, skipFrac: 0.5 }), /skipFrac/)
  })
})

describe('zigzag — swing pivots by fractional reversal', () => {
  // A hand-built path: 100 → 110 → 104 → 115 → 101, with a 1 % wiggle on the way up.
  const path = [100, 103, 105, 104, 107, 110, 108, 104, 109, 115, 112, 106, 101, 103]
  const series = path.map(flat)

  test('confirms each swing once price reverses by the threshold', () => {
    assert.deepEqual(zigzag(series, 0.05), [
      { index: 0, price: 100, kind: 'low' },
      { index: 5, price: 110, kind: 'high' },
      { index: 7, price: 104, kind: 'low' },
      { index: 9, price: 115, kind: 'high' },
    ])
  })

  test('reversals smaller than the threshold are not pivots', () => {
    // 110 → 104 is 5.5 %: a pivot at 5 %, not at 6 %.
    assert.deepEqual(zigzag(series, 0.06), [
      { index: 0, price: 100, kind: 'low' },
      { index: 9, price: 115, kind: 'high' },
    ])
  })

  test('only confirmed pivots: the still-forming last swing is not reported', () => {
    // The low at 101 (index 12) has only bounced 2 % — no pivot yet.
    const pivots = zigzag(series, 0.05)
    assert.ok(!pivots.some((p) => p.index === 12))
    assert.deepEqual(zigzag(path.slice(0, 5).map(flat), 0.1), [])
  })

  test('on the US500 window, pivots alternate and every leg clears the threshold', () => {
    for (const threshold of [0.01, 0.02, 0.03]) {
      const pivots = zigzag(bars, threshold)
      assert.ok(pivots.length >= 2)
      for (let k = 1; k < pivots.length; k += 1) {
        const [a, b] = [pivots[k - 1], pivots[k]]
        assert.notEqual(a.kind, b.kind)
        assert.ok(b.index > a.index)
        const move = a.kind === 'high' ? (a.price - b.price) / a.price : (b.price - a.price) / a.price
        assert.ok(move >= threshold, `leg ${a.index}→${b.index} is only ${move}`)
      }
    }
  })

  test('threshold must be a fraction', () => {
    assert.throws(() => zigzag(series, 0), /fraction/)
    assert.throws(() => zigzag(series, 3), /fraction/)
  })
})
