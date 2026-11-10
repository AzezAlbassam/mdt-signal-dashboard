// HCP — Harmonic Cycle Projection. PROTOCOL-study11.md §1, which fixes every constant here.
//
// A forward-projected model line: least-squares trend plus K sinusoids fitted to ln(close)
// over a trailing window, then evaluated past the last bar. It is an OPEN look-alike of the
// shape of a closed, undisclosed vendor model; it is not a copy of one and makes no claim to
// match it.
//
// Contract, as in engine/indicators2.js: a fit at bar `end` reads bars 0..end only. Nothing
// here may look at end+1 or later — test/hcp.test.js enforces it by mutating the future.

export const W = 1000 // fit window, trading bars
export const K = 3 // harmonics
export const H = 40 // projection horizon, trading bars
const P_MIN = 20 // shortest trial period, bars
const P_MAX_DIV = 3 // longest is W / 3, so the window holds >= 3 full cycles
const GRID = 200 // trial periods, logarithmic

// Trial periods, fixed by the constants above so every symbol searches the same grid.
const periodGrid = (w) => {
  const hi = w / P_MAX_DIV
  const step = Math.log(hi / P_MIN) / (GRID - 1)
  return Array.from({ length: GRID }, (_, i) => P_MIN * Math.exp(i * step))
}

// Goertzel power of `r` at period P. Frequency finder only — amplitudes come from the
// least-squares solve below, so this function's phase convention never reaches a result.
function goertzel(r, P) {
  const w = (2 * Math.PI) / P
  const coeff = 2 * Math.cos(w)
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < r.length; i += 1) {
    const s = r[i] + coeff * s1 - s2
    s2 = s1
    s1 = s
  }
  const re = s1 - Math.cos(w) * s2
  const im = Math.sin(w) * s2
  return re * re + im * im
}

// Solve the normal equations (XtX) c = Xty by Gaussian elimination with partial pivoting.
// Columns are O(1) by construction (see `u` below), so an 8x8 solve is comfortable.
function solve(cols, y) {
  const m = cols.length
  const n = y.length
  const a = Array.from({ length: m }, () => new Float64Array(m + 1))
  for (let i = 0; i < m; i += 1) {
    for (let j = i; j < m; j += 1) {
      let s = 0
      for (let t = 0; t < n; t += 1) s += cols[i][t] * cols[j][t]
      a[i][j] = s
      a[j][i] = s
    }
    let s = 0
    for (let t = 0; t < n; t += 1) s += cols[i][t] * y[t]
    a[i][m] = s
  }
  for (let i = 0; i < m; i += 1) {
    let p = i
    for (let j = i + 1; j < m; j += 1) if (Math.abs(a[j][i]) > Math.abs(a[p][i])) p = j
    if (Math.abs(a[p][i]) < 1e-12) return null // singular: caller reports no fit
    if (p !== i) { const t = a[p]; a[p] = a[i]; a[i] = t }
    for (let j = i + 1; j < m; j += 1) {
      const f = a[j][i] / a[i][i]
      if (f === 0) continue
      for (let k = i; k <= m; k += 1) a[j][k] -= f * a[i][k]
    }
  }
  const c = new Float64Array(m)
  for (let i = m - 1; i >= 0; i -= 1) {
    let s = a[i][m]
    for (let j = i + 1; j < m; j += 1) s -= a[i][j] * c[j]
    c[i] = s / a[i][i]
  }
  return c
}

// Design columns at offsets `xs` (bars relative to `end`, so 0 is the fit bar and +h the
// projection). u = x / W keeps every column O(1); the trend coefficient is therefore per W
// bars, which only rescales c[1] and changes no fitted value.
const design = (xs, periods, w) => {
  const cols = [xs.map(() => 1), xs.map((x) => x / w)]
  for (const P of periods) {
    cols.push(xs.map((x) => Math.cos((2 * Math.PI * x) / P)))
    cols.push(xs.map((x) => Math.sin((2 * Math.PI * x) / P)))
  }
  return cols
}

/**
 * Fit HCP at bar `end` of `closes`.
 * Returns null when there is not a full window, or when a close in it is not positive, or
 * when the solve is singular. Otherwise { periods, coef, w, at(h) } where at(h) is the
 * model's PRICE h bars after `end` — at(0) is the fitted value on the fit bar itself, which
 * is deliberately not forced onto close[end] (PROTOCOL-study11.md §1.5).
 */
export function hcpFit(closes, end, { w = W, k = K } = {}) {
  const start = end - w + 1
  if (!Number.isInteger(end) || start < 0 || end >= closes.length) return null
  const y = new Float64Array(w)
  const xs = new Array(w)
  for (let i = 0; i < w; i += 1) {
    const c = closes[start + i]
    if (!(c > 0) || !Number.isFinite(c)) return null
    y[i] = Math.log(c)
    xs[i] = start + i - end // 0 on the fit bar, negative in the past
  }

  // Greedy frequency search: pick the strongest trial period in the residual, refit
  // everything chosen so far, repeat. Detrending is linear on purpose — subtracting a
  // centred moving average would manufacture a cycle at the averaging length.
  const grid = periodGrid(w)
  const periods = []
  let coef = solve(design(xs, periods, w), y)
  if (!coef) return null
  let resid = residual(y, xs, periods, coef, w)
  for (let j = 0; j < k; j += 1) {
    let bestP = null
    let bestPow = -Infinity
    for (const P of grid) {
      const pow = goertzel(resid, P)
      if (pow > bestPow) { bestPow = pow; bestP = P }
    }
    const next = [...periods, bestP]
    const c = solve(design(xs, next, w), y)
    if (!c) break // keep the last good fit rather than report nothing
    periods.push(bestP)
    coef = c
    resid = residual(y, xs, periods, coef, w)
  }

  const at = (h) => {
    const cols = design([h], periods, w)
    let s = 0
    for (let i = 0; i < coef.length; i += 1) s += coef[i] * cols[i][0]
    return Math.exp(s)
  }
  let sse = 0
  for (let i = 0; i < w; i += 1) sse += resid[i] * resid[i]
  return { periods, coef, w, at, rmse: Math.sqrt(sse / w) }
}

function residual(y, xs, periods, coef, w) {
  const cols = design(xs, periods, w)
  const r = new Float64Array(y.length)
  for (let t = 0; t < y.length; t += 1) {
    let s = 0
    for (let i = 0; i < coef.length; i += 1) s += coef[i] * cols[i][t]
    r[t] = y[t] - s
  }
  return r
}

/**
 * The projection itself: HCP's price for bars end+1 .. end+h, as a plain array.
 * Null when the fit is unavailable. The values are the fit's own level — see §1.5 — so
 * out[0] generally differs from closes[end]; the anchored variant is §5, reported only.
 */
export function hcpProject(closes, end, h = H, opts = {}) {
  const f = hcpFit(closes, end, opts)
  if (!f) return null
  return Array.from({ length: h }, (_, i) => f.at(i + 1))
}
