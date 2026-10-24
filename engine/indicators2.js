// Study 4's additional indicators (PROTOCOL-study4.md §2): the remaining TradingView
// built-ins and widely used open-source community scripts, at their default inputs, written
// from their published Pine source. Same contract as engine/indicators.js: plain arrays in,
// Float64Array out, NaN until defined, value i depends only on bars 0..i.

import * as I from './indicators.js'

const ok = Number.isFinite
const nan = (n) => new Float64Array(n).fill(NaN)
const map2 = (a, b, f) => Float64Array.from(a, (x, i) => f(x, b[i], i))
const change = (s) => Float64Array.from(s, (x, i) => (i > 0 ? x - s[i - 1] : NaN))

/** Pine's ta.linreg(src, len, 0): the least-squares line's value at the current bar. */
export function linreg(src, len) {
  const out = nan(src.length)
  const sx = ((len - 1) * len) / 2
  const sxx = ((len - 1) * len * (2 * len - 1)) / 6
  for (let i = len - 1; i < src.length; i += 1) {
    let sy = 0
    let sxy = 0
    let good = true
    for (let k = 0; k < len; k += 1) {
      const y = src[i - len + 1 + k]
      if (!ok(y)) { good = false; break }
      sy += y
      sxy += k * y
    }
    if (!good) continue
    const slope = (len * sxy - sx * sy) / (len * sxx - sx * sx)
    const intercept = (sy - slope * sx) / len
    out[i] = intercept + slope * (len - 1)
  }
  return out
}

/** Pine's ta.swma: symmetric weights 1/6, 2/6, 2/6, 1/6 over 4 bars. */
const swma = (s) => Float64Array.from(s, (x, i) => (i >= 3 ? (x + 2 * s[i - 1] + 2 * s[i - 2] + s[i - 3]) / 6 : NaN))

export function tsi(close, long = 25, short = 13, sig = 13) {
  const pc = change(close)
  const ds = I.ema(I.ema(pc, long), short)
  const da = I.ema(I.ema(pc.map(Math.abs), long), short)
  const t = map2(ds, da, (a, b) => (b === 0 ? NaN : (100 * a) / b))
  return { tsi: t, signal: I.ema(t, sig) }
}

export function kst(close) {
  const roc = (n) => I.rateOfChange(close, n).map((x) => 100 * x)
  const a = I.sma(roc(10), 10)
  const b = I.sma(roc(15), 10)
  const c = I.sma(roc(20), 10)
  const d = I.sma(roc(30), 15)
  const k = a.map((x, i) => x + 2 * b[i] + 3 * c[i] + 4 * d[i])
  return { kst: k, signal: I.sma(k, 9) }
}

/** DPO, TradingView's non-centred form: close − SMA(21) from 21/2 + 1 bars ago. */
export function dpo(close, n = 21) {
  const back = Math.floor(n / 2) + 1
  const m = I.lag(I.sma(close, n), back)
  return map2(close, m, (c, x) => c - x)
}

export function coppock(close) {
  const r = I.rateOfChange(close, 14).map((x, i) => 100 * (x + I.rateOfChange(close, 11)[i]))
  return I.wma(r, 10)
}

export function fisher(high, low, n = 9) {
  const hl2 = high.map((h, i) => (h + low[i]) / 2)
  const hh = I.highest(hl2, n)
  const ll = I.lowest(hl2, n)
  const fish = nan(high.length)
  let value = 0
  let prev = 0
  for (let i = 0; i < high.length; i += 1) {
    if (!ok(hh[i])) continue
    const span = hh[i] - ll[i]
    value = 0.66 * ((span === 0 ? 0.5 : (hl2[i] - ll[i]) / span) - 0.5) + 0.67 * value
    value = Math.max(-0.999, Math.min(0.999, value))
    prev = 0.5 * Math.log((1 + value) / (1 - value)) + 0.5 * prev
    fish[i] = prev
  }
  return { fisher: fish, trigger: I.lag(fish, 1) }
}

