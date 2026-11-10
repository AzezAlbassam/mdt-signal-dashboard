const { open, shot, close } = require('./lib.cjs')
;(async () => {
  let p
  p = await open({ w: 390, h: 844, qs: 'extra=NASDAQ:NOPE&nocache=NASDAQ:AAL', settle: 3500 })
  console.log('NOPE row:', await p.$eval('#rows tr.row[data-sym="NASDAQ:NOPE"]', (r) => r.innerText.replace(/\s+/g, ' ')))
  await p.$eval('#rows tr.row[data-sym="NASDAQ:NOPE"]', (r) => { r.scrollIntoView({ block: 'start' }); scrollBy(0, -20); r.click() }); await p.waitForTimeout(800); await shot(p, 'state-unknown-symbol-390')
  console.log('NOPE panel:', await p.$eval('#rows tr.detail', (d) => d.innerText.replace(/\s+/g, ' ').slice(0, 300)).catch(() => 'none'))
  await p.$eval('#rows tr.row[data-sym="NASDAQ:NOPE"]', (r) => r.click())
  console.log('AAL row:', await p.$eval('#rows tr.row[data-sym="NASDAQ:AAL"]', (r) => r.innerText.replace(/\s+/g, ' ')))
  await p.$eval('#rows tr.row[data-sym="NASDAQ:AAL"]', (r) => { r.scrollIntoView({ block: 'start' }); scrollBy(0, -20); r.click() }); await p.waitForTimeout(1200); await shot(p, 'state-nofundamentals-390')
  console.log('AAL panel:', (await p.$eval('#rows tr.detail', (d) => d.innerText.replace(/\s+/g, ' ').slice(0, 500)).catch(() => 'none')), '| calls', JSON.stringify(await p.evaluate(() => window.__calls.slice(-6).map((c) => c.tool.replace('mcp-tv-', '') + ':' + c.sym)))); await p.context().close()
  p = await open({ w: 390, h: 844, qs: 'newsfail=1&nohist=1', settle: 2500 })
  await p.$eval('#rows tr.row[data-sym="NASDAQ:LCID"]', (r) => { r.scrollIntoView(); r.click() }); await p.waitForTimeout(1500)
  console.log('LCID svr box:', await p.$eval('#rows tr.detail .svr', (d) => d.innerText.replace(/\s+/g, ' ').slice(0, 200)).catch(() => 'none'), '| news:', await p.$eval('#rows tr.detail', (d) => { const i = d.innerText.indexOf('آخر الأخبار'); return d.innerText.slice(i, i + 160).replace(/\s+/g, ' ') }))
  await p.$eval('#rows tr.detail .svr', (d) => d.scrollIntoView({ block: 'center' })); await shot(p, 'state-svr-news-fail-390'); await p.context().close()
  // realistic-latency timeline (db 400 ms per page, mcp 800 ms per call)
  p = await open({ w: 390, h: 844, qs: 'delay=800&dbdelay=400', settle: 0 })
  const t0 = Date.now(); const seen = []
  for (let i = 0; i < 60; i++) { await p.waitForTimeout(250); const s = await p.evaluate(() => ({ st: document.getElementById('status').textContent, rows: document.querySelectorAll('#rows tr.row').length, skel: document.querySelectorAll('#rows .skel').length, priced: [...document.querySelectorAll('#rows tr.row td[data-label="السعر"]')].filter((t) => /\d/.test(t.textContent)).length })); const k = `${s.st}|${s.rows}|${s.priced}`; if (!seen.length || seen.at(-1).k !== k) seen.push({ t: Date.now() - t0, k }) }
  console.log('timeline (db 400ms/page, mcp 800ms/call):'); for (const s of seen) console.log('  ', s.t, s.k)
  await p.context().close()
  await close()
})()
