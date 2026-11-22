// Options liquidity engine: how much of a contract you can hold and still get out fast.
//
// Shared by the snapshot script (Node) and options.html (browser), so the numbers the
// page shows are the numbers the tests check. Pure functions only; no I/O.
//
// The core idea: a position is only as liquid as the market's appetite on the way OUT.
// Three things bound that appetite, and the smallest one wins:
//   1. Average daily volume — how many contracts actually change hands per session.
//   2. Open interest — how many exist at all; a big slice of it means you ARE the market.
//   3. The bid-ask spread — the toll paid the moment you sell.

/** Parse an OCC-style symbol: ROOT + YYMMDD + C/P + strike×1000 (8 digits). */
export function parseOccSymbol(sym) {
  const m = /^([A-Z0-9.]{1,6}?)(\d{6})([CP])(\d{8})$/.exec(sym)
  if (!m) return null
  const [, root, ymd, cp, strike] = m
  return {
    root,
    expiry: `20${ymd.slice(0, 2)}-${ymd.slice(2, 4)}-${ymd.slice(4, 6)}`,
    type: cp,
    strike: Number(strike) / 1000,
  }
}

/** The New York calendar date of a moment, YYYY-MM-DD: the date expiries are counted from. */
export const nyDate = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

/** Whole calendar days from `fromDate` to `expiry`, both YYYY-MM-DD. */
export function daysToExpiry(expiry, fromDate) {
  return Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000)
}

/**
 * Monthly (third-Friday) expirations carry most of the open interest in long-dated options.
 * A Thursday stands in for a third Friday that is a market holiday (Good Friday, Juneteenth);
 * given the chain's expiries, only when that Friday is not listed too (SPY lists dailies).
 */