/** Stochastic Momentum Index (TradingView built-in: 10, 3, 3). */
export function smi(high, low, close, k = 10, d = 3, e = 3) {
  const hh = I.highest(high, k)
  const ll = I.lowest(low, k)
  const rel = close.map((c, i) => c - (hh[i] + ll[i]) / 2)
  const rng = hh.map((h, i) => h - ll[i])
  const ee = (s) => I.ema(I.ema(s, d), d)
  const num = ee(rel)
  const den = ee(rng)
  const s = map2(num, den, (a, b) => (b === 0 ? NaN : (200 * a) / b))
  return { smi: s, signal: I.ema(s, e) }
}

/** SMI Ergodic (5, 20, 5): Pine's ta.tsi(close, 5, 20) and its EMA. */
export function smiErgodic(close, short = 5, long = 20, sig = 5) {
  const pc = change(close)
  const ds = I.ema(I.ema(pc, long), short)
  const da = I.ema(I.ema(pc.map(Math.abs), long), short)
  const e = map2(ds, da, (a, b) => (b === 0 ? NaN : a / b))
  return { smi: e, signal: I.ema(e, sig) }
}

export function rvgi(open, high, low, close, n = 10) {
  const num = swma(close.map((c, i) => c - open[i]))
  const den = swma(high.map((h, i) => h - low[i]))
  const sn = I.rollingSum(num, n)
  const sd = I.rollingSum(den, n)
  const r = map2(sn, sd, (a, b) => (b === 0 ? NaN : a / b))
  return { rvi: r, signal: swma(r) }
}

/** Relative Volatility Index (10, 14). */
export function rviVol(close, sdLen = 10, len = 14) {
  const sd = I.stdev(close, sdLen)
  const ch = change(close)
  const up = I.ema(sd.map((s, i) => (ok(ch[i]) && ch[i] > 0 ? s : 0)), len)
  const dn = I.ema(sd.map((s, i) => (ok(ch[i]) && ch[i] <= 0 ? s : 0)), len)
  return map2(up, dn, (u, d) => (u + d === 0 ? NaN : (100 * u) / (u + d)))
}

export function cmo(close, n = 9) {
  const ch = change(close)
  const su = I.rollingSum(ch.map((x) => (x > 0 ? x : 0)), n)
  const sd = I.rollingSum(ch.map((x) => (x < 0 ? -x : 0)), n)
  return map2(su, sd, (u, d) => (u + d === 0 ? 0 : (100 * (u - d)) / (u + d)))
}

/** Schaff Trend Cycle (10, 23, 50, factor 0.5). */
export function stc(close, len = 10, fast = 23, slow = 50, factor = 0.5) {
  const m = map2(I.ema(close, fast), I.ema(close, slow), (a, b) => a - b)
  const n = close.length
  const out = nan(n)
  const pfArr = nan(n)
  let f1 = 0, pf = NaN, f2 = 0, pff = NaN
  for (let i = 0; i < n; i += 1) {
    if (!ok(m[i]) || i < len - 1) continue
    let lo = Infinity, hi = -Infinity
    let good = true
    for (let k = i - len + 1; k <= i; k += 1) { if (!ok(m[k])) { good = false; break } lo = Math.min(lo, m[k]); hi = Math.max(hi, m[k]) }
    if (!good) continue
    if (hi - lo > 0) f1 = ((m[i] - lo) / (hi - lo)) * 100
    pf = ok(pf) ? pf + factor * (f1 - pf) : f1
    pfArr[i] = pf
    let lo2 = Infinity, hi2 = -Infinity
    let good2 = true
    for (let k = i - len + 1; k <= i; k += 1) { if (!ok(pfArr[k])) { good2 = false; break } lo2 = Math.min(lo2, pfArr[k]); hi2 = Math.max(hi2, pfArr[k]) }
    if (!good2) continue
    if (hi2 - lo2 > 0) f2 = ((pf - lo2) / (hi2 - lo2)) * 100
    pff = ok(pff) ? pff + factor * (f2 - pff) : f2
    out[i] = pff
  }
  return out
}

