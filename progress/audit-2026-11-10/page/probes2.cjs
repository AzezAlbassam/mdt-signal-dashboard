const fs = require('fs')
const { open } = require('./harness.cjs')
const gen = fs.readFileSync(__dirname + '/gen.js', 'utf8')
const T = {}
const warm = `var warm = (s, o = {}) => { S['cache/' + s] = { sym: s, fin: G.fin(), fyEnd: G.fyEnd, missing: false, fundsAt: Date.now() - 5 * 864e5, px: G.px(), pxTried: true, pxAt: Date.now() - 864e5, ...o }; S['q/' + s] = { sym: s, fq: G.fq(), fqEnd: G.fqEnd } }`

// fyNext with a null fiscal_period_fy
T.fynext = async () => {
  const { browser, page, settle } = await open({ seed: { arg: { gen, warm }, fn: ({ gen, warm }) => { eval(gen); const G = window.__gen; const S = window.__store; const M = window.__mcp; eval(warm); const s = 'NASDAQ:AAA'
    S['lists/us'] = { symbols: [s] }; warm(s); M.quotes[s] = G.quote(s, { fiscal_period_fy: null }); M.hist[s] = G.histRow(); M.px[s] = G.px() } } })
  await settle(2500); await page.click('#rows tr.row td.c-stock span'); await page.waitForTimeout(600)
  const t = await page.$eval('#rows tr.detail', (d) => d.innerText.replace(/\s+/g, ' '))
  console.log('fynext |', (t.match(/توقع المحللين لسنة[^.]*\./) ?? [])[0], '|', (t.match(/Fwd P\/E \(\d+\)/) ?? [])[0], '| row title:', await page.$eval('#rows tr.row td[data-label="المكرر المتوقع Fwd P/E"]', (e) => e.title))
  await browser.close()
}

// the 30-checks <details> closes on every panel redraw
T.axes = async () => {
  const { browser, page, settle } = await open({ seed: { arg: { gen, warm }, fn: ({ gen, warm }) => { eval(gen); const G = window.__gen; const S = window.__store; const M = window.__mcp; eval(warm); const s = 'NASDAQ:AAA'
    S['lists/us'] = { symbols: [s] }; warm(s); M.quotes[s] = G.quote(s); M.hist[s] = G.histRow(); M.px[s] = G.px() } } })
  await settle(2500); await page.click('#rows tr.row td.c-stock span'); await page.waitForTimeout(800)
  await page.click('#rows tr.detail details.axes > summary'); const a = await page.$eval('details.axes', (d) => d.open)
  await page.click('#rows tr.detail .qhead button[data-ev$="|m|ni"]'); await page.waitForTimeout(200)
  console.log('axes | open after click:', a, '| after a panel redraw:', await page.$eval('details.axes', (d) => d.open))
  await browser.close()
}

// a batch answered for one market only (partial): the other market's rows
T.partial = async () => {
  const { browser, page, settle } = await open({ seed: { arg: { gen, warm }, fn: ({ gen, warm }) => { eval(gen); const G = window.__gen; const S = window.__store; const M = window.__mcp; eval(warm)
    const fav = ['NASDAQ:AAA', 'TADAWUL:1111', 'TADAWUL:2222']
    S['lists/us'] = { symbols: ['NASDAQ:AAA'] }; S['lists/sa'] = { symbols: ['TADAWUL:1111', 'TADAWUL:2222'] }; S['meta/favorites'] = { symbols: fav }
    for (const s of fav) { warm(s); M.quotes[s] = G.quote(s); M.hist[s] = G.histRow(); M.px[s] = G.px() }
    M.hook = (kind, input) => (kind === 'quotes' && input.symbols.some((s) => s.startsWith('TADAWUL')) ? { success: true, partial: true, warnings: ['saudi_arabia: 429'], data: Object.fromEntries(input.symbols.filter((s) => !s.startsWith('TADAWUL')).map((s) => [s, M.quotes[s]])), missing: [] } : undefined)
  } } })
  await settle(2000); await page.click('#tab-fav'); await settle(2500); await page.waitForTimeout(1500)
  console.log('partial | notice:', JSON.stringify(await page.$eval('#notice', (n) => (n.hidden ? '' : n.textContent))), '| status:', await page.textContent('#status'), '| rows:', JSON.stringify(await page.$$eval('#rows tr.row', (t) => t.map((tr) => `${tr.dataset.sym}: price=${tr.children[1].innerHTML.includes('skel') ? 'SKELETON' : tr.children[1].innerText} score=${tr.children[4].innerHTML.includes('skel') ? 'SKELETON' : tr.children[4].innerText.trim()}`))))
  await browser.close()
}

