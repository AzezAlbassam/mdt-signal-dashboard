// Saves the newest get-symbol-data-batch answer whose columns include <marker> from session
// transcripts, so a test fixture holds TradingView's numbers as returned (none typed by hand).
//   node scripts/fixture-from-transcript.js <marker column> <out.json> <transcript.jsonl> [...]
import fs from 'node:fs'

const [marker, out, ...files] = process.argv.slice(2)
if (!files.length) throw new Error('usage: fixture-from-transcript.js <marker column> <out.json> <transcript.jsonl> ...')
const calls = new Map()
let found = null
for (const f of files) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
  let j
  try { j = JSON.parse(line) } catch { continue }
  for (const c of Array.isArray(j?.message?.content) ? j.message.content : []) {
    if (c?.type === 'tool_use') calls.set(c.id, c)
    if (c?.type !== 'tool_result') continue
    const call = calls.get(c.tool_use_id)
    if (!call?.name?.endsWith('mcp-tv-get-symbol-data-batch') || !call.input?.columns?.includes(marker)) continue
    const text = typeof c.content === 'string' ? c.content : (c.content ?? []).map((x) => x.text ?? '').join('')
    const saved = text.match(/Output has been saved to (\S+\.txt)/)?.[1]
    try { const r = JSON.parse(saved && fs.existsSync(saved) ? fs.readFileSync(saved, 'utf8') : text); if (r?.success) found = { at: j.timestamp ?? null, columns: call.input.columns, data: r.data } } catch {}
  }
}
if (!found) throw new Error(`no batch answer with ${marker}`)
fs.writeFileSync(out, JSON.stringify(found, null, 1))
console.log(`${out}: ${Object.keys(found.data).length} symbols, ${found.columns.length} columns, from ${found.at}`)
