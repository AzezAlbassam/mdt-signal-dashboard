// HINDSIGHT vs REAL-TIME — what the "WALL CONTACTS · POTENTIAL TRADES" list of the O → D
// vortex (engine/vortex.js) is worth to someone who does not already know where D is.
//
//   node scripts/vortex-replay.js > reports/vortex-replay.txt
//
// The video replays candle 0..475 with "past" in black and "future" in grey, which invites the
// reading that each frame uses only the black part. It does not: N, the vector, the ellipse and
// both walls are all sized from the finished window O → D. This script measures the gap.
//
// SWING WINDOWS. The video does not say how O and D were chosen, so windows come from
// engine zigzag at three thresholds per dataset (stated in the report). Window k runs from
// pivot k to pivot k+1; only windows of at least MIN_N candles are used, in hindsight and in
// real time alike (below that the 3 % skip rounds to zero and the walls are two-candle noise).
//
// (1) HINDSIGHT, exactly as the tool does it. buildVortex on the finished window; every contact
//     is a trade at its peak OHLC4 (the price the list prints), long at the lower wall and short
//     at the upper. Exit "at D": at D's anchor price. Exit "vector": the first later candle whose
//     range reaches the line O → D (filled at the line, or at the open if it gapped through), else
//     at D. Exit "video": with-trend contacts (short in a falling window, long in a rising one)
//     held to D, counter-trend ones closed at the vector — the reading under which all three of
//     the video's listed trades win.
//
// (2) REAL TIME, bar by bar, using only bars ≤ t.
//       O  = the last zigzag pivot CONFIRMED by bar t (zigzag is causal, so this is exact).
//       D  = the running extreme since O in the swing direction — the provisional D a trader
//            would draw to — at that candle's low (falling) or high (rising).
//       W  = from the window O..D, all of which is ≤ t.
//     The display only changes when O changes or a new extreme prints, so those are the only
//     bars on which a contact can appear. A SIGNAL is a contact (side + candle run) not
//     overlapping any same-side contact shown earlier in the same window.
//       (a) what is on screen at each t;
//       (b) for each final (hindsight) contact, when it was first on screen;
//       (c) signals that later vanished — at least once, and for good (absent from the final list);
//       (d) trades: enter at the CLOSE of the bar on which a signal first appears. "at D": D is
//           only known when zigzag confirms the next pivot — exit at the close of that bar.
//           "vector": the line O → provisional D as drawn on the previous bar, extended to the
//           current one, else as "at D". "video": as in (1).
//     Then each listed contact is traded twice, paired: as listed, and from the close of the bar
//     on which it first appeared — the cleanest measure of what hindsight is worth.
//
// NULLS, 2000 seeded draws each, trade-for-trade: same window, same direction, same exit rule,
// entry at a random bar. Hindsight: a random candle inside the window's contact zone
// [skip, N − skip] at its OHLC4. Real time, at the close of:
//   A  a random bar while the window was live on screen (the null the brief specifies);
//   B  a random UPDATE bar of the window (new extreme or new O), the only bars a signal lands on;
//   C  a random update bar in the same window AND the same phase of the swing (the first display
//      on its own, then tenths of the way from it to D). Signals bunch on the first display and
//      never land in the bounce after D, so A and B partly reward timing; C controls it.
// p = share of draws whose mean return matched or beat the rule's, one-sided. Holm adjustment is
// reported across each real-time family. Paired comparisons use a sign-flip permutation.
//
// COSTS: 0.5 index point round trip on US500 2h and 4h; 0 on SPX daily. Returns are % of entry.
//
// DATA (env overrides in brackets): PEPPERSTONE:US500 1h [US500_1H_CSV], bucketed here into 2h
// candles on New York wall-clock time exactly as the screen's; PEPPERSTONE:US500 4h
// [US500_4H_CSV]; TVC:SPX daily, 5000 sessions from 2006-11 [SPX_1D_CSV]. All CSV t,o,h,l,c,v with
// t in unix seconds UTC; the directory defaults to [VORTEX_DATA]. Set VORTEX_TIMELINE=<path> to
// also write every display update (what was on screen, when) as JSON.

import fs from 'node:fs'

import { ohlc4, buildVortex, zigzag } from '../engine/vortex.js'
import { seededRng } from '../engine/null-models.js'
import { wilsonInterval, bootstrapMean } from '../engine/stats.js'

const DATA = process.env.VORTEX_DATA ?? '/tmp/vortex/data'
const US500_1H = process.env.US500_1H_CSV ?? `${DATA}/us500_1h_pepperstone.csv`
const US500_4H = process.env.US500_4H_CSV ?? `${DATA}/us500_4h_pepperstone.csv`
const SPX_1D = process.env.SPX_1D_CSV ?? `${DATA}/tvc_spx_1d.csv`
const TIMELINE_OUT = process.env.VORTEX_TIMELINE // optional: per-update display log as JSON

const DRAWS = 2000
const MIN_N = 20
const SKIP_FRAC = 0.03 // "Ignore near O and D 3 %"
const CONTACT_LEVEL = 0.85 // "Contact level 85 %"

// ---------------------------------------------------------------- data

function loadCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
  const idx = Object.fromEntries(lines[0].split(',').map((h, i) => [h.trim(), i]))
  return lines.slice(1).map((line) => {
    const f = line.split(',')
    return { t: +f[idx.t], o: +f[idx.o], h: +f[idx.h], l: +f[idx.l], c: +f[idx.c] }
  })
}

