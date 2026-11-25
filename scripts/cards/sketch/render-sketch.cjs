// Render a hand-drawn card: node scripts/cards/sketch/render-sketch.cjs <data.json> <out.png> [scale 1|2]
// Fails on page errors, a font or logo that did not load, or anything laid out past the 1080x1350 card.
const { chromium } = require('playwright')
const fs = require('fs')
;(async () => {
  const [data, out, scale = '2'] = process.argv.slice(2)
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined })
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: +scale })
  p.on('pageerror', (e) => { console.log('ERR', e.message); process.exitCode = 1 })
  await p.addInitScript((d) => { window.__DATA__ = d }, JSON.parse(fs.readFileSync(data, 'utf8')))
  await p.goto(`file://${__dirname}/sketch.html`)
  await p.waitForSelector('body[data-done]', { timeout: 20000 })
  await p.waitForTimeout(300)
  const check = await p.evaluate(() => ({
    fonts: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))],
    logos: [...document.querySelectorAll('#stick img')].filter((i) => !i.naturalWidth).map((i) => i.src),
    over: [...document.querySelectorAll('#card *, #lab text')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > 1080.5 || r.left < -0.5 || r.bottom > 1350.5 || r.top < -0.5) }).map((e) => e.className?.baseVal ?? (e.className || e.tagName) + ':' + e.textContent.slice(0, 20)),
  }))
  if (!check.fonts.includes('Playpen Sans Arabic')) { console.log('FONTS NOT LOADED', check.fonts); process.exitCode = 1 }
  if (check.logos.length) { console.log('LOGOS NOT LOADED', check.logos); process.exitCode = 1 }
  if (check.over.length) { console.log('OVERFLOW', check.over); process.exitCode = 1 }
  await p.screenshot({ path: out })
  console.log(out, process.exitCode ? 'with problems' : 'ok')
  await b.close()
})()
