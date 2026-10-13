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
  fixtures[sym] = { fin: { ...fin, success: true }, px: { bars: { t: px.bars.t.slice(-72), c: px.bars.c.slice(-72) }, success: true } }
}

;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch())
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const logs = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message}`))
  await page.addInitScript((fx) => {
    // META's history is pre-saved in the store (as the seeded cache will be); the rest is fetched.
    const store = {
      'lists/us': { symbols: ['NASDAQ:META', 'NASDAQ:AAPL', 'NYSE:JPM', 'NASDAQ:NOPE'] },
      'lists/sa': { symbols: ['TADAWUL:1120'] },
      'meta/watchlists': { us: [{ name: 'Investments', symbols: ['NASDAQ:META'] }, { name: 'Stocks', symbols: ['NASDAQ:AAPL', 'NYSE:JPM'] }], sa: [] },
      'cache/NASDAQ:META': { sym: 'NASDAQ:META', fin: fx['NASDAQ:META'].fin, px: { t: fx['NASDAQ:META'].px.bars.t, c: fx['NASDAQ:META'].px.bars.c }, fetchedAt: Date.now() },
    }
    window.__calls = []
    const snapOf = (p) => ({ id: p.split('/').pop(), exists: !!store[p], data: () => store[p] })
    const query = (coll, filt = null, lim = 1000) => ({
      orderBy: () => query(coll, filt, lim),
      limit: (n) => query(coll, filt, n),
      where: (f, op, v) => query(coll, v, lim),
      get: async () => {
        const docs = Object.keys(store).filter((k) => k.startsWith(coll + '/')).map(snapOf).filter((d) => !filt || d.data().sym > filt).sort((a, b) => (a.data().sym < b.data().sym ? -1 : 1)).slice(0, lim)
        return { docs, size: docs.length }
      },
    })
    const db = {
      doc: (p) => ({ get: async () => snapOf(p), set: async (d) => { store[p] = d }, onSnapshot: (next) => { setTimeout(() => next(snapOf(p)), 10); return () => {} } }),
      collection: (c) => query(c),
    }
    const quote = (s) => ({ description: s, close: { 'TADAWUL:1120': 61.95, 'NASDAQ:META': 718.67, 'NYSE:JPM': 300 }[s] ?? 250, sector: s.includes('1120') || s.includes('JPM') ? 'Finance' : 'Technology Services', type: 'stock',
      price_earnings_ttm: 27, non_gaap_price_to_earnings_per_share_forecast_next_fy: 23, earnings_per_share_forecast_next_fy: 31, earnings_per_share_diluted_ttm: 26.5,
      altman_z_score_ttm: 6.4, price_free_cash_flow_ttm: 45, price_target_1y: 797, price_book_fq: 7, return_on_equity: 30, market_cap_basic: 1.8e12, net_debt_fq: 2.1e10 })
    const mcp = {
      callTool: async (server, tool, input) => {
        window.__calls.push(`${tool} ${input.symbol ?? (input.symbols ?? []).length}`)
        if (tool.endsWith('batch')) return { payload: { data: Object.fromEntries(input.symbols.filter((s) => s !== 'NASDAQ:NOPE').map((s) => [s, quote(s)])), missing: input.symbols.includes('NASDAQ:NOPE') ? [{ symbol: 'NASDAQ:NOPE' }] : [], success: true } }
        if (tool.endsWith('financial-history')) { if (!fx[input.symbol]) throw { code: 'tool_error', message: 'no data' }; return { payload: fx[input.symbol].fin } }
        if (tool.endsWith('ohlcv')) return { payload: fx[input.symbol]?.px ?? { bars: { t: [], c: [] } } }
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
  console.log('CALLS:', await page.evaluate(() => window.__calls))
  await page.selectOption('#group', 'Investments')
  console.log('GROUP Investments:', await rows())
  await page.selectOption('#group', '')
  await page.fill('#filter', 'jpm')
  console.log('FILTER jpm:', await rows())
  await page.click('#rows tr.row')
  await page.waitForTimeout(200)
  console.log('DETAIL JPM:', (await page.$eval('#rows tr.detail', (t) => t.innerText)).replace(/\s+/g, ' ').slice(0, 500))
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
  await page.screenshot({ path: path.join(os.tmpdir(), 'stocks-test.png'), fullPage: false })
  console.log('LOGS:', logs)
  await browser.close()
})()
