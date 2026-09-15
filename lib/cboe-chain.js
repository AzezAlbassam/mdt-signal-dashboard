/**
 * Reading an option chain from CBOE's delayed quote endpoint.
 *
 * The plain expected-move family is priced from the chain, so everything that
 * can quietly corrupt a straddle is rejected here rather than downstream: the
 * adjusted roots that carry a non-standard deliverable, the already-expired
 * series that still ships with frozen quotes, one-sided and crossed markets,
 * and spreads too wide to take a mid from.
 *
 * Pure functions over a parsed payload. Nothing here performs I/O.
 */

/** Everything a quote must clear before its mid is trusted. */
export const QUOTE_LIMITS = {
  minBid: 0.01,
  /** (ask - bid) / mid. Beyond this the mid is a guess, not a price. */
  maxRelativeSpread: 0.25,
}

const OCC = /^([A-Z][A-Z0-9]{0,5})(\d{6})([CP])(\d{8})$/

/**
 * Decode an OCC contract symbol.
 * The root is returned as written so the caller can reject adjusted series;
 * this function never decides which roots are acceptable.
 * @returns {{root:string, expiry:string, type:'C'|'P', strike:number}|null}
 */
export function parseOccSymbol (symbol) {
  if (typeof symbol !== 'string') return null
  const m = OCC.exec(symbol.replace(/\s+/g, ''))
  if (!m) return null
  const [, root, yymmdd, type, mils] = m
  return {
    root,
    expiry: `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`,
    type,
    strike: Number(mils) / 1000,
  }
}

/** The one fund root whose contracts deliver 100 ordinary shares. */
const STANDARD_ROOT = 'SPY'

/**
 * Accepted roots per underlying, in preference order.
 *
 * The index lists two. The weekly root expires Monday through Friday and settles
 * on the close. The monthly root expires on the third Friday and settles on a
 * special opening quotation taken from that morning's opening prints, so on that
 * one date both roots carry the same expiry at different prices. Preferring the
 * weekly root keeps every horizon measured to a close.
 */
export const ROOT_SETS = {
  SPY: ['SPY'],
  SPX: ['SPXW', 'SPX'],
  QQQ: ['QQQ'],
  NDX: ['NDXP', 'NDX'],
}

/**
 * Turn a raw CBOE payload into contracts, dropping anything that is not a
 * parseable option on an accepted root, and reporting how much was dropped.
 * @param {object} payload
 * @param {{root?:string, roots?:string[]}} [options] roots is an ordered
 *   preference list; root is the single-root shorthand.
 */
export function parseChain (payload, { root, roots } = {}) {
  const accepted = roots ?? (root ? [root] : [STANDARD_ROOT])
  const options = payload?.data?.options
  if (!Array.isArray(options)) {
    throw new TypeError('chain payload has no data.options array')
  }
  const rejected = { adjustedRoot: 0, unparseable: 0 }
  const contracts = []
  for (const o of options) {
    const parsed = parseOccSymbol(o?.option)
    if (!parsed) { rejected.unparseable++; continue }
    if (!accepted.includes(parsed.root)) { rejected.adjustedRoot++; continue }
    contracts.push({
      ...parsed,
      bid: typeof o.bid === 'number' ? o.bid : null,
      ask: typeof o.ask === 'number' ? o.ask : null,
      iv: typeof o.iv === 'number' && o.iv > 0 ? o.iv : null,
      delta: typeof o.delta === 'number' ? o.delta : null,
      openInterest: o.open_interest ?? null,
      volume: o.volume ?? null,
    })
  }
  if (contracts.length === 0) {
    throw new Error(`no usable ${accepted.join(' or ')} contracts in chain`)
  }
  return {
    roots: accepted,
    spot: payload.data.current_price ?? null,
    prevClose: payload.data.close ?? null,
    vendorIv30: payload.data.iv30 ?? null,
    timestamp: payload.timestamp ?? null,
    contracts,
    rejected,
  }
}

/** Every expiry present, as sorted dates, listed once however many roots carry it. */
export const expiriesIn = (chain) =>
  [...new Set(chain.contracts.map((c) => c.expiry))].sort()

/** The distinct roots actually present in the chain. */
export const rootsIn = (chain) => [...new Set(chain.contracts.map((c) => c.root))]

