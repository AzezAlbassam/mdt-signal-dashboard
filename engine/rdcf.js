// Revenue-driven DCF for loss-making companies (POST-HOC display, 2026-10-21; not tested, so it is
// shown beside the P/S method and never blended into the fair value). Damodaran's layout for young
// companies ("Valuing Young, Start-up and Growth Companies"): revenue from analysts' forecast, an
// operating margin moving to that of the industry's profitable large companies, reinvestment
// from revenue growth ÷ sales-to-capital, taxes only after the carried-forward losses, a CAPM
// rate falling to a mature one, a no-excess-return terminal value and a probability of failure.
// Designed by two independent drafts and a judge (scratchpad wf1/judge/final.mjs); TradingView
// quote columns only.

const RF = 0.045 // 10-year Treasury, as the page's liveDcf
const ERP = 0.042 // Damodaran's implied equity risk premium, July 2026
const TAX = 0.25
const N = 10
const CONV = 7 // years for today's dollar shortfall against the target margin to close
const GT = 0.025 // terminal growth, PARAMS.termGrowth
const G_CAP = 0.3
const S2C = 1.5 // dollars of extra revenue per dollar of reinvestment
const R_MIN = 0.09
const R_MAX = 0.13
const RT = RF + ERP // a mature company's rate by year 10
const M_DEFAULT = 0.1
const YR = 365.25 * 86400
const fin = Number.isFinite
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

/** Losses carried forward: TradingView's fiscal-year net incomes (newest first), losses adding and profits using them up. */
export const nolFrom = (ni = []) => [...ni].reverse().reduce((n, x) => (fin(x) ? Math.max(0, n - x) : n), 0)

/** Target operating margin from pages/peer-margins.json: the industry's (≥ 5 companies), else the sector's, else 10%. */
export function targetMargin(q, peers) {
  const i = peers?.industries?.[q?.industry]
  if (i) return { m: i.m, n: i.n, from: 'industry', key: q.industry }
  const s = peers?.sectors?.[q?.sector]
  return s ? { m: s.m, n: s.n, from: 'sector', key: q.sector } : { m: M_DEFAULT, n: 0, from: 'default', key: null }
}

/**
 * Value per share for quote q (TradingView columns; total_revenue_fy_h and net_income_fy_h newest
 * first). o: { shares, now (unix seconds), peers, and overrides m, G, s2c, r0, pFail, nol }.
 * Returns { why } when the method does not apply, else { value (≥ 0), raw, m, G, r0, pFail, runway,
 * gap (cash to raise before cash flow turns positive), dilution (gap ÷ market value), … }.
 */
