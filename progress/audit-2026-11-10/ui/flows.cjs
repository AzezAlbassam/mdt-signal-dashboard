const { open, shot, close } = require('./lib.cjs')
const note = async (p) => p.$eval('#notice', (n) => (n.hidden ? '(hidden)' : n.innerText))
;(async () => {
  const NEW = process.argv[2]
  let p = await open({ w: 390, h: 844 })
  // search: typing alone does nothing until submit?
  await p.fill('#q', 'app'); await p.waitForTimeout(600)
  console.log('after typing (no submit): results hidden =', await p.$eval('#results', (u) => u.hidden))
  await p.press('#q', 'Enter'); await p.waitForTimeout(600)
  console.log('results:', await p.$$eval('#results li', (l) => l.map((x) => x.innerText.replace(/\s+/g, ' '))))
  console.log('result btn sizes:', await p.$$eval('#results li button', (l) => l.slice(0, 2).map((x) => { const r = x.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height) })))
  await shot(p, 'flow-search-results-390')
  // add an existing one
  await p.click('#results li button[data-add="NASDAQ:AAPL"]').catch(async () => { await p.click('#results li button') }); await p.waitForTimeout(500)
  console.log('add existing → notice:', await note(p), '| filter value:', await p.inputValue('#filter'), '| rows:', await p.$$eval('#rows tr.row', (r) => r.length)); await shot(p, 'flow-add-existing-390')
  await p.fill('#filter', ''); await p.waitForTimeout(300)
  // add a new one
  const t = NEW.split(':')[1]
  await p.fill('#q', t); await p.press('#q', 'Enter'); await p.waitForTimeout(600)
  const y0 = await p.evaluate(() => scrollY)
  await p.click(`#results li button[data-add="${NEW}"]`); await p.waitForTimeout(1200)
  const r = await p.$eval(`#rows tr.row[data-sym="${NEW}"]`, (r) => ({ top: Math.round(r.getBoundingClientRect().top), idx: [...document.querySelectorAll('#rows tr.row')].indexOf(r), txt: r.innerText.replace(/\s+/g, ' ').slice(0, 80) }))
  console.log('add new', NEW, '→ notice:', await note(p), '| row index', r.idx, 'of', await p.$$eval('#rows tr.row', (x) => x.length), '| row top px from viewport', r.top, '| scrollY before/after', y0, await p.evaluate(() => scrollY), '|', r.txt, '| focus:', await p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName))
  await shot(p, 'flow-add-new-390')
  // no results / error
  await p.fill('#q', 'zzzz'); await p.press('#q', 'Enter'); await p.waitForTimeout(500); console.log('no results:', await p.$eval('#results', (u) => u.innerText))
  await p.fill('#q', 'fail'); await p.press('#q', 'Enter'); await p.waitForTimeout(3500); console.log('search error:', await p.$eval('#results', (u) => u.innerText)); await shot(p, 'flow-search-error-390')
  await p.click('h1')
  // filter
  await p.fill('#filter', 'bank'); await p.waitForTimeout(400); console.log('filter "bank": shown', await p.textContent('#shown')); 
  await p.fill('#filter', 'نفيديا'); await p.waitForTimeout(300); console.log('filter Arabic name: shown', await p.textContent('#shown'), '| body:', await p.$eval('#rows', (r) => r.innerText.slice(0, 60)))
  await p.fill('#filter', 'aap'); await p.waitForTimeout(400); await shot(p, 'flow-filter-390')
  // delete + undo
  await p.$eval('#rows tr.row .x', (b) => b.click()); await p.waitForTimeout(400); console.log('delete → notice:', await note(p), '| notice in viewport:', await p.$eval('#notice', (n) => { const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })); await shot(p, 'flow-delete-undo-390')
  await p.fill('#filter', ''); await p.waitForTimeout(300)
  // delete far down the list: is the undo visible?
  await p.$eval('#rows tr.row[data-sym="NASDAQ:MU"]', (r) => r.scrollIntoView({ block: 'center' })); await p.waitForTimeout(200)
  await p.$eval('#rows tr.row[data-sym="NASDAQ:MU"] .x', (b) => b.click()); await p.waitForTimeout(500)
  console.log('delete MU mid-list → undo notice visible in viewport:', await p.$eval('#notice', (n) => { const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight }), '| scrollY', await p.evaluate(() => scrollY), '| notice top', await p.$eval('#notice', (n) => Math.round(n.getBoundingClientRect().top)))
  await shot(p, 'flow-delete-midlist-390')
  // star mid-list (un-star a favourite): undo visible?
  await p.$eval('#rows tr.row[data-sym="NASDAQ:NVDA"]', (r) => r.scrollIntoView({ block: 'center' })); await p.waitForTimeout(200)
  const wasFav = await p.$eval('#rows tr.row[data-sym="NASDAQ:NVDA"] .star', (b) => b.getAttribute('aria-pressed'))
  await p.$eval('#rows tr.row[data-sym="NASDAQ:NVDA"] .star', (b) => b.click()); await p.waitForTimeout(500)
  console.log('toggle star NVDA (was', wasFav, ') → notice:', await note(p), '| visible:', await p.$eval('#notice', (n) => { const r = n.getBoundingClientRect(); return !n.hidden && r.top >= 0 && r.bottom <= innerHeight }))
  // details-open persistence bug: open AAPL, open "30 checks", press chart toggle (redraw)
  await p.$eval('#rows tr.row[data-sym="NASDAQ:AAPL"]', (r) => { r.scrollIntoView(); r.click() }); await p.waitForTimeout(1200)
  await p.$eval('#rows tr.detail details.axes', (d) => { d.open = true }); await p.waitForTimeout(200)
  const h1 = await p.$eval('#rows tr.detail', (d) => Math.round(d.getBoundingClientRect().height))
  await p.$eval('#rows tr.detail button[data-ev$="|n|32"], #rows tr.detail button[data-ev*="|n|"]', (b) => b.click()); await p.waitForTimeout(300)
  console.log('30-checks details open after pressing a chart toggle:', await p.$eval('#rows tr.detail details.axes', (d) => d.open), '| panel h before/after', h1, await p.$eval('#rows tr.detail', (d) => Math.round(d.getBoundingClientRect().height)))
  await p.$eval('#rows tr.detail details.axes', (d) => { d.open = true })
  await p.click('#refresh'); await p.waitForTimeout(1500)
  console.log('30-checks details open after "تحديث الأسعار":', await p.$eval('#rows tr.detail details.axes', (d) => d.open))
  await p.context().close()
  // keyboard focus visibility (desktop)
  p = await open({ w: 1440, h: 900, touch: false })
  const seen = []
  for (let i = 0; i < 26; i++) { await p.keyboard.press('Tab'); seen.push(await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}${a.className ? '.' + String(a.className).split(' ')[0] : ''}${a.dataset?.sort ? '[sort=' + a.dataset.sort + ']' : ''} outline:${cs.outlineStyle === 'none' ? 'NONE' : cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor}` })) }
  console.log('tab order + focus ring:\n  ' + seen.join('\n  '))
  await shot(p, 'flow-focus-1440')
  console.log('unnamed controls:', await p.evaluate(() => [...document.querySelectorAll('button, a, select, input, summary, [tabindex]')].filter((el) => el.getClientRects().length && !(el.innerText || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title') && !el.labels?.length && !el.placeholder).map((el) => el.outerHTML.slice(0, 80)).slice(0, 8)))
  console.log('row a11y:', await p.$eval('#rows tr.row', (r) => ({ role: r.getAttribute('role'), tabindex: r.tabIndex, expanded: r.getAttribute('aria-expanded'), label: r.getAttribute('aria-label') })), '| th sort aria-sort:', await p.$$eval('thead th', (t) => t.map((x) => x.getAttribute('aria-sort')).filter(Boolean)), '| tabs role/tabpanel:', await p.evaluate(() => ({ tablist: !!document.querySelector('[role=tablist]'), tabpanel: !!document.querySelector('[role=tabpanel]'), controls: document.querySelector('[role=tab]').getAttribute('aria-controls') })), '| lang/dir:', await p.evaluate(() => [document.documentElement.lang, document.documentElement.dir, document.querySelector('.wrap')?.getAttribute('dir'), document.querySelector('.wrap')?.getAttribute('lang')]), '| live regions:', await p.evaluate(() => [...document.querySelectorAll('[aria-live],[role=status],[role=alert]')].map((e) => e.id)))
  await close()
})()
