// data/px/<sym>.json = monthly closes as the page gets them (get-ohlcv interval M, {bars:{t,c}}):
// the monthly answer when one was fetched, else the last daily close of each month (same feed:
// regular session, split-adjusted only), t = the month's first bar. Prints the check of the
// daily-derived closes against a real monthly answer where both exist.
import fs from 'node:fs'
const D = new URL('./data/', import.meta.url).pathname
const mk = (t) => new Date(t * 1000).toISOString().slice(0, 7)
const fromDaily = (b) => { const t = [], c = []; b.t.forEach((x, i) => { if (!t.length || mk(t.at(-1)) !== mk(x)) { t.push(x); c.push(b.c[i]) } else c[c.length - 1] = b.c[i] }); return { t, c } }
const syms = new Set([...fs.readdirSync(D + 'daily'), ...fs.readdirSync(D + 'monthly')])
for (const f of syms) {
  const m = fs.existsSync(D + 'monthly/' + f) ? JSON.parse(fs.readFileSync(D + 'monthly/' + f, 'utf8')).bars : null
  const d = fs.existsSync(D + 'daily/' + f) ? fromDaily(JSON.parse(fs.readFileSync(D + 'daily/' + f, 'utf8')).bars) : null
  let note = ''
  if (m && d) { const dm = new Map(d.t.map((t, i) => [mk(t), d.c[i]])); let n = 0, worst = 0; m.t.forEach((t, i) => { const x = dm.get(mk(t)); if (x != null && i > 0) { n += 1; worst = Math.max(worst, Math.abs(x / m.c[i] - 1)) } }); note = `monthly vs daily-derived: ${n} months, worst diff ${(100 * worst).toFixed(3)}%` }
  const use = m ?? d
  fs.writeFileSync(D + 'px/' + f, JSON.stringify({ bars: { t: use.t, c: use.c }, source: m ? 'monthly' : 'daily-derived' }))
  console.log(f.padEnd(22), m ? 'monthly' : 'daily  ', use.t.length, 'months', mk(use.t[0]), '→', mk(use.t.at(-1)), note)
}