export function rdcf(q, o = {}) {
  const R0 = q.total_revenue_ttm
  const FY = q.total_revenue_fy
  const mcap = q.market_cap_basic
  const shares = o.shares ?? (mcap > 0 && q.close > 0 ? mcap / q.close : null)
  if (q.sector === 'Finance') return { why: 'شركة مالية: إيرادها فوائد وتدفقها يتحرك مع الودائع.' }
  if (q.industry === 'Biotechnology') return { why: 'تقنية حيوية: قيمتها في الأدوية تحت التطوير، مو في إيرادها اليوم.' }
  if (!(R0 > 0) || (mcap > 0 && R0 < 0.01 * mcap)) return { why: 'إيراداتها أقل من 1% من قيمتها السوقية، فما فيه مبيعات ننطلق منها.' }
  const h = q.total_revenue_fy_h
  const cagr = h?.[3] > 0 && h[0] > 0 ? (h[0] / h[3]) ** (1 / 3) - 1 : null
  const F = q.revenue_forecast_next_fy > 0 ? q.revenue_forecast_next_fy : FY > 0 && cagr != null ? FY * (1 + cagr) : null
  const ebit0 = fin(q.oper_income_ttm) ? q.oper_income_ttm : q.net_income_ttm
  const nd = fin(q.net_debt_fq) ? q.net_debt_fq : fin(q.total_debt_fq) || fin(q.cash_n_short_term_invest_fq) ? (q.total_debt_fq ?? 0) - (q.cash_n_short_term_invest_fq ?? 0) : null
  if (F == null || !(FY > 0) || !fin(ebit0) || nd == null || !(shares > 0)) return { why: 'ناقص: توقع الإيراد أو الربح التشغيلي أو الميزانية أو عدد الأسهم.' }
  const tm = targetMargin(q, o.peers)
  const m = o.m ?? tm.m
  const s2c = o.s2c ?? S2C
  const G = o.G ?? clamp(F / FY - 1, GT, G_CAP)
  const beta = fin(q.beta_5_year) ? q.beta_5_year : q.beta
  const r0 = o.r0 ?? (fin(beta) ? clamp(RF + beta * ERP, R_MIN, R_MAX) : R_MAX)
  // Year 1 is what is left of the fiscal year in progress after the last balance sheet (the rest
  // is already in the reported cash), discounted from today.
  const now = o.now ?? Date.now() / 1000
  const fyEnd = fin(q.fiscal_period_end_fy) ? q.fiscal_period_end_fy + YR : null
  const stub = fyEnd && fin(q.fiscal_period_end_fq) ? clamp((fyEnd - q.fiscal_period_end_fq) / YR, 0, 1) : 1
  const t1 = fyEnd ? Math.max(0, (fyEnd - now) / YR) : 1
  // Cash: the reported figure, else total debt − net debt; unknown (runway null) without either.
  const cash0 = fin(q.cash_n_short_term_invest_fq) ? q.cash_n_short_term_invest_fq
    : fin(q.total_debt_fq) && fin(q.net_debt_fq) ? Math.max(0, q.total_debt_fq - q.net_debt_fq) : null
  const burn = Math.max(0, -(q.free_cash_flow_ttm ?? ebit0))
  const runway = cash0 == null ? null : burn > 0 ? cash0 / burn : Infinity
  // ponytail: failure probability from the cash runway alone (30% with no cash, 5% from 5 years,
  // 17.5% when the cash is unknown); it cannot see committed outside funding or credit lines.
  const pFail = o.pFail ?? (runway == null ? 0.175 : clamp(0.3 - 0.05 * runway, 0.05, 0.3))
  const gap0 = ebit0 - R0 * m
  let nol = o.nol ?? nolFrom(q.net_income_fy_h)
  let rev = FY
  let pv = 0
  let df = 1
  let tau = 0
  let cash = cash0 ?? 0
  let low = cash
  for (let t = 1; t <= N; t += 1) {
    const prev = rev
    rev = t === 1 ? F : rev * (1 + (t <= 5 ? G : G + ((GT - G) * (t - 5)) / 5))
    const ebit = rev * m + gap0 * Math.max(0, 1 - t / CONV)
    const used = ebit > 0 ? Math.min(nol, ebit) : 0
    nol += ebit < 0 ? -ebit : -used
    const cf = (ebit - TAX * Math.max(0, ebit - used) - (rev - prev) / s2c) * (t === 1 ? stub : 1)
    const r = t <= 5 ? r0 : r0 + ((RT - r0) * (t - 5)) / 5
    const tauT = t1 + t - 1
    df /= (1 + r) ** (tauT - tau)
    tau = tauT
    pv += cf * df
    cash += cf
    low = Math.min(low, cash)
  }
  // Terminal: new capital earns exactly its cost, so growth after year 10 adds nothing (NOPAT₁₁ ÷ r).
  const tv = (rev * (1 + GT) * m * (1 - TAX)) / RT
  const op = pv + (tv + nol * TAX) * df
  const raw = ((1 - pFail) * (op - nd)) / shares // a failure leaves the shareholders nothing
  const gap = Math.max(0, -low)
  return { value: Math.max(0, raw), raw, m, mFrom: tm, G, growthFrom: q.revenue_forecast_next_fy > 0 ? 'analysts' : 'history', s2c, r0, pFail, runway, rev10: rev, gap, dilution: mcap > 0 ? gap / mcap : null }
}

/** The input o[key] (m: target margin, G: growth in years 2–5) at which the value equals the price; null when lo…hi cannot reach it. */
export function impliedInput(q, key = 'm', lo = -0.1, hi = 0.6, o = {}) {
  const f = (x) => rdcf(q, { ...o, [key]: x }).raw - q.close
  if (!fin(f(lo)) || f(lo) > 0 || f(hi) < 0) return null
  for (let i = 0; i < 50; i += 1) {
    const x = (lo + hi) / 2
    if (f(x) > 0) hi = x
    else lo = x
  }
  return (lo + hi) / 2
}
