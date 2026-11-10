// A 10-for-1 split between two quarterly reports: TradingView's prices come back adjusted (the page refetches them: pxDue's
// 52-week test), the saved fiscal years and quarters keep the old EPS until the quote shows a newer period (fundsDue has no
// split test). Real NVDA files; "after" = closes ÷ 10, today's count × 10, saved fundamentals untouched.
import { E, SC, load } from './lib.mjs'
const d = load('NASDAQ_NVDA.json'); const funds = E.parseFundamentals(d.fin); const ttm = E.ttmFromQuarters(d.fq)
const sharesNow = ttm.at(-1).ni / ttm.at(-1).eps
const run = (closes, shares) => { const live = E.liveContext(funds, ttm, d.month, shares); return [E.fairValuesAt(funds, closes, d.sector, d.month, live), SC.scoreAt(funds, closes, d.sector, d.month, live)] }
const [a, sa] = run(d.closes, sharesNow)
const split = new Map([...d.closes].map(([m, c]) => [m, c / 10]))
const [b, sb] = run(split, sharesNow * 10)
const f = (x) => (x == null ? '—' : x.toFixed(2))
console.log(`before: price ${a.close}  pe ${f(a.values.pe)} ps ${f(a.values.ps)} ev ${f(a.values.ev)} pen ${f(a.values.pen)} dcf ${f(a.values.dcf)}  score A ${sa.parts?.A?.toFixed(2)}`)
console.log(`after : price ${b.close}  pe ${f(b.values.pe)} ps ${f(b.values.ps)} ev ${f(b.values.ev)} pen ${f(b.values.pen)} dcf ${f(b.values.dcf)}  score A ${sb.parts?.A?.toFixed(2)}`)
console.log(`expected after: every value ÷ 10 (pe ${f(a.values.pe / 10)}, ps ${f(a.values.ps / 10)}, ev ${f(a.values.ev / 10)}); got ÷ ${(a.values.pe / b.values.pe).toFixed(0)}, ÷ ${(a.values.ps / b.values.ps).toFixed(0)}, ÷ ${(a.values.ev / b.values.ev).toFixed(0)}`)
