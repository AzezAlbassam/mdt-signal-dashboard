// Study 17: read TradingView responses out of session transcripts and spilled tool results, so no
// number is copied by hand.
//   - get_ohlcv monthly responses → data/caps/px/<EX>_<TICKER>.json ({ symbol, interval, bars }),
//     the same shape as data/fv/raw/px; the longest response per symbol wins.
//   - get-symbol-data-batch rows → data/caps/quotes.json (merged, newest call last) and, when the
//     row carries *_fy_h and fiscal_period_fy, data/caps/fin/<EX>_<TICKER>.json (histFromBatch).
//   SINCE=<ISO> node scripts/caps-collect.js <dir> [...more dirs]
import fs from 'node:fs'
import path from 'node:path'
import { histFromBatch } from '../engine/fairvalue.js'

const dirs = process.argv.slice(2)
if (!dirs.length) throw new Error('usage: caps-collect.js <dir> [...]')
const since = Date.parse(process.env.SINCE ?? '2026-10-23T10:40:00Z')
const PX = 'data/caps/px'
const FIN = 'data/caps/fin'
fs.mkdirSync(PX, { recursive: true })
fs.mkdirSync(FIN, { recursive: true })

function* toolResults(line) {
  let e
  try { e = JSON.parse(line) } catch { return }
  const content = e?.message?.content
  if (!Array.isArray(content)) return
  for (const c of content) {
    if (c?.type !== 'tool_result') continue
    const b = c.content
    const text = typeof b === 'string' ? b : Array.isArray(b) ? b.map((x) => x?.text ?? '').join('') : null
    if (text) yield text
  }
}
const walk = function* (d) {
  if (!fs.existsSync(d)) return
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if ((e.name.endsWith('.jsonl') || e.name.endsWith('.txt')) && fs.statSync(p).mtimeMs > since) yield p
  }
}
const columnar = (bars) => (Array.isArray(bars) ? Object.fromEntries(['t', 'o', 'h', 'l', 'c', 'v'].map((k) => [k, bars.map((x) => x[k])])) : bars)
const isMonthly = (iv) => ['M', 'mo', '1mo', 'month'].includes(String(iv)) // not '1M' (ambiguous with one minute)

const px = new Map()
const rows = new Map()
let nOhlcv = 0
let nBatch = 0
const take = (j) => {
  if (j?.symbol && j.bars && isMonthly(j.interval)) {
    const b = columnar(j.bars)
    if (!Array.isArray(b?.t) || !b.t.length) return
    nOhlcv += 1
    const prev = px.get(j.symbol)
    if (!prev || b.t.length > prev.t.length) px.set(j.symbol, b)
    return
  }
  const data = j?.data
  if (data && typeof data === 'object' && !Array.isArray(data) && !data.rows) {
    let any = false
    for (const [sym, row] of Object.entries(data)) {
      if (!/^[A-Z]+:/.test(sym) || typeof row !== 'object') continue
      rows.set(sym, { ...(rows.get(sym) ?? {}), ...row })
      any = true
    }
    if (any) nBatch += 1
  }
}
for (const dir of dirs) {
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, 'utf8')
    if (!text.includes('bars') && !text.includes('_fy_h') && !text.includes('market_cap_basic')) continue
    if (file.endsWith('.txt')) { try { take(JSON.parse(text)) } catch {} continue }
    for (const line of text.split('\n')) {
      if (!line.includes('tool_result')) continue
      for (const body of toolResults(line)) { try { take(JSON.parse(body)) } catch {} }
    }
  }
}

let wrote = 0
for (const [sym, b] of px) {
  const file = path.join(PX, `${sym.replace(/[:/]/g, '_')}.json`)
  if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).bars.t.length >= b.t.length) continue
  fs.writeFileSync(file, JSON.stringify({ symbol: sym, interval: 'M', bars: b }))
  wrote += 1
}
const qFile = 'data/caps/quotes.json'
const quotes = fs.existsSync(qFile) ? JSON.parse(fs.readFileSync(qFile, 'utf8')) : {}
let fins = 0
for (const [sym, row] of rows) {
  const keep = Object.fromEntries(Object.entries(row).filter(([k]) => !k.endsWith('_h')))
  quotes[sym] = { ...(quotes[sym] ?? {}), ...keep }
  const h = histFromBatch(row, 'fy', Infinity)
  if (h) {
    fs.writeFileSync(path.join(FIN, `${sym.replace(/[:/]/g, '_')}.json`), JSON.stringify({ symbol: sym, ...h }))
    fins += 1
  }
}
fs.writeFileSync(qFile, JSON.stringify(quotes, null, 1))
console.log(`monthly ohlcv responses ${nOhlcv} (${px.size} symbols, ${wrote} written); batch responses ${nBatch} (${rows.size} symbols, ${fins} fiscal-year files)`)
for (const [sym, b] of [...px].sort()) console.log(`  ${sym.padEnd(16)} ${String(b.t.length).padStart(4)} months ${new Date(b.t[0] * 1000).toISOString().slice(0, 7)} .. ${new Date(b.t.at(-1) * 1000).toISOString().slice(0, 7)}`)
