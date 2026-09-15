import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  parseOccSymbol, parseChain, expiriesIn, contractsFor,
  midPrice, forwardFor, atmStrike, atmQuote, QUOTE_LIMITS,
} from '../lib/cboe-chain.js'

const raw = JSON.parse(readFileSync(new URL('./fixtures/chain-sample.json', import.meta.url)))
const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

test('OCC symbols decode to root, expiry, type and strike', () => {
  assert.deepEqual(parseOccSymbol('SPY260918C00765000'),
    { root: 'SPY', expiry: '2026-09-18', type: 'C', strike: 765 })
  assert.deepEqual(parseOccSymbol('SPY260918P00762500'),
    { root: 'SPY', expiry: '2026-09-18', type: 'P', strike: 762.5 })
  assert.deepEqual(parseOccSymbol('SPY   260918C00765000'),
    { root: 'SPY', expiry: '2026-09-18', type: 'C', strike: 765 }, 'padded form')
  // A half-dollar strike must not lose its half.
  assert.equal(parseOccSymbol('SPY260914P00764500').strike, 764.5)
})

test('an adjusted root parses as itself so the caller can reject it', () => {
  assert.equal(parseOccSymbol('SPY1260914C00764000').root, 'SPY1')
  assert.equal(parseOccSymbol('SPY7260914C00764000').root, 'SPY7')
  assert.equal(parseOccSymbol('SPXW260918C04500000').root, 'SPXW')
})

test('malformed symbols return null rather than throwing or guessing', () => {
  for (const bad of ['NOT-AN-OCC-SYMBOL', '', 'SPY260918X00765000', 'SPY26091C00765000',
    'SPY260918C0076500', null, undefined, 42]) {
    assert.equal(parseOccSymbol(bad), null, String(bad))
  }
})

test('the chain keeps only the unadjusted root and reports what it dropped', () => {
  const chain = parseChain(raw)
  assert.equal(chain.spot, 764.20)
  assert.equal(chain.prevClose, 764.29)
  assert.equal(chain.timestamp, '2026-09-11T20:20:00Z')
  for (const c of chain.contracts) assert.equal(c.root, 'SPY')
  assert.equal(chain.rejected.adjustedRoot, 1, 'the SPY1 series')
  assert.equal(chain.rejected.unparseable, 1)
  assert.ok(chain.contracts.length >= 16)
})

test('a chain with no usable contracts is an error, not an empty result', () => {
  assert.throws(() => parseChain({ data: { options: [] } }), /no .*contracts/i)
  assert.throws(() => parseChain({}), /options/i)
  assert.throws(() => parseChain({ data: { options: [{ option: 'JUNK' }] } }), /no .*contracts/i)
})

test('expiries are listed as dates, sorted, deduplicated', () => {
  const chain = parseChain(raw)
  assert.deepEqual(expiriesIn(chain), ['2026-09-11', '2026-09-14', '2026-09-18', '2026-09-30', '2026-10-16'])
})

test('an expiry is chosen by date equality, never by taking the nearest one', () => {
  const chain = parseChain(raw)
  assert.equal(contractsFor(chain, '2026-09-14').length, 9,
    'six quotable plus the no-bid, crossed and wide-spread ones, minus the adjusted root')
  // The 09-11 series is expired but still present. Asking for a date that is not
  // listed must fail loudly instead of silently sliding onto it.
  assert.throws(() => contractsFor(chain, '2026-09-15'), /2026-09-15/)
  assert.throws(() => contractsFor(chain, '2026-09-17'), /2026-09-17/)
})

test('mid prices reject the quotes that would poison a straddle', () => {
  assert.equal(midPrice({ bid: 2.55, ask: 2.59 }), 2.57)
  assert.equal(midPrice({ bid: 0, ask: 1.62 }), null, 'no bid')
  assert.equal(midPrice({ bid: 3.90, ask: 3.70 }), null, 'crossed')
  assert.equal(midPrice({ bid: 1.00, ask: 1.10 }), 1.05)
  assert.equal(midPrice({ bid: 0.90, ask: 4.40 }), null, 'spread far beyond the limit')
  assert.equal(midPrice({ bid: null, ask: 2 }), null)
  // The mid keeps its half cent; rounding here costs a third of a daily zone.
  assert.equal(midPrice({ bid: 2.55, ask: 2.58 }), 2.565)
})

test('the quote limits are stated, not buried', () => {
  assert.ok(QUOTE_LIMITS.maxRelativeSpread > 0 && QUOTE_LIMITS.maxRelativeSpread < 1)
  assert.ok(QUOTE_LIMITS.minBid >= 0)
})

test('the forward comes from put-call parity at the strike where they agree', () => {
  const chain = parseChain(raw)
  // At 764 the call mid is 2.57 and the put mid 2.32, so F = 764 + 0.25.
  near(forwardFor(chain, '2026-09-14'), 764.25, 0.0001, 'daily forward')
  // At 764 the 09-18 call mid is 6.53 and the put mid 6.26, and they agree more
  // closely there than at 765, so F = 764 + 0.27.
  near(forwardFor(chain, '2026-09-18'), 764.27, 0.0001, 'weekly forward')
})

test('the at-the-money strike is the listed strike nearest the forward', () => {
  const chain = parseChain(raw)
  assert.equal(atmStrike(chain, '2026-09-14', 764.25), 764)
  assert.equal(atmStrike(chain, '2026-09-14', 764.62), 765, 'ties break to the nearer strike')
  assert.equal(atmStrike(chain, '2026-09-14', 763.10), 763)
  assert.equal(atmStrike(chain, '2026-09-18', 764.27), 764)
})

test('the at-the-money quote carries the straddle, the vol and its own uncertainty', () => {
  const chain = parseChain(raw)
  const q = atmQuote(chain, '2026-09-14')
  assert.equal(q.expiry, '2026-09-14')
  assert.equal(q.strike, 764)
  near(q.forward, 764.25, 0.0001, 'forward')
  near(q.callMid, 2.57, 1e-9, 'call mid')
  near(q.putMid, 2.32, 1e-9, 'put mid')
  near(q.straddle, 4.89, 1e-9, 'straddle')
  near(q.iv, 0.1532, 0.0001, 'the average of the two at-the-money vols')
  // The straddle's own bid/ask width, so the page can print a tolerance
  // instead of a bare number.
  near(q.straddleSpread, 0.08, 1e-9, 'straddle bid/ask width')
  const w = atmQuote(chain, '2026-09-18')
  near(w.straddle, 12.79, 1e-9, 'weekly straddle at 764')
  near(w.iv, 0.15145, 0.0001, 'weekly vol')
})

test('the at-the-money search never lands on an expired or unquotable series', () => {
  const chain = parseChain(raw)
  // 2026-09-11 has a single frozen pair at zero; asking for it must not produce
  // a straddle of zero, it must refuse.
  assert.throws(() => atmQuote(chain, '2026-09-11'), /quote|straddle|strike/i)
  // 766 and 767 on 09-14 are unquotable, so they can never win the ATM search
  // even if the forward drifted toward them.
  assert.equal(atmStrike(chain, '2026-09-14', 766.4), 765,
    'the nearest strike with a usable two-sided quote')
})