export const accelerator = (high, low) => {
  const ao = I.awesome(high, low)
  return map2(ao, I.sma(ao, 5), (a, b) => a - b)
}

export function bullBearPower(high, low, close, n = 13) {
  const e = I.ema(close, n)
  return high.map((h, i) => h - e[i] + (low[i] - e[i]))
}

export const elderForce = (close, volume, n = 13) => I.ema(change(close).map((c, i) => c * volume[i]), n)

export function easeOfMovement(high, low, volume, n = 14) {
  const hl2 = high.map((h, i) => (h + low[i]) / 2)
  const ch = change(hl2)
  return I.sma(ch.map((c, i) => (volume[i] === 0 ? NaN : (10000 * c * (high[i] - low[i])) / volume[i])), n)
}

export function adLine(high, low, close, volume) {
  const out = new Float64Array(close.length)
  let acc = 0
  for (let i = 0; i < close.length; i += 1) {
    const r = high[i] - low[i]
    acc += r === 0 ? 0 : (((close[i] - low[i]) - (high[i] - close[i])) / r) * volume[i]
    out[i] = acc
  }
  return out
}

export function chaikinOsc(high, low, close, volume) {
  const ad = adLine(high, low, close, volume)
  return map2(I.ema(ad, 3), I.ema(ad, 10), (a, b) => a - b)
}

/** TradingView's Klinger Oscillator: signed volume by hlc3 direction, EMA 34 − EMA 55, signal 13. */
export function klinger(high, low, close, volume) {
  const hlc3 = close.map((c, i) => (high[i] + low[i] + c) / 3)
  const ch = change(hlc3)
  const sv = volume.map((v, i) => (ok(ch[i]) ? (ch[i] >= 0 ? v : -v) : NaN))
  const k = map2(I.ema(sv, 34), I.ema(sv, 55), (a, b) => a - b)
  return { kvo: k, signal: I.ema(k, 13) }
}

export function pvt(close, volume) {
  const out = new Float64Array(close.length)
  for (let i = 1; i < close.length; i += 1) out[i] = out[i - 1] + ((close[i] - close[i - 1]) / close[i - 1]) * volume[i]
  return out
}

export const balanceOfPower = (open, high, low, close, n = 14) =>
  I.sma(close.map((c, i) => (high[i] === low[i] ? 0 : (c - open[i]) / (high[i] - low[i]))), n)

export function alligator(high, low) {
  const hl2 = high.map((h, i) => (h + low[i]) / 2)
  return { jaw: I.lag(I.rma(hl2, 13), 8), teeth: I.lag(I.rma(hl2, 8), 5), lips: I.lag(I.rma(hl2, 5), 3) }
}

export function mcginley(close, n = 14) {
  const out = nan(close.length)
  const e = I.ema(close, n)
  let md = NaN
  for (let i = 0; i < close.length; i += 1) {
    if (!ok(md)) md = e[i]
    else md = md + (close[i] - md) / (0.6 * n * (close[i] / md) ** 4)
    out[i] = md
  }
  return out
}

export function alma(src, n = 9, offset = 0.85, sigma = 6) {
  const m = offset * (n - 1)
  const s = n / sigma
  const w = Array.from({ length: n }, (_, k) => Math.exp(-((k - m) ** 2) / (2 * s * s)))
  const ws = w.reduce((a, b) => a + b, 0)
  const out = nan(src.length)
  for (let i = n - 1; i < src.length; i += 1) {
    let acc = 0
    for (let k = 0; k < n; k += 1) acc += src[i - n + 1 + k] * w[k]
    out[i] = acc / ws
  }
  return out
}

export function kama(close, n = 10, fast = 2, slow = 30) {
  const out = nan(close.length)
  const fsc = 2 / (fast + 1)
  const ssc = 2 / (slow + 1)
  let k = NaN
  for (let i = 0; i < close.length; i += 1) {
    if (i < n) continue
    let vol = 0
    for (let j = i - n + 1; j <= i; j += 1) vol += Math.abs(close[j] - close[j - 1])
    const er = vol === 0 ? 0 : Math.abs(close[i] - close[i - n]) / vol
    const sc = (er * (fsc - ssc) + ssc) ** 2
    k = ok(k) ? k + sc * (close[i] - k) : close[i]
    out[i] = k
  }
  return out
}

