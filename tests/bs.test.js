import test from 'node:test'
import assert from 'node:assert/strict'
import { normCdf, bsPrice, bsDelta, impliedVolFromPrice, straddlePrice } from '../lib/bs.js'

const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`)

test('the normal CDF is accurate to a millionth across the range', () => {
  near(normCdf(0), 0.5, 1e-9, 'zero')
  near(normCdf(1), 0.8413447461, 1e-7, 'one sigma')
  near(normCdf(-1), 0.1586552539, 1e-7, 'minus one')
  near(normCdf(1.96), 0.9750021049, 1e-7, '1.96')
  near(normCdf(-3), 0.0013498980, 1e-7, 'minus three')
  near(normCdf(6), 1, 1e-9, 'far right')
  near(normCdf(-6), 0, 1e-9, 'far left')
})

test('Black-Scholes reproduces the textbook values', () => {
  // Hull, Options, Futures and Other Derivatives: S=42, K=40, r=10%, sigma=20%, T=0.5.
  near(bsPrice({ S: 42, K: 40, T: 0.5, sigma: 0.2, r: 0.1, type: 'C' }), 4.76, 0.005, 'Hull call')
  near(bsPrice({ S: 42, K: 40, T: 0.5, sigma: 0.2, r: 0.1, type: 'P' }), 0.81, 0.005, 'Hull put')
  // At the money, zero rate, one year, 20 vol: 7.9656 both sides.
  near(bsPrice({ S: 100, K: 100, T: 1, sigma: 0.2, r: 0, type: 'C' }), 7.9656, 0.0005, 'ATM call')
  near(bsPrice({ S: 100, K: 100, T: 1, sigma: 0.2, r: 0, type: 'P' }), 7.9656, 0.0005, 'ATM put')
})

test('put-call parity holds to floating point', () => {
  for (const [S, K, T, sigma, r] of [[100, 95, 0.1, 0.3, 0.02], [764.29, 770, 1 / 365, 0.15, 0.04], [50, 80, 2, 0.6, 0]]) {
    const c = bsPrice({ S, K, T, sigma, r, type: 'C' })
    const p = bsPrice({ S, K, T, sigma, r, type: 'P' })
    near(c - p, S - K * Math.exp(-r * T), 1e-9, `parity S=${S} K=${K}`)
  }
})

test('at expiry an option is worth its intrinsic value and nothing else', () => {
  assert.equal(bsPrice({ S: 105, K: 100, T: 0, sigma: 0.2, r: 0, type: 'C' }), 5)
  assert.equal(bsPrice({ S: 95, K: 100, T: 0, sigma: 0.2, r: 0, type: 'C' }), 0)
  assert.equal(bsPrice({ S: 95, K: 100, T: 0, sigma: 0.2, r: 0, type: 'P' }), 5)
  assert.equal(bsPrice({ S: 100, K: 100, T: 0, sigma: 0.2, r: 0, type: 'P' }), 0)
})

test('prices are bounded and monotonic in the ways they must be', () => {
  const base = { S: 100, K: 100, T: 5 / 365, sigma: 0.15, r: 0 }
  const c = bsPrice({ ...base, type: 'C' })
  assert.ok(c > 0 && c < 100)
  assert.ok(bsPrice({ ...base, sigma: 0.3, type: 'C' }) > c, 'more vol, dearer')
  assert.ok(bsPrice({ ...base, T: 10 / 365, type: 'C' }) > c, 'more time, dearer')
  assert.ok(bsPrice({ ...base, S: 101, type: 'C' }) > c, 'higher spot, dearer call')
  assert.ok(bsPrice({ ...base, K: 101, type: 'C' }) < c, 'higher strike, cheaper call')
})

test('delta lies in its range and is a half at the money with no drift', () => {
  near(bsDelta({ S: 100, K: 100, T: 1e-9, sigma: 0.2, r: 0, type: 'C' }), 0.5, 0.01, 'ATM call at expiry')
  const d = bsDelta({ S: 100, K: 90, T: 0.5, sigma: 0.2, r: 0, type: 'C' })
  assert.ok(d > 0.5 && d <= 1)
  const dp = bsDelta({ S: 100, K: 90, T: 0.5, sigma: 0.2, r: 0, type: 'P' })
  near(d - dp, 1, 1e-9, 'call delta minus put delta is one')
})

test('implied vol inverts a price back to the vol that made it', () => {
  for (const sigma of [0.08, 0.15, 0.32, 0.7]) {
    for (const T of [1 / 365, 5 / 365, 0.25]) {
      const price = bsPrice({ S: 764.29, K: 765, T, sigma, r: 0.04, type: 'C' })
      near(impliedVolFromPrice({ S: 764.29, K: 765, T, r: 0.04, type: 'C', price }), sigma, 1e-6, `sigma=${sigma} T=${T}`)
    }
  }
})

test('the straddle is the call plus the put and approximates the known constant', () => {
  const s = straddlePrice({ S: 100, K: 100, T: 1 / 365, sigma: 0.15, r: 0 })
  near(s, bsPrice({ S: 100, K: 100, T: 1 / 365, sigma: 0.15, r: 0, type: 'C' }) + bsPrice({ S: 100, K: 100, T: 1 / 365, sigma: 0.15, r: 0, type: 'P' }), 1e-12, 'sum')
  // Brenner-Subrahmanyam: straddle ~ 0.7979 x S x sigma x sqrt(T) at the money.
  near(s / (100 * 0.15 * Math.sqrt(1 / 365)), 0.7979, 0.002, 'straddle over one sigma')
})
