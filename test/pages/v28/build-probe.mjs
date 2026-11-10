// Probe build for the v28 checks: same as scripts/build-stocks-page.js but exposes the page's internals on window.__t.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../')
function inline(file) {
  const src = fs.readFileSync(R + file, 'utf8')
  const names = [...src.matchAll(/^export (?:const|function|async function) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
  const body = src.split('\n').filter((l) => !/^import .* from /.test(l)).map((l) => l.replace(/^export (const|function|async function)/, '$1')).join('\n')
  return `// ---- ${file}\nconst { ${names.join(', ')} } = (() => {\n${body}\nreturn { ${names.join(', ')} }\n})();\n`
}
const engine = ['engine/fairvalue.js', 'engine/score.js', 'engine/expectations.js', 'engine/projection.js', 'engine/svr.js', 'engine/ranks.js', 'engine/rdcf.js', 'engine/snowflake.js', 'engine/ehs.js'].map(inline).join('\n')
let app = fs.readFileSync(R + 'pages/stocks.app.js', 'utf8')
const expose = `window.__t = { state, compute, fyDue, fqDue, fundsDue, pxDue, peNow, peg, pegCell, upside, weakFair, detail, quarters, snowflake, loadFunds, loadPx, loadGuide, loadElog, loadHist, refresh, render, failedAt, saved, histFromBatch, liveFairValues, analysts, earnBlock, expCell, svrBlock, fairBlock, visible, get cacheRead() { return cacheRead }, get cacheOk() { return cacheOk } }\n  boot()\n})()`
if (!app.includes('  boot()\n})()')) throw new Error('anchor not found')
app = app.replace('  boot()\n})()', () => expose)
app = app.replace('/*SECTORS*/null', () => fs.readFileSync(R + 'pages/sector-pe.json', 'utf8')).replace('/*PEERS*/null', () => fs.readFileSync(R + 'pages/peer-margins.json', 'utf8')).replace('/*BENCH*/null', () => fs.readFileSync(R + 'pages/bench.json', 'utf8'))
const page = fs.readFileSync(R + 'pages/stocks.template.html', 'utf8').replace('/*ENGINE*/', () => engine).replace('/*APP*/', () => app)
fs.writeFileSync(path.join(os.tmpdir(), 'stocks-v28-probe.html'), `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${page}</body></html>`)

