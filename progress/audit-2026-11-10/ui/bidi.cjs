// Visual-order check: for every signed number / percentage in a text node, compare glyph x positions.
const { open, close } = require('./lib.cjs')
const scan = (rootSel) => {
  const root = document.querySelector(rootSel); if (!root) return null
  const out = { total: 0, bad: {} }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const x = (node, i) => { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); const b = r.getClientRects()[0]; return b ? { x: b.left, y: b.top, w: b.width } : null }
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement; if (!el || el.closest('svg, script, style') || !el.getClientRects().length) continue
    for (const m of n.textContent.matchAll(/([+\-−]\s?)?\d[\d.,]*(\s?%|×)?/g)) {
      if (!m[1] && !m[2]) continue
      out.total += 1
      const a = x(n, m.index); const b = x(n, m.index + m[0].length - 1)
      if (!a || !b || Math.abs(a.y - b.y) > 4) continue
      if (a.x > b.x + 0.5) { const sec = el.closest('.part, details, .dgrid > *, td, li, p')?.querySelector('h3 > span, summary')?.textContent?.trim().slice(0, 25) ?? el.closest('td')?.dataset.label ?? el.tagName; const k = `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} | "${m[0]}" in "${n.textContent.trim().slice(Math.max(0, m.index - 25), m.index + m[0].length + 12)}" | ${sec}`; out.bad[k] = (out.bad[k] ?? 0) + 1 }
    }
  }
  return out
}
;(async () => {
  const p = await open({ w: 390, h: 844 })
  console.log('LIST us', JSON.stringify(await p.evaluate(scan, '#rows'), null, 0).slice(0, 1500))
  for (const sym of ['NASDAQ:AAPL', 'NASDAQ:RIVN', 'NYSE:JPM', 'NASDAQ:LCID']) {
    await p.$eval(`#rows tr.row[data-sym="${sym}"]`, (r) => { r.scrollIntoView(); r.click() }); await p.waitForTimeout(1200)
    await p.$$eval('#rows tr.detail details', (ds) => ds.forEach((d) => { d.open = true })); await p.waitForTimeout(300)
    const r = await p.evaluate(scan, '#rows tr.detail'); console.log('\nPANEL', sym, 'numbers', r.total, 'reversed', Object.keys(r.bad).length); for (const [k, v] of Object.entries(r.bad)) console.log('  ', v, k)
    await p.$eval(`#rows tr.row[data-sym="${sym}"]`, (r) => r.click()); await p.waitForTimeout(200)
  }
  for (const sel of ['details.key', '.about', '#latestIdeas']) { await p.$$eval(sel + ' details, ' + sel, (ds) => ds.forEach((d) => { if ('open' in d) d.open = true })); const r = await p.evaluate(scan, sel); console.log('\nSTATIC', sel, r && r.total, r && Object.entries(r.bad).slice(0, 12)) }
  await p.click('#tab-sectors'); await p.waitForTimeout(500)
  const r = await p.evaluate(scan, '#sectorsView'); console.log('\nSECTORS', r.total, Object.entries(r.bad).slice(0, 8))
  await close()
})()