const NY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
const nyParts = (t) => Object.fromEntries(NY.formatToParts(new Date(t * 1000)).map((p) => [p.type, p.value]))
const nyStamp = (t) => { const p = nyParts(t); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` }

/**
 * 1h bars into 2h candles on New York wall-clock time (00:00, 02:00, … 22:00), the same
 * bucketing as the screen's candles. `t` becomes NY local time written as a UTC epoch.
 */
function twoHourNY(hourly) {
  const out = []
  for (const b of hourly) {
    const p = nyParts(b.t)
    const hr = Number(p.hour)
    const t = Date.UTC(+p.year, +p.month - 1, +p.day, hr - (hr % 2)) / 1000
    const last = out.at(-1)
    if (last && last.t === t) {
      last.h = Math.max(last.h, b.h)
      last.l = Math.min(last.l, b.l)
      last.c = b.c
    } else {
      out.push({ t, o: b.o, h: b.h, l: b.l, c: b.c })
    }
  }
  for (const b of out) b.label = new Date(b.t * 1000).toISOString().slice(0, 16).replace('T', ' ')
  return out
}

const withLabels = (bars, fmt) => bars.map((b) => ({ ...b, label: fmt(b.t) }))

// ---------------------------------------------------------------- real-time machinery

const absContact = (c, o) => ({
  side: c.side, start: o + c.start, end: o + c.end, peak: o + c.peakIndex,
  candles: c.candles, peakE: c.peakE, price: c.price,
})
const overlaps = (a, b) => a.side === b.side && a.start <= b.end && a.end >= b.start

/**
 * Bar t's pivot is confirmed on the first bar whose prefix already reports it. zigzag is causal
 * (its output on bars[0..t] is a prefix of its output on all bars), so this is exact.
 */
function confirmationBars(bars, threshold, pivots) {
  const count = (t) => zigzag(bars.slice(0, t + 1), threshold).length
  return pivots.map((p, k) => {
    let lo = p.index + 1
    let hi = bars.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (count(mid) > k) hi = mid
      else lo = mid + 1
    }
    const seen = zigzag(bars.slice(0, lo + 1), threshold)
    if (seen.length <= k || seen[k].index !== p.index) throw new Error('zigzag is not prefix-stable')
    return lo
  })
}

/**
 * Replay one window from bar `from` to `to` as a trader sees it: O fixed, D = the running
 * extreme since O, everything recomputed from bars ≤ t whenever the extreme moves.
 */
function walk(bars, { o, oPrice, falling, from, to }) {
  const better = (x, y) => (falling ? x < y : x > y)
  const ext = (j) => (falling ? bars[j].l : bars[j].h)
  let d = -1
  let dp = NaN
  for (let j = o + 1; j < from; j += 1) if (d < 0 || better(ext(j), dp)) { d = j; dp = ext(j) }

  const len = to - from + 1
  const dAt = new Int32Array(len)
  const dpAt = new Float64Array(len)
  const shown = new Int32Array(len)
  const updates = []
  let list = []
  for (let t = from; t <= to; t += 1) {
    let changed = t === from
    if (d < 0 || better(ext(t), dp)) { d = t; dp = ext(t); changed = true }
    dAt[t - from] = d
    dpAt[t - from] = dp
    if (changed && d - o >= MIN_N) {
      const v = buildVortex(bars, { o, d, oPrice, dPrice: dp, skipFrac: SKIP_FRAC, contactLevel: CONTACT_LEVEL })
      list = v.contacts.map((c) => absContact(c, o))
      updates.push({ t, d, dPrice: dp, N: d - o, Wup: v.Wup, Wdn: v.Wdn, list })
    }
    shown[t - from] = d - o >= MIN_N ? list.length : 0
  }
  return { from, to, dAt, dpAt, shown, updates }
}

/** Signals: first appearances. A track absorbs every later same-side contact overlapping it. */
function trackSignals(updates) {
  const tracks = []
  for (const u of updates) {
    const seen = new Set()
    for (const c of u.list) {
      const hits = tracks.filter((tr) => overlaps(tr, c))
      if (hits.length === 0) {
        const tr = { side: c.side, start: c.start, end: c.end, firstT: u.t, first: c, alive: true, everVanished: false, reappeared: false }
        tracks.push(tr)
        seen.add(tr)
      }
      for (const tr of hits) {
        tr.start = Math.min(tr.start, c.start)
        tr.end = Math.max(tr.end, c.end)
        seen.add(tr)
      }
    }
    for (const tr of tracks) {
      if (seen.has(tr)) {
        if (!tr.alive) tr.reappeared = true
        tr.alive = true
      } else if (tr.alive) {
        tr.alive = false
        tr.everVanished = true
      }
    }
  }
  return tracks
}

/** The display in force at bar t (null before the window has MIN_N candles). */
function displayAt(w, t) {
  let cur = null
  for (const u of w.updates) {
    if (u.t > t) break
    cur = u
  }
  return cur
}

// ---------------------------------------------------------------- exits

const netPct = (dir, entry, exit, costPts) => ((dir * (exit - entry) - costPts) / entry) * 100

/** First bar in [first, last] at or after each bar whose range reaches level(u), from below and above. */
function touches(bars, first, last, level) {
  const len = last - first + 2
  const up = new Int32Array(len).fill(-1)
  const dn = new Int32Array(len).fill(-1)
  for (let u = last; u >= first; u -= 1) {
    const L = level(u)
    up[u - first] = bars[u].h >= L ? u : up[u - first + 1]
    dn[u - first] = bars[u].l <= L ? u : dn[u - first + 1]
  }
  return { first, last, up, dn, level }
}

/** Exit at the line on the first bar after entry that reaches it; at the open if it gapped through. */
function lineExit(bars, tc, entryBar, dir) {
  const from = entryBar + 1
  if (from < tc.first || from > tc.last) return null
  const u = (dir > 0 ? tc.up : tc.dn)[from - tc.first]
  if (u < 0) return null
  const L = tc.level(u)
  return { bar: u, price: dir > 0 ? Math.max(bars[u].o, L) : Math.min(bars[u].o, L) }
}

// ---------------------------------------------------------------- one dataset × threshold

function analyse(bars, threshold, costPts) {
  const pivots = zigzag(bars, threshold)
  const conf = confirmationBars(bars, threshold, pivots)
  const windows = []

  for (let k = 0; k < pivots.length; k += 1) {
    const P = pivots[k]
    const o = P.index
    const falling = P.kind === 'high'
    const resolved = k + 1 < pivots.length
    const D = resolved ? pivots[k + 1] : null
    const liveStart = conf[k]
    const liveEnd = resolved ? conf[k + 1] - 1 : bars.length - 1
    const w = walk(bars, { o, oPrice: P.price, falling, from: liveStart, to: liveEnd })
    const win = { k, o, P, D, falling, resolved, liveStart, liveEnd, exitBar: resolved ? conf[k + 1] : null, ...w }
    win.N = resolved ? D.index - o : null
    win.eligible = resolved && win.N >= MIN_N
    win.tracks = trackSignals(w.updates)
    windows.push(win)
    if (!win.eligible) continue

    // ---- the finished window, as the video draws it
    const hv = buildVortex(bars, { o, d: D.index, oPrice: P.price, dPrice: D.price, skipFrac: SKIP_FRAC, contactLevel: CONTACT_LEVEL })
    win.hv = hv
    win.final = hv.contacts.map((c) => absContact(c, o))
    const last = w.updates.at(-1)
    if (!last || last.d !== D.index || JSON.stringify(last.list) !== JSON.stringify(win.final)) {
      throw new Error(`window ${k}: the real-time display at D does not equal the hindsight list`)
    }

    // ---- hindsight exits and their null pool (every candle in the contact zone)
    win.hTrade = hindsightBook(bars, hv, o, D, costPts)
    const zone = []
    for (let j = o + hv.skip; j <= D.index - hv.skip; j += 1) zone.push(j)
    win.hPool = poolFor(zone, (j, dir) => win.hTrade(j, dir, ohlc4(bars[j])), falling)

    // ---- real-time exits and their null pools
    win.rTrade = realtimeBook(bars, w, o, P.price, win.exitBar, costPts)
    const live = []
    for (let t = liveStart; t <= liveEnd; t += 1) if (w.dAt[t - w.from] - o >= MIN_N) live.push(t)
    win.rPoolA = poolFor(live, win.rTrade, falling)
    win.rPoolB = poolFor(w.updates.map((u) => u.t), win.rTrade, falling)

    // Null C strata: the first display on its own, then tenths of the way from it to D.
    const u0 = w.updates[0].t
    win.phase = (t) => (t === u0 ? -1 : Math.min(9, Math.floor((10 * (t - u0)) / (D.index - u0))))
    const byPhase = new Map()
    for (const u of w.updates) {
      const ph = win.phase(u.t)
      if (!byPhase.has(ph)) byPhase.set(ph, [])
      byPhase.get(ph).push(u.t)
    }
    win.rPoolC = new Map([...byPhase].map(([ph, ts]) => [ph, poolFor(ts, win.rTrade, falling)]))
  }
  return { threshold, pivots, conf, windows }
}

/** Hindsight exits on the finished window: at D's anchor price, or on the line O → D. */
function hindsightBook(bars, hv, o, D, costPts) {
  const line = touches(bars, o + 1, D.index, (u) => hv.vector[u - o])
  return (j, dir, entry) => {
    const ve = lineExit(bars, line, j, dir)
    return {
      atD: netPct(dir, entry, D.price, costPts),
      atVector: netPct(dir, entry, ve ? ve.price : D.price, costPts),
      vectorBar: ve ? ve.bar : D.index,
      vectorPrice: ve ? ve.price : D.price,
      touched: Boolean(ve),
    }
  }
}

/**
 * Real-time exits: at the close of the bar on which D is confirmed (`exitBar`), or on the line
 * O → provisional D as drawn on the previous bar, extended to the current one.
 */
function realtimeBook(bars, w, o, oPrice, exitBar, costPts) {
  const level = (u) => {
    const i = u - 1 - w.from
    return oPrice + ((w.dpAt[i] - oPrice) * (u - o)) / (w.dAt[i] - o)
  }
  const line = touches(bars, w.from + 1, exitBar, level)
  const exitClose = bars[exitBar].c
  return (t, dir) => {
    const entry = bars[t].c
    const ve = lineExit(bars, line, t, dir)
    return {
      atD: netPct(dir, entry, exitClose, costPts),
      atVector: netPct(dir, entry, ve ? ve.price : exitClose, costPts),
      vectorBar: ve ? ve.bar : exitBar,
      vectorPrice: ve ? ve.price : exitClose,
      touched: Boolean(ve),
    }
  }
}

/**
 * Precomputed returns for every candidate entry bar, by direction and exit. "video" is the
 * reading most generous to the list: with-trend trades held to D, counter-trend ones closed at
 * the vector.
 */
function poolFor(entryBars, trade, falling) {
  const pool = {}
  for (const dir of [1, -1]) pool[dir] = { atD: [], atVector: [], video: [] }
  for (const j of entryBars) {
    for (const dir of [1, -1]) {
      const r = trade(j, dir)
      pool[dir].atD.push(r.atD)
      pool[dir].atVector.push(r.atVector)
      pool[dir].video.push((falling ? dir < 0 : dir > 0) ? r.atD : r.atVector)
    }
  }
  return pool
}

// ---------------------------------------------------------------- trades

const dirOf = (side) => (side === 'long' ? 1 : -1)
const withTrend = (win, side) => (win.falling ? side === 'short' : side === 'long')

const EXITS = ['atD', 'atVector', 'video']
const EXIT_LABEL = { atD: 'at D', atVector: 'vector', video: 'video' }
const addVideo = (t) => ({ ...t, video: t.trend ? t.atD : t.atVector })

function hindsightTrades(res) {
  const out = []
  for (const win of res.windows) {
    if (!win.eligible) continue
    for (const c of win.final) {
      const dir = dirOf(c.side)
      out.push(addVideo({ win, side: c.side, dir, trend: withTrend(win, c.side), entryBar: c.peak, entry: c.price, ...win.hTrade(c.peak, dir, c.price), pool: win.hPool }))
    }
  }
  return out
}

const NULL_POOL = {
  A: (win) => win.rPoolA,
  B: (win) => win.rPoolB,
  C: (win, t) => win.rPoolC.get(win.phase(t)),
}

function realtimeTrades(res, nullKey = 'A') {
  const out = []
  for (const win of res.windows) {
    if (!win.eligible) continue
    for (const tr of win.tracks) {
      const dir = dirOf(tr.side)
      const pool = NULL_POOL[nullKey](win, tr.firstT)
      out.push(addVideo({ win, side: tr.side, dir, trend: withTrend(win, tr.side), entryBar: tr.firstT, track: tr, ...win.rTrade(tr.firstT, dir), pool }))
    }
  }
  return out
}

/** Holm step-down adjustment. */
function holm(ps) {
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0])
  const adj = new Array(ps.length)
  let run = 0
  order.forEach(([p, i], r) => {
    run = Math.max(run, Math.min(1, (ps.length - r) * p))
    adj[i] = run
  })
  return adj
}

function nullMeans(trades, exit, rng) {
  const means = new Float64Array(DRAWS)
  for (let d = 0; d < DRAWS; d += 1) {
    let s = 0
    for (const tr of trades) {
      const arr = tr.pool[tr.dir][exit]
      s += arr[Math.floor(rng() * arr.length)]
    }
    means[d] = s / trades.length
  }
  return means
}

function clusterBootstrap(trades, exit, rng, draws = 2000) {
  const groups = new Map()
  for (const tr of trades) {
    if (!groups.has(tr.win)) groups.set(tr.win, [])
    groups.get(tr.win).push(tr[exit])
  }
  const g = [...groups.values()].map((v) => [v.reduce((a, b) => a + b, 0), v.length])
  const means = []
  for (let d = 0; d < draws; d += 1) {
    let s = 0
    let n = 0
    for (let i = 0; i < g.length; i += 1) {
      const [sum, len] = g[Math.floor(rng() * g.length)]
      s += sum
      n += len
    }
    means.push(s / n)
  }
  means.sort((a, b) => a - b)
  return [means[Math.floor(0.025 * draws)], means[Math.floor(0.975 * draws)]]
}

function scoreTrades(trades, exit, seed) {
  if (trades.length === 0) return null
  const values = trades.map((t) => t[exit])
  const wins = values.filter((v) => v > 0).length
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const nm = nullMeans(trades, exit, seededRng(seed))
  const nullMean = nm.reduce((a, b) => a + b, 0) / nm.length
  const p = (nm.filter((m) => m >= mean).length + 1) / (DRAWS + 1)
  return {
    n: trades.length, wins, winRate: wins / trades.length, wilson: wilsonInterval(wins, trades.length),
    mean, boot: bootstrapMean(values, { draws: 2000, rng: seededRng(seed + 1) }),
    clusterBoot: clusterBootstrap(trades, exit, seededRng(seed + 2)),
    windows: new Set(trades.map((t) => t.win)).size, nullMean, p, values,
  }
}

// ---------------------------------------------------------------- (a) (b) (c)

function displayStats(res) {
  let liveBars = 0
  let withContact = 0
  let shownSum = 0
  let updates = 0
  let listChanges = 0
  for (const win of res.windows) {
    for (const s of win.shown) { liveBars += 1; shownSum += s; if (s > 0) withContact += 1 }
    updates += win.updates.length
    for (let i = 1; i < win.updates.length; i += 1) {
      if (JSON.stringify(win.updates[i].list) !== JSON.stringify(win.updates[i - 1].list)) listChanges += 1
    }
  }
  return { liveBars, withContact, mean: shownSum / liveBars, updates, listChanges }
}

/** (b): for every final contact, the first bar on which a same-side overlapping contact was shown. */
function timeliness(res) {
  const rows = []
  for (const win of res.windows) {
    if (!win.eligible) continue
    for (const f of win.final) {
      const u = win.updates.find((x) => x.list.some((c) => overlaps(c, f)))
      const tFirst = u.t
      rows.push({
        win, f, tFirst, lag: tFirst - f.peak,
        byEnd: tFirst <= f.end, byPeak: tFirst <= f.peak, onlyAtD: tFirst >= win.D.index,
      })
    }
  }
  return rows
}

function repaint(res) {
  const tracks = res.windows.filter((w) => w.eligible).flatMap((w) => w.tracks)
  return {
    signals: tracks.length,
    everVanished: tracks.filter((t) => t.everVanished).length,
    gone: tracks.filter((t) => !t.alive).length,
    unresolved: res.windows.filter((w) => !w.eligible).reduce((s, w) => s + w.tracks.length, 0),
  }
}

// ---------------------------------------------------------------- formatting

const pc = (x, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
const sg = (x, d = 2) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(d)}`)
const ci = (iv, f) => (iv ? `[${f(iv[0])}, ${f(iv[1])}]` : '—')
const pcCi = (iv) => ci(iv, (x) => `${Math.round(x * 100)}%`)
const sgCi = (iv) => ci(iv, (x) => sg(x))
const pts = (x) => x.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : null }
const quart = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(q * (s.length - 1))] : null }
const thrLabel = (t) => `${+(t * 100).toFixed(1)}%`
const rule = (n) => '─'.repeat(n)
const say = (s = '') => console.log(s)