export function heikinUp(open, high, low, close) {
  const up = new Array(close.length).fill(false)
  let hao = NaN
  let hac = NaN
  for (let i = 0; i < close.length; i += 1) {
    const c = (open[i] + high[i] + low[i] + close[i]) / 4
    hao = ok(hao) ? (hao + hac) / 2 : (open[i] + close[i]) / 2
    hac = c
    up[i] = hac > hao
  }
  return up
}

/** Squeeze Momentum (LazyBear): BB 20/2 inside KC 20/1.5 (true range); momentum = linreg. */
export function squeeze(high, low, close) {
  const bb = I.bollinger(close, 20, 2)
  const ma = I.sma(close, 20)
  const rng = I.sma(I.trueRange(high, low, close), 20)
  const on = close.map((_, i) => ok(bb.lower[i]) && ok(rng[i]) && bb.lower[i] > ma[i] - 1.5 * rng[i] && bb.upper[i] < ma[i] + 1.5 * rng[i])
  const hh = I.highest(high, 20)
  const ll = I.lowest(low, 20)
  const val = linreg(close.map((c, i) => c - ((hh[i] + ll[i]) / 2 + ma[i]) / 2), 20)
  return { on, val }
}

export function wavetrend(high, low, close, n1 = 10, n2 = 21) {
  const ap = close.map((c, i) => (high[i] + low[i] + c) / 3)
  const esa = I.ema(ap, n1)
  const d = I.ema(ap.map((x, i) => Math.abs(x - esa[i])), n1)
  const ci = ap.map((x, i) => (d[i] === 0 ? 0 : (x - esa[i]) / (0.015 * d[i])))
  const wt1 = I.ema(ci, n2)
  return { wt1, wt2: I.sma(wt1, 4) }
}

/** UT Bot alerts (key 1, ATR 10): ATR trailing stop on close. */
export function utBot(high, low, close, key = 1, n = 10) {
  const loss = I.atr(high, low, close, n).map((a) => key * a)
  const ts = nan(close.length)
  let prev = 0
  for (let i = 0; i < close.length; i += 1) {
    if (!ok(loss[i])) continue
    const src = close[i]
    const src1 = i > 0 ? close[i - 1] : src
    let t
    if (src > prev && src1 > prev) t = Math.max(prev, src - loss[i])
    else if (src < prev && src1 < prev) t = Math.min(prev, src + loss[i])
    else if (src > prev) t = src - loss[i]
    else t = src + loss[i]
    ts[i] = t
    prev = t
  }
  return ts
}

/** SSL Channel (10): direction +1 / −1. */
export function sslDir(high, low, close, n = 10) {
  const sh = I.sma(high, n)
  const sl = I.sma(low, n)
  const dir = nan(close.length)
  let h = NaN
  for (let i = 0; i < close.length; i += 1) {
    if (!ok(sh[i])) continue
    if (close[i] > sh[i]) h = 1
    else if (close[i] < sl[i]) h = -1
    dir[i] = ok(h) ? h : NaN
  }
  return dir
}

/** Chandelier Exit (22, 3, use close for extremums) direction +1 / −1. */
export function chandelierDir(high, low, close, n = 22, mult = 3) {
  const a = I.atr(high, low, close, n).map((x) => mult * x)
  const hc = I.highest(close, n)
  const lc = I.lowest(close, n)
  const dir = nan(close.length)
  let ls = NaN, ss = NaN, d = 1
  for (let i = 0; i < close.length; i += 1) {
    if (!ok(a[i]) || !ok(hc[i])) continue
    let longStop = hc[i] - a[i]
    let shortStop = lc[i] + a[i]
    const lsPrev = ok(ls) ? ls : longStop
    const ssPrev = ok(ss) ? ss : shortStop
    if (i > 0 && close[i - 1] > lsPrev) longStop = Math.max(longStop, lsPrev)
    if (i > 0 && close[i - 1] < ssPrev) shortStop = Math.min(shortStop, ssPrev)
    d = close[i] > ssPrev ? 1 : close[i] < lsPrev ? -1 : d
    ls = longStop
    ss = shortStop
    dir[i] = d
  }
  return dir
}

