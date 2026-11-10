// Builds store.json / quotes.json / hist.json for the audit stub from the repo's saved data.
// Real: fiscal years, quarters, monthly prices, sector/industry, S&P/TASI screener columns, MU's full row.
// Derived: ratios from those. Synthetic (seeded, marked in SYNTH): targets, analyst counts, scores, calendar, beta, change.
const fs = require('fs'); const path = require('path')
const R = '/home/user/mdt-signal-dashboard/'
const OUT = __dirname
const J = (f) => JSON.parse(fs.readFileSync(R + f, 'utf8'))
const tryJ = (f) => { try { return J(f) } catch { return null } }
const NOW = Date.now()
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296 }
const rnd = (s, k, lo, hi) => lo + hash(s + k) * (hi - lo)
const bench = Object.fromEntries([...J('data/bench/2026-11-08-sp500.json').rows, ...J('data/bench/2026-11-08-ksa.json').rows].map((r) => [r.symbol, r]))
const caps = J('data/caps/quotes.json')
const sectors = { ...J('data/fv/sectors.json'), ...J('data/fv8/sectors.json'), ...J('data/fv-sa/sectors.json') }
const uni = Object.fromEntries(J('data/us/universe.json').symbols.map((s) => [s.symbol, s]))
const mu = J('test/pages/mu-fixture.json')
const store = {}; const quotes = {}; const hist = {}
const vals = (a) => (a ?? []).map((x) => x?.value ?? null)
const sum4 = (a) => { const l = a.slice(-4); return l.length === 4 && l.every(Number.isFinite) ? l.reduce((x, y) => x + y, 0) : null }
function build(sym, dirs, cur) {
  const f = sym.replace(':', '_')
  let fin = null; let px = null
  for (const d of dirs) { fin ??= tryJ(`data/${d}/raw/fin/${f}.json`); px ??= tryJ(`data/${d}/raw/px/${f}.json`) }
  const fq = tryJ(`data/fq/${f}.json`)
  if (!fin?.labels?.length) return false
  const b = bench[sym] ?? {}; const c = caps[sym] ?? {}; const sec = sectors[sym] ?? {}
  if (sec.type && sec.type !== 'stock') return false
  const S = fin.series; const n = fin.labels.length
  const last = (k) => vals(S[k]).filter((x) => x != null).at(-1) ?? null
  const bars = px?.bars?.t?.length ? { t: px.bars.t.slice(-252), c: px.bars.c.slice(-252) } : null
  const close = c.close ?? bars?.c.at(-1) ?? null
  if (!(close > 0)) return false
  const yr = bars ? bars.c.slice(-12) : [close]
  const epsFy = last('eps'); const niFy = last('net_income'); const revFy = last('revenue')
  const shares = b.total_shares_outstanding ?? (epsFy && niFy && niFy / epsFy > 0 ? niFy / epsFy : null)
  const mcap = b.market_cap_basic ?? c.market_cap_basic ?? (shares ? shares * close : null)
  const Q = fq?.series ?? {}
  const epsT = sum4(vals(Q.eps)) ?? epsFy; const niT = sum4(vals(Q.net_income)) ?? niFy; const revT = sum4(vals(Q.revenue)) ?? revFy
  const fcfT = sum4(vals(Q.fcf)) ?? last('fcf'); const ebT = sum4(vals(Q.ebitda)) ?? last('ebitda'); const gpT = sum4(vals(Q.gross_profit)) ?? last('gross_profit')
  const debt = vals(Q.total_debt).filter((x) => x != null).at(-1) ?? last('total_debt')
  const revQ = vals(Q.revenue).filter((x) => x != null).at(-1) ?? null
  const fin_ = sec.sector === 'Finance' || b.sector === 'Finance'
  const cash = revT ? revT * rnd(sym, 'cash', 0.05, 0.6) : null
  const pb = b.price_book_fq ?? rnd(sym, 'pb', 0.8, 9)
  const equity = b.total_equity_fq ?? (mcap ? mcap / pb : null)
  const ql = fq?.labels?.at(-1); const qm = /^Q([1-4]) (\d{4})$/.exec(ql ?? '')
  const fqEnd = qm ? Date.UTC(Number(qm[2]), Number(qm[1]) * 3, 0) / 1000 : Date.UTC(2026, 8, 30) / 1000
  const fyEnd = Date.UTC(Number(fin.labels.at(-1)), 11, 31) / 1000
  const rev3 = vals(S.revenue); const g = rev3.at(-1) > 0 && rev3.at(-4) > 0 ? (rev3.at(-1) / rev3.at(-4)) ** (1 / 3) - 1 : 0.05
  const gg = Math.max(-0.1, Math.min(0.4, g))
  const nextE = Math.floor(NOW / 1000) + Math.round(rnd(sym, 'ne', -1, 75)) * 86400
  const tgt = close * rnd(sym, 'tg', 0.85, 1.45)
  const q = {
    description: uni[sym]?.name ?? c.description ?? `${sym.split(':')[1]}${cur === 'SAR' ? ' Co.' : ' Inc.'}`, close, currency: cur, type: 'stock', sector: b.sector ?? sec.sector ?? uni[sym]?.sector ?? null, industry: b.industry ?? sec.industry ?? c.industry ?? null,
    market_cap_basic: mcap, price_earnings_ttm: b.price_earnings_ttm ?? (epsT > 0 ? close / epsT : null),
    earnings_per_share_forecast_next_fy: b.earnings_per_share_forecast_next_fy ?? (epsFy > 0 ? epsFy * (1 + gg) : null),
    earnings_per_share_diluted_ttm: epsT, enterprise_value_ebitda_ttm: mcap && ebT > 0 ? (mcap + (debt ?? 0) - (cash ?? 0)) / ebT : null,
    price_free_cash_flow_ttm: mcap && fcfT > 0 ? mcap / fcfT : null, price_sales_current: b.price_sales_current ?? (mcap && revT > 0 ? mcap / revT : null), price_book_fq: pb,
    return_on_invested_capital_fy: niFy && equity ? (100 * niFy) / (equity + (debt ?? 0)) : null, return_on_equity: niT && equity > 0 ? (100 * niT) / equity : null,
    piotroski_f_score_ttm: Math.round(rnd(sym, 'pt', 2, 9)), piotroski_f_score_fy: Math.round(rnd(sym, 'pf', 2, 9)), altman_z_score_ttm: fin_ ? null : rnd(sym, 'az', 0.4, 11),
    price_target_1y: tgt, price_target_high: tgt * 1.3, price_target_low: tgt * 0.7, recommendation_total: Math.round(rnd(sym, 'rc', 1, 45)),
    gross_margin: gpT && revT ? (100 * gpT) / revT : null, debt_to_equity: debt != null && equity > 0 ? debt / equity : null, net_debt_fq: debt != null && cash != null ? debt - cash : null,
    revenue_forecast_next_fy: b.revenue_forecast_next_fy ?? c.revenue_forecast_next_fy ?? (revFy ? revFy * (1 + gg) : null), total_revenue_ttm: revT,
    earnings_release_next_date: nextE, earnings_release_next_time: hash(sym + 'tm') > 0.5 ? 1 : -1, earnings_release_date: nextE - 91 * 86400, earnings_release_time: 1,
    eps_surprise_percent_fq: rnd(sym, 'es', -25, 30), revenue_surprise_percent_fq: rnd(sym, 'rs', -6, 8),
    total_revenue_fq: revQ, fiscal_period_end_fq: fqEnd, fiscal_period_end_fy: fyEnd, earnings_per_share_fy: b.earnings_per_share_fy ?? epsFy, total_revenue_fy: b.total_revenue_fy ?? revFy, fiscal_period_fy: fin.labels.at(-1),
    free_cash_flow_ttm: fcfT, change: rnd(sym, 'ch', -4.5, 4.5), price_52_week_high: Math.max(...yr, close) * 1.03, price_52_week_low: Math.min(...yr, close) * 0.97,
    dividends_yield: b.dividends_yield ?? (hash(sym + 'dv') > 0.6 ? rnd(sym, 'dy', 0.3, 5) : 0), beta: rnd(sym, 'b1', 0.3, 2.4), beta_5_year: rnd(sym, 'b5', 0.4, 2.1),
    total_shares_outstanding: shares, net_income_ttm: b.net_income_ttm ?? niT, cash_n_short_term_invest_fq: cash, oper_income_ttm: ebT != null ? ebT * 0.8 : niT, total_debt_fq: debt,
    total_current_assets_fq: revT ? revT * rnd(sym, 'ca', 0.3, 0.9) : null, total_current_liabilities_fq: revT ? revT * rnd(sym, 'cl', 0.2, 0.7) : null, total_liabilities_fq: equity ? equity * rnd(sym, 'tl', 0.4, 3) : null, total_equity_fq: equity,
    current_ratio_fq: rnd(sym, 'cr', 0.6, 3.5), cash_f_operating_activities_ttm: fcfT != null ? fcfT * 1.3 : null, interst_cover_ttm: rnd(sym, 'ic', -2, 40), effective_interest_rate_on_debt_ttm: rnd(sym, 'ir', 2, 9),
    total_assets_to_equity_fq: rnd(sym, 'ae', 1.2, fin_ ? 12 : 4), return_on_assets: b.return_on_assets ?? (niT && equity ? (100 * niT) / (equity * 2.5) : null),
    dividend_payout_ratio_ttm: rnd(sym, 'pr', 0, 90), dividend_payout_ratio_fy: rnd(sym, 'pr2', 0, 90), 'Volatility.W': b['Volatility.W'] ?? rnd(sym, 'vw', 1.5, 9),
    earnings_per_share_diluted_yoy_growth_ttm: b.earnings_per_share_diluted_yoy_growth_ttm ?? rnd(sym, 'eg', -40, 70), total_revenue_yoy_growth_ttm: b.total_revenue_yoy_growth_ttm ?? c.total_revenue_yoy_growth_ttm ?? 100 * gg,
    earnings_per_share_fq: vals(Q.eps).filter((x) => x != null).at(-1) ?? null, revenue_forecast_fq: revQ ? revQ * rnd(sym, 'rf', 0.95, 1.04) : null, revenue_forecast_next_fq: revQ ? revQ * (1 + gg / 4) : null,
  }
  q.non_gaap_price_to_earnings_per_share_forecast_next_fy = b.non_gaap_price_to_earnings_per_share_forecast_next_fy ?? (q.earnings_per_share_forecast_next_fy > 0 ? close / q.earnings_per_share_forecast_next_fy : null)
  q.earnings_per_share_forecast_fq = q.earnings_per_share_fq != null ? q.earnings_per_share_fq / (1 + q.eps_surprise_percent_fq / 100) : null
  q.earnings_per_share_forecast_next_fq = q.earnings_per_share_fq != null ? q.earnings_per_share_fq * (1 + gg / 4) : null
  if (sym === 'NASDAQ:MU') Object.assign(q, Object.fromEntries(Object.entries(mu.row).filter(([k]) => !k.endsWith('_h'))), { earnings_release_next_date: nextE })
  quotes[sym] = q
  store[`cache/${sym}`] = { sym, fin: { labels: fin.labels, series: fin.series }, ...(bars ? { px: bars } : {}), pxTried: true, pxAt: NOW - 3 * 864e5, fundsAt: NOW - 3600e3, fyEnd: q.fiscal_period_end_fy, fetchedAt: NOW - 3 * 864e5 }
  if (fq?.labels) store[`q/${sym}`] = { sym, fq: { labels: fq.labels, series: fq.series }, fqEnd: q.fiscal_period_end_fq, fetchedAt: NOW - 3 * 864e5 }
  const rev = (a) => (a ? [...a].reverse() : null)
  const as = tryJ(`data/fv/raw/assets/${f}.json`)
  hist[sym] = { total_revenue_fq_h: rev(vals(Q.revenue)), net_income_fq_h: rev(vals(Q.net_income)), earnings_per_share_diluted_fq_h: rev(vals(Q.eps)), total_revenue_fy_h: rev(vals(S.revenue)), net_income_fy_h: rev(vals(S.net_income)),
    earnings_per_share_diluted_fy_h: rev(vals(S.eps)), fiscal_period_end_fq: q.fiscal_period_end_fq, dps_common_stock_prim_issue_fy_h: q.dividends_yield > 0 ? rev(vals(S.eps)).map((e, i) => (e > 0 ? +(e * 0.3 * 0.97 ** i).toFixed(2) : null)) : null,
    total_assets_fy_h: as?.total_assets_fy_h ?? null, total_debt_fy_h: rev(vals(S.total_debt)), free_cash_flow_fy_h: rev(vals(S.fcf)), ebitda_fy_h: rev(vals(S.ebitda)) }
  if (sym === 'NASDAQ:MU') { store['cache/NASDAQ:MU'] = { ...mu.cache, pxTried: true, pxAt: NOW - 3 * 864e5, fundsAt: NOW - 3600e3, fyEnd: q.fiscal_period_end_fy }; store['q/NASDAQ:MU'] = { ...mu.q, fqEnd: q.fiscal_period_end_fq }; Object.assign(hist[sym], Object.fromEntries(Object.entries(mu.row).filter(([k]) => k.endsWith('_h')))) }
  if (sym === 'NASDAQ:AAPL') Object.assign(hist[sym], J('test/pages/aapl-h.json'), { fiscal_period_end_fq: q.fiscal_period_end_fq })
  return true
}
const us = [...new Set([...fs.readdirSync(R + 'data/fv/raw/fin'), ...fs.readdirSync(R + 'data/fv8/raw/fin')])].map((f) => f.slice(0, -5).replace('_', ':')).filter((s) => build(s, ['fv', 'fv8'], 'USD'))
const sa = [...new Set([...J('data/fv-sa/symbols.json'), ...J('data/sa-all/symbols.json')])].filter((s) => build(s, ['sa-all', 'fv-sa'], 'SAR'))
const favAll = J('data/favorites/2026-10-20.json')
store['lists/us'] = { symbols: us.slice(0, 700) }; store['lists/sa'] = { symbols: sa }
store['meta/favorites'] = { symbols: favAll.filter((s) => quotes[s]) }
const wl = J('data/fv/watchlists.json').watchlists.map((w) => ({ name: w.name, symbols: w.symbols.filter((s) => quotes[s]) })).filter((w) => w.symbols.length)
store['meta/watchlists'] = { us: wl.filter((w) => w.symbols.some((s) => !s.startsWith('TADAWUL'))).slice(0, 8), sa: wl.filter((w) => w.symbols.every((s) => s.startsWith('TADAWUL'))).slice(0, 4) }
store['ideas/a1'] = { sym: 'NYSE:JPM', source: 'VIC', title: 'JPMorgan long thesis (sample)', url: 'https://example.com/idea', date: '2026-09-04', priceThen: 200, side: 'long', summary: 'Sample idea summary for the audit stub.' }
store['g/NASDAQ:AAPL'] = { sym: 'NASDAQ:AAPL', title: 'Q4 2026 earnings call (sample)', reported: quotes['NASDAQ:AAPL']?.earnings_release_date + 100, bullets: ['Revenue expected to grow low to mid single digits year over year in the December quarter.', 'Gross margin guided to 46%–47%.', 'Operating expenses of $15.3–15.5 billion.'], fetchedAt: NOW }
fs.writeFileSync(path.join(OUT, 'store.json'), JSON.stringify(store)); fs.writeFileSync(path.join(OUT, 'quotes.json'), JSON.stringify(quotes)); fs.writeFileSync(path.join(OUT, 'hist.json'), JSON.stringify(hist))
const los = us.filter((s) => quotes[s].earnings_per_share_diluted_ttm < 0)
console.log({ us: us.length, sa: sa.length, fav: store['meta/favorites'].symbols.length, favDropped: favAll.length - store['meta/favorites'].symbols.length, q: Object.keys(store).filter((k) => k.startsWith('q/')).length, lossMakers: los.length, wl: store['meta/watchlists'].us.map((w) => w.name + ':' + w.symbols.length), storeMB: (fs.statSync(path.join(OUT, 'store.json')).size / 1e6).toFixed(1) })
console.log('has', ['NASDAQ:AAPL', 'NASDAQ:MU', 'NASDAQ:RIVN', 'NASDAQ:LCID', 'NYSE:JPM', 'NYSE:BAC', 'NYSE:SNOW', 'TADAWUL:1120', 'TADAWUL:2222'].map((s) => s + '=' + (quotes[s] ? (store['q/' + s] ? 'fin+fq' : 'fin') : 'NO')).join(' '))
