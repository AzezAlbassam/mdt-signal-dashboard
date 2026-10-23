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

/**
 * Live mode: how many fiscal years ahead of the backtests' rule today's numbers are (1 for a
 * fiscal year that ended mid-year and is already out, else 0). History months are moved by the
 * same amount so today's multiple is compared with past multiples built the same way.
 * POST-HOC fix (2026-10-18): before this, MSFT's P/E on FY2026 was set against a history on
 * FY2025 and FY2024, which made it look cheaper than 93% of its months instead of 72%.
 */
export function liveShift(funds, month) {
  const last = funds.length ? funds[funds.length - 1].year : null
  return last == null ? 0 : Math.max(0, last - lastUsableFiscalYear(month))
}

/**
 * Quarterly results (get_financial_history, period fq) → one trailing-twelve-month record per
 * quarter that closes four consecutive quarters, oldest first, each with the record four
 * quarters earlier (`prev`) and its revenue growth over that year (`revYoY`).
 */
export function ttmFromQuarters(resp) {
  const s = resp?.series ?? {}
  const qs = []
  ;(resp?.labels ?? []).forEach((label, i) => {
    const m = /^Q([1-4]) (\d{4})$/.exec(label)
    if (!m) return
    const v = (k) => (Number.isFinite(s[k]?.[i]?.value) ? s[k][i].value : null)
    qs.push({ label, n: Number(m[2]) * 4 + Number(m[1]), rev: v('revenue'), ni: v('net_income'), eps: v('eps'), fcf: v('fcf'), ebitda: v('ebitda'), gp: v('gross_profit'), debt: v('total_debt') })
  })
  // POST-HOC (2026-10-21): TradingView sometimes repeats a label (UNH: … Q1 2026, Q3 2026, Q3 2026;
  // 12 of 665 saved files). Quarters come oldest first, so then they are numbered by position back
  // from the last label.
  if (new Set(qs.map((q) => q.n)).size !== qs.length) {
    const last = qs[qs.length - 1].n
    qs.forEach((q, i) => {
      q.n = last - (qs.length - 1 - i)
      q.label = `Q${q.n - 4 * Math.floor((q.n - 1) / 4)} ${Math.floor((q.n - 1) / 4)}`
    })
  }
  qs.sort((a, b) => a.n - b.n)
  const sum = (w, k) => (w.every((q) => q[k] != null) ? w.reduce((a, q) => a + q[k], 0) : null)
  const out = []
  for (let i = 3; i < qs.length; i += 1) {
    const w = qs.slice(i - 3, i + 1)
    // Four consecutive quarters, the last one reported (a listed but empty quarter is not).
    if (w[3].n - w[0].n !== 3 || (w[3].rev == null && w[3].eps == null && w[3].ni == null)) continue
    out.push({ label: w[3].label, n: w[3].n, rev: sum(w, 'rev'), ni: sum(w, 'ni'), eps: sum(w, 'eps'), fcf: sum(w, 'fcf'), ebitda: sum(w, 'ebitda'), gp: sum(w, 'gp'), debt: w[3].debt })
  }
  // POST-HOC (2026-10-22): the cash-flow statement and balance sheet can come out weeks after the
  // income statement (JNJ Q3 2026: revenue and EPS in, FCF, EBITDA and debt null). Until then the
  // newest twelve months keep the FCF and EBITDA of the twelve months a quarter earlier, and that
  // quarter's debt; JNJ had no score, and 4292 read as debt-free.
  const [a, b] = [out.at(-1), out.at(-2)]
  if (a && b && b.n === a.n - 1) for (const k of ['fcf', 'ebitda', 'debt']) a[k] ??= b[k]
  for (const t of out) {
    t.prev = out.find((x) => x.n === t.n - 4) ?? null
    t.revYoY = t.prev && pos(t.prev.rev) && t.rev != null ? t.rev / t.prev.rev - 1 : null
  }
  return out
}

