const { open, shot, close } = require('./lib.cjs')
;(async () => {
  for (const anchor of [true, false]) {
    const p = await open({ w: 390, h: 844 })
    if (!anchor) await p.addStyleTag({ content: '* { overflow-anchor: none !important; }' }) // Safari has no scroll anchoring
    const top = (s) => p.$eval(`#rows tr.row[data-sym="${s}"]`, (r) => Math.round(r.getBoundingClientRect().top))
    await p.$eval('#rows tr.row[data-sym="NASDAQ:AAPL"]', (r) => { r.scrollIntoView({ block: 'start' }); r.click() }); await p.waitForTimeout(1500)
    console.log(`anchoring=${anchor}: after opening AAPL, its card top =`, await top('NASDAQ:AAPL'), '(viewport px)')
    await p.$eval('#rows tr.row[data-sym="NYSE:ABBV"]', (r) => r.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300)
    const before = await top('NYSE:ABBV')
    await p.$eval('#rows tr.row[data-sym="NYSE:ABBV"]', (r) => r.click()); await p.waitForTimeout(1500)
    console.log(`  tap ABBV (below the open AAPL panel): ABBV card top ${before} → ${await top('NYSE:ABBV')} px; visible: ${await p.$eval('#rows tr.row[data-sym="NYSE:ABBV"]', (r) => { const b = r.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight })}`)
    if (!anchor) await shot(p, 'flow-open-second-noanchor-390')
    // closing: is there a close control inside/at the end of the panel?
    console.log('  close controls inside panel:', await p.$$eval('#rows tr.detail button', (b) => b.map((x) => x.innerText.trim()).filter((t) => /إغلاق|سكّر|قفل|×/.test(t)).length), '| panel height', await p.$eval('#rows tr.detail', (d) => Math.round(d.getBoundingClientRect().height)))
    await p.context().close()
  }
  const p = await open({ w: 390, h: 844 })
  const t = await p.evaluate(() => { const rows = document.querySelectorAll('#rows [title]'); const by = {}; for (const el of rows) { const k = el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '') + (el.dataset.label ? `[${el.dataset.label}]` : ''); if (el.getAttribute('title')) by[k] = (by[k] ?? 0) + 1 } return by })
  console.log('title-only (hover) info in list rows:', JSON.stringify(t))
  await p.$eval('#rows tr.row[data-sym="NASDAQ:MU"]', (r) => { r.scrollIntoView(); r.click() }); await p.waitForTimeout(1200)
  console.log('titles inside MU panel:', await p.$$eval('#rows tr.detail [title]', (e) => e.filter((x) => x.getAttribute('title') && !x.closest('svg')).map((x) => x.innerText.trim().slice(0, 18) + ' ⇒ ' + x.getAttribute('title').slice(0, 60)).slice(0, 12)), '| svg <title> (bar values, hover only):', await p.$$eval('#rows tr.detail svg title', (e) => e.length))
  console.log('MU row weak-fair title:', await p.$eval('#rows tr.row[data-sym="NASDAQ:MU"] td:nth-child(3)', (t) => t.title), '| canHover:', await p.evaluate(() => matchMedia('(hover: hover)').matches))
  // chart tooltip on touch: tap on SVR/sector chart
  await p.click('#tab-sectors'); await p.waitForTimeout(500)
  const box = await (await p.$('#sectorsView svg.sc')).boundingBox(); await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(300)
  console.log('sector chart tap → tooltip:', await p.$eval('#sectorsView .ctip', (t) => (t.hidden ? '(hidden)' : t.textContent)))
  await close()
})()
