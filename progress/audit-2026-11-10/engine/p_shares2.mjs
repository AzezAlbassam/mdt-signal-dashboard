// BUG PROBE (engine/fairvalue.js liveContext, lines 119-133): history months take the share count from the twelve months'
// net income ÷ summed quarterly EPS, and only "today" is corrected by sharesNow. Real saved quarters, live path.
// Variant "cleaned": an isolated count (>1.5× away from at least half of its 4 neighbours) is replaced by the nearest good one.
import fs from 'node:fs'
import { R, E, median, load, files } from './lib.mjs'
const pos = (x) => Number.isFinite(x) && x > 0
const near = (a, b) => pos(a) && pos(b) && a > b / 1.5 && a < b * 1.5
function clean(counts) {
  const k = counts.map((c, i) => { if (!pos(c)) return null; const nb = [...counts.slice(Math.max(0, i - 2), i), ...counts.slice(i + 1, i + 3)].filter(pos); return !nb.length || nb.filter((x) => near(c, x)).length >= Math.ceil(nb.length / 2) ? c : null })
  return counts.map((c, i) => { if (k[i] != null || !pos(c)) return k[i]; let best = null; for (let j = 0; j < k.length; j++) if (k[j] != null && (best == null || Math.abs(j - i) < Math.abs(best - i))) best = j; return best == null ? c : k[best] })
}
let n = 0, withSpike = 0; const ch = { ps: [], ev: [], pctps: [] }; const ex = []
const { scoreAt } = await import(`${R}/engine/score.js`)
for (const f of files()) {
  const d = load(f); if (!d || !d.fq || d.month < '2026-09' || d.type !== 'stock') continue
  const funds = E.parseFundamentals(d.fin); const ttm = E.ttmFromQuarters(d.fq); if (ttm.length < 6) continue
  const raw = ttm.map((t) => (t.eps && t.ni && Math.sign(t.eps) === Math.sign(t.ni) ? t.ni / t.eps : null))
  const cc = clean(raw)
  const spikes = raw.filter((c, i) => c != null && cc[i] !== c).length
  n++
  if (!spikes) continue
  withSpike++
  const sharesNow = cc.findLast((x) => x != null)
  const ttm2 = ttm.map((t) => ({ ...t })); ttm2.forEach((t, i) => { if (raw[i] != null && cc[i] !== raw[i]) t.eps = t.ni / cc[i] })
  const la = E.liveContext(funds, ttm, d.month, sharesNow), lb = E.liveContext(funds, ttm2, d.month, sharesNow)
  const a = E.fairValuesAt(funds, d.closes, d.sector, d.month, la), b = E.fairValuesAt(funds, d.closes, d.sector, d.month, lb)
  if (!a || !b) continue
  for (const m of ['ps', 'ev']) if (pos(a.values[m]) && pos(b.values[m])) { const r = a.values[m] / b.values[m] - 1; ch[m].push(r); if (Math.abs(r) > 0.15) ex.push(`${d.sym} ${m} ${a.values[m].toFixed(2)} -> ${b.values[m].toFixed(2)} (${(100 * r).toFixed(0)}%, price ${a.close}, ${spikes} bad of ${ttm.length})`) }
  const sa = scoreAt(funds, d.closes, d.sector, d.month, la), sb = scoreAt(funds, d.closes, d.sector, d.month, lb)
  if (sa.detail?.pct_ps != null && sb.detail?.pct_ps != null) ch.pctps.push(sa.detail.pct_ps - sb.detail.pct_ps)
}
console.log(`stocks with >= 6 twelve-month records: ${n}; with at least one isolated bad count: ${withSpike} (${(100 * withSpike / n).toFixed(0)}%)`)
for (const m of ['ps', 'ev']) { const x = ch[m]; console.log(`  ${m} fair value, raw vs cleaned history counts (today on the same count): n=${x.length}  |diff|>5%: ${x.filter((r) => Math.abs(r) > 0.05).length}  >15%: ${x.filter((r) => Math.abs(r) > 0.15).length}  >30%: ${x.filter((r) => Math.abs(r) > 0.3).length}; median |diff| ${(100 * median(x.map(Math.abs))).toFixed(1)}%`) }
console.log(`  score part A P/S percentile shift: n=${ch.pctps.length}, |shift|>0.05: ${ch.pctps.filter((r) => Math.abs(r) > 0.05).length}`)
console.log(ex.join('\n'))