function contactLine(bars, c) {
  const day = (i) => bars[i].label.slice(5, 16)
  const when = c.start === c.end ? day(c.start) : `${day(c.start)} → ${day(c.end)}`
  return `${when.padEnd(25)} ${c.side.padEnd(5)} · ${pts(c.price).padStart(8)} · ${String(c.candles).padStart(3)} candles  ${sg(c.peakE)}`
}

// ---------------------------------------------------------------- run

const DATASETS = [
  {
    key: '2h', name: 'PEPPERSTONE:US500 2h (NY wall-clock buckets of the 1h file)',
    bars: twoHourNY(loadCsv(US500_1H)), thresholds: [0.015, 0.02, 0.03], costPts: 0.5,
  },
  {
    key: '4h', name: 'PEPPERSTONE:US500 4h',
    bars: withLabels(loadCsv(US500_4H), nyStamp), thresholds: [0.02, 0.03, 0.05], costPts: 0.5,
  },
  {
    key: '1D', name: 'TVC:SPX daily (cash index)',
    bars: withLabels(loadCsv(SPX_1D), (t) => nyStamp(t).slice(0, 10)), thresholds: [0.05, 0.08, 0.12], costPts: 0,
  },
]

// Sanity: the 2h file reproduces the video's anchors and its three contacts.
{
  const b = DATASETS[0].bars
  const iO = b.findIndex((x) => x.label === '2026-02-03 02:00')
  const iD = b.findIndex((x) => x.label === '2026-03-30 20:00')
  const v = buildVortex(b, { o: iO, d: iD })
  const got = v.contacts.map((c) => `${c.side} ${pts(c.price)} ${c.candles} ${sg(c.peakE)}`).join(' | ')
  const want = 'long 6,757.5 4 -1.00 | short 6,586.6 20 +1.00 | short 6,507.4 2 +0.94'
  if (iD - iO !== 475 || v.oPrice !== 7003.3 || v.dPrice !== 6311.6 || got !== want) {
    throw new Error(`2h data does not reproduce the video: N=${iD - iO} ${v.oPrice} ${v.dPrice} ${got}`)
  }
}

