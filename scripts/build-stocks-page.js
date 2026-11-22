// Builds pages/stocks.html from pages/stocks.template.html by inlining engine/fairvalue.js,
// engine/score.js and the page logic pages/stocks.app.js, so the page computes the score with exactly the tested code. Each
// module runs in its own scope and hands its exports to the page, like an ES module would.
//   node scripts/build-stocks-page.js
import fs from 'node:fs'

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
  const KEEP = ['cik', 'sic', 'sicDescription', 'revenueTag', 'period', 'revenue', 'illicit', 'illicitHigh', 'illicitOpen', 'illicitTag', 'illicitEstimated', 'estimate', 'debt', 'debtHigh', 'debtParts', 'debtUpperBound', 'bookEquity', 'shares', 'sharesMV', 'yieldPct', 'newerFiling', 'error', 'stale']
  const d = JSON.parse(fs.readFileSync('data/shariah/sec-inputs.json', 'utf8'))
  const stocks = Object.fromEntries(Object.entries(d.stocks).map(([t, r]) => [t, Object.fromEntries(KEEP.filter((k) => r[k] != null).map((k) => [k, r[k]]))]))
  return JSON.stringify({ built: d.built, stocks, sic: JSON.parse(fs.readFileSync('data/shariah/sic-activity.json', 'utf8')) })
}
const page = fs.readFileSync('pages/stocks.template.html', 'utf8').replace('/*ENGINE*/', () => engine).replace('/*APP*/', () => fs.readFileSync('pages/stocks.app.js', 'utf8').replace('/*SECTORS*/null', () => fs.readFileSync('pages/sector-pe.json', 'utf8')).replace('/*PEERS*/null', () => fs.readFileSync('pages/peer-margins.json', 'utf8')).replace('/*BENCH*/null', () => fs.readFileSync('pages/bench.json', 'utf8')).replace('/*SHARIAH*/null', () => shariah()).replace('/*FUNDS*/null', () => (fs.existsSync('data/shariah/funds.json') ? fs.readFileSync('data/shariah/funds.json', 'utf8') : 'null')))
fs.writeFileSync('pages/stocks.html', page)
console.log(`pages/stocks.html: ${page.length} bytes`)
