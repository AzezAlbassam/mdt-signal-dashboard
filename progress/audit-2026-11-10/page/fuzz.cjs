// Robustness: odd quotes / docs, every row opened; reports page errors and what each row shows.
const fs = require('fs')
const { open } = require('./harness.cjs')
const gen = fs.readFileSync(__dirname + '/gen.js', 'utf8')
;(async () => {
  const { browser, page, logs, settle } = await open({ seed: { arg: { gen }, fn: ({ gen }) => {
    eval(gen)
    const G = window.__gen
    const M = window.__mcp; const S = window.__store
    const X = '<img src=x onerror="window.__xss=(window.__xss||0)+1">'
    const cases = {
      'NASDAQ:OK': { q: G.quote('NASDAQ:OK'), h: G.histRow(), px: G.px() },
      'NASDAQ:NULLQ': { q: Object.fromEntries(Object.keys(G.quote('x')).map((k) => [k, null])), h: null, px: null },
      'NASDAQ:ETF': { q: { ...Object.fromEntries(Object.keys(G.quote('x')).map((k) => [k, null])), description: 'Some ETF', close: 50, currency: 'USD', type: 'fund', change: 1, market_cap_basic: 1e9 }, h: null, px: G.px() },
      'NASDAQ:IPO': { q: G.quote('NASDAQ:IPO', { fiscal_period_fy: null, fiscal_period_end_fy: null, earnings_per_share_fy: null, total_revenue_fy: null, price_52_week_high: 110, price_52_week_low: 90 }), h: { ...Object.fromEntries(Object.keys(G.histRow()).map((k) => [k, null])), fiscal_period_end_fq: G.fqEnd, total_revenue_fq_h: [5e9, 4e9], net_income_fq_h: [-1e8, -2e8], earnings_per_share_diluted_fq_h: [-0.1, -0.2] }, px: G.px(Date.now(), 2) },
      'NASDAQ:NOPX': { q: G.quote('NASDAQ:NOPX'), h: G.histRow(), px: null },
      'NASDAQ:NOCLOSE': { q: G.quote('NASDAQ:NOCLOSE', { close: null, change: null }), h: G.histRow(), px: G.px() },
      'NASDAQ:LOSS': { q: G.quote('NASDAQ:LOSS', { earnings_per_share_diluted_ttm: -2, net_income_ttm: -2e9, price_earnings_ttm: null, free_cash_flow_ttm: -3e9, oper_income_ttm: -2e9, earnings_per_share_fy: -2, earnings_per_share_forecast_next_fy: -1, non_gaap_price_to_earnings_per_share_forecast_next_fy: null, return_on_equity: -30 }),
        h: (() => { const r = G.histRow(); for (const k of ['net_income', 'earnings_per_share_diluted', 'free_cash_flow', 'ebitda']) { r[k + '_fy_h'] = r[k + '_fy_h'].map((v) => -Math.abs(v) / 2); r[k + '_fq_h'] = r[k + '_fq_h'].map((v) => -Math.abs(v) / 2) } return r })(), px: G.px() },
      'NASDAQ:ZERO': { q: G.quote('NASDAQ:ZERO', { close: 0, market_cap_basic: 0, total_revenue_ttm: 0, total_revenue_fq: 0, total_shares_outstanding: 0, price_52_week_high: 0, price_52_week_low: 0 }), h: G.histRow(), px: G.px() },
      'NASDAQ:STR': { q: G.quote('NASDAQ:STR', { fiscal_period_fy: '2025', description: X, sector: X, industry: X, currency: X, earnings_release_next_date: 1e18, earnings_release_date: 1e18 }), h: G.histRow({ fiscal_period_fy: '2025' }), px: G.px() },
      'NASDAQ:HNULL': { q: G.quote('NASDAQ:HNULL'), h: Object.fromEntries(Object.entries(G.histRow()).map(([k, v]) => [k, Array.isArray(v) ? v.map(() => null) : v])), px: G.px() },
      'NASDAQ:PREREV': { q: G.quote('NASDAQ:PREREV', { total_revenue_ttm: 1e5, total_revenue_fq: 2e4, total_revenue_fy: 1e5, earnings_per_share_diluted_ttm: -1, net_income_ttm: -1e9, net_debt_fq: -5e9, free_cash_flow_ttm: -1e9, industry: 'Biotechnology', sector: 'Health Technology' }),
        h: (() => { const r = G.histRow(); r.total_revenue_fy_h = r.total_revenue_fy_h.map(() => 1e5); r.total_revenue_fq_h = r.total_revenue_fq_h.map(() => 2e4); for (const k of ['net_income', 'earnings_per_share_diluted', 'free_cash_flow', 'ebitda']) { r[k + '_fy_h'] = r[k + '_fy_h'].map((v) => -Math.abs(v)); r[k + '_fq_h'] = r[k + '_fq_h'].map((v) => -Math.abs(v)) } return r })(), px: G.px() },
      'NYSE:BANK': { q: G.quote('NYSE:BANK', { sector: 'Finance', industry: 'Major Banks', free_cash_flow_ttm: null, enterprise_value_ebitda_ttm: null }), h: G.histRow(), px: G.px() },
      'TADAWUL:2222': { q: G.quote('TADAWUL:2222', { change: -7.5 }), h: G.histRow(), px: G.px() },
    }
    const us = Object.keys(cases).filter((s) => !s.startsWith('TADAWUL')).concat('NASDAQ:GONE')
    S['lists/us'] = { symbols: us }; S['lists/sa'] = { symbols: ['TADAWUL:2222'] }; S['meta/favorites'] = { symbols: ['NASDAQ:OK', 'TADAWUL:2222', 'NASDAQ:GONE'] }
    S['ideas/a'] = { sym: 'NASDAQ:STR', source: X, title: X, url: 'javascript:window.__xss=99', date: '2026-01-05', priceThen: 50, summary: X, side: X }
    S['meta/watchlists'] = { us: [{ name: X, symbols: ['NASDAQ:OK'] }] }
    for (const [s, c] of Object.entries(cases)) { M.quotes[s] = c.q; if (c.h) M.hist[s] = c.h; if (c.px) M.px[s] = c.px
      M.news[s] = [{ title: X, link: 'javascript:window.__xss=98', published: 1790913837, provider: { name: X } }]
      M.docs[s] = { items: [{ title: X, reported: 1790000000, views: [{ type: 'summary', id: 'v-' + s }] }] }
      M.views['v-' + s] = { astDescription: { children: [{ type: 'heading', children: ['Outlook'] }, { type: 'x', children: [{ type: 'list', children: [{ children: [X] }, { children: ['Revenue to grow 10%'] }] }] }] } } }
  } } })
  await settle(3000)
  const dump = async (tab) => {
    const rows = await page.$$eval('#rows tr.row', (trs) => trs.map((tr) => tr.dataset.sym))
    for (const sym of rows) {
      const before = logs.length
      await page.click(`#rows tr.row[data-sym="${sym}"] td.c-stock span`).catch((e) => logs.push('click fail ' + sym + ' ' + e.message.slice(0, 80)))
      await page.waitForTimeout(700)
      const txt = await page.$eval(`#rows tr.row[data-sym="${sym}"]`, (tr) => tr.innerText.replace(/\s+/g, ' ').slice(0, 230))
      const det = await page.$eval('#rows tr.detail', (d) => d.innerText.replace(/\s+/g, ' ')).catch(() => '(no panel)')
      const bad = ['NaN', 'undefined', 'Infinity', '[object', 'null'].filter((w) => new RegExp(w === 'null' ? '\\bnull\\b' : w.replace('[', '\\[')).test(det + txt))
      console.log(`[${tab}] ${sym}: ${txt}\n     panel ${det.length} chars; bad tokens: ${bad.join(',') || '-'}${logs.length > before ? '\n     ERR ' + logs.slice(before).join(' | ').slice(0, 600) : ''}`)
      for (const w of bad) { const i = (det + txt).search(new RegExp(w === 'null' ? '\\bnull\\b' : w.replace('[', '\\['))); console.log('        …' + (det + txt).slice(Math.max(0, i - 90), i + 40)) }
    }
  }
  await dump('us')
  await page.click('#tab-sa'); await settle(2000); await dump('sa')
  await page.click('#tab-fav'); await settle(2000); await dump('fav')
  console.log('xss fired:', await page.evaluate(() => window.__xss ?? 0), '| img tags from data:', await page.evaluate(() => document.querySelectorAll('img[src="x"]').length), '| js hrefs:', await page.evaluate(() => [...document.querySelectorAll('a[href^="javascript:"]')].length))
  await page.click('#tab-us'); await settle(1500)
  console.log('group options:', await page.$eval('#group', (s) => s.innerHTML.slice(0, 200)))
  console.log('notice:', await page.$eval('#notice', (n) => (n.hidden ? '' : n.textContent)))
  console.log('ALL LOGS:', logs.length, logs.slice(0, 6).join('\n'))
  await browser.close()
})()
