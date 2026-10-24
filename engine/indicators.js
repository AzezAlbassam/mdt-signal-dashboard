// TradingView's built-in indicators at their default inputs, written to match Pine's
// definitions (ta.ema seeds with an SMA, ta.rma is Wilder's average, ta.stdev is the
// population deviation, and so on), for PROTOCOL-swing.md §7.
//
// Every function takes plain arrays and returns a Float64Array the same length, NaN where
// the value is not yet defined. Value i depends only on inputs 0..i — that is the
// no-look-ahead property, and test/indicators.test.js checks it by truncation.

const nanArray = (n) => new Float64Array(n).fill(NaN)
const ok = Number.isFinite

export function sma(src, n) {
  const out = nanArray(src.length)
  let sum = 0
  let bad = 0
  for (let i = 0; i < src.length; i += 1) {
    if (ok(src[i])) sum += src[i]
    else bad += 1
    if (i >= n) {
      if (ok(src[i - n])) sum -= src[i - n]
      else bad -= 1
    }
    if (i >= n - 1 && bad === 0) out[i] = sum / n
  }
  return out
}

/** Exponential average with the given alpha, seeded with the SMA of the first n values. */
function seededAverage(src, n, alpha) {
  const out = nanArray(src.length)
  let run = 0
  let prev = NaN
  for (let i = 0; i < src.length; i += 1) {
    if (!ok(src[i])) {
      run = 0
      prev = NaN
      continue
    }
    run += 1
    if (ok(prev)) {
      prev = alpha * src[i] + (1 - alpha) * prev
    } else if (run >= n) {
      let s = 0
      for (let k = i - n + 1; k <= i; k += 1) s += src[k]
      prev = s / n
    }
    out[i] = prev
  }
  return out
}

export const ema = (src, n) => seededAverage(src, n, 2 / (n + 1))
export const rma = (src, n) => seededAverage(src, n, 1 / n)

export function wma(src, n) {
  const out = nanArray(src.length)
  const denom = (n * (n + 1)) / 2
  for (let i = n - 1; i < src.length; i += 1) {
    let s = 0
    let good = true
    for (let k = 0; k < n; k += 1) {
      const x = src[i - k]
      if (!ok(x)) {
        good = false
        break
      }
      s += x * (n - k)
    }
    if (good) out[i] = s / denom
  }
  return out
}

export function stdev(src, n) {
  const mean = sma(src, n)
  const out = nanArray(src.length)
  for (let i = n - 1; i < src.length; i += 1) {
    if (!ok(mean[i])) continue
    let s = 0
    for (let k = i - n + 1; k <= i; k += 1) s += (src[k] - mean[i]) ** 2
    out[i] = Math.sqrt(s / n)
  }
  return out
}

export function rollingSum(src, n) {
  const m = sma(src, n)
  return m.map((x) => x * n)
}

export function highest(src, n) {
  const out = nanArray(src.length)
  for (let i = n - 1; i < src.length; i += 1) {
    let m = -Infinity
    for (let k = i - n + 1; k <= i; k += 1) m = Math.max(m, src[k])
    out[i] = m
  }
  return out
}

export function lowest(src, n) {
  const out = nanArray(src.length)
  for (let i = n - 1; i < src.length; i += 1) {
    let m = Infinity
    for (let k = i - n + 1; k <= i; k += 1) m = Math.min(m, src[k])
    out[i] = m
  }
  return out
}

/** Shift a series right by k bars: out[i] = src[i − k]. */
export function lag(src, k) {
  const out = nanArray(src.length)
  for (let i = k; i < src.length; i += 1) out[i] = src[i - k]
  return out
}

export function trueRange(high, low, close) {
  const out = new Float64Array(high.length)
  for (let i = 0; i < high.length; i += 1) {
    out[i] =
      i === 0
        ? high[i] - low[i]
        : Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]))
  }
  return out
}

export const atr = (high, low, close, n = 14) => rma(trueRange(high, low, close), n)

export function rsi(close, n = 14) {
  const up = nanArray(close.length)
  const down = nanArray(close.length)
  for (let i = 1; i < close.length; i += 1) {
    const d = close[i] - close[i - 1]
    up[i] = Math.max(d, 0)
    down[i] = Math.max(-d, 0)
  }
  const u = rma(up, n)
  const d = rma(down, n)
  return u.map((x, i) => (d[i] === 0 ? 100 : x === 0 ? 0 : 100 - 100 / (1 + x / d[i])))
}

