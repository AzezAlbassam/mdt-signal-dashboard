// Build data/swing/*.json from raw TradingView exports (PROTOCOL-swing.md §2–3).
//
// Raw inputs are the connector's get_ohlcv responses in column format
// ({symbol, bars: {t, o, h, l, c, v}}), one file per symbol, in $SWING_RAW, named
// EXCHANGE_TICKER.json. Outputs are compact column arrays with ISO dates, committed so the
// study reproduces without the connector.
//
// Bars dated after the cutoff are dropped: the protocol uses completed sessions only, and
// the connector's last bar is today's still-forming one.
//
//   SWING_RAW=/path/to/raw node scripts/swing-data.js

import fs from 'node:fs'
import path from 'node:path'

import { UNIVERSE, CUTOFF } from '../engine/swing-universe.js'

const RAW = process.env.SWING_RAW
if (!RAW) throw new Error('set SWING_RAW to the directory of raw TradingView exports')
const OUT = path.resolve('data/swing')
fs.mkdirSync(OUT, { recursive: true })

const isoDate = (sec) => new Date(sec * 1000).toISOString().slice(0, 10)

const manifest = []
for (const { symbol, group, name } of UNIVERSE) {
  const file = path.join(RAW, `${symbol.replace(':', '_')}.json`)
  if (!fs.existsSync(file)) {
    manifest.push({ symbol, group, dropped: 'not fetched' })
    continue
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (raw.symbol !== symbol) throw new Error(`${file} holds ${raw.symbol}, expected ${symbol}`)

  const b = raw.bars
  const rows = []
  for (let i = 0; i < b.t.length; i += 1) {
    const date = isoDate(b.t[i])
    if (date > CUTOFF) continue
    const bar = [date, b.o[i], b.h[i], b.l[i], b.c[i], b.v[i] ?? 0]
    if (bar.slice(1, 5).some((x) => !(x > 0))) throw new Error(`${symbol} ${date}: bad price`)
    if (rows.length && rows[rows.length - 1][0] >= date) throw new Error(`${symbol} ${date}: not increasing`)
    rows.push(bar)
  }

  const out = {
    symbol,
    name,
    group,
    source: `TradingView ${symbol} 1D via get_ohlcv, split-adjusted, not dividend-adjusted`,
    date: rows.map((r) => r[0]),
    open: rows.map((r) => r[1]),
    high: rows.map((r) => r[2]),
    low: rows.map((r) => r[3]),
    close: rows.map((r) => r[4]),
    volume: rows.map((r) => r[5]),
  }
  fs.writeFileSync(path.join(OUT, `${symbol.replace(':', '_')}.json`), JSON.stringify(out))
  manifest.push({ symbol, group, bars: rows.length, first: rows[0][0], last: rows[rows.length - 1][0] })
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ cutoff: CUTOFF, symbols: manifest }, null, 1))
for (const m of manifest) console.log(m.symbol.padEnd(18), m.dropped ?? `${m.bars} bars ${m.first} → ${m.last}`)
