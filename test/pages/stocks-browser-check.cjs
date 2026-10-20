// Manual browser check (not part of npm test): NODE_PATH=$(npm root -g) node test/pages/stocks-browser-check.cjs
// Loads pages/stocks.html in Chromium with a fake window.claude (db + mcp) built from the
// committed study data, and prints what the page shows plus any console errors.
const { chromium } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')
const root = path.join(__dirname, '../../')
const html = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${fs.readFileSync(root + 'pages/stocks.html', 'utf8')}</body></html>`
const file = path.join(os.tmpdir(), 'stocks-test.html')
fs.writeFileSync(file, html)

const load = (dir, s) => JSON.parse(fs.readFileSync(`${root}data/${dir}/raw/${s}.json`))
const fixtures = {}
for (const sym of ['NASDAQ:META', 'NASDAQ:AAPL', 'TADAWUL:1120', 'NYSE:JPM']) {
  const f = sym.replace(':', '_')
  const dir = sym.startsWith('TADAWUL') ? 'fv-sa' : 'fv'
  const fin = load(dir, 'fin/' + f)
  const px = load(dir, 'px/' + f)
  fixtures[sym] = { fin: { ...fin, success: true }, px: { bars: { t: px.bars.t.slice(-240), c: px.bars.c.slice(-240) }, success: true } }
}
// AAPL plays a company not yet profitable (SVR shown): losses in its last three fiscal years.
for (const k of ['net_income', 'eps']) fixtures['NASDAQ:AAPL'].fin.series[k] = fixtures['NASDAQ:AAPL'].fin.series[k].map((x, i, a) => (i >= a.length - 3 ? { value: -Math.abs(x.value) } : x))
// TradingView's AAPL revenue, net income and EPS histories (get-symbol-data-batch, 2026-10-19).
fixtures.hist = JSON.parse(fs.readFileSync(path.join(__dirname, 'aapl-h.json'), 'utf8'))

;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch())
  const page = await browser.newPage({ viewport: process.env.PHONE ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: process.env.PHONE ? 2 : 1 })
  const logs = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message}`))
  await page.addInitScript((fx) => {
    // META's history is pre-saved in the store (as the seeded cache will be); the rest is fetched.
    const store = {
      'lists/us': { symbols: ['NASDAQ:META', 'NASDAQ:AAPL', 'NYSE:JPM', 'NASDAQ:NOPE'] },
      'lists/sa': { symbols: ['TADAWUL:1120'] },
      'ideas/x1': { sym: 'NYSE:JPM', source: 'VIC', title: 'JPMorgan long thesis', url: 'https://valueinvestorsclub.com/idea/x', date: '2024-10-04', priceThen: 200, side: 'long', summary: 'Test summary' },
      'meta/svr': { us: { mean: 2, n: 300 } }, // a saved list mean: ceiling 6
      'meta/watchlists': { us: [{ name: 'Investments', symbols: ['NASDAQ:META'] }, { name: 'Stocks', symbols: ['NASDAQ:AAPL', 'NYSE:JPM'] }], sa: [] },
      'cache/NASDAQ:META': { sym: 'NASDAQ:META', fin: fx['NASDAQ:META'].fin, px: { t: fx['NASDAQ:META'].px.bars.t, c: fx['NASDAQ:META'].px.bars.c }, fetchedAt: Date.now() },
    }
    window.__calls = []
    window.__store = store
    const snapOf = (p) => ({ id: p.split('/').pop(), exists: !!store[p], data: () => store[p] })
    const query = (coll, filt = null, lim = 1000) => ({
      onSnapshot: (next) => { setTimeout(async () => next(await query(coll, filt, lim).get()), 10); return () => {} },
      orderBy: () => query(coll, filt, lim),
      limit: (n) => query(coll, filt, n),
      where: (f, op, v) => query(coll, v, lim),
      get: async () => {
        const docs = Object.keys(store).filter((k) => k.startsWith(coll + '/')).map(snapOf).filter((d) => !filt || d.data().sym > filt).sort((a, b) => (a.data().sym < b.data().sym ? -1 : 1)).slice(0, lim)
        docs.forEach((d) => { d.data = ((v) => () => v)(d.data()) })
        return { docs, size: docs.length }
      },
    })
    const db = {
      doc: (p) => ({ get: async () => snapOf(p), set: async (d) => { store[p] = d }, onSnapshot: (next) => { setTimeout(() => next(snapOf(p)), 10); return () => {} } }),
      collection: (c) => query(c),
    }
    const quote = (s) => ({ description: s, close: { 'TADAWUL:1120': 61.95, 'NASDAQ:META': 718.67, 'NYSE:JPM': 300 }[s] ?? 250, sector: s.includes('1120') || s.includes('JPM') ? 'Finance' : 'Technology Services', type: 'stock',
      price_earnings_ttm: 27, non_gaap_price_to_earnings_per_share_forecast_next_fy: 23, earnings_per_share_forecast_next_fy: 31, earnings_per_share_diluted_ttm: s === 'NASDAQ:AAPL' ? -1.2 : 26.5, // AAPL plays a loss-making stock (SVR shown)
      altman_z_score_ttm: 6.4, price_free_cash_flow_ttm: 45, price_target_1y: 797, price_book_fq: 7, return_on_equity: 30, market_cap_basic: 1.8e12, net_debt_fq: 2.1e10, total_revenue_fq: 1.094e11, fiscal_period_end_fq: 1782777600,
      earnings_per_share_fy: 26.5, total_revenue_fy: 4e11, revenue_forecast_next_fy: 4.4e11, total_revenue_ttm: 4.2e11, fiscal_period_fy: '2025', free_cash_flow_ttm: 9e10, beta: 1.2, dividends_yield: 0.5, price_52_week_high: 300, price_52_week_low: 180, piotroski_f_score_fy: 7, piotroski_f_score_ttm: 8 })
    const mcp = {
      callTool: async (server, tool, input) => {
        window.__calls.push(`${tool} ${input.symbol ?? (input.symbols ?? []).length}`)
        if (tool.endsWith('batch') && input.columns.includes('total_revenue_fq_h')) return { payload: { data: input.symbols[0] === 'NASDAQ:AAPL' ? { 'NASDAQ:AAPL': fx.hist } : {}, missing: [], success: true } }
        if (tool.endsWith('batch')) return { payload: { data: Object.fromEntries(input.symbols.filter((s) => s !== 'NASDAQ:NOPE').map((s) => [s, quote(s)])), missing: input.symbols.includes('NASDAQ:NOPE') ? [{ symbol: 'NASDAQ:NOPE' }] : [], success: true } }
        if (tool.endsWith('financial-history') && input.period === 'fq') return { payload: { labels: ['Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026'], series: { revenue: [1, 2, 3, 4].map((v) => ({ value: v * 1e10 })), net_income: [1, 1, 1, 1].map((v) => ({ value: v * 2e9 })), eps: [1, 1, 1, 1].map((v) => ({ value: v * 0.5 })), fcf: [1, 1, 1, 1].map((v) => ({ value: v * 2e9 })) } } }
        if (tool.endsWith('financial-history')) { if (!fx[input.symbol]) throw { code: 'tool_error', message: 'no data' }; return { payload: fx[input.symbol].fin } }
        if (tool.endsWith('ohlcv')) return { payload: fx[input.symbol]?.px ?? { bars: { t: [], c: [] } } }
        if (tool.endsWith('get-news')) return { payload: { data: { headlines: [{ title: 'Example headline for ' + input.symbol, link: 'https://example.com', published: 1790913837, provider: { name: 'Test' } }] } } }
        if (tool.endsWith('search-symbols')) return { payload: { data: { symbols: [{ symbol: 'TADAWUL:1212', description: 'Astra Industrial Group', type: 'stock' }] } } }
      },
    }
    window.claude = { use: async (n) => (n === 'db' ? db : n === 'mcp' ? mcp : null) }
  }, fixtures)

  const rows = () => page.$$eval('#rows tr.row', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()))
  await page.goto('file://' + file)
  await page.waitForTimeout(2500)
  console.log('STATUS:', await page.textContent('#status'))
  console.log('NOTICE:', await page.$eval('#notice', (n) => (n.hidden ? '(hidden)' : n.textContent)))
  console.log('ROWS:', await rows())
  console.log('PEG:', await page.$$eval('#rows td[data-label="PEG"]', (t) => t.slice(0, 4).map((x) => x.innerText)))
  console.log('CALLS:', await page.evaluate(() => window.__calls)); console.log('EARLY:', logs)
  await page.selectOption('#group', 'Investments')
  console.log('GROUP Investments:', await rows())
  await page.selectOption('#group', '')
  await page.fill('#filter', 'jpm')
  console.log('FILTER jpm:', await rows())
  await page.click('#rows tr.row')
  await page.waitForTimeout(200)
  await page.waitForTimeout(300)
  console.log('DETAIL JPM:', (await page.$eval('#rows tr.detail', (t) => t.innerText)).replace(/\s+/g, ' ').slice(0, 1600))
  console.log('SVR JPM (profitable, none expected):', await page.$$eval('#rows .part.svr', (t) => t.length), 'cell', await page.$eval('#rows td[data-label="SVR"]', (t) => t.innerText))
  console.log('FORECAST JPM (bank, none expected):', await page.$$eval('#rows details.proj', (t) => t.length))
  await page.screenshot({ path: path.join(os.tmpdir(), 'stocks-forecast.png'), fullPage: true })
  await page.fill('#filter', 'aapl')
  await page.click('#rows tr.row')
  await page.waitForTimeout(500)
  console.log('SVR AAPL:', (await page.$eval('#rows .part.svr', (t) => t.innerText)).replace(/\s+/g, ' ').slice(0, 900))
  const svrBox = await page.$('#rows .part.svr svg.sc')
  await svrBox.scrollIntoViewIfNeeded()
  const sb = await svrBox.boundingBox()
  await page.mouse.move(sb.x + sb.width * 0.5, sb.y + sb.height / 2)
  console.log('SVR TIP mid:', await page.$eval('#rows .part.svr .ctip', (t) => (t.hidden ? 'HIDDEN' : t.textContent)))
  await page.mouse.move(sb.x + sb.width - 70, sb.y + sb.height / 2)
  console.log('SVR TIP end:', await page.$eval('#rows .part.svr .ctip', (t) => (t.hidden ? 'HIDDEN' : t.textContent)))
  console.log('SVR CELL:', await page.$eval('#rows td[data-label="SVR"]', (t) => t.innerText), 'h saved:', await page.evaluate(() => window.__calls.filter((c) => c.startsWith('mcp-tv-get-symbol-data-batch 1')).length))
  await (await page.$('#rows .part.svr')).screenshot({ path: path.join(os.tmpdir(), 'stocks-svr.png') })
  await page.click('#rows details.proj summary')
  await page.waitForTimeout(200)
  console.log('FORECAST AAPL:', (await page.$eval('#rows details.proj', (t) => t.innerText)).replace(/\s+/g, ' ').slice(0, 600))
  console.log('T3 AAPL:', (await page.$eval('#rows .part.iss', (t) => t.innerText)).replace(/\s+/g, ' ').slice(0, 300))
  console.log('CTX AAPL:', (await page.$eval('#rows .ctx', (t) => t.innerText)).replace(/\s+/g, ' ').slice(0, 900))
  await page.click('#rows .ctx details:nth-child(2) summary')
  console.log('CTX TAP:', await page.$eval('#rows .ctx details:nth-child(2)', (d) => d.open + ' ' + d.querySelector('p').innerText.slice(0, 60)))
  await (await page.$('#rows .ctx')).screenshot({ path: path.join(os.tmpdir(), 'stocks-ctx.png') })
  await page.fill('#filter', '')
  await page.click('#rows tr.row[data-sym="NASDAQ:AAPL"] button[data-star]')
  await page.click('#rows tr.row[data-sym="NASDAQ:META"] button[data-star]')
  await page.waitForTimeout(200)
  console.log('FAV saved:', await page.evaluate(() => window.__store['meta/favorites']), 'tab:', await page.textContent('#tab-fav'), 'star:', await page.$eval('#rows tr.row[data-sym="NASDAQ:AAPL"] button[data-star]', (b) => b.textContent + b.getAttribute('aria-pressed')))
  await page.click('#tab-fav')
  await page.waitForTimeout(800)
  console.log('FAV ROWS:', await rows())
  await page.check('#underCap')
  console.log('UNDER CAP (fav):', await rows())
  await page.click('#tab-us')
  await page.waitForTimeout(500)
  console.log('UNDER CAP (us):', await rows(), await page.textContent('#shown'))
  await page.uncheck('#underCap')
  await page.click('#rows tr.row[data-sym="NASDAQ:META"] button[data-star]')
  console.log('FAV after unstar:', await page.evaluate(() => window.__store['meta/favorites']))
  console.log('LATEST IDEAS:', (await page.$eval('#latestIdeas', (t) => t.innerText)).replace(/\s+/g, ' '))
  await page.fill('#filter', '')
  await page.click('#tab-sa')
  await page.waitForTimeout(1200)
  console.log('SA ROWS:', await rows())
  await page.fill('#q', 'استرا')
  await page.click('#addBtn')
  await page.waitForTimeout(400)
  await page.click('#results button[data-add]')
  await page.waitForTimeout(1200)
  console.log('SA AFTER ADD:', await rows())
  await page.click('#tab-big')
  await page.waitForTimeout(1500)
  console.log('BIG:', (await rows()).length, 'rows; groups', await page.$$eval('#rows tr.grp', (t) => t.map((x) => x.innerText.replace(/\s+/g, ' '))))
  await page.screenshot({ path: path.join(os.tmpdir(), 'stocks-big.png'), fullPage: false })
  await page.click('#tab-sectors')
  await page.waitForTimeout(300)
  console.log('SECTORS:', await page.$$eval('#sectorsView .sec', (c) => c.length), 'cards; first:', (await page.$eval('#sectorsView .sec', (c) => c.innerText)).replace(/\s+/g, ' ').slice(0, 300))
  const box = await (await page.$('#sectorsView svg.sc')).boundingBox()
  await page.mouse.move(box.x + box.width * 0.5, box.y + 60)
  console.log('CHART TIP:', await page.$eval('#sectorsView .ctip', (t) => (t.hidden ? 'HIDDEN' : t.textContent)))
  console.log('OVERFLOW:', await page.evaluate(() => document.documentElement.scrollWidth + '/' + document.documentElement.clientWidth))
  await page.screenshot({ path: path.join(os.tmpdir(), 'stocks-sectors.png'), fullPage: false })
  await page.click('#sectorsView button[data-show]')
  await page.waitForTimeout(800)
  console.log('SECTOR FILTER:', await page.$eval('#group', (s) => s.value), await rows())
  await page.screenshot({ path: path.join(os.tmpdir(), 'stocks-test.png'), fullPage: false })
  console.log('LOGS:', logs)
  await browser.close()
})()
