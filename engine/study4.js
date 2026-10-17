// Study 4 (PROTOCOL-study4.md): 76 entry events × 3 exits × 2 trend filters, daily and
// weekly. Exits are generic so a random entry on the same bars faces exactly the same rule.

import * as I from './indicators.js'
import * as J from './indicators2.js'
import { signals, tradeFrom, tradesFor, COST } from './swing.js'

const ok = Number.isFinite
const crossAbove = (a, b) => {
  const bv = typeof b === 'number' ? () => b : (i) => b[i]
  return Array.from(a, (x, i) => i > 0 && ok(x) && ok(a[i - 1]) && ok(bv(i)) && ok(bv(i - 1)) && x > bv(i) && a[i - 1] <= bv(i - 1))
}
const firstOf = (cond) => cond.map((c, i) => Boolean(c) && i > 0 && !cond[i - 1])
const and = (p, q) => p.map((x, i) => Boolean(x) && Boolean(q[i]))
const turnUp = (s) => Array.from(s, (x, i) => i > 1 && ok(x) && ok(s[i - 1]) && ok(s[i - 2]) && x > s[i - 1] && s[i - 1] <= s[i - 2])
const flipUp = (dir) => Array.from(dir, (d, i) => i > 0 && d === 1 && dir[i - 1] === -1)

export const EXITS = ['E1', 'E2', 'E3']
export const FILTERS = ['F0', 'F1']
export const SETTINGS = {
  daily: { stopAtr: 2, targetAtr: 3, horizon: 10, trendHorizon: 40, warmup: 252, trendMa: 200 },
  weekly: { stopAtr: 2, targetAtr: 4, horizon: 13, trendHorizon: 26, warmup: 80, trendMa: 40 },
}

