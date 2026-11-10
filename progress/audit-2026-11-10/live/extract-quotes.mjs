import fs from 'node:fs'
const dir = process.argv[2], out = process.argv[3]
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => [f, fs.statSync(dir + '/' + f).mtimeMs]).sort((a, b) => b[1] - a[1]).slice(0, 6)
for (const [f] of files) {
  for (const line of fs.readFileSync(dir + '/' + f, 'utf8').split('\n')) {
    if (!line.includes('Volatility.W') || !line.includes('TADAWUL:1120') || !line.includes('tool_result')) continue
    const j = JSON.parse(line)
    const walk = (x) => {
      if (typeof x === 'string') { if (x.startsWith('{"count":14') && x.includes('Volatility.W')) return x; return null }
      if (x && typeof x === 'object') for (const v of Object.values(x)) { const r = walk(v); if (r) return r }
      return null
    }
    const r = walk(j)
    if (r) { const p = JSON.parse(r); if (p.data['NYSE:O']?.close) { fs.writeFileSync(out, r); console.log('found in', f, Object.keys(p.data).length, Object.keys(p.data['NASDAQ:AAPL']).length); process.exit(0) } }
  }
}
console.log('not found')
