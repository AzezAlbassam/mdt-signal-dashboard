// Study 7: pull the TradingView connector responses out of the session transcripts
// (Claude Code saves every tool call and its result verbatim as JSONL), so no number is
// ever copied by hand.
//   node scripts/study7-collect.js <transcript.jsonl> [more.jsonl ...]
// OUT=<dir> writes there instead of data/fv (study 8 uses data/fv8); if <dir>/symbols.json
// exists, only those symbols are written.
// Writes data/fv/raw/fin/<SYM>.json, data/fv/raw/px/<SYM>.json, data/fv/sectors.json,
// data/fv/gold-monthly.json, data/fv/silver-monthly.json and data/fv/fetch-log.json.
import fs from 'node:fs'
import path from 'node:path'

const files = process.argv.slice(2)
if (files.length === 0) throw new Error('usage: study7-collect.js <transcript.jsonl> ...')

const out = process.env.OUT ?? 'data/fv'
const only = fs.existsSync(path.join(out, 'symbols.json')) && out !== 'data/fv' ? new Set(JSON.parse(fs.readFileSync(path.join(out, 'symbols.json'), 'utf8'))) : null
const keep = (sym) => !only || only.has(sym)
for (const d of ['raw/fin', 'raw/px']) fs.mkdirSync(path.join(out, d), { recursive: true })

const calls = new Map() // tool_use_id -> { name, input }
const results = [] // { id, text }
for (const f of files) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let j
    try {
      j = JSON.parse(line)
    } catch {
      continue
    }
    const content = j?.message?.content
    if (!Array.isArray(content)) continue
    for (const c of content) {
      if (c?.type === 'tool_use') calls.set(c.id, { name: c.name, input: c.input })
      if (c?.type === 'tool_result') {
        const text = typeof c.content === 'string' ? c.content : (c.content ?? []).map((x) => x.text ?? '').join('')
        results.push({ id: c.tool_use_id, text })
      }
    }
  }
}

const file = (sym) => `${sym.replace(':', '_')}.json`
const log = { fin: {}, px: {}, sectorMissing: [] }
const sectors = {}
const METALS = { 'TVC:GOLD': 'gold', 'TVC:SILVER': 'silver' }
const metals = {}
let nFin = 0
let nPx = 0

for (const { id, text } of results) {
  const call = calls.get(id)
  if (!call?.name?.startsWith('mcp__Trading_view_MCP__')) continue
  const { name, input } = call
  // Results too large to show inline are saved whole to a file; the transcript names it.
  const saved = text.match(/Output has been saved to (\S+\.txt)/)?.[1]
  const body = saved && fs.existsSync(saved) ? fs.readFileSync(saved, 'utf8') : text
  let j
  try {
    j = JSON.parse(body)
  } catch {
    j = { success: false, error: body.slice(0, 200) }
  }

  if (input?.symbol && !keep(input.symbol) && !METALS[input.symbol]) continue
  if (name.endsWith('get-financial-history') && input.period === 'fy' && input.date_from === '2000-01-01') {
    const sym = input.symbol
    if (j.success && j.labels) {
      const dst = path.join(out, 'raw/fin', file(sym))
      // Keep the longest response if a symbol was fetched twice.
      if (!fs.existsSync(dst) || JSON.parse(fs.readFileSync(dst, 'utf8')).labels.length < j.labels.length) {
        fs.writeFileSync(dst, JSON.stringify({ symbol: sym, labels: j.labels, series: j.series }))
        nFin += 1
      }
      log.fin[sym] = 'ok'
    } else if (log.fin[sym] !== 'ok') log.fin[sym] = String(j.error ?? 'failed').slice(0, 120)
  }

  if (name.endsWith('get-ohlcv') && ['M', '1M', 'month', '1mo'].includes(input.interval) && j.bars) {
    const sym = input.symbol
    const bars = Array.isArray(j.bars) ? Object.fromEntries(['t', 'o', 'h', 'l', 'c', 'v'].map((k) => [k, j.bars.map((b) => b[k])])) : j.bars
    if (METALS[sym]) {
      const prev = metals[METALS[sym]]
      if (!prev || prev.bars.t.length < bars.t.length) metals[METALS[sym]] = { symbol: sym, interval: 'M', bars }
      continue
    }
    const dst = path.join(out, 'raw/px', file(sym))
    if (!fs.existsSync(dst) || JSON.parse(fs.readFileSync(dst, 'utf8')).bars.t.length < bars.t.length) {
      fs.writeFileSync(dst, JSON.stringify({ symbol: sym, interval: 'M', bars }))
      nPx += 1
    }
    log.px[sym] = 'ok'
  } else if (name.endsWith('get-ohlcv') && !METALS[input.symbol] && !j.bars && log.px[input.symbol] !== 'ok') {
    log.px[input.symbol] = String(j.error ?? 'failed').slice(0, 120)
  }

  if (name.endsWith('get-symbol-data-batch') && j.data) {
    for (const [sym, row] of Object.entries(j.data)) if (keep(sym)) sectors[sym] = row
    for (const m of j.missing ?? []) log.sectorMissing.push(m)
  }
}

if (Object.keys(sectors).length) fs.writeFileSync(path.join(out, 'sectors.json'), JSON.stringify(sectors, null, 1))
if (!only) for (const [name, m] of Object.entries(metals)) fs.writeFileSync(path.join(out, `${name}-monthly.json`), JSON.stringify(m))
fs.writeFileSync(path.join(out, 'fetch-log.json'), JSON.stringify(log, null, 1))
console.log(`fundamentals written ${nFin}, prices written ${nPx}, sectors ${Object.keys(sectors).length}, metals ${Object.entries(metals).map(([k, m]) => `${k} ${m.bars.t.length} bars`).join(', ') || 'none'}`)
console.log(`fin ok ${Object.values(log.fin).filter((x) => x === 'ok').length} / ${Object.keys(log.fin).length}; px ok ${Object.values(log.px).filter((x) => x === 'ok').length}`)
