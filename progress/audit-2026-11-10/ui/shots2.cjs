// Detail panels: element screenshots (montaged) + in-panel layout checks.
const { open, shot, close, D } = require('./lib.cjs'); const { execSync } = require('child_process'); const path = require('path')
const panelChecks = () => {
  const det = document.querySelector('#rows tr.detail'); if (!det) return null
  const vw = document.documentElement.clientWidth
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const name = (el) => `${el.tagName.toLowerCase()}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`
  const small = {}
  for (const el of det.querySelectorAll('button, a[href], select, input, summary')) { if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (r.height < 43.5 || r.width < 43.5) { const k = `${name(el)} ~${Math.round(r.width / 10) * 10}x${Math.round(r.height)}`; small[k] = (small[k] ?? 0) + 1 } }
  const scrollers = [...det.querySelectorAll('*')].filter((el) => vis(el) && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1).map((el) => `${name(el)} ${el.scrollWidth}>${el.clientWidth}`)
  const over = [...det.querySelectorAll('*')].filter((el) => { if (!vis(el) || el.closest('svg')) return false; const r = el.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1 }).slice(0, 6).map((el) => `${name(el)} ${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)} "${el.textContent.trim().slice(0, 30)}"`)
  const blocks = [...det.querySelectorAll('.dgrid > *')].map((p) => ({ t: (p.querySelector('h3 > span, summary > span, summary, h3')?.textContent ?? p.className).trim().slice(0, 40), y: Math.round(p.getBoundingClientRect().top - det.getBoundingClientRect().top), h: Math.round(p.getBoundingClientRect().height) }))
  const svgs = [...det.querySelectorAll('svg')].filter(vis).map((s) => ({ cls: s.getAttribute('class'), role: s.getAttribute('role'), aria: (s.getAttribute('aria-label') ?? '').slice(0, 40), title: !!s.querySelector('title'), w: Math.round(s.getBoundingClientRect().width) }))
  const tiny = {}; for (const el of det.querySelectorAll('*')) { if (!vis(el) || !el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12) tiny[fs] = (tiny[fs] ?? 0) + 1 }
  return { h: Math.round(det.getBoundingClientRect().height), chars: det.innerText.length, words: det.innerText.split(/\s+/).length, els: det.querySelectorAll('*').length, docOverflow: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth : 0, small, scrollers, over, blocks, svgs, tiny, details: det.querySelectorAll('details').length, detailsOpen: det.querySelectorAll('details[open]').length }
}
const JOBS = [
  ['NASDAQ:AAPL', 'us', 390, 844, 'dark'], ['NASDAQ:AAPL', 'us', 1440, 900, 'dark'], ['NASDAQ:AAPL', 'us', 390, 844, 'light'], ['NASDAQ:AAPL', 'us', 820, 1180, 'dark'],
  ['NASDAQ:MU', 'us', 390, 844, 'dark'], ['NASDAQ:RIVN', 'us', 390, 844, 'dark'], ['NASDAQ:RIVN', 'us', 1440, 900, 'dark'], ['NASDAQ:LCID', 'us', 390, 844, 'dark'],
  ['NYSE:JPM', 'us', 390, 844, 'dark'], ['NYSE:JPM', 'us', 1440, 900, 'light'], ['TADAWUL:1120', 'sa', 390, 844, 'dark'], ['TADAWUL:2222', 'sa', 1440, 900, 'dark'], ['TADAWUL:2222', 'sa', 390, 844, 'dark'],
]
;(async () => {
  const out = {}
  const only = process.argv[2]
  for (const [sym, tab, w, h, theme] of JOBS) {
    if (only && !sym.includes(only)) continue
    const p = await open({ w, h, theme, settle: 2200 })
    if (tab !== 'us') { await p.click(`#tab-${tab}`); await p.waitForTimeout(900) }
    const sel = `#rows tr.row[data-sym="${sym}"]`
    await p.$eval(sel, (r) => r.scrollIntoView({ block: 'start' }))
    const t0 = Date.now()
    await p.$eval(sel, (r) => r.click())
    await p.waitForTimeout(1500)
    const name = `panel-${sym.split(':')[1]}-${w}-${theme}`
    await p.$eval(sel, (r) => scrollTo(0, r.getBoundingClientRect().top + scrollY - 8)); await p.waitForTimeout(200)
    await shot(p, name + '-top')
    const det = await p.$('#rows tr.detail')
    const f = path.join(D, 'shots', name + '.png')
    await det.screenshot({ path: f })
    const m = execSync(`python3 ${D}/montage.py ${f} ${w < 500 ? 1500 : w < 900 ? 1180 : 900} ${w < 500 ? 4 : w < 900 ? 2 : 1}`).toString().trim()
    out[name] = await p.evaluate(panelChecks)
    console.log(name, 'montage:', m, 'logs:', p.logs.slice(0, 3))
    await p.context().close()
  }
  require('fs').writeFileSync(D + `/checks-panels${only ?? ''}.json`, JSON.stringify(out, null, 1))
  for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify({ ...v, blocks: v.blocks.map((b) => `${b.t}@${b.y}+${b.h}`), svgs: v.svgs.length + ' svgs; no-alt: ' + v.svgs.filter((s) => !s.aria && !s.title).map((s) => s.cls).join(',') }))
  await close()
})()