say('VORTEX REPLAY — hindsight vs real time for the O → D "WALL CONTACTS · POTENTIAL TRADES" list')
say(rule(96))
say(`Engine: engine/vortex.js (buildVortex, zigzag). Skip ${SKIP_FRAC * 100}%, contact level ${CONTACT_LEVEL * 100}%, windows ≥ ${MIN_N} candles.`)
say(`Nulls: ${DRAWS} seeded draws each. Intervals: Wilson 95% for rates; percentile bootstrap 95% for means`)
say('(by trade, engine/stats.js; and by window, resampling whole swing windows, since trades in one')
say('window share an exit). Costs: 0.5 index pt round trip on US500 2h/4h, 0 on SPX daily.')
say('Sanity check passed: the 2h file reproduces the video (O 7003.3, D 6311.6, N 475, its 3 contacts),')
say('and in every window below the real-time display on D\'s candle equals the hindsight list.')
say()
for (const ds of DATASETS) {
  say(`  ${ds.key.padEnd(3)} ${ds.name}: ${ds.bars.length} bars, ${ds.bars[0].label} → ${ds.bars.at(-1).label}; ` +
    `zigzag ${ds.thresholds.map(thrLabel).join(' / ')}; cost ${ds.costPts} pt`)
}
say()

const results = []
let seed = 0x5eed
for (const ds of DATASETS) {
  for (const thr of ds.thresholds) {
    const res = analyse(ds.bars, thr, ds.costPts)
    const hind = hindsightTrades(res)
    const rt = { A: realtimeTrades(res, 'A'), B: realtimeTrades(res, 'B'), C: realtimeTrades(res, 'C') }
    const rtA = rt.A
    const row = {
      ds, thr, res, hind, rtA,
      disp: displayStats(res), time: timeliness(res), rep: repaint(res),
      eligible: res.windows.filter((w) => w.eligible).length,
    }
    for (const exit of EXITS) {
      row[`h_${exit}`] = scoreTrades(hind, exit, (seed += 11))
      for (const k of ['A', 'B', 'C']) row[`r${k}_${exit}`] = scoreTrades(rt[k], exit, (seed += 11))
      for (const trend of [true, false]) {
        if (exit === 'video') continue // identical to at D (with) and vector (counter)
        const tag = trend ? 'with' : 'counter'
        row[`h_${exit}_${tag}`] = scoreTrades(hind.filter((t) => t.trend === trend), exit, (seed += 11))
        for (const k of ['A', 'C']) {
          row[`r${k}_${exit}_${tag}`] = scoreTrades(rt[k].filter((t) => t.trend === trend), exit, (seed += 11))
        }
      }
    }
    results.push(row)
  }
}

// ---------------------------------------------------------------- windows and display (a)

say('━━━ SWING WINDOWS AND WHAT IS ON SCREEN (a) ━━━')
say()
let h = 'data thr    pivots windows≥20  live bars  bars w/ contact on screen  mean shown  updates  list changes'
say(h)
say(rule(h.length))
for (const r of results) {
  const d = r.disp
  say([
    r.ds.key.padEnd(4), thrLabel(r.thr).padEnd(6), String(r.res.pivots.length).padStart(6),
    String(r.eligible).padStart(10), String(d.liveBars).padStart(10),
    `${String(d.withContact).padStart(8)} ${pc(d.withContact / d.liveBars).padStart(6)} ${pcCi(wilsonInterval(d.withContact, d.liveBars)).padEnd(10)}`.padStart(26),
    d.mean.toFixed(2).padStart(10), String(d.updates).padStart(8), String(d.listChanges).padStart(13),
  ].join(' '))
}
say()
say('live bars = bars from the first pivot\'s confirmation to the end of data, each in its live window.')
say('updates   = bars on which the display was recomputed (a new extreme, or a new O); a contact can')
say('            only appear or disappear on these. On every other bar the list is frozen.')
say('The Wilson interval here treats bars as independent; consecutive bars share one display, so it is')
say('far too narrow — read the share as descriptive.')
say()

// ---------------------------------------------------------------- (b) timeliness

