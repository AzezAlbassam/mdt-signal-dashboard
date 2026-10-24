// Study 16 §6 "The page today" (descriptive, no later prices): how the applied options change
// today's fair values. Compares two runs of test/pages/measure.cjs on the same db snapshot, the page
// before and after the change, and lists the snapshot's file hashes so the input can be checked.
//   node scripts/study16-today.js <before.json> <after.json> <snapDir> → reports/study16-today.txt, reports/study16-today-snap.sha256
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const [beforeP, afterP, snapDir] = process.argv.slice(2)
if (!snapDir) throw new Error('usage: study16-today.js <before.json> <after.json> <snapDir>')
const before = JSON.parse(fs.readFileSync(beforeP, 'utf8')).perStock
const after = JSON.parse(fs.readFileSync(afterP, 'utf8')).perStock
const num = (x) => { const m = /[-+−]?\d+(?:\.\d+)?/.exec(String(x ?? '').replace(/,/g, '').replace('−', '-')); return m ? Number(m[0]) : null }
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
const pct = (x) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`

const rows = Object.keys(after).filter((s) => before[s]).map((s) => {
  const a = num(before[s].fair?.head ?? before[s].row?.fair)
  const b = num(after[s].fair?.head ?? after[s].row?.fair)
  const dropped = (after[s].fair?.methods ?? []).filter((m) => m.weight > 0 && !m.used && num(m.value) != null).map((m) => m.name)
  return { s, fav: !!after[s].fav, market: after[s].market, a, b, ch: a > 0 && b > 0 ? b / a - 1 : null, dropped }
})
const L = ['Study 16 — the page today (PROTOCOL-study16.md §6): fair value before → after the applied option (D2 C)', '']
for (const [name, f] of [['Favourites', (r) => r.fav], ['US list', (r) => r.market === 'us'], ['Tadawul list', (r) => r.market === 'sa']]) {
  const g = rows.filter(f)
  const ch = g.filter((r) => r.ch != null)
  const moved = ch.filter((r) => Math.abs(r.ch) > 0.005)
  L.push(`${name}: ${g.length} stocks, ${ch.length} with a fair value both times; changed > 0.5%: ${moved.length}, > 10%: ${ch.filter((r) => Math.abs(r.ch) > 0.1).length}; median |change| of those changed ${moved.length ? pct(median(moved.map((r) => Math.abs(r.ch)))) : '–'}, largest ${moved.length ? pct(Math.max(...moved.map((r) => Math.abs(r.ch)))) : '–'}; value appeared ${g.filter((r) => !(r.a > 0) && r.b > 0).length}, gone ${g.filter((r) => r.a > 0 && !(r.b > 0)).length}`)
}
L.push('', 'Stocks whose fair value moved more than 10% (favourites first, then by size):')
for (const r of rows.filter((x) => x.ch != null && Math.abs(x.ch) > 0.1).sort((x, y) => (y.fav - x.fav) || Math.abs(y.ch) - Math.abs(x.ch))) {
  L.push(`  ${r.fav ? '★ ' : '  '}${r.s.padEnd(18)} ${String(r.a).padStart(10)} → ${String(r.b).padEnd(10)} ${pct(r.ch).padStart(8)}  dropped: ${r.dropped.join(', ') || '–'}`)
}
L.push('', `Snapshot ${snapDir} (sha256 of each file):`)
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const files = walk(snapDir).sort()
const lines = files.map((f) => `${crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}  ${path.relative(snapDir, f)}`)
fs.writeFileSync('reports/study16-today-snap.sha256', lines.join('\n') + '\n') // sha256sum -c format
L.push(`  ${files.length} files, listed in reports/study16-today-snap.sha256; sha256 of that list: ${crypto.createHash('sha256').update(lines.join('\n') + '\n').digest('hex')}`)
fs.writeFileSync('reports/study16-today.txt', L.join('\n') + '\n')
console.log(L.join('\n'))
