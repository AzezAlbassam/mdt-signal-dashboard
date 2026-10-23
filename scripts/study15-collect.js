// Turn saved 1-minute get_ohlcv responses for OPRA option contracts into
// data/study15/opt/<EX>_<SYMBOL>.json.gz ({symbol, t[], o[], h[], l[], c[], v[]}).
//
//   node scripts/study15-collect.js <dir> [...more dirs]
//
// Same two paths as scripts/study11-collect.js: spilled tool-results/*.txt files and the
// fetch agents' .jsonl transcripts (small responses stay inline there). A symbol already on
// disk is replaced only by a response with strictly more bars.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const OUT = 'data/study15/opt'
const dirs = process.argv.slice(2)
if (!dirs.length) throw new Error('usage: study15-collect.js <dir> [...]')
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

const walk = function* (d) {
  if (!fs.existsSync(d)) return
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.name.endsWith('.jsonl') || e.name.endsWith('.txt')) yield p
  }
}

const best = new Map()
const take = (j) => {
  if (!j?.symbol?.startsWith('OPRA:') || j.interval !== '1m' || !j.bars) return
  const rows = Array.isArray(j.bars) ? j.bars : j.bars.t.map((t, i) => ({ t, o: j.bars.o[i], h: j.bars.h[i], l: j.bars.l[i], c: j.bars.c[i], v: j.bars.v[i] }))
  const m = new Map(rows.filter((r) => r.c > 0).map((r) => [r.t, r]))
  const s = [...m.values()].sort((a, b) => a.t - b.t)
  if (!s.length) return
  const prev = best.get(j.symbol)
  if (!prev || s.length > prev.length) best.set(j.symbol, s)
}
for (const dir of dirs) {
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, 'utf8')
    if (!text.includes('OPRA')) continue // escaped inside transcripts, so never look for '"bars"'
    if (file.endsWith('.txt')) { try { take(JSON.parse(text)) } catch {} ; continue }
    for (const line of text.split('\n')) {
      if (!line.includes('OPRA')) continue
      for (const body of toolResults(line)) { try { take(JSON.parse(body)) } catch {} }
    }
  }
}

let written = 0
for (const [symbol, s] of best) {
  const out = `${OUT}/${symbol.replace(/[:/]/g, '_')}.json.gz`
  if (fs.existsSync(out) && JSON.parse(zlib.gunzipSync(fs.readFileSync(out))).t.length >= s.length) continue
  const col = { symbol, ...Object.fromEntries(['t', 'o', 'h', 'l', 'c', 'v'].map((k) => [k, s.map((r) => r[k])])) }
  fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(col), { level: 9 }))
  written += 1
}
console.log(`option symbols: ${best.size}; written ${written}`)