say('━━━ (b) WAS EACH HINDSIGHT CONTACT ON SCREEN WHILE IT WAS HAPPENING? ━━━')
say()
h = 'data thr    contacts | shown by end of run     shown by peak candle   only once D printed    | lag, bars: median [IQR] | give-up %: with  counter'
say(h)
say(rule(h.length))
for (const r of results) {
  const t = r.time
  const n = t.length
  const cnt = (f) => t.filter(f).length
  const cell = (k) => `${String(k).padStart(4)} ${pc(k / n).padStart(6)} ${pcCi(wilsonInterval(k, n)).padEnd(11)}`
  const lags = t.map((x) => x.lag)
  const giveUp = (trend) => t
    .filter((x) => withTrend(x.win, x.f.side) === trend)
    .map((x) => (dirOf(x.f.side) * (r.ds.bars[x.tFirst].c - x.f.price)) / x.f.price * 100)
  say([
    r.ds.key.padEnd(4), thrLabel(r.thr).padEnd(6), String(n).padStart(8), '|',
    cell(cnt((x) => x.byEnd)), cell(cnt((x) => x.byPeak)), cell(cnt((x) => x.onlyAtD)), '|',
    `${String(median(lags)).padStart(5)} [${quart(lags, 0.25)}, ${quart(lags, 0.75)}]`.padEnd(23), '|',
    sg(median(giveUp(true))).padStart(13), sg(median(giveUp(false))).padStart(8),
  ].join(' '))
}
say()
say('shown by end of run  = a same-side contact overlapping it was on screen no later than its last candle.')
say('only once D printed  = first shown on D\'s own candle or later, i.e. only when the final extreme was in.')
say('lag                  = bars from the contact\'s peak candle to the bar it was first on screen.')
say('give-up              = median of how much worse the real-time entry (close of the bar it first')
say('                       showed) is than the listed price (peak OHLC4), in the trade\'s direction, % of')
say('                       price; positive = worse. "with" = short in a falling window / long in a rising')
say('                       one; "counter" = the other side. Every signal lands on a new-extreme bar, so')
say('                       with-trend entries are chased and counter-trend ones are bought at the extreme.')
say()

// ---------------------------------------------------------------- (c) repaint

say('━━━ (c) REPAINT — SIGNALS THAT APPEARED IN REAL TIME AND LATER VANISHED ━━━')
say()
h = 'data thr    signals  per window | vanished at least once        | absent from the final list (gone for good)'
say(h)
say(rule(h.length))
for (const r of results) {
  const p = r.rep
  say([
    r.ds.key.padEnd(4), thrLabel(r.thr).padEnd(6), String(p.signals).padStart(7),
    (p.signals / r.eligible).toFixed(1).padStart(11), '|',
    `${String(p.everVanished).padStart(4)} ${pc(p.everVanished / p.signals).padStart(6)} ${pcCi(wilsonInterval(p.everVanished, p.signals))}`.padEnd(29), '|',
    `${String(p.gone).padStart(4)} ${pc(p.gone / p.signals).padStart(6)} ${pcCi(wilsonInterval(p.gone, p.signals))}`,
  ].join(' '))
}
say()
say('A signal = a contact (side + candle run) not overlapping any same-side contact shown earlier in the')
say('same window. Signals from the last, still-unconfirmed swing are excluded here and from the trades.')
say()

// ---------------------------------------------------------------- (1) and (2d) trades

function tradeTable(title, keyFor) {
  say(title)
  say()
  const head = 'data thr    exit     trades win    win%  95% CI     | mean %/trade  95% CI by trade   95% CI by window  | null mean   p'
  say(head)
  say(rule(head.length))
  for (const r of results) {
    for (const exit of EXITS) {
      const s = r[keyFor(exit)]
      if (!s) { say(`${r.ds.key.padEnd(4)} ${thrLabel(r.thr).padEnd(6)} ${exit}: no trades`); continue }
      say([
        r.ds.key.padEnd(4), thrLabel(r.thr).padEnd(6), EXIT_LABEL[exit].padEnd(7),
        String(s.n).padStart(7), String(s.wins).padStart(4), pc(s.winRate).padStart(7), pcCi(s.wilson).padEnd(10), '|',
        sg(s.mean, 3).padStart(10), sgCi(s.boot).padStart(18), sgCi(s.clusterBoot).padStart(18), '  |',
        sg(s.nullMean, 3).padStart(9), s.p.toFixed(3).padStart(6),
      ].join(' '))
    }
  }
  say()
}

say('Exits: "at D" = held to the end of the swing; "vector" = closed on the line O → D (else at D);')
say('"video" = with-trend contacts held to D, counter-trend ones closed at the vector — the reading under')
say('which all three of the video\'s listed trades win. Hindsight: D at its anchor price, the final line.')
say('Real time: D at the close of the bar zigzag confirms it; the line as drawn on the previous bar.')
say('A win is a net return > 0. p = share of null draws whose mean matched or beat the rule\'s.')
say()
tradeTable('━━━ (1) HINDSIGHT — the video\'s list, traded at the listed price; null = random candle in the same window ━━━', (e) => `h_${e}`)

say('━━━ (2d) REAL TIME — enter at the close of the bar on which a signal first appears ━━━')
say()
say('null A = random bar while the window was live on screen (the stated null)')
say('null B = random UPDATE bar (a new extreme or a new O) in the window — the only bars a signal can land on')
say('null C = random update bar in the same window AND the same phase of the swing: the first display on its')
say('         own, then tenths of the way from the first display to D. Controls for WHEN, not just where.')
say()
h = 'data thr    exit     trades win    win%  95% CI     | mean %/trade  95% CI by trade   95% CI by window  | null A    p    | null B    p    | null C    p'
say(h)
say(rule(h.length))
for (const r of results) {
  for (const exit of EXITS) {
    const s = r[`rA_${exit}`]
    if (!s) continue
    const nul = (k) => `${sg(r[`r${k}_${exit}`].nullMean, 3).padStart(7)} ${r[`r${k}_${exit}`].p.toFixed(3)}`
    say([
      r.ds.key.padEnd(4), thrLabel(r.thr).padEnd(6), EXIT_LABEL[exit].padEnd(7),
      String(s.n).padStart(7), String(s.wins).padStart(4), pc(s.winRate).padStart(7), pcCi(s.wilson).padEnd(10), '|',
      sg(s.mean, 3).padStart(10), sgCi(s.boot).padStart(18), sgCi(s.clusterBoot).padStart(18), '  |',
      nul('A'), ' |', nul('B'), ' |', nul('C'),
    ].join(' '))
  }
}
say()

const realtimeFamily = (keys) => results
  .flatMap((r) => EXITS.flatMap((exit) => keys.map((k) => ({ r, exit, k, s: r[`r${k}_${exit}`] }))))
  .filter((x) => x.s)
function multiplicity(keys, label) {
  const fam = realtimeFamily(keys)
  const adj = holm(fam.map((x) => x.s.p))
  const low = fam.filter((x) => x.s.p < 0.05)
  const best = fam.reduce((a, x, i) => (adj[i] < a.adj ? { x, adj: adj[i] } : a), { adj: 2 })
  say(`  ${label}: ${fam.length} comparisons, ${low.length} with p < 0.05 (${(0.05 * fam.length).toFixed(1)} expected by chance); ` +
    `smallest Holm-adjusted p ${best.adj.toFixed(3)} (${best.x.r.ds.key} ${thrLabel(best.x.r.thr)} ${EXIT_LABEL[best.x.exit]}, null ${best.x.k}).`)
  if (low.length) {
    say(`      p < 0.05: ${low.map((x) => `${x.r.ds.key} ${thrLabel(x.r.thr)} ${EXIT_LABEL[x.exit]} (${x.k}) ${x.s.p.toFixed(3)}`).join('; ')}`)
  }
}
say('Multiple testing, real time (3 datasets × 3 thresholds × 3 exits per null):')
multiplicity(['A'], 'null A')
multiplicity(['B'], 'null B')
multiplicity(['C'], 'null C')
say()