export function macd(close, fast = 12, slow = 26, signal = 9) {
  const f = ema(close, fast)
  const s = ema(close, slow)
  const line = f.map((x, i) => x - s[i])
  return { macd: line, signal: ema(line, signal) }
}

/** Raw stochastic of src against the high/low window — Pine's ta.stoch. */
function rawStoch(src, high, low, n) {
  const hh = highest(high, n)
  const ll = lowest(low, n)
  return src.map((x, i) => (hh[i] === ll[i] ? NaN : (100 * (x - ll[i])) / (hh[i] - ll[i])))
}

export function stochastic(high, low, close, n = 14, kSmooth = 3, dSmooth = 3) {
  const k = sma(rawStoch(close, high, low, n), kSmooth)
  return { k, d: sma(k, dSmooth) }
}

export function stochRsi(close, kSmooth = 3, dSmooth = 3, rsiLen = 14, stochLen = 14) {
  const r = rsi(close, rsiLen)
  const k = sma(rawStoch(r, r, r, stochLen), kSmooth)
  return { k, d: sma(k, dSmooth) }
}

export function cci(high, low, close, n = 20) {
  const tp = close.map((c, i) => (high[i] + low[i] + c) / 3)
  const m = sma(tp, n)
  const out = nanArray(close.length)
  for (let i = n - 1; i < close.length; i += 1) {
    let dev = 0
    for (let k = i - n + 1; k <= i; k += 1) dev += Math.abs(tp[k] - m[i])
    dev /= n
    if (dev > 0) out[i] = (tp[i] - m[i]) / (0.015 * dev)
  }
  return out
}

export function williamsR(high, low, close, n = 14) {
  const hh = highest(high, n)
  const ll = lowest(low, n)
  return close.map((c, i) => (hh[i] === ll[i] ? NaN : (100 * (c - hh[i])) / (hh[i] - ll[i])))
}

export function bollinger(close, n = 20, mult = 2) {
  const basis = sma(close, n)
  const sd = stdev(close, n)
  return {
    basis,
    upper: basis.map((b, i) => b + mult * sd[i]),
    lower: basis.map((b, i) => b - mult * sd[i]),
  }
}

/** Keltner Channels, TradingView defaults: EMA 20, bands = 2 × ATR(10). */
export function keltner(high, low, close, n = 20, mult = 2, atrLen = 10) {
  const basis = ema(close, n)
  const range = atr(high, low, close, atrLen)
  return {
    basis,
    upper: basis.map((b, i) => b + mult * range[i]),
    lower: basis.map((b, i) => b - mult * range[i]),
  }
}

/** Supertrend(10, 3) as Pine's ta.supertrend. dir = +1 uptrend, −1 downtrend. */
export function supertrend(high, low, close, atrLen = 10, factor = 3) {
  const a = atr(high, low, close, atrLen)
  const n = close.length
  const dir = nanArray(n)
  const line = nanArray(n)
  let upper = NaN
  let lower = NaN
  let prevDir = NaN
  for (let i = 0; i < n; i += 1) {
    if (!ok(a[i])) continue
    const mid = (high[i] + low[i]) / 2
    let up = mid + factor * a[i]
    let lo = mid - factor * a[i]
    if (ok(lower) && !(lo > lower || close[i - 1] < lower)) lo = lower
    if (ok(upper) && !(up < upper || close[i - 1] > upper)) up = upper
    let d
    if (!ok(prevDir)) d = -1 // Pine starts in "down" (its direction = 1)
    else if (prevDir === -1) d = close[i] > up ? 1 : -1
    else d = close[i] < lo ? -1 : 1
    dir[i] = d
    line[i] = d === 1 ? lo : up
    upper = up
    lower = lo
    prevDir = d
  }
  return { dir, line }
}

