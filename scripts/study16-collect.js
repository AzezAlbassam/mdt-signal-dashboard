// Study 16 (PROTOCOL-study16.md §1): pull TradingView's equity, cash, operating-income and revenue
// histories (get-symbol-data-batch with total_equity_fy_h, cash_n_short_term_invest_fy_h,
// oper_income_fy_h, total_revenue_fy_h) out of the session transcripts, as study14-collect.js does,
// so no number is copied by hand. Writes <folder>/raw/bal/<SYM>.json for the folder holding the
// symbol's fundamentals; a symbol seen twice keeps the row with more non-empty columns (tie: later).
// Prints the universe symbols never requested, so the fetch can be completed before the run.
//   node scripts/study16-collect.js <transcript.jsonl> [more.jsonl ...]
import fs from 'node:fs'
import path from 'node:path'
import { loadUniverse } from './lib/universe.js'

const COLS = ['total_equity_fy_h', 'cash_n_short_term_invest_fy_h', 'oper_income_fy_h', 'total_revenue_fy_h']
const files = process.argv.slice(2)
if (!files.length) throw new Error('usage: study16-collect.js <transcript.jsonl> ...')
const calls = new Map()
const results = []
for (const f of files) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
  let j
  try { j = JSON.parse(line) } catch { continue }
  for (const c of Array.isArray(j?.message?.content) ? j.message.content : []) {
    if (c?.type === 'tool_use') calls.set(c.id, { name: c.name, input: c.input })
    if (c?.type === 'tool_result') results.push({ id: c.tool_use_id, text: typeof c.content === 'string' ? c.content : (c.content ?? []).map((x) => x.text ?? '').join('') })
  }
}
const folderOf = (sym) => ['data/fv', 'data/fv8'].find((d) => fs.existsSync(path.join(d, 'raw/fin', `${sym.replace(':', '_')}.json`)))
const filled = (r) => COLS.filter((c) => Array.isArray(r?.[c]) && r[c].length).length
const best = new Map()
const requested = new Set()
const missing = new Set()
let failed = 0
for (const { id, text } of results) {
  const call = calls.get(id)
  if (!call?.name?.endsWith('mcp-tv-get-symbol-data-batch') || !COLS.every((c) => call.input?.columns?.includes(c))) continue
  const saved = text.match(/Output has been saved to (\S+\.txt)/)?.[1]
  let j
  try { j = JSON.parse(saved && fs.existsSync(saved) ? fs.readFileSync(saved, 'utf8') : text) } catch { j = null }
  if (!j?.success) { failed += 1; continue }
  for (const s of call.input.symbols ?? []) requested.add(s)
  for (const [sym, row] of Object.entries(j.data ?? {})) if (!best.has(sym) || filled(row) >= filled(best.get(sym))) best.set(sym, row)
  for (const m of j.missing ?? []) missing.add(m.symbol ?? m)
}
let n = 0
for (const [sym, row] of best) {
  const dir = folderOf(sym)
  if (!dir) continue
  fs.mkdirSync(path.join(dir, 'raw/bal'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'raw/bal', `${sym.replace(':', '_')}.json`), JSON.stringify({ symbol: sym, ...Object.fromEntries(COLS.map((c) => [c, row[c] ?? null])) }))
  n += 1
}
const seen = new Set()
const universe = [...loadUniverse('data/fv', '2026-09').stocks, ...loadUniverse('data/fv8', '2026-09').stocks].filter((s) => {
  const f = s.funds.at(-1)
  const key = `${f.year}|${f.rev}|${f.ni}`
  return seen.has(key) ? false : (seen.add(key), true)
}).map((s) => s.sym)
const never = universe.filter((s) => !requested.has(s))
const noRow = universe.filter((s) => requested.has(s) && !best.has(s) && !missing.has(s))
console.log(`bal written for ${n} distinct symbols; ${requested.size} requested in successful calls; ${failed} failed or unreadable calls`)
console.log(`reported missing: ${missing.size ? [...missing].join(' ') : 'none'}`)
console.log(`universe ${universe.length}: never requested in a successful call ${never.length}${never.length ? ` (${never.join(' ')})` : ''}; requested but no row and not reported missing ${noRow.length}${noRow.length ? ` (${noRow.join(' ')})` : ''}`)
