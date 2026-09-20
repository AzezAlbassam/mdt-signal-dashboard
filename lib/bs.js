/**
 * Black-Scholes, for pricing the option legs a trader would actually hold.
 *
 * Used only where no real option print exists: the study prices each leg from
 * the underlying path and a volatility, and every number it produces is
 * labelled model-priced. Pure functions, no I/O.
 */

/**
 * The standard normal CDF. Graeme West's double-precision algorithm, accurate
 * to about 1e-15, which the usual seven-digit approximations are not.
 */
export function normCdf (x) {
  const a = Math.abs(x)
  let c
  if (a > 37) {
    c = 0
  } else {
    const e = Math.exp(-a * a / 2)
    if (a < 7.07106781186547) {
      let b = 3.52624965998911e-02 * a + 0.700383064443688
      b = b * a + 6.37396220353165
      b = b * a + 33.912866078383
      b = b * a + 112.079291497871
      b = b * a + 221.213596169931
      b = b * a + 220.206867912376
      c = e * b
      b = 8.83883476483184e-02 * a + 1.75566716318264
      b = b * a + 16.064177579207
      b = b * a + 86.7807322029461
      b = b * a + 296.564248779674
      b = b * a + 637.333633378831
      b = b * a + 793.826512519948
      b = b * a + 440.413735824752
      c = c / b
    } else {
      let b = a + 0.65
      b = a + 4 / b
      b = a + 3 / b
      b = a + 2 / b
      b = a + 1 / b
      c = e / b / 2.506628274631
    }
  }
  return x > 0 ? 1 - c : c
}

const d1d2 = ({ S, K, T, sigma, r }) => {
  const v = sigma * Math.sqrt(T)
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / v
  return [d1, d1 - v]
}

/**
 * @param {{S:number, K:number, T:number, sigma:number, r?:number, type:'C'|'P'}} o
 *   T in years, sigma as a decimal, r continuously compounded.
 */
export function bsPrice ({ S, K, T, sigma, r = 0, type }) {
  if (!(S > 0) || !(K > 0)) throw new RangeError('S and K must be positive')
  if (type !== 'C' && type !== 'P') throw new RangeError(`type must be C or P, got ${type}`)
  if (!(T > 0) || !(sigma > 0)) {
    return type === 'C' ? Math.max(0, S - K) : Math.max(0, K - S)
  }
  const [d1, d2] = d1d2({ S, K, T, sigma, r })
  const disc = Math.exp(-r * T)
  return type === 'C'
    ? S * normCdf(d1) - K * disc * normCdf(d2)
    : K * disc * normCdf(-d2) - S * normCdf(-d1)
}

export function bsDelta ({ S, K, T, sigma, r = 0, type }) {
  if (!(T > 0) || !(sigma > 0)) {
    const inMoney = type === 'C' ? S > K : S < K
    return type === 'C' ? (inMoney ? 1 : 0) : (inMoney ? -1 : 0)
  }
  const [d1] = d1d2({ S, K, T, sigma, r })
  return type === 'C' ? normCdf(d1) : normCdf(d1) - 1
}

/** The at-the-money straddle: call plus put at one strike. */
export const straddlePrice = ({ S, K, T, sigma, r = 0 }) =>
  bsPrice({ S, K, T, sigma, r, type: 'C' }) + bsPrice({ S, K, T, sigma, r, type: 'P' })

/**
 * The volatility that reproduces a price, by bisection. Robust rather than
 * fast; sixty halvings from [0.0001, 5] is far below any quoting precision.
 */
export function impliedVolFromPrice ({ S, K, T, r = 0, type, price }) {
  let lo = 1e-4
  let hi = 5
  const intrinsic = bsPrice({ S, K, T: 0, sigma: 0, r, type })
  if (price <= intrinsic) return 0
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (bsPrice({ S, K, T, sigma: mid, r, type }) > price) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}
