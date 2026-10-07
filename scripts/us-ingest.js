// Turn saved get_ohlcv responses (column format) into data/us/bars/<EX>_<TICKER>.json.gz.
// Idempotent: existing files are left alone. Bars after the cutoff (2026-10-06) are dropped.
//   US_RAW=<dir> node scripts/us-ingest.js
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const CUTOFF = '2026-10-06'
const RAW = process.env.US_RAW
if (!RAW) throw new Error('set US_RAW')
const u = new Map(JSON.parse(fs.readFileSync('data/us/universe.json', 'utf8')).symbols.map((x) => [x.symbol, x]))
// The user's watchlist (addendum 1 §A) is stored too, for its separate report.
for (const w of JSON.parse(fs.readFileSync('data/us/watchlist.json', 'utf8')).tickers) if (w.symbol && !u.has(w.symbol)) u.set(w.symbol, { symbol: w.symbol })
let added = 0
for (const f of fs.readdirSync(RAW)) {
  let raw
  try { raw = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')) } catch { continue }
  if (!raw?.bars?.t || !u.has(raw.symbol)) continue
  const out = `data/us/bars/${raw.symbol.replace(':', '_')}.json.gz`
  if (fs.existsSync(out)) continue
  const b = raw.bars
  const s = { symbol: raw.symbol, date: [], open: [], high: [], low: [], close: [], volume: [] }
  for (let i = 0; i < b.t.length; i += 1) {
    const date = new Date(b.t[i] * 1000).toISOString().slice(0, 10)
    if (date > CUTOFF) continue
    if (![b.o[i], b.h[i], b.l[i], b.c[i]].every((x) => x > 0)) continue
    if (s.date.length && s.date[s.date.length - 1] >= date) continue
    s.date.push(date); s.open.push(b.o[i]); s.high.push(b.h[i]); s.low.push(b.l[i]); s.close.push(b.c[i]); s.volume.push(b.v[i] ?? 0)
  }
  if (!s.date.length) continue
  fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(s), { level: 9 }))
  added += 1
}
console.log(`added ${added}`)
