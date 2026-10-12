// Manual browser check (not part of npm test): NODE_PATH=$(npm root -g) node test/pages/stocks-browser-check.cjs
// Loads pages/stocks.html in Chromium with a fake window.claude (db + mcp) built from the
// committed study data, and reports console errors and what the table shows.
const { chromium } = require('playwright')
const fs = require('fs')
const root = '/home/user/mdt-signal-dashboard/'
const html = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${fs.readFileSync(root + 'pages/stocks.html', 'utf8')}</body></html>`
const load = (dir, s) => { try { return JSON.parse(fs.readFileSync(`${root}data/${dir}/raw/${s}.json`)) } catch { return null } }
const fixtures = {}
for (const sym of ['NASDAQ:META', 'NASDAQ:AAPL', 'TADAWUL:1120']) {
  const f = sym.replace(':', '_'); const dir = sym.startsWith('TADAWUL') ? 'fv-sa' : 'fv'
  const fin = load(dir, 'fin/' + f); const px = load(dir, 'px/' + f)
  fixtures[sym] = { fin: { ...fin, success: true }, px: { bars: { t: px.bars.t.slice(-72), c: px.bars.c.slice(-72) }, success: true } }
}
;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch())
  const page = await browser.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message}`))
  await page.addInitScript((fx) => {
    const store = { 'lists/us': { symbols: ['NASDAQ:META', 'NASDAQ:AAPL'] }, 'lists/sa': { symbols: ['TADAWUL:1120'] } }
    const db = { doc: (p) => ({ get: async () => ({ exists: !!store[p], data: () => store[p] }), set: async (d) => { store[p] = d }, onSnapshot: (next) => { setTimeout(() => next({ exists: !!store[p], data: () => store[p] }), 10); return () => {} } }) }
    const quote = (s) => ({ description: s, close: s.includes('1120') ? 61.95 : s.includes('META') ? 718.67 : 250, sector: s.includes('1120') ? 'Finance' : 'Technology Services', type: 'stock', price_earnings_ttm: 27, non_gaap_price_to_earnings_per_share_forecast_next_fy: 23, earnings_per_share_forecast_next_fy: 31, earnings_per_share_diluted_ttm: 26.5, altman_z_score_ttm: 6.4, price_free_cash_flow_ttm: 45, price_target_1y: 797 })
    const mcp = { callTool: async (server, tool, input) => {
      window.__calls = (window.__calls || 0) + 1
      if (tool.endsWith('batch')) return { payload: { data: Object.fromEntries(input.symbols.map((s) => [s, quote(s)])), missing: [], success: true } }
      if (tool.endsWith('financial-history')) return { payload: fx[input.symbol].fin }
      if (tool.endsWith('ohlcv')) return { payload: fx[input.symbol].px }
      if (tool.endsWith('search-symbols')) return { payload: { data: { symbols: [{ symbol: 'TADAWUL:8230', description: 'Al Rajhi Takaful', type: 'stock' }] } } }
    } }
    window.claude = { use: async (n) => (n === 'db' ? db : n === 'mcp' ? mcp : null) }
  }, fixtures)
  fs.writeFileSync(require('os').tmpdir() + '/stocks-test.html', html)
  await page.goto('file://' + require('os').tmpdir() + '/stocks-test.html')
  await page.waitForTimeout(2500)
  const rows = await page.$$eval('#rows tr', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()))
  console.log('STATUS:', await page.textContent('#status'))
  console.log('NOTICE:', await page.$eval('#notice', (n) => (n.hidden ? '(hidden)' : n.textContent)))
  console.log('ROWS:', rows); console.log('EARLY LOGS:', logs)
  await page.click('#rows tr.row')
  await page.waitForTimeout(300)
  console.log('DETAIL:', (await page.$eval('#rows tr.detail', (t) => t.innerText).catch(() => 'none')).slice(0, 300).replace(/\s+/g, ' '))
  await page.click('#tab-sa'); await page.waitForTimeout(1500)
  console.log('SA ROWS:', await page.$$eval('#rows tr', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())))
  await page.fill('#q', 'راجحي'); await page.click('#addBtn'); await page.waitForTimeout(500)
  console.log('RESULTS:', await page.$$eval('#results li', (l) => l.map((x) => x.innerText.replace(/\s+/g, ' '))))
  await page.click('#results button[data-add]'); await page.waitForTimeout(1200)
  console.log('AFTER ADD:', await page.$$eval('#rows tr.row', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())))
  await page.click('#rows button[data-del]'); await page.waitForTimeout(300)
  console.log('AFTER DELETE:', await page.$$eval('#rows tr.row', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 20))))
  console.log('LOGS:', logs)
  await browser.close()
})()