/** Parabolic SAR(0.02, 0.02, 0.2). dir = +1 when SAR is below price. */
export function psar(high, low, start = 0.02, inc = 0.02, max = 0.2) {
  const n = high.length
  const dir = nanArray(n)
  const sar = nanArray(n)
  if (n < 2) return { dir, sar }
  let long = high[1] >= high[0] && low[1] >= low[0]
  let s = long ? low[0] : high[0]
  let ep = long ? high[1] : low[1]
  let af = start
  for (let i = 1; i < n; i += 1) {
    if (i > 1) {
      s = s + af * (ep - s)
      if (long) {
        s = Math.min(s, low[i - 1], low[i - 2])
        if (low[i] < s) {
          long = false
          s = ep
          ep = low[i]
          af = start
        } else if (high[i] > ep) {
          ep = high[i]
          af = Math.min(af + inc, max)
        }
      } else {
        s = Math.max(s, high[i - 1], high[i - 2])
        if (high[i] > s) {
          long = true
          s = ep
          ep = high[i]
          af = start
        } else if (low[i] < ep) {
          ep = low[i]
          af = Math.min(af + inc, max)
        }
      }
    }
    sar[i] = s
    dir[i] = long ? 1 : -1
  }
  return { dir, sar }
}

/**
 * Ichimoku 9/26/52/26. The cloud plotted at bar i was computed 25 bars earlier — Pine's
 * displacement − 1 — so cloudTop[i] uses only bars ≤ i − 25.
 */
export function ichimoku(high, low, conv = 9, base = 26, spanB = 52, disp = 26) {
  const mid = (n) => {
    const hh = highest(high, n)
    const ll = lowest(low, n)
    return hh.map((h, i) => (h + ll[i]) / 2)
  }
  const conversion = mid(conv)
  const baseLine = mid(base)
  const lead1 = conversion.map((c, i) => (c + baseLine[i]) / 2)
  const lead2 = mid(spanB)
  const a = lag(lead1, disp - 1)
  const b = lag(lead2, disp - 1)
  return {
    conversion,
    base: baseLine,
    lead1,
    lead2,
    cloudTop: a.map((x, i) => Math.max(x, b[i])),
    cloudBottom: a.map((x, i) => Math.min(x, b[i])),
  }
}

/** DMI / ADX (14, 14). */
export function dmi(high, low, close, diLen = 14, adxLen = 14) {
  const n = high.length
  const plusDM = nanArray(n)
  const minusDM = nanArray(n)
  for (let i = 1; i < n; i += 1) {
    const up = high[i] - high[i - 1]
    const down = low[i - 1] - low[i]
    plusDM[i] = up > down && up > 0 ? up : 0
    minusDM[i] = down > up && down > 0 ? down : 0
  }
  const tr = trueRange(high, low, close)
  tr[0] = NaN
  const trR = rma(tr, diLen)
  const plus = rma(plusDM, diLen).map((x, i) => (100 * x) / trR[i])
  const minus = rma(minusDM, diLen).map((x, i) => (100 * x) / trR[i])
  const dx = plus.map((p, i) => {
    const s = p + minus[i]
    return s === 0 ? 0 : (100 * Math.abs(p - minus[i])) / s
  })
  return { plus, minus, adx: rma(dx, adxLen) }
}

/** Aroon(14): 100 × (n − bars since the n+1-bar extreme) / n, as Pine's highestbars. */
export function aroon(high, low, n = 14) {
  const len = high.length
  const up = nanArray(len)
  const down = nanArray(len)
  for (let i = n; i < len; i += 1) {
    let hi = i
    let lo = i
    for (let k = i; k >= i - n; k -= 1) {
      if (high[k] > high[hi]) hi = k
      if (low[k] < low[lo]) lo = k
    }
    up[i] = (100 * (n - (i - hi))) / n
    down[i] = (100 * (n - (i - lo))) / n
  }
  return { up, down }
}

export function hma(src, n = 9) {
  const half = wma(src, Math.floor(n / 2))
  const full = wma(src, n)
  const diff = half.map((h, i) => 2 * h - full[i])
  return wma(diff, Math.floor(Math.sqrt(n)))
}

export function awesome(high, low) {
  const mid = high.map((h, i) => (h + low[i]) / 2)
  const f = sma(mid, 5)
  const s = sma(mid, 34)
  return f.map((x, i) => x - s[i])
}

export function momentum(close, n = 10) {
  return close.map((c, i) => (i >= n ? c - close[i - n] : NaN))
}

export function rateOfChange(close, n) {
  return close.map((c, i) => (i >= n ? c / close[i - n] - 1 : NaN))
}