/** QQE (RSI 14, smoothing 5, factor 4.238): RSI-MA and its fast trailing line. */
export function qqe(close, rsiLen = 14, sf = 5, factor = 4.238) {
  const wilders = rsiLen * 2 - 1
  const rsiMa = I.ema(I.rsi(close, rsiLen), sf)
  const atrRsi = Float64Array.from(rsiMa, (x, i) => (i > 0 ? Math.abs(rsiMa[i - 1] - x) : NaN))
  const dar = I.ema(I.ema(atrRsi, wilders), wilders).map((x) => x * factor)
  const n = close.length
  const line = nan(n)
  const lbA = nan(n)
  const sbA = nan(n)
  // Pine's ta.cross(a, b): a crosses b in either direction between bar i−1 and bar i.
  const crossed = (a0, b0, a1, b1) => ok(a0) && ok(b0) && ok(a1) && ok(b1) && ((a0 > b0 && a1 <= b1) || (a0 < b0 && a1 >= b1))
  let trend = 1
  for (let i = 1; i < n; i += 1) {
    if (!ok(dar[i]) || !ok(rsiMa[i]) || !ok(rsiMa[i - 1])) continue
    const r = rsiMa[i]
    const r1 = rsiMa[i - 1]
    const lbPrev = lbA[i - 1]
    const sbPrev = sbA[i - 1]
    lbA[i] = ok(lbPrev) && r1 > lbPrev && r > lbPrev ? Math.max(lbPrev, r - dar[i]) : r - dar[i]
    sbA[i] = ok(sbPrev) && r1 < sbPrev && r < sbPrev ? Math.min(sbPrev, r + dar[i]) : r + dar[i]
    // trend := cross(RSIndex, shortband[1]) ? 1 : cross(longband[1], RSIndex) ? -1 : trend[1]
    if (i >= 2 && crossed(r, sbA[i - 1], r1, sbA[i - 2])) trend = 1
    else if (i >= 2 && crossed(lbA[i - 1], r, lbA[i - 2], r1)) trend = -1
    line[i] = trend === 1 ? lbA[i] : sbA[i]
  }
  return { rsiMa, line }
}

/** Connors RSI (3, 2, 100). */
export function connorsRsi(close, rsiLen = 3, streakLen = 2, rankLen = 100) {
  const n = close.length
  const streak = new Float64Array(n)
  for (let i = 1; i < n; i += 1) {
    if (close[i] > close[i - 1]) streak[i] = streak[i - 1] > 0 ? streak[i - 1] + 1 : 1
    else if (close[i] < close[i - 1]) streak[i] = streak[i - 1] < 0 ? streak[i - 1] - 1 : -1
    else streak[i] = 0
  }
  const r1 = I.rsi(close, rsiLen)
  const r2 = I.rsi(streak, streakLen)
  const roc = Float64Array.from(close, (c, i) => (i > 0 ? (c - close[i - 1]) / close[i - 1] : NaN))
  const out = nan(n)
  for (let i = rankLen + 1; i < n; i += 1) {
    let below = 0
    for (let k = i - rankLen; k < i; k += 1) if (roc[k] < roc[i]) below += 1
    const pr = (100 * below) / rankLen
    if (ok(r1[i]) && ok(r2[i])) out[i] = (r1[i] + r2[i] + pr) / 3
  }
  return out
}

/** Williams Vix Fix (CM: 22, BB 20 × 2). */
export function vixFix(high, low, close, pd = 22, bbl = 20, mult = 2) {
  const hc = I.highest(close, pd)
  const wvf = hc.map((h, i) => ((h - low[i]) / h) * 100)
  const mid = I.sma(wvf, bbl)
  const sd = I.stdev(wvf, bbl)
  return { wvf, upper: mid.map((m, i) => m + mult * sd[i]) }
}
