// Counts TradingView calls on a cold start and on tab visits, for several db states.
const fs = require('fs')
const { open } = require('./harness.cjs')
const gen = fs.readFileSync(__dirname + '/gen.js', 'utf8')
const BIG = /const BIG = (\[[\s\S]*?\])/.exec(fs.readFileSync('/home/user/mdt-signal-dashboard/pages/stocks.app.js', 'utf8'))[1].replace(/'/g, '"')
async function run(name, mode) {
  const { browser, page, logs, settle, count } = await open({ seed: { arg: { gen, mode, BIG: JSON.parse(BIG) }, fn: ({ gen, mode, BIG }) => {
    eval(gen)
    const G = window.__gen
    const us = Array.from({ length: 703 }, (_, i) => `NASDAQ:U${String(i).padStart(3, '0')}`)
    const sa = Array.from({ length: 271 }, (_, i) => `TADAWUL:${1000 + i}`)
    const fav = [...us.slice(0, 60), ...sa.slice(0, 15)]
    const S = window.__store
    S['lists/us'] = { symbols: us }; S['lists/sa'] = { symbols: sa }; S['meta/favorites'] = { symbols: fav }
    const M = window.__mcp
    const day = 864e5
    for (const s of [...us, ...sa, ...BIG]) {
      M.quotes[s] = G.quote(s); M.hist[s] = G.histRow(); M.px[s] = G.px()
      if (mode === 'empty') continue
      const pxAt = mode === 'newmonth' ? Date.now() - 35 * day : Date.now() - 3 * day
      S[`cache/${s}`] = { sym: s, fin: G.fin(), fyEnd: G.fyEnd, missing: false, fundsAt: Date.now() - 5 * day, fetchedAt: 1, px: G.px(pxAt), pxTried: true, pxAt }
      S[`q/${s}`] = { sym: s, fq: G.fq(), fqEnd: G.fqEnd, fetchedAt: 1 }
    }
    if (mode === 'earnings') us.slice(100, 220).forEach((s) => { M.quotes[s] = G.quote(s, { fiscal_period_end_fq: G.fqEnd + 92 * 86400 }) })
    if (mode === 'dbfail') window.__dbFail = (c) => c === 'cache'
  } } })
  await settle(4000)
  const out = { boot_us: await count() }
  for (const m of ['sa', 'big', 'fav']) { await page.click(`#tab-${m}`); await settle(4000); out[m] = await count() }
  await page.click('#tab-us'); await settle(2000); out.back_us = await count()
  // open one stock
  await page.click('#rows tr.row'); await page.waitForTimeout(800); out.open1 = await count()
  // reload = second visit right away
  const before = await page.evaluate(() => window.__calls.length)
  console.log(name, JSON.stringify(out), 'notice:', await page.$eval('#notice', (n) => (n.hidden ? '' : n.textContent.slice(0, 90))), 'status:', (await page.textContent('#status')).slice(0, 120), logs.slice(0, 3))
  await browser.close()
}
;(async () => { for (const m of process.argv.slice(2)) await run(m, m) })()