/**
 * The contracts for one expiry, matched by date equality.
 *
 * A missing expiry throws: sliding onto the nearest one silently prices the
 * wrong horizon, and on a Monday that means an already-expired series. When two
 * roots carry the same date, the chain's preference order decides, so the
 * close-settled series wins unless a root is named explicitly.
 */
export function contractsFor (chain, expiry, { root } = {}) {
  const atDate = chain.contracts.filter((c) => c.expiry === expiry)
  if (atDate.length === 0) {
    throw new Error(`chain has no contracts expiring ${expiry}; it lists ${expiriesIn(chain).join(', ')}`)
  }
  if (root) {
    const named = atDate.filter((c) => c.root === root)
    if (named.length === 0) {
      throw new Error(`chain has no ${root} contracts expiring ${expiry}; that date carries ${[...new Set(atDate.map((c) => c.root))].join(', ')}`)
    }
    return named
  }
  for (const preferred of chain.roots ?? []) {
    const matching = atDate.filter((c) => c.root === preferred)
    if (matching.length > 0) return matching
  }
  return atDate
}

/**
 * The mid of a two-sided quote, or null when the quote cannot be trusted.
 * The result keeps its half cent: rounding here costs up to a full cent on a
 * straddle, which is a third of the narrowest zone ever observed.
 */
export function midPrice (quote) {
  const { bid, ask } = quote ?? {}
  if (typeof bid !== 'number' || typeof ask !== 'number') return null
  if (bid < QUOTE_LIMITS.minBid) return null
  if (ask < bid) return null
  const mid = (bid + ask) / 2
  if (mid <= 0) return null
  if ((ask - bid) / mid > QUOTE_LIMITS.maxRelativeSpread) return null
  return mid
}

/** Strikes with a trustworthy quote on both sides, ascending. */
export function quotableStrikes (chain, expiry, options) {
  const byStrike = new Map()
  for (const c of contractsFor(chain, expiry, options)) {
    const mid = midPrice(c)
    if (mid == null) continue
    const entry = byStrike.get(c.strike) ?? { strike: c.strike }
    entry[c.type] = { mid, iv: c.iv, bid: c.bid, ask: c.ask, root: c.root }
    byStrike.set(c.strike, entry)
  }
  return [...byStrike.values()]
    .filter((e) => e.C && e.P)
    .sort((a, b) => a.strike - b.strike)
}

/**
 * The forward, from put-call parity at the strike where the two sides agree
 * most closely. That strike is where parity is least distorted by the skew.
 */
export function forwardFor (chain, expiry, options) {
  const strikes = quotableStrikes(chain, expiry, options)
  if (strikes.length === 0) {
    throw new Error(`no two-sided quotes at ${expiry}; cannot derive a forward`)
  }
  let best = strikes[0]
  for (const s of strikes) {
    if (Math.abs(s.C.mid - s.P.mid) < Math.abs(best.C.mid - best.P.mid)) best = s
  }
  return best.strike + best.C.mid - best.P.mid
}

/** The quotable strike nearest a reference price. */
export function atmStrike (chain, expiry, reference, options) {
  const strikes = quotableStrikes(chain, expiry, options)
  if (strikes.length === 0) throw new Error(`no two-sided quotes at ${expiry}`)
  let best = strikes[0]
  for (const s of strikes) {
    if (Math.abs(s.strike - reference) < Math.abs(best.strike - reference)) best = s
  }
  return best.strike
}

/**
 * The at-the-money straddle and volatility for one expiry.
 * @returns {{expiry, strike, forward, callMid, putMid, straddle, straddleSpread, iv}}
 */
export function atmQuote (chain, expiry, options) {
  const forward = forwardFor(chain, expiry, options)
  const strike = atmStrike(chain, expiry, forward, options)
  const entry = quotableStrikes(chain, expiry, options).find((s) => s.strike === strike)
  const ivs = [entry.C.iv, entry.P.iv].filter((v) => typeof v === 'number')
  return {
    expiry,
    root: entry.C.root ?? entry.P.root ?? null,
    strike,
    forward,
    callMid: entry.C.mid,
    putMid: entry.P.mid,
    straddle: entry.C.mid + entry.P.mid,
    straddleSpread: (entry.C.ask + entry.P.ask) - (entry.C.bid + entry.P.bid),
    iv: ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null,
  }
}
