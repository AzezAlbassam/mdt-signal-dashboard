// Study 7 (PROTOCOL-study7.md): the fair value indicator (pine/fair-value.pine) rebuilt on
// annual fundamentals and monthly closes, so it can be scored against later returns.
//
// Months are keys "YYYY-MM". Fiscal year Y is usable from May of Y+1 onward (§A2), so at
// any month nothing reported later than that month is seen.

export const METHODS = ['pe', 'peg', 'dcf', 'graham', 'ev', 'ps', 'pb', 'pbj', 'cash', 'pen']

const MATURE = 'Mature / profitable'
const GROWTH = 'Growth / tech'
const HEAVY = 'Heavy / cyclical'
const FIN = 'Financial'
const UNPROF = 'Unprofitable growth'
const PRE = 'Pre-revenue'

// Same order as METHODS; copied from pine/fair-value.pine.
export const WEIGHTS = {
  [MATURE]: [0.3, 0, 0.3, 0.15, 0.25, 0, 0, 0, 0, 0],
  [GROWTH]: [0.2, 0.3, 0.3, 0, 0, 0.2, 0, 0, 0, 0],
  [HEAVY]: [0, 0, 0, 0, 0.4, 0, 0.3, 0, 0, 0.3],
  [FIN]: [0.5, 0, 0, 0, 0, 0, 0, 0.5, 0, 0],
  [UNPROF]: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
  [PRE]: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
}

const HEAVY_SECTORS = ['Energy Minerals', 'Non-Energy Minerals', 'Process Industries', 'Producer Manufacturing', 'Industrial Services', 'Transportation', 'Consumer Durables']
const TECH_SECTORS = ['Electronic Technology', 'Technology Services']

export const PARAMS = { discount: 0.09, termGrowth: 0.025, maxGrowth: 0.25, pegTarget: 1, windowMonths: 60, minSamples: 12, normYears: 5 }

// POST-HOC fix (2026-10-14): a month whose multiple is above 100 (P/S: revenue under 1% of
// market value, the line profileOf draws for pre-revenue; P/E or EV/EBITDA: earnings near
// zero) is no anchor for a "normal" multiple. Before this, stocks whose revenue or profit
// ramped up from almost nothing got fair values 20–90× their price (JOBY, PTON, CVNA).
export const MULT_MAX = 100

const pos = (x) => Number.isFinite(x) && x > 0

/** Last fiscal year whose numbers are public at month "YYYY-MM": May of Y+1 onward. */
export function lastUsableFiscalYear(month) {
  const [y, m] = month.split('-').map(Number)
  return m >= 5 ? y - 1 : y - 2
}

