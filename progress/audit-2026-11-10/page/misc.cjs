const fs = require('fs')
const { open } = require('./harness.cjs')
const gen = fs.readFileSync(__dirname + '/gen.js', 'utf8')
;(async () => {
  const { browser, page, settle } = await open({ seed: { arg: { gen }, fn: ({ gen }) => { eval(gen); const G = window.__gen; const S = window.__store; const M = window.__mcp
    const us = ['NASDAQ:NOFCF', 'NYSE:REIT', 'NASDAQ:TURN', 'NYSE:BANK']
    S['lists/us'] = { symbols: us }
    for (const s of us) { M.quotes[s] = G.quote(s, { sector: 'Retail Trade', industry: 'Food Retail' }); M.hist[s] = G.histRow(); M.px[s] = G.px() }
    // free cash flow never reported
    M.quotes['NASDAQ:NOFCF'].free_cash_flow_ttm = null; M.hist['NASDAQ:NOFCF'].free_cash_flow_fy_h = M.hist['NASDAQ:NOFCF'].free_cash_flow_fy_h.map(() => null); M.hist['NASDAQ:NOFCF'].free_cash_flow_fq_h = M.hist['NASDAQ:NOFCF'].free_cash_flow_fq_h.map(() => null)
    Object.assign(M.quotes['NYSE:REIT'], { sector: 'Finance', industry: 'Real Estate Investment Trusts', dividends_yield: 5, dividend_payout_ratio_ttm: 95 })
    // a loss five years ago, profit now, EPS up 30% in the last year
    const t = M.hist['NASDAQ:TURN']; t.earnings_per_share_diluted_fy_h = t.earnings_per_share_diluted_fy_h.map((v, i) => (i >= 5 ? -1 : v)); Object.assign(M.quotes['NASDAQ:TURN'], { earnings_per_share_diluted_yoy_growth_ttm: 30 })
    Object.assign(M.quotes['NYSE:BANK'], { sector: 'Finance', industry: 'Major Banks', total_revenue_fq: 7.6e10, revenue_forecast_fq: 5.1e10, revenue_forecast_next_fq: 5.2e10, revenue_surprise_percent_fq: -2.1 })
    M.hist['NYSE:BANK'].total_revenue_fq_h = M.hist['NYSE:BANK'].total_revenue_fq_h.map((v, i) => 7.6e10 * 1.02 ** -i)
  } } })
  await settle(2500)
  const openRow = async (s) => { await page.click(`#rows tr.row[data-sym="${s}"] td.c-stock span`); await page.waitForTimeout(900); return page.$eval('#rows tr.detail', (d) => d.innerText.replace(/\s+/g, ' ')) }
  let t = await openRow('NASDAQ:NOFCF'); console.log('NOFCF | score cell:', await page.$eval('#rows tr.row[data-sym="NASDAQ:NOFCF"]', (tr) => tr.children[4].innerText.trim()), '|', (t.match(/الكاش من الأرباح[^:]*: \S+( \S+)?/) ?? [])[0])
  t = await openRow('NYSE:REIT'); await page.click('#rows tr.detail details.axes > summary'); t = await page.$eval('#rows tr.detail', (d) => d.innerText.replace(/\s+/g, ' ')); console.log('REIT |', (t.match(/الأرباح تغطي التوزيعات:[^.]*\./) ?? [])[0], '| status:', await page.evaluate(() => window.__t.state.snow['NYSE:REIT'].axes.dividend.checks.find((c) => c.id === 'D5').status))
  t = await openRow('NASDAQ:TURN'); console.log('TURN | risks box:', (t.match(/المخاطر.*?الفحوصات/) ?? [])[0]?.slice(0, 300))
  t = await openRow('NYSE:BANK'); console.log('BANK | card:', await page.$eval('#rows tr.detail .ecard.last', (e) => e.innerText.replace(/\s+/g, ' ')), '| chart bars (last 2 + estimate):', await page.$$eval('#rows tr.detail svg.qchart:first-of-type rect title', (x) => x.slice(-3).map((e) => e.textContent).join(' ; ')), '| x labels:', await page.$$eval('#rows tr.detail svg.qchart:first-of-type text.axis[text-anchor=middle]', (x) => x.map((e) => e.textContent).join(',')), '| bars:', await page.$$eval('#rows tr.detail svg.qchart:first-of-type rect.act', (x) => x.length))
  await browser.close()
})()