export function ultimate(high, low, close, a = 7, b = 14, c = 28) {
  const n = close.length
  const bp = nanArray(n)
  const tr = nanArray(n)
  for (let i = 1; i < n; i += 1) {
    const lo = Math.min(low[i], close[i - 1])
    bp[i] = close[i] - lo
    tr[i] = Math.max(high[i], close[i - 1]) - lo
  }
  const avg = (k) => {
    const sb = rollingSum(bp, k)
    const st = rollingSum(tr, k)
    return sb.map((x, i) => (st[i] === 0 ? NaN : x / st[i]))
  }
  const A = avg(a)
  const B = avg(b)
  const C = avg(c)
  return A.map((x, i) => (100 * (4 * x + 2 * B[i] + C[i])) / 7)
}

export function trix(close, n = 18) {
  const e = ema(ema(ema(close.map(Math.log), n), n), n)
  return e.map((x, i) => (i > 0 ? 10000 * (x - e[i - 1]) : NaN))
}

export function vortex(high, low, close, n = 14) {
  const len = high.length
  const vp = nanArray(len)
  const vm = nanArray(len)
  for (let i = 1; i < len; i += 1) {
    vp[i] = Math.abs(high[i] - low[i - 1])
    vm[i] = Math.abs(low[i] - high[i - 1])
  }
  const tr = trueRange(high, low, close)
  tr[0] = NaN
  const st = rollingSum(tr, n)
  return {
    plus: rollingSum(vp, n).map((x, i) => x / st[i]),
    minus: rollingSum(vm, n).map((x, i) => x / st[i]),
  }
}

export function obv(close, volume) {
  const out = new Float64Array(close.length)
  for (let i = 1; i < close.length; i += 1) {
    const d = close[i] - close[i - 1]
    out[i] = out[i - 1] + (d > 0 ? volume[i] : d < 0 ? -volume[i] : 0)
  }
  return out
}

export function mfi(high, low, close, volume, n = 14) {
  const len = close.length
  const tp = close.map((c, i) => (high[i] + low[i] + c) / 3)
  const pos = nanArray(len)
  const neg = nanArray(len)
  for (let i = 1; i < len; i += 1) {
    const flow = tp[i] * volume[i]
    pos[i] = tp[i] > tp[i - 1] ? flow : 0
    neg[i] = tp[i] < tp[i - 1] ? flow : 0
  }
  const p = rollingSum(pos, n)
  const q = rollingSum(neg, n)
  return p.map((x, i) => (q[i] === 0 ? (x === 0 ? NaN : 100) : 100 - 100 / (1 + x / q[i])))
}

export function cmf(high, low, close, volume, n = 20) {
  const mfv = close.map((c, i) =>
    high[i] === low[i] ? 0 : (((c - low[i]) - (high[i] - c)) / (high[i] - low[i])) * volume[i],
  )
  const a = rollingSum(mfv, n)
  const v = rollingSum(volume, n)
  return a.map((x, i) => (v[i] === 0 ? NaN : x / v[i]))
}

export function vwma(close, volume, n = 20) {
  const cv = rollingSum(close.map((c, i) => c * volume[i]), n)
  const v = rollingSum(volume, n)
  return cv.map((x, i) => (v[i] === 0 ? NaN : x / v[i]))
}

/**
 * TradingView Technical Ratings, rebuilt from the published description (protocol §8).
 * Votes are +1 / 0 / −1; a vote whose inputs are undefined is skipped, as in Pine.
 */
