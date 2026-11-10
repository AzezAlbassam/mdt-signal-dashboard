import fs from 'node:fs'
import { R } from './lib.mjs'
const { snowflake, SNOW_AXES } = await import(`${R}/engine/snowflake.js`)
const { ehsScore, ehsCuts, ehsLetter } = await import(`${R}/engine/ehs.js`)
const Q = JSON.parse(fs.readFileSync(`${R}/test/fixtures/snowflake-quotes.json`)).data
const B = JSON.parse(fs.readFileSync(`${R}/pages/bench.json`))
const st = (s, id) => { const c = SNOW_AXES.flatMap((a) => s.axes[a].checks).find((c) => c.id === id); return `${id}=${c.status}${c.value != null ? '(' + (+c.value.toFixed(3)) + ')' : ''}` }
const line = (label, s, ids) => console.log(label.padEnd(58), ids.map((i) => st(s, i)).join(' '), ` total ${s.total}`)

// 1. No EPS at all (not a loss): P/E checks say "fail", not "na"
line('1. row with no EPS column and no P/E', snowflake({ close: 10, sector: 'X' }, B.us, null), ['V3', 'V4', 'V5'])

// 2. KO as the list row sees it (no h/ doc yet: no dps history) vs opened
const ko = Q['NYSE:KO']; const { dps_common_stock_prim_issue_fy_h, total_assets_fy_h, ...koList } = ko
line('2a. KO opened (dps + assets history)', snowflake(ko, B.us, null), ['D1', 'D3', 'D4', 'P5', 'H3'])
line('2b. KO in the list (h/ doc not loaded)', snowflake(koList, B.us, null), ['D1', 'D3', 'D4', 'P5', 'H3'])

// 3. Profitable company with negative free cash flow (capex): judged on cash runway, not on debt cover
const util = { ...ko, free_cash_flow_ttm: -2e9, cash_n_short_term_invest_fq: 1e9, free_cash_flow_fy_h: [-2e9, -1e9, -1e9, -1.5e9], interst_cover_ttm: 8 }
line('3a. KO as is (FCF>0)', snowflake(ko, B.us, null), ['H5', 'H6'])
line('3b. same, FCF -2B (capex), cash 1B, cover 8x, EPS>0', snowflake(util, B.us, null), ['H5', 'H6'])

// 4. Negative equity + loss: ROE positive -> P4 passes; H4 na
line('4. loss 100M, equity -200M, ROE reported +50', snowflake({ close: 5, earnings_per_share_diluted_ttm: -1, net_income_ttm: -1e8, total_equity_fq: -2e8, return_on_equity: 50, net_debt_fq: 3e8, price_book_fq: -2 }, B.us, null), ['P4', 'H4', 'V6'])

// 5. P3 when EPS 5 years ago was negative and EPS now positive and growing
line('5. EPS -1 five years ago, +3 now, +30% last year', snowflake({ close: 50, earnings_per_share_diluted_ttm: 3, earnings_per_share_diluted_yoy_growth_ttm: 30, earnings_per_share_diluted_fy_h: [3, 2.3, 1.5, 0.5, -0.2, -1] }, B.us, null), ['P2', 'P3'])

// 6. REIT O: D5 on GAAP payout
line('6. O (REIT)', snowflake(Q['NYSE:O'], B.us, null), ['D5', 'D6', 'V3', 'P4'])

// 7. swsGrowth thresholds: true +21% EPS growth
line('7. EPS FY 1.00 -> forecast 1.21 (+21%)', snowflake({ close: 20, earnings_per_share_diluted_ttm: 1, price_earnings_ttm: 20, earnings_per_share_fy: 1, earnings_per_share_forecast_next_fy: 1.21 }, B.us, null), ['F4', 'V5'])
// 8. V5 PEG: GAAP TTM P/E over growth of adjusted EPS;  a one-year rebound
line('8. EPS FY 0.5 -> forecast 2 (rebound), P/E ttm 60', snowflake({ close: 60, earnings_per_share_diluted_ttm: 1, price_earnings_ttm: 60, earnings_per_share_fy: 0.5, earnings_per_share_forecast_next_fy: 2 }, B.us, null), ['V5', 'F4'])
// 9. H6 trend when burn shrinks; and when last FY FCF was positive
line('9. burn: ttm -100, fy [-100,-200,-300,-400], cash 150', snowflake({ free_cash_flow_ttm: -100, cash_n_short_term_invest_fq: 150, free_cash_flow_fy_h: [-100, -200, -300, -400] }, B.us, null), ['H5', 'H6'])
// EHS
const cuts = B.us.ehs
console.log('EHS cuts', JSON.stringify(cuts))
for (const [k, q] of Object.entries(Q)) { const e = ehsScore(q, k.startsWith('TADAWUL') ? B.sa.ehs : cuts); console.log(k, e.total, ehsLetter(e.total, k.startsWith('TADAWUL') ? B.sa.ehs : cuts), JSON.stringify(Object.fromEntries(Object.entries(e.parts).map(([m, p]) => [m, `${p.value?.toFixed(1)}:${p.points}`])))) }
// share of the S&P 500 per letter
const rows = JSON.parse(fs.readFileSync(`${R}/data/bench/2026-11-08-sp500.json`)).rows
const cnt = {}; for (const r of rows) { const l = ehsLetter(ehsScore(r, cuts).total, cuts); cnt[l] = (cnt[l] ?? 0) + 1 }
console.log('S&P 500 letters', cnt, 'n', rows.length)
const neg = rows.filter((r) => !(r.price_earnings_ttm > 0)); console.log('rows with no positive P/E:', neg.length, 'their letters', neg.map((r) => ehsLetter(ehsScore(r, cuts).total, cuts)).join(''))
