// scoreAt part E with a liveContext that has no year-ago twelve months (fewer than 8 saved quarters): f0 = twelve months to
// Q3 2026, f1 falls back to known[-2] = FY2024, not to the last fiscal year or to "no comparison".
import { E, SC } from './lib.mjs'
// a company whose revenue, EPS and margins FELL from FY2025 to the last twelve months but are above FY2024
const fy = (year, rev, eps) => ({ year, rev, eps, ni: eps * 100, fcf: eps * 90, ebitda: rev * 0.2 * (eps / 1), debt: 50, shares: 100, gp: rev * 0.4 * eps })
const funds = [fy(2021, 80, 0.8), fy(2022, 90, 0.9), fy(2023, 95, 0.95), fy(2024, 100, 1.0), fy(2025, 160, 1.6)]
const q = (label, rev, eps) => ({ label, rev, eps })
const labels = ['Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026']
const resp = { labels, series: { revenue: [35, 32, 30, 28].map((v) => ({ value: v })), eps: [0.35, 0.3, 0.28, 0.25].map((v) => ({ value: v })), net_income: [35, 30, 28, 25].map((v) => ({ value: v })), fcf: [30, 27, 25, 22].map((v) => ({ value: v })), ebitda: [9, 8, 7, 6].map((v) => ({ value: v })), gross_profit: [20, 17, 15, 13].map((v) => ({ value: v })), total_debt: [50, 50, 50, 50].map((v) => ({ value: v })) } }
const ttm = E.ttmFromQuarters(resp)
const closes = new Map(); for (let k = 0; k < 70; k++) closes.set(E.addMonths('2026-11', -k), 20)
const live = E.liveContext(funds, ttm, '2026-11', 100)
const s = SC.scoreAt(funds, closes, 'Retail Trade', '2026-11', live)
console.log('twelve months: rev', ttm.at(-1).rev, 'eps', ttm.at(-1).eps.toFixed(2), '| FY2025 rev 160 eps 1.60 | FY2024 rev 100 eps 1.00 | prev twelve months:', ttm.at(-1).prev)
console.log('part E:', s.parts.E.toFixed(2), `(${s.detail.passed} of ${s.detail.checks} checks pass) — revenue and EPS are down 22% and 26% on the last fiscal year, yet "rising" against FY2024`)