/** The 43 study-4 entry events, plus study 1's 33 — 76 in all. */
export function events4(s, tf) {
  const { open: o, high: h, low: l, close: c, volume: v } = s
  const base = signals(s, tf)
  const e = { ...base.events }

  const t = J.tsi(c); e.tsi = crossAbove(t.tsi, t.signal)
  const k = J.kst(c); e.kst = crossAbove(k.kst, k.signal)
  e.dpo = crossAbove(J.dpo(c), 0)
  const cp = J.coppock(c); e.coppock = and(turnUp(cp), cp.map((x) => x < 0))
  const f = J.fisher(h, l); e.fisher = and(crossAbove(f.fisher, f.trigger), f.fisher.map((x) => x < 0))
  const sm = J.smi(h, l, c); e.smi = and(crossAbove(sm.smi, sm.signal), sm.smi.map((x) => x < -40))
  const se = J.smiErgodic(c); e.smio = crossAbove(se.smi, se.signal)
  const rg = J.rvgi(o, h, l, c); e.rvgi = crossAbove(rg.rvi, rg.signal)
  e.rvi_vol = crossAbove(J.rviVol(c), 50)
  e.cmo = crossAbove(J.cmo(c), -50)
  e.stc = crossAbove(J.stc(c), 25)
  e.ac = crossAbove(J.accelerator(h, l), 0)
  e.bbp = crossAbove(J.bullBearPower(h, l, c), 0)
  e.efi = crossAbove(J.elderForce(c, v), 0)
  e.eom = crossAbove(J.easeOfMovement(h, l, v), 0)
  e.chosc = crossAbove(J.chaikinOsc(h, l, c, v), 0)
  const kl = J.klinger(h, l, c, v); e.klinger = crossAbove(kl.kvo, kl.signal)
  const ad = J.adLine(h, l, c, v); e.adl = crossAbove(ad, I.sma(ad, 20))
  const pv = J.pvt(c, v); e.pvt = crossAbove(pv, I.sma(pv, 20))
  e.bop = crossAbove(J.balanceOfPower(o, h, l, c), 0)
  const m = I.macd(c); const hist = m.macd.map((x, i) => x - m.signal[i])
  e.macdh = and(turnUp(hist), hist.map((x) => x < 0))
  e.ema_9_21 = crossAbove(I.ema(c, 9), I.ema(c, 21))
  const ich = I.ichimoku(h, l); e.tk_cross = crossAbove(ich.conversion, ich.base)
  const al = J.alligator(h, l)
  e.alligator = firstOf(Array.from(c, (_, i) => ok(al.jaw[i]) && al.lips[i] > al.teeth[i] && al.teeth[i] > al.jaw[i]))
  e.mcginley = crossAbove(c, J.mcginley(c))
  e.alma = crossAbove(c, J.alma(c))
  e.lsma = crossAbove(c, J.linreg(c, 25))
  e.kama = crossAbove(c, J.kama(c))
  e.envelope = crossAbove(c, I.sma(c, 20).map((x) => x * 0.9))
  const ha = J.heikinUp(o, h, l, c); e.heikin = ha.map((u, i) => i > 1 && u && !ha[i - 1] && !ha[i - 2])
  const e13 = I.ema(c, 13)
  const green = Array.from(c, (_, i) => i > 0 && ok(e13[i - 1]) && ok(hist[i - 1]) && e13[i] > e13[i - 1] && hist[i] > hist[i - 1])
  e.impulse = firstOf(green)
  const sq = J.squeeze(h, l, c)
  e.squeeze = Array.from(c, (_, i) => i > 0 && sq.on[i - 1] && !sq.on[i] && sq.val[i] > 0 && sq.val[i] > sq.val[i - 1])
  const wt = J.wavetrend(h, l, c); e.wavetrend = and(crossAbove(wt.wt1, wt.wt2), wt.wt1.map((x) => x < -53))
  const ut = J.utBot(h, l, c); e.ut_bot = crossAbove(c, ut)
  e.ssl = flipUp(J.sslDir(h, l, c))
  e.chandelier = flipUp(J.chandelierDir(h, l, c))
  const q = J.qqe(c); e.qqe = crossAbove(q.rsiMa, q.line)
  e.crsi = crossAbove(J.connorsRsi(c), 10)
  const vf = J.vixFix(h, l, c); e.vixfix = firstOf(Array.from(c, (_, i) => ok(vf.upper[i]) && vf.wvf[i] >= vf.upper[i]))
  e.ibs = firstOf(Array.from(c, (x, i) => h[i] > l[i] && (x - l[i]) / (h[i] - l[i]) < 0.2))
  const ll5 = I.lowest(c, 5); e.pullback5 = firstOf(Array.from(c, (x, i) => ok(ll5[i]) && x <= ll5[i]))
  e.down3 = Array.from(c, (x, i) => i > 3 && x < c[i - 1] && c[i - 1] < c[i - 2] && c[i - 2] < c[i - 3] && !(c[i - 3] < (c[i - 4] ?? Infinity)))
  const ll7 = I.lowest(c, 7); e.double7 = firstOf(Array.from(c, (x, i) => ok(ll7[i]) && x <= ll7[i]))

  const st = SETTINGS[tf]
  const trendMa = I.sma(c, st.trendMa)
  const filters = { F0: c.map(() => true), F1: Array.from(c, (x, i) => ok(trendMa[i]) && x > trendMa[i]) }
  return { events: e, filters, atr14: base.atr, atr22: I.atr(h, l, c, 22), sma5: I.sma(c, 5) }
}

// ── exits ──────────────────────────────────────────────────────────────────────

const finish = (entry, exit, risk, i, exitIndex, reason) => {
  const net = exit * (1 - COST) - entry * (1 + COST)
  return { i, exitIndex, reason, r: net / risk, ret: net / entry, bars: exitIndex - i }
}