export function monthKey(unixSec) {
  const d = new Date(unixSec * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function addMonths(month, k) {
  const [y, m] = month.split('-').map(Number)
  const t = y * 12 + (m - 1) + k
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

/**
 * Turns a get_financial_history (fy) response into one record per fiscal year, sorted.
 * Shares = net income / EPS of the same year (§A2).
 */
export function parseFundamentals(resp) {
  const s = resp.series
  const out = []
  resp.labels.forEach((label, i) => {
    const year = Number(label)
    if (!Number.isInteger(year)) return
    const v = (k) => {
      const x = s[k]?.[i]?.value
      return Number.isFinite(x) ? x : null
    }
    const eps = v('eps')
    const ni = v('net_income')
    const shares = eps && ni && Math.sign(eps) === Math.sign(ni) ? ni / eps : null
    out.push({ year, eps, rev: v('revenue'), fcf: v('fcf'), ebitda: v('ebitda'), debt: v('total_debt'), ni, shares, gp: v('gross_profit') })
  })
  return out.sort((a, b) => a.year - b.year)
}

/** Compound annual growth over the last (up to) 3 values, as the Pine script's cagr(). */
export function cagr(values) {
  const n = Math.min(3, values.length - 1)
  if (n < 1) return null
  const last = values[values.length - 1]
  const first = values[values.length - 1 - n]
  return first > 0 && last > 0 ? Math.pow(last / first, 1 / n) - 1 : null
}

export function dcf(fcf0, g1, r, gT) {
  if (!pos(fcf0) || g1 == null) return null
  let pv = 0
  let cf = fcf0
  for (let i = 1; i <= 10; i += 1) {
    const g = g1 + ((gT - g1) * (i - 1)) / 9
    cf *= 1 + g
    pv += cf / Math.pow(1 + r, i)
  }
  return pv + (cf * (1 + gT)) / (r - gT) / Math.pow(1 + r, 10)
}

function median(a) {
  const s = [...a].sort((x, y) => x - y)
  const n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

/**
 * Everything the indicator knows at one month: the fundamentals then public, and the
 * per-share values built from them. Null when no fiscal year is public yet.
 * `fy` overrides the last usable fiscal year; the live page passes Infinity, because every
 * year TradingView returns is already reported (fiscal years ending mid-year carry that
 * year's label and are out long before May of the next year).
 */
export function stateAt(funds, month, fy = lastUsableFiscalYear(month)) {
  const known = funds.filter((f) => f.year <= fy)
  if (known.length === 0) return null
  const f = known[known.length - 1]
  const epsList = known.map((k) => k.eps).filter((x) => x != null)
  const revList = known.map((k) => k.rev).filter((x) => x != null)
  const lastEps = epsList.slice(-PARAMS.normYears)
  return {
    fiscalYear: f.year,
    eps: f.eps,
    rev: f.rev,
    ebitda: f.ebitda,
    debt: f.debt ?? 0,
    shares: f.shares,
    revPS: pos(f.shares) && f.rev != null ? f.rev / f.shares : null,
    fcfPS: pos(f.shares) && f.fcf != null ? f.fcf / f.shares : null,
    epsNorm: lastEps.length ? lastEps.reduce((a, b) => a + b, 0) / lastEps.length : null,
    epsG: cagr(epsList),
    revG: cagr(revList),
  }
}

/** The four own-history multiples at one month (null when not positive). */
export function multiplesAt(st, close) {
  if (!st) return { pe: null, pen: null, ps: null, ev: null }
  const m = (x) => (pos(x) ? x : null)
  return {
    pe: pos(st.eps) ? m(close / st.eps) : null,
    pen: pos(st.epsNorm) ? m(close / st.epsNorm) : null,
    ps: pos(st.revPS) ? m(close / st.revPS) : null,
    ev: pos(st.ebitda) && pos(st.shares) ? m((close * st.shares + st.debt) / st.ebitda) : null,
  }
}

export function profileOf(st, close, sector) {
  const mcap = pos(st.shares) ? close * st.shares : null
  if (st.rev == null || st.rev <= 0 || (mcap != null && st.rev < 0.01 * mcap)) return PRE
  if (sector === 'Finance') return FIN
  if (!(st.eps > 0)) return UNPROF
  if (HEAVY_SECTORS.includes(sector)) return HEAVY
  if (TECH_SECTORS.includes(sector) || st.revG > 0.15) return GROWTH
  return MATURE
}

const clampG = (g) => (g == null ? null : Math.max(-0.05, Math.min(PARAMS.maxGrowth, g)))

/**
 * Fair value by every method at month `month`, for a stock with fundamentals `funds`,
 * monthly closes `closes` (Map month -> close) and TradingView sector `sector`.
 * Only months up to `month` are read.
 */
export function fairValuesAt(funds, closes, sector, month, live = false) {
  const close = closes.get(month)
  const st = stateAt(funds, month, live ? Infinity : undefined)
  if (!pos(close) || !st) return null

  // Own-history medians over the window ending this month, as the Pine script's arrays.
  const hist = { pe: [], pen: [], ps: [], ev: [] }
  for (let k = PARAMS.windowMonths - 1; k >= 0; k -= 1) {
    const mk = addMonths(month, -k)
    const c = closes.get(mk)
    if (!pos(c)) continue
    const mult = multiplesAt(stateAt(funds, mk), c)
    for (const key of Object.keys(hist)) if (mult[key] != null && mult[key] <= MULT_MAX) hist[key].push(mult[key])
  }
  const med = (key) => (hist[key].length >= PARAMS.minSamples ? median(hist[key]) : null)

  const { discount: r, termGrowth: gT, pegTarget } = PARAMS
  const gPeg = clampG(st.epsG ?? st.revG)
  const gDcf = clampG(st.revG ?? st.epsG)
  const ok = (x) => (pos(x) ? x : null)
  const medEv = med('ev')
  const values = {
    pe: pos(st.eps) && med('pe') != null ? ok(st.eps * med('pe')) : null,
    peg: pos(st.eps) && gPeg > 0 ? ok(st.eps * gPeg * 100 * pegTarget) : null,
    dcf: ok(dcf(st.fcfPS, gDcf, r, gT)),
    graham: null,
    ev: pos(st.ebitda) && pos(st.shares) && medEv != null ? ok((medEv * st.ebitda - st.debt) / st.shares) : null,
    ps: pos(st.revPS) && med('ps') != null ? ok(st.revPS * med('ps')) : null,
    pb: null,
    pbj: null,
    cash: null,
    pen: pos(st.epsNorm) && med('pen') != null ? ok(st.epsNorm * med('pen')) : null,
  }
  return { close, profile: profileOf(st, close, sector), values, fiscalYear: st.fiscalYear }
}

/** Weighted blend over methods that have a value, re-weighted as the Pine script does. */
export function blend(values, weights) {
  let sw = 0
  let sv = 0
  METHODS.forEach((m, i) => {
    const w = weights[i]
    const x = values[m]
    if (w > 0 && pos(x)) {
      sw += w
      sv += w * x
    }
  })
  return sw > 0 ? { fair: sv / sw, coverage: sw } : null
}

const one = (m) => METHODS.map((k) => (k === m ? 1 : 0))
const equal = (ms) => METHODS.map((k) => (ms.includes(k) ? 1 : 0))

/** The candidates of §A6. V0 uses the company-type weights; the rest ignore the type. */
export const VARIANTS = {
  V0: null,
  V1: one('pe'),
  V2: one('peg'),
  V3: one('dcf'),
  V4: one('ev'),
  V5: one('ps'),
  V6: one('pen'),
  V7: equal(['pe', 'peg', 'dcf', 'ev', 'ps', 'pen']),
  V8: equal(['pe', 'ev', 'ps', 'pen']),
  V9: equal(['peg', 'dcf']),
}

/** Fair value of one variant, or null (pre-revenue stock-years are always left out). */
export function variantFair(fv, variant) {
  if (!fv || fv.profile === PRE) return null
  const w = VARIANTS[variant] ?? WEIGHTS[fv.profile]
  return blend(fv.values, w)?.fair ?? null
}

// ---------------------------------------------------------------- statistics

function ranks(a) {
  const idx = a.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0])
  const r = new Array(a.length)
  for (let i = 0; i < idx.length; ) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k += 1) r[idx[k][1]] = avg
    i = j + 1
  }
  return r
}

