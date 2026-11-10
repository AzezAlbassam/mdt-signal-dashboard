// Which symbols have a monthly harmonic setup that is registered but NOT yet reached.
// Written to reports/harmonic-pending-1M.json.
//
//   node scripts/harmonic-pending.js
//
// "Close to forming" has one defensible meaning and this script uses it: X, A, B and C are
// all confirmed, so the zone, the stop and the four targets are already fixed — price has
// simply not arrived. Nothing is predicted; the geometry is complete and the arrival is what
// is open. A pattern whose ratios are "nearly" right is NOT included: that is a pattern that
// does not exist, and counting it is the fudging this study was built to avoid.
//
// Two sources, because no new data could be fetched (the market-data quota was spent):
//   data/harmonic/bars/*__1M   40 symbols, monthly, PROTOCOL-harmonic.md §2 hygiene
//   data/us/bars/*             327 symbols, ~20 years of dailies, resampled here
// The harmonic set wins where both have a symbol: it is the one the study measured.
//
// Only COMPLETE months feed the scan, same as §2 — a half-finished month is not a bar. The
// days since that month closed are not thrown away though: every pending setup is replayed
// over them from the daily series, so a zone price has already reached is reported as
// reached rather than as still waiting.
//
// POST-HOC and descriptive. The protocol pre-registers no screen. This is the indicator
// pointed at a list of symbols; the study's base rates are what say how much a row is worth.

import fs from 'node:fs'
import zlib from 'node:zlib'
import { pivotStream, patternsAt, runPattern, PATTERNS } from '../engine/harmonic.js'
import { resample } from '../engine/resample.js'

const TF = '1M'
const MIN_MONTHS = Number(process.env.MIN_MONTHS ?? 60)
const widest = PATTERNS.reduce((m, s) => Math.max(m, s.pivots), 0)

const gz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)))
const cols = (d) => d.close.map((c, i) => ({ o: d.open[i], h: d.high[i], l: d.low[i], c, date: d.date[i] }))
// Drop a trailing monthly bar only when it is still forming — that is, when it sits in the
// same month as the last daily observation. The study's own monthly files already had their
// partial month removed by the collector (§2); dropping their last bar again would throw
// away a complete month, which is what the first version of this script did.
const dropForming = (monthly, dailyLast) => {
  const m = monthly[monthly.length - 1].date.slice(0, 7)
  return m === dailyLast.slice(0, 7) ? monthly.slice(0, -1) : monthly
}

// ---------------------------------------------------------------- the two sources
/** symbol -> {monthly: bar[], daily: bar[]|null, source} */
const series = new Map()

for (const f of fs.readdirSync('data/us/bars')) {
  const d = gz(`data/us/bars/${f}`)
  const daily = cols(d)
  const monthly = resample(daily.map((b) => ({ date: b.date, open: b.o, high: b.h, low: b.l, close: b.c })), 'monthly')
    .map((b) => ({ o: b.open, h: b.high, l: b.low, c: b.close, date: b.date }))
  series.set(d.symbol, { monthly: dropForming(monthly, daily[daily.length - 1].date), daily, source: 'us' })
}

for (const f of fs.readdirSync('data/harmonic/bars').filter((x) => x.endsWith(`__${TF}.json.gz`))) {
  const d = gz(`data/harmonic/bars/${f}`)
  const sym = d.symbol ?? f.replace(`__${TF}.json.gz`, '').replace('_', ':')
  const dayFile = `data/harmonic/bars/${f.replace(`__${TF}`, '__1D')}`
  const daily = fs.existsSync(dayFile) ? cols(gz(dayFile)) : (series.get(sym)?.daily ?? null)
  series.set(sym, {
    monthly: daily ? dropForming(cols(d), daily[daily.length - 1].date) : cols(d),
    daily,
    source: 'harmonic',
  })
}

// ---------------------------------------------------------------- names and kinds
// A screen that cannot tell a stock from a sector ETF is not a stock screen.
const meta = new Map()
for (const s of JSON.parse(fs.readFileSync('data/us/universe.json', 'utf8')).symbols) {
  meta.set(s.symbol, { name: s.name, sector: s.sector, kind: s.group === 'etf' ? 'etf' : 'stock' })
}
for (const s of JSON.parse(fs.readFileSync('data/harmonic/universe.json', 'utf8')).symbols) {
  if (!meta.has(s.symbol)) meta.set(s.symbol, { name: s.name ?? s.symbol.split(':')[1], sector: s.sector ?? null, kind: s.group === 'index' ? 'etf' : s.group === 'crypto' ? 'crypto' : 'stock' })
}

// ---------------------------------------------------------------- the scan
const rows = []
let scanned = 0
let short = 0