/**
 * The live page's view of a stock (POST-HOC, 2026-10-19; the studies used fiscal years only):
 * each month gets the last twelve months out by then — the newest quarter counts as out this
 * month and each earlier one three months before (ponytail: TradingView gives no report dates,
 * so a quarter can sit up to ~2 months off; harmless in a 60-month history) — and months before
 * the quarterly data starts use fiscal years on the same offset as today (liveShift). Growth
 * over 3 years and the 5-year average EPS still come from fiscal years. `sharesNow` (market
 * value ÷ price) replaces the twelve months' net income ÷ EPS count this month when the two differ
 * by more than 10%, and EPS is restated on it (POST-HOC 2026-10-21; it was 1.5×: RIVN's July 2026
 * offering left 1.25B shares against 1.45B today, Aramco's bonus shares 208B against 245B).
 * POST-HOC (2026-10-22): EPS is restated only when today's count is the larger one (dilution). A
 * larger net income ÷ EPS count is preferred dividends or convertibles in diluted EPS (CELH 532M
 * against 253M), and opposite signs are a loss for common holders (ALB): the reported EPS stays.
 * Returns { state(month), f0, f1, yoy, period } for scoreAt / fairValuesAt / expectationsAt.
 */
export function liveContext(funds, ttm, month, sharesNow = null) {
  const shift = liveShift(funds, month)
  const fyState = (mk) => stateAt(funds, mk, lastUsableFiscalYear(mk) + shift)
  // POST-HOC (2026-10-22): twelve months that end before the last fiscal year are not "now"; TradingView
  // left the recent quarters empty (RZLV: Q2 2024 against FY2025, SHMD Q4 2023, LU Q4 2024).
  if (!ttm?.length || Number(ttm.at(-1).label.slice(-4)) < (funds.at(-1)?.year ?? 0)) return { state: fyState, f0: null, f1: null, yoy: null, period: null }
  const avail = ttm.map((_, i) => addMonths(month, -3 * (ttm.length - 1 - i)))
  const sharesOf = (t) => (t.eps && t.ni && Math.sign(t.eps) === Math.sign(t.ni) ? t.ni / t.eps : null)
  const state = (mk) => {
    const base = fyState(mk)
    let i = -1
    for (let j = 0; j < ttm.length; j += 1) if (avail[j] <= mk) i = j
    if (i < 0 || !base) return base
    const t = ttm[i]
    let shares = sharesOf(t) ?? base.shares
    let eps = t.eps
    if (mk === month && pos(sharesNow) && !(pos(shares) && Math.abs(shares / sharesNow - 1) <= 0.1)) {
      shares = sharesNow
      if (sharesOf(t) && sharesNow > sharesOf(t)) eps = t.ni / sharesNow
    }
    return { ...base, period: t.label, eps, rev: t.rev, ebitda: t.ebitda, debt: t.debt ?? base.debt,
      shares, revPS: pos(shares) && t.rev != null ? t.rev / shares : null, fcfPS: pos(shares) && t.fcf != null ? t.fcf / shares : null }
  }
  const rec = (t) => t && { year: null, period: t.label, rev: t.rev, ni: t.ni, eps: t.eps, fcf: t.fcf, ebitda: t.ebitda, debt: t.debt, gp: t.gp, shares: sharesOf(t) }
  const last = ttm[ttm.length - 1]
  return { state, f0: rec(last), f1: rec(last.prev), yoy: last.revYoY, period: last.label }
}

/**
 * Today's share count from a TradingView quote: market value ÷ price, except when its
 * total_shares_outstanding and net income ÷ EPS (last 12 months) agree within 10% and the market
 * value's count does not, or (POST-HOC 2026-10-22) agree within 2%. An ADR's market value can come
 * from its home listing at the home price (TSM: Taipei, 14% under the ADR's on 10-20 and 9.6% on
 * 10-22), and 238 of 974 quotes had it at the previous close, so P/S and per-share values would not
 * match the price shown. NVO (its count is B shares only) and Aramco (EPS on the pre-bonus count)
 * keep market ÷ price.
 */
export function quoteShares(q) {
  const near = (a, b) => pos(a) && pos(b) && Math.abs(a / b - 1) <= 0.1
  // POST-HOC (2026-10-22): Tadawul's market value is at the previous close (221 of 271 quotes), so its
  // count divides by that close, not today's (4292 at −7.5% today showed P/E 14.5 for 13.4).
  const px = q?.currency === 'SAR' && Number.isFinite(q.change) ? q?.close / (1 + q.change / 100) : q?.close
  const m = pos(q?.market_cap_basic) && pos(px) ? q.market_cap_basic / px : null
  const t = q?.total_shares_outstanding
  const e = q?.net_income_ttm && q?.earnings_per_share_diluted_ttm ? q.net_income_ttm / q.earnings_per_share_diluted_ttm : null
  return pos(t) && pos(e) && Math.abs(t / e - 1) <= 0.02 ? t : near(t, e) && !near(m, t) ? t : m
}

