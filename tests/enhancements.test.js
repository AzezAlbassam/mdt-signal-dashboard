import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { outerBand, gapThrough, gapThroughZone } from '../lib/implied-move.js'
import { buildFamilies, FAMILIES, OUTER_SIGMA } from '../lib/bands.js'
import { parseChain } from '../lib/cboe-chain.js'

const market = JSON.parse(readFileSync(new URL('./fixtures/market.json', import.meta.url)))
const chain = parseChain(JSON.parse(readFileSync(new URL('./fixtures/chain-sample.json', import.meta.url))))
const closes = Object.fromEntries(market.sessions.filter((s) => s.date <= '2026-09-11').map((s) => [s.date, s.close]))

test('the outer band is the inner band scaled about the same centre, to the cent', () => {
  const inner = { center: 764.29, halfWidth: 5.70, upper: 769.99, lower: 758.59 }
  const o = outerBand(inner, 2)
  assert.equal(o.center, 764.29)
  assert.equal(o.halfWidth, 11.40)
  assert.equal(o.upper, 775.69)
  assert.equal(o.lower, 752.89)
  assert.equal(o.multiple, 2)
  assert.throws(() => outerBand(inner, 0.5), /multiple/)
})

test('the outer band multiple is two sigma and is named once', () => {
  assert.equal(OUTER_SIGMA, 2)
})

test('a session that opens beyond a band level gapped through it and offers no fill there', () => {
  const band = { upper: 769.99, lower: 758.59 }
  assert.deepEqual(gapThrough(band, { open: 757.90 }), { lower: true, upper: false })
  assert.deepEqual(gapThrough(band, { open: 770.10 }), { lower: false, upper: true })
  assert.deepEqual(gapThrough(band, { open: 764.00 }), { lower: false, upper: false })
  assert.deepEqual(gapThrough(band, { open: 758.59 }), { lower: true, upper: false }, 'opening exactly on the level counts')
})

test('the zone gap flag names which of the two lines the session opened past', () => {
  // The lower zone runs from 756.40 up to 758.59; the nearer line to the centre is its high.
  // The upper zone runs from 769.99 up to 772.10; the nearer line is its low.
  const z = { lower: { low: 756.40, high: 758.59 }, upper: { low: 769.99, high: 772.10 } }

  assert.deepEqual(gapThroughZone(z, { open: 764.00 }), {
    lower: { near: false, far: false }, upper: { near: false, far: false },
  }, 'an open inside both zones gapped through nothing')

  assert.deepEqual(gapThroughZone(z, { open: 757.50 }), {
    lower: { near: true, far: false }, upper: { near: false, far: false },
  }, 'an open inside the lower zone passed the nearer line only, so the far line still fills')

  assert.deepEqual(gapThroughZone(z, { open: 755.00 }), {
    lower: { near: true, far: true }, upper: { near: false, far: false },
  }, 'an open below the whole lower zone offers no fill anywhere in it')

  assert.deepEqual(gapThroughZone(z, { open: 771.00 }), {
    lower: { near: false, far: false }, upper: { near: true, far: false },
  }, 'the upper side reads the other way round: the zone low is the nearer line')

  assert.deepEqual(gapThroughZone(z, { open: 773.00 }), {
    lower: { near: false, far: false }, upper: { near: true, far: true },
  })

  assert.deepEqual(gapThroughZone(z, { open: 758.59 }), {
    lower: { near: true, far: false }, upper: { near: false, far: false },
  }, 'opening exactly on a line counts, as it does for a single band')
})

test('the zone gap flag agrees with the single-band flag on each of the two lines', () => {
  const plain = { upper: 772.10, lower: 756.40 }
  const ivol = { upper: 769.99, lower: 758.59 }
  const z = { lower: { low: plain.lower, high: ivol.lower }, upper: { low: ivol.upper, high: plain.upper } }
  for (const open of [750, 756.40, 757.5, 758.59, 764, 769.99, 771, 772.10, 780]) {
    const s = { open }
    const zg = gapThroughZone(z, s)
    assert.equal(zg.lower.near, gapThrough(ivol, s).lower, `lower near at ${open}`)
    assert.equal(zg.lower.far, gapThrough(plain, s).lower, `lower far at ${open}`)
    assert.equal(zg.upper.near, gapThrough(ivol, s).upper, `upper near at ${open}`)
    assert.equal(zg.upper.far, gapThrough(plain, s).upper, `upper far at ${open}`)
  }
})

test('the families now carry an outer two-sigma band for each iVol horizon', () => {
  const f = buildFamilies({ closes, chain, asOf: '2026-09-11' })
  for (const key of ['ivolDaily', 'ivolWeekly']) {
    const b = f[key]
    assert.ok(b.outer, `${key} has an outer band`)
    assert.equal(b.outer.center, b.center)
    assert.equal(b.outer.upper, Math.round((b.center + 2 * b.halfWidth) * 100) / 100)
    assert.equal(b.outer.lower, Math.round((b.center - 2 * b.halfWidth) * 100) / 100)
    assert.ok(b.outer.upper > b.upper && b.outer.lower < b.lower)
  }
  assert.equal(f.plainDaily.outer, undefined, 'the plain family prices an expiry and has no sigma multiple')
  assert.deepEqual(Object.keys(f).sort(), [...FAMILIES].sort(), 'no new family, an attribute on the existing ones')
})
