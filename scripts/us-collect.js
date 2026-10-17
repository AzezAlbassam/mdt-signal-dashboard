// Gather saved get_ohlcv responses from Claude Code's tool-results folders into one raw
// directory, named by symbol, so scripts/us-ingest.js can read them.
//   SINCE=<ISO time> node scripts/us-collect.js <rawDir> [searchRoot=/root/.claude/projects]
// Only files written after SINCE count, so a session-old fetch with a still-forming bar is
// never mixed in. Study 2 uses SINCE=2026-10-07T00:15:00Z (after the 2026-10-06 close).
import fs from 'node:fs'
import path from 'node:path'

const [out, root = '/root/.claude/projects'] = process.argv.slice(2)
if (!out) throw new Error('usage: us-collect.js <rawDir> [root]')
fs.mkdirSync(out, { recursive: true })
const since = Date.parse(process.env.SINCE ?? '2026-10-07T00:15:00Z')
let n = 0
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/get-ohlcv-\d+\.txt$/.test(e.name) && fs.statSync(p).mtimeMs > since) {
      try {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'))
        if (j?.bars && j.symbol && j.interval === '1D') {
          // Row format ([{t,o,h,l,c,v}]) is turned into columns so ingest sees one shape.
          if (Array.isArray(j.bars)) j.bars = Object.fromEntries(['t', 'o', 'h', 'l', 'c', 'v'].map((k) => [k, j.bars.map((b) => b[k])]))
          const dst = path.join(out, `${j.symbol.replace(':', '_')}.json`)
          if (!fs.existsSync(dst) || JSON.parse(fs.readFileSync(dst, 'utf8')).bars.t.length < j.bars.t.length) {
            fs.writeFileSync(dst, JSON.stringify(j))
            n += 1
          }
        }
      } catch {}
    }
  }
}
walk(root)
console.log(`collected ${n} new files into ${out}; total ${fs.readdirSync(out).length}`)