// daily quota already used when the page is opened (warm db)
T.quota = async () => {
  const { browser, page, settle } = await open({ seed: { arg: { gen, warm }, fn: ({ gen, warm }) => { eval(gen); const G = window.__gen; const S = window.__store; const M = window.__mcp; eval(warm)
    const us = ['NASDAQ:AAA', 'NASDAQ:BBB']; S['lists/us'] = { symbols: us }; for (const s of us) { warm(s); M.quotes[s] = G.quote(s) }
    M.hook = () => (location.search.includes('soft') ? { success: false, error: 'HTTP 429 daily limit' } : { __throw: { code: 'tool_error', message: 'Daily quota exceeded' } })
  } }, query: process.env.SOFT ? '?soft' : '' })
  await settle(2500); await page.waitForTimeout(1000)
  console.log('quota' + (process.env.SOFT ? ' (success:false)' : '') + ' | notice:', JSON.stringify(await page.$eval('#notice', (n) => (n.hidden ? '' : n.textContent))), '| rows:', JSON.stringify(await page.$$eval('#rows tr.row', (t) => t.map((tr) => `${tr.dataset.sym}: price=${tr.children[1].innerHTML.includes('skel') ? 'SKELETON' : tr.children[1].innerText} fair=${tr.children[2].innerHTML.includes('skel') ? 'SKELETON' : tr.children[2].innerText} score=${tr.children[4].innerHTML.includes('skel') ? 'SKELETON' : tr.children[4].innerText.trim()}`))))
  await browser.close()
}

// an empty first answer marks the stock "no annual data"; can the user get it retried?
T.missing = async () => {
  const { browser, page, settle, count } = await open({ seed: { arg: { gen }, fn: ({ gen }) => { eval(gen); const G = window.__gen; const S = window.__store; const M = window.__mcp; const s = 'NASDAQ:AAA'
    S['lists/us'] = { symbols: [s] }; M.quotes[s] = G.quote(s); M.px[s] = G.px()
    M.hist[s] = Object.fromEntries(Object.entries(G.histRow()).map(([k, v]) => [k, Array.isArray(v) ? v.map(() => null) : v])) // one empty answer
  } } })
  await settle(2500)
  const row = () => page.$eval('#rows tr.row', (tr) => tr.children[4].innerText.trim())
  const r1 = await row()
  await page.evaluate(() => { const G = window.__gen; window.__mcp.hist['NASDAQ:AAA'] = G.histRow() }) // TradingView answers properly from now on
  await page.click('#refresh'); await settle(2500); await page.waitForTimeout(500)
  console.log('missing | first:', r1, '| after pressing refresh:', await row(), '| saved doc:', await page.evaluate(() => JSON.stringify(window.__store['cache/NASDAQ:AAA'], (k, v) => (k === 'px' ? '[px]' : v))), '| fundsDue:', await page.evaluate(() => [window.__t.fyDue('NASDAQ:AAA'), window.__t.fqDue('NASDAQ:AAA')]), JSON.stringify(await count()))
  await browser.close()
}

;(async () => { for (const k of process.argv.slice(2)) { try { await T[k]() } catch (e) { console.log(k, 'PROBE ERROR', e.message.slice(0, 400)) } } })()