say('━━━ TIMING — why nulls A and B flatter the "video" exit ━━━')
say()
h = 'data thr    signals  on the first display   position: live span  O-confirm→D  in-phase rank | later signals, video exit: n   mean   null C   p'
say(h)
say(rule(h.length))
for (const r of results) {
  const tr = r.rtA
  const first = tr.filter((t) => t.entryBar === t.win.updates[0].t).length
  const rel = tr.map((t) => (t.entryBar - t.win.liveStart) / (t.win.liveEnd - t.win.liveStart))
  const relD = tr.map((t) => (t.entryBar - t.win.liveStart) / Math.max(1, t.win.D.index - t.win.liveStart))
  const later = realtimeTrades(r.res, 'C').filter((t) => t.entryBar !== t.win.updates[0].t)
  // Where each later signal sits among the update bars of its own phase: 0 first, 1 last.
  const ranks = later.flatMap((t) => {
    const ph = t.win.phase(t.entryBar)
    const ts = t.win.updates.map((u) => u.t).filter((x) => t.win.phase(x) === ph)
    return ts.length < 2 ? [] : [ts.indexOf(t.entryBar) / (ts.length - 1)]
  })
  const s = scoreTrades(later, 'video', (seed += 11))
  say([
    r.ds.key.padEnd(4), thrLabel(r.thr).padEnd(6), String(tr.length).padStart(7),
    `${String(first).padStart(6)} ${pc(first / tr.length).padStart(6)} ${pcCi(wilsonInterval(first, tr.length))}`.padEnd(22),
    `median ${median(rel).toFixed(2)}`.padStart(18), `median ${median(relD).toFixed(2)}`.padStart(13),
    `mean ${(ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(2)}`.padStart(14), '|',
    `${String(later.length).padStart(28)} ${sg(s.mean, 3).padStart(7)} ${sg(s.nullMean, 3).padStart(8)} ${s.p.toFixed(3).padStart(6)}`,
  ].join(' '))
}
say()
say('When a window first reaches 20 candles every contact on it is new at once, so a quarter or more of')
say('all signals land on that one bar, early in the swing. A signal never lands in the bounce between D')
say('and its confirmation (no new extreme prints there), while null A does. Held with the swing to its')
say('confirmed end, an early entry is worth more than a random one in the same — hindsight-delimited —')
say('window whatever the indicator says. Null C holds the phase fixed and asks only whether the contact')
say('picks better bars than its neighbours in the same stretch of the same swing. It removes most of the')
say('timing advantage, not all: inside its phase a signal still sits early (in-phase rank: mean position')
say('of later signals among their phase\'s update bars, 0 = first, 1 = last, 0.5 = no timing bias). That')
say('residue, not information in the walls, is the likeliest source of the small with-trend leftovers.')
say()

say('━━━ BY SIDE — with the swing (short in a falling window, long in a rising one) vs against it ━━━')
say()
h = 'data thr    exit    side     | hindsight:  n  win%   mean %    null    p   | real time:  n  win%   mean %  null A    p   null C    p'
say(h)
say(rule(h.length))
for (const r of results) {
  for (const exit of ['atD', 'atVector']) {
    for (const tag of ['with', 'counter']) {
      const a = r[`h_${exit}_${tag}`]
      const b = r[`rA_${exit}_${tag}`]
      const c = r[`rC_${exit}_${tag}`]
      const cell = (s) => (s
        ? `${String(s.n).padStart(4)} ${pc(s.winRate, 0).padStart(5)} ${sg(s.mean, 3).padStart(8)} ${sg(s.nullMean, 3).padStart(7)} ${s.p.toFixed(3)}`
        : '   0     —        —       —     —')
      say([
        r.ds.key.padEnd(4), thrLabel(r.thr).padEnd(6), EXIT_LABEL[exit].padEnd(7),
        tag.padEnd(8), '|           ', cell(a), ' |           ', cell(b),
        c ? `${sg(c.nullMean, 3).padStart(8)} ${c.p.toFixed(3)}` : '',
      ].join(' '))
    }
  }
}
say()

say('━━━ SAME CONTACT, TWO PRICES — each listed contact traded as listed vs when it first appeared on screen ━━━')
say()
say('Paired: for every final contact, the hindsight trade (listed price, hindsight exit) minus the same')
say('contact traded in real time (close of the bar it first appeared, real-time exit), % of price.')
say('p = sign-flip permutation (2000 draws), share of flips whose mean difference ≥ the observed one.')
say()
const pairedRows = []
h = 'data thr    exit     pairs | hindsight win%   mean %  | real time win%   mean %  | difference   95% CI            p'
say(h)
say(rule(h.length))
for (const r of results) {
  for (const exit of EXITS) {
    const pairs = r.time.map((x) => {
      const dir = dirOf(x.f.side)
      const trend = withTrend(x.win, x.f.side)
      const hh = addVideo({ trend, ...x.win.hTrade(x.f.peak, dir, x.f.price) })
      const rr = addVideo({ trend, ...x.win.rTrade(x.tFirst, dir) })
      return [hh[exit], rr[exit]]
    })
    if (pairs.length === 0) continue
    const diffs = pairs.map(([a, b]) => a - b)
    const mean = diffs.reduce((s, v) => s + v, 0) / diffs.length
    const rng = seededRng((seed += 11))
    let ge = 0
    for (let d = 0; d < DRAWS; d += 1) {
      let s = 0
      for (const v of diffs) s += rng() < 0.5 ? v : -v
      if (s / diffs.length >= mean) ge += 1
    }
    const winH = pairs.filter(([a]) => a > 0).length
    const winR = pairs.filter(([, b]) => b > 0).length
    const mH = pairs.reduce((s, [a]) => s + a, 0) / pairs.length
    const mR = pairs.reduce((s, [, b]) => s + b, 0) / pairs.length
    pairedRows.push({ exit, winH: winH / pairs.length, winR: winR / pairs.length, mean, p: (ge + 1) / (DRAWS + 1) })
    say([
      r.ds.key.padEnd(4), thrLabel(r.thr).padEnd(6), EXIT_LABEL[exit].padEnd(7), String(pairs.length).padStart(6), '|',
      pc(winH / pairs.length).padStart(14), sg(mH, 3).padStart(8), ' |',
      pc(winR / pairs.length).padStart(14), sg(mR, 3).padStart(8), ' |',
      sg(mean, 3).padStart(10), sgCi(bootstrapMean(diffs, { draws: 2000, rng: seededRng((seed += 11)) })).padEnd(17),
      ((ge + 1) / (DRAWS + 1)).toFixed(3).padStart(6),
    ].join(' '))
  }
}
say()
say('"at D" can favour REAL TIME: held to D in hindsight, a counter-trend contact is closed at the swing\'s')
say('extreme — the worst price for it by construction — while in real time it was entered AT a new')
say('extreme. Under the exits the list implies (vector, video) hindsight is worth the difference shown.')
say()

// ---------------------------------------------------------------- (3) the video's window

const B2 = DATASETS[0].bars
const idx = (label) => {
  const i = B2.findIndex((b) => b.label === label)
  if (i < 0) throw new Error(`no 2h candle ${label}`)
  return i
}
const iO = idx('2026-02-03 02:00')
const iD = idx('2026-03-30 20:00')
const iEnd = idx('2026-03-31 22:00')

say('━━━ (3) THE VIDEO\'S WINDOW, 03 FEB 02:00 → 30 MAR 20:00, REPLAYED IN REAL TIME ━━━')
say()
say('Version A — the most generous reading: O is the video\'s own O (03 Feb 02:00, 7003.3), taken as known')
say('from the start (zigzag would only confirm it once price fell the threshold below it). D is the running')
say('low since O, W is sized from candles ≤ t. Every change to the contact list, as it happened:')
say()