/**
 * POST-HOC (2026-10-22): every share class, for market value and per-share cash flow. A US Up-C or
 * multi-class listing's total_shares_outstanding and EPS are one class's (TKO: 73M Class A), while
 * TradingView's market value counts every class and exchangeable unit (189M), whose owners share the
 * whole company's revenue, free cash flow and net cash. Not for DRs, not on Tadawul (a market value at
 * the previous close looks the same), and only with a share class in the name (UROY's is just off).
 */
export function allShares(q) {
  const m = pos(q?.market_cap_basic) && pos(q?.close) ? q.market_cap_basic / q.close : null
  return q?.type !== 'dr' && q?.currency === 'USD' && /\bClass [A-Z]\b/.test(q.description ?? '') && m > 1.1 * q.total_shares_outstanding ? m : quoteShares(q)
}

/** The state per month a calculation reads: backtest rule, live fiscal years, or a liveContext. */
export function stateFn(funds, month, live) {
  if (live?.state) return live.state
  if (!live) return (mk) => stateAt(funds, mk)
  return liveContext(funds, null, month).state
}

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
    // POST-HOC fix (2026-10-18): a year TradingView lists with no revenue, EPS or profit (FUBO's
    // 2025) is not reported yet; using it made a $1.6B-revenue company look pre-revenue.
    if (v('revenue') == null && eps == null && ni == null) return
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
  const S = stateFn(funds, month, live)
  const st = S(month)
  if (!pos(close) || !st) return null

  // Own-history medians over the window ending this month, as the Pine script's arrays.
  const hist = { pe: [], pen: [], ps: [], ev: [] }
  for (let k = PARAMS.windowMonths - 1; k >= 0; k -= 1) {
    const mk = addMonths(month, -k)
    const c = closes.get(mk)
    if (!pos(c)) continue
    const mult = multiplesAt(S(mk), c)
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

// One get-symbol-data-batch row → the { labels, series } shape get-financial-history returns
// (oldest first, values as { value }), for parseFundamentals (fy) and ttmFromQuarters (fq).
// POST-HOC (2026-10-21), page data path only; parity with get-financial-history checked on 50 stocks.
export const HIST_SERIES = { revenue: 'total_revenue', net_income: 'net_income', eps: 'earnings_per_share_diluted', fcf: 'free_cash_flow',
  ebitda: 'ebitda', total_debt: 'total_debt', gross_profit: 'gross_profit' }
export const HIST_COLS = [...['fy', 'fq'].flatMap((p) => Object.values(HIST_SERIES).map((c) => `${c}_${p}_h`)), 'fiscal_period_fy', 'fiscal_period_end_fq', 'fiscal_period_end_fy']

// ponytail: max 16 points = what get-financial-history gives; Infinity for all 20 years / 32 quarters.
export function histFromBatch(row, period, max = 16) {
  const cols = Object.entries(HIST_SERIES).map(([k, c]) => [k, row?.[`${c}_${period}_h`]])
  const n = Math.min(max, Math.max(0, ...cols.map(([, a]) => (Array.isArray(a) ? a.length : 0))))
  const fy = Number(row?.fiscal_period_fy)
  const end = new Date((row?.fiscal_period_end_fq ?? NaN) * 1000)
  if (!n || (period === 'fy' ? !Number.isInteger(fy) : isNaN(end))) return null
  // Index i is i years / i quarters before the newest; quarters are labelled by the calendar quarter
  // their (month-end) close falls in, as get-financial-history does.
  const label = (i) => {
    if (period === 'fy') return String(fy - i)
    const m = end.getUTCFullYear() * 12 + end.getUTCMonth() - 3 * i
    return `Q${Math.floor((m % 12) / 3) + 1} ${Math.floor(m / 12)}`
  }
  const idx = [...Array(n).keys()].reverse()
  return {
    labels: idx.map(label),
    series: Object.fromEntries(cols.map(([k, a]) => [k, idx.map((i) => ({ value: Number.isFinite(a?.[i]) ? a[i] : null }))])),
  }
}
