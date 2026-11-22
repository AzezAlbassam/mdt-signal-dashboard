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

// NYSE full-day holidays.
// ponytail: a hand list through 2028 (from the exchange rules); add the next years before then.
export const HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
  '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04', '2028-09-04', '2028-11-23', '2028-12-25',
])
export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
export const isTradingDay = (day) => { const w = new Date(`${day}T12:00:00Z`).getUTCDay(); return w !== 0 && w !== 6 && !HOLIDAYS.has(day) }

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

const R = 0.04 // ponytail: one flat rate; a delta band does not need the curve
const bsD1 = (S, K, T, v) => (Math.log(S / K) + (R + (v * v) / 2) * T) / (v * Math.sqrt(T))

/**
 * Black–Scholes implied volatility by bisection: 0 when no time value is left, null on bad input.
 * No dividends in the formula: a dividend payer is priced on its escrowed spot (S less dividends).
 */
function impliedVol({ S, K, T, price, type }) {
  if (!(S > 0 && K > 0 && T > 0 && price > 0)) return null
  const disc = K * Math.exp(-R * T)
  if (price <= (type === 'C' ? S - disc : disc - S) + 1e-9) return 0
  const value = (v) => {
    const a = bsD1(S, K, T, v)
    const b = a - v * Math.sqrt(T)
    return type === 'C' ? S * ncdf(a) - disc * ncdf(b) : disc * ncdf(-b) - S * ncdf(-a)
  }
  let lo = 1e-4
  let hi = 10
  if (value(hi) < price) return 0
  for (let i = 0; i < 80; i += 1) {
    const m = (lo + hi) / 2
    if (value(m) > price) hi = m
    else lo = m
  }
  return (lo + hi) / 2
}

/** An option's delta from its own price; ±1 once no time value is left (a put never trades under K − S). */
function ownDelta({ S, K, T, price, type }) {
  if (type === 'P' && price > 0 && price <= K - S + 0.02) return -1
  const v = impliedVol({ S, K, T, price, type })
  if (v == null) return null
  if (v === 0) return type === 'C' ? 1 : -1
  return type === 'C' ? ncdf(bsD1(S, K, T, v)) : ncdf(bsD1(S, K, T, v)) - 1
}

/**
 * American value and delta on a 100-step CRR tree over the escrowed spot Sx = S − D, the stock less
 * the dividends due before expiry (D, paid evenly to expiry): exercising pays against Sx_t + D_t.
 * Early exercise pulls a deep put to -1, and a deep call on a dividend payer to 1. Node prices step
 * by u² (no power per node): a chain runs thousands of these trees.
 */
function american(Sx, D, K, T, v, type, exercise = true, steps = 100) {
  const u = Math.exp(v * Math.sqrt(T / steps))
  const d2 = 1 / (u * u)
  const p = (Math.exp((R * T) / steps) - 1 / u) / (u - 1 / u)
  const disc = Math.exp((-R * T) / steps)
  const w = type === 'C' ? 1 : -1
  const ex = exercise ? 1 : 0
  const vals = new Float64Array(steps + 1)
  for (let i = 0, s = Sx * u ** steps; i <= steps; i += 1, s *= d2) vals[i] = Math.max(0, w * (s - K))
  for (let n = steps - 1; n >= 1; n -= 1) {
    const due = (D * (steps - n)) / steps
    for (let i = 0, s = Sx * u ** n; i <= n; i += 1, s *= d2) vals[i] = Math.max(disc * (p * vals[i] + (1 - p) * vals[i + 1]), ex * w * (s + due - K))
  }
  return { delta: (vals[0] - vals[1]) / (Sx * (u - 1 / u)), value: Math.max(disc * (p * vals[0] + (1 - p) * vals[1]), ex * w * (Sx + D - K)) }
}

// A two-sided quote whose ask is over 5 times its bid (0.05 x 10.00) is a placeholder, not a price.
// Without bid and ask, a mid is taken as given.
const quoted = (o) => o?.mid > 0 && !(o.bid > 0 && o.ask > 5 * o.bid)
const spreadOf = (o) => (o.bid > 0 && o.ask >= o.bid ? (2 * (o.ask - o.bid)) / (o.ask + o.bid) : 0)

