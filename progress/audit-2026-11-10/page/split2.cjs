// A 10-for-1 split after the docs were saved: prices are refetched (52-week rule), per-share fundamentals are not.
const fs = require('fs')
const { open } = require('./harness.cjs')
const gen = fs.readFileSync(__dirname + '/gen.js', 'utf8')
;(async () => {
  for (const mode of ['split']) {
    const { browser, page, settle, count } = await open({ seed: { arg: { gen, mode }, fn: ({ gen, mode }) => { eval(gen); const G = window.__gen; const S = window.__store; const M = window.__mcp; const s = 'NASDAQ:AAA'
      const k = mode === 'split' ? 2 : 1
      S['lists/us'] = { symbols: [s] }; S['meta/favorites'] = { symbols: [s] }
      // saved before the split: fundamentals asked 9 days ago, prices 8 days ago
      S['cache/' + s] = { sym: s, fin: G.fin(), fyEnd: G.fyEnd, missing: false, fundsAt: Date.now() - 9 * 864e5, px: G.px(), pxTried: true, pxAt: Date.now() - 8 * 864e5 }
      S['q/' + s] = { sym: s, fq: G.fq(), fqEnd: G.fqEnd }
      // TradingView today: everything per share restated for the split
      M.quotes[s] = G.quote(s, { sector: 'Retail Trade', industry: 'Food Retail', close: 100 / k, price_52_week_high: 130 / k, price_52_week_low: 70 / k, total_shares_outstanding: 1e9 * k, earnings_per_share_diluted_ttm: 4 / k, earnings_per_share_fy: 4.2 / k, earnings_per_share_forecast_next_fy: 5 / k, price_target_1y: 120 / k })
      const px = G.px(); M.px[s] = { t: px.t, c: px.c.map((c) => c / k) }
      const h = G.histRow(); for (const key of Object.keys(h)) if (key.startsWith('earnings_per_share')) h[key] = h[key].map((v) => v / k); M.hist[s] = h
    } } })
    await settle(3000); await page.waitForTimeout(800)
    const r = await page.evaluate(() => { const t = window.__t; const s = 'NASDAQ:AAA'; const f = t.state.fair[s]; return { close: t.state.quotes[s].close, fair: f?.fair, upside: t.upside(s), values: Object.fromEntries(Object.entries(f?.values ?? {}).filter(([, v]) => v > 0).map(([k, v]) => [k, +v.toFixed(2)])), dropped: f?.dropped, score: t.state.scores[s]?.total, A: t.state.scores[s]?.parts?.A, fyDue: t.fyDue(s), fqDue: t.fqDue(s), weak: t.weakFair(s) } })
    console.log(mode, JSON.stringify(r), JSON.stringify(await count()), '| row:', await page.$eval('#rows tr.row', (tr) => tr.innerText.replace(/\s+/g, ' ').slice(0, 120)))
    await browser.close()
  }
})()
