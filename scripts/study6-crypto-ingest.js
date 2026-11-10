// Study 6 crypto bars (PROTOCOL-study6.md §3): saved get_ohlcv responses (BINANCE, 1D,
// column format) → data/crypto/bars/<EX>_<PAIR>.json.gz. Bars dated on or after 2026-10-08
// are dropped (still forming); a pair with fewer than 500 bars is dropped and listed.
//   node scripts/study6-crypto-ingest.js <dir of saved responses>
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { CRYPTO6 } from '../engine/study6.js'

const DROP_FROM = '2026-10-08'
const MIN_BARS = 500
const RAW = process.argv[2]
if (!RAW) throw new Error('usage: study6-crypto-ingest.js <rawDir>')
const wanted = new Set(CRYPTO6.filter((c) => c.symbol.startsWith('BINANCE:')).map((c) => c.symbol))
fs.mkdirSync('data/crypto/bars', { recursive: true })
const got = new Set()
for (const f of fs.readdirSync(RAW)) {
  let raw
  try { raw = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')) } catch { continue }
  if (!raw?.bars?.t || raw.interval !== '1D' || !wanted.has(raw.symbol)) continue
  const b = raw.bars
  const s = { symbol: raw.symbol, group: 'crypto', source: `TradingView ${raw.symbol} 1D via get_ohlcv`, date: [], open: [], high: [], low: [], close: [], volume: [] }
  for (let i = 0; i < b.t.length; i += 1) {
    const date = new Date(b.t[i] * 1000).toISOString().slice(0, 10)
    if (date >= DROP_FROM) continue
    if (![b.o[i], b.h[i], b.l[i], b.c[i]].every((x) => x > 0)) continue
    if (s.date.length && s.date[s.date.length - 1] >= date) continue
    s.date.push(date); s.open.push(b.o[i]); s.high.push(b.h[i]); s.low.push(b.l[i]); s.close.push(b.c[i]); s.volume.push(b.v[i] ?? 0)
  }
  if (s.date.length < MIN_BARS) { console.log(`dropped ${raw.symbol}: ${s.date.length} bars`); continue }
  fs.writeFileSync(`data/crypto/bars/${raw.symbol.replace(':', '_')}.json.gz`, zlib.gzipSync(JSON.stringify(s), { level: 9 }))
  got.add(raw.symbol)
  console.log(`${raw.symbol} ${s.date.length} bars ${s.date[0]} → ${s.date.at(-1)}`)
}
const missing = [...wanted].filter((x) => !got.has(x))
console.log(`stored ${got.size}/${wanted.size}${missing.length ? `; missing: ${missing.join(' ')}` : ''}`)
