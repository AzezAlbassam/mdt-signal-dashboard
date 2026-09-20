import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { outerBand, gapThrough } from '../lib/implied-move.js'
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
