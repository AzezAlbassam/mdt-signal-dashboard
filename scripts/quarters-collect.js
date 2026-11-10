// Pulls quarterly get_financial_history (period fq) responses out of session transcripts, so no
// number is copied by hand (as study7-collect.js does for fiscal years).
//   node scripts/quarters-collect.js <outDir> <transcript.jsonl> [more.jsonl ...]
// Writes <outDir>/<SYM>.json; when a symbol was fetched twice, keeps the one with the later last quarter.
import fs from 'node:fs'
import path from 'node:path'

const [outDir, ...files] = process.argv.slice(2)
if (!files.length) throw new Error('usage: quarters-collect.js <outDir> <transcript.jsonl> ...')
fs.mkdirSync(outDir, { recursive: true })
const order = (label) => { const m = /^Q([1-4]) (\d{4})$/.exec(label ?? ''); return m ? Number(m[2]) * 4 + Number(m[1]) : -1 }
const calls = new Map()
const got = {}
const failed = {}
for (const f of files) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.includes('tool_')) continue
    let j
    try { j = JSON.parse(line) } catch { continue }
    for (const c of j?.message?.content ?? []) {
      if (c?.type === 'tool_use' && c.name?.endsWith('get-financial-history') && c.input?.period === 'fq') calls.set(c.id, c.input.symbol)
      if (c?.type !== 'tool_result' || !calls.has(c.tool_use_id)) continue
      const sym = calls.get(c.tool_use_id)
      let text = typeof c.content === 'string' ? c.content : (c.content ?? []).map((x) => x.text ?? '').join('')
      const saved = text.match(/Output has been saved to (\S+\.txt)/)?.[1]
      if (saved && fs.existsSync(saved)) text = fs.readFileSync(saved, 'utf8')
      let p
      try { p = JSON.parse(text) } catch { failed[sym] ??= text.slice(0, 100); continue }
      if (!p.labels?.length) { failed[sym] ??= String(p.error ?? 'no quarters').slice(0, 100); continue }
      if (!got[sym] || order(p.labels.at(-1)) > order(got[sym].labels.at(-1))) got[sym] = { symbol: sym, labels: p.labels, series: p.series }
    }
  }
}
for (const [sym, d] of Object.entries(got)) fs.writeFileSync(path.join(outDir, `${sym.replace(':', '_')}.json`), JSON.stringify(d))
const still = Object.keys(failed).filter((s) => !got[s])
console.log(`quarters written ${Object.keys(got).length}; failed ${still.length}${still.length ? ': ' + still.join(' ') : ''}`)
