// Expanded details + SVG text legibility/collision metrics.
const { open, shot, close, D } = require('./lib.cjs'); const { execSync } = require('child_process'); const path = require('path')
const svgChecks = () => [...document.querySelectorAll('#rows tr.detail svg, #sectorsView svg')].slice(0, 40).map((s) => {
  const r = s.getBoundingClientRect(); if (!r.width) return null
  const texts = [...s.querySelectorAll('text')].map((t) => { const b = t.getBoundingClientRect(); return { s: t.textContent.trim().slice(0, 14), h: +b.height.toFixed(1), l: b.left, r: b.right, t: b.top, b: b.bottom, fs: parseFloat(getComputedStyle(t).fontSize) } }).filter((t) => t.h > 0)
  let coll = 0; const pairs = []
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) { const a = texts[i]; const b = texts[j]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 2 && b.t < a.b - 2) { coll += 1; if (pairs.length < 3) pairs.push(`${a.s}/${b.s}`) } }
  const vb = s.viewBox?.baseVal; const scale = vb && vb.width ? r.width / vb.width : 1
  return { cls: s.getAttribute('class'), w: Math.round(r.width), h: Math.round(r.height), vb: vb?.width ? `${vb.width}x${vb.height}` : null, scale: +scale.toFixed(2), texts: texts.length, minGlyphH: texts.length ? Math.min(...texts.map((t) => t.h)) : null, effFont: texts.length ? +(Math.min(...texts.map((t) => t.fs)) * scale).toFixed(1) : null, coll, pairs, role: s.getAttribute('role'), aria: (s.getAttribute('aria-label') ?? '').slice(0, 50), titles: s.querySelectorAll('title').length, sample: texts.slice(0, 4).map((t) => t.s).join(' | ') }
}).filter(Boolean)
;(async () => {
  for (const [sym, w, h] of [['NASDAQ:AAPL', 390, 844], ['NASDAQ:LCID', 390, 844], ['NASDAQ:AAPL', 1440, 900], ['NASDAQ:LCID', 1440, 900], ['NASDAQ:MU', 820, 1180]]) {
    const p = await open({ w, h, settle: 2200 })
    const sel = `#rows tr.row[data-sym="${sym}"]`
    await p.$eval(sel, (r) => { r.scrollIntoView(); r.click() }); await p.waitForTimeout(1300)
    console.log(sym, w, 'svg collapsed:', JSON.stringify(await p.evaluate(svgChecks)))
    await p.$$eval('#rows tr.detail details', (ds) => ds.forEach((d) => { d.open = true })); await p.waitForTimeout(600)
    console.log(sym, w, 'svg expanded:', JSON.stringify((await p.evaluate(svgChecks)).filter((s) => !['snow'].includes(s.cls))))
    console.log(sym, w, 'expanded panel h:', await p.$eval('#rows tr.detail', (d) => Math.round(d.getBoundingClientRect().height)), 'scrollers:', await p.$$eval('#rows tr.detail *', (els) => els.filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1).map((el) => `${el.className} ${el.scrollWidth}>${el.clientWidth}`)))
    const f = path.join(D, 'shots', `panelx-${sym.split(':')[1]}-${w}-dark.png`)
    await (await p.$('#rows tr.detail')).screenshot({ path: f })
    console.log(execSync(`python3 ${D}/montage.py ${f} ${w < 500 ? 1500 : 900} ${w < 500 ? 4 : w < 900 ? 2 : 1}`).toString().trim())
    await p.context().close()
  }
  const p = await open({ w: 390, h: 844 }); await p.click('#tab-sectors'); await p.waitForTimeout(600)
  const sc = await p.evaluate(svgChecks); console.log('sectors svg', JSON.stringify(sc.slice(0, 3)), 'collisions total', sc.reduce((a, s) => a + s.coll, 0), 'of', sc.length)
  await close()
})()
