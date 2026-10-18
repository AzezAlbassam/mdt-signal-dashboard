// Turn saved get_ohlcv responses into data/harmonic/bars/<EX>_<TICKER>__<TF>.json.gz.
//
//   SINCE=<ISO time> node scripts/harmonic-collect.js <dir> [...more dirs]
//
// Same trick as scripts/study11-collect.js: a get_ohlcv result large enough to overflow the
// tool-result limit is spilled to .../tool-results/mcp-*-get-ohlcv-*.txt instead of entering
// the agent's context, so the cheap path is to ask for the biggest page available and read
// the bars off disk here. Responses that stayed inline are recovered from .jsonl transcripts.
//
// Unlike study 11 this keeps five intervals per symbol, so the interval is part of the
// filename and a response only ever replaces a file of the SAME interval.
//
// Hygiene is PROTOCOL-harmonic.md §2: bars after the cutoff dropped, non-positive or
// out-of-order bars dropped, and for the monthly series the trailing bar is dropped when it
// falls in the cutoff's own month, because that month has not finished.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const CUTOFF = '2026-10-17'
const OUT = 'data/harmonic/bars'
const TF = { '1h': '1h', '4h': '4h', '1D': '1D', '1W': '1W', M: '1M', '1M': '1M' }

const dirs = process.argv.slice(2)
if (!dirs.length) throw new Error('usage: harmonic-collect.js <dir> [...]')
const since = Date.parse(process.env.SINCE ?? '2026-10-18T00:00:00Z')
fs.mkdirSync(OUT, { recursive: true })

function* toolResults(line) {
  let e
  try { e = JSON.parse(line) } catch { return }
  const content = e?.message?.content
  if (!Array.isArray(content)) return
  for (const c of content) {
    if (c?.type !== 'tool_result') continue
    const b = c.content
    const text = typeof b === 'string' ? b : Array.isArray(b) && typeof b[0]?.text === 'string' ? b[0].text : null
    if (text) yield text
  }
}

const columnar = (bars) =>
  Array.isArray(bars)
    ? Object.fromEntries(['t', 'o', 'h', 'l', 'c', 'v'].map((k) => [k, bars.map((x) => x[k])]))
    : bars

// Intraday bars need their timestamp kept; daily and slower are identified by date alone.
function clean(symbol, tf, b) {
  const intraday = tf === '1h' || tf === '4h'
  const s = { symbol, timeframe: tf, date: [], time: [], open: [], high: [], low: [], close: [], volume: [] }
  for (let i = 0; i < b.t.length; i += 1) {
    const iso = new Date(b.t[i] * 1000).toISOString()
    const date = iso.slice(0, 10)
    if (date > CUTOFF) continue
    if (![b.o[i], b.h[i], b.l[i], b.c[i]].every((x) => x > 0)) continue
    const stamp = intraday ? iso.slice(0, 16) : date
    const last = s.time.length ? s.time[s.time.length - 1] : null
    if (last !== null && last >= stamp) continue // dupes and out-of-order
    s.time.push(stamp); s.date.push(date)
    s.open.push(b.o[i]); s.high.push(b.h[i]); s.low.push(b.l[i]); s.close.push(b.c[i]); s.volume.push(b.v[i] ?? 0)
  }
  // The cutoff's own month has not closed, so a monthly bar inside it is a partial bar.
  if (tf === '1M' && s.date.length && s.date[s.date.length - 1].slice(0, 7) === CUTOFF.slice(0, 7)) {
    for (const k of ['date', 'time', 'open', 'high', 'low', 'close', 'volume']) s[k].pop()
  }
  return s
}

const walk = function* (d) {
  if (!fs.existsSync(d)) return
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if ((e.name.endsWith('.jsonl') || e.name.endsWith('.txt')) && fs.statSync(p).mtimeMs > since) yield p
  }
}

const best = new Map() // "symbol|tf" -> cleaned series
let seen = 0
const take = (j) => {
  const tf = TF[j?.interval]
  if (!j?.symbol || !tf || !j.bars) return
  const b = columnar(j.bars)
  if (!Array.isArray(b?.t) || !b.t.length) return
  seen += 1
  const s = clean(j.symbol, tf, b)
  if (!s.date.length) return
  const key = `${j.symbol}|${tf}`
  const prev = best.get(key)
  if (!prev || s.date.length > prev.date.length) best.set(key, s)
}

for (const dir of dirs) {
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, 'utf8')
    // Must not pre-filter on '"bars"': inside a .jsonl transcript the response is an escaped
    // string, so the quotes appear as \" and that spelling never matches (study 11's bug).
    if (!text.includes('bars')) continue
    if (file.endsWith('.txt')) {
      try { take(JSON.parse(text)) } catch {}
      continue
    }
    for (const line of text.split('\n')) {
      if (!line.includes('bars')) continue
      for (const body of toolResults(line)) {
        try { take(JSON.parse(body)) } catch {}
      }
    }
  }
}

let written = 0
let kept = 0
for (const [key, s] of best) {
  const [symbol, tf] = key.split('|')
  const out = `${OUT}/${symbol.replace(/[:/]/g, '_')}__${tf}.json.gz`
  if (fs.existsSync(out)) {
    const old = JSON.parse(zlib.gunzipSync(fs.readFileSync(out)))
    if (old.date.length >= s.date.length) { kept += 1; continue }
  }
  fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(s), { level: 9 }))
  written += 1
}
console.log(`ohlcv responses with bars: ${seen}; series: ${best.size}; written ${written}, already as good ${kept}`)
for (const [key, s] of [...best].sort()) {
  const [symbol, tf] = key.split('|')
  console.log(`  ${symbol.padEnd(18)} ${tf.padEnd(3)} ${String(s.date.length).padStart(5)} bars  ${s.date[0]} .. ${s.date[s.date.length - 1]}`)
}