/**
 * The dividends (present value, dollars) an expiry's options price in, from put-call parity at the
 * four strikes nearest the money: D = S − K·e^(−rT) − (C − P). Listed options are American, so
 * each side's early-exercise premium comes off first; otherwise every put's premium reads as a
 * dividend. Bounded to 2% of S plus 10% a year (a quarterly payout on a high yielder; more is a
 * hard-to-borrow stock's skewed quotes) and at most half of S; below, to −5% a year (a market
 * rate over the flat one).
 */
function dividends(list, S) {
  const puts = new Map(list.filter((o) => o.type === 'P').map((o) => [o.strike, o]))
  const away = (o) => Math.abs(Math.log(o.strike / S))
  const pairs = list
    .filter((c) => c.type === 'C' && away(c) <= 0.25)
    .map((c) => [c, puts.get(c.strike)])
    .filter(([c, p]) => c.T > 0 && quoted(c) && quoted(p) && p.T > 0 && spreadOf(c) <= 0.5 && spreadOf(p) <= 0.5)
    .sort(([a], [b]) => away(a) - away(b))
    .slice(0, 4)
  if (pairs.length === 0) return 0
  const T = pairs[0][0].T
  const bound = (d) => Math.min(S * Math.min(0.5, 0.02 + 0.1 * T), Math.max(-0.05 * S * T, d))
  const parity = ([c, p]) => S - c.strike * Math.exp(-R * c.T) - (c.mid - p.mid)
  const D = bound(median(pairs.map(parity).sort((a, b) => a - b)))
  const premium = (o, v) => american(S - D, D, o.strike, o.T, v, o.type).value - american(S - D, D, o.strike, o.T, v, o.type, false).value
  const read = pairs.map(([c, p]) => {
    const o = c.strike >= S ? c : p
    const v = impliedVol({ S: S - D, K: o.strike, T: o.T, price: o.mid, type: o.type })
    return parity([c, p]) + (v > 0.01 ? premium(c, v) - premium(p, v) : 0)
  })
  return bound(median(read.sort((a, b) => a - b)))
}

/**
 * An expiry's volatility smile from its out-of-the-money quotes (calls at or above S, puts at or
 * below), priced on the escrowed spot Sx: an in-the-money quote is mostly intrinsic value and says
 * little about volatility. A vol far above its neighbours' (a quote way over the market) is left
 * out: it would pull the deep in-the-money options beside it into the band; one below them errs
 * towards not sizing, so it stays. [{ x: ln(K/S), v, of: [the options read] }] by strike.
 */
function smileOf(list, S, Sx) {
  const byStrike = new Map()
  for (const o of list) {
    if (!(o.type === 'C' ? o.strike >= S : o.strike <= S) || !quoted(o)) continue
    const v = impliedVol({ S: Sx, K: o.strike, T: o.T, price: o.mid, type: o.type })
    if (!(v > 0.01)) continue // a hair over intrinsic, not a market (and a tree needs v·√dt over r·dt)
    const p = byStrike.get(o.strike) ?? { x: Math.log(o.strike / S), sum: 0, of: [] }
    p.sum += v
    p.of.push(o)
    byStrike.set(o.strike, p)
  }
  const pts = [...byStrike.values()].map((p) => ({ x: p.x, v: p.sum / p.of.length, of: p.of })).sort((a, b) => a.x - b.x)
  return pts.filter((p, j) => {
    const near = [...pts.slice(Math.max(0, j - 2), j), ...pts.slice(j + 1, j + 3)].map((q) => q.v).sort((a, b) => a - b)
    const m = median(near)
    return near.length < 2 || p.v - m <= Math.max(0.05, 0.25 * m)
  })
}

/** Volatility at log-moneyness x: linear between the smile's strikes, flat beyond its ends. */
function volAt(smile, x) {
  const j = smile.findIndex((p) => p.x >= x)
  if (j === 0) return smile[0].v
  if (j < 0) return smile[smile.length - 1].v
  const [a, b] = [smile[j - 1], smile[j]]
  return a.v + ((b.v - a.v) * (x - a.x)) / (b.x - a.x)
}

