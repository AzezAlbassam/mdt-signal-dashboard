// The swing study's machinery (PROTOCOL-swing.md §5–7): weekly bars, the 34 entry events
// and 18 in/out states, the trade simulator, and the regime backtest.

import * as I from './indicators.js'

export const COST = 0.001 // per side
export const TRACKS = {
  A: { tf: 'daily', stopAtr: 2, targetAtr: 3, horizon: 10, warmup: 252 },
  B: { tf: 'weekly', stopAtr: 2, targetAtr: 4, horizon: 13, warmup: 80 },
  C: { tf: 'weekly', warmup: 80 },
}

// ── bars ───────────────────────────────────────────────────────────────────────

/** Week key = first day of the market's trading week. Tadawul trades Sun–Thu (Sat–Wed before
 *  2013), so its weeks start on Saturday; everything else starts on Monday. */
function weekKey(iso, startDay) {
  const d = new Date(`${iso}T00:00:00Z`)
  const back = (d.getUTCDay() - startDay + 7) % 7
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}

export function toWeekly(series, cutoff) {
  const startDay = series.group === 'saudi' ? 6 : 1
  const out = { ...series, date: [], open: [], high: [], low: [], close: [], volume: [] }
  let key = null
  for (let i = 0; i < series.date.length; i += 1) {
    const k = weekKey(series.date[i], startDay)
    if (k !== key) {
      key = k
      out.date.push(series.date[i])
      out.open.push(series.open[i])
      out.high.push(series.high[i])
      out.low.push(series.low[i])
      out.close.push(series.close[i])
      out.volume.push(series.volume[i])
    } else {
      const j = out.date.length - 1
      out.high[j] = Math.max(out.high[j], series.high[i])
      out.low[j] = Math.min(out.low[j], series.low[i])
      out.close[j] = series.close[i]
      out.volume[j] += series.volume[i]
    }
  }
  // The week holding the cutoff is still forming (the cutoff is a Monday) — drop it.
  if (cutoff && key === weekKey(cutoff, startDay)) {
    for (const f of ['date', 'open', 'high', 'low', 'close', 'volume']) out[f].pop()
  }
  return out
}

// ── signals ────────────────────────────────────────────────────────────────────

const ok = Number.isFinite

function crossAbove(a, b) {
  const bv = typeof b === 'number' ? () => b : (i) => b[i]
  return Array.from(a, (x, i) =>
    i > 0 && ok(x) && ok(a[i - 1]) && ok(bv(i)) && ok(bv(i - 1)) && x > bv(i) && a[i - 1] <= bv(i - 1),
  )
}

const firstOf = (cond) => cond.map((c, i) => c && i > 0 && !cond[i - 1])
const flipUp = (dir) => Array.from(dir, (d, i) => i > 0 && d === 1 && dir[i - 1] === -1)
const gt = (a, b) => Array.from(a, (x, i) => ok(x) && ok(typeof b === 'number' ? b : b[i]) && x > (typeof b === 'number' ? b : b[i]))

/** Breakout system state: in on close > prior `enter`-bar high, out on close < prior `exit`-bar low. */
function breakoutState(high, low, close, enter, exit) {
  const hh = I.lag(I.highest(high, enter), 1)
  const ll = I.lag(I.lowest(low, exit), 1)
  const st = new Array(close.length).fill(false)
  for (let i = 1; i < close.length; i += 1) {
    st[i] = st[i - 1]
    if (ok(hh[i]) && close[i] > hh[i]) st[i] = true
    else if (ok(ll[i]) && close[i] < ll[i]) st[i] = false
  }
  return st
}

/**
 * Compute every indicator once and return { events, states }: events are A/B entry
 * signals (boolean per bar, true on the signal bar), states are C in/out flags.
 */
