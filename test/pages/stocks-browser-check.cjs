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
  const page = await browser.newPage({ viewport: process.env.PHONE ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: process.env.PHONE ? 2 : 1, timezoneId: 'Asia/Riyadh' })
  const logs = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message}`))
  await page.addInitScript((fx) => {
    // META's history is pre-saved in the store (as the seeded cache will be); the rest is fetched.
    const recentEnd = Math.floor(Date.now() / 1000) - 30 * 86400 // a quarter that ended a month ago
    const store = {
      'lists/us': { symbols: ['NASDAQ:META', 'NASDAQ:AAPL', 'NYSE:JPM', 'NASDAQ:NOPE'] },
      'lists/sa': { symbols: ['TADAWUL:1120'] },
      'ideas/x1': { sym: 'NYSE:JPM', source: 'VIC', title: 'JPMorgan long thesis', url: 'https://valueinvestorsclub.com/idea/x', date: '2024-10-04', priceThen: 200, side: 'long', summary: 'Test summary' },
      'meta/svr': { us: { mean: 2, n: 300 } }, // a saved list mean: ceiling 6
      'meta/watchlists': { us: [{ name: 'Investments', symbols: ['NASDAQ:META'] }, { name: 'Stocks', symbols: ['NASDAQ:AAPL', 'NYSE:JPM'] }], sa: [] },
      // Prices asked 8 days ago, but closes far above the quote's 52-week high (a split since); the
      // newest saved quarter lacks its FCF (JNJ); JPM was asked once with no bars back (CRCL).
      'cache/NASDAQ:META': { sym: 'NASDAQ:META', fin: fx['NASDAQ:META'].fin, px: { t: fx['NASDAQ:META'].px.bars.t, c: fx['NASDAQ:META'].px.bars.c }, pxTried: true, pxAt: Date.now() - 8 * 864e5, fetchedAt: Date.now() },
      'q/NASDAQ:META': { sym: 'NASDAQ:META', fq: { labels: ['Q1 2026', 'Q2 2026'], series: { fcf: [{ value: 1 }, { value: null }] } }, fqEnd: recentEnd },
      'cache/NYSE:JPM': { sym: 'NYSE:JPM', px: { t: [], c: [] }, pxTried: true },
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
        if (location.search.includes('slowcache')) await new Promise((ok) => setTimeout(ok, 2500))
        const docs = Object.keys(store).filter((k) => k.startsWith(coll + '/')).map(snapOf).filter((d) => !filt || d.data().sym > filt).sort((a, b) => (a.data().sym < b.data().sym ? -1 : 1)).slice(0, lim)
        docs.forEach((d) => { d.data = ((v) => () => v)(d.data()) })
        return { docs, size: docs.length }
      },
    })
    const db = {
      doc: (p) => ({ get: async () => (window.__shortRead === p ? ((window.__shortRead = null), { id: p.split('/').pop(), exists: false, data: () => undefined }) : snapOf(p)), set: async (d) => { store[p] = d }, update: async (d) => { store[p] = { ...(store[p] ?? {}), ...d } }, onSnapshot: (next) => { setTimeout(() => next(snapOf(p)), p.startsWith('lists/') && location.search.includes('slow') ? 3000 : 10); return () => {} } }),
      collection: (c) => query(c),
    }
    const quote = (s) => ({ description: `${s.split(':')[1]} Inc.`, close: { 'TADAWUL:1120': 61.95, 'NASDAQ:META': 718.67, 'NYSE:JPM': 300 }[s] ?? 250, sector: s.includes('1120') || s.includes('JPM') ? 'Finance' : 'Technology Services', type: 'stock',
      price_earnings_ttm: 27, non_gaap_price_to_earnings_per_share_forecast_next_fy: 23, earnings_per_share_forecast_next_fy: 31, earnings_per_share_diluted_ttm: s === 'NASDAQ:AAPL' ? -1.2 : 26.5, // AAPL plays a loss-making stock (SVR shown)
      altman_z_score_ttm: 6.4, price_free_cash_flow_ttm: 45, price_target_1y: 797, price_book_fq: 7, return_on_equity: 30, market_cap_basic: 1.8e12, net_debt_fq: 2.1e10, total_revenue_fq: 1.094e11, fiscal_period_end_fq: 1782777600,
      earnings_per_share_fy: 26.5, total_revenue_fy: 4e11, revenue_forecast_next_fy: 4.4e11, total_revenue_ttm: 4.2e11, fiscal_period_fy: '2025', free_cash_flow_ttm: 9e10, beta: 1.2, dividends_yield: 0.5, price_52_week_high: 300, price_52_week_low: 180, piotroski_f_score_fy: 7, piotroski_f_score_ttm: 8,
      ...(s === 'NASDAQ:META' ? { fiscal_period_end_fq: recentEnd } : {}),
      earnings_release_next_date: { 'NASDAQ:META': Date.UTC(2026, 9, 22, 20), 'NYSE:JPM': Date.UTC(2026, 9, 22, 22, 30), 'NASDAQ:AAPL': Date.UTC(2026, 10, 5, 12) }[s] / 1000,
      ...(s === 'NASDAQ:AAPL' ? { oper_income_ttm: -3e9, net_income_ttm: -4e9, cash_n_short_term_invest_fq: 5e10, fiscal_period_end_fy: 1767139200, beta_5_year: 1.4 } : {}) })
    const mcp = {
      callTool: async (server, tool, input) => {
        window.__calls.push(`${tool} ${input.symbol ?? (input.symbols ?? []).length}`)
        // Fundamentals batch (HIST_COLS): rows built from the fixtures' fiscal years and the mock's 4 quarters, newest first.
        if (tool.endsWith('batch') && input.columns.includes('free_cash_flow_fy_h')) {
          const C = { revenue: 'total_revenue', net_income: 'net_income', eps: 'earnings_per_share_diluted', fcf: 'free_cash_flow', ebitda: 'ebitda', total_debt: 'total_debt', gross_profit: 'gross_profit' }
          const fqv = { revenue: [1, 2, 3, 4].map((v) => v * 1e10), net_income: [2e9, 2e9, 2e9, 2e9], eps: [0.5, 0.5, 0.5, 0.5], fcf: [2e9, 2e9, 2e9, 2e9] }
          const row = (s) => { const f = fx[s].fin; const r = { fiscal_period_fy: f.labels.at(-1), fiscal_period_end_fy: Date.UTC(Number(f.labels.at(-1)), 11, 31) / 1000, fiscal_period_end_fq: 1790726400 }
            for (const [k, c] of Object.entries(C)) { r[c + '_fy_h'] = f.series[k] ? f.series[k].map((x) => x?.value ?? null).reverse() : null; r[c + '_fq_h'] = fqv[k] ? [...fqv[k]].reverse() : null }
            return r }
          if (window.__failBatch ?? location.search.includes('failbatch')) return { payload: { success: false, data: {} } }
          return { payload: { data: Object.fromEntries(input.symbols.filter((s) => fx[s]).map((s) => [s, row(s)])), missing: input.symbols.filter((s) => !fx[s]).map((symbol) => ({ symbol })), success: true } }
        }
        if (tool.endsWith('batch') && input.columns.includes('total_revenue_fq_h')) return { payload: { data: input.symbols[0] === 'NASDAQ:AAPL' ? { 'NASDAQ:AAPL': fx.hist } : {}, missing: [], success: true } }
        if (tool.endsWith('batch') && window.__failQuotes) return { payload: { success: false, data: {} } } // a 429/5xx answer
        if (tool.endsWith('batch')) return { payload: { data: Object.fromEntries(input.symbols.filter((s) => s !== 'NASDAQ:NOPE').map((s) => [s, quote(s)])), missing: input.symbols.includes('NASDAQ:NOPE') ? [{ symbol: 'NASDAQ:NOPE' }] : [], success: true } }
        if (tool.endsWith('financial-history') && input.period === 'fq') return { payload: { labels: ['Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026'], series: { revenue: [1, 2, 3, 4].map((v) => ({ value: v * 1e10 })), net_income: [1, 1, 1, 1].map((v) => ({ value: v * 2e9 })), eps: [1, 1, 1, 1].map((v) => ({ value: v * 0.5 })), fcf: [1, 1, 1, 1].map((v) => ({ value: v * 2e9 })) } } }
        if (tool.endsWith('financial-history')) { if (!fx[input.symbol]) throw { code: 'tool_error', message: 'no data' }; return { payload: fx[input.symbol].fin } }
        if (tool.endsWith('ohlcv')) return { payload: fx[input.symbol]?.px ?? { bars: { t: [], c: [] } } }
        if (tool.endsWith('get-news') && window.__newsFail) { window.__newsFail -= 1; throw { code: 'server_unavailable' } }
        if (tool.endsWith('get-news')) return { payload: { data: { headlines: [{ title: 'Example headline for ' + input.symbol, link: 'https://example.com', published: 1790913837, provider: { name: 'Test' } }] } } }
        if (tool.endsWith('search-symbols') && input.query === 'old') { await new Promise((ok) => setTimeout(ok, 500)); return { payload: { data: { symbols: [{ symbol: 'TADAWUL:2222', description: 'Saudi Aramco', type: 'stock' }] } } } }
        if (tool.endsWith('search-symbols')) return { payload: { data: { symbols: [{ symbol: 'TADAWUL:1212', description: 'Astra Industrial Group', type: 'stock' }] } } }
      },
    }
    window.claude = { use: async (n) => (n === 'db' ? (location.search.includes('nodb') ? null : db) : n === 'mcp' ? mcp : null) }
  }, fixtures)

  const rows = () => page.$$eval('#rows tr.row', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()))
  await page.goto('file://' + file)
  await page.waitForTimeout(2500)
  console.log('STATUS:', await page.textContent('#status'))
  console.log('NOTICE:', await page.$eval('#notice', (n) => (n.hidden ? '(hidden)' : n.textContent)))
  console.log('ROWS:', await rows())
  console.log('PEG:', await page.$$eval('#rows td[data-label="PEG"]', (t) => t.slice(0, 4).map((x) => x.innerText)))
  const pe = await page.$$eval('#rows tr.row', (trs) => Object.fromEntries(trs.map((tr) => [tr.dataset.sym, tr.querySelector('td[data-label="مكرر الربح P/E"]').innerText])))
  console.log('CALLS:', await page.evaluate(() => window.__calls)); console.log('EARLY:', logs)
  // Asked again in the background (2026-10-22): META's prices and quarters, JPM's empty prices.
  const due = await page.evaluate(() => ({ metaPx: window.__calls.includes('mcp-tv-get-ohlcv NASDAQ:META'), metaQ: window.__store['q/NASDAQ:META']?.fq?.labels?.length, jpmPx: window.__calls.includes('mcp-tv-get-ohlcv NYSE:JPM') }))
  const okD = due.metaPx && due.metaQ === 4 && due.jpmPx
  console.log('DUE CHECK:', okD ? 'ok' : 'FAILED', JSON.stringify(due))
  if (!okD) process.exitCode = 1
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
  // POST-HOC (2026-10-22): TradingView's P/E (META), none for a loss to common holders (AAPL: EPS −1.2 beside
  // the quote's P/E of 27); no FCF yield for a bank.
  const fcfJpm = await page.$$eval('#rows .ctx summary', (ss) => ss.find((x) => x.querySelector('span').textContent === 'FCF yield')?.querySelector('b').textContent)
  const okV = pe['NASDAQ:META'] === '27.0' && pe['NASDAQ:AAPL'] === '—' && fcfJpm === '—'
  console.log('VALUE CHECK:', okV ? 'ok' : 'FAILED', JSON.stringify({ pe, fcfJpm }))
  if (!okV) process.exitCode = 1
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
  console.log('RDCF AAPL:', await page.$eval('#rows .rdcf', (t) => t.innerText.replace(/\s+/g, ' ').slice(0, 700)).catch(() => 'NONE'))
  const rd = await page.$('#rows .rdcf')
  if (rd) { await rd.scrollIntoViewIfNeeded(); await rd.screenshot({ path: path.join(os.tmpdir(), 'stocks-rdcf.png') }); console.log('RDCF GRID fits:', await page.$eval('#rows .rdcf .gridwrap', (g) => `${g.scrollWidth}/${g.clientWidth}`)) }
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
  // Tab switches within 20 minutes cost only quotes; saved docs keep every field.
  const n0 = await page.evaluate(() => window.__calls.length)
  await page.click('#tab-sa'); await page.waitForTimeout(600); await page.click('#tab-us'); await page.waitForTimeout(600); await page.click('#tab-fav'); await page.waitForTimeout(600)
  const extra = await page.evaluate((n) => window.__calls.slice(n).filter((c) => !/symbol-data-batch \d+$/.test(c) || /batch (?!4$|1$)/.test(c)), n0)
  console.log('TAB SWITCH per-stock calls (want none but quotes):', JSON.stringify(await page.evaluate((n) => window.__calls.slice(n), n0)))
  console.log('SAVED cache/NASDAQ:AAPL keys:', Object.keys(await page.evaluate(() => window.__store['cache/NASDAQ:AAPL'] ?? {})).join(','))
  console.log('STATUS END:', await page.textContent('#status'))
  console.log('SAVED q/NASDAQ:AAPL fqEnd:', await page.evaluate(() => window.__store['q/NASDAQ:AAPL']?.fqEnd), 'cache fyEnd:', await page.evaluate(() => window.__store['cache/NASDAQ:AAPL']?.fyEnd), 'px:', await page.evaluate(() => window.__store['cache/NASDAQ:AAPL']?.px?.t?.length))
  console.log('ALL CALLS:', JSON.stringify(await page.evaluate(() => window.__calls)))
  // Regression (lists/us went from 703 stocks to 2): a page holding an old copy of a list, or one
  // that has not read it yet, must never save a shorter list over the saved one.
  await page.click('#tab-us')
  await page.waitForTimeout(800)
  await page.selectOption('#group', '').catch(() => {})
  await page.fill('#filter', '')
  await page.waitForTimeout(200)
  await page.evaluate(() => { window.__store['lists/us'] = { symbols: [...window.__store['lists/us'].symbols, 'NYSE:XYZ'] } }) // another tab adds XYZ; no snapshot reaches this page
  await page.click('#rows tr.row[data-sym="NYSE:JPM"] button[data-del]')
  await page.waitForTimeout(300)
  const afterDel = await page.evaluate(() => window.__store['lists/us'].symbols)
  const undo = await page.$('#notice button[data-undo]')
  if (undo) await undo.click()
  await page.waitForTimeout(900)
  const afterUndo = await page.evaluate(() => window.__store['lists/us'].symbols)
  await page.goto('file://' + file + '?slow')
  await page.waitForTimeout(300)
  await page.fill('#q', 'استرا')
  await page.click('#addBtn')
  await page.waitForTimeout(300)
  await page.click('#results button[data-add]')
  await page.waitForTimeout(200)
  const early = { notice: await page.textContent('#notice'), sa: await page.evaluate(() => window.__store['lists/sa'].symbols) }
  await page.waitForTimeout(3500)
  await page.evaluate(() => { window.__shortRead = 'lists/sa' }) // one wrong (empty) read of the saved list
  await page.fill('#q', 'استرا')
  await page.click('#addBtn')
  await page.waitForTimeout(300)
  await page.click('#results button[data-add]')
  await page.waitForTimeout(300)
  const short = { notice: await page.textContent('#notice'), sa: await page.evaluate(() => window.__store['lists/sa'].symbols) }
  const wipe = { afterDel, afterUndo, early, short }
  const ok = afterDel.includes('NYSE:XYZ') && !afterDel.includes('NYSE:JPM') && afterDel.length === 4 && afterUndo.includes('NYSE:JPM') && afterUndo.includes('NYSE:XYZ') && afterUndo.length === 5
    && early.sa.length === 1 && early.sa[0] === 'TADAWUL:1120' && /لحظة/.test(early.notice) && (await page.evaluate(() => window.__store['lists/sa'].symbols.length)) === 1
    && short.sa.length === 1 && short.sa[0] === 'TADAWUL:1120' && /ما وصلتني/.test(short.notice)
  console.log('WIPE CHECK:', ok ? 'ok' : 'FAILED', JSON.stringify(wipe))
  if (!ok) process.exitCode = 1
  // Regressions from the review of 2026-10-21. (1) Taps before the saved histories are read start
  // no fetch, so nothing can replace them (META's saved prices stay). (2) A failed fundamentals
  // batch is reported, and the refresh button retries it at once. (3) Undo of an un-star after the
  // stock was starred again keeps it starred.
  await page.goto('file://' + file + '?slowcache')
  await page.waitForTimeout(400)
  await page.click('#refresh').catch(() => {})
  await page.click('#tab-sa')
  await page.click('#tab-us')
  const early2 = await page.evaluate(() => window.__calls.length)
  await page.waitForTimeout(4500)
  const metaPx = await page.evaluate(() => window.__store['cache/NASDAQ:META']?.px?.t?.length ?? 0)
  await page.goto('file://' + file + '?failbatch')
  await page.waitForTimeout(2500)
  const failNotice = await page.textContent('#notice')
  const before = await page.evaluate(() => window.__store['cache/NASDAQ:AAPL']?.fin ? 'fin' : 'none')
  await page.evaluate(() => { window.__failBatch = false })
  await page.click('#refresh')
  await page.waitForTimeout(2500)
  const after = await page.evaluate(() => (window.__store['cache/NASDAQ:AAPL']?.fin ? 'fin' : 'none') + ' fundsAt ' + !!window.__store['cache/NASDAQ:AAPL']?.fundsAt)
  await page.click('#rows tr.row[data-sym="NASDAQ:META"] button[data-star]') // star
  await page.waitForTimeout(200)
  await page.click('#rows tr.row[data-sym="NASDAQ:META"] button[data-star]') // un-star → undo offer
  await page.waitForTimeout(200)
  await page.click('#rows tr.row[data-sym="NASDAQ:META"] button[data-star]') // star again
  await page.waitForTimeout(200)
  await page.click('#notice button[data-undo]').catch(() => {})
  await page.waitForTimeout(300)
  const favAfter = await page.evaluate(() => window.__store['meta/favorites']?.symbols ?? [])
  const ok2 = early2 === 0 && metaPx === 174 && /ما قدرت أحدّث/.test(failNotice) && before === 'none' && after === 'fin fundsAt true' && favAfter.includes('NASDAQ:META')
  console.log('FETCH CHECK:', ok2 ? 'ok' : 'FAILED', JSON.stringify({ early2, metaPx, failNotice: failNotice.slice(0, 60), before, after, favAfter }))
  if (!ok2) process.exitCode = 1
  // Batch 3 (2026-10-22). REDRAW: a stock opens in place (no table rebuild, focus stays, one panel);
  // an opened tile stays open over a full render (a star) and a height-only resize redraws nothing.
  // FAIL: a failed news answer is asked again on the next open; a late search reply is dropped; a
  // tab whose quotes all fail says so (other tabs' quotes no longer hide it) and the button retries;
  // a symbol TradingView does not know shows '—', not a skeleton.
  await page.goto('file://' + file)
  await page.waitForTimeout(2500)
  await page.evaluate(() => { window.__full = 0; new MutationObserver((ms) => { for (const m of ms) if (m.removedNodes.length > 1) window.__full += 1 }).observe(document.getElementById('rows'), { childList: true }) })
  await page.focus('#rows tr.row[data-sym="NASDAQ:META"]')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  const open1 = await page.evaluate(() => ({ full: window.__full, focus: document.activeElement?.dataset?.sym, panels: document.querySelectorAll('#rows tr.detail').length }))
  await page.click('#rows .ctx details:nth-child(3) summary')
  await page.click('#rows tr.row[data-sym="NYSE:JPM"] button[data-star]')
  await page.waitForTimeout(300)
  const full0 = await page.evaluate(() => window.__full)
  const vp = page.viewportSize()
  await page.setViewportSize({ width: vp.width, height: vp.height + 60 })
  await page.waitForTimeout(400)
  const tile = await page.evaluate((f) => ({ open: document.querySelector('#rows .ctx details:nth-child(3)')?.open, starFull: f, resizeFull: window.__full - f }), full0)
  await page.setViewportSize(vp)
  const okR = open1.full === 0 && open1.focus === 'NASDAQ:META' && open1.panels === 1 && tile.open === true && tile.starFull > 0 && tile.resizeFull === 0
  console.log('REDRAW CHECK:', okR ? 'ok' : 'FAILED', JSON.stringify({ open1, tile }))
  if (!okR) process.exitCode = 1
  await page.evaluate(() => { window.__newsFail = 1 })
  await page.click('#rows tr.row[data-sym="NYSE:JPM"]')
  await page.waitForTimeout(300)
  const news1 = await page.$eval('#rows tr.detail', (t) => /ما رد الحين/.test(t.innerText))
  await page.click('#rows tr.row[data-sym="NYSE:JPM"]')
  await page.click('#rows tr.row[data-sym="NYSE:JPM"]')
  await page.waitForTimeout(300)
  const news2 = await page.$eval('#rows tr.detail', (t) => /Example headline/.test(t.innerText))
  const newsCalls = await page.evaluate(() => window.__calls.filter((c) => c === 'mcp-tv-get-news NYSE:JPM').length)
  await page.fill('#q', 'old')
  await page.click('#addBtn')
  await page.fill('#q', 'استرا')
  await page.click('#addBtn')
  await page.waitForTimeout(800)
  const found = await page.$$eval('#results button[data-add]', (b) => b.map((x) => x.dataset.add).join())
  const nopeSkel = await page.$$eval('#rows tr.row[data-sym="NASDAQ:NOPE"] .skel', (x) => x.length)
  await page.evaluate(() => { window.__failQuotes = true })
  await page.click('#tab-sa')
  await page.waitForTimeout(600)
  const qFail = await page.textContent('#notice')
  await page.evaluate(() => { window.__failQuotes = false })
  await page.click('#refresh')
  await page.waitForTimeout(800)
  const qBack = await page.$eval('#rows tr.row td[data-label="السعر"]', (t) => t.innerText)
  const okF = news1 && news2 && newsCalls === 2 && found === 'TADAWUL:1212' && nopeSkel === 0 && /ما رد الحين/.test(qFail) && /61\.95/.test(qBack)
  console.log('FAIL CHECK:', okF ? 'ok' : 'FAILED', JSON.stringify({ news1, news2, newsCalls, found, nopeSkel, qFail: qFail.slice(0, 60), qBack }))
  if (!okF) process.exitCode = 1
  // Batch 4 (2026-10-22). KEY: Enter on a row's star stars it (no panel opens, focus stays on the star),
  // Escape closes a panel (focus on its row). FILTER: the ticker, not the exchange ('nas' matched every
  // NASDAQ stock). FIT: with a panel open the table, its delete buttons and every fair-value number
  // are inside the box (1280, and 768 as cards); on a phone all five tabs are on screen.
  await page.click('#tab-us')
  await page.waitForTimeout(800)
  const starOf = () => page.$eval('#rows tr.row[data-sym="NASDAQ:META"] button[data-star]', (b) => b.getAttribute('aria-pressed'))
  const star0 = await starOf()
  await page.focus('#rows tr.row[data-sym="NASDAQ:META"] button[data-star]')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  const key = { starred: (await starOf()) !== star0, focus: await page.evaluate(() => document.activeElement?.dataset?.star), panels: await page.$$eval('#rows tr.detail', (t) => t.length) }
  await page.focus('#rows tr.row[data-sym="NASDAQ:META"]')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  const fit = () => page.evaluate(() => {
    const t = document.querySelector('.tbl')
    const r = t.getBoundingClientRect()
    const out = [...document.querySelectorAll('#rows tr.detail .fair-list b, #rows tr.detail .part h3 > .n, #rows button[data-del]')].filter((b) => { const x = b.getBoundingClientRect(); return x.left < r.left - 1 || x.right > r.right + 1 })
    const tabs = [...document.querySelectorAll('.tabs button')].every((b) => { const x = b.getBoundingClientRect(); return x.left >= 0 && x.right <= innerWidth })
    return { w: `${t.scrollWidth}/${t.clientWidth}`, out: out.length, n: document.querySelectorAll('#rows tr.detail .fair-list b').length, tabs }
  })
  const fits = [await fit()]
  if (!process.env.PHONE) { await page.setViewportSize({ width: 768, height: 900 }); await page.waitForTimeout(400); fits.push(await fit()); await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(300) }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  key.closed = await page.evaluate(() => !document.querySelector('#rows tr.detail') && document.activeElement?.dataset?.sym)
  await page.fill('#filter', 'nas')
  const fNas = (await rows()).length
  await page.fill('#filter', 'nasdaq:')
  const fColon = (await rows()).length
  await page.fill('#filter', '')
  const okU = key.starred && key.focus === 'NASDAQ:META' && key.panels === 0 && key.closed === 'NASDAQ:META' && fNas === 0 && fColon === 3
    && fits.every((f) => f.out === 0 && f.n > 0 && f.tabs && f.w.split('/')[0] <= Number(f.w.split('/')[1]))
  console.log('UI CHECK:', okU ? 'ok' : 'FAILED', JSON.stringify({ key, fNas, fColon, fits }))
  if (!okU) process.exitCode = 1
  // (4) A view without the db still fetches (prices of the Big tab).
  await page.goto('file://' + file + '?nodb')
  await page.waitForTimeout(500)
  await page.click('#tab-big')
  await page.waitForTimeout(1500)
  const nodb = { calls: await page.evaluate(() => window.__calls.length), status: await page.textContent('#status') }
  console.log('NODB CHECK:', nodb.calls > 0 && /آخر تحديث/.test(nodb.status) ? 'ok' : 'FAILED', JSON.stringify(nodb))
  if (!(nodb.calls > 0)) process.exitCode = 1
  // (5) The earnings chip counts calendar days where the viewer is (Riyadh, 09:00): META reports at 20:00
  // UTC (23:00 there, 'tomorrow' by whole 24 hours), JPM at 22:30 UTC (tomorrow there, 2026-10-23),
  // AAPL in 14 days at 12:00 UTC (was 15 by whole days, so no chip).
  await page.clock.setFixedTime(new Date('2026-10-22T06:00:00Z'))
  await page.goto('file://' + file)
  await page.waitForTimeout(2500)
  const chips = await page.$$eval('#rows tr.row', (trs) => Object.fromEntries(trs.map((tr) => [tr.dataset.sym, [...tr.querySelectorAll('.chip')].map((c) => c.textContent + (/2026-10-23/.test(c.title) ? ' 10-23' : '')).join()])))
  const okC = /تقريره اليوم/.test(chips['NASDAQ:META']) && /تقريره بكرة 10-23/.test(chips['NYSE:JPM']) && /تقريره بعد 14 يوم/.test(chips['NASDAQ:AAPL'])
  console.log('CLOCK CHECK:', okC ? 'ok' : 'FAILED', JSON.stringify(chips))
  if (!okC) process.exitCode = 1
  console.log('LOGS:', logs)
  await browser.close()
})()