/**
 * Deltas for a chain that comes without Greeks (end-of-day chains), from the options' quotes:
 * [{ root, expiry, strike, type, T, mid, price, bid, ask }] with T in years, mid only for two-sided
 * quotes, price = mid, else last; root, bid and ask are used when present.
 * Per root and expiry: the dividends from put-call parity (escrowed: delta is dV/dS with dollar
 * dividends, so a call's delta is about its put's plus 1); a smile from the out-of-the-money quotes;
 * each option at its own vol if it is on the smile, else at the smile's vol for its strike
 * (interpolated, flat beyond the quoted strikes), so a deep strike without a usable quote reads like
 * its neighbours instead of from its own wide quote. Puts are priced American, calls too when
 * dividends are due. An expiry with no usable quote borrows the nearest expiry's smile, however thin
 * (measured: a smile of 2+ points within 2x the T trades fewer raw errors for more tradable ones);
 * a root with none at all reads each option from its own price, as before. An option with no
 * price at all reads null. Away from the money, a strike never reads nearer the band than the
 * one before it. Placeholder quotes (0.05 x 10.00) are caught only when bid and ask are given:
 * with a mid alone they are taken as prices.
 * Against Cboe's own deltas on 475,561 contracts (685 tickers, Cboe's intraday quotes), next to
 * reading the in-the-money side from its partner's vol without dividends: errors over 0.1 from
 * 5,831 to 2,012; band calls (0.20-0.85) unlike Cboe's on the 265,507 tradable contracts from 6,607
 * to 3,972; $100k answers with a leg Cboe puts outside the band by over 0.1 from 22 to 8 (by any
 * margin, 150 to 94); strikes where delta turns the wrong way by over 0.02 from 5,956 to 2.
 * ponytail: one flat rate, dividends spread evenly to expiry (a dividend calendar would place them).
 */
export function chainDeltas(options, S) {
  if (!(S > 0)) return options.map(() => null)
  const byExpiry = new Map()
  for (const o of options) {
    const k = `${o.root ?? ''} ${o.expiry}`
    if (!byExpiry.has(k)) byExpiry.set(k, [])
    byExpiry.get(k).push(o)
  }
  const books = [...byExpiry.values()].map((list) => {
    const D = dividends(list, S)
    return { list, root: list[0].root ?? '', T: list[0].T, D, smile: smileOf(list, S, S - D) }
  })
  const deltas = new Map()
  for (const b of books) {
    const own = new Map(b.smile.flatMap((p) => p.of.map((o) => [o, p.v])))
    const src = b.smile.length ? b : books.filter((x) => x.root === b.root && x.smile.length).sort((x, y) => Math.abs(x.T - b.T) - Math.abs(y.T - b.T))[0]
    for (const o of b.list) {
      if (!src) deltas.set(o, ownDelta({ S, K: o.strike, T: o.T, price: o.price, type: o.type }))
      else if (!(o.T > 0 && o.strike > 0) || o.price == null) deltas.set(o, null) // no quote, no trade: nothing to read
      else {
        const v = own.get(o) ?? volAt(src.smile, Math.log(o.strike / S))
        deltas.set(o, o.type === 'P' || b.D > 0 ? american(S - b.D, b.D, o.strike, o.T, v, o.type).delta : ncdf(bsD1(S - b.D, o.strike, o.T, v)))
      }
    }
    // Delta only falls as the strike rises, calls and puts alike. Walking out from the money, a
    // strike never reads nearer the band than the one before it (a smile rising into the wing, or
    // a wide quote read alone, would have it turn back): deeper in towards ±1, further out towards 0.
    for (const type of ['C', 'P']) {
      const side = b.list.filter((o) => o.type === type && deltas.get(o) != null)
      const up = side.filter((o) => o.strike >= S).sort((x, y) => x.strike - y.strike)
      const down = side.filter((o) => o.strike <= S).sort((x, y) => y.strike - x.strike)
      for (const [walk, pick] of [[up, Math.min], [down, Math.max]]) {
        for (let k = 1; k < walk.length; k += 1) deltas.set(walk[k], pick(deltas.get(walk[k]), deltas.get(walk[k - 1])))
      }
    }
  }
  return options.map((o) => deltas.get(o))
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
