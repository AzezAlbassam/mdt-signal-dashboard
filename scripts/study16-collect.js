// Study 16: pull TradingView's equity, cash, operating-income and revenue histories
// (get-symbol-data-batch with total_equity_fy_h, cash_n_short_term_invest_fy_h, oper_income_fy_h,
// total_revenue_fy_h) out of the session transcripts, as study14-collect.js does, so no number is
// copied by hand. Writes <folder>/raw/bal/<SYM>.json for the folder holding the symbol's fundamentals.
//   node scripts/study16-collect.js <transcript.jsonl> [more.jsonl ...]
import fs from 'node:fs'
import path from 'node:path'

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
let n = 0
const requested = new Set()
const missing = []
for (const { id, text } of results) {
  const call = calls.get(id)
  if (!call?.name?.endsWith('mcp-tv-get-symbol-data-batch') || !call.input?.columns?.includes('total_equity_fy_h')) continue
  const saved = text.match(/Output has been saved to (\S+\.txt)/)?.[1]
  let j
  try { j = JSON.parse(saved && fs.existsSync(saved) ? fs.readFileSync(saved, 'utf8') : text) } catch { continue }
  if (!j?.success) continue
  for (const s of call.input.symbols ?? []) requested.add(s)
  for (const [sym, row] of Object.entries(j.data ?? {})) {
    const dir = folderOf(sym)
    if (!dir) continue
    fs.mkdirSync(path.join(dir, 'raw/bal'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'raw/bal', `${sym.replace(':', '_')}.json`), JSON.stringify({ symbol: sym, ...Object.fromEntries(COLS.map((c) => [c, row[c] ?? null])) }))
    n += 1
  }
  for (const m of j.missing ?? []) missing.push(m.symbol ?? m)
}
console.log(`bal written for ${n} symbols of ${requested.size} requested; reported missing: ${missing.length ? missing.join(' ') : 'none'}`)
