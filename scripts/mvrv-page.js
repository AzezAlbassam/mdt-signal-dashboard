// Pack the backtest results into mvrv.html.
//
// Reads data/mvrv/{BTC,…}.json, data/mvrv/results.json and data/mvrv/validation.json,
// keeps what the page draws, and rewrites the JSON block inside mvrv.html
// (<script type="application/json" id="D">…</script>). Stocks with long histories are
// thinned to every other week for the charts only; every number in the tables comes from
// the full weekly run.
//
//   node scripts/mvrv-backtest.js && node scripts/mvrv-page.js

import fs from 'node:fs'
import path from 'node:path'

import { costBasisFromTurnover, mvrvRatio, mvrvZ } from '../engine/mvrv.js'

const DATA = path.resolve('data/mvrv')
const PAGE = path.resolve('mvrv.html')
const load = (name) => JSON.parse(fs.readFileSync(path.join(DATA, `${name}.json`), 'utf8'))

const results = load('results')
const validation = load('validation')

const sig = (x, d = 4) => (Number.isFinite(x) ? Number(x.toPrecision(d)) : null)
const fix = (x, d = 3) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null)
const typical = (d) => d.c.map((c, i) => (d.h[i] + d.l[i] + c) / 3)

function thin(series, every) {
  const keep = (_, i, arr) => i % every === 0 || i === arr.length - 1
  return Object.fromEntries(Object.entries(series).map(([k, v]) => [k, Array.isArray(v) ? v.filter(keep) : v]))
}

/** One horizon's row, cut down to what the tables show. */
const row = (r) => ({
  n: r.nSignal,
  nAll: r.nAll,
  med: fix(r.medianSignal, 4),
  medAll: fix(r.medianAll, 4),
  hit: fix(r.hitSignal, 3),
  hitAll: fix(r.hitAll, 3),
  edge: fix(r.logEdge, 3),
  p: fix(r.p, 4),
})
const signal = (ev) => ({
  share: fix(ev.share, 3),
  h: Object.fromEntries(Object.entries(ev.byH).map(([h, r]) => [h, row(r)])),
  acc: { ratio: fix(ev.acc.ratio, 3), p: fix(ev.acc.p, 4), lo: fix(ev.acc.null05, 3), hi: fix(ev.acc.null95, 3), cashLeft: Math.round(ev.acc.cashLeft), paidIn: ev.acc.paidIn },
})

/** Episodes summarised against waiting, with the report's exact one-sided sign test. */
function waitSummary(eps, h) {
  const ranks = eps.map((e) => e[`rank${h}`]).filter((r) => r != null)
  const above = ranks.filter((r) => r > 0.5).length
  const n = ranks.length
  const choose = (a, b) => { let c = 1; for (let i = 1; i <= b; i += 1) c = (c * (a - b + i)) / i; return c }
  let p = 0
  for (let x = above; x <= n; x += 1) p += choose(n, x) / 2 ** n
  return { n, above, mean: n ? fix(ranks.reduce((a, b) => a + b, 0) / n, 3) : null, p: n ? fix(p, 4) : null }
}

// ---------------------------------------------------------------- Bitcoin

const btcRaw = load('BTC')
const btcRes = results.assets.BTC
const mv = btcRaw.c.map((c, i) => c * btcRaw.supply[i])
const days = (t) => Math.round(t / 86400)
const btc = {
  day: btcRaw.t.map(days),
  c: btcRaw.c.map((x) => sig(x)),
  rp: btcRaw.realizedCap.map((r, i) => sig(r / btcRaw.supply[i])),
  z: mvrvZ(mv, btcRaw.realizedCap).map((x) => fix(x, 3)),
  zFull: mvrvZ(mv, btcRaw.realizedCap, { std: 'full' }).map((x) => fix(x, 3)),
  now: btcRes.now,
  signals: Object.fromEntries(Object.entries(btcRes.signals).map(([k, v]) => [k, signal(v)])),
  common: Object.fromEntries(Object.entries(btcRes.common).map(([k, v]) => [k, signal(v)])),
  eras: Object.fromEntries(Object.entries(btcRes.eras).map(([k, v]) => [k, signal(v)])),
  memoryFit: btcRes.memoryFit,
  episodes: btcRes.episodes['mvrv<1'],
  troughs: btcRes.troughs['mvrv<1'],
  wait: Object.fromEntries([52, 104, 156].map((h) => [h, waitSummary(btcRes.episodes['mvrv<1'], h)])),
  waitNear: Object.fromEntries([52, 104, 156].map((h) => [h, waitSummary(btcRes.episodes['z<0.5'], h)])),
}

// ---------------------------------------------------------------- stocks

const stocks = {}
for (const [ticker, a] of Object.entries(results.assets)) {
  if (ticker === 'BTC') continue
  const d = load(ticker)
  const rp = costBasisFromTurnover(typical(d), d.v, d.shares, { scale: 1 })
  const ratio = mvrvRatio(d.c, rp)
  const z = mvrvZ(d.c, rp)
  const every = d.c.length > 1200 ? 2 : 1
  stocks[ticker] = {
    symbol: d.symbol,
    group: a.group,
    from: a.from,
    eligibleFrom: a.eligibleFrom,
    weeks: a.weeks,
    now: a.now,
    turnover: a.turnover,
    every,
    ...thin({ day: d.t.map(days), c: d.c.map((x) => sig(x)), rp: rp.map((x) => sig(x)), z: z.map((x) => fix(x, 3)), below: ratio.map((r) => (r < 1 ? 1 : 0)) }, every),
    signals: Object.fromEntries(Object.entries(a.signals).map(([k, v]) => [k, signal(v)])),
    common: Object.fromEntries(Object.entries(a.common).map(([k, v]) => [k, signal(v)])),
    scales: Object.fromEntries(Object.entries(a.scales).map(([k, v]) => [k, signal(v)])),
    wait: Object.fromEntries(Object.entries(a.episodes).map(([name, eps]) => [name, Object.fromEntries([52, 104, 156].map((h) => [h, waitSummary(eps, h)]))])),
    troughs: a.troughs['mvrv<1'],
  }
}

const pooled = {}
for (const [sigName, byGroup] of Object.entries(results.pooled)) {
  pooled[sigName] = Object.fromEntries(Object.entries(byGroup).map(([g, byH]) => [g, Object.fromEntries(Object.entries(byH).map(([h, r]) => [h, { edge: fix(r.observed, 3), p: fix(r.p, 4) }]))]))
}

const pine = {
  btc: fs.readFileSync('pine/mvrv-zscore-btc.pine', 'utf8'),
  stock: fs.readFileSync('pine/stock-mvrv-zscore.pine', 'utf8'),
}

const payload = { generated: results.generated, pooledDraws: results.pooledDraws, btc, stocks, pooled, validation, pine }
const json = JSON.stringify(payload).replace(/</g, '\\u003c')

const html = fs.readFileSync(PAGE, 'utf8')
const open = '<script type="application/json" id="D">'
const start = html.indexOf(open)
const end = html.indexOf('</script>', start)
if (start < 0 || end < 0) throw new Error('mvrv.html has no data block')
fs.writeFileSync(PAGE, html.slice(0, start + open.length) + json + html.slice(end))
console.log(`mvrv.html data block: ${(json.length / 1024).toFixed(0)} KB`)
