// Synthetic but plausible quotes, fundamentals and prices (runs inside the page).
window.__gen = (() => {
  const NOW = Date.now() / 1000
  const fyEnd = Date.UTC(2025, 11, 31) / 1000
  const fqEnd = Date.UTC(2026, 8, 30) / 1000
  const quote = (s, o = {}) => ({ description: s.split(':')[1] + ' Inc.', close: 100, currency: s.startsWith('TADAWUL') ? 'SAR' : 'USD', type: 'stock', sector: 'Technology Services', industry: 'Packaged Software',
    market_cap_basic: 1e11, price_earnings_ttm: 25, non_gaap_price_to_earnings_per_share_forecast_next_fy: 20, earnings_per_share_forecast_next_fy: 5, earnings_per_share_diluted_ttm: 4,
    enterprise_value_ebitda_ttm: 15, price_sales_current: 5, price_book_fq: 6, return_on_equity: 25, price_target_1y: 120, gross_margin: 60, net_debt_fq: 1e9, revenue_forecast_next_fy: 2.2e10, total_revenue_ttm: 2.1e10,
    earnings_release_next_date: NOW + 20 * 86400, eps_surprise_percent_fq: 3, revenue_surprise_percent_fq: 1, total_revenue_fq: 5.5e9, fiscal_period_end_fq: fqEnd, fiscal_period_end_fy: fyEnd, earnings_per_share_fy: 4.2,
    total_revenue_fy: 2e10, fiscal_period_fy: 2025, free_cash_flow_ttm: 4e9, change: 0.5, price_52_week_high: 130, price_52_week_low: 70, dividends_yield: 1, beta: 1.1, beta_5_year: 1.2, total_shares_outstanding: 1e9,
    net_income_ttm: 4e9, cash_n_short_term_invest_fq: 3e9, oper_income_ttm: 5e9, total_debt_fq: 4e9, earnings_per_share_fq: 1.1, earnings_per_share_forecast_fq: 1.05, earnings_per_share_forecast_next_fq: 1.2,
    revenue_forecast_fq: 5.4e9, revenue_forecast_next_fq: 5.8e9, earnings_release_date: NOW - 20 * 86400, earnings_release_time: 1, earnings_release_next_time: 1, total_revenue_yoy_growth_ttm: 10, earnings_per_share_diluted_yoy_growth_ttm: 12, ...o })
  const fin = () => { const labels = []; const mk = () => []; const series = { revenue: mk(), net_income: mk(), eps: mk(), fcf: mk(), ebitda: mk(), total_debt: mk(), gross_profit: mk() }
    for (let y = 2010; y <= 2025; y += 1) { const k = 1.1 ** (y - 2025); labels.push(String(y)); series.revenue.push({ value: 2e10 * k }); series.net_income.push({ value: 4e9 * k }); series.eps.push({ value: 4 * k }); series.fcf.push({ value: 4e9 * k }); series.ebitda.push({ value: 6e9 * k }); series.total_debt.push({ value: 4e9 }); series.gross_profit.push({ value: 1.2e10 * k }) }
    return { labels, series } }
  const fq = () => { const labels = []; const series = { revenue: [], net_income: [], eps: [], fcf: [], ebitda: [], total_debt: [], gross_profit: [] }
    for (let i = 15; i >= 0; i -= 1) { const m = 2026 * 12 + 8 - 3 * i; labels.push(`Q${Math.floor((m % 12) / 3) + 1} ${Math.floor(m / 12)}`); const k = 1.025 ** -i; series.revenue.push({ value: 5.5e9 * k }); series.net_income.push({ value: 1e9 * k }); series.eps.push({ value: 1 * k }); series.fcf.push({ value: 1e9 * k }); series.ebitda.push({ value: 1.5e9 * k }); series.total_debt.push({ value: 4e9 }); series.gross_profit.push({ value: 3.3e9 * k }) }
    return { labels, series } }
  const px = (endMs = Date.now(), n = 250) => { const t = []; const c = []; const d = new Date(endMs); for (let i = n - 1; i >= 0; i -= 1) { t.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1, 13, 30) / 1000); c.push(100 * 1.008 ** -i) } return { t, c } }
  // A HIST_COLS row (newest first) matching fin()/fq()
  const histRow = (o = {}) => { const f = fin(); const q = fq(); const C = { revenue: 'total_revenue', net_income: 'net_income', eps: 'earnings_per_share_diluted', fcf: 'free_cash_flow', ebitda: 'ebitda', total_debt: 'total_debt', gross_profit: 'gross_profit' }
    const r = { fiscal_period_fy: 2025, fiscal_period_end_fy: fyEnd, fiscal_period_end_fq: fqEnd }
    for (const [k, c] of Object.entries(C)) { r[c + '_fy_h'] = f.series[k].map((x) => x.value).reverse(); r[c + '_fq_h'] = q.series[k].map((x) => x.value).reverse() }
    return { ...r, ...o } }
  return { quote, fin, fq, px, histRow, fyEnd, fqEnd }
})()