const A = walk(B2, { o: iO, oPrice: B2[iO].h, falling: true, from: iO + 1, to: iEnd })
{
  const final = A.updates.find((u) => u.d === iD)
  const want = buildVortex(B2, { o: iO, d: iD }).contacts.map((c) => absContact(c, iO))
  if (JSON.stringify(final.list) !== JSON.stringify(want)) throw new Error('version A at D differs from the video')
}
const aTracks = trackSignals(A.updates)
{
  let prev = null
  for (const u of A.updates) {
    const key = JSON.stringify(u.list)
    if (key === prev) continue
    const prevList = prev ? JSON.parse(prev) : []
    say(`  ${B2[u.t].label}  close ${pts(B2[u.t].c)}  provisional D ${B2[u.d].label.slice(5)} ${pts(u.dPrice)}  N ${u.N}  Wup ${u.Wup.toFixed(1)} Wdn ${u.Wdn.toFixed(1)}`)
    if (u.list.length === 0) say('      (no contacts)')
    for (const c of u.list) {
      const isNew = !prevList.some((p) => overlaps(p, c))
      const tr = aTracks.find((x) => overlaps(x, c) && x.firstT === u.t)
      say(`      ${isNew ? (tr ? 'NEW  ' : 'back ') : '     '}${contactLine(B2, c)}`)
    }
    for (const p of prevList) if (!u.list.some((c) => overlaps(p, c))) say(`      GONE ${contactLine(B2, p)}`)
    prev = key
  }
}
say()

say('Snapshots — what the panel would read at the close of these candles (Version A):')
say()
for (const label of ['2026-02-05 16:00', '2026-02-05 18:00', '2026-02-05 22:00', '2026-03-24 20:00', '2026-03-25 22:00', '2026-03-26 10:00', '2026-03-27 00:00', '2026-03-27 02:00', '2026-03-30 20:00']) {
  const t = idx(label)
  const u = displayAt(A, t)
  const d = A.dAt[t - A.from]
  const inWindow = d === t
  const where = inWindow
    ? 'this candle IS the provisional D: price pinned to D, e = 0, inside the 3% skip'
    : `this candle is ${t - d} candles AFTER the provisional D: not inside O → D, not drawn`
  say(`  ${label}  close ${pts(B2[t].c)}  low ${pts(B2[t].l)}  — ${where}`)
  say(`      provisional D ${B2[d].label} ${pts(A.dpAt[t - A.from])}, N ${d - iO}, walls Wup ${u.Wup.toFixed(1)} / Wdn ${u.Wdn.toFixed(1)}`)
  if (u.list.length === 0) say('      list: (empty)')
  for (const c of u.list) say(`      list: ${contactLine(B2, c)}`)
}
say()

say('The three contacts the video lists — hindsight trades as listed, and what real time offered (Version A):')
say()
{
  const hv = buildVortex(B2, { o: iO, d: iD })
  const book = hindsightBook(B2, hv, iO, { index: iD, price: hv.dPrice }, 0)
  const rBook = realtimeBook(B2, A, iO, B2[iO].h, iEnd, 0)
  const final = A.updates.find((u) => u.d === iD).list
  for (const f of final) {
    const u = A.updates.find((x) => x.list.some((c) => overlaps(c, f)))
    const dir = dirOf(f.side)
    const entry = B2[u.t].c
    const hb = book(f.peak, dir, f.price)
    const rv = rBook(u.t, dir)
    const worse = dir * (entry - f.price)
    say(`  ${contactLine(B2, f)}`)
    say(`      HINDSIGHT  ${f.side} at ${pts(f.price)} (peak ${B2[f.peak].label}): to D ${sg(dir * (hv.dPrice - f.price), 1)} pts; ` +
      `to the vector ${sg(dir * (hb.vectorPrice - f.price), 1)} pts (touched ${B2[hb.vectorBar].label})`)
    say(`      REAL TIME  first on screen ${B2[u.t].label}, ${u.t - f.peak} candles after the peak; entry at that close ${pts(entry)}, ` +
      `${Math.abs(worse).toFixed(1)} pts ${worse > 0 ? 'worse' : 'better'} than listed`)
    say(`                 to D's exact low, granted with hindsight: ${sg(dir * (hv.dPrice - entry), 1)} pts; ` +
      (rv.touched
        ? `to the provisional vector: ${sg(dir * (rv.vectorPrice - entry), 1)} pts (${B2[rv.vectorBar].label})`
        : `provisional vector never reached by ${B2[iEnd].label}; marked at that close ${sg(dir * (rv.vectorPrice - entry), 1)} pts`))
  }
}
say()

{
  // The three dates the question asks about, in words, from the Version A replay above.
  const at = (label) => { const t = idx(label); return { t, u: displayAt(A, t), d: A.dAt[t - A.from] } }
  const final = A.updates.find((u) => u.d === iD).list
  const firstSeen = (f) => A.updates.find((x) => x.list.some((c) => overlaps(c, f))).t
  const survives = (c) => final.some((f) => overlaps(f, c))
  const feb5 = at('2026-02-05 22:00')
  const mar24 = at('2026-03-24 20:00')
  const mar27 = at('2026-03-27 02:00')
  const listWords = (u) => u.list.map((c) => `${c.side} ${B2[c.peak].label.slice(5)} (${survives(c) ? 'survives' : 'later vanishes'})`).join(', ')
  say('In words (Version A):')
  say(` • 05 Feb. The −1.00 candle the video lists (05 Feb 18:00) was, as it printed, the provisional D itself:`)
  say(`   price pinned to D, e = 0, inside the skip. By 22:00 the list read: ${listWords(feb5.u)}.`)
  say(`   The video's long first appeared on ${B2[firstSeen(final[0])].label}, ${firstSeen(final[0]) - final[0].peak} candles later, with price at ${pts(B2[firstSeen(final[0])].c)}.`)
  say(` • 24 Mar. The provisional D was ${B2[mar24.d].label} at ${pts(A.dpAt[mar24.t - A.from])}; the 24→26 Mar rally was AFTER it, so it`)
  say(`   was not inside O → D and was never drawn while it happened. The list read: ${listWords(mar24.u)}.`)
  say(`   The video's 24→26 Mar short first appeared ${B2[firstSeen(final[1])].label}, after the next lower low, at ${pts(B2[firstSeen(final[1])].c)}`)
  say(`   — ${pts(final[1].price - B2[firstSeen(final[1])].c)} pts below the listed ${pts(final[1].price)}.`)
  say(` • 27 Mar. Same position at 02:00 (D still ${B2[mar27.d].label}); list: ${listWords(mar27.u)}.`)
  say(`   The 27 Mar short first appeared ${B2[firstSeen(final[2])].label} at ${pts(B2[firstSeen(final[2])].c)}, ${pts(final[2].price - B2[firstSeen(final[2])].c)} pts below its listed ${pts(final[2].price)},`)
  say(`   ${(iD - firstSeen(final[2])) * 2} hours before the low of the whole file printed.`)
  say(' • The list the video shows exists only from 30 Mar 20:00, the candle of D itself — and nobody knew then')
  say('   that 6,311.6 was D: it is the lowest low in ten months of data and was confirmed only by the rally after it.')
  say()
}

say(`Signals Version A raised between 03 Feb and 31 Mar: ${aTracks.length}; of these ${aTracks.filter((t) => !t.alive).length} are not in the`)
say(`final list (repainted away) and ${aTracks.filter((t) => t.everVanished).length} vanished at least once.`)
say()