export function isMonthly(expiry, expiries = []) {
  const d = new Date(`${expiry}T00:00:00Z`)
  const dow = d.getUTCDay()
  const day = d.getUTCDate()
  if (dow === 5) return day >= 15 && day <= 21
  if (dow === 4) return day >= 14 && day <= 20 && !expiries.includes(new Date(d.getTime() + 86400000).toISOString().slice(0, 10))
  return false
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

// Spreads are ratios of prices in cents, so a quote that sits exactly on a threshold
// (4.07 x 4.73 is 15%) can come out a hair above it in floating point.
const EPS = 1e-9

// Normal CDF (Abramowitz–Stegun 7.1.26: |error| < 1.5e-7).
const ncdf = (x) => {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2)
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

/**
 * Delta from an option's own price, for sources that send no Greeks (end-of-day chains):
 * implied volatility by bisection on the Black–Scholes price, then N(d1).
 * ponytail: European exercise, no dividends, a flat 4% rate — enough to sort contracts into a
 * delta band, not to price them.
 */
export function bsDelta({ S, K, T, price, type, r = 0.04 }) {
  if (!(S > 0 && K > 0 && T > 0 && price > 0)) return null
  const disc = K * Math.exp(-r * T)
  const intrinsic = type === 'C' ? Math.max(0, S - disc) : Math.max(0, disc - S)
  if (price <= intrinsic + 1e-9) return type === 'C' ? 1 : -1 // no time value left: deep in the money
  const sq = Math.sqrt(T)
  const d1 = (v) => (Math.log(S / K) + (r + (v * v) / 2) * T) / (v * sq)
  const value = (v) => {
    const a = d1(v)
    const b = a - v * sq
    return type === 'C' ? S * ncdf(a) - disc * ncdf(b) : disc * ncdf(-b) - S * ncdf(-a)
  }
  let lo = 1e-4
  let hi = 10
  if (value(hi) < price) return type === 'C' ? 1 : -1
  for (let i = 0; i < 80; i += 1) {
    const m = (lo + hi) / 2
    if (value(m) > price) hi = m
    else lo = m
  }
  const v = (lo + hi) / 2
  return type === 'C' ? ncdf(d1(v)) : ncdf(d1(v)) - 1
}

/** Median of an ascending array (null when empty). */
const median = (s) => (s.length === 0 ? null : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2)

/**
 * Turn a Cboe delayed-quotes payload into contract rows.
 * Keeps standard roots only (TICKER, or TICKERW for index weeklies; BRK.B trades as BRKB):
 * adjusted roots like MSTR1 deliver something other than 100 shares and price accordingly.
 * Drops expired contracts, ones with no interest, no volume and no bid, and the far tails
 * (|delta| under 0.03 or over 0.98) that nobody sizes a position in.
 */
export function chainRows(raw, ticker, today) {
  const d = raw?.data ?? raw ?? {}
  const base = ticker.replace('.', '')
  const roots = new Set([base, `${base}W`])
  const rows = []
  let session = ''
  let totalVolume = 0
  for (const o of d.options ?? []) {
    const p = parseOccSymbol(o.option)
    if (!p || !roots.has(p.root)) continue
    if (daysToExpiry(p.expiry, today) < 1) continue
    const volume = num(o.volume) ?? 0
    const oi = num(o.open_interest) ?? 0
    const bid = num(o.bid) ?? 0
    totalVolume += volume
    const t = typeof o.last_trade_time === 'string' ? o.last_trade_time.slice(0, 10) : ''
    if (t > session && t <= today) session = t // a bad future date must not freeze the history
    if (oi === 0 && volume === 0 && bid === 0) continue
    const delta = num(o.delta)
    if (delta != null && (Math.abs(delta) < 0.03 || Math.abs(delta) > 0.98)) continue
    rows.push({
      sym: o.option, expiry: p.expiry, type: p.type, strike: p.strike,
      bid, ask: num(o.ask) ?? 0, bidSize: num(o.bid_size) ?? 0, askSize: num(o.ask_size) ?? 0,
      last: num(o.last_trade_price), volume, oi, iv: num(o.iv), delta,
    })
  }
  return { rows, session, totalVolume, price: num(d.current_price) ?? num(d.close) }
}

export const DEFAULTS = {
  pctOfAdv: 0.10, // over a day, sell at most 10% of a normal day's volume
  pctOfOi: 0.05, // never hold more than 5% of everything outstanding
  maxSpread: 0.15, // wider than 15% of mid is not a market you exit at all comfortably
  minSessions: 5, // fewer recorded sessions than this and ADV is an estimate
  priorTurnover: 0.02, // the estimate before history: 2% of OI trades per day (conservative for listed months)
  maxLegs: 6, // how many contracts an amount is spread across, at most
  gradeOi: [2000, 500, 100], // open interest needed for grades A, B, C (in contracts)
}

/**
 * Grade a contract by what exiting it costs and how deep the pool is.
 * Spread is the toll paid on the way out; open interest says whether a market exists
 * beyond today's quotes. The weaker of the two decides.
 */
export function grade({ spreadPct, oi }, [oiA, oiB, oiC] = DEFAULTS.gradeOi) {
  if (spreadPct == null || !(spreadPct >= 0)) return 'D'
  if (spreadPct <= 0.03 + EPS && oi >= oiA) return 'A'
  if (spreadPct <= 0.06 + EPS && oi >= oiB) return 'B'
  if (spreadPct <= 0.10 + EPS && oi >= oiC) return 'C'
  return 'D'
}

/**
 * Round a size down to the contract's lot. US equity options trade in whole contracts of
 * 100 shares; crypto options trade in fractions of a coin (0.01 BTC), one coin per unit.
 */
const toLot = (x, lot) => Math.floor(x / lot + 1e-9) * lot

/**
 * Per-contract exit metrics.
 * `c` carries bid, ask, bidSize, oi, volume (today) and, when history exists, adv + sessions.
 *
 * Size = min(5% of open interest, a way out), where the way out is whichever is larger:
 *   - over the day, into normal flow: 10% of average daily volume, or
 *   - right now, into the displayed bid — but never more than one normal day's volume.
 * A displayed bid is real but thin: market makers quote hundreds of contracts and pull
 * back once hit, so a size the contract never actually trades is not an exit. The
 * open-interest cap keeps you from becoming the market.
 */
export function contractMetrics(c, opts = {}) {
  const o = { ...DEFAULTS, ...opts }
  const bid = c.bid > 0 ? c.bid : 0
  const ask = c.ask > 0 ? c.ask : 0
  const mid = bid > 0 && ask >= bid ? (bid + ask) / 2 : null
  const spreadPct = mid ? (ask - bid) / mid : null

  // `adv` is the average over completed sessions. Until there are minSessions of them, it
  // is shrunk toward a prior of priorTurnover × OI, weighted as the missing sessions —
  // so day one is neither zero nor a guess, and the prior fades out as real days arrive.
  const sessions = c.sessions ?? 0
  const recorded = sessions > 0 ? c.adv ?? 0 : 0
  const missing = Math.max(0, o.minSessions - sessions)
  const adv = missing === 0 ? recorded : (recorded * sessions + o.priorTurnover * (c.oi ?? 0) * missing) / (sessions + missing)
  const advEstimated = missing > 0

  const oi = c.oi ?? 0
  const lot = c.lot ?? 1
  const mult = c.multiplier ?? 100
  const capByAdv = toLot(o.pctOfAdv * adv, lot)
  const capByOi = toLot(o.pctOfOi * oi, lot)
  const bidSize = bid > 0 ? c.bidSize ?? 0 : 0
  const byBid = toLot(Math.min(bidSize, adv), lot)
  const exit = Math.max(capByAdv, byBid)
  const tradable = bid > 0 && spreadPct != null && spreadPct <= o.maxSpread + EPS
  const capContracts = tradable ? Math.max(0, Math.min(exit, capByOi)) : 0
  const binding = !tradable ? 'spread' : capByOi <= exit ? 'oi' : byBid > capByAdv ? 'bid' : 'volume'

  return {
    mid,
    spreadPct,
    adv,
    advEstimated,
    capByAdv,
    capByOi,
    capContracts,
    binding,
    // Entry pays the ask; that is the cash the position really ties up.
    capDollars: capContracts * ask * mult,
    // Selling right now at the bid, without walking the book.
    instantContracts: bid > 0 ? c.bidSize ?? 0 : 0,
    // Round-trip toll if bought at the ask and sold at the bid immediately.
    roundTripCostPerContract: mid ? (ask - bid) * mult : null,
    grade: tradable ? grade({ spreadPct, oi }, o.gradeOi) : 'D',
  }
}

/**
 * Fold one session of volumes into a rolling history.
 * history = { dates: [...], vol: { sym: [v | null, ...] } }, aligned to dates, newest last.
 * A re-run on the same session keeps the larger figure: volume only grows intraday.
 */
export function mergeSession(history, sessionDate, volumes, keep = 20) {
  const h = { dates: [...(history?.dates ?? [])], vol: { ...(history?.vol ?? {}) } }
  const last = h.dates[h.dates.length - 1]
  if (last && sessionDate < last) return h // never rewrite the past
  const sameSession = last === sessionDate

  if (!sameSession) h.dates.push(sessionDate)
  const n = h.dates.length

  for (const sym of Object.keys(h.vol)) {
    const arr = [...h.vol[sym]]
    while (arr.length < n) arr.push(sym in volumes ? null : 0)
    h.vol[sym] = arr
  }
  for (const [sym, v] of Object.entries(volumes)) {
    const arr = h.vol[sym] ? [...h.vol[sym]] : new Array(n).fill(null)
    while (arr.length < n) arr.push(null)
    arr[n - 1] = sameSession && arr[n - 1] != null ? Math.max(arr[n - 1], v) : v
    h.vol[sym] = arr
  }

  if (h.dates.length > keep) {
    const drop = h.dates.length - keep
    h.dates = h.dates.slice(drop)
    for (const sym of Object.keys(h.vol)) h.vol[sym] = h.vol[sym].slice(drop)
  }
  // Contracts that have expired or vanished leave only nulls/zeros behind; prune them
  // once they are absent from a new session (a re-run of the same one may just miss them).
  for (const sym of sameSession ? [] : Object.keys(h.vol)) {
    if (!(sym in volumes) && h.vol[sym].every((v) => !v)) delete h.vol[sym]
  }
  return h
}

// A day that traded more than OUTLIER_X times the contract's typical day, and more than
// OUTLIER_MIN contracts, is a one-off print (a block trade), not daily flow — up to
// OUTLIER_DAYS of them in the window; more such days than that are how the contract trades.
export const OUTLIER_X = 10
export const OUTLIER_MIN = 20
export const OUTLIER_DAYS = 3

/**
 * A normal day's volume over the sessions a contract was listed for: the average of its days
 * without the one-off prints. A 40,000-contract block on a contract that trades 2 a day, or
 * three 500-lots on one that is otherwise idle, is not flow you can sell into; a plain average
 * turns it into a "normal day" for the whole window. A day is one-off when it traded more than
 * OUTLIER_X times the median of the contract's other days (and over OUTLIER_MIN contracts);
 * at most the OUTLIER_DAYS largest of those are left out, so a contract that trades in bursts
 * — nine busy days, then quiet — keeps its volume, as do busy days of a steady one.
 */
export function averageVolume(series) {
  const listed = (series ?? []).filter((v) => v != null)
  if (listed.length === 0) return { adv: 0, sessions: 0 }
  const s = [...listed].sort((a, b) => a - b)
  const m = s.length - 1 // the other days of each day
  const other = (j, p) => s[p < j ? p : p + 1] // p-th smallest of the days other than s[j]
  const oneOff = s.length < 2 ? [] : s.map((v, j) => j).filter((j) => s[j] > Math.max(OUTLIER_X * (m % 2 ? other(j, (m - 1) / 2) : (other(j, m / 2 - 1) + other(j, m / 2)) / 2), OUTLIER_MIN))
  const drop = new Set(oneOff.slice(-OUTLIER_DAYS)) // the largest, as s is ascending
  const kept = s.filter((_, j) => !drop.has(j))
  return { adv: kept.reduce((a, b) => a + b, 0) / kept.length, sessions: listed.length }
}

const GRADE_RANK = { A: 0, B: 1, C: 2, D: 3 }

/**
 * The contracts that answer "type T, about D days out".
 * Window: expirations within [D×(1−w), D×(1+w)]; if none fall inside, the two nearest.
 */
export function selectExpirations(expiries, today, targetDays, window = 0.25) {
  const withDte = expiries.map((e) => ({ expiry: e, dte: daysToExpiry(e, today) })).filter((e) => e.dte > 0)
  const lo = targetDays * (1 - window)
  const hi = targetDays * (1 + window)
  const inside = withDte.filter((e) => e.dte >= lo && e.dte <= hi)
  if (inside.length) return inside.map((e) => e.expiry)
  return withDte
    .sort((a, b) => Math.abs(a.dte - targetDays) - Math.abs(b.dte - targetDays))
    .slice(0, 2)
    .map((e) => e.expiry)
    .sort()
}

/**
 * Rank the candidates and split `amount` across them, best exit first, each leg capped at
 * its comfortable size. Returns the legs plus the total the market can comfortably absorb.
 */
export function allocate(contracts, { amount, maxLegs = DEFAULTS.maxLegs, ...opts }) {
  const ranked = contracts
    .map((c) => ({ ...c, m: contractMetrics(c, opts) }))
    .filter((c) => c.m.capContracts > 0)
    .sort((a, b) => GRADE_RANK[a.m.grade] - GRADE_RANK[b.m.grade] || b.m.capDollars - a.m.capDollars)

  // The comfortable maximum is what the top legs hold when filled to their caps —
  // the one number the page and the watchlist both quote.
  const top = ranked.slice(0, maxLegs)
  const comfortable = top.reduce((s, c) => s + c.m.capDollars, 0)
  const crumb = Math.min(amount, comfortable) * 0.05

  // Fill in rank order, first with no contract taking more than half the amount (so a
  // large amount is spread when there is room), then top up to the caps if needed.
  // New orders under 5% of the amount wait for the last pass.
  const legs = new Map()
  let remaining = amount
  const fill = (perLeg, minCost, list = top) => {
    for (const c of list) {
      if (remaining <= 0) break
      const leg = legs.get(c.sym)
      const perContract = c.ask * (c.multiplier ?? 100)
      const lot = c.lot ?? 1
      const held = leg?.cost ?? 0
      const room = Math.min(remaining, c.m.capDollars - held, perLeg - held)
      const n = toLot(room / perContract, lot)
      if (n < lot || (!leg && n * perContract < minCost)) continue
      const add = n * perContract
      legs.set(c.sym, { ...c, contracts: Math.round(((leg?.contracts ?? 0) + n) / lot) * lot, cost: held + add })
      remaining -= add
    }
  }
  fill(amount * 0.5, crumb)
  fill(Infinity, crumb)
  // What the big legs cannot hold goes to the smaller top contracts, so an amount within the
  // comfortable maximum is placed in full; a leftover under 1% of it is not worth new orders.
  if (remaining >= crumb / 5) fill(Infinity, 0)
  // Every top contract costs more than the amount: the best-ranked one that fits.
  if (legs.size === 0) fill(Infinity, 0, ranked.filter((c) => toLot(amount / (c.ask * (c.multiplier ?? 100)), c.lot ?? 1) >= (c.lot ?? 1)).slice(0, 1))

  // Legs listed best first, as ranked (a symbol listed twice still makes one leg).
  const rank = new Map(ranked.map((c, i) => [c.sym, i]).reverse())
  return { ranked, legs: [...legs.values()].sort((a, b) => rank.get(a.sym) - rank.get(b.sym)), placed: amount - remaining, unplaced: remaining, comfortable }
}

/** Duration buckets, in calendar days to expiry: the choices the page offers. */
export const BUCKETS = [
  { key: 'm1', lo: 20, hi: 90 },
  { key: 'm3', lo: 90, hi: 180 },
  { key: 'm6', lo: 180, hi: 365 },
  { key: 'y1', lo: 365, hi: 730 },
  { key: 'y2', lo: 730, hi: 1300 },
]

export function expiriesInRange(expiries, today, lo, hi) {
  return expiries.filter((e) => {
    const d = daysToExpiry(e, today)
    return d >= lo && d < hi
  })
}

/** The candidates the page sizes: one type, given expiries, |delta| inside the range. */
export function candidates(contracts, { type, expiries, dMin = 0.2, dMax = 0.85 }) {
  const set = new Set(expiries)
  return contracts.filter((c) => c.type === type && set.has(c.expiry) && c.delta != null && Math.abs(c.delta) >= dMin && Math.abs(c.delta) <= dMax)
}

/** Comfortable maximum per bucket and type, for the watchlist. */
export function bucketCapacities(contracts, today, opts = {}) {
  const expiries = [...new Set(contracts.map((c) => c.expiry))].sort()
  const out = {}
  for (const type of ['C', 'P']) {
    out[type] = BUCKETS.map((b) => {
      const ex = expiriesInRange(expiries, today, b.lo, b.hi)
      return Math.round(allocate(candidates(contracts, { type, expiries: ex }), { amount: 0, ...opts }).comfortable)
    })
  }
  return out
}

/** Per-expiration roll-up, so the liquid months stand out from the thin weeklies. */
export function expirySummary(contracts, today, opts = {}) {
  const by = new Map()
  for (const c of contracts) {
    if (!by.has(c.expiry)) by.set(c.expiry, [])
    by.get(c.expiry).push(c)
  }
  return [...by.entries()]
    .map(([expiry, list]) => {
      const ms = list.map((c) => ({ c, m: contractMetrics(c, opts) }))
      const nearMoney = ms.filter(({ c }) => c.delta != null && Math.abs(c.delta) >= 0.3 && Math.abs(c.delta) <= 0.7)
      const spreads = nearMoney.map(({ m }) => m.spreadPct).filter((s) => s != null).sort((a, b) => a - b)
      return {
        expiry,
        dte: daysToExpiry(expiry, today),
        monthly: isMonthly(expiry, [...by.keys()]),
        oi: list.reduce((s, c) => s + (c.oi ?? 0), 0),
        adv: ms.reduce((s, { m }) => s + m.adv, 0),
        medianSpread: median(spreads),
        capacity: allocate(candidates(list, { type: list[0].type, expiries: [expiry], dMin: opts.dMin, dMax: opts.dMax }), { amount: 0, ...opts }).comfortable,
      }
    })
    .sort((a, b) => a.dte - b.dte)
}

/**
 * Working-order prices that keep most of the spread in your pocket.
 * Start at the mid; if nobody fills you, step toward the far side, but never past a
 * quarter of the spread — beyond that you are paying the toll you came to avoid.
 */
export function limitGuide(bid, ask, tick = 0.01) {
  if (!(bid > 0) || !(ask >= bid)) return null
  const mid = (bid + ask) / 2
  const q = (ask - bid) / 4
  // Prices must sit on the tick grid; round toward your own side, which keeps the promise
  // (a buyer never pays more than mid + a quarter, a seller never takes less than mid − a
  // quarter). On a one-tick market that means joining the bid, not paying the ask.
  const dp = (String(tick).split('.')[1] ?? '').length
  const fix = (v) => Number(v.toFixed(dp))
  const down = (v) => fix(Math.floor(v / tick + 1e-9) * tick)
  const up = (v) => fix(Math.ceil(v / tick - 1e-9) * tick)
  const buy = down(mid)
  const sell = up(mid)
  return { buy, buyMax: Math.max(buy, down(mid + q)), sell, sellMin: Math.min(sell, up(mid - q)) }
}

/**
 * One-line liquidity verdict for a whole ticker, for the watchlist view.
 * Spread is measured where long-dated option buyers trade (calls 60–400 days out,
 * |delta| 0.30–0.70); depth is the 6–12 month call bucket, the same number the page shows.
 * Tier: A excellent, B fine, C thin (small size, patient limits), D avoid.
 */
export function tickerSummary(contracts, today, opts = {}) {
  const pool = contracts.filter((c) => {
    const dte = daysToExpiry(c.expiry, today)
    return c.type === 'C' && dte >= 60 && dte <= 400 && c.delta != null && Math.abs(c.delta) >= 0.3 && Math.abs(c.delta) <= 0.7
  })
  const spreads = pool.map((c) => contractMetrics(c, opts).spreadPct).filter((s) => s != null).sort((a, b) => a - b)
  const medianSpread = median(spreads)
  const caps = bucketCapacities(contracts, today, opts)
  const capacity = caps.C[2]
  const oi = contracts.reduce((s, c) => s + (c.oi ?? 0), 0)
  let tier = 'D'
  if (medianSpread != null) {
    if (medianSpread <= 0.04 && capacity >= 250000) tier = 'A'
    else if (medianSpread <= 0.07 && capacity >= 50000) tier = 'B'
    else if (medianSpread <= 0.12 && capacity >= 10000) tier = 'C'
  }
  return { tier, medianSpread, capacity, caps, oi }
}