export function spearman(x, y) {
  const rx = ranks(x)
  const ry = ranks(y)
  const n = x.length
  const mx = rx.reduce((a, b) => a + b, 0) / n
  const my = ry.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i += 1) {
    sxy += (rx[i] - mx) * (ry[i] - my)
    sxx += (rx[i] - mx) ** 2
    syy += (ry[i] - my) ** 2
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0
}

// Regularized incomplete beta (Numerical Recipes continued fraction), for Student's t.
function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let ser = 1.000000000190015
  for (const ci of c) ser += ci / ++y
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

function betacf(a, b, x) {
  let qab = a + b
  let qap = a + 1
  let qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < 1e-30) d = 1e-30
  d = 1 / d
  let h = d
  for (let m = 1; m <= 200; m += 1) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + aa / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + aa / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 3e-14) break
  }
  return h
}

function ibeta(a, b, x) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}

/** One-sided p-value of a one-sample t-test that the mean of `xs` is above zero. */
export function tTestGreater(xs) {
  const n = xs.length
  const mean = xs.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
  const t = mean / (sd / Math.sqrt(n))
  const df = n - 1
  const tail = 0.5 * ibeta(df / 2, 0.5, df / (df + t * t))
  return { t, df, p: t > 0 ? tail : 1 - tail }
}

// ---------------------------------------------------------------- study 8

/**
 * PROTOCOL-study8.md §3: close above the simple average of the last 10 monthly closes,
 * this month included. Null when any of those 10 months is missing.
 */
export function trendUp(closes, month, n = 10) {
  let sum = 0
  for (let k = 0; k < n; k += 1) {
    const c = closes.get(addMonths(month, -k))
    if (!pos(c)) return null
    sum += c
  }
  return closes.get(month) > sum / n
}

/** Exact one-sided sign-flip p-value that the mean of `xs` is above zero. */
export function signFlipGreater(xs) {
  const n = xs.length
  const obs = xs.reduce((a, b) => a + b, 0) / n
  let ge = 0
  for (let mask = 0; mask < 1 << n; mask += 1) {
    const s = xs.reduce((a, x, i) => a + (mask & (1 << i) ? -x : x), 0) / n
    if (s >= obs - 1e-12) ge += 1
  }
  return ge / (1 << n)
}

/** Holm step-down adjustment; returns adjusted p-values in the input order. */
export function holm(ps) {
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0])
  const out = new Array(ps.length)
  let running = 0
  order.forEach(([p, i], r) => {
    running = Math.max(running, Math.min(1, (ps.length - r) * p))
    out[i] = running
  })
  return out
}
