// Regression (2026-10-21): MU's fair value with its real saved docs and the TradingView row of that
// day. The audit's Lynch gate had dropped the method for MU (a loss in FY2023, revenue +105% a year),
// taking the fair value from 1539 to 1246; with the gate on the growth the method uses it is 1428.56.
// 2026-10-23 (study 16 D2 C, adopted): P/S 539.96 is under ⅓ of the weighted median 1628.16, so it is
// left out of the mean: (1377.68 × .2 + 1855.28 × .3 + 1628.16 × .3) ÷ .8 = 1650.71.
//   node test/pages/mu-fair-check.cjs
const path = require('path')
const fs = require('fs')
const { chromium } = require('playwright')
const dir = __dirname
const os = require('os')
const file = path.join(dir, '../../pages/stocks.html')
const label = 'mu'
const { cache, q, row } = JSON.parse(fs.readFileSync(path.join(dir, 'mu-fixture.json'), 'utf8'))
const html = `<!doctype html><html><head><meta charset=utf8></head><body>${fs.readFileSync(file, 'utf8')}</body></html>`
const tmp = path.join(os.tmpdir(), `stocks-${label}.html`)
fs.writeFileSync(tmp, html)

;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch())
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const logs = []
  page.on('pageerror', (e) => logs.push(e.message))
  await page.addInitScript(({ cache, q, row }) => {
    const store = { 'lists/us': { symbols: ['NASDAQ:MU'] }, 'lists/sa': { symbols: [] }, 'meta/favorites': { symbols: ['NASDAQ:MU'] }, 'cache/NASDAQ:MU': cache, 'q/NASDAQ:MU': q }
    window.__calls = []
    window.__store = store
    const snapOf = (p) => ({ id: p.split('/').pop(), exists: !!store[p], data: () => store[p], metadata: {} })
    const query = (coll, filt = null, lim = 1000) => ({
      onSnapshot: (next) => { setTimeout(async () => next(await query(coll, filt, lim).get()), 10); return () => {} },
      orderBy: () => query(coll, filt, lim), limit: (n) => query(coll, filt, n), where: (f, op, v) => query(coll, v, lim),
      get: async () => {
        const docs = Object.keys(store).filter((k) => k.startsWith(coll + '/')).map(snapOf).filter((d) => !filt || d.data().sym > filt).slice(0, lim)
        docs.forEach((d) => { d.data = ((v) => () => v)(d.data()) })
        return { docs, size: docs.length }
      },
    })
    const db = {
      doc: (p) => ({ get: async () => snapOf(p), set: async (d) => { store[p] = d }, update: async (d) => { store[p] = { ...(store[p] ?? {}), ...d } }, onSnapshot: (next) => { setTimeout(() => next(snapOf(p)), 10); return () => {} } }),
      collection: (c) => query(c),
    }
    const pick = (cols) => Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c]]))
    const mcp = {
      callTool: async (server, tool, input) => {
        window.__calls.push(`${tool} ${(input.columns ?? []).length}`)
        if (tool.endsWith('batch')) return { payload: { data: { 'NASDAQ:MU': pick(input.columns) }, missing: [], success: true } }
        if (tool.endsWith('ohlcv')) return { payload: { bars: { t: cache.px.t, c: cache.px.c } } }
        if (tool.endsWith('financial-history')) return { payload: input.period === 'fq' ? q.fq : cache.fin }
        if (tool.endsWith('get-news')) return { payload: { data: { headlines: [] } } }
        return { payload: {} }
      },
    }
    window.claude = { use: async (n) => (n === 'db' ? db : n === 'mcp' ? mcp : null) }
  }, { cache, q, row })
  await page.goto('file://' + tmp)
  await page.waitForTimeout(2500)
  const cell = await page.$eval('#rows tr.row td:nth-child(3)', (t) => t.innerText).catch(() => '?')
  await page.click('#rows tr.row')
  await page.waitForTimeout(800)
  const box = await page.$eval('#rows tr.detail .part', (t) => t.innerText.replace(/\s+/g, ' ')).catch((e) => 'ERR ' + e.message)
  const ok = /1650\.71/.test(cell) && /1855\.28/.test(box) && /P\/S[^:]*: تقييمها أكثر من 3 أضعاف/.test(box) && !logs.length
  console.log('MU CHECK:', ok ? 'ok' : 'FAILED', cell, logs)
  if (!ok) process.exitCode = 1
  await browser.close()
})()
