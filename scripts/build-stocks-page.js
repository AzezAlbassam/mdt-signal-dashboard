// Builds pages/stocks.html from pages/stocks.template.html by inlining engine/fairvalue.js,
// engine/score.js and the page logic pages/stocks.app.js, so the page computes the score with exactly the tested code. Each
// module runs in its own scope and hands its exports to the page, like an ES module would.
//   node scripts/build-stocks-page.js
import fs from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { barsQuarterAvg } from './shariah/sec-lib.js'

function inline(file) {
  const src = fs.readFileSync(file, 'utf8')
  const names = [...src.matchAll(/^export (?:const|function|async function) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
  const body = src
    .split('\n')
    .filter((l) => !/^import .* from /.test(l))
    .map((l) => l.replace(/^export (const|function|async function)/, '$1'))
    .join('\n')
  return `// ---- ${file}\nconst { ${names.join(', ')} } = (() => {\n${body}\nreturn { ${names.join(', ')} }\n})();\n`
}

const engine = ['engine/fairvalue.js', 'engine/score.js', 'engine/expectations.js', 'engine/projection.js', 'engine/svr.js', 'engine/ranks.js', 'engine/rdcf.js', 'engine/snowflake.js', 'engine/ehs.js', 'engine/shariah.js'].map(inline).join('\n')
// Only the fields the page reads, so the page stays small.
function shariah() {
  const KEEP = ['cik', 'sic', 'sicDescription', 'revenueTag', 'period', 'revenue', 'illicit', 'illicitHigh', 'illicitOpen', 'illicitPublished', 'illicitTag', 'illicitEstimated', 'estimate', 'debt', 'debtHigh', 'debtPartial', 'debtParts', 'debtUpperBound', 'bookEquity', 'shares', 'sharesMV', 'yieldPct', 'newerFiling', 'nonReliance', 'error', 'stale']
  const d = JSON.parse(fs.readFileSync('data/shariah/sec-inputs.json', 'utf8'))
  const stocks = Object.fromEntries(Object.entries(d.stocks).map(([t, r]) => [t, Object.fromEntries(KEEP.filter((k) => r[k] != null).map((k) => [k, r[k]]))]))
  // Each stock's quarter-average close from the daily bars saved in the repo (TradingView 1D, split-adjusted as of their
  // last bar), so the verdict shows without a live price (2026-11-23). Not where a split may fall after the last bar: the
  // share count would be on another basis.
  const files = new Map()
  for (const dir of ['data/us/bars', 'data/study11/bars']) if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) files.set(f.replace(/\.json\.gz$/, '').replace(/^[A-Z]+_/, '').replace(/\./g, '-'), `${dir}/${f}`)
  const avg = {}
  for (const [t, r] of Object.entries(d.stocks)) {
    if (!r.period || !files.has(t)) continue
    const b = JSON.parse(gunzipSync(fs.readFileSync(files.get(t)))), q = barsQuarterAvg(b, r.period.start, r.period.end)
    if (q && !(r.splitRatio && r.splitWindow?.[1] > q.last)) avg[t] = { a: +q.a.toFixed(4), n: q.n, s: r.period.start, e: r.period.end }
  }
  return JSON.stringify({ built: d.built, stocks, avg, sic: JSON.parse(fs.readFileSync('data/shariah/sic-activity.json', 'utf8')) })
}
const page = fs.readFileSync('pages/stocks.template.html', 'utf8').replace('/*ENGINE*/', () => engine).replace('/*APP*/', () => fs.readFileSync('pages/stocks.app.js', 'utf8').replace('/*SECTORS*/null', () => fs.readFileSync('pages/sector-pe.json', 'utf8')).replace('/*PEERS*/null', () => fs.readFileSync('pages/peer-margins.json', 'utf8')).replace('/*BENCH*/null', () => fs.readFileSync('pages/bench.json', 'utf8')).replace('/*SHARIAH*/null', () => shariah()).replace('/*FUNDS*/null', () => (fs.existsSync('data/shariah/funds.json') ? fs.readFileSync('data/shariah/funds.json', 'utf8') : 'null')))
fs.writeFileSync('pages/stocks.html', page)
console.log(`pages/stocks.html: ${page.length} bytes`)
