// Tabs at 3 viewports (dark) + light samples; programmatic layout checks per tab.
const { open, shot, close } = require('./lib.cjs')
const VPS = [[390, 844], [820, 1180], [1440, 900]]
const TABS = ['us', 'sa', 'big', 'fav', 'sectors']
const checks = () => {
  const vw = document.documentElement.clientWidth
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
  const name = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`
  const small = {}
  for (const el of document.querySelectorAll('button, a[href], select, input, summary, tr.row[tabindex]')) {
    if (!vis(el) || el.closest('[hidden]')) continue
    const r = el.getBoundingClientRect()
    if (r.height < 43.5 || r.width < 43.5) { const k = `${name(el).replace(/#tab-\w+/, '#tab-*')} ${Math.round(r.width)}x${Math.round(r.height)}`; small[k] = (small[k] ?? 0) + 1 }
  }
  const over = []
  for (const el of document.querySelectorAll('.wrap *')) {
    if (!vis(el) || el.closest('svg')) continue
    const r = el.getBoundingClientRect()
    if (r.right > vw + 1 || r.left < -1) { let p = el.parentElement; let scr = false; while (p) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { scr = true; break } p = p.parentElement } if (!scr) over.push(`${name(el)} ${Math.round(r.left)}..${Math.round(r.right)}`) }
  }
  const scrollers = [...document.querySelectorAll('.wrap *')].filter((el) => vis(el) && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1).map((el) => `${name(el)} scroll ${el.scrollWidth} > ${el.clientWidth}`)
  const clipped = [...document.querySelectorAll('.wrap *')].filter((el) => vis(el) && !el.closest('svg') && ['hidden', 'clip'].includes(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1).slice(0, 8).map((el) => `${name(el)} "${el.textContent.trim().slice(0, 30)}"`)
  const sticky = [...document.querySelectorAll('*')].filter((el) => ['sticky', 'fixed'].includes(getComputedStyle(el).position) && vis(el)).map((el) => `${name(el)} ${getComputedStyle(el).position} h=${Math.round(el.getBoundingClientRect().height)}`)
  const firstRow = document.querySelector('#rows tr.row')?.getBoundingClientRect()
  return { docOverflow: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth : 0, over: over.slice(0, 8), scrollers: [...new Set(scrollers)].slice(0, 6), clipped, sticky: [...new Set(sticky)].slice(0, 5), small, firstRowY: firstRow ? Math.round(firstRow.top + scrollY) : null, rowH: firstRow ? Math.round(firstRow.height) : null, pageH: document.documentElement.scrollHeight, dom: document.querySelectorAll('*').length }
}
;(async () => {
  const out = {}
  for (const [w, h] of VPS) {
    const p = await open({ w, h, theme: 'dark' })
    for (const t of TABS) {
      await p.click(`#tab-${t}`); await p.waitForTimeout(t === 'us' ? 300 : 900)
      await p.evaluate(() => scrollTo(0, 0))
      await shot(p, `tab-${t}-${w}-dark`)
      out[`${t}-${w}`] = await p.evaluate(checks)
      if (t !== 'sectors') { const y = await p.evaluate(() => { const r = document.querySelector('#rows tr.row'); return r ? r.getBoundingClientRect().top + scrollY - 10 : 0 }); await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(150); await shot(p, `tab-${t}-${w}-dark-rows`) }
      else { await p.evaluate(() => scrollTo(0, 500)); await p.waitForTimeout(150); await shot(p, `tab-${t}-${w}-dark-rows`) }
    }
    console.log(w, 'logs', p.logs.slice(0, 5))
    await p.context().close()
  }
  for (const [w, h] of VPS) {
    const p = await open({ w, h, theme: 'light' })
    await shot(p, `tab-us-${w}-light`)
    const y = await p.evaluate(() => document.querySelector('#rows tr.row').getBoundingClientRect().top + scrollY - 10); await p.evaluate((y) => scrollTo(0, y), y); await shot(p, `tab-us-${w}-light-rows`)
    await p.click('#tab-sectors'); await p.waitForTimeout(600); await p.evaluate(() => scrollTo(0, 500)); await shot(p, `tab-sectors-${w}-light-rows`)
    await p.context().close()
  }
  require('fs').writeFileSync(__dirname + '/checks-tabs.json', JSON.stringify(out, null, 1))
  for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v))
  await close()
})()
