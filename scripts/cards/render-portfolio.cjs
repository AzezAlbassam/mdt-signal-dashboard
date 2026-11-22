// Render the portfolio update card (identity C): node scripts/cards/render-portfolio.cjs <out.png> [data.json]
// data.json has the shape of the default data in portfolio-update.html. Fails on page errors, missing fonts or overflow.
const { chromium } = require('playwright')
const fs = require('fs')
;(async () => {
  const [out = 'portfolio-update.png', data] = process.argv.slice(2)
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined })
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 })
  p.on('pageerror', (e) => { console.log('ERR', e.message); process.exitCode = 1 })
  if (data) await p.addInitScript((d) => { window.__DATA__ = d }, JSON.parse(fs.readFileSync(data, 'utf8')))
  await p.goto(`file://${__dirname}/portfolio-update.html`)
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(600)
  const check = await p.evaluate(() => ({
    fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')),
    over: [...document.querySelectorAll('#card *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > 1080.5 || r.left < -0.5 || r.bottom > 1350.5) }).map((e) => e.className || e.tagName),
  }))
  const want = ['Tajawal', 'Big Shoulders Display']
  const missing = want.filter((f) => !check.fonts.includes(f))
  if (missing.length) { console.log('FONTS NOT LOADED', missing); process.exitCode = 1 }
  if (check.over.length) { console.log('OVERFLOW', check.over); process.exitCode = 1 }
  await p.screenshot({ path: out })
  console.log(out, missing.length || check.over.length ? 'with problems' : 'ok')
  await b.close()
})()