say('Version B — fully mechanical: O = last pivot confirmed by zigzag at t, as in (2). At each date:')
say()
for (const r of results.filter((x) => x.ds.key === '2h')) {
  say(`  zigzag ${thrLabel(r.thr)}:`)
  for (const label of ['2026-02-05 18:00', '2026-02-05 22:00', '2026-03-24 20:00', '2026-03-25 22:00', '2026-03-27 02:00', '2026-03-30 20:00']) {
    const t = idx(label)
    const win = r.res.windows.find((w) => w.liveStart <= t && t <= w.liveEnd)
    if (!win) { say(`    ${label}: no confirmed pivot yet`); continue }
    const u = displayAt(win, t)
    const d = win.dAt[t - win.from]
    const head = `    ${label}: O = ${win.P.kind} ${B2[win.o].label.slice(5)} ${pts(win.P.price)} (confirmed ${B2[win.liveStart].label.slice(5)}), ` +
      `provisional D ${B2[d].label.slice(5)} ${pts(win.dpAt[t - win.from])}, N ${d - win.o}`
    say(head)
    if (!u) say('        list: (window under 20 candles — nothing drawn)')
    else if (u.list.length === 0) say('        list: (empty)')
    else for (const c of u.list) say(`        list: ${contactLine(B2, c)}`)
  }
  const trades = r.rtA.filter((tr) => tr.entryBar >= iO && tr.entryBar <= iEnd)
  const sum = (exit) => {
    const v = trades.map((t) => t[exit])
    return `${EXIT_LABEL[exit]} ${v.filter((x) => x > 0).length}/${v.length} won, mean ${sg(v.reduce((a, b) => a + b, 0) / v.length)}%`
  }
  if (trades.length) {
    say(`    real-time signals entered 03 Feb – 31 Mar: ${trades.length} (${trades.filter((t) => t.trend).length} with the swing); ` +
      EXITS.map(sum).join('; '))
  }
  if (trades.length && r.thr === 0.02) {
    say('    each one (net % of entry; "contact" = the run as first shown):')
    for (const tr of trades) {
      say(`      ${B2[tr.entryBar].label.slice(5)} ${tr.side.padEnd(5)} @ ${pts(B2[tr.entryBar].c)} ${tr.trend ? 'with   ' : 'counter'} contact ` +
        `${B2[tr.track.first.start].label.slice(5)}${tr.track.first.end > tr.track.first.start ? `→${B2[tr.track.first.end].label.slice(11)}` : ''}`.padEnd(30) +
        ` at D ${sg(tr.atD).padStart(6)}% (${B2[tr.win.exitBar].label.slice(5)})  vector ${sg(tr.atVector).padStart(6)}% (${B2[tr.vectorBar].label.slice(5)})` +
        `${tr.track.alive ? '' : '  [repainted away]'}`)
    }
  }
  say()
}

// ---------------------------------------------------------------- reading

say('━━━ SUMMARY — middle threshold of each dataset ━━━')
say()
for (const ds of DATASETS) {
  const r = results.find((x) => x.ds === ds && x.thr === ds.thresholds[1])
  const t = r.time
  const byEnd = t.filter((x) => x.byEnd).length
  const f = (s) => `${pc(s.winRate, 0)} won, ${sg(s.mean)}% [${sg(s.clusterBoot[0])}, ${sg(s.clusterBoot[1])}]`
  say(`${ds.key} zigzag ${thrLabel(r.thr)} — ${r.eligible} windows, ${t.length} listed contacts, ${r.rep.signals} real-time signals`)
  say(`   hindsight, video exit : ${f(r.h_video)}; vector exit ${f(r.h_atVector)}`)
  say(`   real time, video exit : ${f(r.rA_video)}; null A p ${r.rA_video.p.toFixed(3)}, null C p ${r.rC_video.p.toFixed(3)}`)
  say(`   real time, at D       : ${f(r.rA_atD)}; null A p ${r.rA_atD.p.toFixed(3)}, null C p ${r.rC_atD.p.toFixed(3)}`)
  say(`   real time, vector     : ${f(r.rA_atVector)}; null A p ${r.rA_atVector.p.toFixed(3)}, null C p ${r.rC_atVector.p.toFixed(3)}`)
  say(`   listed contacts on screen by the end of their own run: ${byEnd}/${t.length} = ${pc(byEnd / t.length)} ${pcCi(wilsonInterval(byEnd, t.length))};` +
    ` median lag ${median(t.map((x) => x.lag))} bars`)
  say(`   real-time signals later gone for good: ${r.rep.gone}/${r.rep.signals} = ${pc(r.rep.gone / r.rep.signals)} ${pcCi(wilsonInterval(r.rep.gone, r.rep.signals))}`)
  say()
}
say('(mean % per trade with its by-window bootstrap 95% CI)')
say()

say('━━━ READING ━━━')
say()
say('Hindsight vs real time differ in three ways, all visible above:')
say(' 1. Position. e is pinned to 0 at D and contacts are ignored within 3% of D, so the candle being')
say('    printed can never carry a contact. In real time D is the running extreme, so a contact on a')
say('    pullback is beyond D and is not drawn at all; it can only appear later, once a new extreme')
say('    makes it part of the window — that is the lag in (b).')
say(' 2. Size. W is the largest deviation in the window. Every new extreme re-sizes the walls and')
say('    moves the vector, so contacts appear, move and vanish as the leg grows — the repaint in (c).')
say(' 3. Price. The list prints the peak candle\'s OHLC4. A trader acting on the screen gets the close of')
say('    the bar on which the contact first appears — the entry give-up in (b) — and learns D only when')
say('    the swing is confirmed over, a threshold-sized reversal later.')
{
  const v = pairedRows.filter((x) => x.exit === 'video')
  const lo = (k) => Math.min(...v.map((x) => x[k]))
  const hi = (k) => Math.max(...v.map((x) => x[k]))
  const famC = realtimeFamily(['C'])
  const adjC = holm(famC.map((x) => x.s.p))
  say(' 4. Net. Under the exits the list implies ("video"), its contacts win ' +
    `${pc(lo('winH'), 0)}–${pc(hi('winH'), 0)} as listed and`)
  say(`    ${pc(lo('winR'), 0)}–${pc(hi('winR'), 0)} when traded from the bar they first appeared on (paired difference ` +
    `${sg(lo('mean'), 1)} to ${sg(hi('mean'), 1)} percentage points per trade, p ≤ ${hi('p').toFixed(3)}).`)
  say('    As a real-time signal stream it does no better than entries at random bars in the same phase of')
  say(`    the same swing once multiplicity is counted (null C, smallest Holm-adjusted p ${Math.min(...adjC).toFixed(3)}).`)
}
say()

if (TIMELINE_OUT) {
  const dump = results.map((r) => ({
    data: r.ds.key, threshold: r.thr,
    windows: r.res.windows.map((w) => ({
      O: { label: r.ds.bars[w.o].label, price: w.P.price, kind: w.P.kind },
      D: w.D ? { label: r.ds.bars[w.D.index].label, price: w.D.price } : null,
      live: [r.ds.bars[w.liveStart].label, r.ds.bars[w.liveEnd].label],
      updates: w.updates.map((u) => ({
        at: r.ds.bars[u.t].label, D: r.ds.bars[u.d].label, dPrice: u.dPrice, N: u.N, Wup: u.Wup, Wdn: u.Wdn,
        contacts: u.list.map((c) => ({ side: c.side, from: r.ds.bars[c.start].label, to: r.ds.bars[c.end].label, peak: r.ds.bars[c.peak].label, peakE: c.peakE, price: c.price })),
      })),
    })),
  }))
  fs.writeFileSync(TIMELINE_OUT, JSON.stringify(dump))
}