export function signals(s, tf) {
  const { high: h, low: l, close: c, volume: v } = s
  const weekly = tf === 'weekly'
  const fastN = weekly ? 10 : 50
  const slowN = weekly ? 40 : 200
  const fast = I.sma(c, fastN)
  const slow = I.sma(c, slowN)
  const e20 = I.ema(c, 20)
  const e50 = I.ema(c, 50)
  const m = I.macd(c)
  const st = I.supertrend(h, l, c)
  const ps = I.psar(h, l)
  const ich = I.ichimoku(h, l)
  const dm = I.dmi(h, l, c)
  const ar = I.aroon(h, l)
  const hull = I.hma(c, 9)
  const hullUp = Array.from(hull, (x, i) => i > 0 && ok(x) && ok(hull[i - 1]) && x > hull[i - 1])
  const prevHigh = (n) => I.lag(I.highest(h, n), 1)
  const kc = I.keltner(h, l, c)
  const bb = I.bollinger(c)
  const tv = I.technicalRating(h, l, c, v)
  const r14 = I.rsi(c, 14)
  const r2 = I.rsi(c, 2)
  const sto = I.stochastic(h, l, c)
  const srsi = I.stochRsi(c)
  const cc = I.cci(h, l, c)
  const wr = I.williamsR(h, l, c)
  const ao = I.awesome(h, l)
  const mom = I.momentum(c, 10)
  const ts = I.rateOfChange(c, weekly ? 52 : 252)
  const uo = I.ultimate(h, l, c)
  const tr = I.trix(c)
  const vx = I.vortex(h, l, c)
  const ob = I.obv(c, v)
  const obSma = I.sma(ob, 20)
  const mf = I.mfi(h, l, c, v)
  const cm = I.cmf(h, l, c, v)

  const breakout = (n) => {
    const hh = prevHigh(n)
    return firstOf(Array.from(c, (x, i) => ok(hh[i]) && x > hh[i]))
  }
  const both = (a, b, lim) => Array.from(a, (x, i) => x < lim && b[i] < lim)
  const and = (p, q) => p.map((x, i) => x && q[i])

  const events = {
    ma_cross: crossAbove(fast, slow),
    ema_20_50: crossAbove(e20, e50),
    price_ma: crossAbove(c, slow),
    macd_signal: crossAbove(m.macd, m.signal),
    macd_zero: crossAbove(m.macd, 0),
    supertrend: flipUp(st.dir),
    psar: flipUp(ps.dir),
    ichimoku: crossAbove(c, ich.cloudTop),
    adx_di: and(crossAbove(dm.plus, dm.minus), gt(dm.adx, 20)),
    aroon: crossAbove(ar.up, ar.down),
    hma: firstOf(hullUp),
    donchian20: breakout(20),
    donchian55: breakout(55),
    keltner_break: crossAbove(c, kc.upper),
    bb_break: crossAbove(c, bb.upper),
    tv_rating: crossAbove(tv.all, 0.5),
    rsi_30: crossAbove(r14, 30),
    rsi_50: crossAbove(r14, 50),
    rsi2: firstOf(Array.from(c, (x, i) => ok(r2[i]) && ok(slow[i]) && r2[i] < 10 && x > slow[i])),
    stoch: and(crossAbove(sto.k, sto.d), both(sto.k, sto.d, 20)),
    stochrsi: and(crossAbove(srsi.k, srsi.d), both(srsi.k, srsi.d, 20)),
    cci: crossAbove(cc, -100),
    willr: crossAbove(wr, -80),
    bb_revert: crossAbove(c, bb.lower),
    ao: crossAbove(ao, 0),
    momentum: crossAbove(mom, 0),
    tsmom: crossAbove(ts, 0),
    uo: crossAbove(uo, 30),
    trix: crossAbove(tr, 0),
    vortex: crossAbove(vx.plus, vx.minus),
    obv: crossAbove(ob, obSma),
    mfi: crossAbove(mf, 20),
    cmf: crossAbove(cm, 0),
  }

  const states = {
    ma_cross: gt(fast, slow),
    ema_20_50: gt(e20, e50),
    price_ma: gt(c, slow),
    macd_signal: gt(m.macd, m.signal),
    macd_zero: gt(m.macd, 0),
    supertrend: Array.from(st.dir, (d) => d === 1),
    psar: Array.from(ps.dir, (d) => d === 1),
    ichimoku: gt(c, ich.cloudTop),
    adx_di: gt(dm.plus, dm.minus),
    aroon: gt(ar.up, ar.down),
    hma: hullUp,
    donchian20: breakoutState(h, l, c, 20, 10),
    donchian55: breakoutState(h, l, c, 55, 20),
    tv_rating: gt(tv.all, 0.1),
    rsi_50: gt(r14, 50),
    tsmom: gt(ts, 0),
    vortex: gt(vx.plus, vx.minus),
    obv: gt(ob, obSma),
    cmf: gt(cm, 0),
  }

  return { events, states, atr: I.atr(h, l, c, 14), rating: tv }
}

