// Turn the get_ohlcv responses sitting in subagent transcripts into
// data/study11/bars/<EX>_<TICKER>.json.gz. Study 7 collected a bulk fetch the same way: the
// agents make the calls, the bars land in their transcripts, and nothing re-emits 5,000 bars
// through a model's context.
//
//   node scripts/study11-collect.js <workflowTranscriptDir> [...more dirs]
//
// Idempotent, and prefers the longest history: a symbol already on disk is replaced only by a
// response with strictly more bars. Hygiene matches scripts/us-ingest.js, with study 11's
// cutoff (PROTOCOL-study11.md §2).
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const CUTOFF = '2026-10-16'
const OUT = 'data/study11/bars'
const dirs = process.argv.slice(2)
if (!dirs.length) throw new Error('usage: study11-collect.js <transcriptDir> [...]')
fs.mkdirSync(OUT, { recursive: true })

// Every tool_result body in a transcript line, as text.
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

function clean(symbol, b) {
  const s = { symbol, date: [], open: [], high: [], low: [], close: [], volume: [] }
  for (let i = 0; i < b.t.length; i += 1) {
    const date = new Date(b.t[i] * 1000).toISOString().slice(0, 10)
    if (date > CUTOFF) continue
    if (![b.o[i], b.h[i], b.l[i], b.c[i]].every((x) => x > 0)) continue
    if (s.date.length && s.date[s.date.length - 1] >= date) continue // dupes and out-of-order
    s.date.push(date); s.open.push(b.o[i]); s.high.push(b.h[i]); s.low.push(b.l[i]); s.close.push(b.c[i]); s.volume.push(b.v[i] ?? 0)
  }
  return s
}

const walk = function* (d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.name.endsWith('.jsonl')) yield p
  }
}

const best = new Map() // symbol -> cleaned series
let seen = 0
for (const dir of dirs) {
  for (const file of walk(dir)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('"bars"')) continue // cheap pre-filter; the files are large
      for (const text of toolResults(line)) {
        let j
        try { j = JSON.parse(text) } catch { continue }
        if (!j?.symbol || j.interval !== '1D' || !j.bars) continue
        const b = columnar(j.bars)
        if (!Array.isArray(b?.t) || !b.t.length) continue
        seen += 1
        const s = clean(j.symbol, b)
        if (!s.date.length) continue
        const prev = best.get(j.symbol)
        if (!prev || s.date.length > prev.date.length) best.set(j.symbol, s)
      }
    }
  }
}

let written = 0
let kept = 0
for (const [symbol, s] of best) {
  const out = `${OUT}/${symbol.replace(/[:/]/g, '_')}.json.gz`
  if (fs.existsSync(out)) {
    const old = JSON.parse(zlib.gunzipSync(fs.readFileSync(out)))
    if (old.date.length >= s.date.length) { kept += 1; continue }
  }
  fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(s), { level: 9 }))
  written += 1
}
console.log(`ohlcv responses with bars: ${seen}; symbols: ${best.size}; written ${written}, already as good ${kept}`)
for (const [symbol, s] of [...best].sort()) console.log(`  ${symbol.padEnd(22)} ${String(s.date.length).padStart(5)} bars  ${s.date[0]} .. ${s.date[s.date.length - 1]}`)
