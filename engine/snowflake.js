// The snowflake: Simply Wall St's 30 published checks (github.com/SimplyWallSt/company-analysis-model,
// MODEL.markdown, CC BY-NC-SA 4.0) on TradingView's columns. progress/REDESIGN-PLAN.md §1.1 lists
// each check and how ours differs. A check is 'pass', 'fail' or 'na' (no data); 'na' never counts
// as a fail, and each axis reports how many of its checks could be judged.
//
// q: a TradingView row (quote columns plus *_fy_h / *_fq_h histories, newest first).
// b: benchmarks for q's market (pages/bench.json): { pe, eg, rg, yP25, yP75, savings,
//    industries: { [industry]: { pe, pb, eg1, roa } } }.
// fair: the page's fair value (null when it has none).

export const SNOW_AXES = ['value', 'future', 'past', 'health', 'dividend']
const BANKS = ['Major Banks', 'Regional Banks', 'Savings Banks']
const fin = Number.isFinite
const pos = (x) => fin(x) && x > 0

/** Growth between two values as SWS measures it: change ÷ the mean of their absolute values (works across a loss). */
export const swsGrowth = (from, to) => (fin(from) && fin(to) && (Math.abs(from) + Math.abs(to)) > 0 ? (to - from) / ((Math.abs(from) + Math.abs(to)) / 2) : null)

