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

/** Whole calendar days from `fromDate` to `expiry`, both YYYY-MM-DD. */
export function daysToExpiry(expiry, fromDate) {
  return Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000)
}

/** Monthly (third-Friday) expirations carry most of the open interest in long-dated options. */
export function isMonthly(expiry) {
  const d = new Date(`${expiry}T00:00:00Z`)
  // Thursday expiries cover a Good-Friday holiday on the third Friday.
  const dow = d.getUTCDay()
  const day = d.getUTCDate()
  if (dow === 5) return day >= 15 && day <= 21
  if (dow === 4) return day >= 14 && day <= 20
  return false
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

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
    if (t > session) session = t
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
  pctOfAdv: 0.10, // hold at most 10% of a normal day's volume
  pctOfOi: 0.05, // and at most 5% of everything outstanding
  maxSpread: 0.12, // wider than 12% of mid is not a market you exit "comfortably"
  minSessions: 5, // fewer recorded sessions than this and ADV is an estimate
  priorTurnover: 0.02, // the estimate before history: 2% of OI trades per day (conservative for listed months)
}

/**
 * Grade a contract by the three exit constraints. Each threshold must hold for the
 * grade; the weakest constraint decides, which is the point.
 */
export function grade({ spreadPct, oi, adv }) {
  if (spreadPct == null || !(spreadPct >= 0)) return 'D'
  if (spreadPct <= 0.03 && oi >= 2000 && adv >= 200) return 'A'
  if (spreadPct <= 0.06 && oi >= 500 && adv >= 50) return 'B'
  if (spreadPct <= 0.12 && oi >= 100 && adv >= 10) return 'C'
  return 'D'
}

/**
 * Per-contract exit metrics.
 * `c` carries bid, ask, bidSize, oi, volume (today) and, when history exists, adv + sessions.
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
  const capByAdv = Math.floor(o.pctOfAdv * adv)
  const capByOi = Math.floor(o.pctOfOi * oi)
  const tradable = bid > 0 && spreadPct != null && spreadPct <= o.maxSpread
  const capContracts = tradable ? Math.max(0, Math.min(capByAdv, capByOi)) : 0
  const binding = !tradable ? 'spread' : capByAdv <= capByOi ? 'volume' : 'oi'

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
    capDollars: capContracts * ask * 100,
    // Selling right now at the bid, without walking the book.
    instantContracts: bid > 0 ? c.bidSize ?? 0 : 0,
    // Round-trip toll if bought at the ask and sold at the bid immediately.
    roundTripCostPerContract: mid ? (ask - bid) * 100 : null,
    grade: tradable ? grade({ spreadPct, oi, adv }) : 'D',
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
  // once they are absent from the latest session.
  for (const sym of Object.keys(h.vol)) {
    if (!(sym in volumes) && h.vol[sym].every((v) => !v)) delete h.vol[sym]
  }
  return h
}

/** Average daily volume over the sessions a contract was listed for. */
export function averageVolume(series) {
  const listed = (series ?? []).filter((v) => v != null)
  if (listed.length === 0) return { adv: 0, sessions: 0 }
  return { adv: listed.reduce((a, b) => a + b, 0) / listed.length, sessions: listed.length }
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
export function allocate(contracts, { amount, maxLegs = 4, ...opts }) {
  const ranked = contracts
    .map((c) => ({ ...c, m: contractMetrics(c, opts) }))
    .filter((c) => c.m.capContracts > 0 && c.m.grade !== 'D')
    .sort((a, b) => GRADE_RANK[a.m.grade] - GRADE_RANK[b.m.grade] || b.m.capDollars - a.m.capDollars)

  const capacity = ranked.reduce((s, c) => s + c.m.capDollars, 0)
  const legs = []
  let remaining = amount
  for (const c of ranked) {
    if (legs.length >= maxLegs || remaining <= 0) break
    const perContract = c.ask * 100
    const contractsWanted = Math.floor(Math.min(remaining, c.m.capDollars) / perContract)
    if (contractsWanted < 1) continue
    const cost = contractsWanted * perContract
    legs.push({ ...c, contracts: contractsWanted, cost })
    remaining -= cost
  }
  const placed = amount - remaining
  const capacityOfLegs = ranked.slice(0, maxLegs).reduce((s, c) => s + c.m.capDollars, 0)
  return { ranked, legs, placed, unplaced: remaining, capacity, capacityOfLegs }
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
        monthly: isMonthly(expiry),
        oi: list.reduce((s, c) => s + (c.oi ?? 0), 0),
        adv: ms.reduce((s, { m }) => s + m.adv, 0),
        medianSpread: spreads.length ? spreads[Math.floor(spreads.length / 2)] : null,
        capacity: ms.reduce((s, { m }) => s + m.capDollars, 0),
      }
    })
    .sort((a, b) => a.dte - b.dte)
}

/**
 * Working-order prices that keep most of the spread in your pocket.
 * Start at the mid; if nobody fills you, step toward the far side, but never past a
 * quarter of the spread — beyond that you are paying the toll you came to avoid.
 */
export function limitGuide(bid, ask) {
  if (!(bid > 0) || !(ask >= bid)) return null
  const mid = (bid + ask) / 2
  const q = (ask - bid) / 4
  const cents = (v) => Math.round(v * 100) / 100
  return { mid: cents(mid), buyMax: cents(mid + q), sellMin: cents(mid - q) }
}

/**
 * One-line liquidity verdict for a whole ticker, for the watchlist view.
 * Measured where long-dated option buyers actually trade: calls 60–400 days out with
 * |delta| 0.30–0.70. Tier: A excellent, B fine, C thin (small size, patient limits), D avoid.
 */
export function tickerSummary(contracts, today, opts = {}) {
  const pool = contracts.filter((c) => {
    const dte = daysToExpiry(c.expiry, today)
    return c.type === 'C' && dte >= 60 && dte <= 400 && c.delta != null && Math.abs(c.delta) >= 0.3 && Math.abs(c.delta) <= 0.7
  })
  const ms = pool.map((c) => contractMetrics(c, opts))
  const spreads = ms.map((m) => m.spreadPct).filter((s) => s != null).sort((a, b) => a - b)
  const medianSpread = spreads.length ? spreads[Math.floor(spreads.length / 2)] : null
  const capacity = ms.reduce((s, m) => s + (m.grade === 'D' ? 0 : m.capDollars), 0)
  const oi = contracts.reduce((s, c) => s + (c.oi ?? 0), 0)
  let tier = 'D'
  if (medianSpread != null) {
    if (medianSpread <= 0.04 && capacity >= 250000) tier = 'A'
    else if (medianSpread <= 0.08 && capacity >= 50000) tier = 'B'
    else if (medianSpread <= 0.15 && capacity >= 10000) tier = 'C'
  }
  return { tier, medianSpread, capacity: Math.round(capacity), oi }
}