for (const [sym, { monthly, daily, source }] of series) {
  if (monthly.length < MIN_MONTHS) { short += 1; continue }
  scanned += 1
  const { pivots, atr } = pivotStream(monthly)
  const lastMonth = monthly[monthly.length - 1]
  // Days the monthly scan cannot see, because they belong to a month that has not closed.
  const after = daily ? daily.filter((b) => b.date.slice(0, 7) > lastMonth.date.slice(0, 7)) : []
  const spot = after.length ? after[after.length - 1] : lastMonth

  for (let k = 0; k < pivots.length; k += 1) {
    const run = pivots.slice(Math.max(0, k + 1 - widest), k + 1)
    for (const p of patternsAt(run)) {
      // 'pending' is returned exactly when the series ran out before the zone was touched,
      // point C was broken, or the window closed — i.e. the setup is still standing.
      if (runPattern(p, monthly, atr).reason !== 'pending') continue

      const s = p.s
      const near = s * p.przHi // the edge price meets first
      const far = s * p.przLo
      const aPrice = s * p.vA
      const cPrice = s * p.vC
      // The engine's own fill-time guard: an inverted AD leg puts the first target on the
      // wrong side of the entry, so there is no definable trade and no row.
      if (!(s * (aPrice - near) > 0)) continue

      const stop = far - s * 0.25 * atr[monthly.length - 1]
      const risk = Math.abs(near - stop)
      if (!(risk > 0)) continue
      const ad = Math.abs(aPrice - near)
      const xIndex = p.points[0].index
      const cIndex = p.points[p.points.length - 1].index

      // What the unclosed month did: a touch here means the setup is live NOW, not waiting.
      const touched = after.some((b) => (s === 1 ? b.l <= near : b.h >= near))
      const brokeC = after.some((b) => (s === 1 ? b.h > cPrice : b.l < cPrice))

      const m = meta.get(sym) ?? { name: sym.split(':')[1], sector: null, kind: 'stock' }
      rows.push({
        sym,
        name: m.name,
        sector: m.sector,
        kind: m.kind,
        source,
        pattern: p.pattern,
        side: p.side,
        price: spot.c,
        priceAt: spot.date,
        // Signed percent: how far price must travel to reach the near edge. A long waits for
        // a fall into its zone, a short for a rise, so the sign says which way.
        distPct: ((near - spot.c) / spot.c) * 100,
        zoneNear: near,
        zoneFar: far,
        stop,
        t1: near + s * 0.382 * ad,
        t2: near + s * 0.618 * ad,
        t3: cPrice,
        t4: aPrice,
        rr1: (0.382 * ad) / risk,
        riskPct: (risk / near) * 100,
        confirmedAt: monthly[p.confirmedAt].date,
        monthsLeft: p.confirmedAt + 1 + Math.max(10, cIndex - xIndex) - (monthly.length - 1),
        status: brokeC ? 'void-since' : touched ? 'reached-since' : 'waiting',
        lastMonth: lastMonth.date,
      })
    }
  }
}

rows.sort((a, b) => Math.abs(a.distPct) - Math.abs(b.distPct))

// The shortlist is the indicator as it ships, pointed at stocks. AB=CD is excluded because
// the indicator ships with it OFF: three pivots and one ratio make it 71% of all detections,
// and a screen led by it is a screen of the loosest thing in the set. A setup whose window
// closes this month is excluded too — there is nothing left to wait for.
const DEFAULT_OFF = new Set(['ABCD'])
const shortlist = rows.filter((r) => r.status === 'waiting' && r.kind === 'stock' && r.monthsLeft >= 1 && !DEFAULT_OFF.has(r.pattern))

// Monthly reached its first target 28.9% of the time in the study (484 trades). A loss is
// -1R by construction, so a setup needs reward/risk above (1-h)/h just to break even before
// costs. Printing it next to each row stops a near zone from reading as a good trade.
const HIT_1M = JSON.parse(fs.readFileSync('reports/harmonic.json', 'utf8')).tfRows.find((r) => r.tf === '1M')
const breakEven = (1 - HIT_1M.hit) / HIT_1M.hit
for (const r of rows) r.beatsBreakEven = r.rr1 >= breakEven

const out = {
  note: 'POST-HOC, descriptive. A row means X A B C are confirmed and the zone is fixed; price has not arrived. It is not a forecast that it will.',
  tf: TF,
  scanned,
  shortHistory: short,
  statuses: rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {}),
  shortlistRule: 'status=waiting, kind=stock, monthsLeft>=1, pattern!=ABCD (off by default in the indicator), nearest zone first',
  monthly: { hit: HIT_1M.hit, hitCI: HIT_1M.hitCI, meanR: HIT_1M.r, n: HIT_1M.n, breakEvenRR: breakEven },
  shortlist: shortlist.slice(0, 20),
  rows,
}
fs.mkdirSync('reports', { recursive: true })
fs.writeFileSync(`reports/harmonic-pending-${TF}.json`, `${JSON.stringify(out, null, 2)}\n`)

console.log(`${scanned} monthly series scanned (${short} short of ${MIN_MONTHS} months), ${rows.length} setups still standing`)
console.log(JSON.stringify(out.statuses))
const n = (x, p = 2) => x.toFixed(p).padStart(10)
const line = (r) =>
  `${r.sym.padEnd(14)} ${r.pattern.padEnd(12)} ${r.side.padEnd(6)} ${n(r.price)} ${n(r.zoneNear)} ${n(r.zoneFar)} ${n(r.distPct, 1)} ${n(r.stop)} ${n(r.t1)} ${r.rr1.toFixed(2).padStart(6)}${r.beatsBreakEven ? ' ' : '!'} ${String(r.monthsLeft).padStart(4)}  ${r.priceAt}`
const head = `\n(! = reward/risk below ${breakEven.toFixed(2)}, the break-even for monthly's measured ${(HIT_1M.hit * 100).toFixed(1)}% hit rate)` +
  '\nsymbol         pattern      side       price   zone near    zone far   dist%        stop          T1     R:R  mths  price as of'

console.log(`\n── shortlist: stocks, default pattern set (no AB=CD), still waiting ──${head}`)
for (const r of shortlist.slice(0, 15)) console.log(line(r))

console.log(`\n── AB=CD only (off by default; switch it on to see these) ──${head}`)
for (const r of rows.filter((x) => x.status === 'waiting' && x.kind === 'stock' && x.monthsLeft >= 1 && x.pattern === 'ABCD').slice(0, 10)) console.log(line(r))

const moved = rows.filter((r) => r.status !== 'waiting')
console.log(`\n── caught by the daily re-check of the unclosed month (${moved.length}) ──`)
for (const r of moved) console.log(`${r.sym.padEnd(14)} ${r.pattern.padEnd(12)} ${r.side.padEnd(6)} ${r.status}`)