export function snowflake(q, b = {}, fair = null) {
  const out = []
  const add = (axis, id, ok, value = null, approx = false) => out.push({ axis, id, status: ok == null ? 'na' : ok ? 'pass' : 'fail', value: fin(value) ? value : null, approx })
  const ind = b.industries?.[q.industry] ?? {}
  const bank = q.sector === 'Finance' && BANKS.includes(q.industry)
  const reit = q.industry === 'Real Estate Investment Trusts'
  const close = q.close
  const pe = q.price_earnings_ttm
  const lossMaker = !(q.earnings_per_share_diluted_ttm > 0)
  // P/E checks fail for a loss-maker (SWS: "less than … but still greater than 0"); no P/E for another reason is no data.
  const peBelow = (ref) => (lossMaker ? false : pos(pe) && pos(ref) ? pe < ref : null)

  // ---- Value
  add('value', 'V1', pos(fair) && pos(close) ? close <= 0.8 * fair : null, pos(fair) ? close / fair - 1 : null, true)
  add('value', 'V2', pos(fair) && pos(close) ? close <= 0.6 * fair : null, pos(fair) ? close / fair - 1 : null, true)
  add('value', 'V3', peBelow(b.pe), pe)
  add('value', 'V4', peBelow(ind.pe), pe)
  const epsFY = q.earnings_per_share_fy
  const epsF = q.earnings_per_share_forecast_next_fy
  const gE = swsGrowth(epsFY, epsF)
  const peg = pos(pe) && gE > 0 ? pe / (100 * gE) : null
  add('value', 'V5', lossMaker ? false : gE == null || !pos(pe) ? null : peg != null && peg < 1, peg, true)
  const pb = q.price_book_fq
  add('value', 'V6', fin(pb) && pos(ind.pb) ? pb > 0 && pb < ind.pb : null, pb)

  // ---- Future (next fiscal year only; SWS uses 1–3 years)
  const gR = bank ? null : swsGrowth(q.total_revenue_fy, q.revenue_forecast_next_fy)
  add('future', 'F1', gE == null ? null : epsFY > 0 ? gE > (b.savings ?? 0.045) : epsF > 0, gE, true)
  add('future', 'F2', gE == null || !fin(b.eg) ? null : gE > b.eg, gE, true)
  add('future', 'F3', gR == null || !fin(b.rg) ? null : gR > b.rg, gR, true)
  add('future', 'F4', gE == null ? null : gE > 0.2, gE, true)
  add('future', 'F5', gR == null ? null : gR > 0.2, gR, true)
  const roeF = fin(epsF) && pos(pb) && pos(close) ? epsF / (close / pb) : null
  add('future', 'F6', roeF == null ? null : roeF > 0.2, roeF, true)

  // ---- Past
  const g1 = fin(q.earnings_per_share_diluted_yoy_growth_ttm) ? q.earnings_per_share_diluted_yoy_growth_ttm / 100 : null
  add('past', 'P1', g1 == null || !fin(ind.eg1) ? null : g1 > ind.eg1, g1)
  const eh = q.earnings_per_share_diluted_fy_h ?? []
  add('past', 'P2', fin(eh[0]) && fin(eh[5]) ? eh[0] > eh[5] : null, fin(eh[0]) && fin(eh[5]) ? swsGrowth(eh[5], eh[0]) : null)
  const g5 = pos(eh[0]) && pos(eh[5]) ? (eh[0] / eh[5]) ** (1 / 5) - 1 : null
  add('past', 'P3', g1 == null || !fin(eh[5]) ? null : g5 != null && g1 > g5, g5)
  add('past', 'P4', fin(q.return_on_equity) ? q.return_on_equity > 20 : null, q.return_on_equity)
  const eb = q.ebitda_fy_h ?? []
  const ta = q.total_assets_fy_h ?? []
  add('past', 'P5', fin(eb[0]) && fin(eb[3]) && pos(ta[0]) && pos(ta[3]) ? eb[0] / ta[0] > eb[3] / ta[3] : null, fin(eb[0]) && pos(ta[0]) ? eb[0] / ta[0] : null, true)
  add('past', 'P6', fin(q.return_on_assets) && fin(ind.roa) ? q.return_on_assets > ind.roa : null, q.return_on_assets)

  // ---- Health
  if (bank) {
    // Only leverage is possible: TradingView has no loans, deposits or bad-loan lines (B2–B6).
    add('health', 'B1', fin(q.total_assets_to_equity_fq) ? q.total_assets_to_equity_fq <= 20 : null, q.total_assets_to_equity_fq)
    for (const id of ['B2', 'B3', 'B4', 'B5', 'B6']) add('health', id, null)
  } else {
    const ca = q.total_current_assets_fq
    const cl = q.total_current_liabilities_fq
    add('health', 'H1', fin(ca) && fin(cl) ? ca > cl : fin(q.current_ratio_fq) ? q.current_ratio_fq > 1 : null, fin(ca) && pos(cl) ? ca / cl : q.current_ratio_fq)
    const ltl = fin(q.total_liabilities_fq) && fin(cl) ? q.total_liabilities_fq - cl : null
    add('health', 'H2', fin(ca) && fin(ltl) ? ca > ltl : null, fin(ca) && pos(ltl) ? ca / ltl : null)
    const dh = q.total_debt_fy_h ?? []
    const da = (i) => (fin(dh[i]) && pos(ta[i]) ? dh[i] / ta[i] : null)
    add('health', 'H3', da(0) != null && da(5) != null ? da(0) <= da(5) : null, da(0), true)
    const eq = q.total_equity_fq
    const nde = fin(q.net_debt_fq) && pos(eq) ? q.net_debt_fq / eq : null
    add('health', 'H4', nde == null ? (fin(q.net_debt_fq) && q.net_debt_fq <= 0 ? true : null) : nde < 0.4, nde)
    const fcf = q.free_cash_flow_ttm
    const cash = q.cash_n_short_term_invest_fq
    if (fin(fcf) && fcf < 0) {
      // Loss-makers: cash runway at today's burn, and at the burn's own 3-year trend.
      const runway = fin(cash) ? cash / -fcf : null
      add('health', 'H5', runway == null ? null : runway > 1, runway)
      const fh = q.free_cash_flow_fy_h ?? []
      const trend = fh[0] < 0 && fh[3] < 0 ? (fh[0] / fh[3]) ** (1 / 3) : null
      const runway2 = fin(cash) && trend != null ? cash / (-fcf * trend) : null
      add('health', 'H6', runway2 == null ? null : runway2 > 1, runway2)
    } else {
      const debt = q.total_debt_fq
      const ocf = q.cash_f_operating_activities_ttm
      add('health', 'H5', fin(debt) && debt <= 0 ? true : pos(debt) && fin(ocf) ? ocf > 0.2 * debt : null, pos(debt) && fin(ocf) ? ocf / debt : null)
      const rate = q.effective_interest_rate_on_debt_ttm
      const cover = fin(q.interst_cover_ttm) ? q.interst_cover_ttm
        : pos(debt) && pos(rate) && fin(q.oper_income_ttm) ? q.oper_income_ttm / (rate / 100 * debt) : null
      add('health', 'H6', fin(debt) && debt <= 0 ? true : cover == null ? null : cover > 5, cover)
    }
  }

  // ---- Dividend
  const y = q.dividends_yield
  const payer = pos(y)
  add('dividend', 'D1', !payer ? false : fin(b.yP25) ? y > b.yP25 : null, y)
  add('dividend', 'D2', !payer ? false : fin(b.yP75) ? y > b.yP75 : null, y)
  const notable = out.at(-2).status === 'pass'
  const dps = q.dps_common_stock_prim_issue_fy_h ?? []
  const ten = dps.slice(0, 11)
  const paid10 = ten.length >= 11 && ten.every(pos)
  const drop = paid10 && ten.slice(0, 10).some((x, i) => x < 0.9 * ten[i + 1])
  // SWS: without a notable dividend, stability and growth fail by default.
  add('dividend', 'D3', notable ? paid10 && !drop : false)
  add('dividend', 'D4', notable ? paid10 && dps[0] > dps[10] : false, paid10 ? swsGrowth(dps[10], dps[0]) : null)
  const limit = reit ? 100 : 90
  const payout = q.dividend_payout_ratio_ttm > 0 ? q.dividend_payout_ratio_ttm : q.dividend_payout_ratio_fy
  add('dividend', 'D5', !payer ? false : fin(payout) ? payout > 0 && payout < limit : null, payout)
  const payoutF = payer && pos(close) && fin(epsF) ? (y / 100 * close) / epsF * 100 : null
  add('dividend', 'D6', !payer ? false : payoutF == null ? null : payoutF > 0 && payoutF < limit, payoutF, true)

  const axes = Object.fromEntries(SNOW_AXES.map((a) => {
    const cs = out.filter((c) => c.axis === a)
    return [a, { score: cs.filter((c) => c.status === 'pass').length, judged: cs.filter((c) => c.status !== 'na').length, checks: cs }]
  }))
  const total = SNOW_AXES.reduce((s, a) => s + axes[a].score, 0)
  return { axes, total, bank, reit, growth: { eps: gE, revenue: gR, eps5y: g5 } }
}

/** The snowflake's colour: red (0 of 30) → green (30 of 30), as SWS colours it. */
export const snowColor = (total) => `hsl(${Math.round(120 * Math.max(0, Math.min(30, total)) / 30)} 70% 48%)`
