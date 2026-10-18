// Turns collected TradingView responses (raw/fin, raw/px as study7-collect.js writes them) into
// the stock page's `cache/<SYM>` documents plus ArtifactData batch files, so the page opens
// with saved histories instead of fetching every symbol itself.
//   node scripts/seed-cache.js <rawDir> <symbols.json> <outDir>
//   node scripts/seed-cache.js <quartersDir> <symbols.json> <outDir> q   → `q/<SYM>` documents
//     (quarters-collect.js output) for the last-twelve-months view; symbols without one are skipped.
// A symbol without annual fundamentals is saved as { missing: true } (the page shows "no data"
// and asks TradingView again after 14 days, as it does for its own fetches).
import fs from 'node:fs'
import path from 'node:path'

const [rawDir, symbolsFile, outDir] = process.argv.slice(2)
if (!outDir) throw new Error('usage: seed-cache.js <rawDir> <symbols.json> <outDir>')
fs.mkdirSync(path.join(outDir, 'docs'), { recursive: true })
const read = (d, sym) => {
  const f = path.join(rawDir, d, `${sym.replace(':', '_')}.json`)
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null
}
const fetchedAt = Date.now()
const writes = []
let missing = 0
const quarters = process.argv[5] === 'q'
for (const sym of JSON.parse(fs.readFileSync(symbolsFile, 'utf8'))) {
  if (quarters) {
    const f = path.join(rawDir, `${sym.replace(':', '_')}.json`)
    if (!fs.existsSync(f)) continue
    const { labels, series } = JSON.parse(fs.readFileSync(f, 'utf8'))
    const file = path.resolve(outDir, 'docs', `${sym.replace(':', '_')}.json`)
    fs.writeFileSync(file, JSON.stringify({ sym, fq: { labels, series }, fetchedAt }))
    writes.push({ op: 'set', collection: 'q', doc_id: sym, file_path: file })
    continue
  }
  const fin = read('fin', sym)
  const bars = read('px', sym)?.bars
  const doc = fin?.labels
    ? { sym, fin: { labels: fin.labels, series: fin.series }, px: { t: bars?.t ?? [], c: bars?.c ?? [] }, pxTried: true, fetchedAt }
    : { sym, missing: true, fetchedAt }
  if (doc.missing) missing += 1
  const file = path.resolve(outDir, 'docs', `${sym.replace(':', '_')}.json`)
  fs.writeFileSync(file, JSON.stringify(doc))
  writes.push({ op: 'set', collection: 'cache', doc_id: sym, file_path: file })
}
for (let i = 0; i * 40 < writes.length; i += 1) fs.writeFileSync(path.join(outDir, `batch${String(i).padStart(2, '0')}.json`), JSON.stringify(writes.slice(i * 40, i * 40 + 40)))
console.log(`docs ${writes.length} (without fundamentals ${missing}), batches ${Math.ceil(writes.length / 40)}`)
