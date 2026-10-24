// Turns idea search results (JSON arrays from the search agents) into one file per idea plus
// ArtifactData batch files for the stock page's `ideas` collection.
//   node scripts/ideas-prepare.js <outDir> <results.json> [more.json ...]
// Drops entries without a valid id, symbol or https URL on the expected domain; keeps the
// first of any duplicate id; never fills in a missing date or price.
import fs from 'node:fs'
import path from 'node:path'

const [outDir, ...inputs] = process.argv.slice(2)
if (!outDir || !inputs.length) throw new Error('usage: ideas-prepare.js <outDir> <results.json> ...')
fs.mkdirSync(path.join(outDir, 'docs'), { recursive: true })

const DOMAIN = { VIC: /^https:\/\/(www\.)?valueinvestorsclub\.com\/idea\//, Reddit: /^https:\/\/(www\.|old\.)?reddit\.com\// }
const seen = new Map()
const dropped = []
for (const f of inputs) {
  for (const e of JSON.parse(fs.readFileSync(f, 'utf8'))) {
    const ok = typeof e.id === 'string' && /^(vic|rd)-[A-Za-z0-9_]+$/.test(e.id)
      && typeof e.sym === 'string' && /^[A-Z]+:[A-Z0-9.]+$/.test(e.sym)
      && DOMAIN[e.source]?.test(e.url ?? '')
    if (!ok) { dropped.push(`${e.id ?? '?'} ${e.sym ?? '?'} ${e.url ?? '?'}`); continue }
    if (seen.has(e.id)) continue
    const date = typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null
    seen.set(e.id, {
      sym: e.sym, source: e.source, title: String(e.title ?? '').slice(0, 200), url: e.url, date,
      priceThen: Number.isFinite(e.priceThen) && e.priceThen > 0 ? e.priceThen : null,
      side: e.side === 'long' || e.side === 'short' ? e.side : null,
      summary: String(e.summary ?? '').slice(0, 400), foundAt: new Date().toISOString().slice(0, 10),
    })
  }
}
const writes = []
for (const [id, doc] of seen) {
  const file = path.resolve(outDir, 'docs', `${id}.json`)
  fs.writeFileSync(file, JSON.stringify(doc))
  writes.push({ op: 'set', collection: 'ideas', doc_id: id, file_path: file })
}
for (let i = 0; i * 50 < writes.length; i += 1) fs.writeFileSync(path.join(outDir, `batch${String(i).padStart(2, '0')}.json`), JSON.stringify(writes.slice(i * 50, i * 50 + 50)))
const by = {}
for (const d of seen.values()) by[d.source] = (by[d.source] ?? 0) + 1
console.log(`ideas: ${seen.size} (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}), with date ${[...seen.values()].filter((d) => d.date).length}, batches ${Math.ceil(writes.length / 50)}; dropped ${dropped.length}`)
for (const d of dropped) console.log('  dropped:', d)
