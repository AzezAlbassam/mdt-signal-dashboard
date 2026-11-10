// v28 (audit step 1): what Phase 1's fixes change on the page today. Compares two runs of
// test/pages/measure.cjs on the same db snapshot (the page before and after) and writes every stock whose
// fair value, score or "weak" flag changed, with the methods that moved.
//   node scripts/v28-today.js <before.json> <after.json> [tag] → reports/<tag>-today.txt, reports/v28-today.json,
//   reports/v28-table.html (the change log's table: every stock whose fair value moved more than 0.5%)
import fs from 'node:fs'

const [beforeP, afterP, tag = 'v28'] = process.argv.slice(2) // tag: the version, for the report names and title
if (!afterP) throw new Error('usage: v28-today.js <before.json> <after.json>')
const before = JSON.parse(fs.readFileSync(beforeP, 'utf8')).perStock
const after = JSON.parse(fs.readFileSync(afterP, 'utf8')).perStock
const num = (x) => { const m = /[-+−]?\d+(?:\.\d+)?/.exec(String(x ?? '').replace(/,/g, '').replace('−', '-')); return m ? Number(m[0]) : null }
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
const pct = (x) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`
const SHORT = [['P/E مقارنة', 'P/E'], ['مكرر = النمو', 'Lynch'], ['DCF', 'DCF'], ['EV/EBITDA', 'EV/EBITDA'], ['P/S', 'P/S'], ['P/B', 'P/B'], ['Graham', 'Graham'], ['أرضية الكاش', 'الكاش'], ['P/E على متوسط', 'P/E 5 سنين']]
const shortName = (k) => SHORT.find(([p]) => k.includes(p))?.[1] ?? k
const methods = (p) => Object.fromEntries((p.fair?.methods ?? []).map((m) => [m.name.replace(/ = مكرر [\d.,]+/, ''), num(m.value)])) // v29 adds the Lynch P/E to its name

const rows = Object.keys(after).filter((s) => before[s]).map((s) => {
  const A = before[s]; const B = after[s]
  const a = num(A.fair?.head ?? A.row?.fair); const b = num(B.fair?.head ?? B.row?.fair)
  const ma = methods(A); const mb = methods(B)
  const used = new Set((B.fair?.methods ?? []).concat(A.fair?.methods ?? []).filter((m) => m.weight > 0).map((m) => m.name.replace(/ = مكرر [\d.,]+/, '')))
  const short = Object.keys({ ...ma, ...mb }).filter((k) => used.has(k) && ma[k] !== mb[k] && !(ma[k] > 0 && mb[k] > 0 && Math.abs(mb[k] / ma[k] - 1) < 0.005)).map(shortName)
  const moved = Object.keys({ ...ma, ...mb }).filter((k) => ma[k] !== mb[k] && !(ma[k] > 0 && mb[k] > 0 && Math.abs(mb[k] / ma[k] - 1) < 0.005))
    .map((k) => `${k.split(' (')[0]} ${ma[k] ?? '—'}→${mb[k] ?? '—'}`)
  return { s, fav: !!B.fav, market: B.market, a, b, ch: a > 0 && b > 0 ? b / a - 1 : null,
    sa: num(A.row?.score), sb: num(B.row?.score), wa: !!A.row?.fairWeak, wb: !!B.row?.fairWeak, moved, short: [...new Set(short)] }
})
const changed = rows.filter((r) => (r.ch != null && Math.abs(r.ch) > 0.005) || (r.a > 0) !== (r.b > 0) || r.sa !== r.sb || r.wa !== r.wb)
const L = [`${tag} — the page today before → after (same db snapshot, measure.cjs; audit of 2026-11-10)`, '']
for (const [name, f] of [['Favourites', (r) => r.fav], ['US list', (r) => r.market === 'us'], ['Tadawul list', (r) => r.market === 'sa']]) {
  const g = rows.filter(f)
  const ch = g.filter((r) => r.ch != null)
  const mv = ch.filter((r) => Math.abs(r.ch) > 0.005)
  L.push(`${name}: ${g.length} stocks; fair value changed > 0.5%: ${mv.length} (> 10%: ${ch.filter((r) => Math.abs(r.ch) > 0.1).length}), median |change| ${mv.length ? pct(median(mv.map((r) => Math.abs(r.ch)))) : '–'}; appeared ${g.filter((r) => !(r.a > 0) && r.b > 0).length}, gone ${g.filter((r) => r.a > 0 && !(r.b > 0)).length}; score changed ${g.filter((r) => r.sa !== r.sb).length}; newly weak ${g.filter((r) => !r.wa && r.wb).length}, no longer weak ${g.filter((r) => r.wa && !r.wb).length}`)
}
L.push('', 'Every stock that changed (favourites first, then by size of the fair-value change):', '  stock               fair before → after   change   score   weak   methods that moved')
for (const r of changed.sort((x, y) => (y.fav - x.fav) || Math.abs(y.ch ?? 9) - Math.abs(x.ch ?? 9))) {
  L.push(`  ${r.fav ? '★ ' : '  '}${r.s.padEnd(18)} ${String(r.a ?? '—').padStart(9)} → ${String(r.b ?? '—').padEnd(9)} ${(r.ch == null ? '' : pct(r.ch)).padStart(7)}  ${r.sa ?? '—'}→${r.sb ?? '—'}  ${r.wa === r.wb ? '' : `${r.wa ? 'yes' : 'no'}→${r.wb ? 'yes' : 'no'}`}  ${r.moved.join('; ')}`)
}
fs.writeFileSync(`reports/${tag}-today.txt`, L.join('\n') + '\n')
fs.writeFileSync(`reports/${tag}-today.json`, JSON.stringify(changed.map(({ s, fav, a, b, ch, sa, sb, wa, wb, moved }) => ({ s, fav, a, b, ch, sa, sb, wa, wb, moved }))))
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const tr = (r) => `<tr><th>${r.fav ? '★ ' : ''}<span class="n">${esc(r.s.split(':')[1])}</span></th><td class="n">${r.a}</td><td class="n">${r.b}</td><td class="n" dir="ltr">${pct(r.ch)}</td><td>${r.short.join('، ') || '—'}${r.wa !== r.wb ? (r.wb ? ' · صار ضعيف' : ' · ما عاد ضعيف') : ''}</td></tr>`
const big = rows.filter((r) => r.ch != null && Math.abs(r.ch) > 0.005).sort((x, y) => (y.fav - x.fav) || Math.abs(y.ch) - Math.abs(x.ch))
fs.writeFileSync(`reports/${tag}-table.html`, `<table class="ptable"><thead><tr><th>السهم</th><th>قبل</th><th>بعد</th><th>التغيّر</th><th>الطرق اللي تغيّرت</th></tr></thead><tbody>${big.map(tr).join('')}</tbody></table>`)
console.log(L.slice(0, 6).join('\n'))
console.log(`${changed.length} stocks changed`)