export function technicalRating(high, low, close, volume) {
  const n = close.length
  const mas = [10, 20, 30, 50, 100, 200].flatMap((p) => [sma(close, p), ema(close, p)])
  mas.push(vwma(close, volume, 20), hma(close, 9))
  const ich = ichimoku(high, low)

  const r = rsi(close, 14)
  const st = stochastic(high, low, close)
  const c = cci(high, low, close, 20)
  const d = dmi(high, low, close)
  const ao = awesome(high, low)
  const mom = momentum(close, 10)
  const m = macd(close)
  const sr = stochRsi(close)
  const wr = williamsR(high, low, close, 14)
  const e13 = ema(close, 13)
  const uo = ultimate(high, low, close)
  const trendAvg = ema(close, 50)

  const ma = nanArray(n)
  const osc = nanArray(n)
  const all = nanArray(n)

  for (let i = 2; i < n; i += 1) {
    let sum = 0
    let cnt = 0
    for (const s of mas) {
      if (!ok(s[i])) continue
      sum += s[i] < close[i] ? 1 : s[i] > close[i] ? -1 : 0
      cnt += 1
    }
    if (ok(ich.base[i]) && ok(ich.conversion[i]) && ok(ich.lead1[i]) && ok(ich.lead2[i])) {
      let v = 0
      if (ich.lead1[i] > ich.lead2[i] && close[i] > ich.lead1[i] && close[i] < ich.base[i] &&
          close[i - 1] < ich.conversion[i] && close[i] > ich.conversion[i]) v = 1
      else if (ich.lead2[i] > ich.lead1[i] && close[i] < ich.lead2[i] && close[i] > ich.base[i] &&
          close[i - 1] > ich.conversion[i] && close[i] < ich.conversion[i]) v = -1
      sum += v
      cnt += 1
    }
    if (cnt) ma[i] = sum / cnt

    const up = close[i] > trendAvg[i]
    const down = close[i] < trendAvg[i]
    let os = 0
    let oc = 0
    const vote = (defined, buy, sell) => {
      if (!defined) return
      os += buy ? 1 : sell ? -1 : 0
      oc += 1
    }
    vote(ok(r[i]) && ok(r[i - 1]), r[i] < 30 && r[i] > r[i - 1], r[i] > 70 && r[i] < r[i - 1])
    vote(ok(st.k[i]) && ok(st.d[i]),
      st.k[i] < 20 && st.d[i] < 20 && st.k[i] > st.d[i], st.k[i] > 80 && st.d[i] > 80 && st.k[i] < st.d[i])
    vote(ok(c[i]) && ok(c[i - 1]), c[i] < -100 && c[i] > c[i - 1], c[i] > 100 && c[i] < c[i - 1])
    vote(ok(d.adx[i]) && ok(d.plus[i - 1]),
      d.adx[i] > 20 && d.plus[i - 1] < d.minus[i - 1] && d.plus[i] > d.minus[i],
      d.adx[i] > 20 && d.plus[i - 1] > d.minus[i - 1] && d.plus[i] < d.minus[i])
    vote(ok(ao[i]) && ok(ao[i - 2]),
      (ao[i] > 0 && ao[i - 1] < 0) || (ao[i] > 0 && ao[i - 1] > 0 && ao[i - 2] > ao[i - 1] && ao[i] > ao[i - 1]),
      (ao[i] < 0 && ao[i - 1] > 0) || (ao[i] < 0 && ao[i - 1] < 0 && ao[i - 2] < ao[i - 1] && ao[i] < ao[i - 1]))
    vote(ok(mom[i]) && ok(mom[i - 1]), mom[i] > mom[i - 1], mom[i] < mom[i - 1])
    vote(ok(m.signal[i]), m.macd[i] > m.signal[i], m.macd[i] < m.signal[i])
    vote(ok(sr.k[i]) && ok(sr.d[i]) && ok(trendAvg[i]),
      down && sr.k[i] < 20 && sr.d[i] < 20 && sr.k[i] > sr.d[i],
      up && sr.k[i] > 80 && sr.d[i] > 80 && sr.k[i] < sr.d[i])
    vote(ok(wr[i]) && ok(wr[i - 1]), wr[i] < -80 && wr[i] > wr[i - 1], wr[i] > -20 && wr[i] < wr[i - 1])
    {
      const bull = high[i] - e13[i]
      const bear = low[i] - e13[i]
      const bullPrev = high[i - 1] - e13[i - 1]
      const bearPrev = low[i - 1] - e13[i - 1]
      vote(ok(e13[i - 1]) && ok(trendAvg[i]),
        up && bear < 0 && bear > bearPrev, down && bull > 0 && bull < bullPrev)
    }
    vote(ok(uo[i]), uo[i] > 70, uo[i] < 30)
    if (oc) osc[i] = os / oc

    if (ok(ma[i]) && ok(osc[i])) all[i] = (ma[i] + osc[i]) / 2
    else if (ok(ma[i])) all[i] = ma[i]
    else if (ok(osc[i])) all[i] = osc[i]
  }
  return { ma, osc, all }
}