/** E2: exit at the next open after the first close above SMA 5; disaster stop 3×ATR14; time exit. */
export function exitE2(s, i, atr, sma5, horizon) {
  const last = i + horizon
  if (last >= s.close.length || !(atr > 0)) return null
  const entry = s.open[i + 1]
  const risk = 3 * atr
  const stop = entry - risk
  for (let j = i + 1; j <= last; j += 1) {
    if (j > i + 1 && s.open[j] <= stop) return finish(entry, s.open[j], risk, i, j, 'stop-gap')
    if (s.low[j] <= stop) return finish(entry, stop, risk, i, j, 'stop')
    if (ok(sma5[j]) && s.close[j] > sma5[j]) {
      if (j === last) return finish(entry, s.close[j], risk, i, j, 'revert')
      return finish(entry, s.open[j + 1], risk, i, j + 1, 'revert')
    }
  }
  return finish(entry, s.close[last], risk, i, last, 'time')
}

/** E3: Chandelier trailing stop (highest high since entry − 3×ATR22, never lowered); time exit. */
export function exitE3(s, i, atr22, horizon) {
  const last = i + horizon
  if (last >= s.close.length || !(atr22[i] > 0)) return null
  const entry = s.open[i + 1]
  const risk = 3 * atr22[i]
  let level = entry - risk
  let hh = -Infinity
  for (let j = i + 1; j <= last; j += 1) {
    if (j > i + 1 && s.open[j] <= level) return finish(entry, s.open[j], risk, i, j, 'stop-gap')
    if (s.low[j] <= level) return finish(entry, level, risk, i, j, 'stop')
    hh = Math.max(hh, s.high[j])
    if (ok(atr22[j])) level = Math.max(level, hh - 3 * atr22[j])
  }
  return finish(entry, s.close[last], risk, i, last, 'time')
}

export function outcomes4(s, tf, x) {
  const st = SETTINGS[tf]
  const n = s.close.length
  const out = { E1: new Array(n).fill(null), E2: new Array(n).fill(null), E3: new Array(n).fill(null) }
  for (let i = st.warmup; i < n; i += 1) {
    out.E1[i] = tradeFrom(s, i, x.atr14[i], st)
    out.E2[i] = exitE2(s, i, x.atr14[i], x.sma5, st.horizon)
    out.E3[i] = exitE3(s, i, x.atr22, st.trendHorizon)
  }
  return out
}

/** Reduce one symbol to per-strategy trades and per-(exit, filter) random-entry populations. */
export function summarize4(meta, s, tf, split) {
  const st = SETTINGS[tf]
  const x = events4(s, tf)
  const oc = outcomes4(s, tf, x)
  const per = (i) => (s.date[i] < split ? 'I' : 'II')
  const pack = (ts) => ({ r: Float64Array.from(ts, (t) => t.r), ret: Float64Array.from(ts, (t) => t.ret), bars: Uint16Array.from(ts, (t) => t.bars) })
  const base = {}
  const trades = {}
  for (const ex of EXITS) {
    for (const fl of FILTERS) {
      const b = { I: [], II: [] }
      oc[ex].forEach((o, i) => o && x.filters[fl][i] && b[per(i)].push(o))
      base[`${ex}|${fl}`] = Object.fromEntries(['I', 'II'].map((p) => [p, { r: Float64Array.from(b[p], (o) => o.r), wins: b[p].filter((o) => o.ret > 0).length }]))
      for (const [id, ev] of Object.entries(x.events)) {
        const gated = and(ev, x.filters[fl])
        const ts = tradesFor(gated, oc[ex], st.warmup)
        trades[`${tf}|${id}|${ex}|${fl}`] = { I: pack(ts.filter((t) => per(t.i) === 'I')), II: pack(ts.filter((t) => per(t.i) === 'II')) }
      }
    }
  }
  const last = s.close.length - 1
  const current = Object.entries(x.events).filter(([, ev]) => ev[last]).map(([id]) => ({
    id, date: s.date[last], close: s.close[last], atr14: x.atr14[last], atr22: x.atr22[last], uptrend: x.filters.F1[last],
  }))
  return { ...meta, tf, base, trades, current }
}
