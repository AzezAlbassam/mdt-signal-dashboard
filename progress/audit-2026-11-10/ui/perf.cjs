const { open, close } = require('./lib.cjs')
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10)
async function run(w, h, cpu) {
  const p = await open({ w, h, cpu, settle: 0 })
  await p.waitForFunction(() => /آخر تحديث/.test(document.getElementById('status')?.textContent ?? ''), null, { timeout: 120000 })
  const tDone = await p.evaluate(() => performance.now())
  await p.waitForTimeout(1500)
  const load = await p.evaluate(() => { const M = window.__marks; const nav = performance.getEntriesByType('navigation')[0]; const lt = window.__long ?? []; const afterBoot = lt.filter((l) => l.s >= M.boot - 50)
    return { dcl: M.dcl, boot: M.boot, firstRowsAfterBoot: M.firstRows - M.boot, firstPriceAfterBoot: M.firstPrice - M.boot, lastMutAfterBoot: M.lastMut - M.boot, fullRenders: M.full, rowPatches: M.rowOnly, longTasks: afterBoot.length, longTotal: afterBoot.reduce((a, l) => a + l.d, 0), longMax: Math.max(0, ...afterBoot.map((l) => l.d)), tbt: afterBoot.reduce((a, l) => a + Math.max(0, l.d - 50), 0), calls: window.__calls.length, fcp: performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')?.startTime, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, dom: document.querySelectorAll('*').length, svgs: document.querySelectorAll('#rows svg').length, svgEls: document.querySelectorAll('#rows svg *').length, htmlKB: Math.round(document.getElementById('rows').innerHTML.length / 1024) } })
  load.doneAfterBoot = tDone - load.boot
  // interaction costs: sync handler + forced layout, then next frame painted
  const time = (fn) => p.evaluate(async (src) => { const f = new Function('return (' + src + ')')(); const t0 = performance.now(); await f(); const sync = performance.now() - t0; void document.body.offsetHeight; const layout = performance.now() - t0; await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0))); return { sync, layout, frame: performance.now() - t0 } }, fn.toString())
  const rep = async (n, fn, reset) => { const out = []; for (let i = 0; i < n; i++) { out.push(await time(fn)); if (reset) await time(reset) } return { sync: r1(med(out.map((o) => o.sync))), layout: r1(med(out.map((o) => o.layout))), frame: r1(med(out.map((o) => o.frame))) } }
  const type = (v) => `() => { const f = document.getElementById('filter'); f.value = ${JSON.stringify(v)}; f.dispatchEvent(new Event('input', { bubbles: true })) }`
  const res = {}
  res.filter_a = await rep(3, new Function('return ' + type('a'))(), new Function('return ' + type(''))())
  res.filter_app = await rep(3, new Function('return ' + type('app'))(), new Function('return ' + type(''))())
  res.filter_clear = await rep(3, new Function('return ' + type(''))(), new Function('return ' + type('zzz'))())
  // typing "apple" key by key: total main-thread time
  res.type_apple_total = r1(await p.evaluate(() => { const f = document.getElementById('filter'); const t0 = performance.now(); for (const v of ['a', 'ap', 'app', 'appl', 'apple']) { f.value = v; f.dispatchEvent(new Event('input', { bubbles: true })); void document.body.offsetHeight } const t = performance.now() - t0; f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true })); return t }))
  const sortTo = (v) => new Function(`return () => { const s = document.getElementById('sortSel'); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change', { bubbles: true })) }`)()
  const opts = await p.$$eval('#sortSel option', (o) => o.map((x) => x.value))
  res.sort_score = await rep(3, sortTo(opts.find((o) => o.startsWith('score')) ?? opts[1]), sortTo('sym:1'))
  res.sort_upside = await rep(3, sortTo(opts.find((o) => o.startsWith('upside')) ?? opts[2]), sortTo('sym:1'))
  res.open_panel = await rep(5, () => document.querySelector('#rows tr.row[data-sym="NASDAQ:AAPL"]').click(), () => document.querySelector('#rows tr.row[data-sym="NASDAQ:AAPL"]').click())
  res.open_panel_loss = await rep(3, () => document.querySelector('#rows tr.row[data-sym="NASDAQ:LCID"]').click(), () => document.querySelector('#rows tr.row[data-sym="NASDAQ:LCID"]').click())
  res.star_toggle = await rep(3, () => document.querySelector('#rows tr.row[data-sym="NYSE:ABBV"] .star').click())
  res.tab_sa = await rep(1, () => document.getElementById('tab-sa').click()); await p.waitForTimeout(800)
  res.tab_us_back = await rep(1, () => document.getElementById('tab-us').click()); await p.waitForTimeout(500)
  res.tab_sectors = await rep(1, () => document.getElementById('tab-sectors').click()); await p.waitForTimeout(300)
  await time(() => document.getElementById('tab-us').click()); await p.waitForTimeout(300)
  // panel rebuilds after opening (async loaders each redraw)
  res.panelRebuildsAfterOpen = await p.evaluate(async () => { let n = 0; const mo = new MutationObserver((ms) => { for (const m of ms) if ([...m.addedNodes].some((x) => x.nodeType === 1 && (x.matches?.('tr.detail') || (x.tagName === 'TD' && x.parentElement?.matches('tr.detail'))))) n += 1 }); mo.observe(document.getElementById('rows'), { childList: true, subtree: true }); document.querySelector('#rows tr.row[data-sym="NASDAQ:MSFT"]').click(); await new Promise((ok) => setTimeout(ok, 2500)); mo.disconnect(); return n })
  // scroll: frame times while scrolling the list
  res.scroll = await p.evaluate(async () => { const fr = []; let last = performance.now(); for (let i = 0; i < 60; i++) { scrollBy(0, 900); await new Promise((ok) => requestAnimationFrame(ok)); const t = performance.now(); fr.push(t - last); last = t } scrollTo(0, 0); fr.sort((a, b) => a - b); return { p50: Math.round(fr[30]), p95: Math.round(fr[57]), max: Math.round(fr[59]) } })
  await p.context().close()
  return { load: Object.fromEntries(Object.entries(load).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v])), res }
}
;(async () => {
  for (const [w, h, cpu] of [[1440, 900, 1], [390, 844, 1], [390, 844, 4]]) {
    const r = await run(w, h, cpu)
    console.log(`\n== ${w}x${h} cpu×${cpu}`); console.log(' load', JSON.stringify(r.load)); for (const [k, v] of Object.entries(r.res)) console.log(' ', k, JSON.stringify(v))
  }
  await close()
})()
