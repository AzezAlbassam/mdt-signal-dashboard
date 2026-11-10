// liveShift (engine/fairvalue.js:46) moves every history month by a whole fiscal year whenever today's last fiscal year is
// ahead of the "May of Y+1" rule. For a December fiscal year that is Feb–Apr of every year: the history month 2024-06 then
// reads FY2024, which ended six months later. Same data, same price, April 2026 against May 2026.
import { E, load, files, median } from './lib.mjs'
const out = { pe: [], ps: [], ev: [], pen: [], fair: [] }; const ex = []
let n = 0
for (const f of files()) {
  const d = load(f); if (!d || d.month < '2026-09' || d.type !== 'stock') continue
  const funds = E.parseFundamentals(d.fin).filter((x) => x.year <= 2025); if (funds.at(-1)?.year !== 2025) continue
  // quarters as they stood in April 2026: up to the quarter ending December 2025
  const ttmAll = d.fq ? E.ttmFromQuarters(d.fq) : []
  const ttm = ttmAll.filter((t) => t.n <= 2025 * 4 + 4); if (!ttm.length || ttm.at(-1).n !== 2025 * 4 + 4) continue
  const c = d.closes.get('2026-04'); if (!c) continue
  const closes = new Map([...d.closes].filter(([m]) => m <= '2026-04')); 
  const A = E.fairValuesAt(funds, closes, d.sector, '2026-04', E.liveContext(funds, ttm, '2026-04', null))
  // one month later, nothing new reported, same price
  const closesB = new Map([...closes].map(([m, v]) => [E.addMonths(m, 1), v])) // the whole price history one month later: only the fiscal-year rule differs
  const B = E.fairValuesAt(funds, closesB, d.sector, '2026-05', E.liveContext(funds, ttm, '2026-05', null))
  if (!A || !B || A.profile !== B.profile) continue
  n++
  for (const m of ['pe', 'ps', 'ev', 'pen']) if (A.values[m] > 0 && B.values[m] > 0) out[m].push(A.values[m] / B.values[m] - 1)
  const w = E.WEIGHTS[A.profile].map((x, i) => (E.METHODS[i] === 'graham' ? 0 : x))
  const a = E.blendTrimmed(A.values, w), b = E.blendTrimmed(B.values, w)
  if (a && b) { out.fair.push(a.fair / b.fair - 1); if (Math.abs(a.fair / b.fair - 1) > 0.2) ex.push(`${d.sym} ${A.profile}: April ${a.fair.toFixed(2)} May ${b.fair.toFixed(2)} (price ${c})`) }
}
console.log('stocks (FY2025 = last year, quarters to Q4 2025):', n, ' liveShift April:', E.liveShift([{ year: 2025 }], '2026-04'), 'May:', E.liveShift([{ year: 2025 }], '2026-05'))
for (const [m, x] of Object.entries(out)) console.log(`  ${m.padEnd(4)} n=${x.length} median April÷May−1 ${(100 * median(x)).toFixed(1)}%  |diff|>5%: ${x.filter((r) => Math.abs(r) > 0.05).length}  >10%: ${x.filter((r) => Math.abs(r) > 0.1).length}  >20%: ${x.filter((r) => Math.abs(r) > 0.2).length}`)
console.log(ex.slice(0, 12).join('\n'))
// which fiscal year each history month reads, a December-year company seen in April 2026 and in May 2026
const funds = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y) => ({ year: y, eps: 1, rev: 1, shares: 1 }))
for (const now of ['2026-04', '2026-05']) { const S = E.liveContext(funds, null, now).state; console.log(now, ['2023-06', '2023-12', '2024-03', '2024-06', '2025-01'].map((m) => `${m}→FY${S(m).fiscalYear}`).join('  ')) }
