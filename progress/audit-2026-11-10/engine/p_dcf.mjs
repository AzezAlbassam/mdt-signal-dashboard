import { P } from './page.mjs'
import { E } from './lib.mjs'
// liveDcf: value per $1 of FCF/share, terminal-value share, by discount rate
const q0 = { close: 100, market_cap_basic: 100e9, total_shares_outstanding: 1e9, free_cash_flow_ttm: 1e9, sector: 'X', total_revenue_fy: 100, currency: 'USD', description: 'x' }
const tvShare = (g1, r) => { const gT = 0.025, G = Math.min(g1, 0.25); let cf = 1 * (1 + g1), pv = cf / (1 + r); for (let t = 2; t <= 10; t++) { cf *= 1 + G + ((gT - G) * (t - 2)) / 8; pv += cf / (1 + r) ** t } const tv = (cf * (1 + gT)) / (r - gT) / (1 + r) ** 10; return tv / (pv + tv) }
for (const g of [0.03, 0.08, 0.2, 0.4]) for (const beta of [0.3, 0.6, 1, 1.5, 2.2]) {
  const d = P.liveDcf({ ...q0, revenue_forecast_next_fy: 100 * (1 + g), beta_5_year: beta }, null)
  console.log(`g1=${g} beta=${beta} r=${d.r.toFixed(4)} value/FCFps=${d.value.toFixed(1)}  TV share=${(100 * tvShare(g, d.r)).toFixed(0)}%`)
}
