const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined })
  for (const [k, w, h] of [['port', 1080, 1350], ['perf', 1080, 1350]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    p.on('pageerror', (e) => console.log('ERR', e.message))
    await p.goto(`file://${__dirname}/portfolio.html?k=${k}`)
    await p.evaluate(() => document.fonts.ready)
    await p.waitForTimeout(500)
    await p.screenshot({ path: `${process.argv[2] || "."}/${k}.png` })
    await p.close()
  }
  await b.close()
})()
