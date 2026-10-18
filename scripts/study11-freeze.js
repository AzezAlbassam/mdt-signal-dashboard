// Freeze today's HCP projections so they can be scored later against what actually happens
// (PROTOCOL-study11.md §7). This is the only honest test of a forward line: the backtest
// measures projections made at past dates, but nothing stops a model being refit until its
// history looks good. A projection written down before the fact cannot be.
//
//   node scripts/study11-freeze.js → forward-log/hcp-2026-10-17.json
//
// Scoring it later needs no new decision: re-fetch each symbol, line up `proj[h-1]` with the
// close h trading bars after `lastBar`, and compute the same two numbers the study used —
// mean |gap| against a no-change line, and the cross-sectional rank correlation of the
// projected H-bar return against the realised one.
import fs from 'node:fs'
import zlib from 'node:zlib'
import { hcpFit, W, H } from '../engine/hcp.js'

const STAMP = '2026-10-17'
const MIN_BARS = 1250 // §2, same floor as the test
const gz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
const fileFor = (sym) => {
  const n = sym.replace(/[:/]/g, '_')
  for (const p of [`data/study11/bars/${n}.json.gz`, `data/us/bars/${sym.replace(':', '_')}.json.gz`]) {
    if (fs.existsSync(p)) return p
  }
  return null
}

const universe = JSON.parse(fs.readFileSync('data/study11/universe.json', 'utf8')).union
const rows = []
const skipped = []
for (const symbol of universe) {
  const f = fileFor(symbol)
  if (!f) { skipped.push([symbol, 'no bars']); continue }
  const s = gz(f)
  if (s.date.length < MIN_BARS) { skipped.push([symbol, `${s.date.length} bars`]); continue }
  const end = s.date.length - 1
  const fit = hcpFit(s.close, end)
  if (!fit) { skipped.push([symbol, 'no fit']); continue }
  const close = s.close[end]
  const proj = Array.from({ length: H }, (_, i) => Number(fit.at(i + 1).toPrecision(8)))
  rows.push({
    symbol,
    lastBar: s.date[end], // projections are h trading bars AFTER this date
    close,
    line: Number(fit.at(0).toPrecision(8)), // the fitted line on the last bar; not the close
    proj,
    impliedReturn: proj[H - 1] / close - 1,
    periods: fit.periods.map((p) => Number(p.toFixed(1))),
  })
}

fs.mkdirSync('forward-log', { recursive: true })
const out = {
  protocol: 'PROTOCOL-study11.md',
  model: 'HCP', W, K: 3, H,
  frozenAt: STAMP,
  note: 'Written before any of these bars existed. proj[h-1] is the model price h trading bars after lastBar. The line is deliberately not anchored to close (§1.5).',
  scoring: 'For each symbol: gapModel = mean over h of |ln(close(lastBar+h)) - ln(proj[h-1])|; gapFlat = the same against close. Report mean(gapFlat - gapModel) and the cross-sectional Spearman of impliedReturn against the realised H-bar return.',
  symbols: rows.length,
  skipped,
  rows,
}
fs.writeFileSync(`forward-log/hcp-${STAMP}.json`, `${JSON.stringify(out, null, 1)}\n`)

const up = rows.filter((r) => r.impliedReturn > 0).length
console.log(`froze ${rows.length} projections (${skipped.length} skipped) → forward-log/hcp-${STAMP}.json`)
console.log(`last bars ${[...new Set(rows.map((r) => r.lastBar))].sort().join(', ')}`)
console.log(`implied ${H}-bar direction: ${up} up, ${rows.length - up} down`)