// ── trades (tracks A and B) ────────────────────────────────────────────────────

/**
 * Outcome of a trade signalled at bar i's close: entry at bar i+1's open, stop/target
 * from ATR at bar i, time exit at the close of the horizon-th bar. Null when the data ends
 * before the trade can finish.
 */
export function tradeFrom(s, i, atrAtSignal, { stopAtr, targetAtr, horizon }) {
  const last = i + horizon
  if (last >= s.close.length || !(atrAtSignal > 0)) return null
  const entry = s.open[i + 1]
  const risk = stopAtr * atrAtSignal
  const stop = entry - risk
  const target = entry + targetAtr * atrAtSignal
  let exit = s.close[last]
  let exitIndex = last
  let reason = 'time'
  for (let j = i + 1; j <= last; j += 1) {
    if (j > i + 1 && s.open[j] <= stop) { exit = s.open[j]; reason = 'stop-gap' }
    else if (j > i + 1 && s.open[j] >= target) { exit = s.open[j]; reason = 'target-gap' }
    // Stop before target on a bar that spans both — see the protocol, §5.
    else if (s.low[j] <= stop) { exit = stop; reason = 'stop' }
    else if (s.high[j] >= target) { exit = target; reason = 'target' }
    else continue
    exitIndex = j
    break
  }
  const net = exit * (1 - COST) - entry * (1 + COST)
  return { i, entry, exit, exitIndex, reason, r: net / risk, ret: net / entry, bars: exitIndex - i }
}

/** All eligible bars' outcomes for one symbol — the random-entry population. */
export function outcomesFor(s, atr, track) {
  const out = new Array(s.close.length).fill(null)
  for (let i = track.warmup; i < s.close.length; i += 1) out[i] = tradeFrom(s, i, atr[i], track)
  return out
}

/** The indicator's trades: one at a time, signals during an open trade ignored. */
export function tradesFor(event, outcomes, warmup) {
  const trades = []
  let busyUntil = -1
  for (let i = warmup; i < event.length; i += 1) {
    if (!event[i] || i < busyUntil) continue
    const t = outcomes[i]
    if (!t) continue
    trades.push(t)
    busyUntil = t.exitIndex
  }
  return trades
}

// ── regimes (track C) ──────────────────────────────────────────────────────────

/**
 * Weekly returns of an in/out rule over bars [from, to). The state decided at bar k's
 * close is held over bar k+1: bought at its open, sold at the open of the first bar after
 * the state turns off. The position entering the window is carried in without a cost.
 */
export function regimeReturns(s, state, from, to) {
  const rule = []
  const hold = []
  const trades = []
  let openAt = null
  for (let j = from; j < to; j += 1) {
    const was = j - 2 >= 0 ? Boolean(state[j - 2]) : false
    const now = Boolean(state[j - 1])
    const bh = s.close[j] / s.close[j - 1] - 1
    hold.push(bh)
    let r = 0
    if (now && was) {
      r = bh
      if (openAt === null) openAt = s.close[j - 1] // carried into the window
    } else if (now && !was) {
      r = s.close[j] / (s.open[j] * (1 + COST)) - 1
      openAt = s.open[j]
    } else if (!now && was) {
      r = (s.open[j] * (1 - COST)) / s.close[j - 1] - 1
      if (openAt === null) openAt = s.close[j - 1]
      trades.push((s.open[j] * (1 - COST)) / (openAt * (1 + COST)) - 1)
      openAt = null
    }
    rule.push(r)
  }
  return { rule, hold, trades }
}

export function perf(weekly) {
  const n = weekly.length
  if (!n) return null
  let eq = 1
  let peak = 1
  let mdd = 0
  let sum = 0
  for (const r of weekly) {
    eq *= 1 + r
    peak = Math.max(peak, eq)
    mdd = Math.min(mdd, eq / peak - 1)
    sum += r
  }
  const mean = sum / n
  let v = 0
  for (const r of weekly) v += (r - mean) ** 2
  const sd = Math.sqrt(v / (n - 1))
  return {
    cagr: eq ** (52 / n) - 1,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(52) : 0,
    maxDD: mdd,
    total: eq - 1,
  }
}
