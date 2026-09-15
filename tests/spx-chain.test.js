import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseChain, contractsFor, expiriesIn, atmQuote, rootsIn } from '../lib/cboe-chain.js'

const raw = JSON.parse(readFileSync(new URL('./fixtures/spx-chain-sample.json', import.meta.url)))
const SPX_ROOTS = ['SPXW', 'SPX']
const chain = parseChain(raw, { roots: SPX_ROOTS })
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

test('both index roots are accepted and anything else is dropped', () => {
  assert.deepEqual(chain.roots, SPX_ROOTS)
  assert.deepEqual(rootsIn(chain).sort(), ['SPX', 'SPXW'])
  assert.equal(chain.rejected.adjustedRoot, 1, 'the SPXQ series')
  assert.equal(chain.spot, 7656.50)
  for (const c of chain.contracts) assert.ok(SPX_ROOTS.includes(c.root))
})

test('the weekly root wins when both roots list the same expiry', () => {
  // 2026-09-18 is listed twice. Preference order decides, and it must be the
  // close-settled series, not the one that prints on Friday's open.
  const both = chain.contracts.filter((c) => c.expiry === '2026-09-18')
  assert.equal(both.length, 4, 'two calls and two puts across the two roots')
  const chosen = contractsFor(chain, '2026-09-18')
  assert.equal(chosen.length, 2)
  for (const c of chosen) assert.equal(c.root, 'SPXW')
})

test('the settlement series can still be asked for by name', () => {
  const am = contractsFor(chain, '2026-09-18', { root: 'SPX' })
  assert.equal(am.length, 2)
  for (const c of am) assert.equal(c.root, 'SPX')
  assert.throws(() => contractsFor(chain, '2026-09-14', { root: 'SPX' }), /SPX/)
})

test('taking the wrong root on settlement Friday costs real points', () => {
  const pm = atmQuote(chain, '2026-09-18')
  const am = atmQuote(chain, '2026-09-18', { root: 'SPX' })
  near(pm.straddle, 127.90, 1e-9, 'close-settled straddle')
  near(am.straddle, 118.00, 1e-9, 'open-settled straddle')
  assert.ok(pm.straddle - am.straddle > 9,
    'nearly ten index points apart, which is a quarter of a daily band')
  near(pm.iv, 0.1512, 0.0001, 'close-settled volatility')
  near(am.iv, 0.13945, 0.0001, 'open-settled volatility, a session of variance lighter')
})

test('the index at-the-money straddle behaves like the fund, ten times over', () => {
  const q = atmQuote(chain, '2026-09-14')
  assert.equal(q.strike, 7655, 'five-point strike spacing')
  near(q.forward, 7657.00, 0.0001, 'forward from parity')
  near(q.straddle, 48.90, 1e-9, 'daily straddle in points')
  near(q.iv, 0.1529, 0.0001, 'at-the-money volatility')
  // The fund fixture priced the same session at 4.89 on a 764.29 close.
  // As a share of spot the two agree closely.
  near(q.straddle / q.forward, 4.89 / 764.25, 0.0002, 'straddle as a share of spot')
})

test('expiries list once even though one date carries two roots', () => {
  assert.deepEqual(expiriesIn(chain), ['2026-09-14', '2026-09-18', '2026-09-30'])
})

test('a single root string still works, so the fund path is unchanged', () => {
  const only = parseChain(raw, { root: 'SPXW' })
  assert.deepEqual(only.roots, ['SPXW'])
  assert.equal(only.rejected.adjustedRoot, 3, 'two monthly contracts plus the odd root')
  assert.deepEqual(expiriesIn(only), ['2026-09-14', '2026-09-18', '2026-09-30'])
  for (const c of contractsFor(only, '2026-09-18')) assert.equal(c.root, 'SPXW')
})
