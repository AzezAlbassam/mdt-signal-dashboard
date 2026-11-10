// Saves every get-ohlcv answer found in this agent's transcript (inline) or in tool-results files.
import fs from 'node:fs'
const base = '/root/.claude/projects/-home-user-mdt-signal-dashboard/54968d20-8dbc-546c-8282-8a92848f6362/'
const out = new URL('./data/', import.meta.url).pathname
const take = (s) => { try { const p = JSON.parse(s); if (p?.success && p.bars?.t && p.symbol) { const dir = p.interval === 'M' ? 'monthly' : 'daily'; fs.writeFileSync(`${out}${dir}/${p.symbol.replace(':', '_')}.json`, s); return `${p.symbol} ${p.interval} ${p.bars.t.length}` } } catch {} return null }
const got = []
for (const line of fs.readFileSync(base + 'subagents/agent-a709d7a7427102c26.jsonl', 'utf8').split('\n')) {
  if (!line.includes('bars')) continue
  const walk = (x) => { if (typeof x === 'string') { if (x.startsWith('{"bars"')) { const r = take(x); if (r) got.push(r) } } else if (x && typeof x === 'object') Object.values(x).forEach(walk) }
  try { walk(JSON.parse(line)) } catch {}
}
for (const f of fs.readdirSync(base + 'tool-results')) if (f.includes('ohlcv') && fs.statSync(base + 'tool-results/' + f).mtimeMs > Date.now() - 3 * 3600e3) { const r = take(fs.readFileSync(base + 'tool-results/' + f, 'utf8')); if (r) got.push(r + ' (file)') }
console.log([...new Set(got)].join('\n'))
