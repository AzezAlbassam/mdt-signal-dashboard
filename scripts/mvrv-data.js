// Build data/mvrv/*.json from raw TradingView exports.
//
// Raw inputs are the JSON the TradingView data connector returns ({symbol, interval,
// bars: [{t, o, h, l, c, v}]}), one file per symbol, in $MVRV_RAW. Outputs are compact
// column arrays, weekly, committed so the backtest reproduces without the connector.
//
//   Bitcoin  INDEX:BTCUSD weekly (price) + COINMETRICS:BTC_MARKETCAPREAL weekly
//            (Coin Metrics realized cap, read off the chain). Supply comes from the
//            issuance schedule (engine/mvrv.js) and is checked here against
//            CRYPTOCAP:BTC ÷ price, which TradingView carries from 2014.
//   Stocks   weekly OHLCV, split-adjusted prices and volume; PayPal arrives daily and is
//            folded into weeks here. Shares outstanding are the latest reported count
//            (FMP, Oct 2026) — no point-in-time history was available on this data plan,
//            which is why the backtest varies the turnover scale.
//
//   MVRV_RAW=/path/to/raw node scripts/mvrv-data.js

import fs from 'node:fs'
import path from 'node:path'

import { btcSupplyAt } from '../engine/mvrv.js'

const RAW = process.env.MVRV_RAW
if (!RAW) throw new Error('set MVRV_RAW to the directory of raw TradingView exports')
const OUT = path.resolve('data/mvrv')
fs.mkdirSync(OUT, { recursive: true })

// Latest reported shares outstanding, from FMP's shares-float endpoint (SEC filings).
const SHARES = {
  NVDA: 24_221_000_000,
  MSFT: 7_425_550_000,
  AAPL: 14_594_180_000,
  META: 2_547_486_570,
  AMZN: 10_757_100_000,
  INTC: 5_043_999_747,
  CSCO: 3_941_434_665,
  C: 1_714_910_000,
  BAC: 7_096_590_000,
  BA: 790_370_000,
  NKE: 1_479_811_225,
  PYPL: 855_461_000,
  DIS: 1_736_510_000,
  VZ: 4_175_560_000,
  KO: 4_302_548_934,
}

const STOCKS = [
  ['NVDA', 'NASDAQ_NVDA_1W', 'requested'],
  ['MSFT', 'NASDAQ_MSFT_1W', 'requested'],
  ['AAPL', 'NASDAQ_AAPL_1W', 'requested'],
  ['META', 'NASDAQ_META_1W', 'requested'],
  ['AMZN', 'NASDAQ_AMZN_1W', 'requested'],
  ['INTC', 'NASDAQ_INTC_1W', 'control'],
  ['CSCO', 'NASDAQ_CSCO_1W', 'control'],
  ['C', 'NYSE_C_1W', 'control'],
  ['BAC', 'NYSE_BAC_1W', 'control'],
  ['BA', 'NYSE_BA_1W', 'control'],
  ['NKE', 'NYSE_NKE_1W', 'control'],
  ['PYPL', 'NASDAQ_PYPL_1D', 'control'],
  ['DIS', 'NYSE_DIS_1W', 'control'],
  ['VZ', 'NYSE_VZ_1W', 'control'],
  ['KO', 'NYSE_KO_1W', 'control'],
]

const load = (name) => JSON.parse(fs.readFileSync(path.join(RAW, `${name}.json`), 'utf8'))
const sig = (x, digits = 7) => (x === 0 ? 0 : Number(x.toPrecision(digits)))
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 10)

/** Monday of the UTC week a timestamp falls in, as an ISO date. */
function weekKey(t) {
  const d = new Date(t * 1000)
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function dailyToWeekly(bars) {
  const out = []
  let cur = null
  let key = null
  for (const b of bars) {
    const k = weekKey(b.t)
    if (k !== key) {
      if (cur) out.push(cur)
      key = k
      cur = { ...b }
    } else {
      cur.h = Math.max(cur.h, b.h)
      cur.l = Math.min(cur.l, b.l)
      cur.c = b.c
      cur.v += b.v
    }
  }
  if (cur) out.push(cur)
  return out
}

function columns(bars) {
  return {
    t: bars.map((b) => b.t),
    o: bars.map((b) => sig(b.o)),
    h: bars.map((b) => sig(b.h)),
    l: bars.map((b) => sig(b.l)),
    c: bars.map((b) => sig(b.c)),
    v: bars.map((b) => Math.round(b.v)),
  }
}

const write = (name, obj) => {
  fs.writeFileSync(path.join(OUT, `${name}.json`), `${JSON.stringify(obj)}\n`)
}

// ---------------------------------------------------------------- Bitcoin

{
  const price = load('INDEX_BTCUSD_1W').bars
  const realized = new Map(load('COINMETRICS_BTC_MARKETCAPREAL_1W').bars.map((b) => [weekKey(b.t), b.c]))
  const cryptocap = new Map(load('CRYPTOCAP_BTC_1W').bars.map((b) => [weekKey(b.t), b.c]))

  // Mt. Gox opened in July 2010; before that the "price" is a handful of OTC trades.
  const START = '2010-07-19'
  const bars = price.filter((b) => iso(b.t) >= START && realized.get(weekKey(b.t)) > 0)

  // Supply is valued at the week's close: the last moment of the bar.
  const closeTime = (t) => t + 7 * 86400 - 1
  const supply = bars.map((b) => btcSupplyAt(closeTime(b.t)))

  const errs = []
  bars.forEach((b, i) => {
    const cap = cryptocap.get(weekKey(b.t))
    if (cap > 0) errs.push(Math.abs(supply[i] / (cap / b.c) - 1))
  })
  errs.sort((a, b) => a - b)
  const supplyCheck = {
    weeks: errs.length,
    medianAbsError: sig(errs[errs.length >> 1], 3),
    p95AbsError: sig(errs[Math.floor(errs.length * 0.95)], 3),
  }

  write('BTC', {
    symbol: 'BTC',
    group: 'bitcoin',
    source: 'TradingView INDEX:BTCUSD weekly; COINMETRICS:BTC_MARKETCAPREAL weekly; supply from the issuance schedule',
    supplyCheck,
    ...columns(bars),
    supply: supply.map((s) => Math.round(s)),
    realizedCap: bars.map((b) => sig(realized.get(weekKey(b.t)), 9)),
  })
  console.log(`BTC  ${bars.length} weeks ${iso(bars[0].t)} → ${iso(bars.at(-1).t)}  supply vs CRYPTOCAP: median ${(supplyCheck.medianAbsError * 100).toFixed(2)}%, p95 ${(supplyCheck.p95AbsError * 100).toFixed(2)}% over ${errs.length} weeks`)
}

// ---------------------------------------------------------------- stocks

for (const [ticker, file, group] of STOCKS) {
  const raw = load(file)
  let bars = raw.bars.filter((b) => b.c > 0 && b.o > 0 && b.v != null)
  if (raw.interval !== '1W') bars = dailyToWeekly(bars)
  write(ticker, {
    symbol: raw.symbol,
    ticker,
    group,
    source: `TradingView ${raw.symbol} ${raw.interval === '1W' ? 'weekly' : 'daily folded to weekly'}, split-adjusted prices and volume`,
    shares: SHARES[ticker],
    sharesSource: 'FMP shares-float, latest SEC filing as of 2026-10',
    ...columns(bars),
  })
  console.log(`${ticker.padEnd(5)}${String(bars.length).padStart(5)} weeks ${iso(bars[0].t)} → ${iso(bars.at(-1).t)}  ${group}`)
}
