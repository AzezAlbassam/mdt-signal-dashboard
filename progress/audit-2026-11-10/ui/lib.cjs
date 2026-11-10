// Audit harness: serves the built page + stub data on a fake origin, stubs window.claude.
// opts (query string): delay=ms per mcp call, dbdelay=ms, fail=quota|unavailable|tool (quote batches reject), failpart=1 (half of batches fail),
// nomcp=1, nodb=1, noclaude=1, emptyfav=1, newsfail=1, nohist=1
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path')
const D = __dirname
const ORIGIN = 'http://audit.local'
const html = fs.readFileSync(path.join(D, 'build/stocks.html'), 'utf8')
const page0 = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`
const files = { '/__store.json': fs.readFileSync(path.join(D, 'store.json')), '/__quotes.json': fs.readFileSync(path.join(D, 'quotes.json')), '/__hist.json': fs.readFileSync(path.join(D, 'hist.json')) }
function fake(ORIGIN) {
  const P = new URLSearchParams(location.search)
  window.__marks = {}
  { const M = window.__marks; M.full = 0; M.rowOnly = 0; new MutationObserver((ms) => { const rows = document.getElementById('rows'); if (!rows) return; let full = false; let ro = 0; for (const m of ms) { if (m.target !== rows) continue; if (m.addedNodes.length > 20) full = true; else if (m.addedNodes.length) ro += 1 } if (full) { M.full += 1; M.lastFull = performance.now() } M.rowOnly += ro; const n = rows.querySelectorAll('tr.row').length; if (n && !M.firstRows) { M.firstRows = performance.now(); M.firstRowsN = n } if (!M.firstPrice && rows.querySelector('td[data-label="السعر"]')?.textContent.match(/\d/)) M.firstPrice = performance.now(); M.lastMut = performance.now() }).observe(document, { childList: true, subtree: true }) }
  if (P.get('noclaude')) return
  const ready = Promise.all(['store', 'quotes', 'hist'].map((n) => fetch(`${ORIGIN}/__${n}.json`).then((r) => r.json())))
  let store = {}; let quotes = {}; let hist = {}
  const loaded = ready.then(([s, q, h]) => { store = s; quotes = q; hist = h; if (P.get('emptyfav')) store['meta/favorites'] = { symbols: [] }; if (P.get('extra')) store['lists/us'] = { symbols: [P.get('extra'), ...store['lists/us'].symbols] }; if (P.get('nocache')) { delete store['cache/' + P.get('nocache')]; delete store['q/' + P.get('nocache')] } if (P.get('emptylists')) { store['lists/us'] = { symbols: [] }; store['lists/sa'] = { symbols: [] } } })
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms))
  const dbd = Number(P.get('dbdelay') ?? 0); const md = Number(P.get('delay') ?? 0)
  window.__calls = []
  const listeners = {}
  const snapOf = (p) => ({ id: p.split('/').pop(), exists: p in store, data: () => store[p], metadata: { fromCache: false, hasPendingWrites: false } })
  const cmp = (a, op, b) => (op === '>' ? a > b : true)
  const query = (coll, o = {}) => ({
    orderBy: (f) => query(coll, { ...o, order: f }), limit: (n) => query(coll, { ...o, lim: n }), where: (f, op, v) => query(coll, { ...o, where: [f, op, v] }),
    get: async () => {
      await loaded; if (dbd) await wait(dbd)
      let docs = Object.keys(store).filter((k) => k.startsWith(coll + '/')).map(snapOf)
      if (o.where) docs = docs.filter((d) => cmp(d.data()?.[o.where[0]], o.where[1], o.where[2]))
      if (o.order) docs = docs.filter((d) => d.data()?.[o.order] != null).sort((a, b) => (a.data()[o.order] < b.data()[o.order] ? -1 : 1))
      if (o.lim != null) docs = docs.slice(0, o.lim)
      return { docs, size: docs.length, empty: !docs.length }
    },
    onSnapshot: (next, err) => { let live = true; query(coll, o).get().then((s) => live && next(s), (e) => err?.(e)); return () => { live = false } },
  })
  const notify = (p) => (listeners[p] ?? []).forEach((f) => setTimeout(() => f(snapOf(p)), 0))
  const db = {
    doc: (p) => ({
      get: async () => { await loaded; return snapOf(p) },
      set: async (d) => { await loaded; store[p] = d; notify(p) },
      update: async (d) => { await loaded; if (!(p in store)) throw { code: 'invalid_argument', message: 'no such doc' }; store[p] = { ...store[p], ...d }; notify(p) },
      onSnapshot: (next) => { (listeners[p] ??= []).push(next); loaded.then(() => (dbd ? wait(dbd / 2) : 0)).then(() => next(snapOf(p))); return () => {} },
    }),
    collection: (c) => query(c),
  }
  const pick = (row, cols) => Object.fromEntries(cols.map((c) => [c, c in row ? row[c] : null]))
  let nBatch = 0
  const mcp = {
    callTool: async (server, tool, input) => {
      await loaded
      const cols = input.columns ?? []
      const isH = cols.some((c) => c.endsWith('_h'))
      window.__calls.push({ tool, n: input.symbols?.length ?? 1, h: isH, at: performance.now(), sym: input.symbol ?? input.symbols?.[0] })
      if (md) await wait(md)
      if (tool.endsWith('symbol-data-batch')) {
        if (isH) {
          if (P.get('nohist') || window.__failHist) return { payload: { success: false, data: {} } }
          const data = {}; const missing = []
          for (const s of input.symbols) hist[s]?.total_revenue_fq_h ? (data[s] = pick(hist[s], cols)) : missing.push({ symbol: s })
          if (cols.includes('free_cash_flow_fq_h')) return { payload: { count: 0, data: {}, missing: input.symbols.map((symbol) => ({ symbol })), success: true } } // HIST_COLS: keep saved figures
          return { payload: { data, missing, success: true } }
        }
        nBatch += 1
        const f = window.__fail ?? P.get('fail')
        if (f === 'quota') throw { code: 'tool_error', message: 'Daily quota exceeded for this connector' }
        if (f === 'unavailable') return { payload: { success: false, data: {} } }
        if (f === 'tool') throw { code: 'tool_error', message: 'HTTP 429 Too Many Requests' }
        if (f === 'reauth') throw { code: 'needs_reauth' }
        if (P.get('failpart') && nBatch % 2 === 0) return { payload: { success: false, data: {} } }
        const data = {}; const missing = []
        for (const s of input.symbols) quotes[s] ? (data[s] = pick(quotes[s], cols)) : missing.push({ symbol: s, reason: 'not found' })
        return { payload: { count: Object.keys(data).length, data, missing, missing_count: missing.length, success: true } }
      }
      if (tool.endsWith('get-ohlcv')) { const px = store[`cache/${input.symbol}`]?.px; const n = input.count ?? 252; return { payload: { bars: px?.t ? { t: px.t.slice(-n), c: px.c.slice(-n) } : { t: [], c: [] } } } }
      if (tool.endsWith('get-news')) {
        if (P.get('newsfail')) throw { code: 'server_unavailable' }
        const t = input.symbol.split(':')[1]; const now = Math.floor(Date.now() / 1000)
        return { payload: { data: { headlines: [
          { title: `${t} shares rise after analysts lift price targets ahead of quarterly results`, link: 'https://example.com/1', published: now - 3600 * 5, provider: { name: 'Reuters' } },
          { title: `What to watch when ${t} reports: margins, guidance and the capital-spending outlook for next year`, link: 'https://example.com/2', published: now - 86400 * 2, provider: { name: 'Barron\'s' } },
          { title: `${t}: insiders sold $12.4M of stock last month`, link: 'https://example.com/3', published: now - 86400 * 9, provider: { name: 'MT Newswires' } }] } } }
      }
      if (tool.endsWith('search-symbols')) {
        const ql = String(input.query ?? '').toLowerCase()
        if (ql === 'zzzz') return { payload: { data: { symbols: [] } } }
        if (ql === 'fail') throw { code: 'server_unavailable' }
        const hits = Object.keys(quotes).filter((s) => s.toLowerCase().includes(ql) || quotes[s].description.toLowerCase().includes(ql)).slice(0, 8)
        return { payload: { data: { symbols: hits.map((s) => ({ symbol: s, description: quotes[s].description, type: 'stock', exchange: s.split(':')[0] })) } } }
      }
      if (tool.endsWith('get-documents')) return { payload: { items: [] } }
      throw { code: 'tool_error', message: `not served by the audit harness: ${tool}` }
    },
  }
  const useImpl = async (n) => (n === 'db' ? (P.get('nodb') ? null : db) : n === 'mcp' ? (P.get('nomcp') ? null : mcp) : null)
  window.claude = { use: async (n) => { window.__marks.boot ??= performance.now(); return useImpl(n) } }
  document.addEventListener('DOMContentLoaded', () => {
    window.__marks.dcl = performance.now()
    const rows = document.getElementById('rows'); const st = document.getElementById('status')
    new MutationObserver(() => { const n = rows.querySelectorAll('tr.row').length; if (n && !window.__marks.firstRows) { window.__marks.firstRows = performance.now(); window.__marks.firstRowsN = n } window.__marks.lastRowsMut = performance.now(); window.__marks.rowMuts = (window.__marks.rowMuts ?? 0) + 1 }).observe(rows, { childList: true })
    window.__status = []
    new MutationObserver(() => window.__status.push({ t: Math.round(performance.now()), text: st.textContent })).observe(st, { childList: true, characterData: true, subtree: true })
  })
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) (window.__long ??= []).push({ s: Math.round(e.startTime), d: Math.round(e.duration) }) }).observe({ type: 'longtask', buffered: true }) } catch {}
}
let browser = null
async function open({ w = 390, h = 844, theme = 'dark', qs = '', touch = null, settle = 2500, cpu = 0 } = {}) {
  browser ??= await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined })
  const mobile = touch ?? w < 900
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: theme, hasTouch: mobile, isMobile: false, locale: 'ar-SA', timezoneId: 'Asia/Riyadh', ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  page.logs = []; page.blocked = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') page.logs.push(`${m.type()}: ${m.text()}`.slice(0, 300)) })
  page.on('pageerror', (e) => page.logs.push(`PAGEERROR: ${e.message}`))
  page.on('requestfailed', (r) => page.blocked.push(r.url().slice(0, 80)))
  await page.route(`${ORIGIN}/**`, (r) => { const u = new URL(r.request().url()); if (files[u.pathname]) return r.fulfill({ contentType: 'application/json', body: files[u.pathname] }); return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page0 }) })
  await page.addInitScript(fake, ORIGIN)
  if (cpu) { const c = await ctx.newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate', { rate: cpu }) }
  await page.goto(`${ORIGIN}/${qs ? '?' + qs : ''}`)
  if (settle) await page.waitForTimeout(settle)
  return page
}
const shot = async (page, name, full = false) => { const f = path.join(D, 'shots', name + '.png'); await page.screenshot({ path: f, fullPage: full }); return f }
const close = async () => { await browser?.close(); browser = null }
module.exports = { open, shot, close, ORIGIN, D }
