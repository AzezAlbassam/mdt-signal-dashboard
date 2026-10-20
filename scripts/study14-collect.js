// Study 14: pull TradingView's total-assets and revenue histories (get-symbol-data-batch with
// total_assets_fy_h + total_revenue_fy_h) out of the session transcripts, so no number is copied
// by hand. Writes <folder>/raw/assets/<SYM>.json for the folder (data/fv or data/fv8) holding the
// symbol's fundamentals.
//   node scripts/study14-collect.js <transcript.jsonl> [more.jsonl ...]
import fs from 'node:fs'
import path from 'node:path'

const files = process.argv.slice(2)
if (!files.length) throw new Error('usage: study14-collect.js <transcript.jsonl> ...')
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
const missing = []
for (const { id, text } of results) {
  const call = calls.get(id)
  if (!call?.name?.endsWith('mcp-tv-get-symbol-data-batch') || !call.input?.columns?.includes('total_assets_fy_h')) continue
  const saved = text.match(/Output has been saved to (\S+\.txt)/)?.[1]
  let j
  try { j = JSON.parse(saved && fs.existsSync(saved) ? fs.readFileSync(saved, 'utf8') : text) } catch { continue }
  for (const [sym, row] of Object.entries(j?.data ?? {})) {
    const dir = folderOf(sym)
    if (!dir) continue
    fs.mkdirSync(path.join(dir, 'raw/assets'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'raw/assets', `${sym.replace(':', '_')}.json`), JSON.stringify({ symbol: sym, total_assets_fy_h: row.total_assets_fy_h ?? null, total_revenue_fy_h: row.total_revenue_fy_h ?? null }))
    n += 1
  }
  for (const m of j?.missing ?? []) missing.push(m.symbol ?? m)
}
console.log(`assets written for ${n} symbols; reported missing: ${missing.length ? missing.join(' ') : 'none'}`)
